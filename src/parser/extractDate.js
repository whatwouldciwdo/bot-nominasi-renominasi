'use strict';

/**
 * Ambil tanggal nominasi dari teks (pola tanggal Indonesia).
 * Contoh: "Nominasi PGN 24 Juni 2026" -> tanggal dengan format pendek dan panjang.
 */

const MONTHS = {
  jan: 0, januari: 0,
  feb: 1, februari: 1, pebruari: 1,
  mar: 2, maret: 2,
  apr: 3, april: 3,
  mei: 4,
  jun: 5, juni: 5,
  jul: 6, juli: 6,
  agu: 7, agt: 7, agustus: 7, agust: 7,
  sep: 8, sept: 8, september: 8,
  okt: 9, oktober: 9,
  nov: 10, nopember: 10, november: 10,
  des: 11, desember: 11,
};

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * @param {string} text
 * @returns {{raw:string, day:number, month:number, year:number, formatted:string, formattedLong:string}|null}
 */
function extractDate(text) {
  if (typeof text !== 'string' || !text) return null;

  // terpanjang dulu agar "juni" menang atas "jun"
  const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length);
  const monthPattern = monthNames.join('|');

  const re = new RegExp(
    `\\b(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{2,4})\\b`,
    'i'
  );

  const m = text.match(re);
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const month = MONTHS[m[2].toLowerCase()];
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;

  if (
    Number.isNaN(day) || day < 1 || day > 31 ||
    month === undefined ||
    Number.isNaN(year)
  ) {
    return null;
  }

  const yy = String(year).slice(-2);
  const formatted = `${String(day).padStart(2, '0')}-${MONTH_SHORT[month]}-${yy}`;
  const formattedLong = `${day} - ${MONTH_LONG[month]} - ${year}`;

  return { raw: m[0], day, month, year, formatted, formattedLong };
}

module.exports = { extractDate, MONTHS, MONTH_SHORT, MONTH_LONG };
