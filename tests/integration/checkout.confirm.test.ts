import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedPaymentSnapshot } from '@/lib/payments/types';

const hasDb = Boolean(process.env.DATABASE_URL);

const getPaymentSnapshot = vi.fn<(providerRef: string) => Promise<NormalizedPaymentSnapshot>>();

vi.mock('@/lib/payments', () => ({
  getPaymentSnapshot: (providerRef: string) => getPaymentSnapshot(providerRef),
}));

describe.skipIf(!hasDb)('POST /api/checkout/confirm', () => {
  let db: typeof import('@/lib/db').db;
  let orders: typeof import('@/lib/db/schema').orders;
  let users: typeof import('@/lib/db/schema').users;
  let analyticsEvents: typeof import('@/lib/db/schema').analyticsEvents;
  let repo: typeof import('@/features/orders/data/order.repository');
  let POST: typeof import('@/app/api/checkout/confirm/route').POST;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeEach(async () => {
    getPaymentSnapshot.mockReset();
    ({ db } = await import('@/lib/db'));
    ({ orders, users, analyticsEvents } = await import('@/lib/db/schema'));
    repo = await import('@/features/orders/data/order.repository');
    ({ POST } = await import('@/app/api/checkout/confirm/route'));
  });

  afterEach(() => vi.clearAllMocks());

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    // A verified `success` reconcile best-effort records a conversion event
    // (order-sync.ts) — its FK to `orders` must be cleared first.
    if (createdOrderIds.length) {
      await db.delete(analyticsEvents).where(inArray(analyticsEvents.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  async function makeOrder() {
    const [user] = await db
      .insert(users)
      .values({ email: `confirm-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(user.id);
    const order = await repo.createOrder({ userId: user.id, amount: 8900, currency: 'AUD' });
    createdOrderIds.push(order.id);
    const ref = `pi_test_${order.id}`;
    await repo.attachPaymentReference(order.id, ref);
    return { order, ref };
  }

  function req(body: unknown) {
    return new Request('http://localhost/api/checkout/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('returns a reconciled success view when the snapshot is succeeded and verified', async () => {
    const { ref } = await makeOrder();
    const secret = `${ref}_secret_abc`;
    getPaymentSnapshot.mockResolvedValue({
      status: 'success',
      amount: 8900,
      currency: 'AUD',
      clientSecret: secret,
      receiptRef: 'https://receipt.example/1',
      customerRef: null,
    });

    const res = await POST(req({ paymentIntentId: ref, clientSecret: secret }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('success');
    expect(body.amount).toBe(8900);
    expect(body.currency).toBe('AUD');
  });

  it('returns a pending view when the payment has not reached a terminal state', async () => {
    const { ref } = await makeOrder();
    const secret = `${ref}_secret_abc`;
    getPaymentSnapshot.mockResolvedValue({
      status: 'pending',
      amount: 8900,
      currency: 'AUD',
      clientSecret: secret,
      receiptRef: null,
      customerRef: null,
    });

    const res = await POST(req({ paymentIntentId: ref, clientSecret: secret }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('pending');
  });

  it('rejects with 403 when the supplied client secret does not match', async () => {
    const { ref } = await makeOrder();
    getPaymentSnapshot.mockResolvedValue({
      status: 'success',
      amount: 8900,
      currency: 'AUD',
      clientSecret: `${ref}_secret_real`,
      receiptRef: null,
      customerRef: null,
    });

    const res = await POST(req({ paymentIntentId: ref, clientSecret: 'wrong_secret' }));
    expect(res.status).toBe(403);
  });

  it('returns not_found for an unknown payment reference', async () => {
    getPaymentSnapshot.mockResolvedValue({
      status: 'success',
      amount: 8900,
      currency: 'AUD',
      clientSecret: 'pi_unknown_secret',
      receiptRef: null,
      customerRef: null,
    });

    const res = await POST(req({ paymentIntentId: 'pi_unknown', clientSecret: 'pi_unknown_secret' }));
    const body = await res.json();
    expect(body.status).toBe('not_found');
  });

  it('rejects malformed input with 400', async () => {
    const res = await POST(req({ paymentIntentId: '' }));
    expect(res.status).toBe(400);
  });
});
