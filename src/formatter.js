'use strict';

/**
 * Bangun objek form nominasi.
 * @param {{formatted:string}} date
 * @param {{gsa:number|null, swap:number|null, stok:number|null, total:number|null}} cl
 */
function buildForm(date, cl) {
  return {
    date: date.formattedLong || date.formatted,
    unit: 'CL',
    gsa: cl.gsa ?? 0,
    swapping: cl.swap ?? 0,
    stokLNG: cl.stok ?? 0,
    totalNominasi: cl.total ?? 0,
  };
}

/**
 * Teks ringkasan form (untuk log / email / preview).
 */
function formText(form) {
  return [
    `Date          : ${form.date}`,
    `Unit          : ${form.unit}`,
    `GSA           : ${form.gsa}`,
    `Swapping      : ${form.swapping}`,
    `Stok LNG      : ${form.stokLNG}`,
    `Total Nominasi: ${form.totalNominasi}`,
  ].join('\n');
}

/**
 * Balasan sukses untuk WhatsApp.
 * @param {object} form
 * @param {boolean} withSummary  tampilkan ringkasan angka atau tidak
 */
function successReply(form, withSummary = true, kind = 'Re-Nominasi') {
  if (withSummary) {
    return (
      'Baik Pak 🙏\n' +
      `Data CL: ${form.date} | Swap ${form.swapping} | Stok ${form.stokLNG} | Total ${form.totalNominasi}\n` +
      `✅ Data ${kind} berhasil diinput`
    );
  }
  return `Baik Pak, Data ${kind} berhasil diinput 🙏`;
}

module.exports = { buildForm, formText, successReply };
