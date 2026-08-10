import { describe, expect, it } from 'vitest';
import { conversionRate, paymentSuccessRate } from '@/features/admin/domain/conversion';

describe('conversionRate', () => {
  it('computes success orders ÷ funnel entries', () => {
    expect(conversionRate(5, 100)).toBe(0.05);
    expect(conversionRate(1, 3)).toBeCloseTo(0.3333, 4);
  });

  it('returns 0 when there are no funnel entries (no divide-by-zero)', () => {
    expect(conversionRate(0, 0)).toBe(0);
    expect(conversionRate(5, 0)).toBe(0);
  });

  it('returns 1 when every funnel entry converted', () => {
    expect(conversionRate(10, 10)).toBe(1);
  });
});

describe('paymentSuccessRate', () => {
  it('computes successful payments ÷ total attempts', () => {
    expect(paymentSuccessRate(9, 10)).toBe(0.9);
  });

  it('returns 0 when there are no payment attempts (no divide-by-zero)', () => {
    expect(paymentSuccessRate(0, 0)).toBe(0);
  });

  it('returns 1 when every attempt succeeded', () => {
    expect(paymentSuccessRate(4, 4)).toBe(1);
  });
});
