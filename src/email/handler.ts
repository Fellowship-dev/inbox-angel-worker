import { Env } from '../index';
import { handleFreeCheck } from './free-check';
import { handleDmarcReport } from './dmarc-report';
import { handleTlsRptReport } from './tls-rpt';
import { track } from '../telemetry';
import { insertEmailInbox, updateEmailInboxStatus, cleanupOldInboxEntries } from '../db/queries';

// Routes inbound email by recipient address local part:
//   rua@reports.yourdomain.com      → DMARC RUA aggregate report (routed by XML content)
//   tls-rpt@reports.yourdomain.com  → TLS-RPT JSON report (RFC 8460)
//   {token}@reports.yourdomain.com  → free SPF/DKIM/DMARC check (8-char random token)
export async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const to = message.to.toLowerCase();
  const from = message.from.toLowerCase();
  const subject = message.headers.get('subject') ?? null;
  const localPart = to.split('@')[0];

  const messageType = localPart === 'rua' ? 'dmarc-rua'
    : localPart === 'tls-rpt' ? 'tls-rpt'
    : 'free-check';

  // Log to email_inbox — best effort, don't block on failure
  let inboxId: number | null = null;
  if (env.DB) {
    try {
      const result = await insertEmailInbox(env.DB, {
        sender: from,
        recipient: to,
        subject,
        message_type: messageType,
        status: 'received',
      });
      inboxId = result.meta?.last_row_id ?? null;
    } catch (e) {
      console.warn('[inbox] failed to insert email_inbox row:', e);
    }
  }

  try {
    if (localPart === 'rua') {
      const dmarcResult = await handleDmarcReport(message, env);
      track(env, { event: 'report.received', failure_count: dmarcResult.failure_count });
      if (inboxId && env.DB) {
        updateEmailInboxStatus(env.DB, inboxId, dmarcResult.status, {
          policy_domain: dmarcResult.policy_domain,
          domain_id: dmarcResult.domain_id,
          report_id: dmarcResult.report_id,
          rejection_reason: dmarcResult.rejection_reason,
          raw_xml: dmarcResult.raw_xml,
          raw_size_bytes: dmarcResult.raw_size_bytes,
        }).catch(() => {});
      }
    } else if (localPart === 'tls-rpt') {
      const { failure_count } = await handleTlsRptReport(message, env);
      track(env, { event: 'tls-rpt.received', failure_count });
      if (inboxId && env.DB) {
        updateEmailInboxStatus(env.DB, inboxId, 'processed').catch(() => {});
      }
    } else {
      const { result } = await handleFreeCheck(message, env, localPart);
      track(env, { event: 'check.received', result });
      if (inboxId && env.DB) {
        updateEmailInboxStatus(env.DB, inboxId, 'processed').catch(() => {});
      }
    }
  } catch (e) {
    if (inboxId && env.DB) {
      const reason = e instanceof Error ? e.message : String(e);
      updateEmailInboxStatus(env.DB, inboxId, 'failed', { rejection_reason: reason }).catch(() => {});
    }
    throw e;
  }

  // Opportunistic cleanup of old inbox entries (>7 days)
  if (env.DB) {
    ctx.waitUntil(cleanupOldInboxEntries(env.DB, 7).catch(() => {}));
  }
}
