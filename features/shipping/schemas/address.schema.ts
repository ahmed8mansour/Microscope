import { z } from 'zod';
import { isValidCountryCode } from '@/lib/config/countries';

// Structured shipping address — the ONLY server-side gate (feature 005 / Places
// autocomplete revision). There is no external validation API and no ships-to
// allow-list: the browser's Google Places autocomplete keeps real users honest,
// and this thin structural floor is all the server needs to reject tampered /
// scripted requests and satisfy the DB CHECK constraints. For a form-completing
// customer it always passes silently.
//
// The recipient phone is NOT here — it is the customer's WhatsApp number,
// snapshotted server-side.
const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const shippingAddressSchema = z.object({
  recipientName: trimmed(1, 200),
  // Any real ISO 3166-1 alpha-2 code (uppercased first). Structural only — we
  // no longer restrict which countries can be chosen.
  country: z
    .string()
    .trim()
    .length(2)
    .transform((s) => s.toUpperCase())
    .refine(isValidCountryCode, { message: 'Select a valid country' }),
  state: trimmed(1, 100),
  // Suburb / city — 2–64 chars (feature: Alibaba-style form).
  city: trimmed(2, 64),
  line1: trimmed(1, 300),
  line2: z.string().trim().max(300).optional(),
  // Generic postal code — no per-country format check (we ship broadly now).
  postalCode: trimmed(1, 12),
});

export type ShippingAddressInput = z.infer<typeof shippingAddressSchema>;
