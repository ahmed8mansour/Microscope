# Contract: Payment Confirmation Endpoint

`POST /api/checkout/confirm` — the post-payment confirmation's immediate server-side
verification (hybrid with the webhook). `runtime = 'nodejs'`. Retrieves the payment snapshot
from the provider, validates access by client-secret match, reconciles the order idempotently,
and returns a minimal non-PII view. Called from the in-checkout "confirmed" step (Session
2026-08-04), not a standalone page.

## Request

```json
{ "paymentIntentId": "pi_…", "clientSecret": "pi_…_secret_…" }
```

- **Inline path (common):** after `confirmPayment({ redirect: 'if_required' })` resolves in the
  browser, the checkout page sends the intent id + the in-memory client secret here **in the
  request body** — the secret never enters a URL.
- **3-D Secure path:** Stripe redirects back to `/checkout` with `payment_intent` +
  `payment_intent_client_secret` in the URL; the checkout page reads them once, forwards them
  here, and strips them from history.

## Behavior

1. Zod-validate the two fields are present, non-empty strings.
2. `getPaymentSnapshot(paymentIntentId)` (server-side retrieval).
3. **Access scoping** (FR-022, SC-008): if the supplied `clientSecret` does NOT equal the
   retrieved intent's client secret → **`403`** (do not reveal whether the intent exists).
4. Reconcile the order idempotently via the shared order-sync service (same amount-match guard
   and forward-only transition as the webhook) — so the confirmation resolves even if the
   webhook lags (FR-021), and never regresses a webhook-set state.
5. Return the minimal `SuccessView` derived from server-verified state (FR-019/020).

## Responses

- `200 { status, orderId, amount, currency }` — `status ∈ success | pending | failed |
  refunded`. `pending` when the provider has not yet reached a terminal state (FR-021).
- `400` — missing/invalid fields.
- `403` — client secret does not match the intent (unauthorized; no data leaked).
- `404`-style body `{ status: "not_found" }` — no order maps to the reference (generic,
  non-leaking).

## Invariants

- Never returns a paid confirmation from client-reported state — status comes only from the
  provider snapshot (FR-020/023).
- Never returns customer contact/PII — only status + amount + currency + an opaque order
  reference.
- Reconciliation is idempotent and converges with the webhook to one final state (FR-024).
- The client secret is transmitted in the request body, never a shareable URL, on the common
  inline path (Session 2026-08-04).
