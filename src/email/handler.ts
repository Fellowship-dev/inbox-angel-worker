import { Env } from '../index';
import { handleFreeCheck } from './free-check';
import { handleDmarcReport } from './dmarc-report';

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

  if (localPart === 'rua') {
    // RUA report — customer is resolved from the policy_domain in the XML
    await handleDmarcReport(message, env);
  } else {
    // Session-based check — local part is the 8-char token
    await handleFreeCheck(message, env, localPart);
  }
}
