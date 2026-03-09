import { Env } from '../index';
import { handleFreeCheck } from './free-check';
import { handleDmarcReport } from './dmarc-report';
import { track } from '../telemetry';
import { debug } from '../debug';

// Routes inbound email by recipient address local part:
//   rua@reports.yourdomain.com  → DMARC RUA aggregate report (routed by XML content)
//   {token}@reports.yourdomain.com  → free SPF/DKIM/DMARC check (8-char random token)
export async function handleEmail(
  message: ForwardableEmailMessage,
  env: Env,
  ctx: ExecutionContext
): Promise<void> {
  const to = message.to.toLowerCase();
  const localPart = to.split('@')[0];

  debug(env, 'email.inbound', { to, from: message.from, route: localPart === 'rua' ? 'dmarc-report' : 'free-check' });

  if (localPart === 'rua') {
    track(env, 'report.received'); // fire-and-forget
    await handleDmarcReport(message, env);
  } else {
    track(env, 'check.received'); // fire-and-forget
    await handleFreeCheck(message, env, localPart);
  }
}
