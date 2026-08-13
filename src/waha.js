'use strict';

/**
 * WAHA client — kirim pesan / reply ke WhatsApp via WAHA HTTP API.
 * Dokumentasi WAHA: https://waha.devlike.pro/
 */

const axios = require('axios');
const config = require('./config');

const http = axios.create({
  baseURL: config.waha.url,
  timeout: 15000,
  headers: config.waha.apiKey ? { 'X-Api-Key': config.waha.apiKey } : {},
});

const LID_CACHE_TTL_MS = 5 * 60 * 1000;
// WAHA membatasi endpoint /lids ke 100 entri secara default. Sesi aktif dapat
// memiliki ratusan mapping, jadi ambil seluruh tabel agar anggota grup lama
// tidak gagal dikenali hanya karena berada di luar halaman pertama.
const LID_FETCH_LIMIT = 10000;
const lidCache = new Map();

function findPhoneNumberForLid(lid, entries) {
  if (!String(lid || '').endsWith('@lid') || !Array.isArray(entries)) return '';
  const match = entries.find((entry) => entry && entry.lid === lid);
  return match && match.pn ? match.pn : '';
}

/**
 * Engine WAHA terbaru dapat mengirim participant grup sebagai ...@lid.
 * Endpoint /api/{session}/lids menyediakan pasangan LID -> nomor WhatsApp.
 */
async function resolveSenderId(senderId, session) {
  if (!String(senderId || '').endsWith('@lid')) return senderId || '';

  const sessionName = session || config.waha.session;
  const cached = lidCache.get(sessionName);
  let entries = cached && cached.expiresAt > Date.now() ? cached.entries : null;

  if (!entries) {
    try {
      const res = await http.get(`/api/${encodeURIComponent(sessionName)}/lids`, {
        params: { limit: LID_FETCH_LIMIT },
      });
      entries = Array.isArray(res.data) ? res.data : [];
      lidCache.set(sessionName, {
        entries,
        expiresAt: Date.now() + LID_CACHE_TTL_MS,
      });
    } catch (err) {
      console.error(`[WAHA] gagal memuat pemetaan LID: ${err.message}`);
      return senderId;
    }
  }

  return findPhoneNumberForLid(senderId, entries) || senderId;
}

/**
 * Kirim pesan teks ke sebuah chat.
 * @param {string} chatId  mis. "1203630xxxx@g.us" atau "628xxxx@c.us"
 * @param {string} text
 * @param {string} [replyTo]  message ID yang di-quote (opsional)
 * @param {string} [session]  nama sesi WAHA; default dari config
 */
async function sendText(chatId, text, replyTo, session) {
  const payload = {
    session: session || config.waha.session,
    chatId,
    text,
  };
  if (replyTo) payload.reply_to = replyTo;

  const res = await http.post('/api/sendText', payload);
  return res.data;
}

/**
 * Cek status sesi WAHA.
 */
async function getSessionStatus() {
  try {
    const res = await http.get(`/api/sessions/${config.waha.session}`);
    return res.data;
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { sendText, getSessionStatus, resolveSenderId, findPhoneNumberForLid, http };
