import { describe, expect, it } from 'vitest';
import { fulfillmentFields, fulfillmentCopyAll } from '@/features/shipping/domain/format';

const address = {
  recipientName: 'Jane Doe',
  phone: '+61400000000',
  country: 'AU',
  state: 'VIC',
  city: 'Melbourne',
  line1: '123 Normalized St',
  line2: 'Unit 4',
  postalCode: '3000',
};

describe('fulfillmentFields', () => {
  it('is in supplier-form order', () => {
    const fields = fulfillmentFields(address, 3);
    expect(fields.map((f) => f.key)).toEqual([
      'recipientName',
      'phone',
      'country',
      'state',
      'city',
      'line1',
      'line2',
      'postalCode',
      'quantity',
    ]);
  });

  it('carries values equal to the stored address byte-for-byte', () => {
    const fields = fulfillmentFields(address, 3);
    const byKey = Object.fromEntries(fields.map((f) => [f.key, f.value]));
    expect(byKey.line1).toBe('123 Normalized St');
    expect(byKey.phone).toBe('+61400000000');
    expect(byKey.quantity).toBe('3');
  });

  it('renders a null line2 as an empty string', () => {
    const fields = fulfillmentFields({ ...address, line2: null }, 1);
    expect(fields.find((f) => f.key === 'line2')!.value).toBe('');
  });
});

describe('fulfillmentCopyAll', () => {
  it('joins labeled lines in supplier-form order', () => {
    const block = fulfillmentCopyAll(address, 2);
    const lines = block.split('\n');
    expect(lines[0]).toBe('Recipient name: Jane Doe');
    expect(block).toContain('Quantity: 2');
  });
});
