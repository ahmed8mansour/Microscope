import { describe, expect, it } from 'vitest';
import { isKnownBot } from '@/features/analytics/domain/bot';
import { parseAttribution } from '@/features/analytics/domain/attribution';
import { getOrCreateSessionId, ANALYTICS_SESSION_COOKIE } from '@/features/analytics/domain/session';

describe('isKnownBot (research R9)', () => {
  it('flags common bot/crawler user agents', () => {
    expect(isKnownBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true);
    expect(isKnownBot('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe(true);
    expect(isKnownBot('facebookexternalhit/1.1')).toBe(true);
    expect(isKnownBot('curl/8.4.0')).toBe(true);
    expect(isKnownBot('python-requests/2.31.0')).toBe(true);
  });

  it('does not flag ordinary browser user agents', () => {
    expect(
      isKnownBot(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
      )
    ).toBe(false);
    expect(
      isKnownBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')
    ).toBe(false);
  });

  it('treats a missing User-Agent as a bot (real browsers always send one)', () => {
    expect(isKnownBot(null)).toBe(true);
    expect(isKnownBot(undefined)).toBe(true);
    expect(isKnownBot('')).toBe(true);
  });
});

describe('parseAttribution — coarse, PII-free (FR-031)', () => {
  it('extracts the referrer host only, never the full URL', () => {
    const attribution = parseAttribution(
      'https://www.google.com/search?q=field+microscope&secret=personal-data',
      'http://localhost:3000/'
    );
    expect(attribution.referrer).toBe('www.google.com');
    expect(attribution.source).toBe('google');
    // The query string (which could carry identifying data) never appears.
    expect(JSON.stringify(attribution)).not.toContain('secret');
    expect(JSON.stringify(attribution)).not.toContain('personal-data');
  });

  it('prefers utm_source over referrer-derived source', () => {
    const attribution = parseAttribution(
      'https://www.google.com/',
      'http://localhost:3000/?utm_source=newsletter&utm_campaign=spring-sale'
    );
    expect(attribution.source).toBe('newsletter');
    expect(attribution.campaign).toBe('spring-sale');
  });

  it('falls back to "direct" with no referrer and no UTM params', () => {
    const attribution = parseAttribution(null, 'http://localhost:3000/');
    expect(attribution.source).toBe('direct');
    expect(attribution.referrer).toBeNull();
    expect(attribution.campaign).toBeNull();
  });

  it('handles a malformed referrer gracefully', () => {
    const attribution = parseAttribution('not-a-valid-url', 'http://localhost:3000/');
    expect(attribution.referrer).toBeNull();
    expect(attribution.source).toBe('direct');
  });
});

describe('getOrCreateSessionId', () => {
  it('reuses an existing a_sid cookie', () => {
    const req = new Request('http://localhost/api/analytics/event', {
      headers: { cookie: `${ANALYTICS_SESSION_COOKIE}=existing-session-123` },
    });
    const result = getOrCreateSessionId(req);
    expect(result.sessionId).toBe('existing-session-123');
    expect(result.isNew).toBe(false);
  });

  it('generates a new session id when no cookie is present', () => {
    const req = new Request('http://localhost/api/analytics/event');
    const result = getOrCreateSessionId(req);
    expect(result.sessionId).toBeTruthy();
    expect(result.isNew).toBe(true);
  });

  it('generates distinct session ids across calls with no cookie', () => {
    const a = getOrCreateSessionId(new Request('http://localhost/api/analytics/event'));
    const b = getOrCreateSessionId(new Request('http://localhost/api/analytics/event'));
    expect(a.sessionId).not.toBe(b.sessionId);
  });
});
