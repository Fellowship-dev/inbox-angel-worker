// Handles inbound DMARC aggregate report emails.
// Triggered for any address other than check-*@reports.yourdomain.com.
// Flow: extract bytes → parse XML → resolve domain by policy_domain → store in D1.
//
// Routing is by report content (policy_published.domain), not by the recipient address.
// This lets self-hosters use a fixed rua=mailto:rua@reports.yourdomain.com for all domains.

import { Env } from '../index';
import { extractAttachmentBytes, MimeExtractError } from './mime-extract';
import { resolveDomain } from './resolve-domain';
import { parseDmarcEmail, ParseEmailError } from '../dmarc/parse-email';
import { extractReport } from '../dmarc/extract-report';
import { storeReport } from '../dmarc/store-report';

export interface DmarcReportResult {
  failure_count: number;
  status: 'processed' | 'rejected' | 'failed';
  rejection_reason?: string;
  policy_domain?: string;
  domain_id?: number;
  report_id?: number;
  raw_size_bytes?: number;
  raw_xml?: string;
}

export async function handleDmarcReport(
  message: ForwardableEmailMessage,
  env: Env,
): Promise<DmarcReportResult> {
  // 1. Extract attachment bytes from raw MIME stream
  let bytes: Uint8Array;
  try {
    bytes = await extractAttachmentBytes(message.raw);
  } catch (err) {
    const reason = err instanceof MimeExtractError
      ? `Could not extract attachment: ${err.message}`
      : 'Unexpected error reading email';
    console.error('dmarc-report: mime extraction failed', err);
    message.setReject(reason);
    return { failure_count: 0, status: 'rejected', rejection_reason: reason };
  }

  const rawSizeBytes = bytes.byteLength;

  // 2. Parse the DMARC XML — needed to determine which domain this report is for
  // Also extract decompressed XML for storage (works for gz/zip/plain XML)
  let report;
  let rawXml: string | undefined;
  try {
    report = await parseDmarcEmail(bytes, false, env.DB);
    try {
      rawXml = extractReport(bytes);
    } catch {
      // extractReport failed but parse succeeded — rawXml stays undefined
    }
  } catch (err) {
    // Best-effort: try to get the XML even on parse failure
    try { rawXml = extractReport(bytes); } catch {}
    const reason = err instanceof ParseEmailError
      ? `Invalid DMARC report: ${err.message}`
      : 'Unexpected error parsing DMARC report';
    console.error('dmarc-report: parse failed', err);
    message.setReject(reason);
    return { failure_count: 0, status: 'rejected', rejection_reason: reason, raw_size_bytes: rawSizeBytes, raw_xml: rawXml };
  }

  // 3. Resolve domain from the policy_domain in the report
  const policyDomain = report.policy_published.domain;
  const domain = await resolveDomain(env.DB, policyDomain);
  if (!domain) {
    const reason = `Unknown domain ${policyDomain} — not a registered InboxAngel inbox`;
    console.warn('dmarc-report: no domain found for policy_domain', policyDomain);
    message.setReject(reason);
    return { failure_count: 0, status: 'rejected', rejection_reason: reason, policy_domain: policyDomain, raw_size_bytes: rawSizeBytes, raw_xml: rawXml };
  }

  const failureCount = report.records.reduce((sum, r) => sum + (r.count ?? 0) * (r.policy_evaluated?.dkim === 'fail' || r.policy_evaluated?.spf === 'fail' ? 1 : 0), 0);

  // 4. Store in D1 (dedup handled by INSERT OR IGNORE inside storeReport)
  try {
    const result = await storeReport(env.DB, domain.id, report, rawXml, { DB: env.DB, SEND_EMAIL: env.SEND_EMAIL, WORKER_NAME: env.WORKER_NAME });
    if (result.stored) {
      console.log(
        `dmarc-report: stored report ${report.report_metadata.report_id} ` +
        `for ${domain.domain} (id=${result.reportId}, records=${report.records.length})`
      );
    } else {
      console.log(
        `dmarc-report: duplicate report ${report.report_metadata.report_id} ` +
        `for ${domain.domain} — skipped`
      );
    }
    return {
      failure_count: failureCount,
      status: 'processed',
      policy_domain: policyDomain,
      domain_id: domain.id,
      report_id: result.reportId,
      raw_size_bytes: rawSizeBytes,
      raw_xml: rawXml,
    };
  } catch (err) {
    // Log but don't reject — email was valid, just a storage failure
    console.error('dmarc-report: D1 storage failed for', domain.domain, err);
    return {
      failure_count: failureCount,
      status: 'failed',
      rejection_reason: err instanceof Error ? err.message : 'D1 storage failed',
      policy_domain: policyDomain,
      domain_id: domain.id,
      raw_size_bytes: rawSizeBytes,
      raw_xml: rawXml,
    };
  }
}
