import 'server-only';

import { count, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, analyticsEvents } from '@/lib/db/schema';
import { PAYMENT_STATUSES, type PaymentStatus } from '@/features/orders';
import { PRODUCT } from '@/lib/config/product';
import {
  allTimeRevenue,
  sumRevenue,
  todayWindow,
  monthWindow,
  type RevenueOrderLike,
} from '../domain/revenue';
import { conversionRate as calcConversionRate } from '../domain/conversion';
import type { DashboardMetrics } from '../types';

export type { DashboardMetrics } from '../types';

// FR-007..FR-011. Dashboard-home summary cards, derived entirely from
// server-side sources of truth (orders + first-party analytics events).
export async function getDashboardMetrics(now: Date = new Date()): Promise<DashboardMetrics> {
  const [totalRow] = await db.select({ value: count() }).from(orders);
  const totalOrders = totalRow?.value ?? 0;

  const statusRows = await db
    .select({ status: orders.paymentStatus, value: count() })
    .from(orders)
    .groupBy(orders.paymentStatus);
  const paymentsByStatus = Object.fromEntries(
    PAYMENT_STATUSES.map((status) => [status, 0])
  ) as Record<PaymentStatus, number>;
  for (const row of statusRows) {
    if ((PAYMENT_STATUSES as readonly string[]).includes(row.status)) {
      paymentsByStatus[row.status as PaymentStatus] = row.value;
    }
  }

  const successRows = await db
    .select({ amount: orders.amount, paymentStatus: orders.paymentStatus, paidAt: orders.paidAt })
    .from(orders)
    .where(eq(orders.paymentStatus, 'success'));
  const revenueOrders: RevenueOrderLike[] = successRows.map((row) => ({
    amount: row.amount,
    paymentStatus: row.paymentStatus,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
  }));

  const revenue = {
    today: sumRevenue(revenueOrders, todayWindow(now)),
    month: sumRevenue(revenueOrders, monthWindow(now)),
    allTime: allTimeRevenue(revenueOrders),
    currency: PRODUCT.currency,
  };

  // The `analytics_events` partial unique index (session_id where
  // step='entry') already guarantees at most one entry row per session, so
  // a plain count here is already a distinct-session count (research R9).
  const [entryRow] = await db
    .select({ value: count() })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.step, 'entry'));
  const funnelEntries = entryRow?.value ?? 0;

  return {
    totalOrders,
    paymentsByStatus,
    revenue,
    conversionRate: calcConversionRate(paymentsByStatus.success, funnelEntries),
  };
}
