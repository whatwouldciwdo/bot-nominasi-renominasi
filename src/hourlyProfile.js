'use strict';

/**
 * Membentuk profil SWAP/STOK berdasarkan jam pesan (zona waktu lokal server).
 * Nilai pada form adalah target Average per Day. Saat ada Re-Nominasi, slot
 * sebelum jam revisi dipertahankan dan slot tersisa diisi dengan nilai yang
 * membuat rata-rata 24 jam tepat mencapai target baru.
 */

function eventTime(value) {
  if (typeof value === 'number' || /^\d+$/.test(String(value || ''))) {
    const number = Number(value);
    return new Date(number < 1e12 ? number * 1000 : number);
  }
  return new Date(value);
}

function hourOf(value, timeZone = 'Asia/Jakarta') {
  const date = eventTime(value);
  if (Number.isNaN(date.getTime())) return 0;
  const parts = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', hourCycle: 'h23', timeZone,
  }).formatToParts(date);
  return Number(parts.find((part) => part.type === 'hour')?.value || 0);
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Nilai konstan yang harus diterapkan pada slot tersisa agar average 24 jam
 * mencapai target:
 *   ((targetAverage × 24) − totalSebelumRevisi) ÷ jumlahJamTersisa
 */
function remainingHourlyValue(targetAverage, valuesBefore, remainingHours) {
  if (remainingHours <= 0) return numberOrZero(targetAverage);
  const consumed = valuesBefore.reduce((total, value) => total + numberOrZero(value), 0);
  return ((numberOrZero(targetAverage) * 24) - consumed) / remainingHours;
}

function buildHourlyProfile(form, messageTimestamp, previousEntries = []) {
  const hourly = Array.from({ length: 24 }, () => ({ swap: 0, stok: 0 }));
  const events = previousEntries
    .filter((entry) => entry && entry.form && entry.form.date === form.date)
    .map((entry) => ({
      timestamp: entry.messageTimestamp || entry.receivedAt || entry.timestamp,
      form: entry.form,
    }))
    .filter((entry) => entry.timestamp && !Number.isNaN(eventTime(entry.timestamp).getTime()))
    .sort((a, b) => eventTime(a.timestamp) - eventTime(b.timestamp));

  // Event yang sedang diproses ditambahkan setelah histori agar selalu masuk.
  events.push({ timestamp: messageTimestamp || new Date().toISOString(), form });
  events.sort((a, b) => eventTime(a.timestamp) - eventTime(b.timestamp));

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    // Nominasi pertama menjadi baseline target sehari penuh. Re-Nominasi
    // mempertahankan slot yang sudah berjalan lalu mengompensasi slot tersisa
    // agar Average per Day mencapai target terbaru.
    const start = index === 0 ? 0 : Math.max(0, Math.min(23, hourOf(event.timestamp)));
    const remainingHours = 24 - start;
    const swap = remainingHourlyValue(
      event.form.swapping,
      hourly.slice(0, start).map((slot) => slot.swap),
      remainingHours,
    );
    const stok = remainingHourlyValue(
      event.form.stokLNG,
      hourly.slice(0, start).map((slot) => slot.stok),
      remainingHours,
    );
    for (let hour = start; hour < 24; hour++) {
      hourly[hour] = { swap, stok };
    }
  }
  return hourly;
}

module.exports = { buildHourlyProfile, hourOf, remainingHourlyValue };