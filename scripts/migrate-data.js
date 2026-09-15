'use strict';

/**
 * Script migrasi data historis dari logs/nominasi.jsonl & dashboard-settings.json
 * ke database PostgreSQL (nomrenom_db).
 *
 * Jalankan: node scripts/migrate-data.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { initDb, getPool, insertNomination, saveSettingsToDb } = require('../src/db');
const { NOMINASI_LOG } = require('../src/logger');
const { SETTINGS_FILE } = require('../src/settingsService');

async function migrateNominations() {
  if (!fs.existsSync(NOMINASI_LOG)) {
    console.log('[migrasi] File nominasi.jsonl tidak ditemukan. Dilewati.');
    return 0;
  }

  console.log(`[migrasi] Membaca log dari: ${NOMINASI_LOG}`);
  const rl = readline.createInterface({
    input: fs.createReadStream(NOMINASI_LOG, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  const pool = getPool();
  let lineCount = 0;
  let insertedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  // Mulai transaksi batching
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    lineCount++;

    try {
      const entry = JSON.parse(trimmed);
      // Cek apakah entry sudah ada di DB berdasarkan message_id & timestamp
      if (entry.messageId && entry.timestamp) {
        const check = await pool.query(
          'SELECT id FROM nominations WHERE message_id = $1 AND timestamp = $2 LIMIT 1',
          [entry.messageId, new Date(entry.timestamp)]
        );
        if (check.rows.length > 0) {
          skippedCount++;
          continue;
        }
      }

      const res = await insertNomination(entry);
      if (res) {
        insertedCount++;
      } else {
        errorCount++;
      }
    } catch (err) {
      errorCount++;
      console.error(`[migrasi] Error baris ${lineCount}:`, err.message);
    }

    if (lineCount % 100 === 0) {
      console.log(`[migrasi] Proses baris ke-${lineCount}... (sukses: ${insertedCount}, skip: ${skippedCount})`);
    }
  }

  console.log(`\n=== HASIL MIGRASI NOMINASI ===`);
  console.log(`Total baris dibaca  : ${lineCount}`);
  console.log(`Berhasil disimpan   : ${insertedCount}`);
  console.log(`Sudah ada (skip)    : ${skippedCount}`);
  console.log(`Gagal               : ${errorCount}`);
  return insertedCount;
}

async function migrateSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    console.log('[migrasi] File dashboard-settings.json tidak ditemukan. Dilewati.');
    return;
  }

  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const settings = JSON.parse(raw);
    await saveSettingsToDb('operational_settings', settings);
    console.log(`[migrasi] Pengaturan dashboard-settings.json berhasil disimpan ke PostgreSQL.`);
  } catch (err) {
    console.error('[migrasi] Gagal migrasi settings:', err.message);
  }
}

async function run() {
  console.log('--- MEMULAI MIGRASI DATA KE POSTGRESQL ---');
  const pool = getPool();

  try {
    const ready = await initDb();
    if (!ready) {
      console.error('[migrasi] Inisialisasi DB gagal. Proses dihentikan.');
      process.exit(1);
    }

    await migrateNominations();
    await migrateSettings();

    // Verifikasi total baris di tabel nominations
    const countRes = await pool.query('SELECT COUNT(*) as total FROM nominations');
    console.log(`\nVerifikasi: Total data di tabel "nominations": ${countRes.rows[0].total} baris.`);
    console.log('--- MIGRASI SELESAI DENGAN SUKSES ---\n');
  } catch (err) {
    console.error('[migrasi] Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
