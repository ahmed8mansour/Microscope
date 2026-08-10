import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('order.repository — idempotency & retry (US3)', () => {
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

  async function makeOrder() {
    const [user] = await db
      .insert(users)
      .values({ email: `buyer-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(user.id);
    const order = await repo.createOrder({ userId: user.id, amount: 1000, currency: 'usd' });
    createdOrderIds.push(order.id);
    return order;
  }

  it('attaching the same reference twice is a no-op (single record, FR-007)', async () => {
    const order = await makeOrder();
    const ref = `pi_test_${order.id}`;
    await repo.attachPaymentReference(order.id, ref);
    const again = await repo.attachPaymentReference(order.id, ref);
    expect(again.stripePaymentIntentId).toBe(ref);

    const found = await repo.getOrderByPaymentReference(ref);
    expect(found?.id).toBe(order.id);
  });

  it('a different order claiming a used payment reference is rejected (SC-001)', async () => {
    const first = await makeOrder();
    const second = await makeOrder();
    const ref = `pi_test_${first.id}`;
    await repo.attachPaymentReference(first.id, ref);

    await expect(repo.attachPaymentReference(second.id, ref)).rejects.toThrow(
      repo.ConflictError
    );
  });

  it('applying the same status repeatedly converges to one final state (SC-003)', async () => {
    const order = await makeOrder();
    for (let i = 0; i < 5; i++) {
      await repo.updatePaymentStatus(order.id, 'success');
    }
    const found = await repo.getOrderById(order.id);
    expect(found?.paymentStatus).toBe('success');
  });

  it('a retry after failure reuses the same order (FR-007a)', async () => {
    const order = await makeOrder();
    const firstRef = `pi_test_${order.id}_1`;
    await repo.attachPaymentReference(order.id, firstRef);
    await repo.updatePaymentStatus(order.id, 'failed');

    const retryRef = `pi_test_${order.id}_2`;
    const retried = await repo.recordRetry(order.id, retryRef);

    expect(retried.id).toBe(order.id);
    expect(retried.paymentStatus).toBe('pending');
    expect(retried.stripePaymentIntentId).toBe(retryRef);

    // Confirm this is genuinely one row, not a new one.
    const found = await repo.getOrderById(order.id);
    expect(found?.stripePaymentIntentId).toBe(retryRef);
  });

  it('recordRetry rejects an order that is not currently failed', async () => {
    const order = await makeOrder();
    await expect(repo.recordRetry(order.id, `pi_test_${order.id}`)).rejects.toThrow(
      repo.InvalidTransitionError
    );
  });
});
