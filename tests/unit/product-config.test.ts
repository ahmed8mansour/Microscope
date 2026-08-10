import { describe, expect, it } from 'vitest';
import { PRODUCT, computeAmount, formatAmountShort, formatPriceShort } from '@/lib/config/product';

describe('product config (feature 005 unit price × quantity)', () => {
  it('exposes a unit amount (not a per-order total)', () => {
    expect(PRODUCT.unitAmount).toBe(5900);
    expect(PRODUCT.currency).toBe('AUD');
  });

  it('computeAmount multiplies unit price by quantity', () => {
    expect(computeAmount(1)).toBe(5900);
    expect(computeAmount(3)).toBe(17700);
  });

  it('formats a whole-dollar total without decimals', () => {
    expect(formatAmountShort(17700)).toBe('$177');
    expect(formatPriceShort()).toBe('$59');
  });

  it('formats a fractional amount with two decimals', () => {
    expect(formatAmountShort(26750)).toBe('$267.50');
  });
});
