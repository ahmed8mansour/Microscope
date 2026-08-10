import 'server-only';

import {
  getOrderByPaymentReference,
  InvalidTransitionError,
  updateNotes,
  updatePaymentStatus,
  type Order,
  type PaymentStatus,
} from '@/features/orders';
import { hasProcessed, recordEvent, type WebhookEventOutcome } from './data/webhook-event.repository';
import { classifyEventKind } from './domain/webhook-classification';
import type { NormalizedWebhookEvent } from '@/lib/payments/types';
import { recordConversion } from '@/features/analytics';

export { classifyEventKind } from './domain/webhook-classification';

// Thrown when a payment reference has no matching order yet — the webhook
// route maps this to a retryable (non-2xx) response so the provider
// redelivers later (FR-018); the order and its payment reference are always
// created before the customer can complete payment, so this is rare.
export class RetryableNotFound extends Error {
  constructor(providerRef: string) {
    super(`No order found for payment reference "${providerRef}" (yet)`);
    this.name = 'RetryableNotFound';
  }
}

export interface ReconcileSnapshot {
  status: PaymentStatus;
  amount: number;
  currency: string;
  receiptRef?: string | null;
  customerRef?: string | null;
}

export interface ReconcileResult {
  order: Order;
  // Amount/currency mismatch on a would-be success — order NOT marked
  // success, an anomaly note was appended (FR-013).
  flagged: boolean;
  // The snapshot's status could not be applied because the order is already
  // in a later/terminal state (e.g. a stale `success` after `refunded`) —
  // out-of-order protection via 001's forward-only transition table (FR-012).
  stale: boolean;
}

// FR-010–014, FR-023/024. Idempotent, forward-only order sync shared by the
// webhook (durable authority) and the success-page confirmation (immediate
// hybrid verification) — both converge to the same result.
export async function reconcile(
  providerRef: string,
  snapshot: ReconcileSnapshot
): Promise<ReconcileResult> {
  const order = await getOrderByPaymentReference(providerRef);
  if (!order) {
    throw new RetryableNotFound(providerRef);
  }

  if (snapshot.status === 'success') {
    const mismatch = snapshot.amount !== order.amount || snapshot.currency !== order.currency;
    if (mismatch) {
      await updateNotes(
        order.id,
        `[amount/currency mismatch] event reported ${snapshot.amount} ${snapshot.currency}, ` +
          `order expects ${order.amount} ${order.currency}`
      );
      return { order, flagged: true, stale: false };
    }
  }

  try {
    const updated = await updatePaymentStatus(order.id, snapshot.status, {
      receiptUrl: snapshot.receiptRef ?? undefined,
      customerId: snapshot.customerRef ?? undefined,
    });
    if (snapshot.status === 'success') {
      // FR-028. Best-effort — `reconcile` is shared by the customer-facing
      // confirm route, so an analytics hiccup must never surface as a
      // broken payment confirmation (FR-030). Safe to attempt on every
      // success application (fresh or a duplicate re-application):
      // `recordConversion` is itself idempotent via a partial unique index,
      // and NOT gating on "first time" means a failure here still gets a
      // second chance from the webhook/confirm-route hybrid path.
      try {
        await recordConversion(updated.id);
      } catch (analyticsErr) {
        console.error('[order-sync] recordConversion failed (non-fatal):', analyticsErr);
      }
    }
    return { order: updated, flagged: false, stale: false };
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      // Stale/out-of-order event — do not overwrite a later authoritative state.
      return { order, flagged: false, stale: true };
    }
    throw err;
  }
}

export type WebhookHandleOutcome = WebhookEventOutcome | 'duplicate';

export interface HandleWebhookEventResult {
  outcome: WebhookHandleOutcome;
}

// FR-009/012/014a/017/018. Dedups by event id (idempotent), classifies the
// event kind, reconciles order-affecting kinds, and records a durable audit
// row for every verified event. A `RetryableNotFound` from `reconcile`
// propagates uncaught — the webhook route maps it to a retryable response
// and this function writes NO event row, so the redelivered event is not
// mistaken for a duplicate (FR-018).
export async function handleWebhookEvent(
  event: NormalizedWebhookEvent
): Promise<HandleWebhookEventResult> {
  if (await hasProcessed(event.id)) {
    return { outcome: 'duplicate' };
  }

  const classification = classifyEventKind(event.kind);

  if (classification.targetStatus === null) {
    const outcome = classification.outcomeIfNoStatus ?? 'ignored';
    await recordEvent(event.id, event.type, outcome);
    return { outcome };
  }

  if (!event.providerRef) {
    throw new RetryableNotFound('(event carried no payment reference)');
  }

  const result = await reconcile(event.providerRef, {
    status: classification.targetStatus,
    amount: event.amount ?? 0,
    currency: event.currency ?? '',
    receiptRef: event.receiptRef,
  });

  const outcome: WebhookEventOutcome = result.flagged
    ? 'flagged'
    : result.stale
      ? 'ignored'
      : 'processed';
  await recordEvent(event.id, event.type, outcome, result.order.id);
  return { outcome };
}
