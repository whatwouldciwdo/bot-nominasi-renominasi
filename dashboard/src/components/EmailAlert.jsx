export function EmailAlert({ stats }) {
  const totalFailed = stats.email.failed + stats.emailFailedEvents;
  if (stats.emailAttempts === 0 && stats.email.skipped > 0) {
    return <div className="alert warning">⚠️ <span>Email dinonaktifkan / dilewati ({stats.email.skipped} nominasi). Aktifkan <code>EMAIL_ENABLED</code> untuk mulai mengirim.</span></div>;
  }
  if (stats.email.partial > 0 || totalFailed > 0) {
    return <div className="alert danger">⚠️ <span>Ada {stats.email.partial} pengiriman SEBAGIAN dan {totalFailed} pengiriman GAGAL. Buka History Email untuk melihat status tiap alamat TO/CC.</span></div>;
  }
  if (stats.emailAttempts > 0) {
    return <div className="alert success">✅ <span>Semua email terkirim ({stats.email.sent}/{stats.emailAttempts}). Tidak ada kegagalan.</span></div>;
  }
  return null;
}