import 'server-only';

import { getOrderById } from '@/features/orders';
import { issueRefund } from '@/lib/payments';
import { isRefundable } from '../domain/refund-policy';
import {
  createRefundRequest,
  markRefundFailed,
  setProviderRefundRef,
  RefundExistsError,
} from '../data/refund.repository';

export type RefundOutcome =
  | { outcome: 'not_found' }
  | { outcome: 'not_refundable' }
  | { outcome: 'already_exists' }
  | { outcome: 'requested' }
  | { outcome: 'provider_error'; message: string };

// FR-032..FR-039. The admin action only REQUESTS the refund — the order's
// payment status changes only from the later verified `charge.refunded`
// webhook (order-sync.ts), never here (Principle III).
export async function requestRefund(orderId: string, reason?: string): Promise<RefundOutcome> {
  const order = await getOrderById(orderId);
  if (!order) return { outcome: 'not_found' };

  // A `success` order always has a payment reference (attached before the
  // customer could complete payment) — this guard is defensive, not an
  // expected path.
  if (!isRefundable(order) || !order.stripePaymentIntentId) {
    return { outcome: 'not_refundable' };
  }

  try {
    await createRefundRequest({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      reason,
      requestedBy: 'admin',
    });
  } catch (err) {
    if (err instanceof RefundExistsError) {
      return { outcome: 'already_exists' };
    }
    throw err;
  }

  try {
    const result = await issueRefund({
      providerRef: order.stripePaymentIntentId,
      amount: order.amount,
      idempotencyKey: `refund_${order.id}`,
    });
    await setProviderRefundRef(order.id, result.providerRefundRef);
    return { outcome: 'requested' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Refund failed';
    await markRefundFailed(order.id, message);
    return { outcome: 'provider_error', message };
  }
}
