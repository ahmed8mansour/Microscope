// Pure refund eligibility (FR-032, FR-033, research R5). "Not refunded" is
// automatically satisfied by requiring `paymentStatus === 'success'` — a
// refunded order's status is `refunded`, a distinct value, not a separate
// boolean alongside `success`.
export const REFUND_WINDOW_DAYS = 90;

export interface RefundableOrder {
  paymentStatus: string;
  paidAt: string | null;
}

export function isRefundable(order: RefundableOrder, now: Date = new Date()): boolean {
  if (order.paymentStatus !== 'success') return false;
  if (!order.paidAt) return false;
  const ageMs = now.getTime() - new Date(order.paidAt).getTime();
  return ageMs <= REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
