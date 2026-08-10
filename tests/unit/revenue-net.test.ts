import { describe, expect, it } from 'vitest';
import { allTimeRevenue, monthWindow, sumRevenue, todayWindow } from '@/features/admin/domain/revenue';

const TZ = 'Australia/Melbourne';

describe('admin revenue — net of refunds + fixed-tz windows (research R6)', () => {
  describe('todayWindow', () => {
    it('spans local midnight to midnight for a mid-day instant (AEST, UTC+10)', () => {
      // 2026-06-15 12:00 local AEST == 2026-06-15 02:00Z.
      const now = new Date('2026-06-15T02:00:00Z');
      const { start, end } = todayWindow(now, TZ);
      expect(start.toISOString()).toBe('2026-06-14T14:00:00.000Z');
      expect(end.toISOString()).toBe('2026-06-15T14:00:00.000Z');
    });

    it('handles the AEDT→AEST DST transition (April) without an off-by-one day', () => {
      // 2026-04-05 03:00 AEDT is the DST rollback instant in Melbourne.
      // A day either side must still resolve to correct, distinct windows.
      const before = todayWindow(new Date('2026-04-04T12:00:00Z'), TZ); // still AEDT (UTC+11)
      const after = todayWindow(new Date('2026-04-06T12:00:00Z'), TZ); // now AEST (UTC+10)
      expect(before.start.getTime()).toBeLessThan(after.start.getTime());
      // Each window is a distinct, well-formed 23/24/25-hour local day.
      const hoursBefore = (before.end.getTime() - before.start.getTime()) / 3_600_000;
      const hoursAfter = (after.end.getTime() - after.start.getTime()) / 3_600_000;
      expect(hoursBefore).toBeGreaterThanOrEqual(23);
      expect(hoursBefore).toBeLessThanOrEqual(25);
      expect(hoursAfter).toBeGreaterThanOrEqual(23);
      expect(hoursAfter).toBeLessThanOrEqual(25);
    });
  });

  describe('monthWindow', () => {
    it('spans the 1st of the month to the 1st of the next month', () => {
      const now = new Date('2026-06-15T02:00:00Z');
      const { start, end } = monthWindow(now, TZ);
      expect(start.toISOString()).toBe('2026-05-31T14:00:00.000Z'); // 2026-06-01 00:00 AEST
      expect(end.toISOString()).toBe('2026-06-30T14:00:00.000Z'); // 2026-07-01 00:00 AEST
    });

    it('rolls over December into January of the next year', () => {
      const now = new Date('2026-12-20T02:00:00Z');
      const { start, end } = monthWindow(now, TZ);
      const localYearMonth = (d: Date) =>
        new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit' }).format(d);
      expect(localYearMonth(start)).toBe('2026-12');
      expect(localYearMonth(end)).toBe('2027-01');
      expect(end.getTime()).toBeGreaterThan(start.getTime());
    });
  });

  describe('sumRevenue / allTimeRevenue — net of refunds', () => {
    const window = todayWindow(new Date('2026-06-15T02:00:00Z'), TZ);
    const inWindowIso = '2026-06-15T00:00:00.000Z'; // within the window above

    it('counts only success orders paid within the window', () => {
      const orders = [
        { amount: 1000, paymentStatus: 'success', paidAt: inWindowIso },
        { amount: 2000, paymentStatus: 'pending', paidAt: null },
        { amount: 3000, paymentStatus: 'failed', paidAt: null },
      ];
      expect(sumRevenue(orders, window)).toBe(1000);
    });

    it('excludes refunded orders — net of refunds is automatic via status', () => {
      const orders = [
        { amount: 1000, paymentStatus: 'success', paidAt: inWindowIso },
        { amount: 5000, paymentStatus: 'refunded', paidAt: inWindowIso },
      ];
      expect(sumRevenue(orders, window)).toBe(1000);
      expect(allTimeRevenue(orders)).toBe(1000);
    });

    it('excludes success orders paid outside the window', () => {
      const outside = new Date(window.end.getTime() + 60_000).toISOString();
      const orders = [{ amount: 1000, paymentStatus: 'success', paidAt: outside }];
      expect(sumRevenue(orders, window)).toBe(0);
    });

    it('returns 0 for an empty order list (no divide-by-zero concerns)', () => {
      expect(sumRevenue([], window)).toBe(0);
      expect(allTimeRevenue([])).toBe(0);
    });

    it('allTimeRevenue sums every success order regardless of paidAt window', () => {
      const orders = [
        { amount: 1000, paymentStatus: 'success', paidAt: '2020-01-01T00:00:00.000Z' },
        { amount: 500, paymentStatus: 'success', paidAt: inWindowIso },
      ];
      expect(allTimeRevenue(orders)).toBe(1500);
    });
  });
});
