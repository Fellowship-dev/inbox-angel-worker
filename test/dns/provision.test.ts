import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock env-utils — reads from module-level caches that tests never populate
vi.mock('../../src/env-utils', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    getZoneId: vi.fn().mockReturnValue('zone-abc'),
    reportsDomain: vi.fn().mockReturnValue('reports.inboxangel.io'),
  };
});

import { provisionDomain, deprovisionDomain, DnsProvisionError } from '../../src/dns/provision';
import { getZoneId, reportsDomain } from '../../src/env-utils';

const ENV = {
  CLOUDFLARE_API_TOKEN: 'test-token',
  CLOUDFLARE_ZONE_ID: 'zone-abc',
  REPORTS_DOMAIN: 'reports.inboxangel.io',
};

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status })
  ));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(getZoneId).mockReturnValue('zone-abc');
});

// ── provisionDomain ───────────────────────────────────────────

describe('provisionDomain', () => {
  it('returns recordId and recordName on success', async () => {
    mockFetch(200, { success: true, result: { id: 'dns-record-1' } });
    const result = await provisionDomain(ENV, 'acme.com');
    expect(result.recordId).toBe('dns-record-1');
    expect(result.recordName).toBe('acme.com._report._dmarc.reports.inboxangel.io');
  });

  it('POSTs to the correct CF API endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: { id: 'rec-1' } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    await provisionDomain(ENV, 'example.com');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone-abc/dns_records');
    expect(opts.method).toBe('POST');
  });

  it('sends correct TXT record payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: { id: 'rec-1' } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    await provisionDomain(ENV, 'example.com');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.type).toBe('TXT');
    expect(body.name).toBe('example.com._report._dmarc.reports.inboxangel.io');
    expect(body.content).toBe('v=DMARC1;');
  });

  it('includes Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, result: { id: 'r' } }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    await provisionDomain(ENV, 'acme.com');
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-token');
  });

  it('throws DnsProvisionError when CF returns success=false', async () => {
    mockFetch(200, { success: false, errors: [{ message: 'invalid zone' }] });
    await expect(provisionDomain(ENV, 'acme.com')).rejects.toThrow(DnsProvisionError);
  });

  it('includes CF error message in DnsProvisionError', async () => {
    mockFetch(200, { success: false, errors: [{ message: 'invalid zone' }] });
    await expect(provisionDomain(ENV, 'acme.com')).rejects.toThrow('invalid zone');
  });

  it('throws DnsProvisionError when CF returns non-ok status', async () => {
    mockFetch(403, { success: false, errors: [{ message: 'forbidden' }] });
    await expect(provisionDomain(ENV, 'acme.com')).rejects.toThrow(DnsProvisionError);
  });

  it('throws DnsProvisionError when fetch throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(provisionDomain(ENV, 'acme.com')).rejects.toThrow(DnsProvisionError);
    await expect(provisionDomain(ENV, 'acme.com')).rejects.toThrow('DNS provision fetch failed');
  });

  it('returns manual result when CF credentials are not configured', async () => {
    vi.mocked(getZoneId).mockReturnValue(undefined);
    vi.mocked(reportsDomain).mockReturnValue('r.io');
    const bare = { CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ZONE_ID: '', REPORTS_DOMAIN: 'r.io' };
    const result = await provisionDomain(bare, 'acme.com');
    expect(result.manual).toBe(true);
    expect(result.recordId).toBeNull();
    expect(result.recordName).toBe('acme.com._report._dmarc.r.io');
    vi.mocked(reportsDomain).mockReturnValue('reports.inboxangel.io');
  });
});

// ── deprovisionDomain ─────────────────────────────────────────

describe('deprovisionDomain', () => {
  it('DELETEs the correct CF API endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await deprovisionDomain(ENV, 'dns-record-1');
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.cloudflare.com/client/v4/zones/zone-abc/dns_records/dns-record-1');
    expect(opts.method).toBe('DELETE');
  });

  it('resolves without throwing on 404 (idempotent)', async () => {
    mockFetch(404, { success: false, errors: [{ message: 'not found' }] });
    await expect(deprovisionDomain(ENV, 'gone-id')).resolves.toBeUndefined();
  });

  it('resolves without throwing when fetch fails (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await expect(deprovisionDomain(ENV, 'some-id')).resolves.toBeUndefined();
  });

  it('resolves without calling fetch when credentials are not configured', async () => {
    vi.mocked(getZoneId).mockReturnValue(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const bare = { CLOUDFLARE_API_TOKEN: '', CLOUDFLARE_ZONE_ID: '' };
    await deprovisionDomain(bare, 'some-id');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
