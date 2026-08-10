// Ships-to allow-list and per-country postal formats for the physical product
// (constitution v2.0.0). This is a *business* decision expressed as config, not
// logic — edit the country set here without touching validation code. Both the
// address Zod schema (features/shipping) and the checkout address form read
// from this module so they never drift.
//
// MVP default is intentionally conservative; widen `SHIPS_TO` as the supplier's
// shippable regions are confirmed. Codes are ISO-3166 alpha-2, uppercase.

export const SHIPS_TO = ['AU', 'NZ', 'US', 'GB', 'CA'] as const;

export type ShipsToCountry = (typeof SHIPS_TO)[number];

export function isShippableCountry(code: string): code is ShipsToCountry {
  return (SHIPS_TO as readonly string[]).includes(code);
}

// Per-country postal-code format. Kept deliberately permissive (shape, not a
// deliverability guarantee — the AddressValidator provides that); a country
// absent from this map falls back to a generic non-empty check.
export const POSTAL_FORMATS: Record<ShipsToCountry, RegExp> = {
  AU: /^\d{4}$/,
  NZ: /^\d{4}$/,
  US: /^\d{5}(-\d{4})?$/,
  GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/,
  CA: /^[A-Za-z]\d[A-Za-z]\s*\d[A-Za-z]\d$/,
};

// Validate a postal code against its country's format. Unknown countries (not
// in SHIPS_TO) return false — callers gate on SHIPS_TO first.
export function isValidPostalCode(country: string, postalCode: string): boolean {
  if (!isShippableCountry(country)) return false;
  const pattern = POSTAL_FORMATS[country];
  return pattern ? pattern.test(postalCode.trim()) : postalCode.trim().length > 0;
}
