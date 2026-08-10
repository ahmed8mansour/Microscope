import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('order.repository — payment lifecycle (US2)', () => {
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
    const order = await repo.createOrder({ userId: user.id, amount: 2500, currency: 'usd' });
    createdOrderIds.push(order.id);
    return order;
  }

  it('allows pending -> success', async () => {
    const order = await makeOrder();
    const updated = await repo.updatePaymentStatus(order.id, 'success');
    expect(updated.paymentStatus).toBe('success');
  });

  it('allows success -> refunded', async () => {
    const order = await makeOrder();
    await repo.updatePaymentStatus(order.id, 'success');
    const refunded = await repo.updatePaymentStatus(order.id, 'refunded');
    expect(refunded.paymentStatus).toBe('refunded');
  });

  it('rejects failed -> refunded', async () => {
    const order = await makeOrder();
    await repo.updatePaymentStatus(order.id, 'failed');
    await expect(repo.updatePaymentStatus(order.id, 'refunded')).rejects.toThrow(
      repo.InvalidTransitionError
    );
  });

  it('rejects refunded -> success', async () => {
    const order = await makeOrder();
    await repo.updatePaymentStatus(order.id, 'success');
    await repo.updatePaymentStatus(order.id, 'refunded');
    await expect(repo.updatePaymentStatus(order.id, 'success')).rejects.toThrow(
      repo.InvalidTransitionError
    );
  });

  it('markFulfilled succeeds only on a success order', async () => {
    const order = await makeOrder();
    await expect(repo.markFulfilled(order.id)).rejects.toThrow(repo.NotFulfillableError);

    await repo.updatePaymentStatus(order.id, 'success');
    const fulfilled = await repo.markFulfilled(order.id);
    expect(fulfilled.fulfilled).toBe(true);
    expect(fulfilled.paymentStatus).toBe('success');
  });

  it('attachPaymentReference sets the reference and is idempotent for the same order', async () => {
    const order = await makeOrder();
    const ref = `pi_test_${order.id}`;
    const attached = await repo.attachPaymentReference(order.id, ref);
    expect(attached.stripePaymentIntentId).toBe(ref);

    const again = await repo.attachPaymentReference(order.id, ref);
    expect(again.stripePaymentIntentId).toBe(ref);
  });
});
