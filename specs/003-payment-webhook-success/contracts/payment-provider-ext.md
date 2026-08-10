# Contract: Payment Provider Abstraction — Extensions

Adds two methods to the 002 `PaymentProvider` interface so the webhook and success-confirm
routes stay provider-agnostic. Callers still import only from `lib/payments`; no Stripe type
crosses the boundary (SC-006). All modules server-only.

## Public API additions (`lib/payments/index.ts`)

```ts
// Verify + normalize an incoming webhook (raw body + signature). Throws a normalized
// error on signature failure — callers translate that to a 400.
function parseWebhookEvent(rawBody: string, signature: string): Promise<NormalizedWebhookEvent>;

// Immediate server-side retrieval for the post-payment confirmation / reconciliation.
function getPaymentSnapshot(providerRef: string): Promise<NormalizedPaymentSnapshot>;
```

(Existing `createPaymentIntent` and `verifyPayment` unchanged.)

## Interface additions (`lib/payments/types.ts`)

```ts
type WebhookEventKind =
  | 'succeeded' | 'failed' | 'canceled' | 'refunded'
  | 'refund_partial' | 'dispute' | 'other';

interface NormalizedWebhookEvent {
  id: string; type: string; kind: WebhookEventKind;
  providerRef: string | null; amount: number | null; currency: string | null;
  receiptRef: string | null;
}

interface NormalizedPaymentSnapshot {
  status: PaymentStatus; amount: number; currency: string;
  clientSecret: string; receiptRef: string | null; customerRef: string | null;
}

interface PaymentProvider {
  // …existing createIntent, verify…
  parseWebhookEvent(rawBody: string, signature: string): Promise<NormalizedWebhookEvent>;
  getPaymentSnapshot(providerRef: string): Promise<NormalizedPaymentSnapshot>;
}
```

## Stripe adapter (`lib/payments/providers/stripe.ts`, server-only) additions

- `parseWebhookEvent(rawBody, signature)`:
  - `stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)` —
    verifies signature + timestamp tolerance; throws on failure.
  - Map `event.type` → `kind`: `payment_intent.succeeded`→`succeeded`;
    `payment_intent.payment_failed`→`failed`; `payment_intent.canceled`→`canceled`;
    `charge.refunded` (full)→`refunded`; partial refund→`refund_partial`;
    `charge.dispute.created`→`dispute`; else→`other`.
  - Extract `providerRef` (the PaymentIntent id), `amount`, `currency`, `receiptRef` where the
    event object carries them.
- `getPaymentSnapshot(providerRef)`:
  - `stripe.paymentIntents.retrieve(providerRef, { expand: ['latest_charge'] })`.
  - Normalize: `status` via the existing status mapping; `amount`, `currency` from the intent;
    `clientSecret` from the intent; `receiptRef`/`customerRef` where present.

## Invariants

- `STRIPE_WEBHOOK_SECRET` and `STRIPE_SECRET_KEY` read server-side only; never client-exposed.
- Signature verification operates on the exact raw payload (any modification invalidates it).
- Return values contain only normalized fields — no `Stripe.*` object leaves `lib/payments`.
