import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

// A unique ref per call — matching real Stripe (each created intent gets a
// distinct id) and avoiding a unique-constraint collision between tests
// whose orders aren't cleaned up until this file's single afterAll. Process-
// unique (timestamp + counter), not just a per-run counter restarting at 1 —
// a counter alone would collide with leftover rows from any earlier run
// whose afterAll didn't complete (e.g. a timed-out test aborting the file).
let mockRefCounter = 0;
const mockRunId = Date.now();
vi.mock('@/lib/payments', () => ({
  createPaymentIntent: vi.fn().mockImplementation(async () => {
    const ref = `pi_mock_${mockRunId}_${++mockRefCounter}`;
    return { providerRef: ref, clientSecret: `${ref}_secret` };
  }),
}));

describe.skipIf(!hasDb)('POST /api/checkout/create-intent', () => {
  let db: typeof import('@/lib/db').db;
  let users: typeof import('@/lib/db/schema').users;
  let orders: typeof import('@/lib/db/schema').orders;
  let userRepo: typeof import('@/features/checkout/data/user.repository');
  let POST: typeof import('@/app/api/checkout/create-intent/route').POST;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeEach(async () => {
    ({ db } = await import('@/lib/db'));
    ({ users, orders } = await import('@/lib/db/schema'));
    userRepo = await import('@/features/checkout/data/user.repository');
    ({ POST } = await import('@/app/api/checkout/create-intent/route'));
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    if (createdOrderIds.length) await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  function req(body: unknown) {
    return new Request('http://localhost/api/checkout/create-intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // `verifiedAt` controls freshness: 'fresh' (just now), 'stale' (older than
  // the 15-min window), or null (never verified this checkout).
  async function makeUser(verifiedAt: 'fresh' | 'stale' | null) {
    const email = `intent-${Date.now()}-${Math.random()}@example.com`;
    const user = await userRepo.createOrFindUser(email, '+15551234567');
    createdUserIds.push(user.id);
    if (verifiedAt !== null) {
      const { eq } = await import('drizzle-orm');
      const at =
        verifiedAt === 'fresh'
          ? new Date()
          : new Date(Date.now() - 30 * 60_000); // 30 min ago — beyond the window
      await db.update(users).set({ verified: true, verifiedAt: at }).where(eq(users.id, user.id));
    }
    return { email, id: user.id };
  }

  it('rejects with 403 when the user was never verified this checkout', async () => {
    const { email } = await makeUser(null);
    const res = await POST(req({ email }));
    expect(res.status).toBe(403);
  });

  it('rejects with 403 when the verification is stale (past the freshness window)', async () => {
    const { email } = await makeUser('stale');
    const res = await POST(req({ email }));
    expect(res.status).toBe(403);
  });

  it('consumes the verification — a second intent without re-verifying is rejected', async () => {
    const { email } = await makeUser('fresh');

    const first = await POST(req({ email }));
    expect(first.status).toBe(200);
    createdOrderIds.push((await first.json()).orderId);

    // No new OTP was issued, so the verification is now spent.
    const second = await POST(req({ email }));
    expect(second.status).toBe(403);
  });

  it('creates a pending order + intent for a freshly verified user and returns a client secret', async () => {
    const { email } = await makeUser('fresh');
    const res = await POST(req({ email }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toMatch(/^pi_mock_\d+_\d+_secret$/);
    expect(body.orderId).toBeTruthy();
    createdOrderIds.push(body.orderId);

    const { eq } = await import('drizzle-orm');
    const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId));
    expect(order.paymentStatus).toBe('pending');
    expect(order.amount).toBe(8900);
    expect(order.currency).toBe('AUD');
    expect(order.stripePaymentIntentId).toMatch(/^pi_mock_\d+_\d+$/);
  });

  it('ignores a client-supplied amount and uses the server price', async () => {
    const { email } = await makeUser('fresh');
    const res = await POST(
      new Request('http://localhost/api/checkout/create-intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, amount: 1 }),
      })
    );
    // Strict schema rejects the unexpected field outright.
    expect(res.status).toBe(400);
  });

  it('rejects malformed input with 400', async () => {
    const res = await POST(req({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
  });
});
