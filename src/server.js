'use strict';

/**
 * Server webhook bot: menerima event WAHA, memproses pesan nominasi,
 * mengirim email, dan membalas via WhatsApp.
 */

const express = require('express');
const fs = require('fs');
const config = require('./config');
const waha = require('./waha');
const { parseNomination } = require('./parser');
const { buildForm, successReply, formText } = require('./formatter');
const { isDuplicate, markProcessed } = require('./dedupe');
const { logSuccess, logError, logIgnored, NOMINASI_LOG } = require('./logger');
const {
  sendNominationEmail,
  isEmailEnabled,
  verifyConnection,
  EMAIL_ATTACHMENT_DIR,
} = require('./emailService');
const { buildAttachment } = require('./xlsxService');

const { getDashboardData, findEmailAttachment, findEmailHistory } = require('./dashboard');
const { normalizeSenderNumber, isAllowedSender } = require('./senderFilter');
const { extractMessage, buildDedupeKey } = require('./webhookMessage');
const { createCLChangeTracker } = require('./clChangeTracker');
const settingsService = require('./settingsService');
const { initDb, pingDb, getPreviousEntries } = require('./db');
const path = require('path');

const app = express();
const clChangeTracker = createCLChangeTracker();

// Inisialisasi pengaturan & PostgreSQL
settingsService.loadSettings();
initDb().then(() => {
  settingsService.loadSettingsFromDb().catch(() => {});
});

app.use(express.json({ limit: '1mb' }));
app.use(
  '/dashboard/assets',
  express.static(path.join(__dirname, '..', 'public', 'dashboard', 'assets'))
);

// Healthcheck
app.get('/health', async (req, res) => {
  const dbHealth = await pingDb();
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    db: dbHealth.ok ? 'connected' : 'disconnected',
    dbDetails: dbHealth,
  });
});

app.get('/', (req, res) => {
  res.json({ name: 'bot-cilegon', phase: 2, status: 'running', email: isEmailEnabled(), dashboard: '/dashboard' });
});

// Diagnosa SMTP (cek koneksi/kredensial tanpa kirim email)
app.get('/email-test', async (req, res) => {
  const result = await verifyConnection();
  res.status(result.ok ? 200 : 500).json(result);
});
// Dashboard
app.get('/dashboard', (req, res) => {
  const builtDashboard = path.join(__dirname, '..', 'public', 'dashboard', 'index.html');
  const legacyDashboard = path.join(__dirname, '..', 'public', 'dashboard.html');
  res.sendFile(builtDashboard, (err) => {
    if (err) res.sendFile(legacyDashboard);
  });
});

app.get('/dashboard/email/:id', (req, res) => {
  const builtDashboard = path.join(__dirname, '..', 'public', 'dashboard', 'index.html');
  res.sendFile(builtDashboard);
});

app.get('/dashboard/history/:type', (req, res) => {
  if (!['replies', 'emails'].includes(req.params.type)) return res.sendStatus(404);
  const builtDashboard = path.join(__dirname, '..', 'public', 'dashboard', 'index.html');
  return res.sendFile(builtDashboard);
});

// /api/dashboard?limit=100&status=success&days=14
app.get('/api/dashboard', async (req, res) => {
  try {
    const data = await getDashboardData({
      limit: req.query.limit,
      status: req.query.status,
      replyStatus: req.query.replyStatus,
      emailStatus: req.query.emailStatus,
      days: req.query.days,
    });
    data.stats.emailEnabled = isEmailEnabled();
    data.meta = {
      uptime: process.uptime(),
      now: new Date().toISOString(),
      version: 2,
    };
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/email-attachments/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[a-f0-9-]{36}$/i.test(id)) {
    return res.status(400).json({ error: 'ID lampiran tidak valid.' });
  }
  const attachment = await findEmailAttachment(id);
  if (!attachment) return res.status(404).json({ error: 'Lampiran tidak ditemukan.' });

  const storedFile = path.join(EMAIL_ATTACHMENT_DIR, `${id}.xlsx`);
  return res.download(storedFile, attachment.filename, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File lampiran tidak tersedia.' });
  });
});

app.get('/api/email-history/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^[a-f0-9]{24}$/i.test(id)) {
    return res.status(400).json({ error: 'ID history email tidak valid.' });
  }
  const email = await findEmailHistory(id);
  if (!email) return res.status(404).json({ error: 'History email tidak ditemukan.' });
  return res.json(email);
});

// Status koneksi WAHA
app.get('/api/waha-status', async (req, res) => {
  try {
    const s = await waha.getSessionStatus();
    if (s && s.error) {
      return res.json({ connected: false, status: 'UNREACHABLE', error: s.error });
    }
    const status = (s && s.status) || 'UNKNOWN';
    res.json({
      connected: status === 'WORKING',
      status,
      session: (s && s.name) || config.waha.session,
      me: (s && s.me) || null,
      engine: (s && s.engine && s.engine.state) || null,
    });
  } catch (err) {
    res.json({ connected: false, status: 'ERROR', error: err.message });
  }
});

// Pengaturan daftar operasional. Tidak pernah mengekspos kredensial SMTP/WAHA.
app.get('/api/settings', (req, res) => {
  res.json(settingsService.getSettings());
});

app.put('/api/settings', (req, res) => {
  try {
    const settings = settingsService.saveSettings(req.body);
    console.log(
      `[SETTINGS] sender=${settings.allowedSenderNumbers.length} ` +
      `to=${settings.emailTo.length} cc=${settings.emailCc.length}`
    );
    res.json({ ok: true, settings });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});
// /xlsx-preview?date=26 Juni 2026&swap=37&stok=0
app.get('/xlsx-preview', async (req, res) => {
  try {
    const { extractDate } = require('./parser/extractDate');
    const dateObj = extractDate(req.query.date || '26 Juni 2026') || {
      day: 1, month: 0, year: 2026, formatted: '01-Jan-26', formattedLong: '1 - January - 2026',
    };
    const swap = parseInt(req.query.swap || '0', 10);
    const stok = parseInt(req.query.stok || '0', 10);
    const form = {
      date: dateObj.formattedLong || dateObj.formatted, unit: 'CL', gsa: 0,
      swapping: swap, stokLNG: stok, totalNominasi: swap + stok,
    };
    const { buffer, filename } = await buildAttachment(form, dateObj, { name: req.query.name || '' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


function containsKeyword(text) {
  const lower = (text || '').toLowerCase();

  // Terima Nominasi, ReNominasi/Re Nominasi, dan Revisi Nominasi selama
  // mengandung PGN. Revisi Nominasi akan diklasifikasikan parser sebagai
  // Nominasi agar seluruh action bot mengikuti flow Nominasi biasa.
  const hasPgn = /\bpgn\b/i.test(lower);
  const hasNomination = /\b(?:(?:re\s*[- ]?\s*)|(?:revisi\s+))?nominasi\b/i.test(lower);
  if (hasPgn && hasNomination) return true;

  // Fallback ke keyword dari .env
  return config.triggerKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// Webhook
app.post('/webhook', async (req, res) => {
  // Selalu balas 200 cepat supaya WAHA tidak retry berulang.
  res.sendStatus(200);

  try {
    const msg = extractMessage(req.body);

    // Proses pesan baru dan versi terbaru dari pesan yang diedit.
    if (msg.event && !['message', 'message.edited'].includes(msg.event)) return;
    // Satu instance bot hanya boleh memproses sesi khusus yang dikonfigurasi.
    // WAHA dapat mengirim webhook dari beberapa sesi pada container yang sama.
    if (msg.session && msg.session !== config.waha.session) {
      console.log(`[SKIP] sesi WAHA bukan sesi bot: ${msg.session}`);
      return;
    }
    if (msg.fromMe) return;
    if (!msg.body) return;

    // Pada engine WAHA terbaru, pengirim grup bisa berupa LID internal.
    // Resolve ke nomor telepon agar allowlist tetap berbasis nomor WhatsApp.
    const resolvedSenderId = await waha.resolveSenderId(msg.senderId, msg.session);
    msg.senderNumber = normalizeSenderNumber(resolvedSenderId);

    console.log(
      `[IN] event=${msg.event || 'message'} session=${msg.session || '-'} ` +
      `chat=${msg.chatId} sender=${msg.senderNumber || '-'} ` +
      `text=${msg.body.slice(0, 80).replace(/\n/g, ' | ')}`
    );

    // Filter grup target (jika diset), pengirim yang diizinkan, dan kata kunci.
    if (config.targetGroupId && msg.chatId !== config.targetGroupId) {
      console.log(`[SKIP] chat bukan target: ${msg.chatId}`);
      return;
    }
    if (!isAllowedSender(resolvedSenderId, config.allowedSenderNumbers)) {
      console.log(`[SKIP] pengirim tidak diizinkan: ${msg.senderNumber || 'tidak terdeteksi'}`);
      logIgnored({
        reason: 'sender-not-allowed',
        messageId: msg.id,
        chatId: msg.chatId,
        senderNumber: msg.senderNumber || null,
      });
      return;
    }
    if (!containsKeyword(msg.body)) {
      console.log('[SKIP] keyword nominasi/pgn tidak cocok');
      return;
    }

    // Anti-duplikat.
    const dedupeKey = buildDedupeKey(msg);
    if (isDuplicate(dedupeKey)) {
      logIgnored({ reason: 'duplicate', messageId: msg.id, chatId: msg.chatId, event: msg.event });
      return;
    }
    markProcessed(dedupeKey);

    // Parsing dan validasi.
    const parsed = parseNomination(msg.body);

    if (!parsed.valid) {
      // Format tidak valid: hentikan proses tanpa mengirim balasan WhatsApp.
      logError({
        messageId: msg.id,
        chatId: msg.chatId,
        errors: parsed.errors,
        raw: msg.body,
        kind: parsed.kind,
        reply: { status: 'skipped', reason: 'invalid-format' },
      });
      return;
    }

    // Buat form nominasi.
    const form = buildForm(parsed.date, parsed.cl);
    let previousEntries = [];
    try {
      previousEntries = await getPreviousEntries(200);
      if (!previousEntries || previousEntries.length === 0) {
        if (fs.existsSync(NOMINASI_LOG)) {
          previousEntries = fs.readFileSync(NOMINASI_LOG, 'utf8').split('\n')
            .filter(Boolean).map((line) => JSON.parse(line));
        }
      }
    } catch (_) { /* histori rusak/tidak ada: mulai dari baseline baru */ }

    // Hanya perubahan pada GSA/Swap/Stok CL yang boleh memicu email dan reply.
    // Pesan valid pertama untuk suatu tanggal menjadi baseline dan tetap diproses.
    const clChange = clChangeTracker.evaluate(form, previousEntries);
    if (!clChange.changed) {
      console.log(
        `[SKIP] CL tidak berubah: ${form.date} | GSA ${form.gsa} | ` +
        `Swap ${form.swapping} | Stok ${form.stokLNG}`
      );
      logIgnored({
        reason: 'cl-unchanged',
        messageId: msg.id,
        originalMessageId: msg.originalMessageId,
        event: msg.event,
        chatId: msg.chatId,
        senderNumber: msg.senderNumber || null,
        session: msg.session,
        form,
        kind: parsed.kind,
        previousCL: clChange.previous,
        raw: msg.body,
        reply: { status: 'skipped', reason: 'cl-unchanged' },
        email: 'skipped',
      });
      return;
    }

    // Kirim email jika diaktifkan di .env.
    // Sheet diisi flat (nilai konstan per jam) sesuai swap & stok dari form,
    // berlaku sama untuk Nominasi, Revisi Nominasi, maupun Re-Nominasi.
    const emailResult = await sendNominationEmail(form, parsed.kind, parsed.date);
    if (emailResult.status === 'sent') {
      console.log(`[EMAIL] terkirim ke semua penerima: ${emailResult.messageId}`);
    } else if (emailResult.status === 'partial') {
      console.warn(`[EMAIL] terkirim sebagian: ${emailResult.messageId}`);
    } else if (emailResult.skipped) {
      console.log(`[EMAIL] dilewati: ${emailResult.reason}`);
    } else {
      console.error(`[EMAIL] GAGAL: ${emailResult.reason}`);
    }

    // Balas WhatsApp.
    let replyText = successReply(form, config.replyWithSummary, parsed.kind);
    if (emailResult.status === 'partial') {
      replyText += '\n⚠️ (Catatan: email hanya terkirim ke sebagian penerima, mohon cek dashboard)';
    } else if (emailResult.sent === false && !emailResult.skipped) {
      replyText += '\n⚠️ (Catatan: email gagal dikirim, mohon cek manual)';
    }
    const reply = await safeReply(msg, replyText);

    // Satu record menyimpan hasil email dan hasil balasan agar history tidak duplikat.
    logSuccess({
      messageId: msg.id,
      originalMessageId: msg.originalMessageId,
      event: msg.event,
      chatId: msg.chatId,
      senderNumber: msg.senderNumber || null,
      session: msg.session,
      form,
      kind: parsed.kind,
      email: emailResult.status,
      emailDetails: emailResult,
      reply,
      raw: msg.body,
      messageTimestamp: msg.messageTimestamp || new Date().toISOString(),
    });

    console.log(
      `[OK] ${msg.chatId} | ${parsed.kind} | ${form.date} CL Total ${form.totalNominasi}`
    );
    console.log(formText(form));
  } catch (err) {
    console.error('[webhook] error:', err.message);
    logError({ reason: 'exception', message: err.message });
  }
});

/**
 * Kirim balasan dengan penanganan error agar tidak menjatuhkan proses.
 */
async function safeReply(msg, text) {
  try {
    const replyTo = config.replyAsQuote ? msg.id : undefined;
    // pakai sesi yang sama dengan pesan masuk (fallback ke config)
    await waha.sendText(msg.chatId, text, replyTo, msg.session);
    return { status: 'sent', timestamp: new Date().toISOString(), text };
  } catch (err) {
    console.error('[reply] gagal kirim balasan:', err.message);
    return { status: 'failed', timestamp: new Date().toISOString(), text, reason: err.message };
  }
}

// Start
app.listen(config.port, () => {
  console.log(`bot-cilegon listening on port ${config.port}`);
  console.log(`WAHA: ${config.waha.url} (session: ${config.waha.session})`);
  console.log(
    `Trigger keywords: ${config.triggerKeywords.join(', ')}` +
      (config.targetGroupId ? ` | group: ${config.targetGroupId}` : ' | group: ALL (mode uji)')
  );
  console.log(
    config.allowedSenderNumbers.length
      ? `Allowed senders: ${config.allowedSenderNumbers.map(normalizeSenderNumber).join(', ')}`
      : 'Allowed senders: ALL'
  );
});

module.exports = app;
