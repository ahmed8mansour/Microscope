import type { PaymentStatus } from '@/features/orders';

export interface CreateIntentInput {
  orderId: string;
  amount: number; // integer minor units, server-set
  currency: string; // ISO-4217 (e.g. 'AUD')
}

export interface NormalizedIntent {
  providerRef: string; // provider payment reference (e.g. Stripe PaymentIntent id)
  clientSecret: string; // consumed by the later payment-page spec
}

// Normalized classification of a verified webhook event. See
// specs/003-payment-webhook-success/data-model.md.
export type WebhookEventKind =
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'refunded'
  | 'refund_partial'
  | 'dispute'
  | 'other';

// A verified webhook event, normalized — no provider-specific type crosses
// this boundary (SC-006).
export interface NormalizedWebhookEvent {
  id: string; // provider event id (dedup key)
  type: string; // raw provider type (audit)
  kind: WebhookEventKind;
  providerRef: string | null; // payment reference, for order lookup
  amount: number | null; // minor units, when the event carries it
  currency: string | null; // ISO-4217, when present
  receiptRef: string | null;
}

// Immediate server-side snapshot for the success page / reconciliation.
export interface NormalizedPaymentSnapshot {
  status: PaymentStatus;
  amount: number; // minor units
  currency: string; // ISO-4217
  clientSecret: string; // for access-scope validation on the success page
  receiptRef: string | null;
  customerRef: string | null;
}

// Admin-initiated refund (feature 004). See
// specs/004-admin-dashboard-analytics/contracts/payment-provider-ext.md.
export interface RefundInput {
  providerRef: string; // the order's payment reference
  amount: number; // full order amount, minor units (server-set)
  idempotencyKey: string; // e.g. `refund_<orderId>` — provider-level de-dup
}

export interface RefundResult {
  providerRefundRef: string; // provider refund id (e.g. Stripe `re_…`)
  accepted: true;
}

// Thrown by `updateIntentAmount` when the intent can no longer be re-priced
// (already confirmed/succeeded/canceled). A normalized error — no
// provider-specific type crosses the boundary (SC-006). The re-price route
// maps this to a 409 `not_repriceable`, never mutating a settled intent
// (feature 005, FR-002a).
export class NotRepriceableError extends Error {
  constructor(providerRef: string) {
    super(`Payment intent "${providerRef}" can no longer be re-priced`);
    this.name = 'NotRepriceableError';
  }
}

// No provider-specific type crosses this boundary (SC-006).
export interface PaymentProvider {
  readonly name: string;
  createIntent(input: CreateIntentInput): Promise<NormalizedIntent>;
  verify(providerRef: string): Promise<PaymentStatus>;
  parseWebhookEvent(rawBody: string, signature: string): Promise<NormalizedWebhookEvent>;
  getPaymentSnapshot(providerRef: string): Promise<NormalizedPaymentSnapshot>;
  // Re-price an UNCONFIRMED intent to a new server-set amount (feature 005,
  // FR-002a). Throws `NotRepriceableError` if the intent is already settled —
  // never mutates a confirmed/succeeded/canceled intent.
  updateIntentAmount(providerRef: string, amount: number): Promise<void>;
  // Issues the refund only — does NOT change order/payment status itself.
  // The order becomes `refunded` solely from the subsequent verified
  // `charge.refunded` webhook (Principle III). Throws on provider
  // rejection/failure — never returns a non-accepted result.
  refund(input: RefundInput): Promise<RefundResult>;
}
