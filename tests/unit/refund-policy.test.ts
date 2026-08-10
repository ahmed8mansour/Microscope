import { describe, expect, it } from 'vitest';
import { isRefundable, REFUND_WINDOW_DAYS } from '@/features/admin/domain/refund-policy';

const NOW = new Date('2026-08-01T00:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function paidDaysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

describe('isRefundable — eligibility matrix (research R5)', () => {
  it('is refundable: success, paid within the window', () => {
    expect(isRefundable({ paymentStatus: 'success', paidAt: paidDaysAgo(1) }, NOW)).toBe(true);
    expect(isRefundable({ paymentStatus: 'success', paidAt: paidDaysAgo(89) }, NOW)).toBe(true);
  });

  it('is refundable exactly at the 90-day boundary', () => {
    expect(isRefundable({ paymentStatus: 'success', paidAt: paidDaysAgo(REFUND_WINDOW_DAYS) }, NOW)).toBe(true);
  });

  it('is NOT refundable just past the 90-day boundary', () => {
    expect(
      isRefundable({ paymentStatus: 'success', paidAt: paidDaysAgo(REFUND_WINDOW_DAYS + 1) }, NOW)
    ).toBe(false);
  });

  it('is not refundable when payment status is pending', () => {
    expect(isRefundable({ paymentStatus: 'pending', paidAt: null }, NOW)).toBe(false);
  });

  it('is not refundable when payment status is failed', () => {
    expect(isRefundable({ paymentStatus: 'failed', paidAt: null }, NOW)).toBe(false);
  });

  it('is not refundable when already refunded', () => {
    expect(isRefundable({ paymentStatus: 'refunded', paidAt: paidDaysAgo(1) }, NOW)).toBe(false);
  });

  it('is not refundable when paidAt is missing (should not happen for `success`, defensive)', () => {
    expect(isRefundable({ paymentStatus: 'success', paidAt: null }, NOW)).toBe(false);
  });
});
