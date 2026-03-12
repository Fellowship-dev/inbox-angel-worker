/** Known email provider registry — SPF includes + DKIM selectors */
export interface EmailProvider {
  include: string;              // SPF include domain (empty string for DKIM-only providers)
  name: string;                 // Human-readable name
  dkimSelectors?: string[];     // DKIM selector prefixes (part before ._domainkey)
  dkimGuideUrl?: string;        // Link to provider's DKIM setup docs
}

// Keep the old name as alias for existing code
export type SpfProvider = EmailProvider;

export const SPF_PROVIDERS: EmailProvider[] = [
  { include: '_spf.google.com', name: 'Google Workspace', dkimSelectors: ['google'], dkimGuideUrl: 'https://support.google.com/a/answer/174124' },
  { include: 'spf.protection.outlook.com', name: 'Microsoft 365', dkimSelectors: ['selector1', 'selector2'], dkimGuideUrl: 'https://learn.microsoft.com/en-us/microsoft-365/security/office-365-security/email-authentication-dkim-configure' },
  { include: 'sendgrid.net', name: 'SendGrid', dkimSelectors: ['smtpapi', 's1', 's2'], dkimGuideUrl: 'https://docs.sendgrid.com/ui/account-and-settings/dkim-records' },
  { include: 'amazonses.com', name: 'Amazon SES', dkimSelectors: [], dkimGuideUrl: 'https://docs.aws.amazon.com/ses/latest/dg/send-email-authentication-dkim.html' },
  { include: 'mailgun.org', name: 'Mailgun', dkimSelectors: ['smtp', 'mailo', 'k1'], dkimGuideUrl: 'https://documentation.mailgun.com/docs/mailgun/user-manual/get-started/#verify-your-domain' },
  { include: 'mandrillapp.com', name: 'Mandrill (Mailchimp)', dkimSelectors: ['mandrill'], dkimGuideUrl: 'https://mailchimp.com/developer/transactional/docs/authentication-delivery/#authentication' },
  { include: 'servers.mcsv.net', name: 'Mailchimp', dkimSelectors: ['k1'], dkimGuideUrl: 'https://mailchimp.com/help/set-up-email-domain-authentication/' },
  { include: 'spf.brevo.com', name: 'Brevo', dkimSelectors: ['mail'], dkimGuideUrl: 'https://help.brevo.com/hc/en-us/articles/12163873383186' },
  { include: 'mailjet.com', name: 'Mailjet', dkimSelectors: ['mailjet'], dkimGuideUrl: 'https://documentation.mailjet.com/hc/en-us/articles/360042412734' },
  { include: 'spf.postmarkapp.com', name: 'Postmark', dkimSelectors: ['pm'], dkimGuideUrl: 'https://postmarkapp.com/support/article/1002-getting-started-with-postmark#dkim' },
  { include: 'resend.com', name: 'Resend', dkimSelectors: ['resend'], dkimGuideUrl: 'https://resend.com/docs/dashboard/domains/introduction' },
  { include: '_spf.protonmail.ch', name: 'Proton Mail', dkimSelectors: ['protonmail', 'protonmail2', 'protonmail3'], dkimGuideUrl: 'https://proton.me/support/anti-spoofing-custom-domain' },
  { include: 'hubspot.net', name: 'HubSpot', dkimSelectors: ['hs1', 'hs2'], dkimGuideUrl: 'https://knowledge.hubspot.com/marketing-email/connect-your-email-sending-domain' },
  { include: 'mail.zendesk.com', name: 'Zendesk', dkimSelectors: ['zendesk1', 'zendesk2'], dkimGuideUrl: 'https://support.zendesk.com/hc/en-us/articles/4408882165530' },
  { include: 'zoho.com', name: 'Zoho Mail', dkimSelectors: ['zoho'], dkimGuideUrl: 'https://www.zoho.com/mail/help/adminconsole/dkim-configuration.html' },
  { include: 'mxroute.com', name: 'MXRoute', dkimSelectors: ['x'], dkimGuideUrl: 'https://mxroutedocs.com/dns/dkim/' },
];

/** DKIM-only providers — no SPF include, but have known DKIM selectors */
export const DKIM_ONLY_PROVIDERS: EmailProvider[] = [
  { include: '', name: 'Fastmail', dkimSelectors: ['fm1', 'fm2', 'fm3'], dkimGuideUrl: 'https://www.fastmail.help/hc/en-us/articles/360060591153' },
];

/** All providers with DKIM selectors (SPF + DKIM-only) */
const ALL_DKIM_PROVIDERS: EmailProvider[] = [
  ...SPF_PROVIDERS.filter(p => p.dkimSelectors && p.dkimSelectors.length > 0),
  ...DKIM_ONLY_PROVIDERS,
];

/** Extract the selector prefix from a full DKIM name (strips ._domainkey and any trailing domain) */
function extractSelector(selectorName: string): string {
  // Handle: "google._domainkey.example.com", "google._domainkey", or just "google"
  const idx = selectorName.indexOf('._domainkey');
  return (idx >= 0 ? selectorName.slice(0, idx) : selectorName).toLowerCase();
}

/**
 * Match a DKIM selector name to a known provider.
 * Input can be FQDN (e.g. "google._domainkey.example.com"), partial ("google._domainkey"), or just the prefix ("google").
 */
export function matchDkimProvider(selectorName: string): EmailProvider | null {
  const selector = extractSelector(selectorName);
  return ALL_DKIM_PROVIDERS.find(p => p.dkimSelectors?.some(s => s.toLowerCase() === selector)) ?? null;
}

/**
 * Find SPF providers that have no matching DKIM selector detected.
 * Returns providers present in SPF but missing from the detected selectors.
 */
export function findUnsignedSpfProviders(
  detectedSelectors: { name: string; record: string }[],
  spfRecord: string | null,
): EmailProvider[] {
  if (!spfRecord) return [];
  const spfProviders = detectProviders(spfRecord);
  const detectedNames = new Set(detectedSelectors.map(s => extractSelector(s.name)));

  return spfProviders.filter(p => {
    if (!p.dkimSelectors || p.dkimSelectors.length === 0) return true; // No known selectors — can't verify
    return !p.dkimSelectors.some(sel => detectedNames.has(sel.toLowerCase()));
  });
}

/**
 * Get deduplicated list of all known DKIM selector prefixes.
 * Used by the backend to know which selectors to probe via DoH.
 */
export function getAllDkimSelectors(): string[] {
  const all = new Set<string>();
  for (const p of [...SPF_PROVIDERS, ...DKIM_ONLY_PROVIDERS]) {
    for (const sel of p.dkimSelectors ?? []) all.add(sel);
  }
  // Also include generic selectors that aren't tied to any specific ESP
  for (const generic of ['default', 'dkim', 'mail']) all.add(generic);
  return [...all];
}

/** Detect which known providers are present in an SPF record string */
export function detectProviders(spfRecord: string): EmailProvider[] {
  return SPF_PROVIDERS.filter(p => spfRecord.includes(`include:${p.include}`));
}

/** Extract all include: mechanisms from an SPF record (including unknown ones) */
export function extractIncludes(spfRecord: string): string[] {
  const matches = spfRecord.match(/include:([^\s]+)/g) ?? [];
  return matches.map(m => m.replace('include:', ''));
}

/** Extract non-include mechanisms from an SPF record (mx, a, ip4:, ip6:, redirect=, etc.) */
export function extractOtherMechanisms(spfRecord: string): string[] {
  return spfRecord.split(/\s+/).filter(part =>
    part !== 'v=spf1' &&
    !part.startsWith('include:') &&
    !part.match(/^[~+?-]?all$/)
  );
}

/** Build an SPF record from includes + other mechanisms */
export function buildSpfRecord(includes: string[], qualifier: '~all' | '-all' = '~all', otherMechanisms: string[] = []): string {
  const parts = ['v=spf1', ...includes.map(i => `include:${i}`), ...otherMechanisms, qualifier];
  return parts.join(' ');
}
