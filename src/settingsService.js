'use strict';

const fs = require('fs');
const path = require('path');
const config = require('./config');
const { normalizeSenderNumber } = require('./senderFilter');

const SETTINGS_FILE = path.join(__dirname, '..', 'logs', 'dashboard-settings.json');
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 100;

function unique(values, key = (value) => value) {
  const seen = new Set();
  return values.filter((value) => {
    const normalizedKey = key(value);
    if (seen.has(normalizedKey)) return false;
    seen.add(normalizedKey);
    return true;
  });
}

function validateList(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} harus berupa daftar.`);
  if (value.length > MAX_ITEMS) throw new Error(`${field} maksimal ${MAX_ITEMS} data.`);
  if (value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} hanya boleh berisi teks.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function normalizeSenderList(value) {
  const senders = validateList(value, 'allowedSenderNumbers').map(normalizeSenderNumber);
  if (senders.some((number) => !/^\d{8,15}$/.test(number))) {
    throw new Error('Nomor pengirim harus berupa nomor WhatsApp yang valid (8-15 digit).');
  }
  return unique(senders);
}

function normalizeEmailList(value, field) {
  const emails = validateList(value, field);
  if (emails.some((email) => !EMAIL_PATTERN.test(email))) {
    throw new Error(`${field} berisi alamat email yang tidak valid.`);
  }
  return unique(emails, (email) => email.toLowerCase());
}

function normalizeSettingsPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Payload pengaturan tidak valid.');
  }
  return {
    allowedSenderNumbers: normalizeSenderList(payload.allowedSenderNumbers),
    emailTo: normalizeEmailList(payload.emailTo, 'emailTo'),
    emailCc: normalizeEmailList(payload.emailCc, 'emailCc'),
  };
}

function getSettings() {
  return {
    allowedSenderNumbers: [...config.allowedSenderNumbers],
    emailTo: [...config.email.to],
    emailCc: [...config.email.cc],
  };
}

function applySettings(settings) {
  config.allowedSenderNumbers = [...settings.allowedSenderNumbers];
  config.email.to = [...settings.emailTo];
  config.email.cc = [...settings.emailCc];
  return getSettings();
}

function loadSettings() {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return getSettings();
    const stored = normalizeSettingsPayload(JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')));
    return applySettings(stored);
  } catch (err) {
    console.error(`[settings] gagal memuat ${SETTINGS_FILE}: ${err.message}`);
    return getSettings();
  }
}

function saveSettings(payload) {
  const settings = normalizeSettingsPayload(payload);
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  const temporaryFile = `${SETTINGS_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryFile, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  fs.renameSync(temporaryFile, SETTINGS_FILE);
  return applySettings(settings);
}

module.exports = {
  SETTINGS_FILE,
  getSettings,
  loadSettings,
  saveSettings,
  normalizeSettingsPayload,
};