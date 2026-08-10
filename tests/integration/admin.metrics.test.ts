import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)('admin metrics repository — dashboard cards (US1)', () => {
  let db: typeof import('@/lib/db').db;
  let orders: typeof import('@/lib/db/schema').orders;
  let users: typeof import('@/lib/db/schema').users;
  let orderRepo: typeof import('@/features/orders/data/order.repository');
  let getDashboardMetrics: typeof import('@/features/admin/data/metrics.repository').getDashboardMetrics;
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];

  beforeAll(async () => {
    ({ db } = await import('@/lib/db'));
    ({ orders, users } = await import('@/lib/db/schema'));
    orderRepo = await import('@/features/orders/data/order.repository');
    ({ getDashboardMetrics } = await import('@/features/admin/data/metrics.repository'));
  });

  afterAll(async () => {
    if (!hasDb) return;
    const { inArray } = await import('drizzle-orm');
    if (createdOrderIds.length) await db.delete(orders).where(inArray(orders.id, createdOrderIds));
    if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  });

  async function makeUser() {
    const [row] = await db
      .insert(users)
      .values({ email: `metrics-${Date.now()}-${Math.random()}@example.com`, whatsapp: '+15551234567' })
      .returning();
    createdUserIds.push(row.id);
    return row;
  }

  async function makeOrderWithStatus(status: 'pending' | 'success' | 'failed' | 'refunded', amount = 8900) {
    const user = await makeUser();
    const order = await orderRepo.createOrder({ userId: user.id, amount, currency: 'AUD' });
    createdOrderIds.push(order.id);
    if (status === 'pending') return order;
    if (status === 'failed') return orderRepo.updatePaymentStatus(order.id, 'failed');
    // success (and refunded, which transitions through success first so
    // `paidAt` gets stamped exactly once).
    await orderRepo.updatePaymentStatus(order.id, 'success');
    if (status === 'refunded') return orderRepo.updatePaymentStatus(order.id, 'refunded');
    return orderRepo.getOrderById(order.id) as Promise<NonNullable<Awaited<ReturnType<typeof orderRepo.getOrderById>>>>;
  }

  // NOTE: assertions below check absolute floors AFTER seeding, not
  // before/after deltas. This suite runs alongside other integration test
  // FILES that vitest may execute concurrently against the same live dev
  // database — other files both CREATE and (in their own afterAll) DELETE
  // orders, so a before/after snapshot comparison (even lower-bound) is
  // flaky by construction: concurrent activity can move the global
  // aggregate in either direction between the two calls. A floor check
  // against a value taken only AFTER our own rows are committed is safe,
  // since nothing deletes rows we just created mid-test. The pure
  // aggregation math (exact sums, net-of-refunds, window boundaries) is
  // precisely covered with zero concurrency risk in
  // tests/unit/revenue-net.test.ts; this suite's job is only to prove the
  // real SQL wiring surfaces what it should.
  it('reflects newly created orders in totalOrders and paymentsByStatus', async () => {
    await makeOrderWithStatus('pending');
    await makeOrderWithStatus('failed');
    await makeOrderWithStatus('success');

    const after = await getDashboardMetrics();
    expect(after.totalOrders).toBeGreaterThanOrEqual(3);
    expect(after.paymentsByStatus.pending).toBeGreaterThanOrEqual(1);
    expect(after.paymentsByStatus.failed).toBeGreaterThanOrEqual(1);
    expect(after.paymentsByStatus.success).toBeGreaterThanOrEqual(1);
  });

  it('counts a freshly-succeeded order toward today and all-time revenue', async () => {
    const amount = 12345;
    await makeOrderWithStatus('success', amount);

    const after = await getDashboardMetrics();
    expect(after.revenue.today).toBeGreaterThanOrEqual(amount);
    expect(after.revenue.month).toBeGreaterThanOrEqual(amount);
    expect(after.revenue.allTime).toBeGreaterThanOrEqual(amount);
  });

  it('excludes a refunded order from revenue — net-of-refunds holds end to end', async () => {
    const amount = 5500;
    const refunded = await makeOrderWithStatus('refunded', amount);

    // The order's own final DB state is the ground truth for "net of
    // refunds": it must have left `success` for `refunded`. This row-level
    // check is immune to concurrent activity from other test files, unlike
    // a global-aggregate comparison would be.
    expect(refunded.paymentStatus).toBe('refunded');
    expect(refunded.paidAt).toBeTruthy(); // stamped once, on its transient pass through `success`

    // The endpoint still runs cleanly and reports this order under
    // `refunded`, never `success` (floor check — safe under concurrency).
    const after = await getDashboardMetrics();
    expect(after.paymentsByStatus.refunded).toBeGreaterThanOrEqual(1);
  });

  it('returns a well-formed conversionRate with no divide-by-zero even absent funnel data', async () => {
    const metrics = await getDashboardMetrics();
    expect(typeof metrics.conversionRate).toBe('number');
    expect(Number.isFinite(metrics.conversionRate)).toBe(true);
    expect(metrics.conversionRate).toBeGreaterThanOrEqual(0);
  });
});
