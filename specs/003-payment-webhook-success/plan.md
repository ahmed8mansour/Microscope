# Implementation Plan: Payment Page, Webhook & Order Sync, and Success Page

**Branch**: `003-payment-webhook-success` | **Date**: 2026-08-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-payment-webhook-success/spec.md`

## Summary

Complete the purchase funnel on top of 002's `create-intent` handoff: (1) a **card-confirm
surface** that confirms the Payment Intent using the provider's client SDK (Stripe Elements —
Payment Intents, NOT Checkout Sessions), handling SCA/declines/double-submit; (2) a **webhook
endpoint** that is the durable, signature-verified, **idempotent** source of order truth,
deduplicated and audited via a new `webhook_events` table; and (3) a **post-payment
confirmation** whose state is server-verified via an **immediate provider retrieval** (hybrid
with the webhook), authorized by the payment reference's client secret. Provider isolation is
preserved by extending the 002 payment abstraction with `parseWebhookEvent` and
`getPaymentSnapshot` — no Stripe type crosses into route handlers. The webhook and the
confirmation share one idempotent order-sync service that reuses 001's status transitions.

> Delivery note (Session 2026-08-04): confirmation ships as an **in-checkout "confirmed"
> step**, not a standalone `/success` page. The card confirms **inline**
> (`confirmPayment({ redirect: 'if_required' })`) so the client secret stays in memory and is
> sent to the confirm endpoint in the POST body — not a shareable URL. Only the
> provider-forced 3-D Secure redirect returns to a URL (`/checkout`), read once and stripped.
> Server verification and the webhook are unchanged.

## Technical Context

**Language/Version**: TypeScript 5.x (strict); Node.js ≥ 20.9
**Primary Dependencies**: Next.js 16.2.12 (App Router), React 19.2.4; Drizzle ORM + postgres.js,
`stripe` (server), TanStack Query, RHF (all existing from 001/002); to be added —
`@stripe/stripe-js` + `@stripe/react-stripe-js` (client Elements for the payment page).
**Storage**: Supabase Postgres via Drizzle. New `webhook_events` table (event-id PK + outcome
audit). `orders` reused/updated (status, receipt ref) — no order schema change.
**Testing**: Vitest — unit (webhook event→order mapping, idempotency/dedup logic, amount-match
guard, success-view scoping) + integration (webhook route with signed/forged/duplicate events;
confirm route) against a test DB with the provider mocked; a gated live Stripe-adapter test for
`parseWebhookEvent`/`getPaymentSnapshot` behind `STRIPE_SECRET_KEY`.
**Target Platform**: Vercel (serverless, Node runtime) + Supabase Cloud
**Project Type**: Web application (Next.js App Router) — adds one client payment surface, two
Route Handlers (webhook, confirm), a client success page, plus server-only sync/repo modules
and an extension to `lib/payments`.
**Performance Goals**: Webhook acknowledges fast (well under provider timeout); success-page
server verification confirms within a few seconds p95 (SC-006); dedup/lookup are single indexed
queries.
**Constraints**: Webhook signature verified over the **exact raw body** (`request.text()`,
Node runtime). All order state changes **idempotent** (reuse 001's `updatePaymentStatus` no-op-
on-same-status + the `webhook_events` PK dedup). Secrets (`STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`) server-only. The **publishable key** is the *only* client-exposed
value (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`) — it is a public credential by design, not a
secret. Charged amount stays server-authoritative.
**Scale/Scope**: One product, low volume, AUD, card payments only.

**Runtime note**: The webhook and confirm routes run `runtime = 'nodejs'` (raw-body signature
verification + Stripe/postgres.js SDKs). Route Handler bodies are read with `request.text()`
for the webhook (raw) and `request.json()` for confirm — no body-parser config needed in the
App Router (per bundled `route.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Single-Product Simplicity (YAGNI) | Adds only what completes one sale: payment surface, webhook, success page. The new `webhook_events` table is not scope creep — idempotency + audit are constitutional requirements (III/IV). No cart/multi-product. | ✅ Pass |
| II. Conversion-First Experience | Payment + success pages are the conversion finish line; minimal friction, clear decline/retry, fast confirmation. | ✅ Pass |
| III. Payment Integrity (NON-NEGOTIABLE) | Stripe **Payment Intents** (not Checkout Sessions); webhook **signature-verified**, **idempotent**, server-derived status; provider stays isolated behind `lib/payments` (extended, no Stripe types leak). This feature is the direct embodiment of Principle III. | ✅ Pass |
| IV. Server-Side Trust & Security | Payment outcome trusted only from the provider (webhook + server retrieval); success page server-verified and reference-scoped (no id-guessing, no PII leak); secrets server-only. The publishable key is a **public credential by design**, not a secret — the one allowed `NEXT_PUBLIC_` value. | ✅ Pass |
| V. Clean, Layered Architecture | Provider isolation extended (`parseWebhookEvent`/`getPaymentSnapshot`); one shared idempotent order-sync service used by both webhook and success verification; Route Handlers stay thin. | ✅ Pass |

**Gate result**: PASS. No violations; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/003-payment-webhook-success/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── webhook-api.md            # POST /api/webhooks/stripe contract
│   ├── confirm-api.md            # POST /api/checkout/confirm (success verification) contract
│   └── payment-provider-ext.md   # abstraction additions (parseWebhookEvent, getPaymentSnapshot)
└── checklists/
    └── requirements.md  # from /speckit-specify
```

### Source Code (repository root)

```text
lib/
├── db/
│   └── schema.ts              # AMEND: add `webhook_events` table (event-id PK, type, outcome, order_id)
├── config/
│   ├── product.ts             # existing (server price)
│   └── support.ts             # NEW: WhatsApp support link (public) for the success page
└── payments/
    ├── types.ts               # AMEND: + NormalizedWebhookEvent, NormalizedPaymentSnapshot; extend PaymentProvider
    ├── providers/stripe.ts    # AMEND: + parseWebhookEvent (constructEvent, raw body) + getPaymentSnapshot
    └── index.ts               # AMEND: + parseWebhookEvent(), getPaymentSnapshot() (no provider types leak)

features/
└── orders/
    ├── data/
    │   └── webhook-event.repository.ts  # NEW server-only: recordEvent (insert-if-absent = dedup), hasProcessed
    └── order-sync.ts                    # NEW server-only: idempotent reconcile from a normalized payment
    │                                     #   snapshot / webhook event (amount-match guard, status transition,
    │                                     #   flag-on-mismatch) — shared by webhook + confirm
    └── (existing repository/domain reused: getOrderByPaymentReference, updatePaymentStatus, updateNotes)

# NOTE (Session 2026-08-04): the standalone app/success page was removed. Confirmation is an
# in-checkout "confirmed" step; the card confirms inline via confirmPayment(redirect:'if_required'),
# so the client secret stays in memory (POST body, not URL) on the common path.

features/
└── payment/                   # NEW client feature module for the card-confirm + confirmation surface
    ├── components/
    │   └── PaymentForm.tsx     # Stripe Elements (PaymentElement) + confirmPayment(redirect:'if_required', return_url=/checkout)
    ├── domain/
    │   └── access-scope.ts     # pure client-secret match check (isAuthorizedForSnapshot)
    ├── hooks/
    │   └── use-confirm.ts      # TanStack Query mutation → POST /api/checkout/confirm
    ├── schemas/
    │   └── confirm.schema.ts   # Zod for the confirm request
    └── lib/
        └── stripe-client.ts    # loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) singleton (client)

app/
├── checkout/page.tsx          # AMEND: `payment` step mounts <PaymentForm>; inline confirm → in-checkout
│                              #        "confirmed" step (server-verified); also handles the 3DS return
└── api/
    ├── webhooks/stripe/route.ts     # NEW POST (nodejs): verify signature, dedup, order-sync, audit; retryable on race
    └── checkout/confirm/route.ts    # NEW POST (nodejs): validate client secret, retrieve snapshot, reconcile, safe view

tests/
├── unit/
│   ├── webhook-event-mapping.test.ts   # normalized event → order target status; ignored/flagged outcomes
│   └── success-scoping.test.ts          # client-secret match gating (no id-guessing)
└── integration/
    ├── webhook.stripe.test.ts           # signed/forged/duplicate/out-of-order/amount-mismatch/refund (provider mocked)
    ├── checkout.confirm.test.ts          # verified reconcile, pending, mismatch, unauthorized (provider mocked)
    └── payment.stripe-webhook.test.ts    # gated live: constructEvent / getPaymentSnapshot mapping (STRIPE_SECRET_KEY)
```

**Structure Decision**: Web application (Next.js App Router). Provider specifics stay inside
`lib/payments` (extended with two methods); the webhook and confirm Route Handlers are thin and
call a single server-only **order-sync** service that reuses 001's idempotent status transitions
and a new `webhook_events` dedup/audit table. The card-confirm UI is a new client
`features/payment` module mounted as a step in the existing checkout page. It confirms the card
inline (`confirmPayment({ redirect: 'if_required' })`), keeping the client secret in memory, and
shows an in-checkout **"confirmed" step** that calls the confirm Route Handler to server-verify
(mutation out of render, per the bundled data-security guidance). No standalone success page —
only the provider-forced 3-D Secure redirect returns to a URL (`/checkout`), read once and
stripped (Session 2026-08-04).

## Complexity Tracking

> No constitution violations — no entries required.
