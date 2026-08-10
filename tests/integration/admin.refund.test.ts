import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

const issueRefund = vi.fn<
  (input: { providerRef: string; amount: number; idempotencyKey: string }) => Promise<{
    providerRefundRef: string;
    accepted: true;
  }>
>();

vi.mock('@/lib/payments', () => ({
  issueRefund: (input: { providerRef: string; amount: number; idempotencyKey: string }) => issueRefund(input),
}));

describe.skipIf(!hasDb)('Admin refund (US5)', () => {
  let db: typeof import('@/lib/db').db;
  let orders: typeof import('@/lib/db/schema').orders;
  let users: typeof import('@/lib/db/schema').users;
  let refunds: typeof import('@/lib/db/schema').refunds;
  let orderRepo: typeof import('@/features/orders/data/order.repository');
  let orderSync: typeof import('@/features/orders/order-sync');
  let issueSession: typeof import('@/lib/auth').issueSession;
  let refundPOST: typeof import('@/app/api/admin/orders/[id]/refund/route').POST;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];
  let sessionCookie: string;

  beforeAll(async () => {
    ({ db } = await import('@/lib/db'));
    ({ orders, users, refunds } = await import('@/lib/db/schema'));
    orderRepo = await import('@/features/orders/data/order.repository');
    orderSync = await import('@/features/orders/order-sync');
    ({ issueSession } = await import('@/lib/auth'));
    ({ POST: refundPOST } = await import('@/app/api/admin/orders/[id]/refund/route'));
    sessionCookie = `admin_session=${await issueSession()}`;
  });

  afterEach(() => vi.clearAllMocks());

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    const { orderNotes, analyticsEvents } = await import('@/lib/db/schema');
    if (createdOrderIds.length) {
      // Delete every child row that FK-references these orders before the
      // orders themselves, so cleanup is robust regardless of what the run
      // (or a concurrent test file sharing this dev DB) attached to them.
      await db.delete(refunds).where(inArray(refunds.orderId, createdOrderIds));
      await db.delete(orderNotes).where(inArray(orderNotes.orderId, createdOrderIds));
      await db.delete(analyticsEvents).where(inArray(analyticsEvents.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  function authedPost(orderId: string, body: unknown = {}) {
    return new Request(`http://localhost/api/admin/orders/${orderId}/refund`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: sessionCookie },
      body: JSON.stringify(body),
    });
  }

  async function makeOrder(status: 'pending' | 'success' | 'failed' | 'refunded' = 'success', amount = 8900) {
    const [user] = await db
      .insert(users)
      .values({ email: `refund-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(user.id);
    const order = await orderRepo.createOrder({ userId: user.id, amount, currency: 'AUD' });
    createdOrderIds.push(order.id);
    const ref = `pi_refund_test_${order.id}`;
    await orderRepo.attachPaymentReference(order.id, ref);
    if (status === 'pending') return orderRepo.getOrderById(order.id);
    if (status === 'failed') return orderRepo.updatePaymentStatus(order.id, 'failed');
    await orderRepo.updatePaymentStatus(order.id, 'success');
    if (status === 'refunded') return orderRepo.updatePaymentStatus(order.id, 'refunded');
    return orderRepo.getOrderById(order.id);
  }

  it('rejects an unauthenticated request', async () => {
    const order = await makeOrder('success');
    const res = await refundPOST(
      new Request(`http://localhost/api/admin/orders/${order!.id}/refund`, { method: 'POST' }),
      { params: Promise.resolve({ id: order!.id }) }
    );
    expect(res.status).toBe(401);
  });

  it('returns 404 for an unknown order', async () => {
    const id = '00000000-0000-0000-0000-000000000000';
    const res = await refundPOST(authedPost(id), { params: Promise.resolve({ id }) });
    expect(res.status).toBe(404);
  });

  it.each(['pending', 'failed', 'refunded'] as const)(
    'rejects a %s order as not refundable (409)',
    async (status) => {
      const order = await makeOrder(status);
      const res = await refundPOST(authedPost(order!.id), { params: Promise.resolve({ id: order!.id }) });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe('not_refundable');
    }
  );

  it('rejects an order paid more than 90 days ago', async () => {
    const order = await makeOrder('success');
    const { eq } = await import('drizzle-orm');
    const staleDate = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000);
    await db.update(orders).set({ paidAt: staleDate }).where(eq(orders.id, order!.id));

    const res = await refundPOST(authedPost(order!.id), { params: Promise.resolve({ id: order!.id }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('not_refundable');
  });

  it('issues a refund for an eligible order: provider called, requested row created, order STAYS success', async () => {
    issueRefund.mockResolvedValue({ providerRefundRef: 're_test_123', accepted: true });
    const order = await makeOrder('success', 12300);

    const res = await refundPOST(authedPost(order!.id, { reason: 'Customer request' }), {
      params: Promise.resolve({ id: order!.id }),
    });
    expect(res.status).toBe(202);

    expect(issueRefund).toHaveBeenCalledWith({
      providerRef: order!.stripePaymentIntentId,
      amount: 12300,
      idempotencyKey: `refund_${order!.id}`,
    });

    // Order money state is NOT changed by the admin action alone (Principle III).
    const stillSuccess = await orderRepo.getOrderById(order!.id);
    expect(stillSuccess!.paymentStatus).toBe('success');

    const { eq } = await import('drizzle-orm');
    const [refundRow] = await db.select().from(refunds).where(eq(refunds.orderId, order!.id));
    expect(refundRow.status).toBe('requested');
    expect(refundRow.providerRefundRef).toBe('re_test_123');
    expect(refundRow.reason).toBe('Customer request');
  });

  it('transitions to refunded ONLY once the verified webhook reconciles (order-sync), excluding it from success', async () => {
    issueRefund.mockResolvedValue({ providerRefundRef: 're_test_456', accepted: true });
    const order = await makeOrder('success', 5000);

    const requestRes = await refundPOST(authedPost(order!.id), { params: Promise.resolve({ id: order!.id }) });
    expect(requestRes.status).toBe(202);

    // Still success — the refund row alone never flips the order.
    const beforeWebhook = await orderRepo.getOrderById(order!.id);
    expect(beforeWebhook!.paymentStatus).toBe('success');

    // Simulate the verified `charge.refunded` webhook reconciling (the same
    // path 003's webhook route drives via order-sync.reconcile).
    const result = await orderSync.reconcile(order!.stripePaymentIntentId!, {
      status: 'refunded',
      amount: order!.amount,
      currency: order!.currency,
    });
    expect(result.order.paymentStatus).toBe('refunded');

    const afterWebhook = await orderRepo.getOrderById(order!.id);
    expect(afterWebhook!.paymentStatus).toBe('refunded');
  });

  // Regression: a FULFILLED order must still be refundable. The 001 DB check
  // constraint originally required `fulfilled ⇒ status = 'success'`, which
  // blocked the webhook from moving a fulfilled order to `refunded` (500).
  // The spec's refund-after-fulfilment edge case requires this to work and
  // that fulfilment is NOT reversed. Migration 0004 broadens the constraint.
  it('refunds a FULFILLED order — webhook flips it to refunded and fulfilment is preserved', async () => {
    issueRefund.mockResolvedValue({ providerRefundRef: 're_test_fulfilled', accepted: true });
    const order = await makeOrder('success', 6400);
    const fulfilled = await orderRepo.markFulfilled(order!.id);
    expect(fulfilled.fulfilled).toBe(true);

    const requestRes = await refundPOST(authedPost(order!.id), { params: Promise.resolve({ id: order!.id }) });
    expect(requestRes.status).toBe(202);

    // The verified webhook must be able to apply `refunded` even though the
    // order is fulfilled — this is exactly what the constraint used to block.
    const result = await orderSync.reconcile(order!.stripePaymentIntentId!, {
      status: 'refunded',
      amount: order!.amount,
      currency: order!.currency,
    });
    expect(result.order.paymentStatus).toBe('refunded');

    const after = await orderRepo.getOrderById(order!.id);
    expect(after!.paymentStatus).toBe('refunded');
    expect(after!.fulfilled).toBe(true); // fulfilment is NOT reversed by a refund
  });

  it('rejects a second/concurrent refund attempt on the same order (409, at-most-once)', async () => {
    issueRefund.mockResolvedValue({ providerRefundRef: 're_test_789', accepted: true });
    const order = await makeOrder('success', 4200);

    const first = await refundPOST(authedPost(order!.id), { params: Promise.resolve({ id: order!.id }) });
    expect(first.status).toBe(202);

    const second = await refundPOST(authedPost(order!.id), { params: Promise.resolve({ id: order!.id }) });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.error.code).toBe('refund_exists');

    // Provider was called exactly once — no double money movement.
    expect(issueRefund).toHaveBeenCalledTimes(1);
  });

  it('handles concurrent simultaneous requests as exactly one refund', async () => {
    issueRefund.mockResolvedValue({ providerRefundRef: 're_test_concurrent', accepted: true });
    const order = await makeOrder('success', 3300);

    const [first, second] = await Promise.all([
      refundPOST(authedPost(order!.id), { params: Promise.resolve({ id: order!.id }) }),
      refundPOST(authedPost(order!.id), { params: Promise.resolve({ id: order!.id }) }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([202, 409]);
    expect(issueRefund).toHaveBeenCalledTimes(1);
  });

  it('leaves the order success and records a failure when the provider rejects the refund', async () => {
    issueRefund.mockRejectedValue(new Error('Stripe: charge already refunded'));
    const order = await makeOrder('success', 7700);

    const res = await refundPOST(authedPost(order!.id), { params: Promise.resolve({ id: order!.id }) });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe('provider_error');

    const stillSuccess = await orderRepo.getOrderById(order!.id);
    expect(stillSuccess!.paymentStatus).toBe('success');

    const { eq } = await import('drizzle-orm');
    const [refundRow] = await db.select().from(refunds).where(eq(refunds.orderId, order!.id));
    expect(refundRow.status).toBe('failed');
    expect(refundRow.failureMessage).toContain('already refunded');
  });

  it('rejects an oversized reason', async () => {
    const order = await makeOrder('success');
    const res = await refundPOST(authedPost(order!.id, { reason: 'x'.repeat(501) }), {
      params: Promise.resolve({ id: order!.id }),
    });
    expect(res.status).toBe(400);
  });
});
