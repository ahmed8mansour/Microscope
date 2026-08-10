import type { ShippingAddressInput } from '../schemas/address.schema';
import type { NormalizedAddress } from '../types';

// Pure, deterministic normalization (Zod-only — no external provider). Trims
// every field, uppercases the ISO country, and cleans the postal code
// (uppercase, single-spaced) so the stored snapshot is consistent and
// paste-ready for the supplier form. The Zod schema already trims/uppercases;
// this keeps normalization self-contained and testable.
export function normalizeAddress(input: ShippingAddressInput): NormalizedAddress {
  const line2 = input.line2 ? input.line2.trim() : '';
  return {
    recipientName: input.recipientName.trim(),
    country: input.country.trim().toUpperCase(),
    state: input.state.trim(),
    city: input.city.trim(),
    line1: input.line1.trim(),
    line2: line2.length ? line2 : null,
    postalCode: input.postalCode.trim().toUpperCase().replace(/\s+/g, ' '),
  };
}
