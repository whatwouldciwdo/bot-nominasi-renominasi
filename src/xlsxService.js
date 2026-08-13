'use strict';

/**
 * Generator lampiran Excel "Form Nominasi Harian IP PLTGU Cilegon (LNG)".
 * Memuat template asli lalu mengisi sel input saja; layout & formula tetap.
 *
 * Sel yang diisi bot:
 *   E4        : tanggal pengajuan (= tanggal efektif - 1)
 *   E13/G13/I13: ringkasan harian dengan cached result terbaru
 *   F20:F43   : SWAP LNG per jam (24 baris)
 *   G20:G43   : STOCK LNG PLN EPI per jam (24 baris)
 * Sel turunan (H, total, average, tanggal efektif) dihitung formula template.
 *
 * Profil per jam default flat (tiap jam = nilai harian), bisa ditimpa opts.hourly.
 */

const path = require('path');
const ExcelJS = require('exceljs');

const TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'form_lng_template.xlsx');

const FIRST_HOUR_ROW = 20; // baris 00.00-01.00
const LAST_HOUR_ROW = 43; // baris 23.00-24.00
const COL_SWAP = 6; // F
const COL_STOK = 7; // G
const COL_TOTAL = 8; // H
const AVERAGE_ROW = 44;

/**
 * Profil per jam (24 baris). Default flat = nilai harian.
 */
function buildHourly(form, hourly) {
  if (Array.isArray(hourly) && hourly.length === 24) return hourly;
  const swap = form.swapping || 0;
  const stok = form.stokLNG || 0;
  return Array.from({ length: 24 }, () => ({ swap, stok }));
}

/**
 * Buat workbook dari template & isi data.
 * @param {object} form  hasil buildForm() { swapping, stokLNG, totalNominasi }
 * @param {object} dateObj  objek date parser { day, month(0-11), year }
 * @param {object} [opts] { hourly }
 * @returns {Promise<ExcelJS.Workbook>}
 */
async function buildWorkbook(form, dateObj, opts = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);
  const ws = wb.worksheets[0];

  // Paksa Excel menghitung ulang semua formula saat file dibuka,
  // sehingga turunan (harian, total, average, tanggal) selalu sinkron.
  wb.calcProperties = wb.calcProperties || {};
  wb.calcProperties.fullCalcOnLoad = true;

  // E4 = tanggal PENGAJUAN = tanggal efektif - 1.
  // dateObj dari parser = tanggal EFEKTIF (mis. 26 Juni 2026).
  const efektif = new Date(Date.UTC(dateObj.year, dateObj.month, dateObj.day));
  const pengajuan = new Date(efektif);
  pengajuan.setUTCDate(pengajuan.getUTCDate() - 1);
  ws.getCell('E4').value = pengajuan;
  // Pertahankan formula template sekaligus isi cached result tanggal efektif
  // supaya preview/library non-Excel juga membaca tanggal yang benar.
  ws.getCell('E6').value = { formula: 'E4+1', result: efektif };
  // Pakai locale Inggris agar Excel menampilkan "27 - July - 2026"
  // meskipun regional setting komputer penerima bukan English.
  ws.getCell('E4').numFmt = '[$-en-US]d "-" mmmm "-" yyyy';
  ws.getCell('E6').numFmt = '[$-en-US]d "-" mmmm "-" yyyy';

  // Formula di template membawa cached result dari contoh lama. Excel desktop
  // akan menghitung ulang, tetapi preview WhatsApp/Google Drive sering hanya
  // membaca cache tersebut. Tulis ulang formula beserta hasil aktual agar
  // ringkasan atas langsung sama dengan Average per Day di baris 44.
  ws.getCell('E13').value = {
    formula: 'F44',
    result: form.swapping || 0,
  };
  ws.getCell('G13').value = {
    formula: 'G44',
    result: form.stokLNG || 0,
  };
  ws.getCell('I13').value = {
    formula: 'H44',
    result: form.totalNominasi || 0,
  };

  // Forecast date juga berupa formula dengan cache tanggal bawaan template.
  for (const address of ['F17', 'G17', 'H17']) {
    ws.getCell(address).value = { formula: 'E6', result: efektif };
  }

  // Isi profil per jam (SWAP & STOCK). H (total) sudah berupa formula =F+G.
  const hourly = buildHourly(form, opts.hourly);
  for (let i = 0; i < 24; i++) {
    const row = FIRST_HOUR_ROW + i;
    const swap = hourly[i].swap || 0;
    const stok = hourly[i].stok || 0;
    ws.getCell(row, COL_SWAP).value = swap;
    ws.getCell(row, COL_STOK).value = stok;
    // Tulis ulang formula total dengan cached result yang sesuai. Template
    // memakai shared formula dengan cache lama, sehingga preview non-Excel
    // dapat menampilkan angka total yang keliru sebelum recalculation.
    ws.getCell(row, COL_TOTAL).value = {
      formula: `F${row}+G${row}`,
      result: swap + stok,
    };
  }

  // Target Re-Nominasi adalah Average per Day terbaru. Profil jam sudah
  // dikompensasi oleh hourlyProfile agar rata-rata aktual sama dengan nilai ini.
  ws.getCell(AVERAGE_ROW, COL_SWAP).value = form.swapping || 0;
  ws.getCell(AVERAGE_ROW, COL_STOK).value = form.stokLNG || 0;
  ws.getCell(AVERAGE_ROW, COL_TOTAL).value = form.totalNominasi || 0;

  return wb;
}

/** Nama file standar, mengikuti pola contoh. */
function buildFileName(dateObj) {
  const dd = String(dateObj.day).padStart(2, '0');
  const mm = String(dateObj.month + 1).padStart(2, '0');
  const yyyy = dateObj.year;
  return `Form Nominasi Harian IP PLTGU Cilegon (LNG)_${dd}${mm}${yyyy}.xlsx`;
}

/**
 * Hasilkan buffer .xlsx siap dilampirkan ke email.
 * @returns {Promise<{buffer:Buffer, filename:string}>}
 */
async function buildAttachment(form, dateObj, opts = {}) {
  const wb = await buildWorkbook(form, dateObj, opts);
  const buffer = await wb.xlsx.writeBuffer();
  return { buffer: Buffer.from(buffer), filename: buildFileName(dateObj) };
}

module.exports = { buildWorkbook, buildAttachment, buildFileName, TEMPLATE_PATH };
