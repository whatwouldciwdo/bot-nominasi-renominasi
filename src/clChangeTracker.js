'use strict';

/**
 * Ambil hanya komponen CL yang menentukan apakah nominasi berubah.
 * Total tidak dibandingkan langsung karena merupakan hasil penjumlahan ketiganya.
 */
function snapshotCL(form) {
  if (!form) return null;
  return {
    date: form.date,
    gsa: Number(form.gsa ?? 0),
    swapping: Number(form.swapping ?? 0),
    stokLNG: Number(form.stokLNG ?? 0),
  };
}

function isSameCL(left, right) {
  if (!left || !right) return false;
  return left.date === right.date &&
    left.gsa === right.gsa &&
    left.swapping === right.swapping &&
    left.stokLNG === right.stokLNG;
}

/**
 * Cari data CL sukses terakhir untuk tanggal nominasi yang sama.
 * Entri ignored/error tidak dijadikan baseline karena tidak pernah menjalankan action.
 */
function findLatestSuccessfulCL(entries, date) {
  if (!Array.isArray(entries)) return null;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry && entry.status === 'success' && entry.form && entry.form.date === date) {
      return snapshotCL(entry.form);
    }
  }
  return null;
}

/**
 * Tracker per proses untuk menutup race antara webhook yang datang berdekatan,
 * dengan fallback riwayat log agar baseline tetap ada setelah container restart.
 */
function createCLChangeTracker() {
  const latestByDate = new Map();

  function evaluate(form, previousEntries = []) {
    const current = snapshotCL(form);
    const previous = latestByDate.get(current.date) ||
      findLatestSuccessfulCL(previousEntries, current.date);
    const changed = !previous || !isSameCL(previous, current);

    // Reservasi nilai sebelum proses email/reply yang asynchronous agar webhook
    // berikutnya dengan angka sama tidak ikut menjalankan action secara paralel.
    if (changed) latestByDate.set(current.date, current);

    return {
      changed,
      baseline: !previous,
      previous,
      current,
    };
  }

  return { evaluate };
}

module.exports = {
  snapshotCL,
  isSameCL,
  findLatestSuccessfulCL,
  createCLChangeTracker,
};