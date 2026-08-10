import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Admin fulfillment — supplier refs (US3)', () => {
  let db: typeof import('@/lib/db').db;
  let orders: typeof import('@/lib/db/schema').orders;
  let users: typeof import('@/lib/db/schema').users;
  let orderRepo: typeof import('@/features/orders/data/order.repository');
  let issueSession: typeof import('@/lib/auth').issueSession;
  let fulfillPOST: typeof import('@/app/api/admin/orders/[id]/fulfill/route').POST;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];
  let sessionCookie: string;

  beforeAll(async () => {
    ({ db } = await import('@/lib/db'));
    ({ orders, users } = await import('@/lib/db/schema'));
    orderRepo = await import('@/features/orders/data/order.repository');
    ({ issueSession } = await import('@/lib/auth'));
    ({ POST: fulfillPOST } = await import('@/app/api/admin/orders/[id]/fulfill/route'));
    sessionCookie = `admin_session=${await issueSession()}`;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    if (createdOrderIds.length) await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  async function makeOrder(status: 'pending' | 'success' = 'success') {
    const [user] = await db
      .insert(users)
      .values({ email: `admfulfill-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(user.id);
    const order = await orderRepo.createOrder({ userId: user.id, amount: 8900, currency: 'AUD' });
    createdOrderIds.push(order.id);
    if (status === 'success') return orderRepo.updatePaymentStatus(order.id, 'success');
    return order;
  }

  function post(id: string, body?: unknown): Promise<Response> {
    return fulfillPOST(
      new Request(`http://localhost/api/admin/orders/${id}/fulfill`, {
        method: 'POST',
        headers: { cookie: sessionCookie, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    );
  }

  it('rejects an unauthenticated request', async () => {
    const order = await makeOrder('success');
    const res = await fulfillPOST(
      new Request(`http://localhost/api/admin/orders/${order.id}/fulfill`, { method: 'POST' }),
      { params: Promise.resolve({ id: order.id }) }
    );
    expect(res.status).toBe(401);
  });

  it('records supplier refs and marks fulfilled without changing payment status', async () => {
    const order = await makeOrder('success');
    const res = await post(order.id, {
      supplierOrderRef: 'ALI-123456789',
      supplierTrackingRef: 'LP00612345678',
      fulfilled: true,
    });
    expect(res.status).toBe(200);

    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.supplierOrderRef).toBe('ALI-123456789');
    expect(row.supplierTrackingRef).toBe('LP00612345678');
    expect(row.fulfilled).toBe(true);
    expect(row.paymentStatus).toBe('success'); // FR-014 — unchanged
  });

  it('refuses to mark an unpaid order fulfilled (409)', async () => {
    const order = await makeOrder('pending');
    const res = await post(order.id, { fulfilled: true });
    expect(res.status).toBe(409);
  });

  it('records refs on an unpaid order without fulfilling (payment status untouched)', async () => {
    const order = await makeOrder('pending');
    const res = await post(order.id, { supplierOrderRef: 'ALI-NOTE-ONLY', fulfilled: false });
    expect(res.status).toBe(200);

    const { eq } = await import('drizzle-orm');
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row.supplierOrderRef).toBe('ALI-NOTE-ONLY');
    expect(row.fulfilled).toBe(false);
    expect(row.paymentStatus).toBe('pending');
  });
});
