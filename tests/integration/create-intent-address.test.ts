import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRODUCT } from '@/lib/config/product';

const hasDb = Boolean(process.env.DATABASE_URL);

let mockRefCounter = 0;
const mockRunId = Date.now();
vi.mock('@/lib/payments', () => ({
  createPaymentIntent: vi.fn().mockImplementation(async () => {
    const ref = `pi_addr_${mockRunId}_${++mockRefCounter}`;
    return { providerRef: ref, clientSecret: `${ref}_secret` };
  }),
}));

// Zod-only address validation (no external provider). Normalization is pure
// and deterministic — trims + uppercases country + cleans postal — so the
// stored snapshot is the trimmed input, not a provider-rewritten address.
const ADDRESS = {
  recipientName: '  Jane Doe ',
  country: 'au',
  state: 'VIC',
  city: 'Melbourne',
  line1: ' 123 example st ',
  postalCode: '3000',
};

describe.skipIf(!hasDb)('POST /api/checkout/create-intent (shipping address)', () => {
  let db: typeof import('@/lib/db').db;
  let users: typeof import('@/lib/db/schema').users;
  let orders: typeof import('@/lib/db/schema').orders;
  let shippingAddresses: typeof import('@/lib/db/schema').shippingAddresses;
  let userRepo: typeof import('@/features/checkout/data/user.repository');
  let POST: typeof import('@/app/api/checkout/create-intent/route').POST;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeEach(async () => {
    ({ db } = await import('@/lib/db'));
    ({ users, orders, shippingAddresses } = await import('@/lib/db/schema'));
    userRepo = await import('@/features/checkout/data/user.repository');
    ({ POST } = await import('@/app/api/checkout/create-intent/route'));
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    if (createdOrderIds.length) {
      await db.delete(shippingAddresses).where(inArray(shippingAddresses.orderId, createdOrderIds));
      await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    }
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  function req(body: unknown) {
    return new Request('http://localhost/api/checkout/create-intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function makeVerifiedUser() {
    const email = `addr-${Date.now()}-${Math.random()}@example.com`;
    const user = await userRepo.createOrFindUser(email, '+15551234567');
    createdUserIds.push(user.id);
    const { eq } = await import('drizzle-orm');
    await db
      .update(users)
      .set({ verified: true, verifiedAt: new Date() })
      .where(eq(users.id, user.id));
    return { email, id: user.id };
  }

  async function orderCountForUser(userId: string) {
    const { eq } = await import('drizzle-orm');
    return db.select().from(orders).where(eq(orders.userId, userId));
  }

  it('creates an order + normalized snapshot for a valid address', async () => {
    const { email } = await makeVerifiedUser();

    const res = await POST(req({ email, shippingAddress: ADDRESS }));
    expect(res.status).toBe(200);
    const body = await res.json();
    createdOrderIds.push(body.orderId);
    expect(body.paymentIntentId).toMatch(/^pi_addr_/);

    const { eq } = await import('drizzle-orm');
    const [order] = await db.select().from(orders).where(eq(orders.id, body.orderId));
    expect(order.quantity).toBe(1);
    expect(order.amount).toBe(PRODUCT.unitAmount);

    const [snap] = await db
      .select()
      .from(shippingAddresses)
      .where(eq(shippingAddresses.orderId, body.orderId));
    expect(snap.line1).toBe('123 example st'); // trimmed input (pure normalization)
    expect(snap.country).toBe('AU'); // uppercased
    expect(snap.phone).toBe('+15551234567'); // = WhatsApp number
  });

  it('rejects an out-of-allow-list country with 422 (no order)', async () => {
    const { email, id } = await makeVerifiedUser();
    const res = await POST(req({ email, shippingAddress: { ...ADDRESS, country: 'ZZ' } }));
    expect(res.status).toBe(422);
    expect(await orderCountForUser(id)).toHaveLength(0);
  });

  it('rejects a postal code that is invalid for the country with 422 (no order)', async () => {
    const { email, id } = await makeVerifiedUser();
    const res = await POST(req({ email, shippingAddress: { ...ADDRESS, postalCode: 'ABChjk' } }));
    expect(res.status).toBe(422);
    expect(await orderCountForUser(id)).toHaveLength(0);
  });

  it('rejects a malformed body (missing required field) with 400', async () => {
    const { email } = await makeVerifiedUser();
    const { recipientName: _omit, ...noName } = ADDRESS;
    const res = await POST(req({ email, shippingAddress: noName }));
    expect(res.status).toBe(400);
  });
});
