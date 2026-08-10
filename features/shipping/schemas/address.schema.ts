import { z } from 'zod';

// Structured shipping address — STRUCTURAL floor only (feature 005, FR-006).
// Required, length-bounded, country a 2-letter code (uppercased). The
// ships-to allow-list + per-country postal format are checked in the route so
// they can return 422 `address_invalid` (distinct from a 400 for a malformed
// body); deliverability + normalization come from the AddressValidator on top.
// The recipient phone is NOT here — it is the customer's WhatsApp number,
// snapshotted server-side.
const trimmed = (max: number) => z.string().trim().min(1).max(max);

export const shippingAddressSchema = z.object({
  recipientName: trimmed(200),
  country: z
    .string()
    .trim()
    .length(2)
    .transform((s) => s.toUpperCase()),
  state: trimmed(100),
  city: trimmed(100),
  line1: trimmed(300),
  line2: z.string().trim().max(300).optional(),
  postalCode: trimmed(20),
});

export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;
