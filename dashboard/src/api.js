async function getJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
  return body;
}

export function getDashboard({ limit, replyStatus, emailStatus }, signal) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (replyStatus) query.set('replyStatus', replyStatus);
  if (emailStatus) query.set('emailStatus', emailStatus);
  return getJson(`/api/dashboard?${query}`, signal);
}

export function getWahaStatus(signal) {
  return getJson('/api/waha-status', signal);
}

export function getEmailDetail(id, signal) {
  return getJson(`/api/email-history/${encodeURIComponent(id)}`, signal);
}

export function getSettings(signal) {
  return getJson('/api/settings', signal);
}

export function saveSettings(settings) {
  return requestJson('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}