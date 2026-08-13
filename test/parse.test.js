'use strict';

/**
 * Uji parsing sederhana tanpa framework (jalankan: npm run test:parse).
 * Menguji pipeline parseNomination + formatter terhadap contoh nyata.
 */

const assert = require('assert');
const { parseNomination } = require('../src/parser');
const { buildForm, successReply } = require('../src/formatter');
const { buildMail, buildAttachmentFileName, buildSendMailOptions } = require('../src/emailService');
const { buildHourlyProfile } = require('../src/hourlyProfile');
const { buildWorkbook } = require('../src/xlsxService');
const { normalizeSenderNumber, extractSenderId, isAllowedSender } = require('../src/senderFilter');
const { findPhoneNumberForLid } = require('../src/waha');
const { extractMessage, buildDedupeKey } = require('../src/webhookMessage');
const {
  isSameCL,
  findLatestSuccessfulCL,
  createCLChangeTracker,
} = require('../src/clChangeTracker');
const { normalizeSettingsPayload } = require('../src/settingsService');

let passed = 0;
let failed = 0;
const asyncTests = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function testAsync(name, fn) {
  asyncTests.push({ name, fn });
}

// ── Contoh pesan dari grup (sesuai screenshot) ───────────
const sample = `ReNominasi PGN 24 Juni 2026 (3)
MTW : GSA 0 + LNG 36 + stok 5
CL : GSA 0 + swap 32 + stok 0
MK :  GSA 0 + swap 0 + Stok 0
TP :  GSA 0 + Swap 22 + Stok 6
Total : GSA 0 + LNG  36 + Swap 54 + stok MTW 5 + stok CL 0 + stok TP 6 + stok MK 0

Mohon bantuannya Bu, Terima kasih`;

console.log('\n== Uji parsing nominasi ==');

test('tanggal terbaca & diformat 24-Jun-26', () => {
  const r = parseNomination(sample);
  assert.ok(r.date, 'date tidak boleh null');
  assert.strictEqual(r.date.formatted, '24-Jun-26');
  assert.strictEqual(r.date.formattedLong, '24 - June - 2026');
});

test('baris CL ditemukan (bukan MTW/MK/TP/Total)', () => {
  const r = parseNomination(sample);
  assert.strictEqual(r.cl.found, true);
  assert.ok(/^CL/i.test(r.cl.line), 'baris harus diawali CL');
});

test('nilai CL: GSA 0, swap 32, stok 0', () => {
  const r = parseNomination(sample);
  assert.strictEqual(r.cl.gsa, 0);
  assert.strictEqual(r.cl.swap, 32);
  assert.strictEqual(r.cl.stok, 0);
});

test('Total CL = 32', () => {
  const r = parseNomination(sample);
  assert.strictEqual(r.cl.total, 32);
});

test('hasil valid', () => {
  const r = parseNomination(sample);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.errors.length, 0);
});

test('form & balasan sukses terbentuk', () => {
  const r = parseNomination(sample);
  const form = buildForm(r.date, r.cl);
  assert.strictEqual(form.totalNominasi, 32);
  const reply = successReply(form, true);
  assert.ok(reply.includes('24 - June - 2026'));
  assert.ok(reply.includes('Total 32'));
});

// ── Variasi format ───────────────────────────────────────
test('toleran "Swap : 32" dengan titik dua', () => {
  const r = parseNomination('Nominasi PGN 5 Jan 2026\nCL : GSA 1 + Swap : 30 + Stok 4');
  assert.strictEqual(r.cl.swap, 30);
  assert.strictEqual(r.cl.total, 35);
  assert.strictEqual(r.date.formatted, '05-Jan-26');
});

test('CL tidak boleh tertukar dengan baris Total stok CL', () => {
  const txt = `Nominasi PGN 1 Maret 2026
MTW : GSA 0 + swap 5 + stok 1
Total : Swap 5 + stok CL 99`;
  const r = parseNomination(txt);
  // tidak ada baris unit CL sebenarnya -> tidak ditemukan
  assert.strictEqual(r.cl.found, false);
  assert.strictEqual(r.valid, false);
});

// ── Penanda format WhatsApp (*bold*) ─────────────────────
test('angka dengan *bold* terbaca: swap *30* -> 30', () => {
  const r = parseNomination('Nominasi PGN 26 Juni 2026\nCL : GSA 0 + swap *30* + stok *0*');
  assert.strictEqual(r.cl.swap, 30);
  assert.strictEqual(r.cl.total, 30);
  assert.strictEqual(r.valid, true);
});

test('label "Nominasi" terdeteksi (bukan Re-Nominasi)', () => {
  const r = parseNomination('Nominasi PGN 26 Juni 2026\nCL : GSA 0 + swap 30 + stok 0');
  assert.strictEqual(r.kind, 'Nominasi');
  assert.ok(successReply(buildForm(r.date, r.cl), false, r.kind).includes('Data Nominasi berhasil'));
});

test('label "Re-Nominasi" terdeteksi untuk ReNominasi-2', () => {
  const r = parseNomination('ReNominasi-2 PGN 26 Juni 2026\nCL : GSA 0 + swap 37 + stok 0');
  assert.strictEqual(r.kind, 'Re-Nominasi');
  assert.strictEqual(r.cl.total, 37);
});

test('keyword "Revisi Nominasi" memakai flow dan action Nominasi', () => {
  const r = parseNomination('Revisi Nominasi PGN 26 Juni 2026\nCL : GSA 0 + swap 35 + stok 2');
  const form = buildForm(r.date, r.cl);
  const reply = successReply(form, false, r.kind);
  const mail = buildMail(form, r.kind);

  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.isRevisiNominasi, true);
  assert.strictEqual(r.isRenominasi, false);
  assert.strictEqual(r.kind, 'Nominasi');
  assert.strictEqual(r.cl.total, 37);
  assert.ok(reply.includes('Data Nominasi berhasil'));
  assert.strictEqual(mail.subject, 'Nominasi Harian PIP UBP Cilegon 26 - June - 2026');
  assert.ok(mail.text.includes('mengajukan nominasi pasokan gas PGN'));
});

test('template email nominasi memakai subject dan isi resmi', () => {
  const mail = buildMail({ date: '26 - June - 2026' }, 'Nominasi');
  assert.strictEqual(mail.subject, 'Nominasi Harian PIP UBP Cilegon 26 - June - 2026');
  assert.ok(mail.text.includes('PT Pertamina Gas Negara'));
  assert.ok(mail.text.includes('mengajukan nominasi pasokan gas PGN untuk PIP UBP Cilegon periode 26 - June - 2026 (terlampir).'));
  assert.ok(mail.text.includes('Best Regards,'));
});

test('template email renominasi memakai nomor revisi dan isi resmi', () => {
  const mail = buildMail({ date: '26 - June - 2026' }, 'Re-Nominasi', 3);
  assert.strictEqual(mail.subject, 'Rev3 Nominasi Harian PIP UBP Cilegon 26 - June - 2026');
  assert.ok(mail.text.includes('mengajukan revisi-1 nominasi pasokan gas PGN untuk PIP UBP Cilegon periode 26 - June - 2026  (terlampir).'));
});

test('nama lampiran email nominasi dan renominasi mengikuti format client', () => {
  const emailConfig = { from: 'bot@example.com', to: ['to@example.com'], cc: [] };
  const generated = {
    filename: 'Form Nominasi Harian IP PLTGU Cilegon (LNG)_12082026.xlsx',
    buffer: Buffer.from('xlsx-test'),
  };
  const cases = [
    ['Nominasi', null, 'Form Nominasi Harian IP PLTGU Cilegon (LNG)_12082026.xlsx'],
    ['Re-Nominasi', 3, 'Form Nominasi Harian IP PLTGU Cilegon (LNG)_12082026_R3.xlsx'],
  ];
  for (const [kind, revision, expectedFilename] of cases) {
    const mail = buildMail({ date: '26 - June - 2026' }, kind, revision);
    const options = buildSendMailOptions(emailConfig, mail, generated);
    assert.strictEqual(options.attachments.length, 1, `${kind} harus memiliki satu attachment`);
    assert.strictEqual(options.attachments[0].filename, expectedFilename);
    assert.strictEqual(options.attachments[0].content, generated.buffer);
    assert.strictEqual(options.attachments[0].contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }
  assert.strictEqual(buildAttachmentFileName('Judul: Uji / File?.xlsx'), 'Judul- Uji - File-.xlsx');
});

test('form menggunakan tanggal panjang untuk output pengguna', () => {
  const r = parseNomination('Nominasi PGN 27 Juli 2026\nCL : GSA 0 + swap 32 + stok 0');
  assert.strictEqual(buildForm(r.date, r.cl).date, '27 - July - 2026');
});

test('nomor pengirim dinormalisasi dari format telepon dan ID WhatsApp', () => {
  assert.strictEqual(normalizeSenderNumber('+62 856-0616-9066'), '6285606169066');
  assert.strictEqual(normalizeSenderNumber('0856-0616-9066'), '6285606169066');
  assert.strictEqual(normalizeSenderNumber('6281383739793@c.us'), '6281383739793');
});

test('pengirim grup diekstrak dari variasi payload WAHA', () => {
  assert.strictEqual(extractSenderId({ participant: '6285606169066@c.us' }), '6285606169066@c.us');
  assert.strictEqual(
    extractSenderId({ participant: '170609304678559@lid', participantPn: '6285606169066@c.us' }),
    '6285606169066@c.us'
  );
  assert.strictEqual(extractSenderId({ _data: { author: '6281383739793@c.us' } }), '6281383739793@c.us');
  assert.strictEqual(extractSenderId({ from: '120363429091845287@g.us' }), '');
});

test('payload message.edited memakai isi terbaru dan menyimpan ID pesan asli', () => {
  const msg = extractMessage({
    event: 'message.edited',
    session: 'cctv',
    payload: {
      id: 'EDIT-EVENT-ID',
      editedMessageId: 'ORIGINAL-MESSAGE-ID',
      from: '120363000000000000@g.us',
      participant: '6285606169066@c.us',
      body: 'Nominasi PGN 28 Juli 2026\nCL : GSA 0 + swap 35 + stok 0',
      timestamp: 1785230000,
      fromMe: false,
    },
  });

  assert.strictEqual(msg.event, 'message.edited');
  assert.strictEqual(msg.originalMessageId, 'ORIGINAL-MESSAGE-ID');
  assert.strictEqual(msg.body.includes('swap 35'), true);
  assert.strictEqual(msg.chatId, '120363000000000000@g.us');
  assert.strictEqual(msg.senderNumber, '6285606169066');
});

test('dedupe edit: isi sama dianggap retry, isi edit baru diproses lagi', () => {
  const base = {
    event: 'message.edited',
    id: 'EDIT-EVENT-ID',
    originalMessageId: 'ORIGINAL-MESSAGE-ID',
  };
  const first = buildDedupeKey({ ...base, body: 'swap 35' });
  const retry = buildDedupeKey({ ...base, id: 'OTHER-WEBHOOK-ID', body: 'swap 35' });
  const secondEdit = buildDedupeKey({ ...base, body: 'swap 37' });

  assert.strictEqual(first, retry);
  assert.notStrictEqual(first, secondEdit);
  assert.strictEqual(buildDedupeKey({ event: 'message', id: 'ORIGINAL-MESSAGE-ID' }), 'ORIGINAL-MESSAGE-ID');
});

test('CL dianggap sama jika GSA, Swap, dan Stok tidak berubah', () => {
  const first = { date: '12 - August - 2026', gsa: 0, swapping: 42, stokLNG: 0 };
  const same = { date: '12 - August - 2026', gsa: 0, swapping: 42, stokLNG: 0 };
  const changedSwap = { ...same, swapping: 43 };
  const changedGsa = { ...same, gsa: 1 };
  const changedStock = { ...same, stokLNG: 2 };

  assert.strictEqual(isSameCL(first, same), true);
  assert.strictEqual(isSameCL(first, changedSwap), false);
  assert.strictEqual(isSameCL(first, changedGsa), false);
  assert.strictEqual(isSameCL(first, changedStock), false);
});

test('pembanding memakai data CL sukses terakhir pada tanggal yang sama', () => {
  const entries = [
    { status: 'success', form: { date: '11 - August - 2026', gsa: 0, swapping: 30, stokLNG: 0 } },
    { status: 'success', form: { date: '12 - August - 2026', gsa: 0, swapping: 40, stokLNG: 0 } },
    { status: 'ignored', form: { date: '12 - August - 2026', gsa: 0, swapping: 99, stokLNG: 0 } },
    { status: 'success', form: { date: '12 - August - 2026', gsa: 0, swapping: 42, stokLNG: 0 } },
  ];

  assert.deepStrictEqual(findLatestSuccessfulCL(entries, '12 - August - 2026'), {
    date: '12 - August - 2026', gsa: 0, swapping: 42, stokLNG: 0,
  });
});

test('tracker memproses baseline dan perubahan CL, tetapi melewati angka yang sama', () => {
  const tracker = createCLChangeTracker();
  const first = { date: '12 - August - 2026', gsa: 0, swapping: 42, stokLNG: 0 };

  assert.deepStrictEqual(tracker.evaluate(first, []).changed, true, 'pesan pertama harus diproses');
  assert.deepStrictEqual(tracker.evaluate({ ...first }, []).changed, false, 'CL sama harus dilewati');
  assert.deepStrictEqual(
    tracker.evaluate({ ...first, swapping: 43 }, []).changed,
    true,
    'perubahan Swap harus diproses'
  );
});

test('tracker tetap mengenali CL terakhir dari log setelah proses restart', () => {
  const tracker = createCLChangeTracker();
  const previous = { date: '12 - August - 2026', gsa: 0, swapping: 42, stokLNG: 0 };
  const history = [{ status: 'success', form: previous }];

  assert.strictEqual(tracker.evaluate({ ...previous }, history).changed, false);
  assert.strictEqual(tracker.evaluate({ ...previous, stokLNG: 1 }, history).changed, true);
});

test('LID WAHA dipetakan ke nomor telepon untuk pemeriksaan allowlist', () => {
  const lids = [
    { lid: '170609304678559@lid', pn: '6285606169066@c.us' },
    { lid: '83120636350700@lid', pn: '6281383739793@c.us' },
  ];
  assert.strictEqual(findPhoneNumberForLid('170609304678559@lid', lids), '6285606169066@c.us');
  assert.strictEqual(findPhoneNumberForLid('999@lid', lids), '');
  assert.strictEqual(findPhoneNumberForLid('6285606169066@c.us', lids), '');
});

test('allowlist hanya menerima dua nomor pengirim yang dikonfigurasi', () => {
  const allowed = ['+62 856-0616-9066', '+62 813-8373-9793'];
  assert.strictEqual(isAllowedSender('6285606169066@c.us', allowed), true);
  assert.strictEqual(isAllowedSender('081383739793@c.us', allowed), true);
  assert.strictEqual(isAllowedSender('628111111111@c.us', allowed), false);
  assert.strictEqual(isAllowedSender('', allowed), false);
});

test('pengaturan dashboard menormalisasi nomor dan menghapus data duplikat', () => {
  const settings = normalizeSettingsPayload({
    allowedSenderNumbers: ['+62 856-0616-9066', '0856-0616-9066'],
    emailTo: ['User@Example.com', 'user@example.com'],
    emailCc: ['cc@example.com'],
  });
  assert.deepStrictEqual(settings.allowedSenderNumbers, ['6285606169066']);
  assert.deepStrictEqual(settings.emailTo, ['User@Example.com']);
  assert.deepStrictEqual(settings.emailCc, ['cc@example.com']);
});

test('pengaturan dashboard menolak nomor dan email tidak valid', () => {
  assert.throws(() => normalizeSettingsPayload({
    allowedSenderNumbers: ['123'], emailTo: ['valid@example.com'], emailCc: [],
  }), /nomor WhatsApp/i);
  assert.throws(() => normalizeSettingsPayload({
    allowedSenderNumbers: [], emailTo: ['bukan-email'], emailCc: [],
  }), /emailTo/i);
});

test('profil jam: renominasi menghitung sisa jam untuk mencapai target average baru', () => {
  const first = { date: '25-Jun-26', swapping: 30, stokLNG: 0 };
  const revision = { date: '25-Jun-26', swapping: 35, stokLNG: 0 };
  const history = [{ form: first, messageTimestamp: '2026-06-25T04:12:00+07:00' }];
  const hourly = buildHourlyProfile(revision, '2026-06-25T10:00:00+07:00', history);
  const expectedRemaining = 540 / 14;
  assert.deepStrictEqual(hourly.slice(0, 10).map((x) => x.swap), Array(10).fill(30));
  hourly.slice(10).forEach((slot) => assert.ok(Math.abs(slot.swap - expectedRemaining) < 1e-10));
  const average = hourly.reduce((total, slot) => total + slot.swap, 0) / 24;
  assert.ok(Math.abs(average - 35) < 1e-10);
});

test('timestamp WAHA dibaca sebagai jam Asia/Jakarta meski server memakai UTC', () => {
  const first = { date: '25-Jun-26', swapping: 30, stokLNG: 0 };
  const revision = { date: '25-Jun-26', swapping: 40, stokLNG: 0 };
  const history = [{ form: first, messageTimestamp: '2026-06-24T21:12:00.000Z' }];
  const hourly = buildHourlyProfile(revision, '2026-06-25T08:00:00.000Z', history);
  assert.strictEqual(hourly[14].swap, 30);
  assert.ok(Math.abs(hourly[15].swap - (510 / 9)) < 1e-10);
  assert.ok(Math.abs(hourly.reduce((total, slot) => total + slot.swap, 0) / 24 - 40) < 1e-10);
});

test('profil jam: renominasi berulang memakai total profil yang sudah berjalan', () => {
  const first = { date: '25-Jun-26', swapping: 30, stokLNG: 0 };
  const second = { date: '25-Jun-26', swapping: 35, stokLNG: 0 };
  const third = { date: '25-Jun-26', swapping: 32, stokLNG: 0 };
  const history = [
    { form: first, messageTimestamp: '2026-06-25T04:00:00+07:00' },
    { form: second, messageTimestamp: '2026-06-25T10:00:00+07:00' },
  ];
  const hourly = buildHourlyProfile(third, '2026-06-25T16:00:00+07:00', history);
  assert.deepStrictEqual(hourly.slice(0, 10).map((x) => x.swap), Array(10).fill(30));
  hourly.slice(10, 16).forEach((slot) => assert.ok(Math.abs(slot.swap - (540 / 14)) < 1e-10));
  const average = hourly.reduce((total, slot) => total + slot.swap, 0) / 24;
  assert.ok(Math.abs(average - 32) < 1e-10);
});

testAsync('ringkasan atas Excel memakai cache swap, stok, dan total terbaru', async () => {
  const form = {
    date: '17 - July - 2026', unit: 'CL', gsa: 0,
    swapping: 29, stokLNG: 4, totalNominasi: 33,
  };
  const date = { day: 17, month: 6, year: 2026 };
  const workbook = await buildWorkbook(form, date, {
    hourly: Array.from({ length: 24 }, () => ({ swap: 29, stok: 4 })),
  });
  const sheet = workbook.worksheets[0];

  assert.deepStrictEqual(sheet.getCell('E13').value, { formula: 'F44', result: 29 });
  assert.deepStrictEqual(sheet.getCell('G13').value, { formula: 'G44', result: 4 });
  assert.deepStrictEqual(sheet.getCell('I13').value, { formula: 'H44', result: 33 });
  assert.strictEqual(sheet.getCell('G44').value, 4);
  assert.strictEqual(sheet.getCell('G20').value, 4);
});

// ── Kasus gagal ──────────────────────────────────────────
test('tanggal tidak terbaca -> invalid dengan error spesifik', () => {
  const r = parseNomination('Nominasi PGN tanpa tanggal\nCL : GSA 0 + swap 10 + stok 0');
  assert.strictEqual(r.valid, false);
  assert.ok(r.errors.some((e) => e.toLowerCase().includes('tanggal')));
});

test('baris CL hilang -> invalid', () => {
  const r = parseNomination('Nominasi PGN 9 Sep 2026\nMTW : GSA 0 + swap 3 + stok 1');
  assert.strictEqual(r.cl.found, false);
  assert.strictEqual(r.valid, false);
});

// ── Ringkasan ────────────────────────────────────────────
(async () => {
  for (const { name, fn } of asyncTests) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }
  console.log(`\n== Hasil: ${passed} lulus, ${failed} gagal ==\n`);
  process.exit(failed === 0 ? 0 : 1);
})();
