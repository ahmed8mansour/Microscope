export type { ShippingAddressInput } from '../schemas/address.schema';

// Normalized (cleaned) address values ready to store as the per-order snapshot
// (feature 005, Zod-only). Same shape as the stored row minus the phone, which
// is added from the WhatsApp number at snapshot time.
export interface NormalizedAddress {
  recipientName: string;
  country: string;
  state: string;
  city: string;
  line1: string;
  line2: string | null;
  postalCode: string;
}

// The stored per-order snapshot as shown to the admin (feature 005). `phone`
// is the snapshotted WhatsApp number. Fields are non-null here because a
// present row was written complete at purchase; a missing snapshot is
// represented by `null` at the call site, not by empty fields.
export interface StoredShippingAddress {
  recipientName: string;
  phone: string;
  country: string;
  state: string;
  city: string;
  line1: string;
  line2: string | null;
  postalCode: string;
}
