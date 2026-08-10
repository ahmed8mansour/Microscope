import type { PaymentStatus } from './payment-status';
import type { WebhookEventKind } from '@/lib/payments/types';

export interface EventClassification {
  // The order status this event kind should drive, or null if the event
  // does not change payment status (e.g. a partial refund or dispute).
  targetStatus: PaymentStatus | null;
  // Outcome to record when there is no target status.
  outcomeIfNoStatus: 'ignored' | 'flagged' | null;
}

// Pure mapping: normalized event kind -> order-sync action. See
// specs/003-payment-webhook-success/research.md R8.
export function classifyEventKind(kind: WebhookEventKind): EventClassification {
  switch (kind) {
    case 'succeeded':
      return { targetStatus: 'success', outcomeIfNoStatus: null };
    case 'failed':
    case 'canceled':
      return { targetStatus: 'failed', outcomeIfNoStatus: null };
    case 'refunded':
      return { targetStatus: 'refunded', outcomeIfNoStatus: null };
    case 'refund_partial':
    case 'dispute':
      return { targetStatus: null, outcomeIfNoStatus: 'flagged' };
    case 'other':
    default:
      return { targetStatus: null, outcomeIfNoStatus: 'ignored' };
  }
}
