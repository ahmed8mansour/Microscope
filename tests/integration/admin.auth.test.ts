import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const hasAdminEnv = Boolean(ADMIN_PASSWORD) && Boolean(process.env.ADMIN_SESSION_SECRET);

describe.skipIf(!hasDb || !hasAdminEnv)('Admin auth — login, lockout, gate, logout, expiry', () => {
  let db: typeof import('@/lib/db').db;
  let adminAuthAttempts: typeof import('@/lib/db/schema').adminAuthAttempts;
  let loginPOST: typeof import('@/app/api/admin/login/route').POST;
  let logoutPOST: typeof import('@/app/api/admin/logout/route').POST;
  let metricsGET: typeof import('@/app/api/admin/metrics/route').GET;
  let middleware: typeof import('@/proxy').proxy;
  let issueSession: typeof import('@/lib/auth').issueSession;
  const usedIps: string[] = [];

  beforeAll(async () => {
    ({ db } = await import('@/lib/db'));
    ({ adminAuthAttempts } = await import('@/lib/db/schema'));
    ({ POST: loginPOST } = await import('@/app/api/admin/login/route'));
    ({ POST: logoutPOST } = await import('@/app/api/admin/logout/route'));
    ({ GET: metricsGET } = await import('@/app/api/admin/metrics/route'));
    ({ proxy: middleware } = await import('@/proxy'));
    ({ issueSession } = await import('@/lib/auth'));
  });

  afterAll(async () => {
    if (!hasDb || usedIps.length === 0) return;
    const { inArray } = await import('drizzle-orm');
    await db.delete(adminAuthAttempts).where(inArray(adminAuthAttempts.ip, usedIps));
  });

  function nextIp(label: string): string {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}-${label}`;
    usedIps.push(ip);
    return ip;
  }

  function loginReq(password: string, ip: string) {
    return new Request('http://localhost/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ password }),
    });
  }

  it('rejects an incorrect password with 401', async () => {
    const res = await loginPOST(loginReq('definitely-wrong', nextIp('bad')));
    expect(res.status).toBe(401);
  });

  it('accepts the correct password, returns 200, and sets the session cookie', async () => {
    const res = await loginPOST(loginReq(ADMIN_PASSWORD!, nextIp('ok')));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/^admin_session=/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
  });

  it('locks the source out after 5 failed attempts within the window', async () => {
    const ip = nextIp('lockout');
    for (let i = 0; i < 5; i++) {
      const res = await loginPOST(loginReq('wrong-again', ip));
      expect(res.status).toBe(401);
    }
    // 6th attempt (even with the CORRECT password) is rejected as locked —
    // the gate never reveals closeness by letting a correct password
    // through mid-lockout.
    const locked = await loginPOST(loginReq(ADMIN_PASSWORD!, ip));
    expect(locked.status).toBe(429);
  });

  it('rejects malformed login bodies with 400', async () => {
    const res = await loginPOST(
      new Request('http://localhost/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': nextIp('malformed') },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
  });

  it('logout always returns 200 and clears the cookie (Max-Age=0)', async () => {
    const res = await logoutPOST();
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });

  describe('protected route guard (handler-level re-verify)', () => {
    it('rejects a request with no session cookie', async () => {
      const res = await metricsGET(new Request('http://localhost/api/admin/metrics'));
      expect(res.status).toBe(401);
    });

    it('rejects a request with a garbage cookie', async () => {
      const res = await metricsGET(
        new Request('http://localhost/api/admin/metrics', {
          headers: { cookie: 'admin_session=not-a-real-token' },
        })
      );
      expect(res.status).toBe(401);
    });

    it('accepts a request with a freshly issued valid session', async () => {
      const token = await issueSession();
      const res = await metricsGET(
        new Request('http://localhost/api/admin/metrics', {
          headers: { cookie: `admin_session=${token}` },
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty('totalOrders');
      expect(body).toHaveProperty('paymentsByStatus');
      expect(body).toHaveProperty('revenue');
      expect(body).toHaveProperty('conversionRate');
    });
  });

  describe('middleware gate', () => {
    async function callMiddleware(url: string, cookie?: string) {
      const { NextRequest } = await import('next/server');
      const req = new NextRequest(url, {
        headers: cookie ? { cookie } : undefined,
      });
      return middleware(req);
    }

    it('redirects an unauthenticated admin page request to /admin/login with a next param', async () => {
      const res = await callMiddleware('http://localhost/admin/orders');
      expect(res.status).toBe(307);
      const location = res.headers.get('location');
      expect(location).toContain('/admin/login');
      expect(location).toContain('next=%2Fadmin%2Forders');
    });

    it('returns 401 JSON for an unauthenticated admin API request', async () => {
      const res = await callMiddleware('http://localhost/api/admin/orders');
      expect(res.status).toBe(401);
    });

    it('allows the login page through without a session', async () => {
      const res = await callMiddleware('http://localhost/admin/login');
      expect(res.status).toBe(200); // NextResponse.next() reports 200
    });

    it('allows a request with a valid session through and refreshes the cookie', async () => {
      const token = await issueSession();
      const res = await callMiddleware('http://localhost/admin/orders', `admin_session=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('set-cookie')).toMatch(/^admin_session=/);
    });

    it('rejects an invalid/tampered session at the middleware layer too', async () => {
      const res = await callMiddleware('http://localhost/api/admin/orders', 'admin_session=garbage');
      expect(res.status).toBe(401);
    });
  });
});
