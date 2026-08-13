export function formatTime(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('id-ID', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

export function formatDay(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
  });
}

export function formatUptime(seconds) {
  const value = Math.floor(seconds || 0);
  const days = Math.floor(value / 86400);
  const hours = Math.floor((value % 86400) / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  if (days) return `${days}h ${hours}j`;
  if (hours) return `${hours}j ${minutes}m`;
  return `${minutes}m`;
}