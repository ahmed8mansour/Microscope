import { describe, expect, it } from 'vitest';
import { PRODUCT, computeAmount } from '@/lib/config/product';
import { quantitySchema } from '@/features/orders/schemas/order.schema';

describe('computeAmount', () => {
  it('is the unit price for quantity 1', () => {
    expect(computeAmount(1)).toBe(PRODUCT.unitAmount);
  });

  it('multiplies the unit price by the quantity', () => {
    expect(computeAmount(3)).toBe(PRODUCT.unitAmount * 3);
    expect(computeAmount(100)).toBe(PRODUCT.unitAmount * 100);
  });
});

describe('quantitySchema', () => {
  it('accepts positive integers with no upper cap', () => {
    expect(quantitySchema.parse(1)).toBe(1);
    expect(quantitySchema.parse(9999)).toBe(9999);
  });

  it.each([0, -1, 2.5, Number.NaN])('rejects %p', (bad) => {
    expect(() => quantitySchema.parse(bad)).toThrow();
  });
});
