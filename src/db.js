'use strict';

/**
 * Modul Database PostgreSQL untuk Bot Nominasi & Re-Nominasi.
 * Mengelola koneksi pool, inisialisasi tabel otomatis, logging nominasi,
 * dan pembacaan data riwayat untuk dashboard.
 */

const { Pool } = require('pg');
const config = require('./config');

let pool = null;
let isInitialized = false;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('[db] PostgreSQL pool error tak terduga:', err.message);
    });
  }
  return pool;
}

/**
 * Inisialisasi skema tabel jika belum ada.
 */
async function initDb() {
  if (isInitialized) return true;
  const p = getPool();
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS nominations (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL,
        status VARCHAR(50) NOT NULL,
        reason VARCHAR(100),
        message_id TEXT,
        original_message_id TEXT,
        chat_id TEXT,
        sender_number VARCHAR(50),
        session VARCHAR(100),
        kind VARCHAR(50),
        form_date VARCHAR(50),
        unit VARCHAR(20),
        gsa NUMERIC,
        swapping NUMERIC,
        stok_lng NUMERIC,
        total_nominasi NUMERIC,
        form_data JSONB,
        email_status VARCHAR(50),
        email_details JSONB,
        reply_status VARCHAR(50),
        reply_details JSONB,
        raw_message TEXT,
        errors JSONB,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_nominations_timestamp ON nominations (timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_nominations_status ON nominations (status);
      CREATE INDEX IF NOT EXISTS idx_nominations_chat_id ON nominations (chat_id);
      CREATE INDEX IF NOT EXISTS idx_nominations_message_id ON nominations (message_id);

      CREATE TABLE IF NOT EXISTS settings (
        key VARCHAR(100) PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    isInitialized = true;
    console.log('[db] Skema database PostgreSQL siap (tabel nominations & settings).');
    return true;
  } catch (err) {
    console.error('[db] Gagal inisialisasi tabel PostgreSQL:', err.message);
    return false;
  }
}

/**
 * Simpan satu record nominasi (sukses / error / ignored) ke PostgreSQL.
 * @param {object} entry
 */
async function insertNomination(entry) {
  try {
    const p = getPool();
    const form = entry.form || {};
    const reply = entry.reply || {};
    const emailDetails = entry.emailDetails || {};

    const query = `
      INSERT INTO nominations (
        timestamp, status, reason, message_id, original_message_id,
        chat_id, sender_number, session, kind, form_date, unit,
        gsa, swapping, stok_lng, total_nominasi, form_data,
        email_status, email_details, reply_status, reply_details,
        raw_message, errors, payload
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22, $23
      ) RETURNING id;
    `;

    const values = [
      entry.timestamp ? new Date(entry.timestamp) : new Date(),
      entry.status || 'unknown',
      entry.reason || null,
      entry.messageId || null,
      entry.originalMessageId || null,
      entry.chatId || null,
      entry.senderNumber || null,
      entry.session || null,
      entry.kind || null,
      form.date || null,
      form.unit || null,
      typeof form.gsa === 'number' ? form.gsa : null,
      typeof form.swapping === 'number' ? form.swapping : null,
      typeof form.stokLNG === 'number' ? form.stokLNG : null,
      typeof form.totalNominasi === 'number' ? form.totalNominasi : null,
      form && Object.keys(form).length > 0 ? JSON.stringify(form) : null,
      entry.email || emailDetails.status || null,
      emailDetails && Object.keys(emailDetails).length > 0 ? JSON.stringify(emailDetails) : null,
      reply.status || null,
      reply && Object.keys(reply).length > 0 ? JSON.stringify(reply) : null,
      entry.raw || null,
      entry.errors ? JSON.stringify(entry.errors) : null,
      JSON.stringify(entry),
    ];

    const res = await p.query(query, values);
    return res.rows[0];
  } catch (err) {
    console.error('[db] Gagal menyimpan log ke PostgreSQL:', err.message);
    return null;
  }
}

/**
 * Ambil daftar entri dari PostgreSQL untuk dashboard / agregasi.
 * Mengembalikan array of payload (format yang sama dengan JSONL).
 * @param {object} [opts]
 * @param {number} [opts.limit]
 * @param {string} [opts.status]
 * @param {number} [opts.days]
 */
async function getEntriesFromDb(opts = {}) {
  const p = getPool();
  const conditions = [];
  const params = [];

  if (opts.status) {
    params.push(opts.status);
    conditions.push(`status = $${params.length}`);
  }

  if (opts.days && Number(opts.days) > 0) {
    params.push(Number(opts.days));
    conditions.push(`timestamp >= NOW() - ($${params.length} || ' days')::INTERVAL`);
  }

  let sql = 'SELECT payload FROM nominations';
  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(' AND ')}`;
  }
  sql += ' ORDER BY timestamp DESC';

  if (opts.limit && Number(opts.limit) > 0) {
    params.push(Number(opts.limit));
    sql += ` LIMIT $${params.length}`;
  }

  const res = await p.query(sql, params);
  return res.rows.map((r) => r.payload);
}

/**
 * Ambil entri historis terbaru untuk pengecekan perubahan CL (clChangeTracker).
 */
async function getPreviousEntries(limit = 200) {
  try {
    const p = getPool();
    const res = await p.query(
      `SELECT payload FROM nominations WHERE status = 'success' ORDER BY timestamp DESC LIMIT $1`,
      [limit]
    );
    return res.rows.map((r) => r.payload);
  } catch (err) {
    console.error('[db] Gagal memuat previousEntries dari PostgreSQL:', err.message);
    return [];
  }
}

/**
 * Muat pengaturan operasional dari tabel settings.
 */
async function getSettingsFromDb(key = 'operational_settings') {
  try {
    const p = getPool();
    const res = await p.query('SELECT value FROM settings WHERE key = $1', [key]);
    if (res.rows.length > 0) {
      return res.rows[0].value;
    }
    return null;
  } catch (err) {
    console.error('[db] Gagal membaca settings dari PostgreSQL:', err.message);
    return null;
  }
}

/**
 * Simpan pengaturan operasional ke tabel settings.
 */
async function saveSettingsToDb(key = 'operational_settings', value = {}) {
  try {
    const p = getPool();
    await p.query(
      `
      INSERT INTO settings (key, value, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = NOW()
    `,
      [key, JSON.stringify(value)]
    );
    return true;
  } catch (err) {
    console.error('[db] Gagal menyimpan settings ke PostgreSQL:', err.message);
    return false;
  }
}

/**
 * Periksa konektivitas database.
 */
async function pingDb() {
  try {
    const p = getPool();
    const res = await p.query('SELECT NOW() as now');
    return { ok: true, now: res.rows[0].now };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  getPool,
  initDb,
  insertNomination,
  getEntriesFromDb,
  getPreviousEntries,
  getSettingsFromDb,
  saveSettingsToDb,
  pingDb,
};
