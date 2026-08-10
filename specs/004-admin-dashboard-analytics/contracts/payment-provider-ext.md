# Contract: Payment Provider Abstraction — `refund()` extension

Extends the 002/003 `PaymentProvider` interface (`lib/payments/types.ts`) with one method so an
admin-initiated refund is executed provider-side while Stripe stays isolated (Principle III/V).
No provider-specific type crosses this boundary.

## Interface addition

```ts
export interface RefundInput {
  providerRef: string;      // the order's payment reference (Stripe PaymentIntent id)
  amount: number;           // full order amount, minor units (server-set)
  idempotencyKey: string;   // e.g. `refund_<orderId>` — provider-level de-dup
}

export interface RefundResult {
  providerRefundRef: string; // provider refund id (e.g. Stripe `re_…`)
  accepted: true;            // provider accepted the refund request
}

export interface PaymentProvider {
  // …existing: createIntent, verify, parseWebhookEvent, getPaymentSnapshot
  refund(input: RefundInput): Promise<RefundResult>;
}
```

- On provider rejection/failure, `refund()` **throws** (a normalized error) — it never returns a
  non-accepted result. The refund service maps the throw to `refunds.status='failed'` + `502`,
  leaving the order `success` (FR-039).

## Stripe adapter (`lib/payments/providers/stripe.ts`)

```ts
async refund({ providerRef, amount, idempotencyKey }: RefundInput): Promise<RefundResult> {
  const stripe = getClient();
  const refund = await stripe.refunds.create(
    { payment_intent: providerRef, amount },              // full amount
    { idempotencyKey },                                   // Stripe-level idempotency
  );
  return { providerRefundRef: refund.id, accepted: true };
}
```

- `lib/payments/index.ts` gains a thin `refund()` passthrough (no Stripe type leaks).
- **No status change here**: the resulting `charge.refunded` webhook is what drives the order to
  `refunded` via the existing `order-sync` path (already mapped, already idempotent). This method
  only *issues* the refund (FR-035/FR-036/FR-037).

## Acceptance mapping

FR-035 (server-side execution), FR-036/FR-037 (status only from verified webhook), FR-038
(idempotency key), FR-039 (throw → order unchanged). Provider isolation preserved (Principle
III/V); a second provider could implement `refund()` unchanged.
