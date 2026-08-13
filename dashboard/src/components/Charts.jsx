import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';
import { formatDay } from '../utils';

function useChart(config) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    chartRef.current?.destroy();
    chartRef.current = new Chart(canvasRef.current, config);
    return () => chartRef.current?.destroy();
  }, [config]);

  return canvasRef;
}

export function TrendChart({ series }) {
  const makeDataset = (label, values, color) => ({
    label, data: values, borderColor: color, backgroundColor: `${color}22`,
    tension: 0.35, fill: true, borderWidth: 2, pointRadius: 2, pointHoverRadius: 4,
  });
  const config = {
    type: 'line',
    data: {
      labels: series.map((item) => formatDay(item.date)),
      datasets: [
        makeDataset('Sukses', series.map((item) => item.success), '#34d399'),
        makeDataset('Gagal', series.map((item) => item.error), '#fb7185'),
        makeDataset('Diabaikan', series.map((item) => item.ignored), '#94a3b8'),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1, padding: 10 } },
      scales: {
        x: { grid: { color: 'rgba(148,163,184,.08)' }, ticks: { color: '#64748b', font: { size: 10 } } },
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.08)' }, ticks: { color: '#64748b', precision: 0, font: { size: 10 } } },
      },
    },
  };
  const ref = useChart(config);
  return <canvas ref={ref} />;
}

const EMAIL_COLORS = { sent: '#34d399', partial: '#f59e0b', skipped: '#94a3b8', failed: '#fb7185' };

export function EmailChart({ breakdown }) {
  const config = {
    type: 'doughnut',
    data: {
      labels: breakdown.map((item) => item.label),
      datasets: [{
        data: breakdown.map((item) => item.value),
        backgroundColor: breakdown.map((item) => EMAIL_COLORS[item.key]),
        borderColor: '#0f172a', borderWidth: 3, hoverOffset: 6,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: { legend: { display: false }, tooltip: { backgroundColor: '#0f172a', borderColor: '#334155', borderWidth: 1 } },
    },
  };
  const ref = useChart(config);
  const total = breakdown.reduce((sum, item) => sum + item.value, 0);

  return (
    <>
      <div className="email-chart"><canvas ref={ref} /></div>
      <div className="email-legend">
        {total === 0 ? <p className="empty">Belum ada aktivitas email.</p> : breakdown.map((item) => (
          <div key={item.key}>
            <span><i style={{ backgroundColor: EMAIL_COLORS[item.key] }} />{item.label}</span>
            <strong>{item.value} <small>({Math.round((item.value / total) * 100)}%)</small></strong>
          </div>
        ))}
      </div>
    </>
  );
}

export function Charts({ series, emailBreakdown }) {
  return (
    <section className="charts-grid">
      <article className="panel trend-panel fade-in">
        <div className="panel-title chart-title">
          <div><h2>Tren Aktivitas</h2><p>Nominasi diproses per hari</p></div>
          <div className="chart-keys"><span><i className="green" />Sukses</span><span><i className="red" />Gagal</span><span><i className="gray" />Diabaikan</span></div>
        </div>
        <div className="trend-chart"><TrendChart series={series} /></div>
      </article>
      <article className="panel email-panel fade-in">
        <div className="panel-title"><h2>Status Email</h2><p>Distribusi pengiriman</p></div>
        <EmailChart breakdown={emailBreakdown} />
      </article>
    </section>
  );
}