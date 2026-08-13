'use strict';

/**
 * Agregasi dashboard dari log JSON Lines (history, performa bot, status email).
 */

const fs = require('fs');
const readline = require('readline');
const { createHash } = require('crypto');
const { NOMINASI_LOG } = require('./logger');

/**
 * Baca seluruh entri log secara streaming (aman untuk file besar).
 * Baris yang korup/tidak valid JSON akan dilewati.
 * @returns {Promise<object[]>}
 */
function readEntries() {
  return new Promise((resolve) => {
    const entries = [];
    if (!fs.existsSync(NOMINASI_LOG)) {
      resolve(entries);
      return;
    }
    const rl = readline.createInterface({
      input: fs.createReadStream(NOMINASI_LOG, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        entries.push(JSON.parse(trimmed));
      } catch {
        // lewati baris korup
      }
    });
    rl.on('close', () => resolve(entries));
    rl.on('error', () => resolve(entries));
  });
}

/**
 * Status email sebuah entri sukses: 'sent' | 'skipped' | 'failed' | 'unknown'.
 * Entri lama mungkin belum punya field `email`.
 */
function emailStatusOf(entry) {
  if (entry.emailDetails && entry.emailDetails.status) return entry.emailDetails.status;
  if (entry.email === 'sent') return 'sent';
  if (entry.email === 'skipped') return 'skipped';
  if (entry.email === 'failed') return 'failed';
  return 'unknown';
}

/**
 * Hitung agregasi performa bot + status email dari daftar entri.
 * @param {object[]} entries
 */
function computeStats(entries) {
  const stats = {
    total: entries.length,
    success: 0,
    error: 0,
    ignored: 0,
    duplicate: 0,
    email: { sent: 0, partial: 0, skipped: 0, failed: 0, unknown: 0 },
    emailFailedEvents: 0,
    sendFailed: 0,
    firstTimestamp: null,
    lastTimestamp: null,
    lastSuccessAt: null,
    lastErrorAt: null,
    byChat: {},
  };

  for (const e of entries) {
    if (e.timestamp) {
      if (!stats.firstTimestamp || e.timestamp < stats.firstTimestamp) {
        stats.firstTimestamp = e.timestamp;
      }
      if (!stats.lastTimestamp || e.timestamp > stats.lastTimestamp) {
        stats.lastTimestamp = e.timestamp;
      }
    }

    const chat = e.chatId || 'unknown';
    if (!stats.byChat[chat]) stats.byChat[chat] = { success: 0, error: 0, ignored: 0 };

    switch (e.status) {
      case 'success':
        stats.success += 1;
        stats.byChat[chat].success += 1;
        stats.email[emailStatusOf(e)] += 1;
        if (e.reply && e.reply.status === 'failed') stats.sendFailed += 1;
        if (!stats.lastSuccessAt || e.timestamp > stats.lastSuccessAt) {
          stats.lastSuccessAt = e.timestamp;
        }
        break;
      case 'error':
        if (e.reason === 'email_failed') stats.emailFailedEvents += 1;
        else if (e.reason === 'send_failed') stats.sendFailed += 1;
        stats.error += 1;
        stats.byChat[chat].error += 1;
        if (!stats.lastErrorAt || e.timestamp > stats.lastErrorAt) {
          stats.lastErrorAt = e.timestamp;
        }
        break;
      case 'ignored':
        stats.ignored += 1;
        stats.byChat[chat].ignored += 1;
        if (e.reason === 'duplicate') stats.duplicate += 1;
        break;
      default:
        break;
    }
  }

  // Nominasi yang diproses = success + error (abaikan ignored/duplicate)
  const processed = stats.success + stats.error;
  stats.processed = processed;
  stats.successRate = processed > 0 ? Math.round((stats.success / processed) * 1000) / 10 : 0;

  // Percobaan email dihitung dari nominasi sukses yang statusnya sent/failed.
  const emailAttempts = stats.email.sent + stats.email.partial + stats.email.failed;
  stats.emailAttempts = emailAttempts;
  stats.emailDeliveryRate =
    emailAttempts > 0 ? Math.round(((stats.email.sent + stats.email.partial) / emailAttempts) * 1000) / 10 : null;
  stats.allEmailsSent = stats.email.partial === 0 && stats.email.failed === 0 && stats.emailFailedEvents === 0;

  return stats;
}

/**
 * Ambil history terbaru (urut terbaru dulu) untuk ditampilkan di tabel.
 * @param {object[]} entries
 * @param {object} [opts]
 * @param {number} [opts.limit=100]
 * @param {string} [opts.status]  filter status: success|error|ignored
 */
function buildHistory(entries, opts = {}) {
  const limit = Math.max(1, Math.min(parseInt(opts.limit || 100, 10) || 100, 1000));
  let list = entries;
  if (opts.status) {
    list = list.filter((e) => e.status === opts.status);
  }
  // urutkan terbaru dulu
  const sorted = [...list].sort((a, b) =>
    (b.timestamp || '').localeCompare(a.timestamp || '')
  );
  return sorted.slice(0, limit).map((e) => ({
    timestamp: e.timestamp || null,
    status: e.status || 'unknown',
    reason: e.reason || null,
    chatId: e.chatId || null,
    date: e.form ? e.form.date : null,
    swapping: e.form ? e.form.swapping : null,
    stokLNG: e.form ? e.form.stokLNG : null,
    total: e.form ? e.form.totalNominasi : null,
    email: e.status === 'success' ? emailStatusOf(e) : null,
    errors: e.errors || null,
    raw: e.raw ? String(e.raw).slice(0, 300) : null,
  }));
}

function normalizeLimit(value) {
  return Math.max(1, Math.min(parseInt(value || 100, 10) || 100, 1000));
}

function newestFirst(entries) {
  return [...entries].sort((a, b) =>
    (b.timestamp || '').localeCompare(a.timestamp || '')
  );
}

function emailEntryId(entry) {
  return createHash('sha256')
    .update(`${entry.timestamp || ''}|${entry.messageId || ''}|${entry.emailDetails?.messageId || ''}`)
    .digest('hex')
    .slice(0, 24);
}

function serializeEmailEntry(entry) {
  const details = entry.emailDetails || {};
  return {
    id: emailEntryId(entry),
    timestamp: entry.timestamp || null,
    status: emailStatusOf(entry),
    kind: entry.kind || null,
    date: entry.form ? entry.form.date : null,
    form: entry.form || null,
    subject: details.subject || null,
    from: details.from || null,
    to: details.to || [],
    cc: details.cc || [],
    messageId: details.messageId || null,
    smtpResponse: details.smtpResponse || null,
    reason: details.reason || null,
    recipients: details.recipients || [],
    attachment: details.attachment || null,
  };
}

/** Riwayat balasan WhatsApp, terpisah dari aktivitas pengiriman email. */
function buildReplyHistory(entries, opts = {}) {
  const limit = normalizeLimit(opts.limit);
  let list = entries.filter((entry) => entry.reply);
  if (opts.replyStatus) {
    list = list.filter((entry) => entry.reply.status === opts.replyStatus);
  }
  return newestFirst(list).slice(0, limit).map((entry) => ({
    timestamp: entry.reply.timestamp || entry.timestamp || null,
    status: entry.reply.status || 'unknown',
    chatId: entry.chatId || null,
    kind: entry.kind || null,
    date: entry.form ? entry.form.date : null,
    text: entry.reply.text || null,
    reason: entry.reply.reason || null,
  }));
}

/** Riwayat email beserta metadata lampiran yang tersimpan. */
function buildEmailHistory(entries, opts = {}) {
  const limit = normalizeLimit(opts.limit);
  let list = entries.filter((entry) => entry.status === 'success' && (entry.emailDetails || entry.email));
  if (opts.emailStatus) {
    list = list.filter((entry) => emailStatusOf(entry) === opts.emailStatus);
  }
  return newestFirst(list).slice(0, limit).map(serializeEmailEntry);
}

async function findEmailHistory(id) {
  const entries = await readEntries();
  const entry = entries.find((item) =>
    item.status === 'success' && (item.emailDetails || item.email) && emailEntryId(item) === id
  );
  return entry ? serializeEmailEntry(entry) : null;
}

async function findEmailAttachment(id) {
  const entries = await readEntries();
  for (const entry of entries) {
    const attachment = entry.emailDetails && entry.emailDetails.attachment;
    if (attachment && attachment.id === id) return attachment;
  }
  return null;
}

/**
 * Bangun deret waktu harian (untuk grafik tren).
 * @param {object[]} entries
 * @param {number} [days=14] jumlah hari terakhir yang ditampilkan
 */
function buildTimeSeries(entries, days = 14) {
  const buckets = new Map(); // 'YYYY-MM-DD' -> { success, error, ignored }
  for (const e of entries) {
    if (!e.timestamp) continue;
    const day = String(e.timestamp).slice(0, 10);
    if (!buckets.has(day)) buckets.set(day, { success: 0, error: 0, ignored: 0 });
    const b = buckets.get(day);
    if (e.status === 'success') b.success += 1;
    else if (e.status === 'error') b.error += 1;
    else if (e.status === 'ignored') b.ignored += 1;
  }

  // isi rentang hari berurutan (termasuk hari kosong) sampai hari ini
  const out = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const b = buckets.get(key) || { success: 0, error: 0, ignored: 0 };
    out.push({ date: key, ...b });
  }
  return out;
}

/**
 * Distribusi status email untuk grafik donat.
 * @param {object} stats hasil computeStats
 */
function emailBreakdown(stats) {
  return [
    { label: 'Terkirim', key: 'sent', value: stats.email.sent },
    { label: 'Sebagian', key: 'partial', value: stats.email.partial },
    { label: 'Dilewati', key: 'skipped', value: stats.email.skipped },
    { label: 'Gagal', key: 'failed', value: stats.email.failed + stats.emailFailedEvents },
  ];
}

/** Data lengkap untuk endpoint dashboard. */
async function getDashboardData(opts = {}) {
  const entries = await readEntries();
  const stats = computeStats(entries);
  return {
    stats,
    history: buildHistory(entries, opts),
    replyHistory: buildReplyHistory(entries, opts),
    emailHistory: buildEmailHistory(entries, opts),
    timeseries: buildTimeSeries(entries, opts.days ? parseInt(opts.days, 10) : 14),
    emailBreakdown: emailBreakdown(stats),
  };
}

module.exports = {
  readEntries,
  computeStats,
  buildHistory,
  buildTimeSeries,
  emailBreakdown,
  getDashboardData,
  buildReplyHistory,
  buildEmailHistory,
  findEmailAttachment,
  findEmailHistory,
  emailStatusOf,
};
