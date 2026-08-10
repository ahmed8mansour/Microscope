import { afterAll, beforeEach, describe, expect, it } from 'vitest';

// Requires a reachable database at DATABASE_URL (see quickstart.md). These
// tests are skipped — not failed — when no database is configured, so
// `npm test` stays green without infrastructure while still exercising the
// real DAL/DB behavior whenever DATABASE_URL is set (e.g. in CI).
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('order.repository — create & retrieve (US1)', () => {
  // Imported lazily inside the guarded suite: importing @/lib/db eagerly
  // throws when DATABASE_URL is unset (see lib/db/index.ts).
  let repo: typeof import('@/features/orders/data/order.repository');
  let db: typeof import('@/lib/db').db;
  let orders: typeof import('@/lib/db/schema').orders;
  let users: typeof import('@/lib/db/schema').users;
  const createdOrderIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeEach(async () => {
    repo = await import('@/features/orders/data/order.repository');
    ({ db } = await import('@/lib/db'));
    ({ orders, users } = await import('@/lib/db/schema'));
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    if (createdOrderIds.length) await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  // Seeded directly — order creation no longer accepts contact fields
  // (moved to `users` in feature 002); this DAL only needs a userId.
  async function makeUser() {
    const [row] = await db
      .insert(users)
      .values({ email: `buyer-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(row.id);
    return row;
  }

  it('creates an order with pending status, not fulfilled, and timestamps set', async () => {
    const user = await makeUser();
    const input = { userId: user.id, amount: 4999, currency: 'usd' };
    const order = await repo.createOrder(input);
    createdOrderIds.push(order.id);

    expect(order.userId).toBe(user.id);
    expect(order.amount).toBe(input.amount);
    expect(order.currency).toBe('USD');
    expect(order.paymentStatus).toBe('pending');
    expect(order.fulfilled).toBe(false);
    expect(order.createdAt).toBeTruthy();
    expect(order.updatedAt).toBeTruthy();
  });

  it('retrieves a created order by id', async () => {
    const user = await makeUser();
    const created = await repo.createOrder({ userId: user.id, amount: 4999, currency: 'usd' });
    createdOrderIds.push(created.id);

    const found = await repo.getOrderById(created.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.userId).toBe(user.id);
  });

  it('returns null for an unknown id', async () => {
    const found = await repo.getOrderById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('retrieves an order by payment reference', async () => {
    // Seeded directly (not via createOrder, which never accepts a payment
    // reference) so this US1 lookup test stays independent of US2's
    // attachPaymentReference implementation.
    const { eq } = await import('drizzle-orm');
    const user = await makeUser();
    const created = await repo.createOrder({ userId: user.id, amount: 4999, currency: 'usd' });
    createdOrderIds.push(created.id);
    const ref = `pi_test_${created.id}`;
    await db.update(orders).set({ stripePaymentIntentId: ref }).where(eq(orders.id, created.id));

    const found = await repo.getOrderByPaymentReference(ref);
    expect(found?.id).toBe(created.id);
  });

  it('rejects malformed create input', async () => {
    await expect(
      repo.createOrder({ userId: 'not-a-uuid', amount: 4999, currency: 'usd' })
    ).rejects.toThrow(repo.ValidationError);
  });
});
