import { describe, expect, it } from 'vitest';
import {
  createOrderSchema,
  currencySchema,
  moneySchema,
} from '@/features/orders/schemas/order.schema';

const VALID_USER_ID = '11111111-1111-4111-8111-111111111111';

describe('createOrderSchema', () => {
  const valid = { userId: VALID_USER_ID, amount: 4999, currency: 'usd' };

  it('accepts valid input and uppercases currency', () => {
    const result = createOrderSchema.parse(valid);
    // Feature 005: quantity defaults to 1 when omitted.
    expect(result).toEqual({ ...valid, currency: 'USD', quantity: 1 });
  });

  it('defaults quantity to 1 and rejects a non-positive quantity', () => {
    expect(createOrderSchema.parse(valid).quantity).toBe(1);
    expect(createOrderSchema.parse({ ...valid, quantity: 4 }).quantity).toBe(4);
    expect(() => createOrderSchema.parse({ ...valid, quantity: 0 })).toThrow();
  });

  it('rejects a malformed userId', () => {
    expect(() => createOrderSchema.parse({ ...valid, userId: 'not-a-uuid' })).toThrow();
  });

  it('rejects a negative amount', () => {
    expect(() => createOrderSchema.parse({ ...valid, amount: -1 })).toThrow();
  });

  it('rejects a non-integer amount', () => {
    expect(() => createOrderSchema.parse({ ...valid, amount: 49.99 })).toThrow();
  });

  it('rejects a 2-character currency code', () => {
    expect(() => createOrderSchema.parse({ ...valid, currency: 'US' })).toThrow();
  });

  it('rejects a 4-character currency code', () => {
    expect(() => createOrderSchema.parse({ ...valid, currency: 'USDD' })).toThrow();
  });
});

describe('individual field schemas', () => {
  it('moneySchema accepts zero', () => {
    expect(moneySchema.parse(0)).toBe(0);
  });

  it('currencySchema uppercases a lowercase code', () => {
    expect(currencySchema.parse('eur')).toBe('EUR');
  });
});
