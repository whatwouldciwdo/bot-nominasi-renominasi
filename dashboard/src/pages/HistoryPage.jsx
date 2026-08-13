import { useCallback, useEffect, useState } from 'react';
import { getDashboard } from '../api';
import { EmailHistoryTable, ReplyHistoryTable } from '../components/HistoryTable';
import { formatTime } from '../utils';

const PAGE_CONFIG = {
  replies: {
    title: 'History Balasan Bot',
    description: 'Seluruh pesan yang dikirim kembali oleh bot melalui WhatsApp.',
  },
  emails: {
    title: 'History Email & Lampiran',
    description: 'Seluruh aktivitas pengiriman email nominasi beserta file Excel.',
  },
};

export default function HistoryPage({ type }) {
  const config = PAGE_CONFIG[type];
  const [filters, setFilters] = useState({ replyStatus: '', emailStatus: '', limit: '100' });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      setData(await getDashboard(filters, signal));
      setError('');
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setError(requestError.message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const changeFilter = (name, value) => setFilters((current) => ({ ...current, [name]: value }));

  return <main className="shell history-page-shell">
    <nav className="detail-nav"><a href="/dashboard">← Kembali ke Dashboard</a></nav>
    <header className="history-page-heading">
      <div><p>ARSIP AKTIVITAS BOT</p><h1>{config.title}</h1><span>{config.description}</span></div>
      <button className="refresh-button" type="button" disabled={loading} onClick={() => load()}>{loading ? 'Memuat…' : 'Muat Ulang'}</button>
    </header>
    <p className={`updated ${error ? 'load-error' : ''}`}>{error ? `Gagal memuat data: ${error}` : data ? `Diperbarui ${formatTime(data.meta?.now)}` : 'Memuat history…'}</p>
    {data && (type === 'replies'
      ? <ReplyHistoryTable history={data.replyHistory || []} filters={filters} onFilterChange={changeFilter} />
      : <EmailHistoryTable history={data.emailHistory || []} filters={filters} onFilterChange={changeFilter} />)}
    <footer>bot-cilegon · {config.title}</footer>
  </main>;
}