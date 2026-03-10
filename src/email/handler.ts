import { Env } from '../index';
import { handleFreeCheck } from './free-check';
import { handleDmarcReport } from './dmarc-report';
import { handleTlsRptReport } from './tls-rpt';
import { track } from '../telemetry';
import { debug } from '../debug';

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
  const localPart = to.split('@')[0];

  debug(env, 'email.inbound', { to, from: message.from, route: localPart === 'rua' ? 'dmarc-report' : localPart === 'tls-rpt' ? 'tls-rpt' : 'free-check' });

  if (localPart === 'rua') {
    track(env, 'report.received'); // fire-and-forget
    await handleDmarcReport(message, env);
  } else if (localPart === 'tls-rpt') {
    track(env, 'tls-rpt.received'); // fire-and-forget
    await handleTlsRptReport(message, env);
  } else {
    track(env, 'check.received'); // fire-and-forget
    await handleFreeCheck(message, env, localPart);
  }
}
