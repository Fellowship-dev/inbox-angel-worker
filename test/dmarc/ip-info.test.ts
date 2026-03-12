import { describe, it, expect } from 'vitest';
import { friendlyOrg } from '../../src/dmarc/ip-info';

describe('friendlyOrg', () => {
  it('returns null for null input', () => {
    expect(friendlyOrg(null)).toBeNull();
  });

  it('maps MICROSOFT-CORP-MSN-AS-BLOCK to Microsoft', () => {
    expect(friendlyOrg('MICROSOFT-CORP-MSN-AS-BLOCK')).toBe('Microsoft');
  });

  it('maps GOOGLE-CLOUD-PLATFORM to Google', () => {
    expect(friendlyOrg('GOOGLE-CLOUD-PLATFORM')).toBe('Google');
  });

  it('is case-insensitive', () => {
    expect(friendlyOrg('Google Cloud Platform')).toBe('Google');
    expect(friendlyOrg('amazon.com Inc.')).toBe('Amazon');
  });

  it('passes through unknown org strings', () => {
    expect(friendlyOrg('SOME-RANDOM-ISP')).toBe('SOME-RANDOM-ISP');
  });

  it('maps Sendinblue to Brevo (rebrand)', () => {
    expect(friendlyOrg('SENDINBLUE-AS')).toBe('Brevo');
  });
});
