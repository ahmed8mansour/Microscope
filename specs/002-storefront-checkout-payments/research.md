# Phase 0 Research: Storefront, Checkout (Contact + OTP) & Payment Abstraction

Grounded in the installed stack (Next.js 16.2.12, Drizzle 0.45, Zod 4) and the bundled Next 16
docs (`node_modules/next/dist/docs/`), per AGENTS.md.

## R1. Endpoint style — Route Handlers + TanStack Query (not Server Actions)

- **Decision**: Implement checkout mutations as **Route Handlers** (`app/api/checkout/*/route.ts`,
  `POST`, `runtime = 'nodejs'`), called from the client via **TanStack Query** mutations. The
  checkout page and its forms are client components using React Hook Form + Zod.
- **Rationale**: The constitution mandates Route Handlers / Server Actions and lists TanStack
  Query + RHF in the stack. Route Handlers give explicit, independently testable HTTP endpoints
  (send-otp / verify-otp / create-intent) that integration tests can hit directly, and pair
  cleanly with TanStack Query on the client. Route Handlers use the Web `Request`/`Response`
  API and run on the Node runtime (needed for the Stripe/SendGrid SDKs and postgres.js).
- **Alternatives**: Server Actions — viable, but harder to integration-test in isolation and
  less natural with TanStack Query; deferred. Edge runtime — rejected (Node-only SDKs + pooled
  postgres.js).

## R2. Email delivery — `@sendgrid/mail`, server-only

- **Decision**: Add `@sendgrid/mail`; wrap it in `lib/email/sendgrid.ts` (`import 'server-only'`)
  exposing `sendOtpEmail(to, code)`. Reads `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` from
  `process.env`. On a non-2xx/thrown result, surface a normalized "email send failed" error so
  the route handler can tell the client to retry without granting verified state.
- **Rationale**: Spec mandates SendGrid; official SDK is the least-effort, server-only path.
  Success is measured at "send accepted by provider" (SC-003) — inbox delivery is outside our
  control. A verified sender identity is an operational prerequisite (documented in quickstart).
- **Alternatives**: Raw REST to SendGrid — more code, no benefit. SMTP — heavier, slower.

## R3. OTP model & policy — stored on the `users` row, hashed

> **Superseded in part (2026-08-04)**: the `verified` boolean is no longer a persistent
> credential. It is per-checkout — reset on each new code, stamped with `verified_at`, and
> consumed on payment-intent creation. A `verified_at` column was added. See the spec's
> Clarifications 2026-08-04.

- **Decision**: Store OTP verification state as columns on the `users` row (keeping to the
  user's "two tables" model): `otp_code_hash`, `otp_expires_at`, `otp_attempt_count`,
  `otp_last_sent_at`, plus a daily-cap counter (`otp_send_count`, `otp_send_window_start`), and
  the `verified` boolean (+ `verified_at`). The code is hashed (never stored/plaintext); verification
  compares a hash of the submitted code. Policy (clarified): 6-digit numeric, 10-min expiry, 5
  attempts/code, 60-s resend cooldown, per-email daily cap.
- **Rationale**: FR-006 (no recoverable code), FR-007/007a/008. Co-locating OTP fields on
  `users` honors the two-table decision and avoids a third table. Hashing with a fast salted
  hash is sufficient for a short-lived 6-digit code combined with the attempt cap and expiry.
- **Alternatives**: Separate `otp_verifications` table — cleaner separation but adds a third
  table the user didn't ask for; deferred. Storing plaintext — rejected (FR-006). Redis/edge KV
  for OTP — over-engineered for MVP volume; the DB row is sufficient.

## R4. Stripe adapter — `stripe` Node SDK, Payment Intents

- **Decision**: Add `stripe`; implement `lib/payments/providers/stripe.ts` (`server-only`)
  using the Payment Intents API. `createIntent({ amount, currency, orderId })` →
  `stripe.paymentIntents.create({ amount, currency, metadata: { orderId } })`, returning
  `{ providerRef: pi.id, clientSecret: pi.client_secret }`. `verify(providerRef)` →
  `stripe.paymentIntents.retrieve(ref)` mapped to the normalized status.
- **Status mapping** (Stripe → normalized): `succeeded → success`; `canceled → failed`;
  `processing | requires_* → pending`; a refunded charge on the PI → `refunded` (full detection
  belongs to the later webhook spec; `verify` returns `refunded` if the retrieved PI's latest
  charge shows refunded, else the above).
- **Rationale**: Constitution mandates Payment Intents (NOT Checkout Sessions). Amounts are
  integer minor units (AUD 8900), matching the 001 order amount convention. `metadata.orderId`
  ties the provider intent back to our order.
- **Alternatives**: Checkout Sessions — explicitly forbidden. Stripe Elements server bits —
  belong to the later payment-page spec.

## R5. Payment abstraction shape — interface + factory, normalized types

- **Decision**: `lib/payments/types.ts` defines a `PaymentProvider` interface
  (`createIntent(input): Promise<NormalizedIntent>`, `verify(ref): Promise<PaymentStatus>`) and
  normalized types that reuse the 001 `PaymentStatus` vocabulary. `lib/payments/factory.ts`
  holds a provider registry keyed by name and `getPaymentProvider()` returns the configured one
  (Stripe). `lib/payments/index.ts` exposes `createPaymentIntent()` / `verifyPayment()` that
  callers use — never importing `stripe` types.
- **Rationale**: FR-011/012/013/016 and SC-006/007 (Strategy/Factory/Adapter; no provider types
  leak; a new provider = new adapter + registration only).
- **Alternatives**: Direct Stripe calls in route handlers — rejected (violates isolation).
  Dependency-injection container — over-engineered for one provider (Principle I).

## R6. Amending the 001 schema & DAL — clean regeneration

- **Decision**: Amend `lib/db/schema.ts`: add `users`; on `orders` add `userId` (uuid, FK →
  `users.id`, not null) and remove the `email`/`whatsapp` columns. Because 001's migration was
  **never applied to a live database**, delete the existing generated migration + snapshot and
  re-run `drizzle-kit generate` to emit a single clean baseline covering `users` + amended
  `orders`. Update `features/orders`: `createOrder` takes `{ userId, amount, currency }` (no
  inline contact); the `Order` type drops `email`/`whatsapp`, gains `userId`; `anonymizePii`
  moves to the user repository (nulls the user's contact, order financial record intact).
  Update the 001 order tests that referenced inline contact.
- **Rationale**: A normalized users↔orders relation per the clarification. Regenerating the
  baseline (vs an alter-migration) keeps a single tidy migration since nothing is deployed.
- **Alternatives**: Incremental alter migration — unnecessary churn for an unapplied baseline.
  Leaving contact on orders too — rejected (duplicated identity, contradicts FR-016a).

## R7. `users` vs constitution "no user accounts"

- **Decision**: Model `users` as a **passwordless contact record** — no password column, no
  login, no session-as-identity, no auth flow. Verification is email-ownership proof, not
  authentication. Flag a recommended one-line constitution PATCH clarifying this is permitted.
- **Rationale**: Honors the user's data-model directive while staying within Principle I's
  intent (avoid an authentication system). Documented in the plan's Constitution Check +
  Complexity Tracking.
- **Alternatives**: Rename to `customers` to sidestep the word — cosmetic; the user said
  "users". Full accounts (password/login) — explicitly out of scope and unwanted.

## R8. Rate limiting — DB-backed on the user row

- **Decision**: Enforce resend cooldown and per-email daily cap using the `users` OTP counters
  (`otp_last_sent_at`, `otp_send_count`, `otp_send_window_start`) checked inside the send-otp
  handler; attempt cap via `otp_attempt_count` in verify-otp. No external rate-limit service.
- **Rationale**: MVP volume is low and single-instance-friendly; DB counters are sufficient and
  keep the dependency surface minimal (Principle I). FR-008/SC-005.
- **Alternatives**: Upstash/edge rate limiter — over-engineered now; revisit if abuse appears.

## R9. Testing strategy

- **Decision**: Unit-test pure logic with no I/O (OTP code gen/hash/verify, cooldown/expiry/
  attempt math, Zod schemas, payment factory selection with a stub adapter). Integration-test
  the three route handlers against a test DB with SendGrid and the payment provider **mocked**
  (inject a fake adapter via the factory). Add one **live** Stripe-adapter test gated by
  `STRIPE_SECRET_KEY` (test mode) so it runs in CI but skips locally without keys — mirroring
  the 001 DB-gated pattern.
- **Rationale**: Deterministic, no-network unit + integration coverage of the acceptance
  criteria; the gated live test proves the real Stripe mapping without blocking `npm test`.
- **Alternatives**: Hitting real SendGrid/Stripe in every test — flaky, slow, rejected.
