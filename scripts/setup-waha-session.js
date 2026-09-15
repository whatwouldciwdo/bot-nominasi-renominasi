'use strict';

/**
 * Script untuk membuat dan menginisialisasi sesi baru di server WAHA.
 * Target: http://10.8.140.67:3010
 * Sesi: nominasi-renominasi
 *
 * Jalankan: node scripts/setup-waha-session.js
 */

const axios = require('axios');
const config = require('../src/config');

const WAHA_URL = config.waha.url;
const API_KEY = config.waha.apiKey;
const SESSION_NAME = config.waha.session || 'nominasi-renominasi';

async function setupSession() {
  console.log(`[waha-setup] Menghubungi WAHA di: ${WAHA_URL}`);
  console.log(`[waha-setup] Target session: ${SESSION_NAME}`);

  const client = axios.create({
    baseURL: WAHA_URL,
    headers: API_KEY ? { 'X-Api-Key': API_KEY } : {},
    timeout: 10000,
  });

  try {
    // 1. Cek apakah sesi sudah ada
    const existing = await client.get('/api/sessions?all=true');
    const found = existing.data.find((s) => s.name === SESSION_NAME);

    if (found) {
      console.log(`[waha-setup] Sesi "${SESSION_NAME}" sudah ada dengan status: ${found.status}`);
      if (found.status === 'STOPPED') {
        console.log(`[waha-setup] Menyalakan sesi "${SESSION_NAME}"...`);
        await client.post(`/api/sessions/${SESSION_NAME}/start`);
        console.log(`[waha-setup] Sesi "${SESSION_NAME}" berhasil distart.`);
      }
      return found;
    }

    // 2. Buat sesi baru jika belum ada
    console.log(`[waha-setup] Membuat sesi baru "${SESSION_NAME}"...`);
    const createRes = await client.post('/api/sessions', {
      name: SESSION_NAME,
      start: true,
      config: {
        webhooks: [],
      },
    });

    console.log(`[waha-setup] Sesi "${SESSION_NAME}" berhasil dibuat! Status:`, createRes.data.status || 'OK');
    return createRes.data;
  } catch (err) {
    console.error('[waha-setup] Gagal membuat sesi WAHA:', err.response?.data || err.message);
    throw err;
  }
}

if (require.main === module) {
  setupSession()
    .then(() => {
      console.log('[waha-setup] Selesai.');
      process.exit(0);
    })
    .catch(() => process.exit(1));
}

module.exports = { setupSession };
