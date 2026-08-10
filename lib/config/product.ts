// Sole source of the payable amount for the single product. Not server-only:
// the amount is already public (shown on the landing/checkout/payment UI),
// so there's nothing to hide. The security property this feature relies on
// — the client can't set the charged amount — comes from the server routes
// computing the amount from `unitAmount × quantity` and never reading an
// amount from the request body (FR-002/FR-002a), not from this module being
// unimportable by client code.
export const PRODUCT = {
  unitAmount: 5900, // AUD 59.00 per unit, integer minor units (cents)
  currency: 'AUD',
} as const;

// Server-authoritative order total for a given quantity. The one place the
// unit price is multiplied out — used by create-intent and the re-price path
// so the total is always derived, never client-supplied (005).
export function computeAmount(quantity: number): number {
  return PRODUCT.unitAmount * quantity;
}

// Human-readable unit price for display, e.g. "$59 AUD". Matches the existing
// landing/checkout copy style (no decimals for a whole-dollar amount).
export function formatPrice(): string {
  return `${formatPriceShort()} ${PRODUCT.currency}`;
}

// Short form without the currency code, e.g. "$59" — for tight UI like a
// button label where the fuller "$59 AUD" reads as clutter.
export function formatPriceShort(): string {
  return `$${formatMinorUnits(PRODUCT.unitAmount)}`;
}

// Format an integer minor-unit amount (e.g. a line total `unitAmount ×
// quantity`) as a dollar string without the currency code, e.g. 26700 → "267".
export function formatAmountShort(amountMinor: number): string {
  return `$${formatMinorUnits(amountMinor)}`;
}

function formatMinorUnits(amountMinor: number): string {
  const value = amountMinor / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
