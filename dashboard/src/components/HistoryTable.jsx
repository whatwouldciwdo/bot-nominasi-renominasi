import { formatTime } from '../utils';

function Badge({ value, type }) {
  return <span className={`badge ${type}-${value || 'unknown'}`}>{value}</span>;
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return '';
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function LimitFilter({ value, onChange }) {
  return (
    <select value={value} onChange={(event) => onChange('limit', event.target.value)} aria-label="Jumlah riwayat">
      <option value="50">50 terbaru</option>
      <option value="100">100 terbaru</option>
      <option value="250">250 terbaru</option>
    </select>
  );
}

function recipientSummary(item) {
  const recipients = item.recipients || [];
  if (!recipients.length) return `${(item.to?.length || 0) + (item.cc?.length || 0)} penerima · data lama`;
  const accepted = recipients.filter((recipient) => recipient.status === 'accepted').length;
  const rejected = recipients.filter((recipient) => recipient.status === 'rejected').length;
  const unknown = recipients.length - accepted - rejected;
  return `${recipients.length} penerima · ${accepted} diterima · ${rejected} ditolak${unknown ? ` · ${unknown} belum diketahui` : ''}`;
}

export function ReplyHistoryTable({ history, filters, onFilterChange, preview = false }) {
  return (
    <section className="panel history-panel fade-in">
      <div className="history-header">
        <div className="panel-title"><h2>History Balasan Bot</h2><p>Pesan yang dikirim kembali oleh bot melalui WhatsApp</p></div>
        {preview ? <a className="history-link" href="/dashboard/history/replies">History Lengkap →</a> : <div className="filters">
          <select value={filters.replyStatus} onChange={(event) => onFilterChange('replyStatus', event.target.value)} aria-label="Filter status balasan">
            <option value="">Semua status</option><option value="sent">Terkirim</option><option value="failed">Gagal</option>
          </select>
          <LimitFilter value={filters.limit} onChange={onFilterChange} />
        </div>}
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Waktu</th><th>Status</th><th>Chat</th><th>Jenis</th><th>Tanggal</th><th>Isi Balasan</th><th>Keterangan</th></tr></thead>
          <tbody>
            {history.length === 0 ? <tr><td colSpan="7" className="empty-row">Belum ada balasan bot yang tercatat. Entri baru akan muncul di sini.</td></tr> : history.map((item, index) => (
              <tr key={`${item.timestamp}-${index}`}>
                <td className="timestamp">{formatTime(item.timestamp)}</td>
                <td><Badge value={item.status} type="status" /></td>
                <td className="mono">{item.chatId || '-'}</td>
                <td>{item.kind || '-'}</td>
                <td>{item.date || '-'}</td>
                <td className="message-cell"><span className="message-preview" title={item.text || ''}>{item.text || '-'}</span></td>
                <td className={item.reason ? 'error-text' : 'muted'}>{item.reason || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function EmailHistoryTable({ history, filters, onFilterChange, preview = false }) {
  return (
    <section className="panel history-panel fade-in">
      <div className="history-header">
        <div className="panel-title"><h2>History Email & Lampiran</h2><p>Detail pengiriman email nominasi dan file Excel yang dilampirkan</p></div>
        {preview ? <a className="history-link" href="/dashboard/history/emails">History Lengkap →</a> : <div className="filters">
          <select value={filters.emailStatus} onChange={(event) => onFilterChange('emailStatus', event.target.value)} aria-label="Filter status email">
            <option value="">Semua status</option><option value="sent">Terkirim semua</option><option value="partial">Sebagian</option><option value="failed">Gagal</option><option value="skipped">Dilewati</option>
          </select>
          <LimitFilter value={filters.limit} onChange={onFilterChange} />
        </div>}
      </div>
      <div className="table-scroll">
        <table>
          <thead><tr><th>Waktu</th><th>Status</th><th>Tanggal</th><th>Ringkasan Penerima</th><th>Subjek</th><th>File Lampiran</th><th>Aksi</th></tr></thead>
          <tbody>
            {history.length === 0 ? <tr><td colSpan="7" className="empty-row">Belum ada history email. Entri lama mungkin belum memiliki metadata detail.</td></tr> : history.map((item, index) => (
              <tr key={`${item.timestamp}-${item.messageId || index}`}>
                <td className="timestamp">{formatTime(item.timestamp)}</td>
                <td><Badge value={item.status} type="email" /></td>
                <td>{item.date || '-'}</td>
                <td className="recipient-summary">{recipientSummary(item)}</td>
                <td className="subject-cell" title={item.subject || ''}>{item.subject || <span className="muted">Data lama</span>}</td>
                <td>
                  {item.attachment ? (
                    <a className="attachment-link" href={item.attachment.downloadUrl} download>
                      <span>↓</span><span>{item.attachment.filename}<small>{formatBytes(item.attachment.size)}</small></span>
                    </a>
                  ) : <span className="muted">Tidak tersedia</span>}
                </td>
                <td><a className="detail-link" href={`/dashboard/email/${item.id}`}>Lihat Detail →</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}