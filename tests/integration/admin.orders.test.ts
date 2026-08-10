import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('Admin orders management (US2)', () => {
  let db: typeof import('@/lib/db').db;
  let orders: typeof import('@/lib/db/schema').orders;
  let orderNotes: typeof import('@/lib/db/schema').orderNotes;
  let users: typeof import('@/lib/db/schema').users;
  let orderRepo: typeof import('@/features/orders/data/order.repository');
  let issueSession: typeof import('@/lib/auth').issueSession;
  let listGET: typeof import('@/app/api/admin/orders/route').GET;
  let detailGET: typeof import('@/app/api/admin/orders/[id]/route').GET;
  let fulfillPOST: typeof import('@/app/api/admin/orders/[id]/fulfill/route').POST;
  let notesPOST: typeof import('@/app/api/admin/orders/[id]/notes/route').POST;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];
  let sessionCookie: string;

  beforeAll(async () => {
    ({ db } = await import('@/lib/db'));
    ({ orders, orderNotes, users } = await import('@/lib/db/schema'));
    orderRepo = await import('@/features/orders/data/order.repository');
    ({ issueSession } = await import('@/lib/auth'));
    ({ GET: listGET } = await import('@/app/api/admin/orders/route'));
    ({ GET: detailGET } = await import('@/app/api/admin/orders/[id]/route'));
    ({ POST: fulfillPOST } = await import('@/app/api/admin/orders/[id]/fulfill/route'));
    ({ POST: notesPOST } = await import('@/app/api/admin/orders/[id]/notes/route'));
    sessionCookie = `admin_session=${await issueSession()}`;
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    // Notes reference orders via FK — must be deleted first.
    if (createdOrderIds.length) {
      await db.delete(orderNotes).where(inArray(orderNotes.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  async function makeUser() {
    const [row] = await db
      .insert(users)
      .values({ email: `admorders-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(row.id);
    return row;
  }

  async function makeOrder(status: 'pending' | 'success' | 'failed' = 'pending', amount = 8900) {
    const user = await makeUser();
    const order = await orderRepo.createOrder({ userId: user.id, amount, currency: 'AUD' });
    createdOrderIds.push(order.id);
    if (status === 'pending') return order;
    return orderRepo.updatePaymentStatus(order.id, status);
  }

  function authed(url: string, init?: RequestInit): Request {
    return new Request(url, {
      ...init,
      headers: { ...(init?.headers ?? {}), cookie: sessionCookie },
    });
  }

  describe('list', () => {
    it('rejects an unauthenticated request', async () => {
      const res = await listGET(new Request('http://localhost/api/admin/orders'));
      expect(res.status).toBe(401);
    });

    it('lists orders including every stored field (FR-012)', async () => {
      const order = await makeOrder('pending');
      const res = await listGET(authed('http://localhost/api/admin/orders?limit=50'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body.orders)).toBe(true);
      const found = body.orders.find((o: { id: string }) => o.id === order.id);
      expect(found).toBeTruthy();
      expect(found).toMatchObject({
        id: order.id,
        userId: order.userId,
        amount: order.amount,
        currency: order.currency,
        paymentStatus: 'pending',
        fulfilled: false,
      });
      expect(found).toHaveProperty('stripePaymentIntentId');
      expect(found).toHaveProperty('stripeReceiptUrl');
      expect(found).toHaveProperty('stripeCustomerId');
      expect(found).toHaveProperty('notes');
      expect(found).toHaveProperty('createdAt');
      expect(found).toHaveProperty('updatedAt');
    });

    it('paginates with a small limit and a working nextCursor', async () => {
      await makeOrder('pending');
      await makeOrder('pending');
      await makeOrder('pending');

      const page1 = await (await listGET(authed('http://localhost/api/admin/orders?limit=2'))).json();
      expect(page1.orders.length).toBe(2);
      expect(page1.nextCursor).toBeTruthy();

      const page2 = await (
        await listGET(authed(`http://localhost/api/admin/orders?limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`))
      ).json();
      expect(page2.orders.length).toBeGreaterThan(0);
      // No overlap between pages.
      const page1Ids = new Set(page1.orders.map((o: { id: string }) => o.id));
      for (const o of page2.orders) {
        expect(page1Ids.has(o.id)).toBe(false);
      }
    });

    it('filters by payment status', async () => {
      const failedOrder = await makeOrder('failed');
      const res = await listGET(authed('http://localhost/api/admin/orders?status=failed&limit=50'));
      const body = await res.json();
      expect(body.orders.every((o: { paymentStatus: string }) => o.paymentStatus === 'failed')).toBe(true);
      expect(body.orders.some((o: { id: string }) => o.id === failedOrder.id)).toBe(true);
    });

    it('filters by fulfilled', async () => {
      const res = await listGET(authed('http://localhost/api/admin/orders?fulfilled=true&limit=50'));
      const body = await res.json();
      expect(body.orders.every((o: { fulfilled: boolean }) => o.fulfilled === true)).toBe(true);
    });

    it('rejects an invalid query', async () => {
      const res = await listGET(authed('http://localhost/api/admin/orders?status=not-a-status'));
      expect(res.status).toBe(400);
    });
  });

  describe('detail', () => {
    it('rejects an unauthenticated request', async () => {
      const order = await makeOrder('pending');
      const res = await detailGET(new Request(`http://localhost/api/admin/orders/${order.id}`), {
        params: Promise.resolve({ id: order.id }),
      });
      expect(res.status).toBe(401);
    });

    it('returns full order detail with an empty notes array for a fresh order', async () => {
      const order = await makeOrder('pending');
      const res = await detailGET(authed(`http://localhost/api/admin/orders/${order.id}`), {
        params: Promise.resolve({ id: order.id }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.order.id).toBe(order.id);
      expect(body.notes).toEqual([]);
    });

    it('returns 404 for an unknown order id', async () => {
      const res = await detailGET(
        authed('http://localhost/api/admin/orders/00000000-0000-0000-0000-000000000000'),
        { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('fulfill', () => {
    it('marks a success order fulfilled and is idempotent on repeat', async () => {
      const order = await makeOrder('success');
      const first = await fulfillPOST(authed(`http://localhost/api/admin/orders/${order.id}/fulfill`, { method: 'POST' }), {
        params: Promise.resolve({ id: order.id }),
      });
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.order.fulfilled).toBe(true);

      const second = await fulfillPOST(authed(`http://localhost/api/admin/orders/${order.id}/fulfill`, { method: 'POST' }), {
        params: Promise.resolve({ id: order.id }),
      });
      expect(second.status).toBe(200);
      const secondBody = await second.json();
      expect(secondBody.order.fulfilled).toBe(true);
    });

    it('rejects fulfilling a non-success order (FR-015)', async () => {
      const order = await makeOrder('pending');
      const res = await fulfillPOST(authed(`http://localhost/api/admin/orders/${order.id}/fulfill`, { method: 'POST' }), {
        params: Promise.resolve({ id: order.id }),
      });
      expect(res.status).toBe(409);
    });

    it('returns 404 for an unknown order id', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      const res = await fulfillPOST(authed(`http://localhost/api/admin/orders/${id}/fulfill`, { method: 'POST' }), {
        params: Promise.resolve({ id }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe('notes', () => {
    it('appends a note visible on re-open, and allows notes on a non-success order', async () => {
      const order = await makeOrder('failed');
      const res = await notesPOST(
        authed(`http://localhost/api/admin/orders/${order.id}/notes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: 'Customer asked for a refund via email.' }),
        }),
        { params: Promise.resolve({ id: order.id }) }
      );
      expect(res.status).toBe(201);
      const note = await res.json();
      expect(note.body).toBe('Customer asked for a refund via email.');
      expect(note.createdAt).toBeTruthy();

      const detail = await detailGET(authed(`http://localhost/api/admin/orders/${order.id}`), {
        params: Promise.resolve({ id: order.id }),
      });
      const detailBody = await detail.json();
      expect(detailBody.notes).toHaveLength(1);
      expect(detailBody.notes[0].body).toBe('Customer asked for a refund via email.');
    });

    it('rejects an empty note body', async () => {
      const order = await makeOrder('pending');
      const res = await notesPOST(
        authed(`http://localhost/api/admin/orders/${order.id}/notes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: '' }),
        }),
        { params: Promise.resolve({ id: order.id }) }
      );
      expect(res.status).toBe(400);
    });

    it('rejects an oversized note body (>2000 chars)', async () => {
      const order = await makeOrder('pending');
      const res = await notesPOST(
        authed(`http://localhost/api/admin/orders/${order.id}/notes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: 'x'.repeat(2001) }),
        }),
        { params: Promise.resolve({ id: order.id }) }
      );
      expect(res.status).toBe(400);
    });

    it('returns 404 when noting an unknown order', async () => {
      const id = '00000000-0000-0000-0000-000000000000';
      const res = await notesPOST(
        authed(`http://localhost/api/admin/orders/${id}/notes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body: 'hello' }),
        }),
        { params: Promise.resolve({ id }) }
      );
      expect(res.status).toBe(404);
    });
  });
});
