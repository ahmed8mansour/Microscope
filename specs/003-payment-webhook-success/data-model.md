# Phase 1 Data Model: Payment Page, Webhook & Order Sync, and Success Page

Adds one table (`webhook_events`) and defines the normalized payment shapes the abstraction
exposes. `orders` (001/002) is reused and updated, not restructured.

## Entity: Webhook Event (new — `webhook_events` table)

The dedup + audit record for each **verified** provider event. Its presence keyed by the
provider event id is the idempotency mechanism; the `outcome` column makes it a durable audit
trail (clarification Q2).

| Field | Type (DB) | Null? | Default | Rules / Source |
|-------|-----------|-------|---------|----------------|
| `id` | `text` | no | — | **Primary key** = the provider's unique event id (e.g. `evt_…`). Its uniqueness enforces exactly-once (FR-009/009a). |
| `type` | `text` | no | — | Provider event type (e.g. `payment_intent.succeeded`). |
| `outcome` | `text` | no | — | `CHECK (outcome IN ('processed','ignored','flagged'))` (FR-014a). |
| `order_id` | `uuid` | yes | — | FK → `orders.id` when the event mapped to an order; null for `ignored`/unmatched. Index `webhook_events_order_id_idx`. |
| `created_at` | `timestamptz` | no | `now()` | When the event was recorded/processed. |

- `PRIMARY KEY (id)` — atomic dedup under concurrent delivery (insert-if-absent).
- RLS enabled, no anon policies (server-only access, matching 001/002).
- Signature-rejected/forged events are **never** written here (untrusted, unkeyable) — logs only.

## Entity: Order (reused from 001/002 — updated, not restructured)

This feature updates existing columns only:

| Column | Update |
|--------|--------|
| `payment_status` | Set to `success` / `failed` / `refunded` from verified events / server retrieval, via 001's idempotent `updatePaymentStatus` (forward-only transitions). |
| `stripe_receipt_url` | Recorded on success from the provider snapshot. |
| `stripe_customer_id` | Recorded if present. |
| `notes` | Appended on an amount/currency mismatch (anomaly note), via `updateNotes`. |

No new order columns. Contact remains on the related `users` record (002); the success view
returns minimal order fields only.

## Value objects: payment abstraction additions (no tables)

Normalized, provider-neutral shapes added to `lib/payments/types.ts` (reusing 001 `PaymentStatus`).

```ts
type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

// A normalized, verified webhook event (Stripe types do not cross this boundary).
type WebhookEventKind =
  | 'succeeded' | 'failed' | 'canceled' | 'refunded'
  | 'refund_partial' | 'dispute' | 'other';

interface NormalizedWebhookEvent {
  id: string;               // provider event id (dedup key)
  type: string;             // raw provider type (audit)
  kind: WebhookEventKind;   // normalized classification
  providerRef: string | null; // payment reference (order lookup), if applicable
  amount: number | null;    // minor units, when the event carries it
  currency: string | null;  // ISO-4217, when present
  receiptRef: string | null;
}

// Immediate server-side snapshot for the post-payment confirmation / reconciliation.
interface NormalizedPaymentSnapshot {
  status: PaymentStatus;
  amount: number;           // minor units
  currency: string;         // ISO-4217
  clientSecret: string;     // for access-scope validation of the confirmation request
  receiptRef: string | null;
  customerRef: string | null;
}

interface PaymentProvider {
  readonly name: string;
  createIntent(input: CreateIntentInput): Promise<NormalizedIntent>;     // existing
  verify(providerRef: string): Promise<PaymentStatus>;                   // existing
  parseWebhookEvent(rawBody: string, signature: string): Promise<NormalizedWebhookEvent>; // NEW
  getPaymentSnapshot(providerRef: string): Promise<NormalizedPaymentSnapshot>;            // NEW
}
```

- `parseWebhookEvent` verifies the signature (throws a normalized error on failure) and maps the
  event type → `kind`. `getPaymentSnapshot` retrieves the intent and normalizes it.

## Order-sync semantics (server-only service; shared by webhook + confirm)

```text
reconcile(providerRef, { status, amount, currency, receiptRef, customerRef }):
  order = getOrderByPaymentReference(providerRef)
  if not order            -> RetryableNotFound (webhook: non-2xx; confirm: 404-not-found view)
  if status == 'success':
     if amount != order.amount or currency != order.currency:
        updateNotes(order, "amount/currency mismatch: …"); return { flagged: true }   # FR-013
  updatePaymentStatus(order, status, { receiptUrl, customerId })   # idempotent, forward-only (001)
  return { status, flagged: false }

handleWebhookEvent(event):
  if hasProcessed(event.id): return { outcome: 'duplicate' }        # idempotent no-op (FR-009)
  kind -> target: succeeded->success | failed/canceled->failed | refunded->refunded
          | refund_partial/dispute-> record flagged (no status change)
          | other-> record 'ignored'
  if target needs an order: result = reconcile(event.providerRef, {from event})
     (RetryableNotFound propagates so the route returns non-2xx and writes NO event row)  # FR-018
  recordEvent(event.id, event.type, outcome, order_id?)             # audit + dedup (FR-014a)
```

- **Exactly-once effect** = PK dedup + idempotent `updatePaymentStatus`; safe under crash between
  update and record (redelivery re-applies a no-op).
- **Out-of-order** protection = 001's forward-only transition table (`refunded` terminal; a stale
  `failed` cannot overwrite a later `success`).

## Confirmation view (returned to the client; minimal, non-PII)

Rendered as the in-checkout "confirmed" step (Session 2026-08-04), not a standalone page.

```ts
interface SuccessView {
  status: 'success' | 'pending' | 'failed' | 'refunded' | 'not_found';
  orderId: string | null;   // opaque reference for display/support
  amount: number | null;    // minor units
  currency: string | null;
}
```

- Access is authorized only when the supplied client secret matches the retrieved intent
  (FR-022/SC-008); the secret is sent in the confirm request body (not a URL) for the inline
  path; no customer contact/PII is included.

## Client config (no table)

- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — the only client-exposed value (public by design).
- `lib/config/support.ts` — WhatsApp support link for the confirmation's support button (public).
