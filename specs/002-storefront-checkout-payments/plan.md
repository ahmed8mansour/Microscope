# Implementation Plan: Storefront, Checkout (Contact + OTP) & Payment Abstraction

**Branch**: `002-storefront-checkout-payments` | **Date**: 2026-08-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-storefront-checkout-payments/spec.md`

## Summary

Deliver the customer purchase funnel up to (but not including) the card-entry payment page:
(1) wire the already-built landing page's primary CTA into a new checkout route; (2) a
checkout step that captures a customer as a `users` record (email + WhatsApp), emails a 6-digit
OTP via SendGrid, and verifies it server-side to set `users.verified = true`; and (3) a
provider-agnostic payment abstraction (create-intent + verify) with a Stripe adapter selected
by a factory. Introducing `users` amends the `001` schema: contact moves off `orders`, which
gains `orders.user_id` (FK). All secrets stay server-side; the payable amount is server-set
(AUD 89); every endpoint validates input with Zod. The card-entry UI, Stripe webhook sync, and
success page remain separate later specs.

## Technical Context

**Language/Version**: TypeScript 5.x (strict); Node.js ≥ 20.9
**Primary Dependencies**: Next.js 16.2.12 (App Router), React 19.2.4; Drizzle ORM + postgres.js
(existing); to be added — `stripe` (Node SDK, server-only), `@sendgrid/mail` (server-only),
`@tanstack/react-query` + `react-hook-form` (client checkout form, per constitution stack).
Zod, `server-only` already present.
**Storage**: Supabase Postgres via Drizzle. New `users` table; `orders` amended (add `user_id`
FK, drop inline `email`/`whatsapp`). Migrations regenerated via drizzle-kit.
**Testing**: Vitest — unit (OTP generation/hash/verify + rate-limit logic, payment factory
selection, Zod schemas) and integration (route handlers against a test DB, SendGrid + Stripe
mocked; a separate live Stripe-adapter test gated by `STRIPE_SECRET_KEY`).
**Target Platform**: Vercel (serverless, Node runtime) + Supabase Cloud
**Project Type**: Web application (Next.js App Router) — adds a checkout page + client form,
server-side Route Handlers, and server-only service/adapter modules.
**Performance Goals**: Landing LCP < ~2.5s on mid-tier mobile (existing); OTP send accepted by
SendGrid < 5s p95; single-order/user lookups are single indexed queries.
**Constraints**: All secrets (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `STRIPE_SECRET_KEY`)
server-only in `.env.local`, never `NEXT_PUBLIC_`. Payment provider details MUST NOT leak past
the `lib/payments` seam. Payable amount is server-authoritative. Payment status derived only
from the provider (server-side), never client input.
**Scale/Scope**: One product, low volume, single currency (AUD).

**Endpoint style**: Checkout mutations are **Route Handlers** under `app/api/checkout/*`
(Web Request/Response, `runtime = 'nodejs'`), consumed from the client via TanStack Query
mutations. Chosen over Server Actions for testability and clean pairing with TanStack Query
(research R1).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Single-Product Simplicity (YAGNI) | Scope limited to the funnel seam; no cart/multi-product. **Tension**: a `users` table borders Principle I's "no user accounts" exclusion. Justified: it is a **passwordless contact record** — no password, no login, no session-as-identity, no auth system — created purely to hold verified contact and relate orders. Recommend a one-line PATCH clarification to the constitution that a passwordless customer contact record is permitted (distinct from authenticated accounts). | ⚠️→✅ Pass w/ note |
| II. Conversion-First Experience | Landing already conversion-optimized; this only wires its CTA into a short checkout (contact→OTP→pay). One mandated gate (OTP) per the constitution. | ✅ Pass |
| III. Payment Integrity (NON-NEGOTIABLE) | Stripe **Payment Intents** (not Checkout Sessions); provider isolated behind `lib/payments` with Factory/Adapter; status derived server-side; amount server-set. Webhook/refund are later specs but the neutral seam is defined here. | ✅ Pass |
| IV. Server-Side Trust & Security | OTP email verification gates payment; `verified` read server-side; every endpoint Zod-validated; secrets server-only. | ✅ Pass |
| V. Clean, Layered Architecture | Feature modules (`features/checkout`), isolated `lib/payments` + `lib/email`; Route Handlers stay thin over server-only services; composition, no inheritance. | ✅ Pass |

**Gate result**: PASS. One noted tension (users table vs "no user accounts") is user-directed
and justified as a passwordless contact record; a constitution clarification is recommended
(tracked in Complexity Tracking) rather than blocking.

## Project Structure

### Documentation (this feature)

```text
specs/002-storefront-checkout-payments/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── checkout-api.md          # send-otp / verify-otp / create-intent route contracts
│   └── payment-provider.md      # provider-agnostic interface contract
└── checklists/
    └── requirements.md  # from /speckit-specify
```

### Source Code (repository root)

```text
lib/
├── db/
│   ├── schema.ts              # AMEND: add `users`; orders gains user_id FK, drops email/whatsapp
│   └── index.ts               # unchanged (server-only Drizzle client)
├── config/
│   └── product.ts             # server-only: single-product price (AUD 8900 minor units) + currency
├── email/
│   └── sendgrid.ts            # server-only: SendGrid client + sendOtpEmail()
└── payments/
    ├── types.ts               # PaymentProvider interface + normalized PaymentIntent/Status types
    ├── factory.ts             # provider registry + getPaymentProvider()
    ├── providers/
    │   └── stripe.ts          # server-only: Stripe adapter (createIntent + verify)
    └── index.ts               # server-only public API: createPaymentIntent(), verifyPayment()

features/
├── orders/                    # AMEND (from 001): createOrder takes userId (not email/whatsapp);
│   └── ...                    #   anonymizePii moves to users; Order type gains userId, drops contact
└── checkout/
    ├── domain/
    │   └── otp.ts             # code generation, hashing, expiry/attempt/cooldown policy
    ├── data/
    │   └── user.repository.ts # server-only DAL: createOrFindUser, issueOtp, verifyOtp, markVerified, anonymizePii
    ├── schemas/
    │   └── checkout.schema.ts # Zod: contact, otp-code, create-intent request
    ├── types/
    │   └── checkout.types.ts
    ├── components/
    │   ├── ContactForm.tsx    # RHF + Zod, client
    │   └── OtpForm.tsx        # client
    ├── hooks/
    │   └── use-checkout.ts    # TanStack Query mutations (send-otp / verify-otp / create-intent)
    └── index.ts

app/
├── checkout/
│   └── page.tsx               # checkout page (client) — contact → OTP → continue to payment
└── api/
    └── checkout/
        ├── send-otp/route.ts      # POST — validate contact, upsert user, issue+send OTP
        ├── verify-otp/route.ts     # POST — verify code, set verified
        └── create-intent/route.ts  # POST — verified-only: create order+intent via lib/payments

components/sections/Offer.tsx  # AMEND: primary CTA → /checkout (currently href="#")
components/sections/Hero.tsx   # AMEND (optional): "Or shop now" → /checkout

tests/
├── unit/
│   ├── otp.test.ts
│   ├── checkout.schema.test.ts
│   └── payment-factory.test.ts
└── integration/
    ├── checkout.send-otp.test.ts
    ├── checkout.verify-otp.test.ts
    ├── checkout.create-intent.test.ts
    └── payment.stripe-adapter.test.ts   # gated by STRIPE_SECRET_KEY
```

**Structure Decision**: Web application (Next.js App Router). New customer domain lives in
`features/checkout` (UI + hooks + server-only user/OTP data access); payment provider isolation
lives in `lib/payments` (interface + factory + Stripe adapter); email in `lib/email`. Route
Handlers under `app/api/checkout` stay thin over these server-only services. The `001`
`features/orders` module and `lib/db/schema.ts` are amended to relate orders to users.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|-----------|-----------|--------------------------------------|
| `users` table (borders Principle I "no user accounts") | User-directed data model (clarify 2026-08-02); gives a persistent verified-contact record and a clean `orders.user_id` relation, and relocates PII for anonymization | Keeping contact inline on `orders` (the 001 approach) was rejected by the user in favor of a normalized users↔orders relation. Mitigation: it is passwordless (no auth), so it does not introduce an authentication system. Recommend a one-line constitution PATCH clarifying passwordless contact records are allowed. |
| Amending the already-implemented `001` schema/DAL | The users relation requires moving contact off `orders` | A parallel contact table without touching `orders` would duplicate identity and break the FK intent; since 001's migration was never applied to a live DB, a clean regeneration is cheaper than layering. |
