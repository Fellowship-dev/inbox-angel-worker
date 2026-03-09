// Ensures Cloudflare Email Routing is configured for REPORTS_DOMAIN.
// Called automatically on first domain add — idempotent, safe to call multiple times.
//
// What it does:
//   1. Checks if catch-all email routing rule already exists — skips if so
//   2. Enables Email Routing on the zone
//   3. Clones apex MX records to REPORTS_DOMAIN subdomain
//   4. Sets catch-all rule: *@REPORTS_DOMAIN → this Worker
//
// Requires: CLOUDFLARE_API_TOKEN (DNS:Edit + Email Routing Rules:Edit), CLOUDFLARE_ZONE_ID

import type { Env } from '../index';

type CfResult<T> = { success: boolean; result: T; errors: { message: string }[] };

async function cfFetch<T>(token: string, zoneId: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json() as CfResult<T>;
  if (!data.success) throw new Error(data.errors.map(e => e.message).join(', '));
  return data.result;
}

interface EmailRule {
  enabled: boolean;
  actions: { type: string; value?: string[] }[];
  matchers: { type: string }[];
}

interface DnsRecord {
  name: string;
  content: string;
  priority: number;
}

export async function ensureEmailRouting(env: Env): Promise<void> {
  const token = env.CLOUDFLARE_API_TOKEN;
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  const domain = env.REPORTS_DOMAIN;
  const workerName = env.WORKER_NAME ?? 'inbox-angel-worker';

  if (!token || !zoneId || !domain) {
    console.log('[setup] missing CF credentials — skipping email routing setup');
    return;
  }

  // Step 1: Skip if catch-all rule already points to a worker
  try {
    const catchAll = await cfFetch<EmailRule>(token, zoneId, 'GET', '/email/routing/rules/catch_all');
    if (catchAll?.enabled && catchAll.actions.some(a => a.type === 'worker')) {
      console.log('[setup] email routing already configured — skipping');
      return;
    }
  } catch {
    // catch_all rule doesn't exist yet — continue with setup
  }

  // Step 2: Enable Email Routing on the zone
  await cfFetch(token, zoneId, 'PUT', '/email/routing/enable');
  console.log('[setup] email routing enabled');

  // Step 3: Clone apex MX records to REPORTS_DOMAIN subdomain
  const allMx = await cfFetch<DnsRecord[]>(token, zoneId, 'GET', '/dns/records?type=MX');
  const apex = domain.split('.').slice(-2).join('.');
  const apexMx = allMx.filter(r => r.name === apex);

  if (apexMx.length === 0) {
    console.warn('[setup] no apex MX records found — Email Routing may still be initialising, retry by adding another domain');
    return;
  }

  const existingMx = await cfFetch<DnsRecord[]>(token, zoneId, 'GET', `/dns/records?type=MX&name=${domain}`);
  if (existingMx.length === 0) {
    const subdomain = domain.split('.')[0];
    for (const mx of apexMx) {
      await cfFetch(token, zoneId, 'POST', '/dns/records', {
        type: 'MX', name: subdomain, content: mx.content, priority: mx.priority, ttl: 1,
      });
    }
    console.log(`[setup] MX records added for ${domain}`);
  }

  // Step 4: Set catch-all rule → this Worker
  await cfFetch(token, zoneId, 'PUT', '/email/routing/rules/catch_all', {
    actions: [{ type: 'worker', value: [workerName] }],
    enabled: true,
    matchers: [{ type: 'all' }],
    name: `catch-all → ${workerName}`,
  });
  console.log(`[setup] catch-all rule set → ${workerName}`);
}
