// Pure conversion / payment-success rate math. Both guard against a zero
// denominator (spec edge case "Empty store" — a defined 0 value, not a
// divide-by-zero error).

export function conversionRate(successOrders: number, funnelEntries: number): number {
  if (funnelEntries <= 0) return 0;
  return successOrders / funnelEntries;
}

export function paymentSuccessRate(successOrders: number, totalAttempts: number): number {
  if (totalAttempts <= 0) return 0;
  return successOrders / totalAttempts;
}
