import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT } from '@/lib/config/product';

const hasDb = Boolean(process.env.DATABASE_URL);

// Shared, mutable snapshot the mocked provider returns. Each test sets
// `status` / `clientSecret` before POSTing. Keeps the real `NotRepriceableError`
// export intact (the route uses it for `instanceof`).
const snapshot = {
  status: 'pending' as 'pending' | 'success' | 'failed' | 'refunded',
  amount: PRODUCT.unitAmount,
  currency: 'AUD',
  clientSecret: '',
  receiptRef: null as string | null,
  customerRef: null as string | null,
};

vi.mock('@/lib/payments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/payments')>();
  return {
    ...actual,
    getPaymentSnapshot: vi.fn(async () => snapshot),
    updateIntentAmount: vi.fn(async () => {}),
  };
});

describe.skipIf(!hasDb)('POST /api/checkout/update-quantity', () => {
  let db: typeof import('@/lib/db').db;
  let users: typeof import('@/lib/db/schema').users;
  let orders: typeof import('@/lib/db/schema').orders;
  let userRepo: typeof import('@/features/checkout/data/user.repository');
  let orderRepo: typeof import('@/features/orders');
  let payments: typeof import('@/lib/payments');
  let POST: typeof import('@/app/api/checkout/update-quantity/route').POST;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];
  let refCounter = 0;
  const runId = Date.now();

  beforeEach(async () => {
    ({ db } = await import('@/lib/db'));
    ({ users, orders } = await import('@/lib/db/schema'));
    userRepo = await import('@/features/checkout/data/user.repository');
    orderRepo = await import('@/features/orders');
    payments = await import('@/lib/payments');
    ({ POST } = await import('@/app/api/checkout/update-quantity/route'));
    vi.mocked(payments.updateIntentAmount).mockClear();
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    if (createdOrderIds.length) await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  function req(body: unknown) {
    return new Request('http://localhost/api/checkout/update-quantity', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function makePendingOrder() {
    const email = `reprice-${Date.now()}-${Math.random()}@example.com`;
    const user = await userRepo.createOrFindUser(email, '+15551234567');
    createdUserIds.push(user.id);
    const order = await orderRepo.createOrder({
      userId: user.id,
      amount: PRODUCT.unitAmount,
      currency: 'AUD',
      quantity: 1,
    });
    createdOrderIds.push(order.id);
    const ref = `pi_test_${runId}_${++refCounter}`;
    await orderRepo.attachPaymentReference(order.id, ref);
    snapshot.clientSecret = `${ref}_secret`;
    return { order, ref };
  }

  it('re-prices a pending order + intent for a valid quantity', async () => {
    const { order, ref } = await makePendingOrder();
    snapshot.status = 'pending';
    const res = await POST(req({ paymentIntentId: ref, clientSecret: `${ref}_secret`, quantity: 3 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.quantity).toBe(3);
    expect(body.amount).toBe(PRODUCT.unitAmount * 3);
    expect(payments.updateIntentAmount).toHaveBeenCalledWith(ref, PRODUCT.unitAmount * 3);

    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.quantity).toBe(3);
    expect(row.amount).toBe(PRODUCT.unitAmount * 3);
  });

  it('rejects a forged amount field with 400 (strict schema)', async () => {
    const { ref } = await makePendingOrder();
    snapshot.status = 'pending';
    const res = await POST(
      req({ paymentIntentId: ref, clientSecret: `${ref}_secret`, quantity: 2, amount: 1 })
    );
    expect(res.status).toBe(400);
  });

  it('rejects a mismatched client secret with 403', async () => {
    const { ref } = await makePendingOrder();
    snapshot.status = 'pending';
    const res = await POST(req({ paymentIntentId: ref, clientSecret: 'wrong-secret', quantity: 2 }));
    expect(res.status).toBe(403);
  });

  it('refuses to re-price a non-pending (confirmed) intent with 409', async () => {
    const { ref } = await makePendingOrder();
    snapshot.status = 'success';
    const res = await POST(req({ paymentIntentId: ref, clientSecret: `${ref}_secret`, quantity: 2 }));
    expect(res.status).toBe(409);
    expect(payments.updateIntentAmount).not.toHaveBeenCalled();
  });
});
