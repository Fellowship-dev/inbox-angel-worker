// Optional anonymous telemetry — disabled by default.
// Set TELEMETRY_ENABLED=true to send anonymous usage events to InboxAngel.
//
// What is collected:
//   - Event type (e.g. "domain.add", "check.created", "report.received")
//   - Worker version
//   - A stable anonymous ID: SHA-256(account_id + worker_name), truncated to 16 hex chars
//     This is a one-way hash — it cannot be reversed to identify your instance.
//   - Timestamp
//
// What is NOT collected: domain names, email addresses, IP addresses, report contents.
//
// To opt out permanently: set TELEMETRY_ENABLED=false (or leave it unset — default is off).

import type { Env } from './index';
import { version } from '../package.json';

const TELEMETRY_URL = 'https://telemetry.inboxangel.io/v1/events';

async function anonymousId(env: Env): Promise<string> {
  const raw = `${env.CLOUDFLARE_ACCOUNT_ID ?? ''}:${env.WORKER_NAME ?? 'inbox-angel-worker'}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export async function track(env: Env, event: string): Promise<void> {
  if (!env.TELEMETRY_ENABLED || env.TELEMETRY_ENABLED === 'false') return;

  try {
    const id = await anonymousId(env);
    await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, version, id, ts: Math.floor(Date.now() / 1000) }),
    });
  } catch {
    // telemetry must never throw or affect the main flow
  }
}
