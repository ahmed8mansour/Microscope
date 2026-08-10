import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NormalizedWebhookEvent } from '@/lib/payments/types';

const hasDb = Boolean(process.env.DATABASE_URL);

const parseWebhookEvent = vi.fn<(rawBody: string, signature: string) => Promise<NormalizedWebhookEvent>>();

vi.mock('@/lib/payments', () => ({
  parseWebhookEvent: (rawBody: string, signature: string) => parseWebhookEvent(rawBody, signature),
}));

describe.skipIf(!hasDb)('POST /api/webhooks/stripe', () => {
  let db: typeof import('@/lib/db').db;
  let orders: typeof import('@/lib/db/schema').orders;
  let users: typeof import('@/lib/db/schema').users;
  let webhookEvents: typeof import('@/lib/db/schema').webhookEvents;
  let analyticsEvents: typeof import('@/lib/db/schema').analyticsEvents;
  let repo: typeof import('@/features/orders/data/order.repository');
  let POST: typeof import('@/app/api/webhooks/stripe/route').POST;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdEventIds: string[] = [];

  beforeEach(async () => {
    parseWebhookEvent.mockReset();
    ({ db } = await import('@/lib/db'));
    ({ orders, users, webhookEvents, analyticsEvents } = await import('@/lib/db/schema'));
    repo = await import('@/features/orders/data/order.repository');
    ({ POST } = await import('@/app/api/webhooks/stripe/route'));
  });

  afterEach(() => vi.clearAllMocks());

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    if (createdEventIds.length) await db.delete(webhookEvents).where(inArray(webhookEvents.id, createdEventIds));
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
      .values({ email: `wh-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(user.id);
    const order = await repo.createOrder({ userId: user.id, amount: 8900, currency: 'AUD' });
    createdOrderIds.push(order.id);
    const ref = `pi_test_${order.id}`;
    await repo.attachPaymentReference(order.id, ref);
    return { order, ref };
  }

  function req(body = 'raw-payload') {
    return new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'stripe-signature': 'sig-value' },
      body,
    });
  }

  function succeededEvent(id: string, ref: string, amount = 8900, currency = 'AUD'): NormalizedWebhookEvent {
    return {
      id,
      type: 'payment_intent.succeeded',
      kind: 'succeeded',
      providerRef: ref,
      amount,
      currency,
      receiptRef: null,
    };
  }

  it('marks the order success on a genuine succeeded event', async () => {
    const { order, ref } = await makeOrder();
    const eventId = `evt_${order.id}_1`;
    createdEventIds.push(eventId);
    parseWebhookEvent.mockResolvedValue(succeededEvent(eventId, ref));

    const res = await POST(req());
    expect(res.status).toBe(200);

    const found = await repo.getOrderById(order.id);
    expect(found?.paymentStatus).toBe('success');
  });

  it('is idempotent under duplicate delivery (5 repeats) and concurrent delivery', async () => {
    const { order, ref } = await makeOrder();
    const eventId = `evt_${order.id}_dup`;
    createdEventIds.push(eventId);
    parseWebhookEvent.mockResolvedValue(succeededEvent(eventId, ref));

    // Sequential repeats.
    for (let i = 0; i < 5; i++) {
      const res = await POST(req());
      expect(res.status).toBe(200);
    }

    const found = await repo.getOrderById(order.id);
    expect(found?.paymentStatus).toBe('success');

    // Concurrent repeats of the same event id.
    const results = await Promise.all([req(), req(), req()].map((r) => POST(r)));
    for (const res of results) expect(res.status).toBe(200);

    const stillFound = await repo.getOrderById(order.id);
    expect(stillFound?.paymentStatus).toBe('success');
  });

  it('rejects a forged/invalid signature with no state change', async () => {
    const { order, ref } = await makeOrder();
    parseWebhookEvent.mockRejectedValue(new Error('signature verification failed'));

    const res = await POST(req());
    expect(res.status).toBe(400);

    const found = await repo.getOrderById(order.id);
    expect(found?.paymentStatus).toBe('pending');
    void ref;
  });

  it('marks the order failed on a payment_failed event', async () => {
    const { order, ref } = await makeOrder();
    const eventId = `evt_${order.id}_failed`;
    createdEventIds.push(eventId);
    parseWebhookEvent.mockResolvedValue({
      id: eventId,
      type: 'payment_intent.payment_failed',
      kind: 'failed',
      providerRef: ref,
      amount: 8900,
      currency: 'AUD',
      receiptRef: null,
    });

    const res = await POST(req());
    expect(res.status).toBe(200);

    const found = await repo.getOrderById(order.id);
    expect(found?.paymentStatus).toBe('failed');
  });

  it('does not mark success on an amount mismatch and flags it', async () => {
    const { order, ref } = await makeOrder();
    const eventId = `evt_${order.id}_mismatch`;
    createdEventIds.push(eventId);
    parseWebhookEvent.mockResolvedValue(succeededEvent(eventId, ref, 100, 'AUD'));

    const res = await POST(req());
    expect(res.status).toBe(200);

    const found = await repo.getOrderById(order.id);
    expect(found?.paymentStatus).toBe('pending');
    expect(found?.notes).toMatch(/mismatch/i);
  });

  it('marks the order refunded on a full refund event', async () => {
    const { order, ref } = await makeOrder();
    const succeedId = `evt_${order.id}_ok`;
    const refundId = `evt_${order.id}_refund`;
    createdEventIds.push(succeedId, refundId);

    parseWebhookEvent.mockResolvedValueOnce(succeededEvent(succeedId, ref));
    await POST(req());

    parseWebhookEvent.mockResolvedValueOnce({
      id: refundId,
      type: 'charge.refunded',
      kind: 'refunded',
      providerRef: ref,
      amount: 8900,
      currency: 'AUD',
      receiptRef: null,
    });
    const res = await POST(req());
    expect(res.status).toBe(200);

    const found = await repo.getOrderById(order.id);
    expect(found?.paymentStatus).toBe('refunded');
  });

  it('returns a retryable response when the order is not yet visible, and records no event', async () => {
    const eventId = 'evt_unknown_ref';
    parseWebhookEvent.mockResolvedValue({
      id: eventId,
      type: 'payment_intent.succeeded',
      kind: 'succeeded',
      providerRef: 'pi_does_not_exist',
      amount: 8900,
      currency: 'AUD',
      receiptRef: null,
    });

    const res = await POST(req());
    expect(res.status).toBeGreaterThanOrEqual(500);

    const [row] = await db.select().from(webhookEvents).where(
      (await import('drizzle-orm')).eq(webhookEvents.id, eventId)
    );
    expect(row).toBeUndefined();
  });
});
