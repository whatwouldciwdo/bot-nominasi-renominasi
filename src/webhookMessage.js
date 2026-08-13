'use strict';

const crypto = require('crypto');
const { extractSenderId, normalizeSenderNumber } = require('./senderFilter');

/**
 * Ekstrak field penting dari payload webhook WAHA untuk pesan baru maupun edit.
 */
function extractMessage(reqBody) {
  const event = reqBody.event;
  const payload = reqBody.payload || {};
  const senderId = extractSenderId(payload);
  const isEdited = event === 'message.edited';

  return {
    event,
    id: payload.id,
    originalMessageId: isEdited ? (payload.editedMessageId || payload.id) : payload.id,
    chatId: payload.from,
    senderId,
    senderNumber: normalizeSenderNumber(senderId),
    body: payload.body || '',
    messageTimestamp: payload.timestamp || payload.t,
    fromMe: Boolean(payload.fromMe),
    session: reqBody.session || payload.session,
  };
}

/**
 * Bedakan pesan asli dengan setiap versi edit, tetapi tetap cegah retry webhook
 * untuk isi edit yang sama mengirim email berulang kali.
 */
function buildDedupeKey(msg) {
  if (msg.event !== 'message.edited') return msg.id;
  const contentHash = crypto.createHash('sha256').update(msg.body).digest('hex').slice(0, 16);
  return `message.edited:${msg.originalMessageId || msg.id || 'unknown'}:${contentHash}`;
}

module.exports = { extractMessage, buildDedupeKey };