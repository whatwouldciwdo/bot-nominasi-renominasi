import { Icon } from './Icons';

const WA_STATUS = {
  WORKING: { tone: 'success', label: 'Terhubung', pulse: true },
  SCAN_QR_CODE: { tone: 'warning', label: 'Menunggu scan QR' },
  STARTING: { tone: 'info', label: 'Menghubungkan…' },
  STOPPED: { tone: 'neutral', label: 'Berhenti' },
};

export function Header({ waStatus, waError, loading, onRefresh }) {
  const current = waError
    ? { tone: 'danger', label: 'Tidak terjangkau' }
    : WA_STATUS[waStatus?.status] || { tone: 'danger', label: waStatus?.status || 'Memeriksa…' };
  const account = waStatus?.me?.pushName ? ` · ${waStatus.me.pushName}` : '';

  return (
    <header className="header">
      <div className="brand">
        <div className="brand-mark">CL</div>
        <div>
          <h1>Bot Nominasi CL</h1>
          <p>Dashboard performa &amp; monitoring · PLTGU Cilegon</p>
        </div>
      </div>
      <div className="header-actions">
        <div className={`wa-status ${current.tone}`}>
          <span className={`status-dot ${current.pulse ? 'pulse' : ''}`} />
          <span>WhatsApp: {current.label}{account}</span>
        </div>
        <button className="refresh-button" type="button" onClick={onRefresh} disabled={loading}>
          <Icon name="refresh" className={loading ? 'spin' : ''} />
          Muat ulang
        </button>
      </div>
    </header>
  );
}