import { afterAll, beforeEach, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

// PII anonymization moved to the `users` repository in feature 002 (contact
// now lives on users, not orders) — see tests/integration/user.pii.test.ts.
describe.skipIf(!hasDb)('order.repository — notes (Polish)', () => {
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
    const order = await repo.createOrder({ userId: user.id, amount: 3200, currency: 'usd' });
    createdOrderIds.push(order.id);
    return order;
  }

  it('updateNotes changes notes only, leaving payment/fulfillment state unchanged', async () => {
    const order = await makeOrder();
    await repo.updatePaymentStatus(order.id, 'success');
    const before = await repo.getOrderById(order.id);

    const updated = await repo.updateNotes(order.id, 'called customer to confirm size');

    expect(updated.notes).toBe('called customer to confirm size');
    expect(updated.paymentStatus).toBe(before?.paymentStatus);
    expect(updated.fulfilled).toBe(before?.fulfilled);
    expect(updated.amount).toBe(before?.amount);
  });
});
