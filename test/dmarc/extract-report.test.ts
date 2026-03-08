import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { extractReport, ParserError } from '../../src/dmarc/extract-report';

const fixture = (name: string) => readFileSync(join(__dirname, '../fixtures', name));
const fixtureStr = (name: string) => readFileSync(join(__dirname, '../fixtures', name), 'utf-8');

describe('extractReport', () => {
  it('extracts raw XML bytes', () => {
    const bytes = fixture('extract-nice.xml');
    const result = extractReport(new Uint8Array(bytes));
    expect(result).toContain('<feedback>');
  });

  it('extracts gzipped XML', () => {
    const bytes = fixture('extract-nice.xml.gz');
    const result = extractReport(new Uint8Array(bytes));
    expect(result).toContain('<feedback>');
  });

  it('extracts zipped XML', () => {
    const bytes = fixture('extract-nice.xml.zip');
    const result = extractReport(new Uint8Array(bytes));
    expect(result).toContain('<feedback>');
  });

  it('gzip output matches plain XML content', () => {
    const fromXml  = extractReport(new Uint8Array(fixture('extract-nice.xml')));
    const fromGzip = extractReport(new Uint8Array(fixture('extract-nice.xml.gz')));
    const fromZip  = extractReport(new Uint8Array(fixture('extract-nice.xml.zip')));
    expect(fromGzip.trim()).toBe(fromXml.trim());
    expect(fromZip.trim()).toBe(fromXml.trim());
  });

  it('extracts real-world fastmail gzip attachment', () => {
    const bytes = fixture('fastmail.xml.gz');
    const result = extractReport(new Uint8Array(bytes));
    expect(result).toContain('<feedback>');
  });

  it('returns plain XML string as-is', () => {
    const xml = fixtureStr('extract-nice.xml');
    const result = extractReport(xml);
    expect(result).toContain('<feedback>');
  });

  it('decodes base64-encoded zip', () => {
    const bytes = fixture('extract-nice.xml.zip');
    const b64 = Buffer.from(bytes).toString('base64');
    const result = extractReport(b64);
    expect(result).toContain('<feedback>');
  });

  it('decodes base64-encoded gzip', () => {
    const bytes = fixture('extract-nice.xml.gz');
    const b64 = Buffer.from(bytes).toString('base64');
    const result = extractReport(b64);
    expect(result).toContain('<feedback>');
  });

  it('throws ParserError on invalid bytes', () => {
    expect(() => extractReport(new Uint8Array([0x00, 0x01, 0x02, 0x03])))
      .toThrow(ParserError);
  });

  it('accepts ArrayBuffer input', () => {
    const bytes = fixture('extract-nice.xml.gz');
    // Node.js Buffer.buffer may have byteOffset > 0 (shared pool) — slice to get clean ArrayBuffer
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const result = extractReport(ab);
    expect(result).toContain('<feedback>');
  });
});
