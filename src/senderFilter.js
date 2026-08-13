'use strict';

/**
 * Normalisasi nomor WhatsApp ke digit internasional Indonesia (62...).
 * Menerima format manusia (+62 856-...) maupun ID WAHA (62856...@c.us).
 */
function normalizeSenderNumber(value) {
  if (!value) return '';

  const raw = typeof value === 'object'
    ? value.id || value._serialized || value.user || ''
    : value;
  let digits = String(raw).split('@')[0].replace(/\D/g, '');

  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  if (digits.startsWith('8')) digits = `62${digits}`;
  return digits;
}

/**
 * WAHA dapat menaruh pengirim grup pada field yang berbeda antar engine/versi.
 * Jangan fallback ke `from` untuk grup karena field itu adalah ID grup.
 */
function extractSenderId(payload = {}) {
  const candidates = [
    payload.participantPn,
    payload.participantAlt,
    payload.authorPn,
    payload.authorAlt,
    payload.senderPn,
    payload.senderAlt,
    payload.participant,
    payload.author,
    payload.sender,
    payload.fromParticipant,
    payload._data && payload._data.participantPn,
    payload._data && payload._data.participantAlt,
    payload._data && payload._data.authorPn,
    payload._data && payload._data.authorAlt,
    payload._data && payload._data.author,
    payload._data && payload._data.participant,
    payload._data && payload._data.sender,
  ];

  return candidates.find((value) => normalizeSenderNumber(value)) || '';
}

function isAllowedSender(senderId, allowedNumbers) {
  if (!Array.isArray(allowedNumbers) || allowedNumbers.length === 0) return true;
  const sender = normalizeSenderNumber(senderId);
  return Boolean(sender) && allowedNumbers.some(
    (allowed) => normalizeSenderNumber(allowed) === sender
  );
}

module.exports = { normalizeSenderNumber, extractSenderId, isAllowedSender };