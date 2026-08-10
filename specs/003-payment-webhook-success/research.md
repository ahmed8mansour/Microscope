# Phase 0 Research: Payment Page, Webhook & Order Sync, and Success Page

Grounded in the installed stack (Next.js 16.2.12, `stripe` v22 server SDK, Drizzle 0.45) and the
bundled Next 16 docs (`route.md`, `data-security.md`), per AGENTS.md. Builds on 001/002.

## R1. Webhook signature verification — raw body + `constructEvent`, Node runtime

- **Decision**: The webhook Route Handler (`app/api/webhooks/stripe/route.ts`, `runtime='nodejs'`)
  reads the **exact raw body** via `await request.text()` and the `stripe-signature` header, and
  verifies with `stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)`
  (confirmed present in the installed SDK: `Webhooks.constructEvent(payload, header, secret,
  tolerance?)`). Verification (and its default ~5-minute timestamp tolerance) rejects forged and
  replayed events; failures return `400` with no state change.
- **Rationale**: FR-008/009. App Router Route Handlers expose the raw body through `request.text()`
  with no body-parser config (bundled `route.md`); the Node runtime is required for the SDK's
  crypto and postgres.js. The signing secret stays server-only.
- **Alternatives**: `constructEventAsync` (subtle-crypto, for edge) — unnecessary on Node;
  hand-rolled HMAC verification — rejected, error-prone vs. the SDK helper. Edge runtime —
  rejected (Node-only SDKs + pooled postgres.js).

## R2. Provider isolation for webhooks & retrieval — extend the abstraction

- **Decision**: Extend `lib/payments` rather than importing `stripe` in routes. Add to
  `PaymentProvider`: `parseWebhookEvent(rawBody, signature): Promise<NormalizedWebhookEvent>`
  (verifies + normalizes) and `getPaymentSnapshot(providerRef): Promise<NormalizedPaymentSnapshot>`
  (status + amount + currency + client secret + receipt ref). `lib/payments/index.ts` re-exports
  `parseWebhookEvent()`/`getPaymentSnapshot()`. Stripe types never cross into route handlers or
  the order-sync service (SC-006, Principle V).
- **Rationale**: Keeps the webhook and success-confirm routes provider-agnostic and testable with
  a mocked provider; a second provider would implement the same two methods (SC-007).
- **Alternatives**: Stripe-specific webhook logic in the route — rejected (leaks provider,
  violates isolation). A separate webhook library — unnecessary.

## R3. Idempotency & exactly-once effect — dedup PK + idempotent transitions

- **Decision**: A `webhook_events` table with the provider **event id as primary key** is the
  dedup store (FR-009a). Processing order per event: (1) if the event id already exists → it's a
  duplicate, no-op; (2) else resolve the order by payment reference and apply the target status
  via 001's `updatePaymentStatus` (which is already a no-op when the status is unchanged); (3)
  record the `webhook_events` row with its outcome. Because the status update is itself
  idempotent, a crash between (2) and (3) is safe — redelivery re-applies a no-op and records.
  Net: **exactly-once effect** even under duplicate/concurrent/out-of-order delivery (SC-002).
  Out-of-order protection comes from 001's transition table (a stale `failed` cannot overwrite a
  later `success`; `refunded` is terminal).
- **Rationale**: FR-009/012/024. Reuses the foundation's idempotent semantics instead of
  reinventing them; the PK insert gives atomic dedup under concurrency.
- **Alternatives**: A processed-flag updated in place — racy under concurrency; a distributed lock
  — over-engineered for this volume; storing full event payloads — unnecessary (audit needs only
  id/type/outcome/order).

## R4. Success page confirmation — hybrid, mutation out of render (clarified)

> **Superseded (2026-08-04)**: the standalone `/success` page was removed. The same hybrid
> server-verification (confirm route + webhook) now backs an **in-checkout "confirmed" step**;
> the card confirms inline (`redirect: 'if_required'`) so the client secret reaches the confirm
> route via the POST body, not a URL. Only the 3-D Secure redirect returns to `/checkout` with
> the params, read once and stripped. See the spec's Clarifications 2026-08-04. The hybrid
> verification + mutation-out-of-render rationale below still holds.

- **Decision** (per clarification Q1): The success page (`app/success/page.tsx`, client) reads the
  redirect params Stripe appends to `return_url` (`payment_intent`, `payment_intent_client_secret`,
  `redirect_status`) and calls `POST /api/checkout/confirm` with the intent id + client secret. The
  confirm route retrieves the snapshot server-side (`getPaymentSnapshot`), **validates the supplied
  client secret matches** the retrieved intent (access scoping — FR-022/SC-008), reconciles the
  order idempotently via the shared order-sync service, and returns a minimal safe view (status,
  amount, currency, order reference). If still unconfirmed it returns a pending view.
- **Rationale**: FR-020/021, SC-006. A client page calling a POST route keeps the reconciling
  *mutation out of render* (bundled `data-security.md`: never mutate during render) and matches
  002's client+route pattern. The webhook remains the durable authority; this is the immediate
  check.
- **Alternatives**: Server-component success page that retrieves+writes during render — rejected
  (side-effect in render). Trusting the redirect `redirect_status` alone — rejected (client-
  reported, FR-020/023). Passing the client secret in the page URL to a GET — the secret already
  arrives via Stripe's redirect params; we consume it immediately and do not persist it.

## R5. Payment page — Stripe Elements, client secret in memory

> **Amended (2026-08-04)**: `confirmPayment` is called with **`redirect: 'if_required'`** and
> `return_url: <origin>/checkout` (not `/success`). The common card path resolves **inline** (no
> navigation, no client secret in any URL); only 3-D Secure/redirect methods navigate, returning
> to `/checkout`. On inline resolve the checkout page advances to the "confirmed" step and
> server-verifies via `POST /api/checkout/confirm`.

- **Decision**: Add `@stripe/stripe-js` + `@stripe/react-stripe-js`. A new client `features/payment`
  module: `stripe-client.ts` (`loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)` singleton), and
  `PaymentForm.tsx` using `<Elements>` + `<PaymentElement>` + `stripe.confirmPayment({ elements,
  redirect: 'if_required', confirmParams: { return_url: <origin>/checkout } })`. It is mounted as a
  new `payment` step in the existing checkout page using the **in-memory** client secret from
  `create-intent` — never placed in a URL. Double-submit is prevented by disabling on pending;
  `confirmPayment` itself is idempotent per intent so retries cannot double-charge (FR-004/SC-004).
- **Rationale**: FR-001/002/005. Payment Intents client confirm with `PaymentElement` is Stripe's
  standard SCA-ready flow (handles 3-D Secure automatically); `return_url` drives the success
  redirect. The publishable key must be in the browser — the single allowed `NEXT_PUBLIC_` value.
- **Alternatives**: Hosted Checkout Session — forbidden by the spec/constitution. A separate
  `/payment` route receiving the secret via URL — rejected (secret in history); a step in the
  in-memory checkout flow is cleaner and satisfies "payment page/surface".

## R6. Amount/currency tamper guard & anomaly audit (clarified)

- **Decision**: Before marking `success`, order-sync compares the event/snapshot amount+currency to
  the order's server-set expectation; on mismatch it does **not** mark success, records the
  `webhook_events` outcome as `flagged`, and appends a note to the order (`updateNotes`) — per
  clarification Q2. Verified events always produce a `webhook_events` row with outcome
  `processed`/`ignored`/`flagged`; signature-rejected events are logged only (untrusted, unkeyable).
- **Rationale**: FR-013/014/014a, SC-007. One table serves idempotency + audit (Principle I);
  order-level anomalies also surface on the order for operator visibility.
- **Alternatives**: Separate anomaly table (rejected in clarify), logs-only (rejected — no durable
  trail).

## R7. Webhook-before-order race — retryable response (clarified)

- **Decision** (per clarification Q3): If the order/payment reference isn't found when a verified
  event is processed, the route returns a **non-2xx** so the provider redelivers; no
  `webhook_events` row is written (so the redelivery is not treated as a duplicate). Idempotency
  makes the eventual success apply once. The race is rare (002 creates the order + attaches the
  reference before the customer confirms).
- **Rationale**: FR-018. Simple, lossless, leans on provider retry; the hybrid success verification
  is a second net.
- **Alternatives**: Ack + flag (rejected in clarify — needs manual follow-up); internal wait/retry
  (more complex).

## R8. Event scope & mapping

- **Decision**: Subscribe/handle: `payment_intent.succeeded` → `success` (+ receipt ref);
  `payment_intent.payment_failed` / `payment_intent.canceled` → `failed`; `charge.refunded`
  (full) → `refunded`; partial refund / `charge.dispute.created` → recorded `flagged`; all other
  types → recorded `ignored`. The Stripe adapter maps event type → a normalized `kind` so the
  order-sync service stays provider-agnostic.
- **Rationale**: FR-010/011/014/017. Covers the spec's edge-case catalogue with a bounded, explicit
  event set.
- **Alternatives**: Handling every Stripe event — unnecessary; the `ignored` outcome cleanly
  absorbs the rest.

## R9. Testing strategy

- **Decision**: Unit-test pure mapping/guard logic (event→status, amount-match, success scoping)
  with no I/O. Integration-test the webhook and confirm routes against a test DB with the payment
  provider **mocked** via the factory (inject signed/forged/duplicate/out-of-order/mismatch/refund
  scenarios as normalized events). One **gated live** test exercises the real `parseWebhookEvent`
  (signature) and `getPaymentSnapshot` mapping behind `STRIPE_SECRET_KEY`. All DB-touching tests
  are `DATABASE_URL`-gated, matching 001/002 (and using the `ssr.resolve` `react-server` fix from
  002 so `server-only` modules import cleanly under Vitest).
- **Rationale**: Deterministic, no-network coverage of the acceptance criteria and SCs; the gated
  live test proves the real Stripe verification/mapping without blocking `npm test`.
- **Alternatives**: Real Stripe/network in every test — flaky, slow, rejected.
