import { describe, expect, it } from 'vitest';
import {
  contactSchema,
  otpCodeSchema,
  verifyOtpSchema,
  createIntentRequestSchema,
} from '@/features/checkout/schemas/checkout.schema';

describe('contactSchema', () => {
  const valid = { email: 'buyer@example.com', whatsapp: '+15551234567' };

  it('accepts valid contact input', () => {
    expect(contactSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a malformed email', () => {
    expect(() => contactSchema.parse({ ...valid, email: 'not-an-email' })).toThrow();
  });

  it('rejects an empty whatsapp number', () => {
    expect(() => contactSchema.parse({ ...valid, whatsapp: '   ' })).toThrow();
  });
});

describe('otpCodeSchema', () => {
  it('accepts a 6-digit code', () => {
    expect(otpCodeSchema.parse('123456')).toBe('123456');
  });

  it('rejects a 5-digit code', () => {
    expect(() => otpCodeSchema.parse('12345')).toThrow();
  });

  it('rejects a non-numeric code', () => {
    expect(() => otpCodeSchema.parse('12345a')).toThrow();
  });
});

describe('verifyOtpSchema', () => {
  it('accepts email + 6-digit code', () => {
    const valid = { email: 'buyer@example.com', code: '123456' };
    expect(verifyOtpSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a malformed email', () => {
    expect(() => verifyOtpSchema.parse({ email: 'nope', code: '123456' })).toThrow();
  });
});

describe('createIntentRequestSchema', () => {
  // Feature 005: create-intent now requires a structured shipping address; the
  // server still derives the price (quantity defaults to 1 here and is adjusted
  // on the payment step).
  const address = {
    recipientName: 'Jane Doe',
    country: 'AU',
    state: 'VIC',
    city: 'Melbourne',
    line1: '123 Example St',
    postalCode: '3000',
  };

  it('accepts email + shipping address + quantity (server derives price)', () => {
    const parsed = createIntentRequestSchema.parse({
      email: 'buyer@example.com',
      shippingAddress: address,
      quantity: 2,
    });
    expect(parsed.email).toBe('buyer@example.com');
    expect(parsed.shippingAddress.country).toBe('AU');
    expect(parsed.quantity).toBe(2);
  });

  it('requires a shipping address', () => {
    expect(
      createIntentRequestSchema.safeParse({ email: 'buyer@example.com', quantity: 1 }).success
    ).toBe(false);
  });

  it('requires a quantity', () => {
    expect(
      createIntentRequestSchema.safeParse({ email: 'buyer@example.com', shippingAddress: address })
        .success
    ).toBe(false);
  });

  it('rejects a non-positive or non-integer quantity', () => {
    expect(
      createIntentRequestSchema.safeParse({ email: 'buyer@example.com', shippingAddress: address, quantity: 0 }).success
    ).toBe(false);
    expect(
      createIntentRequestSchema.safeParse({ email: 'buyer@example.com', shippingAddress: address, quantity: 1.5 }).success
    ).toBe(false);
  });

  it('rejects a client-supplied amount rather than trusting it (strict)', () => {
    // The server price is authoritative (FR-015); a client `amount` must not
    // survive strict parsing.
    const parsed = createIntentRequestSchema.safeParse({
      email: 'buyer@example.com',
      shippingAddress: address,
      quantity: 1,
      amount: 1,
    });
    expect(parsed.success).toBe(false);
  });
});
