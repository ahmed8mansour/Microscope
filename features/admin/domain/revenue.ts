// Pure net-of-refunds revenue windows, computed in a single fixed reporting
// timezone (`REPORTING_TIMEZONE`) so "today"/"this month" are stable and
// reconcilable rather than depending on server/browser local time (spec
// edge case "Revenue period boundaries"; research R6). Kept independent of
// the DB so window math and the net-of-refunds rule are directly
// unit-testable — `data/metrics.repository.ts` fetches orders and delegates
// the sum here.

import { REPORTING_TIMEZONE } from '@/lib/config/analytics';

export interface RevenueWindow {
  start: Date; // inclusive
  end: Date; // exclusive
}

export interface RevenueOrderLike {
  amount: number;
  paymentStatus: string;
  paidAt: string | null;
}

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
}

function localParts(instant: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// Offset (minutes, east-positive) of `timeZone` at `instant`.
function tzOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second')
  );
  return (asUtc - instant.getTime()) / 60_000;
}

// The UTC instant corresponding to local midnight on the given calendar
// date in `timeZone` — DST-safe (recomputes the offset at the guess, one
// correction pass is sufficient since offsets change in whole minutes at
// fixed transition instants, not continuously).
function localMidnightUtc(parts: DateParts, timeZone: string): Date {
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
  const offsetMinutes = tzOffsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offsetMinutes * 60_000);
}

// Calendar-date arithmetic only (no timezone involved) — JS Date rolls over
// month/year correctly for out-of-range day/month values.
function addCalendarDays(parts: DateParts, days: number): DateParts {
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function firstOfNextMonth(parts: DateParts): DateParts {
  return parts.month === 12
    ? { year: parts.year + 1, month: 1, day: 1 }
    : { year: parts.year, month: parts.month + 1, day: 1 };
}

export function todayWindow(now: Date, timeZone: string = REPORTING_TIMEZONE): RevenueWindow {
  const today = localParts(now, timeZone);
  const start = localMidnightUtc(today, timeZone);
  const end = localMidnightUtc(addCalendarDays(today, 1), timeZone);
  return { start, end };
}

export function monthWindow(now: Date, timeZone: string = REPORTING_TIMEZONE): RevenueWindow {
  const today = localParts(now, timeZone);
  const start = localMidnightUtc({ ...today, day: 1 }, timeZone);
  const end = localMidnightUtc(firstOfNextMonth(today), timeZone);
  return { start, end };
}

function isCountable(order: RevenueOrderLike): boolean {
  // Net of refunds is automatic: a refunded order's status is `refunded`,
  // not `success` (001's status model) — it never satisfies this check, so
  // no separate subtraction step is needed.
  return order.paymentStatus === 'success' && order.paidAt !== null;
}

export function sumRevenue(orders: readonly RevenueOrderLike[], window: RevenueWindow): number {
  return orders.reduce((total, order) => {
    if (!isCountable(order)) return total;
    const paidAt = new Date(order.paidAt as string).getTime();
    return paidAt >= window.start.getTime() && paidAt < window.end.getTime()
      ? total + order.amount
      : total;
  }, 0);
}

export function allTimeRevenue(orders: readonly RevenueOrderLike[]): number {
  return orders.reduce((total, order) => (isCountable(order) ? total + order.amount : total), 0);
}
