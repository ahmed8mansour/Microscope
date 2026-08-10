import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Admin analytics page (US3)', () => {
  let db: typeof import('@/lib/db').db;
  let orders: typeof import('@/lib/db/schema').orders;
  let users: typeof import('@/lib/db/schema').users;
  let analyticsEvents: typeof import('@/lib/db/schema').analyticsEvents;
  let orderRepo: typeof import('@/features/orders/data/order.repository');
  let issueSession: typeof import('@/lib/auth').issueSession;
  let GET: typeof import('@/app/api/admin/analytics/route').GET;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdSessionIds: string[] = [];
  let sessionCookie: string;

  beforeAll(async () => {
    ({ db } = await import('@/lib/db'));
    ({ orders, users, analyticsEvents } = await import('@/lib/db/schema'));
    orderRepo = await import('@/features/orders/data/order.repository');
    ({ issueSession } = await import('@/lib/auth'));
    ({ GET } = await import('@/app/api/admin/analytics/route'));
    sessionCookie = `admin_session=${await issueSession()}`;
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

  function authed(url: string): Request {
    return new Request(url, { headers: { cookie: sessionCookie } });
  }

  async function makeSuccessOrder(amount = 8900) {
    const [user] = await db
      .insert(users)
      .values({ email: `analytics-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(user.id);
    const order = await orderRepo.createOrder({ userId: user.id, amount, currency: 'AUD' });
    createdOrderIds.push(order.id);
    return orderRepo.updatePaymentStatus(order.id, 'success');
  }

  async function makeEntryEvent(source: string) {
    const sid = `analytics-test-${Date.now()}-${Math.random()}`;
    createdSessionIds.push(sid);
    await db.insert(analyticsEvents).values({ step: 'entry', sessionId: sid, source });
  }

  it('rejects an unauthenticated request', async () => {
    const res = await GET(new Request('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(401);
  });

  it('returns a well-formed series for the default range', async () => {
    const res = await GET(authed('http://localhost/api/admin/analytics'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range.timezone).toBe('Australia/Melbourne');
    expect(Array.isArray(body.revenueOverTime)).toBe(true);
    expect(Array.isArray(body.ordersPerDay)).toBe(true);
    expect(Array.isArray(body.trafficSources)).toBe(true);
    expect(typeof body.paymentSuccessRate).toBe('number');
    expect(typeof body.conversionRate).toBe('number');
  });

  it('rejects an invalid range (from after to)', async () => {
    const res = await GET(
      authed('http://localhost/api/admin/analytics?from=2026-06-10&to=2026-06-01')
    );
    expect(res.status).toBe(400);
  });

  it('returns zeros/empty arrays for a range with no activity — not an error (edge case)', async () => {
    // A window far in the future — guaranteed empty regardless of what other
    // concurrently-running tests insert "now".
    const res = await GET(
      authed('http://localhost/api/admin/analytics?from=2099-01-01&to=2099-01-02')
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.revenueOverTime).toEqual([]);
    expect(body.ordersPerDay).toEqual([]);
    expect(body.trafficSources).toEqual([]);
    expect(body.paymentSuccessRate).toBe(0);
    expect(body.conversionRate).toBe(0);
  });

  it('reflects seeded orders and funnel entries within a tightly-scoped range', async () => {
    const from = new Date();
    await makeSuccessOrder(15000);
    await makeEntryEvent('newsletter');
    const to = new Date(Date.now() + 60_000); // 1 minute window around our own inserts

    const res = await GET(
      authed(`http://localhost/api/admin/analytics?from=${from.toISOString()}&to=${to.toISOString()}`)
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    // Revenue/orders-per-day: our own contribution must appear (floor —
    // safe under concurrency since nothing removes rows we just inserted).
    const totalRevenue = body.revenueOverTime.reduce((sum: number, p: { amount: number }) => sum + p.amount, 0);
    expect(totalRevenue).toBeGreaterThanOrEqual(15000);
    const totalOrders = body.ordersPerDay.reduce((sum: number, p: { count: number }) => sum + p.count, 0);
    expect(totalOrders).toBeGreaterThanOrEqual(1);

    // Traffic source we just inserted must appear.
    const newsletterSource = body.trafficSources.find((s: { source: string }) => s.source === 'newsletter');
    expect(newsletterSource).toBeTruthy();
    expect(newsletterSource.entries).toBeGreaterThanOrEqual(1);

    expect(body.paymentSuccessRate).toBeGreaterThan(0);
    expect(body.conversionRate).toBeGreaterThan(0);
  });
});
