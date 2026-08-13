import { useEffect, useState } from 'react';
import { getEmailDetail } from '../api';
import { formatTime } from '../utils';

function DetailBadge({ status }) {
  return <span className={`badge email-${status || 'unknown'}`}>{status || 'unknown'}</span>;
}

function RecipientList({ email }) {
  const recipients = email.recipients?.length ? email.recipients : [
    ...(email.to || []).map((address) => ({ address, type: 'to', status: 'unknown' })),
    ...(email.cc || []).map((address) => ({ address, type: 'cc', status: 'unknown' })),
  ];
  if (!recipients.length) return <p className="empty">Tidak ada data penerima.</p>;
  return <div className="detail-recipients">{recipients.map((recipient, index) => (
    <article className={`detail-recipient ${recipient.status}`} key={`${recipient.type}-${recipient.address}-${index}`}>
      <span className="recipient-role">{recipient.type}</span>
      <strong>{recipient.address}</strong>
      <span className="recipient-result">{recipient.status === 'accepted' ? '✓ Diterima SMTP' : recipient.status === 'rejected' ? '✕ Ditolak SMTP' : '? Belum diketahui / data lama'}</span>
    </article>
  ))}</div>;
}

export default function EmailDetailPage({ emailId }) {
  const [email, setEmail] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    getEmailDetail(emailId, controller.signal).then(setEmail).catch((requestError) => {
      if (requestError.name !== 'AbortError') setError(requestError.message);
    });
    return () => controller.abort();
  }, [emailId]);

  return <main className="shell detail-shell">
    <nav className="detail-nav"><a href="/dashboard">← Kembali ke Dashboard</a></nav>
    {error && <section className="panel detail-error"><h1>Detail tidak tersedia</h1><p>{error}</p></section>}
    {!email && !error && <section className="panel detail-loading">Memuat detail email…</section>}
    {email && <>
      <header className="detail-heading">
        <div><p>DETAIL PENGIRIMAN EMAIL</p><h1>{email.subject || 'Tanpa subjek'}</h1></div>
        <DetailBadge status={email.status} />
      </header>
      <section className="detail-grid">
        <article className="panel detail-card"><span>Waktu</span><strong>{formatTime(email.timestamp)}</strong></article>
        <article className="panel detail-card"><span>Jenis / Tanggal</span><strong>{email.kind || '-'} · {email.date || '-'}</strong></article>
        <article className="panel detail-card"><span>Pengirim</span><strong>{email.from || '-'}</strong></article>
        <article className="panel detail-card"><span>Message ID</span><strong className="mono wrap">{email.messageId || '-'}</strong></article>
      </section>
      <section className="panel detail-section">
        <div className="panel-title"><h2>Status Penerima TO / CC</h2><p>Hasil yang dilaporkan server SMTP saat transaksi pengiriman</p></div>
        <RecipientList email={email} />
      </section>
      <section className="detail-columns">
        <article className="panel detail-section">
          <div className="panel-title"><h2>Respons SMTP</h2></div>
          <pre>{email.smtpResponse || email.reason || 'Tidak ada respons tambahan.'}</pre>
        </article>
        <article className="panel detail-section">
          <div className="panel-title"><h2>Lampiran</h2></div>
          {email.attachment ? <a className="attachment-link detail-attachment" href={email.attachment.downloadUrl} download>↓ <span>{email.attachment.filename}<small>{email.attachment.size} bytes</small></span></a> : <p className="muted">Lampiran tidak tersedia.</p>}
        </article>
      </section>
      {email.form && <section className="panel detail-section"><div className="panel-title"><h2>Data Nominasi</h2></div><dl className="form-details"><div><dt>Unit</dt><dd>{email.form.unit}</dd></div><div><dt>GSA</dt><dd>{email.form.gsa}</dd></div><div><dt>Swapping</dt><dd>{email.form.swapping}</dd></div><div><dt>Stok LNG</dt><dd>{email.form.stokLNG}</dd></div><div><dt>Total</dt><dd>{email.form.totalNominasi}</dd></div></dl></section>}
    </>}
  </main>;
}