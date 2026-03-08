import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { parseDmarcEmail, ParseEmailError } from '../../src/dmarc/parse-email';

const FIXTURES = join(__dirname, '../fixtures');
const OFFLINE = true;

function fixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

function textBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ── Round-trip: bytes → AggregateReport ──────────────────────

describe('parseDmarcEmail — round-trip', () => {
  it('parses raw XML bytes', async () => {
    const xml = readFileSync(join(FIXTURES, 'simple.xml'), 'utf-8');
    const bytes = textBytes(xml);
    const report = await parseDmarcEmail(bytes, OFFLINE);

    expect(report.report_metadata.org_name).toBe('example.net');
    expect(report.report_metadata.report_id).toBe('b043f0e264cf4ea995e93765242f6dfb');
    expect(report.policy_published.domain).toBe('example.com');
    expect(report.records).toHaveLength(1);
  });

  it('parses gzip bytes', async () => {
    const report = await parseDmarcEmail(fixture('extract-nice.xml.gz'), OFFLINE);
    expect(report.report_metadata.org_name).toBe('google.com');
    expect(report.records.length).toBeGreaterThan(0);
  });

  it('parses zip bytes', async () => {
    const report = await parseDmarcEmail(fixture('extract-nice.xml.zip'), OFFLINE);
    expect(report.report_metadata.org_name).toBe('google.com');
    expect(report.records.length).toBeGreaterThan(0);
  });

  it('parses fastmail gzip fixture', async () => {
    const report = await parseDmarcEmail(fixture('fastmail.xml.gz'), OFFLINE);
    // org_name is the raw XML value, normalised to lowercase
    expect(report.report_metadata.org_name.toLowerCase()).toContain('fastmail');
    expect(report.records.length).toBeGreaterThan(0);
  });

  it('parses outlook XML (with schema tag)', async () => {
    const xml = readFileSync(join(FIXTURES, 'outlook.xml'), 'utf-8');
    const report = await parseDmarcEmail(textBytes(xml), OFFLINE);
    expect(report.report_metadata.org_name).toBe('outlook.com');
  });

  it('parses report with empty reason — policy_override_reasons is empty or has empty entry', async () => {
    const xml = readFileSync(join(FIXTURES, 'empty-reason.xml'), 'utf-8');
    const report = await parseDmarcEmail(textBytes(xml), OFFLINE);
    // The reason element is present but has empty type — parser may produce [] or [{type:'',comment:null}]
    const reasons = report.records[0].policy_evaluated.policy_override_reasons;
    expect(Array.isArray(reasons)).toBe(true);
  });

  it('parses report with upper-cased "PASS" values', async () => {
    const xml = readFileSync(join(FIXTURES, 'upper-cased-pass.xml'), 'utf-8');
    const report = await parseDmarcEmail(textBytes(xml), OFFLINE);
    // parsedmarc normalises PASS→pass, NONE→none
    expect(report.records[0].policy_evaluated.dkim).toBe('pass');
    expect(report.records[0].policy_evaluated.spf).toBe('pass');
  });

  it('returns correct record structure (source, count, policy_evaluated, auth_results, identifiers)', async () => {
    const xml = readFileSync(join(FIXTURES, 'simple.xml'), 'utf-8');
    const report = await parseDmarcEmail(textBytes(xml), OFFLINE);
    const rec = report.records[0];

    // source is an IpInfo object containing the IP address
    expect(rec).toHaveProperty('source');
    expect(rec.source).toHaveProperty('ip');
    expect(rec).toHaveProperty('count');
    expect(rec).toHaveProperty('policy_evaluated');
    expect(rec).toHaveProperty('auth_results');
    expect(rec).toHaveProperty('identifiers');
  });

  it('gzip and zip of the same report produce identical output', async () => {
    const fromGz  = await parseDmarcEmail(fixture('extract-nice.xml.gz'),  OFFLINE);
    const fromZip = await parseDmarcEmail(fixture('extract-nice.xml.zip'), OFFLINE);

    expect(fromGz.report_metadata.report_id).toBe(fromZip.report_metadata.report_id);
    expect(fromGz.records.length).toBe(fromZip.records.length);
  });
});

// ── Error handling ────────────────────────────────────────────

describe('parseDmarcEmail — errors', () => {
  it('throws ParseEmailError for random binary garbage', async () => {
    const garbage = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01, 0x02]);
    await expect(parseDmarcEmail(garbage, OFFLINE)).rejects.toThrow(ParseEmailError);
    await expect(parseDmarcEmail(garbage, OFFLINE)).rejects.toThrow('extract XML');
  });

  it('throws ParseEmailError for empty bytes', async () => {
    await expect(parseDmarcEmail(new Uint8Array(0), OFFLINE)).rejects.toThrow(ParseEmailError);
  });

  it('throws ParseEmailError for valid XML that is not a DMARC report', async () => {
    const xml = textBytes('<?xml version="1.0"?><root><not-dmarc>true</not-dmarc></root>');
    await expect(parseDmarcEmail(xml, OFFLINE)).rejects.toThrow(ParseEmailError);
    await expect(parseDmarcEmail(xml, OFFLINE)).rejects.toThrow('Invalid DMARC');
  });

  it('throws ParseEmailError for malformed XML', async () => {
    const xml = textBytes('<?xml version="1.0"?><feedback><unclosed>');
    await expect(parseDmarcEmail(xml, OFFLINE)).rejects.toThrow(ParseEmailError);
  });

  it('error includes original cause', async () => {
    const garbage = new Uint8Array([0xde, 0xad]);
    try {
      await parseDmarcEmail(garbage, OFFLINE);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ParseEmailError);
      expect((err as ParseEmailError).cause).toBeDefined();
    }
  });

  it('error name is ParseEmailError', async () => {
    const garbage = new Uint8Array([0xde, 0xad]);
    try {
      await parseDmarcEmail(garbage, OFFLINE);
    } catch (err) {
      expect((err as Error).name).toBe('ParseEmailError');
    }
  });
});
