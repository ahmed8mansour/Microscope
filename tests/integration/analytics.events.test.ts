import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);
const hasAdminEnv = Boolean(process.env.ADMIN_SESSION_SECRET);

describe.skipIf(!hasDb)('Analytics events — first-party funnel recording (US4)', () => {
  let db: typeof import('@/lib/db').db;
  let analyticsEvents: typeof import('@/lib/db/schema').analyticsEvents;
  let orders: typeof import('@/lib/db/schema').orders;
  let users: typeof import('@/lib/db/schema').users;
  let orderRepo: typeof import('@/features/orders/data/order.repository');
  let POST: typeof import('@/app/api/analytics/event/route').POST;
  let recordConversion: typeof import('@/features/analytics').recordConversion;
  const createdSessionIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    ({ db } = await import('@/lib/db'));
    ({ analyticsEvents, orders, users } = await import('@/lib/db/schema'));
    orderRepo = await import('@/features/orders/data/order.repository');
    ({ POST } = await import('@/app/api/analytics/event/route'));
    ({ recordConversion } = await import('@/features/analytics'));
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    if (createdSessionIds.length) {
      await db.delete(analyticsEvents).where(inArray(analyticsEvents.sessionId, createdSessionIds));
    }
    if (createdOrderIds.length) await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  async function makeOrder() {
    const [user] = await db
      .insert(users)
      .values({ email: `analytics-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(user.id);
    const order = await orderRepo.createOrder({ userId: user.id, amount: 8900, currency: 'AUD' });
    createdOrderIds.push(order.id);
    return order;
  }

  function sessionId(label: string): string {
    const id = `test-${label}-${Date.now()}-${Math.random()}`;
    createdSessionIds.push(id);
    return id;
  }

  const browserUA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

  function req(body: unknown, opts?: { cookie?: string; userAgent?: string; referer?: string }): Request {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (opts?.cookie) headers.cookie = opts.cookie;
    headers['user-agent'] = opts?.userAgent ?? browserUA;
    if (opts?.referer) headers.referer = opts.referer;
    return new Request('http://localhost/api/analytics/event', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  }

  it('records a funnel entry and returns 204 with a new session cookie', async () => {
    const res = await POST(req({ step: 'entry' }));
    expect(res.status).toBe(204);
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toMatch(/^a_sid=/);
    const sid = setCookie!.match(/^a_sid=([^;]+)/)![1];
    createdSessionIds.push(sid);

    const { eq, and } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.sessionId, sid), eq(analyticsEvents.step, 'entry')));
    expect(rows).toHaveLength(1);
  });

  it('deduplicates a repeated entry within the same session', async () => {
    const sid = sessionId('dedup');
    const cookie = `a_sid=${sid}`;

    const first = await POST(req({ step: 'entry' }, { cookie }));
    expect(first.status).toBe(204);
    const second = await POST(req({ step: 'entry' }, { cookie }));
    expect(second.status).toBe(204);

    const { eq, and } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.sessionId, sid), eq(analyticsEvents.step, 'entry')));
    expect(rows).toHaveLength(1);
  });

  it('records a payment-step event', async () => {
    const sid = sessionId('payment');
    const res = await POST(req({ step: 'payment' }, { cookie: `a_sid=${sid}` }));
    expect(res.status).toBe(204);

    const { eq, and } = await import('drizzle-orm');
    const rows = await db
      .select()
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.sessionId, sid), eq(analyticsEvents.step, 'payment')));
    expect(rows).toHaveLength(1);
  });

  it('rejects a client-supplied conversion step (server-emitted only, FR-028)', async () => {
    const res = await POST(req({ step: 'conversion' }, { cookie: `a_sid=${sessionId('conv-reject')}` }));
    expect(res.status).toBe(400);
  });

  it('does not record traffic from a known bot User-Agent, but still returns 204', async () => {
    const sid = sessionId('bot');
    const res = await POST(
      req(
        { step: 'entry' },
        { cookie: `a_sid=${sid}`, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' }
      )
    );
    expect(res.status).toBe(204);

    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(analyticsEvents).where(eq(analyticsEvents.sessionId, sid));
    expect(rows).toHaveLength(0);
  });

  it.skipIf(!hasAdminEnv)('does not record traffic carrying a valid admin session', async () => {
    const { issueSession } = await import('@/lib/auth');
    const adminToken = await issueSession();
    const sid = sessionId('admin');
    const res = await POST(req({ step: 'entry' }, { cookie: `a_sid=${sid}; admin_session=${adminToken}` }));
    expect(res.status).toBe(204);

    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(analyticsEvents).where(eq(analyticsEvents.sessionId, sid));
    expect(rows).toHaveLength(0);
  });

  it('stores only coarse attribution — no full URL / query string in referrer', async () => {
    const sid = sessionId('pii');
    const res = await POST(
      req(
        { step: 'entry' },
        { cookie: `a_sid=${sid}`, referer: 'https://www.google.com/search?q=microscope&secret=abc123' }
      )
    );
    expect(res.status).toBe(204);

    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(analyticsEvents).where(eq(analyticsEvents.sessionId, sid));
    expect(row.referrer).toBe('www.google.com');
    expect(row.referrer).not.toContain('secret');
    expect(row.referrer).not.toContain('?');
  });

  it('rejects a malformed body with 400', async () => {
    const res = await POST(req({ step: 'not-a-real-step' }));
    expect(res.status).toBe(400);
  });

  describe('recordConversion (server-emitted, FR-028)', () => {
    it('is idempotent — recording the same order twice results in one row', async () => {
      const order = await makeOrder();
      createdSessionIds.push(order.id); // recordConversion uses orderId as sessionId (see event.repository.ts)

      await recordConversion(order.id);
      await recordConversion(order.id); // duplicate — must be a no-op, not an error

      const { eq, and } = await import('drizzle-orm');
      const rows = await db
        .select()
        .from(analyticsEvents)
        .where(and(eq(analyticsEvents.orderId, order.id), eq(analyticsEvents.step, 'conversion')));
      expect(rows).toHaveLength(1);
    });
  });
});
