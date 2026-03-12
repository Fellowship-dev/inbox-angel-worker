// Tests for email handler inbox logging behavior.
// Mocks all sub-handlers and DB queries to verify the inbox log lifecycle.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Env } from '../../src/index';

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../src/email/dmarc-report', () => ({
  handleDmarcReport: vi.fn(),
}));

vi.mock('../../src/email/tls-rpt', () => ({
  handleTlsRptReport: vi.fn(),
}));

vi.mock('../../src/email/free-check', () => ({
  handleFreeCheck: vi.fn(),
}));

vi.mock('../../src/telemetry', () => ({
  track: vi.fn(),
}));

vi.mock('../../src/db/queries', () => ({
  insertEmailInbox: vi.fn(),
  updateEmailInboxStatus: vi.fn(),
  cleanupOldInboxEntries: vi.fn(),
}));

import { handleEmail } from '../../src/email/handler';
import * as dmarcReportMod from '../../src/email/dmarc-report';
import * as tlsRptMod from '../../src/email/tls-rpt';
import * as freeCheckMod from '../../src/email/free-check';
import * as queriesMod from '../../src/db/queries';

// ── Helpers ───────────────────────────────────────────────────

function makeMessage(to: string, from = 'sender@test.com', subject = 'Test'): ForwardableEmailMessage {
  return {
    from, to,
    headers: new Headers([['subject', subject]]),
    raw: new ReadableStream({ start(c) { c.close(); } }),
    rawSize: 100,
    reply: vi.fn(),
    forward: vi.fn(),
    setReject: vi.fn(),
  } as unknown as ForwardableEmailMessage;
}

function makeEnv(): Env {
  return { DB: {} as D1Database, ASSETS: {} as Fetcher } as Env;
}

function makeCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as unknown as ExecutionContext;
}

// ── Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(queriesMod.insertEmailInbox).mockResolvedValue({
    meta: { last_row_id: 99, changes: 1, changed_db: true, duration: 0, rows_read: 0, rows_written: 1, size_after: 0 },
    success: true,
    results: [],
  });
  vi.mocked(queriesMod.updateEmailInboxStatus).mockResolvedValue({
    meta: { last_row_id: 99, changes: 1, changed_db: true, duration: 0, rows_read: 0, rows_written: 1, size_after: 0 },
    success: true,
    results: [],
  });
  vi.mocked(queriesMod.cleanupOldInboxEntries).mockResolvedValue({
    meta: { last_row_id: 0, changes: 0, changed_db: false, duration: 0, rows_read: 0, rows_written: 0, size_after: 0 },
    success: true,
    results: [],
  });
  vi.mocked(dmarcReportMod.handleDmarcReport).mockResolvedValue({
    failure_count: 0,
    status: 'processed',
    policy_domain: 'acme.com',
    domain_id: 1,
    report_id: 42,
    raw_size_bytes: 100,
    raw_xml: '<xml>data</xml>',
  });
  vi.mocked(tlsRptMod.handleTlsRptReport).mockResolvedValue({ failure_count: 0 });
  vi.mocked(freeCheckMod.handleFreeCheck).mockResolvedValue({ result: 'pass' } as any);
});

afterEach(() => vi.clearAllMocks());

// ── Inbox logging ─────────────────────────────────────────────

describe('handleEmail — inbox logging', () => {
  it('inserts email_inbox row with received status on arrival', async () => {
    const msg = makeMessage('rua@reports.example.com', 'sender@test.com', 'DMARC Report');
    await handleEmail(msg, makeEnv(), makeCtx());

    expect(queriesMod.insertEmailInbox).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sender: 'sender@test.com',
        recipient: 'rua@reports.example.com',
        subject: 'DMARC Report',
        message_type: 'dmarc-rua',
        status: 'received',
      }),
    );
  });

  it('detects message_type dmarc-rua for rua@ recipient', async () => {
    await handleEmail(makeMessage('rua@reports.example.com'), makeEnv(), makeCtx());

    const call = vi.mocked(queriesMod.insertEmailInbox).mock.calls[0];
    expect(call[1].message_type).toBe('dmarc-rua');
  });

  it('detects message_type tls-rpt for tls-rpt@ recipient', async () => {
    await handleEmail(makeMessage('tls-rpt@reports.example.com'), makeEnv(), makeCtx());

    const call = vi.mocked(queriesMod.insertEmailInbox).mock.calls[0];
    expect(call[1].message_type).toBe('tls-rpt');
  });

  it('detects message_type free-check for unknown local part', async () => {
    await handleEmail(makeMessage('abc12345@reports.example.com'), makeEnv(), makeCtx());

    const call = vi.mocked(queriesMod.insertEmailInbox).mock.calls[0];
    expect(call[1].message_type).toBe('free-check');
  });

  it('updates inbox status to processed on DMARC success', async () => {
    vi.mocked(dmarcReportMod.handleDmarcReport).mockResolvedValue({
      failure_count: 0,
      status: 'processed',
      policy_domain: 'acme.com',
      domain_id: 1,
      report_id: 42,
      raw_size_bytes: 200,
      raw_xml: '<xml>report</xml>',
    });

    await handleEmail(makeMessage('rua@reports.example.com'), makeEnv(), makeCtx());

    expect(queriesMod.updateEmailInboxStatus).toHaveBeenCalledWith(
      expect.anything(),
      99,
      'processed',
      expect.objectContaining({
        policy_domain: 'acme.com',
        domain_id: 1,
        report_id: 42,
        raw_size_bytes: 200,
        raw_xml: '<xml>report</xml>',
      }),
    );
  });

  it('updates inbox status to rejected with raw_xml on DMARC rejection', async () => {
    vi.mocked(dmarcReportMod.handleDmarcReport).mockResolvedValue({
      failure_count: 0,
      status: 'rejected',
      rejection_reason: 'Unknown domain foo.com',
      raw_xml: '<xml>data</xml>',
    });

    await handleEmail(makeMessage('rua@reports.example.com'), makeEnv(), makeCtx());

    expect(queriesMod.updateEmailInboxStatus).toHaveBeenCalledWith(
      expect.anything(),
      99,
      'rejected',
      expect.objectContaining({
        rejection_reason: 'Unknown domain foo.com',
        raw_xml: '<xml>data</xml>',
      }),
    );
  });

  it('updates inbox status to failed on unexpected error', async () => {
    vi.mocked(dmarcReportMod.handleDmarcReport).mockRejectedValue(new Error('boom'));

    const msg = makeMessage('rua@reports.example.com');
    await expect(handleEmail(msg, makeEnv(), makeCtx())).rejects.toThrow('boom');

    expect(queriesMod.updateEmailInboxStatus).toHaveBeenCalledWith(
      expect.anything(),
      99,
      'failed',
      expect.objectContaining({ rejection_reason: 'boom' }),
    );
  });

  it('runs cleanup via ctx.waitUntil', async () => {
    const ctx = makeCtx();
    await handleEmail(makeMessage('rua@reports.example.com'), makeEnv(), ctx);

    expect(ctx.waitUntil).toHaveBeenCalled();
  });

  it('does not crash if insertEmailInbox fails', async () => {
    vi.mocked(queriesMod.insertEmailInbox).mockRejectedValue(new Error('D1 down'));

    // Should complete without throwing
    await handleEmail(makeMessage('rua@reports.example.com'), makeEnv(), makeCtx());

    // Handler still called the sub-handler
    expect(dmarcReportMod.handleDmarcReport).toHaveBeenCalled();
  });

  it('does not crash if DB is undefined', async () => {
    const env = { DB: undefined, ASSETS: {} as Fetcher } as Env;

    // Should complete without throwing
    await handleEmail(makeMessage('rua@reports.example.com'), env, makeCtx());

    // insertEmailInbox should NOT be called (no DB)
    expect(queriesMod.insertEmailInbox).not.toHaveBeenCalled();
    // Sub-handler still runs
    expect(dmarcReportMod.handleDmarcReport).toHaveBeenCalled();
  });
});
