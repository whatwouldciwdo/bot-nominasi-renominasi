'use strict';

/**
 * Email service via SMTP (Gmail / Office 365). Konfigurasi dari .env.
 * Email hanya dikirim jika EMAIL_ENABLED=true dan kredensial lengkap.
 *
 * Catatan Office 365: SMTP AUTH (basic auth) dinonaktifkan default.
 * Jika error 5.7.139, minta admin M365 aktifkan "Authenticated SMTP".
 */

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const config = require('./config');
const { buildAttachment } = require('./xlsxService');

const EMAIL_ATTACHMENT_DIR = path.join(__dirname, '..', 'logs', 'email-attachments');
const NOMINASI_LOG = path.join(__dirname, '..', 'logs', 'nominasi.jsonl');

// Menahan nomor revisi selama proses berjalan agar dua webhook bersamaan tidak
// memakai nomor yang sama sebelum record-nya ditulis oleh logger.
const revisionReservations = new Map();

let transporter = null;

/** Apakah email aktif & konfigurasi minimal terpenuhi. */
function isEmailEnabled() {
  const e = config.email;
  return Boolean(e.enabled && e.user && e.pass && e.from && e.to.length > 0);
}

/** Buat / ambil transporter SMTP (lazy singleton). */
function getTransporter() {
  if (transporter) return transporter;
  const e = config.email;
  transporter = nodemailer.createTransport({
    host: e.host,
    port: e.port,
    secure: e.secure, // false untuk 587 (STARTTLS)
    auth: { user: e.user, pass: e.pass },
    tls: {
      // Office 365 butuh STARTTLS; biarkan default minVersion TLS1.2
      ciphers: 'TLSv1.2',
    },
  });
  return transporter;
}

/**
 * Verifikasi koneksi & kredensial SMTP (tanpa mengirim email).
 * Berguna untuk diagnosa apakah SMTP AUTH diizinkan.
 * @returns {Promise<{ok:boolean, error?:string}>}
 */
async function verifyConnection() {
  if (!config.email.enabled) {
    return { ok: false, error: 'EMAIL_ENABLED=false' };
  }
  if (!config.email.user || !config.email.pass) {
    return { ok: false, error: 'SMTP_USER / SMTP_PASS belum diisi' };
  }
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function latestRevision(date) {
  let latest = 0;
  try {
    if (!fs.existsSync(NOMINASI_LOG)) return 0;
    for (const line of fs.readFileSync(NOMINASI_LOG, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        const subject = entry.emailDetails?.subject || entry.email?.subject || '';
        if (entry.form?.date === date && entry.kind === 'Re-Nominasi') {
          const match = subject.match(/Rev(\d+)/i);
          if (match) latest = Math.max(latest, Number(match[1]));
        }
      } catch (_) { /* Abaikan baris log yang rusak. */ }
    }
  } catch (_) { /* Log tidak tersedia tidak boleh menggagalkan pengiriman. */ }
  return latest;
}

function nextRevision(date) {
  const reserved = revisionReservations.get(date) || 0;
  const revision = Math.max(latestRevision(date), reserved) + 1;
  revisionReservations.set(date, revision);
  return revision;
}

/** Bangun subject & body resmi email nominasi/renominasi. */
function buildMail(form, kind = 'Re-Nominasi', revision) {
  const isRevision = /^re[- ]?nominasi$/i.test(kind) || /^re/i.test(kind);
  const subject = isRevision
    ? `Rev${revision || 1} Nominasi Harian PIP UBP Cilegon ${form.date}`
    : `Nominasi Harian PIP UBP Cilegon ${form.date}`;
  const intro = isRevision
    ? `Sehubungan dengan kebutuhan pasokan gas PGN ke PIP UBP Cilegon, bersama ini kami mengajukan revisi-1 nominasi pasokan gas PGN untuk PIP UBP Cilegon periode ${form.date}  (terlampir).`
    : `Sehubungan dengan kebutuhan pasokan gas PGN ke PIP UBP Cilegon, bersama ini kami mengajukan nominasi pasokan gas PGN untuk PIP UBP Cilegon periode ${form.date} (terlampir).`;
  const text = [
    'PT Pertamina Gas Negara', '', 'Gas Planning and Optimization', '',
    'u.p. Division Head, Gas Planning and Optimization', '', intro, '',
    'Demikian disampaikan, atas perhatian dan kerja samanya diucapkan terima kasih.', '',
    'Best Regards,',
  ].join('\n');
  const html = `<div style="font-family:Arial,sans-serif;white-space:pre-line">${escapeHtml(text)}</div>`;
  return { subject, text, html, revision: isRevision ? (revision || 1) : null };
}

/** Jadikan nama attachment aman untuk filesystem/email client. */
function sanitizeAttachmentFileName(filename) {
  const safeFilename = String(filename || 'Lampiran Nominasi.xlsx')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return safeFilename || 'Lampiran Nominasi.xlsx';
}

/**
 * Nama attachment mengikuti format client:
 * - Nominasi: Form Nominasi Harian IP PLTGU Cilegon (LNG)_12082026.xlsx
 * - ReNominasi: Form Nominasi Harian IP PLTGU Cilegon (LNG)_11082026_R1.xlsx
 */
function buildAttachmentFileName(generatedFilename, revision) {
  const safeFilename = sanitizeAttachmentFileName(generatedFilename);
  if (!revision) return safeFilename;

  const ext = path.extname(safeFilename) || '.xlsx';
  const basename = safeFilename.slice(0, safeFilename.length - ext.length) || 'Lampiran Nominasi';
  return `${basename}_R${revision}${ext}`;
}

/** Susun payload Nodemailer; file Excel wajib dilampirkan untuk semua jenis nominasi. */
function buildSendMailOptions(emailConfig, mail, generated) {
  return {
    from: emailConfig.from,
    to: emailConfig.to,
    cc: emailConfig.cc.length ? emailConfig.cc : undefined,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    attachments: [{
      filename: buildAttachmentFileName(generated.filename, mail.revision),
      content: generated.buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }],
  };
}

function normalizeAddress(address) {
  const value = typeof address === 'object' && address ? address.address : address;
  const text = String(value || '').trim().toLowerCase();
  const angleMatch = text.match(/<([^<>]+)>/);
  return (angleMatch ? angleMatch[1] : text).trim();
}

function buildRecipientResults(to, cc, accepted = [], rejected = []) {
  const acceptedSet = new Set(accepted.map(normalizeAddress));
  const rejectedSet = new Set(rejected.map(normalizeAddress));
  const recipients = [
    ...to.map((address) => ({ address, type: 'to' })),
    ...cc.map((address) => ({ address, type: 'cc' })),
  ];
  return recipients.map((recipient) => {
    const key = normalizeAddress(recipient.address);
    return {
      ...recipient,
      status: acceptedSet.has(key) ? 'accepted' : rejectedSet.has(key) ? 'rejected' : 'unknown',
    };
  });
}

/**
 * Kirim email form nominasi.
 * @param {object} form  hasil buildForm()
 * @param {string} [kind] 'Nominasi' | 'Re-Nominasi'
 * @param {object} dateObj hasil parser tanggal
 * @returns {Promise<object>}
 */
async function sendNominationEmail(form, kind = 'Re-Nominasi', dateObj, hourly) {
  const e = config.email;
  const revision = /^re/i.test(kind) ? nextRevision(form.date) : null;
  const { subject, text, html } = buildMail(form, kind, revision);
  const baseResult = {
    status: 'skipped',
    sent: false,
    skipped: true,
    from: e.from || null,
    to: e.to,
    cc: e.cc,
    subject,
    revision,
    attachment: null,
    recipients: buildRecipientResults(e.to, e.cc),
  };

  if (!isEmailEnabled()) {
    return {
      ...baseResult,
      reason:
        'Email dinonaktifkan / konfigurasi belum lengkap (EMAIL_ENABLED, SMTP_USER, SMTP_PASS, EMAIL_TO).',
    };
  }

  let storedFile = null;
  try {
    if (!dateObj) throw new Error('Tanggal nominasi tidak tersedia untuk membuat lampiran.');

    const generated = await buildAttachment(form, dateObj, hourly ? { hourly } : {});
    const attachmentId = randomUUID();
    await fs.promises.mkdir(EMAIL_ATTACHMENT_DIR, { recursive: true });
    storedFile = path.join(EMAIL_ATTACHMENT_DIR, `${attachmentId}.xlsx`);
    await fs.promises.writeFile(storedFile, generated.buffer);

    const attachment = {
      id: attachmentId,
      filename: buildAttachmentFileName(generated.filename, revision),
      size: generated.buffer.length,
      downloadUrl: `/api/email-attachments/${attachmentId}`,
    };

    const info = await getTransporter().sendMail(
      buildSendMailOptions(e, { subject, text, html, revision }, generated)
    );
    const recipients = buildRecipientResults(e.to, e.cc, info.accepted || [], info.rejected || []);
    const acceptedCount = recipients.filter((recipient) => recipient.status === 'accepted').length;
    const rejectedCount = recipients.filter((recipient) => recipient.status === 'rejected').length;
    const unknownCount = recipients.length - acceptedCount - rejectedCount;
    const status = acceptedCount === 0 ? 'failed' : rejectedCount > 0 || unknownCount > 0 ? 'partial' : 'sent';
    return {
      ...baseResult,
      status,
      sent: acceptedCount > 0,
      skipped: false,
      messageId: info.messageId,
      smtpResponse: info.response || null,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      recipients,
      attachment,
    };
  } catch (err) {
    if (storedFile) {
      await fs.promises.unlink(storedFile).catch(() => {});
    }
    return {
      ...baseResult,
      status: 'failed',
      skipped: false,
      recipients: buildRecipientResults(e.to, e.cc),
      reason: err.message,
    };
  }
}

module.exports = {
  sendNominationEmail,
  isEmailEnabled,
  verifyConnection,
  buildMail,
  buildAttachmentFileName,
  buildSendMailOptions,
  buildRecipientResults,
  EMAIL_ATTACHMENT_DIR,
};
