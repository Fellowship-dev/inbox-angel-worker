// Optional anonymous telemetry — disabled by default.
// Set TELEMETRY_ENABLED=true to send anonymous usage events to InboxAngel.
//
// What is collected:
//   - Event type and typed properties (counts, statuses, version)
//   - Worker version
//   - A stable anonymous ID: SHA-256(account_id + worker_name), truncated to 16 hex chars
//     This is a one-way hash — it cannot be reversed to identify your instance.
//   - Timestamp (unix seconds)
//
// What is NOT collected: domain names, email addresses, IP addresses, report contents.
//
// To opt out permanently: set TELEMETRY_ENABLED=false (or leave it unset — default is off).

import type { Env } from './index';
import { version } from '../package.json';

const TELEMETRY_URL = 'https://telemetry.inboxangel.io/v1/events';

// Typed event properties — keeps the payload intentional and auditable.
export type TelemetryProps =
  | { event: 'instance.born' }
  | { event: 'instance.heartbeat';
      domain_count: number;
      dns_verified_count: number;
      spf_flatten_count: number;
      mta_sts_testing_count: number;
      mta_sts_enforce_count: number;
      reports_30d: number;
      tls_reports_30d: number;
      team_member_count: number;
      instance_age_days: number;
    }
  | { event: 'domain.add' }
  | { event: 'domain.dns_verified' }
  | { event: 'domain.dmarc_mode_change'; from: string; to: string }
  | { event: 'domain.remove' }
  | { event: 'spf_flatten.enable' }
  | { event: 'spf_flatten.disable' }
  | { event: 'mta_sts.enable' }
  | { event: 'mta_sts.mode_change'; from: string; to: string }
  | { event: 'mta_sts.disable' }
  | { event: 'check.created' }
  | { event: 'check.received'; result: 'protected' | 'at_risk' | 'exposed' | string }
  | { event: 'report.received'; failure_count: number }
  | { event: 'tls-rpt.received'; failure_count: number };

async function anonymousId(env: Env): Promise<string> {
  const raw = `${env.CLOUDFLARE_ACCOUNT_ID ?? ''}:${env.WORKER_NAME ?? 'inbox-angel-worker'}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

export async function track(env: Env, props: TelemetryProps): Promise<void> {
  if (!env.TELEMETRY_ENABLED || env.TELEMETRY_ENABLED === 'false') return;

  try {
    const id = await anonymousId(env);
    const { event, ...rest } = props;
    await fetch(TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, version, id, ts: Math.floor(Date.now() / 1000), ...rest }),
    });
  } catch {
    // telemetry must never throw or affect the main flow
  }
}
