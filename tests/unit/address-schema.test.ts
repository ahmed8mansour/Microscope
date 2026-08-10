import { describe, expect, it } from 'vitest';
import {
  shippingAddressSchema,
  normalizeAddress,
  ADDRESS_FIELDS,
  ADDRESS_FORM_FIELDS,
} from '@/features/shipping';
import { isShippableCountry, isValidPostalCode } from '@/lib/config/shipping';

const valid = {
  recipientName: 'Jane Doe',
  country: 'AU',
  state: 'VIC',
  city: 'Melbourne',
  line1: '123 Example St',
  postalCode: '3000',
};

describe('shippingAddressSchema (structural)', () => {
  it('accepts a valid address and uppercases the country', () => {
    const r = shippingAddressSchema.parse({ ...valid, country: 'au' });
    expect(r.country).toBe('AU');
  });

  it('rejects missing required fields', () => {
    expect(() => shippingAddressSchema.parse({ ...valid, recipientName: '' })).toThrow();
    expect(() => shippingAddressSchema.parse({ ...valid, line1: '' })).toThrow();
  });

  it('rejects a country that is not a 2-letter code', () => {
    expect(() => shippingAddressSchema.parse({ ...valid, country: 'USA' })).toThrow();
  });

  it('allows an omitted line2', () => {
    expect(() => shippingAddressSchema.parse(valid)).not.toThrow();
  });

  it('bounds field length', () => {
    expect(() => shippingAddressSchema.parse({ ...valid, recipientName: 'x'.repeat(201) })).toThrow();
  });
});

describe('AliExpress field sync (guarantee: schema ↔ form ↔ supplier mapping)', () => {
  it('the checkout form fields are exactly the schema keys', () => {
    const schemaKeys = Object.keys(shippingAddressSchema.shape).sort();
    const formKeys = ADDRESS_FORM_FIELDS.map((f) => f.key).sort();
    expect(formKeys).toEqual(schemaKeys);
  });

  it('every canonical field maps to a supplier field; phone comes from WhatsApp', () => {
    for (const f of ADDRESS_FIELDS) {
      expect(f.supplierField.length).toBeGreaterThan(0);
    }
    const phone = ADDRESS_FIELDS.find((f) => f.key === 'phone');
    expect(phone?.fromWhatsApp).toBe(true);
    // The form excludes exactly the phone (sourced from WhatsApp).
    expect(ADDRESS_FIELDS.length - ADDRESS_FORM_FIELDS.length).toBe(1);
    expect(ADDRESS_FORM_FIELDS.some((f) => f.key === 'phone')).toBe(false);
  });
});

describe('normalizeAddress (Zod-only, deterministic)', () => {
  it('trims, uppercases the country, and cleans the postal code', () => {
    const n = normalizeAddress({
      recipientName: '  Jane Doe ',
      country: 'au',
      state: ' VIC ',
      city: ' Melbourne ',
      line1: ' 123 Example St ',
      postalCode: ' 3000 ',
    });
    expect(n).toEqual({
      recipientName: 'Jane Doe',
      country: 'AU',
      state: 'VIC',
      city: 'Melbourne',
      line1: '123 Example St',
      line2: null,
      postalCode: '3000',
    });
  });

  it('keeps a provided line2', () => {
    const n = normalizeAddress({
      recipientName: 'Jane',
      country: 'AU',
      state: 'VIC',
      city: 'Melbourne',
      line1: '123 Example St',
      line2: '  Unit 4 ',
      postalCode: '3000',
    });
    expect(n.line2).toBe('Unit 4');
  });
});

describe('ships-to allow-list + postal format', () => {
  it('gates on the allow-list', () => {
    expect(isShippableCountry('AU')).toBe(true);
    expect(isShippableCountry('ZZ')).toBe(false);
  });

  it('validates postal format per country', () => {
    expect(isValidPostalCode('AU', '3000')).toBe(true);
    expect(isValidPostalCode('AU', '30')).toBe(false);
    expect(isValidPostalCode('US', '90210')).toBe(true);
    expect(isValidPostalCode('US', 'ABCDE')).toBe(false);
    expect(isValidPostalCode('ZZ', '3000')).toBe(false);
  });
});
