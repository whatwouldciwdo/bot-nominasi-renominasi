import { useCallback, useEffect, useState } from 'react';
import { getDashboard, getWahaStatus } from './api';
import { Header } from './components/Header';
import { StatCards } from './components/StatCards';
import { EmailAlert } from './components/EmailAlert';
import { Charts } from './components/Charts';
import { EmailHistoryTable, ReplyHistoryTable } from './components/HistoryTable';
import { SettingsPanel } from './components/SettingsPanel';
import { formatTime } from './utils';

export default function App() {
  const [filters] = useState({ replyStatus: '', emailStatus: '', limit: '5' });
  const [data, setData] = useState(null);
  const [waStatus, setWaStatus] = useState(null);
  const [error, setError] = useState('');
  const [waError, setWaError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadDashboard = useCallback(async (signal) => {
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

  const loadWa = useCallback(async (signal) => {
    try {
      setWaStatus(await getWahaStatus(signal));
      setWaError(false);
    } catch (requestError) {
      if (requestError.name !== 'AbortError') setWaError(true);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);
    const timer = setInterval(() => loadDashboard(controller.signal), 30000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [loadDashboard, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    loadWa(controller.signal);
    const timer = setInterval(() => loadWa(controller.signal), 15000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [loadWa, refreshKey]);

  const refresh = () => setRefreshKey((value) => value + 1);
  return (
    <main className="shell">
      <Header waStatus={waStatus} waError={waError} loading={loading} onRefresh={refresh} />
      <p className={`updated ${error ? 'load-error' : ''}`}>
        {error ? `Gagal memuat data: ${error}` : data
          ? `Aktivitas terakhir: ${formatTime(data.stats.lastTimestamp)} · ${data.stats.total} entri log · diperbarui ${formatTime(data.meta?.now)}`
          : 'Memuat data…'}
      </p>
      {data && <>
        <EmailAlert stats={data.stats} />
        <StatCards stats={data.stats} meta={data.meta} />
        <Charts series={data.timeseries || []} emailBreakdown={data.emailBreakdown || []} />
        <div className="history-sections">
          <ReplyHistoryTable history={data.replyHistory || []} preview />
          <EmailHistoryTable history={data.emailHistory || []} preview />
        </div>
      </>}
      <SettingsPanel />
      <footer>bot-cilegon · Vite + React · auto-refresh tiap 30 detik</footer>
    </main>
  );
}