import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_SECRET = process.env.ADMIN_SESSION_SECRET;

describe('admin session token (sign/verify, idle + absolute expiry)', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADMIN_SESSION_SECRET = 'test-secret-do-not-use-in-prod';
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.ADMIN_SESSION_SECRET = ORIGINAL_SECRET;
  });

  it('issues a token that verifies as valid immediately', async () => {
    const { issueSession, verifySession } = await import('@/lib/auth/session');
    const token = await issueSession();
    const result = await verifySession(token);
    expect(result.valid).toBe(true);
    expect(result.refreshedToken).toBeTruthy();
  });

  it('rejects a missing token', async () => {
    const { verifySession } = await import('@/lib/auth/session');
    expect((await verifySession(undefined)).valid).toBe(false);
    expect((await verifySession(null)).valid).toBe(false);
    expect((await verifySession('')).valid).toBe(false);
  });

  it('rejects a malformed token', async () => {
    const { verifySession } = await import('@/lib/auth/session');
    expect((await verifySession('not-a-real-token')).valid).toBe(false);
    expect((await verifySession('a.b.c')).valid).toBe(false);
  });

  it('rejects a tampered payload (signature no longer matches)', async () => {
    const { issueSession, verifySession } = await import('@/lib/auth/session');
    const token = await issueSession();
    const [payload, signature] = token.split('.');
    // Flip the payload while keeping the original signature.
    const tampered = `${payload}AA.${signature}`;
    expect((await verifySession(tampered)).valid).toBe(false);
  });

  it('rejects a token signed with a different secret', async () => {
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { issueSession } = await import('@/lib/auth/session');
    const token = await issueSession();

    vi.resetModules();
    process.env.ADMIN_SESSION_SECRET = 'a-different-secret';
    const { verifySession } = await import('@/lib/auth/session');
    expect((await verifySession(token)).valid).toBe(false);
  });

  it('stays valid just under the 30-minute idle window, and refreshes lastSeen', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { issueSession, verifySession } = await import('@/lib/auth/session');
    const token = await issueSession();

    vi.setSystemTime(new Date('2026-01-01T00:29:59Z'));
    const result = await verifySession(token);
    expect(result.valid).toBe(true);
    expect(result.refreshedToken).toBeTruthy();
    expect(result.refreshedToken).not.toBe(token);
  });

  it('rejects a token idle for more than 30 minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { issueSession, verifySession } = await import('@/lib/auth/session');
    const token = await issueSession();

    vi.setSystemTime(new Date('2026-01-01T00:30:01Z'));
    expect((await verifySession(token)).valid).toBe(false);
  });

  it('idle refresh does not push the absolute 12-hour cap', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { issueSession, verifySession } = await import('@/lib/auth/session');
    let token = await issueSession();

    // Refresh every 20 minutes (under idle, keeps lastSeen fresh) for just
    // under 12 hours — the absolute cap must still bite based on the
    // original `iat`, not the repeatedly-refreshed `lastSeen`.
    for (let minutes = 20; minutes < 12 * 60; minutes += 20) {
      vi.setSystemTime(new Date(Date.now() + 20 * 60_000));
      const result = await verifySession(token);
      expect(result.valid).toBe(true);
      token = result.refreshedToken!;
    }

    vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + 12 * 60 * 60_000 + 1000);
    expect((await verifySession(token)).valid).toBe(false);
  });

  it('rejects a token past the 12-hour absolute cap even if recently active', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const { issueSession, verifySession } = await import('@/lib/auth/session');
    const token = await issueSession();

    vi.setSystemTime(new Date('2026-01-01T12:00:01Z'));
    expect((await verifySession(token)).valid).toBe(false);
  });
});
