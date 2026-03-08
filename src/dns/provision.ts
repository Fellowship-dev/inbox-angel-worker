// Cloudflare DNS provisioning for per-customer DMARC authorization records.
//
// RFC 7489 §7.1: when the rua= address is on a different domain than the
// policy domain, the reporting domain MUST publish a DNS TXT record to
// authorize receipt of reports:
//
//   {customer-domain}._report._dmarc.{reports-domain}  TXT  "v=DMARC1;"
//
// Example: customer adds acme.com, our reports domain is reports.inboxangel.io
//   → create: acme.com._report._dmarc.reports.inboxangel.io  TXT  "v=DMARC1;"
//
// We manage this record via Cloudflare DNS API. The CF record ID is stored in
// domains.dns_record_id so we can delete it when the customer removes the domain.

const CF_API = 'https://api.cloudflare.com/client/v4';

export class DnsProvisionError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DnsProvisionError';
  }
}

export interface DnsProvisionResult {
  recordId: string | null;  // Cloudflare DNS record ID (null in manual mode)
  recordName: string;       // Full DNS name that was created
  manual: boolean;          // true = CF creds absent, user must add DNS record manually
}

interface ProvisionEnv {
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ZONE_ID: string;
  REPORTS_DOMAIN: string;  // e.g. "reports.inboxangel.io"
}

interface DeprovisionEnv {
  CLOUDFLARE_API_TOKEN: string;
  CLOUDFLARE_ZONE_ID: string;
}

function cfHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Creates the cross-domain DMARC authorization TXT record for a customer domain.
 * Call this when a customer adds a domain to their account.
 */
export async function provisionDomain(
  env: ProvisionEnv,
  customerDomain: string,
): Promise<DnsProvisionResult> {
  // RFC 7489 §7.1 cross-domain authorization record name
  const recordName = `${customerDomain}._report._dmarc.${env.REPORTS_DOMAIN}`;

  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    // Manual mode — caller must add the DNS record themselves
    return { recordId: null, recordName, manual: true };
  }

  const body = {
    type: 'TXT',
    name: recordName,
    content: 'v=DMARC1;',
    ttl: 3600,
    comment: `InboxAngel DMARC auth for ${customerDomain}`,
  };

  let res: Response;
  try {
    res = await fetch(`${CF_API}/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records`, {
      method: 'POST',
      headers: cfHeaders(env.CLOUDFLARE_API_TOKEN),
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new DnsProvisionError(`DNS provision fetch failed: ${String(e)}`, e);
  }

  const data = await res.json() as { success: boolean; result?: { id: string }; errors?: { message: string }[] };

  if (!data.success || !data.result?.id) {
    const msg = data.errors?.map(e => e.message).join(', ') ?? 'unknown error';
    throw new DnsProvisionError(`Cloudflare rejected DNS record creation: ${msg}`);
  }

  return { recordId: data.result.id, recordName, manual: false };
}

/**
 * Deletes the cross-domain DMARC authorization record.
 * Call this when a customer removes a domain. Idempotent — 404 is silently ignored.
 */
export async function deprovisionDomain(
  env: DeprovisionEnv,
  recordId: string,
): Promise<void> {
  if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ZONE_ID) {
    // If CF creds aren't configured, there's nothing to clean up
    return;
  }

  let res: Response;
  try {
    res = await fetch(`${CF_API}/zones/${env.CLOUDFLARE_ZONE_ID}/dns_records/${recordId}`, {
      method: 'DELETE',
      headers: cfHeaders(env.CLOUDFLARE_API_TOKEN),
    });
  } catch (e) {
    // Network failure — log but don't throw; domain delete should still succeed
    console.warn(`deprovisionDomain: fetch failed for record ${recordId}:`, e);
    return;
  }

  // 404 = already gone (idempotent)
  if (!res.ok && res.status !== 404) {
    console.warn(`deprovisionDomain: unexpected status ${res.status} for record ${recordId}`);
  }
}
