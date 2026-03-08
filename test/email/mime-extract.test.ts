import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import {
  readStream,
  extractAttachmentBytes,
  MimeExtractError,
} from '../../src/email/mime-extract';

// ── Helpers ───────────────────────────────────────────────────

const FIXTURES = join(__dirname, '../fixtures');

function fixture(name: string): Buffer {
  return readFileSync(join(FIXTURES, name));
}

function makeStream(...chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
      }
      controller.close();
    },
  });
}

function toBase64(buf: Buffer | Uint8Array): string {
  return Buffer.from(buf).toString('base64');
}

// Build a MIME stream with given top-level headers + body
function makeMime(headers: Record<string, string>, body: string): ReadableStream<Uint8Array> {
  const headerLines = [
    'MIME-Version: 1.0',
    ...Object.entries(headers).map(([k, v]) => `${k}: ${v}`),
  ];
  return makeStream(headerLines.join('\r\n') + '\r\n\r\n' + body);
}

// Build a multipart MIME stream
function makeMultipart(
  boundary: string,
  parts: Array<{ headers: Record<string, string>; body: string }>,
): ReadableStream<Uint8Array> {
  const lines: string[] = ['MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, ''];
  for (const part of parts) {
    lines.push(`--${boundary}`);
    for (const [k, v] of Object.entries(part.headers)) lines.push(`${k}: ${v}`);
    lines.push('');
    lines.push(part.body);
  }
  lines.push(`--${boundary}--`);
  return makeStream(lines.join('\r\n'));
}

// ── readStream ────────────────────────────────────────────────

describe('readStream', () => {
  it('reads a single-chunk stream', async () => {
    const stream = makeStream('hello world');
    const bytes = await readStream(stream);
    expect(new TextDecoder().decode(bytes)).toBe('hello world');
  });

  it('concatenates multiple chunks', async () => {
    const stream = makeStream('foo', 'bar', 'baz');
    const bytes = await readStream(stream);
    expect(new TextDecoder().decode(bytes)).toBe('foobarbaz');
  });

  it('returns empty Uint8Array for empty stream', async () => {
    const stream = makeStream();
    const bytes = await readStream(stream);
    expect(bytes.length).toBe(0);
  });

  it('handles Uint8Array chunks', async () => {
    const buf = new Uint8Array([1, 2, 3]);
    const stream = makeStream(buf);
    const result = await readStream(stream);
    expect(result).toEqual(buf);
  });
});

// ── extractAttachmentBytes — single-part ──────────────────────

describe('extractAttachmentBytes — single-part', () => {
  it('returns decoded bytes from base64 gzip single-part email', async () => {
    const gzBytes = fixture('extract-nice.xml.gz');
    const b64 = toBase64(gzBytes);

    const stream = makeMime(
      { 'Content-Type': 'application/gzip', 'Content-Transfer-Encoding': 'base64' },
      b64,
    );

    const result = await extractAttachmentBytes(stream);
    // Should be raw gz bytes — first two bytes are gzip magic
    expect(result[0]).toBe(0x1f);
    expect(result[1]).toBe(0x8b);
  });

  it('returns decoded bytes from base64 zip single-part email', async () => {
    const zipBytes = fixture('extract-nice.xml.zip');
    const b64 = toBase64(zipBytes);

    const stream = makeMime(
      { 'Content-Type': 'application/zip', 'Content-Transfer-Encoding': 'base64' },
      b64,
    );

    const result = await extractAttachmentBytes(stream);
    // ZIP magic: PK\x03\x04
    expect(result[0]).toBe(0x50); // P
    expect(result[1]).toBe(0x4b); // K
  });

  it('returns UTF-8 bytes from a plain text/xml single-part email', async () => {
    const xml = fixture('simple.xml').toString('utf-8');

    const stream = makeMime(
      { 'Content-Type': 'text/xml; charset=UTF-8' },
      xml,
    );

    const result = await extractAttachmentBytes(stream);
    const decoded = new TextDecoder().decode(result);
    expect(decoded).toContain('<?xml');
    expect(decoded).toContain('<feedback>');
  });

  it('handles base64 with line breaks (RFC 2045 folded)', async () => {
    const gzBytes = fixture('extract-nice.xml.gz');
    // Fold base64 at 76 chars as per RFC 2045
    const raw = toBase64(gzBytes);
    const folded = raw.match(/.{1,76}/g)!.join('\r\n');

    const stream = makeMime(
      { 'Content-Type': 'application/gzip', 'Content-Transfer-Encoding': 'base64' },
      folded,
    );

    const result = await extractAttachmentBytes(stream);
    expect(result[0]).toBe(0x1f);
    expect(result[1]).toBe(0x8b);
    expect(result.length).toBe(gzBytes.length);
  });

  it('throws MimeExtractError if no blank line separating headers from body', async () => {
    const stream = makeStream('Content-Type: application/xml\r\nno-blank-line-here');
    await expect(extractAttachmentBytes(stream)).rejects.toThrow(MimeExtractError);
  });
});

// ── extractAttachmentBytes — multipart ───────────────────────

describe('extractAttachmentBytes — multipart', () => {
  it('extracts a base64 gz attachment from multipart/mixed', async () => {
    const gzBytes = fixture('extract-nice.xml.gz');
    const b64 = toBase64(gzBytes);

    const stream = makeMultipart('boundary_abc', [
      {
        headers: { 'Content-Type': 'text/plain' },
        body: 'Please find the DMARC report attached.',
      },
      {
        headers: {
          'Content-Type': 'application/gzip; name="report.xml.gz"',
          'Content-Transfer-Encoding': 'base64',
          'Content-Disposition': 'attachment; filename="report.xml.gz"',
        },
        body: b64,
      },
    ]);

    const result = await extractAttachmentBytes(stream);
    expect(result[0]).toBe(0x1f);
    expect(result[1]).toBe(0x8b);
    expect(result.length).toBe(gzBytes.length);
  });

  it('extracts a base64 zip attachment from multipart/mixed', async () => {
    const zipBytes = fixture('extract-nice.xml.zip');
    const b64 = toBase64(zipBytes);

    const stream = makeMultipart('===boundary===', [
      {
        headers: { 'Content-Type': 'text/plain' },
        body: 'DMARC aggregate report',
      },
      {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Transfer-Encoding': 'base64',
        },
        body: b64,
      },
    ]);

    const result = await extractAttachmentBytes(stream);
    expect(result[0]).toBe(0x50); // P
    expect(result[1]).toBe(0x4b); // K
  });

  it('falls back to filename hint when Content-Type is application/octet-stream', async () => {
    const gzBytes = fixture('fastmail.xml.gz');
    const b64 = toBase64(gzBytes);

    const stream = makeMultipart('bnd1', [
      {
        headers: { 'Content-Type': 'text/plain' },
        body: 'body',
      },
      {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Transfer-Encoding': 'base64',
          'Content-Disposition': 'attachment; filename="dmarc-report.xml.gz"',
        },
        body: b64,
      },
    ]);

    const result = await extractAttachmentBytes(stream);
    expect(result[0]).toBe(0x1f);
    expect(result[1]).toBe(0x8b);
  });

  it('picks the first DMARC part when multiple attachments present', async () => {
    const gzBytes = fixture('extract-nice.xml.gz');
    const b64 = toBase64(gzBytes);

    const stream = makeMultipart('bnd2', [
      {
        headers: { 'Content-Type': 'text/plain' },
        body: 'text part',
      },
      {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Transfer-Encoding': 'base64',
        },
        body: b64, // first gz — should win
      },
      {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Transfer-Encoding': 'base64',
        },
        body: toBase64(fixture('extract-nice.xml.zip')),
      },
    ]);

    const result = await extractAttachmentBytes(stream);
    // First gz part returned
    expect(result[0]).toBe(0x1f);
    expect(result[1]).toBe(0x8b);
    expect(result.length).toBe(gzBytes.length);
  });

  it('throws MimeExtractError when multipart has no DMARC attachment', async () => {
    const makeParts = () => makeMultipart('bnd3', [
      { headers: { 'Content-Type': 'text/plain' }, body: 'hello' },
      { headers: { 'Content-Type': 'text/html' }, body: '<p>hello</p>' },
    ]);
    await expect(extractAttachmentBytes(makeParts())).rejects.toThrow(MimeExtractError);
    await expect(extractAttachmentBytes(makeParts())).rejects.toThrow('No DMARC attachment');
  });

  it('throws MimeExtractError when multipart boundary is missing from header', async () => {
    const stream = makeStream(
      'MIME-Version: 1.0\r\nContent-Type: multipart/mixed\r\n\r\n--bnd\r\n\r\nbody',
    );
    await expect(extractAttachmentBytes(stream)).rejects.toThrow('boundary not found');
  });

  it('handles boundary with special regex characters', async () => {
    const gzBytes = fixture('extract-nice.xml.gz');
    const stream = makeMultipart('----=_Part.1+2/3', [
      {
        headers: {
          'Content-Type': 'application/gzip',
          'Content-Transfer-Encoding': 'base64',
        },
        body: toBase64(gzBytes),
      },
    ]);
    const result = await extractAttachmentBytes(stream);
    expect(result[0]).toBe(0x1f);
  });

  it('handles folded Content-Type header with boundary on continuation line', async () => {
    const gzBytes = fixture('extract-nice.xml.gz');
    const b64 = toBase64(gzBytes);

    // Manually construct a MIME with folded top-level header
    const raw = [
      'MIME-Version: 1.0',
      'Content-Type: multipart/mixed;',
      '\tboundary="fold_bnd"',  // folded continuation
      '',
      '--fold_bnd',
      'Content-Type: application/gzip',
      'Content-Transfer-Encoding: base64',
      '',
      b64,
      '--fold_bnd--',
    ].join('\r\n');

    const result = await extractAttachmentBytes(makeStream(raw));
    expect(result[0]).toBe(0x1f);
    expect(result[1]).toBe(0x8b);
  });
});
