import { describe, expect, it } from 'vitest';
import {
  canFulfill,
  isValidTransition,
  PAYMENT_STATUSES,
  type PaymentStatus,
} from '@/features/orders/domain/payment-status';

describe('isValidTransition', () => {
  const allowed: [PaymentStatus, PaymentStatus][] = [
    ['pending', 'success'],
    ['pending', 'failed'],
    ['failed', 'pending'],
    ['failed', 'success'],
    ['success', 'refunded'],
  ];

  it.each(allowed)('allows %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(true);
  });

  const disallowed: [PaymentStatus, PaymentStatus][] = [
    ['failed', 'refunded'],
    ['refunded', 'success'],
    ['refunded', 'pending'],
    ['refunded', 'failed'],
    ['success', 'pending'],
    ['success', 'failed'],
    ['pending', 'refunded'],
  ];

  it.each(disallowed)('rejects %s -> %s', (from, to) => {
    expect(isValidTransition(from, to)).toBe(false);
  });

  it.each(PAYMENT_STATUSES)('treats %s -> %s (same status) as a no-op success', (status) => {
    expect(isValidTransition(status, status)).toBe(true);
  });
});

describe('canFulfill', () => {
  it('is true only for success', () => {
    expect(canFulfill('success')).toBe(true);
  });

  it.each(['pending', 'failed', 'refunded'] as const)('is false for %s', (status) => {
    expect(canFulfill(status)).toBe(false);
  });
});
