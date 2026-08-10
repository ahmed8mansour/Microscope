import 'server-only';

import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, analyticsEvents } from '@/lib/db/schema';
import { REPORTING_TIMEZONE } from '@/lib/config/analytics';
import { conversionRate as calcConversionRate, paymentSuccessRate as calcSuccessRate } from '../domain/conversion';

export interface AnalyticsRange {
  from: Date;
  to: Date;
}

export interface RevenuePoint {
  date: string; // YYYY-MM-DD, local reporting-tz calendar day
  amount: number;
}

export interface OrdersPoint {
  date: string;
  count: number;
}

export interface TrafficSource {
  source: string;
  entries: number;
  share: number;
}

export interface AnalyticsSeries {
  revenueOverTime: RevenuePoint[];
  ordersPerDay: OrdersPoint[];
  paymentSuccessRate: number;
  conversionRate: number;
  trafficSources: TrafficSource[];
}

// FR-021..FR-025. Grouped queries in the fixed reporting timezone (research
// R6). `paymentSuccessRate` treats `refunded` as a successful payment
// ATTEMPT (the charge did succeed; the refund is a later, separate event —
// matches FR-023's "payment succeeded" framing). `conversionRate` instead
// follows FR-010's literal "payment status is Success" — a since-refunded
// order no longer counts, matching the dashboard card's definition.
export async function getAnalyticsSeries(range: AnalyticsRange): Promise<AnalyticsSeries> {
  // REPORTING_TIMEZONE is a hardcoded internal constant, never user input —
  // safe to inline as raw SQL text. This matters beyond convenience: a
  // *parameterized* `${tz}` would bind the same value to a DIFFERENT
  // placeholder ($1, $5, $6…) at each occurrence, and Postgres validates
  // that a SELECT expression matches its GROUP BY/ORDER BY expression at
  // parse time — before parameters are bound — so syntactically distinct
  // placeholders fail that check even though they'd resolve identically at
  // runtime ("column must appear in the GROUP BY clause"). Inlining the
  // same literal text everywhere keeps the expressions textually identical.
  const tzLiteral = sql.raw(`'${REPORTING_TIMEZONE}'`);
  const dayTrunc = (column: typeof orders.paidAt | typeof orders.createdAt) =>
    sql`date_trunc('day', ${column} at time zone ${tzLiteral})`;

  const revenueRows = await db
    .select({
      day: sql<string>`to_char(${dayTrunc(orders.paidAt)}, 'YYYY-MM-DD')`,
      amount: sql<number>`sum(${orders.amount})`.mapWith(Number),
    })
    .from(orders)
    .where(and(eq(orders.paymentStatus, 'success'), gte(orders.paidAt, range.from), lt(orders.paidAt, range.to)))
    .groupBy(dayTrunc(orders.paidAt))
    .orderBy(dayTrunc(orders.paidAt));

  const ordersRows = await db
    .select({
      day: sql<string>`to_char(${dayTrunc(orders.createdAt)}, 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(orders)
    .where(and(gte(orders.createdAt, range.from), lt(orders.createdAt, range.to)))
    .groupBy(dayTrunc(orders.createdAt))
    .orderBy(dayTrunc(orders.createdAt));

  const inRangeCreated = (statuses: readonly string[]) =>
    and(inArray(orders.paymentStatus, statuses), gte(orders.createdAt, range.from), lt(orders.createdAt, range.to));

  const [attemptedRow] = await db
    .select({ value: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(inRangeCreated(['success', 'refunded', 'failed']));

  const [paidRow] = await db
    .select({ value: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(inRangeCreated(['success', 'refunded']));

  const [successOnlyRow] = await db
    .select({ value: sql<number>`count(*)`.mapWith(Number) })
    .from(orders)
    .where(inRangeCreated(['success']));

  const entryFilter = and(
    eq(analyticsEvents.step, 'entry'),
    gte(analyticsEvents.createdAt, range.from),
    lt(analyticsEvents.createdAt, range.to)
  );

  const [entriesRow] = await db
    .select({ value: sql<number>`count(*)`.mapWith(Number) })
    .from(analyticsEvents)
    .where(entryFilter);

  const sourceRows = await db
    .select({
      source: sql<string>`coalesce(${analyticsEvents.source}, 'unknown')`,
      value: sql<number>`count(*)`.mapWith(Number),
    })
    .from(analyticsEvents)
    .where(entryFilter)
    .groupBy(sql`coalesce(${analyticsEvents.source}, 'unknown')`);

  const totalEntries = entriesRow?.value ?? 0;
  const trafficSources: TrafficSource[] = sourceRows.map((row) => ({
    source: row.source,
    entries: row.value,
    share: totalEntries > 0 ? row.value / totalEntries : 0,
  }));

  return {
    revenueOverTime: revenueRows.map((r) => ({ date: r.day, amount: r.amount })),
    ordersPerDay: ordersRows.map((r) => ({ date: r.day, count: r.count })),
    paymentSuccessRate: calcSuccessRate(paidRow?.value ?? 0, attemptedRow?.value ?? 0),
    conversionRate: calcConversionRate(successOnlyRow?.value ?? 0, totalEntries),
    trafficSources,
  };
}
