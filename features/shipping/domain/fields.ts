// Canonical shipping-address field mapping (feature 005). ORDERED and LABELLED
// to match the AliExpress/Alibaba delivery-address order form, and mapped to the
// AliExpress dropshipping order-address field names. This is the SINGLE SOURCE
// OF TRUTH the checkout address form, the stored snapshot, and the admin
// copy-ready fulfillment panel all read from — so the three cannot drift and
// the admin can paste field-for-field into the supplier form. A drift between
// this list and the Zod schema is caught by tests/unit/address-schema.test.ts.

export type AddressFieldKey =
  | 'country'
  | 'recipientName'
  | 'phone'
  | 'line1'
  | 'line2'
  | 'city'
  | 'state'
  | 'postalCode';

export interface AddressFieldDef {
  key: AddressFieldKey;
  /** Label shown on the checkout form and the admin panel (AliExpress wording). */
  label: string;
  /** Corresponding AliExpress dropshipping order-address field name. */
  supplierField: string;
  /** Optional on the form (AliExpress marks line 2 optional). */
  optional?: boolean;
  /** Not entered by the customer — sourced from their verified WhatsApp number. */
  fromWhatsApp?: boolean;
  /** HTML autocomplete token for the checkout input. */
  autoComplete?: string;
}

// Order mirrors the AliExpress "Add delivery address" form, top to bottom.
export const ADDRESS_FIELDS: readonly AddressFieldDef[] = [
  { key: 'country', label: 'Country/Region', supplierField: 'country', autoComplete: 'country' },
  { key: 'recipientName', label: 'Contact name', supplierField: 'contactPerson', autoComplete: 'name' },
  { key: 'phone', label: 'Mobile number', supplierField: 'mobileNo', fromWhatsApp: true, autoComplete: 'tel' },
  { key: 'line1', label: 'Street address', supplierField: 'address', autoComplete: 'address-line1' },
  { key: 'line2', label: 'Apt, suite, unit', supplierField: 'address2', optional: true, autoComplete: 'address-line2' },
  { key: 'city', label: 'City', supplierField: 'city', autoComplete: 'address-level2' },
  { key: 'state', label: 'State/Province', supplierField: 'province', autoComplete: 'address-level1' },
  { key: 'postalCode', label: 'Zip/Postal code', supplierField: 'zip', autoComplete: 'postal-code' },
] as const;

// The subset the customer types on the checkout form — everything except the
// phone, which is snapshotted from their WhatsApp number.
export const ADDRESS_FORM_FIELDS: readonly AddressFieldDef[] = ADDRESS_FIELDS.filter(
  (f) => !f.fromWhatsApp
);
