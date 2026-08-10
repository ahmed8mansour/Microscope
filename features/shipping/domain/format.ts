import type { StoredShippingAddress } from '../types';

// Canonical supplier-form field order (feature 005, D7) — the same field order
// an AliExpress/Alibaba order form expects, so the admin panel maps
// field-for-field. Each field's `value` is the stored normalized value
// byte-for-byte (SC-005), safe to paste without transformation.
export interface FulfillmentField {
  key: string;
  label: string;
  value: string;
}

export function fulfillmentFields(
  address: StoredShippingAddress,
  quantity: number
): FulfillmentField[] {
  return [
    { key: 'recipientName', label: 'Recipient name', value: address.recipientName },
    { key: 'phone', label: 'Phone', value: address.phone },
    { key: 'country', label: 'Country', value: address.country },
    { key: 'state', label: 'State / province', value: address.state },
    { key: 'city', label: 'City', value: address.city },
    { key: 'line1', label: 'Address line 1', value: address.line1 },
    { key: 'line2', label: 'Address line 2', value: address.line2 ?? '' },
    { key: 'postalCode', label: 'Postal code', value: address.postalCode },
    { key: 'quantity', label: 'Quantity', value: String(quantity) },
  ];
}

// "Copy all" block — one `Label: value` per line, in supplier-form order.
export function fulfillmentCopyAll(address: StoredShippingAddress, quantity: number): string {
  return fulfillmentFields(address, quantity)
    .map((f) => `${f.label}: ${f.value}`)
    .join('\n');
}
