// Optional verbose logging — disabled by default.
// Set DEBUG=true to enable detailed logs in Cloudflare Workers Logs.
//
// Logs are written to console.log only. They appear in:
//   - `wrangler dev` terminal output (local development)
//   - Cloudflare Workers Logs tab (production, requires observability enabled)
//
// No logs are sent to any external service. This is purely local/CF-native output.
// To view production logs: Cloudflare dashboard → Workers → your worker → Logs.

import type { Env } from './index';

export function debug(env: Env, context: string, data: Record<string, unknown>): void {
  if (env.DEBUG !== 'true') return;
  console.log(`[debug] ${context}`, JSON.stringify(data));
}
