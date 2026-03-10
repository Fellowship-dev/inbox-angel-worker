import { Env } from './index';

export function reportsDomain(env: Pick<Env, 'REPORTS_DOMAIN' | 'BASE_DOMAIN'>): string | undefined {
  return env.REPORTS_DOMAIN ?? (env.BASE_DOMAIN ? `reports.${env.BASE_DOMAIN}` : undefined);
}

export function fromEmail(env: Pick<Env, 'FROM_EMAIL' | 'BASE_DOMAIN'>): string | undefined {
  return env.FROM_EMAIL ?? (env.BASE_DOMAIN ? `noreply@reports.${env.BASE_DOMAIN}` : undefined);
}

// Module-level cache — lives for the lifetime of the Worker instance (reused across requests)
let _zoneIdCache: string | undefined;

/**
 * Resolve CLOUDFLARE_ZONE_ID from env, or look it up via CF API using BASE_DOMAIN.
 * Result is cached in-process — only one API call per cold start.
 */
export async function resolveZoneId(
  env: Pick<Env, 'CLOUDFLARE_ZONE_ID' | 'CLOUDFLARE_API_TOKEN' | 'BASE_DOMAIN'>
): Promise<string | undefined> {
  if (env.CLOUDFLARE_ZONE_ID) return env.CLOUDFLARE_ZONE_ID;
  if (_zoneIdCache) return _zoneIdCache;
  if (!env.CLOUDFLARE_API_TOKEN || !env.BASE_DOMAIN) return undefined;

  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(env.BASE_DOMAIN)}`,
      { headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` } }
    );
    const data = await res.json() as { result?: { id: string }[] };
    _zoneIdCache = data.result?.[0]?.id;
    return _zoneIdCache;
  } catch {
    return undefined;
  }
}

/**
 * Return a copy of env with CLOUDFLARE_ZONE_ID resolved.
 * Call once at the top of request/cron handlers.
 */
export async function enrichEnv(env: Env): Promise<Env> {
  if (env.CLOUDFLARE_ZONE_ID) return env;
  const zoneId = await resolveZoneId(env);
  return zoneId ? { ...env, CLOUDFLARE_ZONE_ID: zoneId } : env;
}
