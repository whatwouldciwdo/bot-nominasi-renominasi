import { Icon } from './Icons';
import { formatUptime } from '../utils';

function StatCard({ label, value, hint, tone, icon }) {
  return (
    <article className="panel stat-card fade-in">
      <div className="stat-heading">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}><Icon name={icon} /></span>
      </div>
      <strong>{value}</strong>
      <p>{hint}</p>
    </article>
  );
}

export function StatCards({ stats, meta }) {
  const cards = [
    { label: 'Nominasi Diproses', value: stats.processed, hint: `${stats.success} sukses · ${stats.error} gagal`, tone: 'blue', icon: 'processed' },
    { label: 'Success Rate', value: `${stats.successRate}%`, hint: 'dari nominasi diproses', tone: 'green', icon: 'rate' },
    { label: 'Email Terkirim Semua', value: stats.email.sent, hint: `${stats.email.partial} sebagian · ${stats.email.failed} gagal · ${stats.email.skipped} dilewati`, tone: 'amber', icon: 'email' },
    { label: 'Uptime Bot', value: formatUptime(meta?.uptime), hint: `${stats.duplicate} duplikat diabaikan`, tone: 'slate', icon: 'duplicate' },
  ];

  return <section className="stats-grid">{cards.map((card) => <StatCard key={card.label} {...card} />)}</section>;
}