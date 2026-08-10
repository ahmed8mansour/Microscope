export const PAYMENT_STATUSES = ['pending', 'success', 'failed', 'refunded'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export function isPaymentStatus(value: string): value is PaymentStatus {
  return (PAYMENT_STATUSES as readonly string[]).includes(value);
}

// See specs/001-data-payment-foundation/data-model.md "Allowed status transitions".
// pending -> success | failed
// failed  -> pending | success   (retry: FR-007a)
// success -> refunded
// refunded is terminal.
const ALLOWED_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['success', 'failed'],
  failed: ['pending', 'success'],
  success: ['refunded'],
  refunded: [],
};

/**
 * True if `from -> to` is an allowed transition, or a no-op re-application of
 * the current status (idempotent under duplicate webhook deliveries).
 */
export function isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

// Fulfillment is only permitted on a successfully paid order (FR-006, SC-005).
export function canFulfill(status: PaymentStatus): boolean {
  return status === 'success';
}
