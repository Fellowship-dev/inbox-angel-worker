const getKey = () => localStorage.getItem('ia_api_key') ?? '';

async function apiFetch(path: string): Promise<Response> {
  return fetch(path, {
    headers: { 'X-Api-Key': getKey() },
  });
}

export async function getDomains(): Promise<{ domains: import('./types').Domain[] }> {
  const res = await apiFetch('/api/domains');
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function getDomainStats(id: number, days = 7): Promise<import('./types').DomainStats> {
  const res = await apiFetch(`/api/domains/${id}/stats?days=${days}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function getDomainSources(id: number, days = 7): Promise<{ sources: import('./types').FailingSource[] }> {
  const res = await apiFetch(`/api/domains/${id}/sources?days=${days}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}
