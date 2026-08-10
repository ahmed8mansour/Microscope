---
description: "Task list for Storefront, Checkout (Contact + OTP) & Payment Abstraction"
---

# Tasks: Storefront, Checkout (Contact + OTP) & Payment Abstraction

> **Post-completion note (2026-08-04)**: the `verified` flag built here was later changed from a
> persistent credential to a **per-checkout** one — reset on each new OTP, stamped with a new
> `verified_at` column, and consumed on payment-intent creation within a freshness window. A
> returning customer re-verifies each purchase. See the spec's Clarifications 2026-08-04. Any
> "verified persists" wording in the tasks below is superseded.

**Input**: Design documents from `/specs/002-storefront-checkout-payments/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/checkout-api.md,
contracts/payment-provider.md, quickstart.md

**Tests**: INCLUDED. Success criteria (SC-003–SC-007) and the security acceptance scenarios are
only verifiable through automated tests. Research R9: Vitest — unit (OTP/schemas/factory) +
integration (route handlers, SendGrid & provider mocked; a live Stripe test gated by
`STRIPE_SECRET_KEY`).

**Organization**: By user story (US1 Landing, US2 Checkout+OTP, US3 Payment abstraction).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no incomplete dependencies → parallelizable
- All paths repo-root relative. Server-only modules carry `import 'server-only'`.

## Path Conventions

- Shared infra: `lib/db`, `lib/config`, `lib/email`, `lib/payments`
- Customer domain: `features/checkout`; amended order domain: `features/orders` (from 001)
- Routes/UI: `app/checkout`, `app/api/checkout`, `components/sections`
- Tests: `tests/unit`, `tests/integration`

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Install dependencies in `package.json`: `stripe`, `@sendgrid/mail`, `@tanstack/react-query`, `react-hook-form`
- [X] T002 [P] Add the three new server-only keys (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `STRIPE_SECRET_KEY`) to `.env.example` as placeholders (no `NEXT_PUBLIC_`; real values go only in `.env.local`)
- [X] T003 [P] Create server-only single-product config in `lib/config/product.ts` — `import 'server-only'`; export authoritative `{ amount: 8900, currency: 'AUD' }` (minor units); this is the sole source of the payable amount (FR-015)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `users` table + amended `orders`/DAL that both US2 and US3 depend on.

**⚠️ CRITICAL**: No user-story work on US2/US3 can begin until this phase is complete.

- [X] T004 Amend `lib/db/schema.ts` — add the `users` table per data-model.md: `id`, `email`, `whatsapp`, `verified` (default false), OTP columns (`otp_code_hash`, `otp_expires_at`, `otp_attempt_count`, `otp_last_sent_at`, `otp_send_count`, `otp_send_window_start`), `created_at`/`updated_at` (`$onUpdate`); unique index on `lower(email)`; `check` for non-negative counters; `.enableRLS()`
- [X] T005 Amend `lib/db/schema.ts` — on `orders`: add `userId` (`uuid` NOT NULL, `references(() => users.id)`), add `index('orders_user_id_idx')`, and remove the `email`/`whatsapp` columns (same file as T004 → sequential)
- [X] T006 Regenerate the migration — delete `drizzle/0000_*.sql` and `drizzle/meta/*`, run `npm run db:generate` to emit a single clean baseline for `users` + amended `orders`; confirm `orders_user_id_idx`, the FK, and `users_email_uidx` appear (depends on T004, T005). **Result**: `drizzle/0000_flippant_triathlon.sql` — both tables, FK, all indexes, RLS confirmed present.
- [X] T007 [P] Amend `features/orders/types/order.types.ts` — `Order`/`OrderRow` drop `email`/`whatsapp`, add `userId: string`; `CreateOrderInput` becomes `{ userId, amount, currency }`
- [X] T008 [P] Amend `features/orders/schemas/order.schema.ts` — `createOrderSchema` validates `userId` (uuid) + amount + currency; remove the email/whatsapp contact fields
- [X] T009 Amend `features/orders/data/order.repository.ts` — `createOrder({ userId, amount, currency })` inserts with `user_id`; `toOrder` maps `userId` (no email/whatsapp); **remove `anonymizePii`** from the order repo (contact now lives on `users`; anonymization moves to the user repo in T021) (depends on T007, T008)
- [X] T010 Update 001 order tests to the new shape — `tests/integration/order.create.test.ts`, `order.status.test.ts`, `order.idempotency.test.ts` amended to seed a `users` row and pass `userId` to `createOrder`; `order.pii.test.ts` replaced by `order.notes.test.ts` (updateNotes-only; order-level `anonymizePii` test re-homed to US2's `user.pii.test.ts`); `order.schema.test.ts` updated to `userId`-based input. `tsc --noEmit` clean, `vitest run` 28 passed/0 failed (17 skipped, no DB), `eslint` clean (depends on T009)

**Checkpoint**: Schema + amended order DAL ready; US2 and US3 can proceed.

---

## Phase 3: User Story 1 - Landing CTA funnels to checkout (Priority: P1) 🎯 MVP

**Goal**: The already-built landing page's primary purchase CTA routes into `/checkout`.

**Independent Test**: From the landing page, activating the primary "Add to cart" CTA navigates
to `/checkout` (no dead link); the page is reachable and responsive (spec US1; FR-002, SC-002).

### Implementation for User Story 1

- [X] T011 [US1] Create a minimal client checkout page shell at `app/checkout/page.tsx` (renders a heading + placeholder; US2 fills it) so the CTA has a live target
- [X] T012 [US1] Wire the primary CTA in `components/sections/Offer.tsx` — change `CTAButton href="#"` ("Add to cart — $89") to `href="/checkout"`
- [X] T013 [P] [US1] Wire the secondary "Or shop now" action in `components/sections/Hero.tsx` to navigate to `/checkout` (changed from a scroll-to-`#offer` button to a `next/link` Link, preserving styling)

**Checkpoint**: Landing CTA reaches `/checkout`. **Verified live** in the browser preview: both `Offer`'s "Add to cart — $89" and `Hero`'s "Or shop now" resolve to `href="/checkout"`; navigating to `/checkout` renders the shell ("Checkout" / "The Field Microscope — $89 AUD") with zero console errors.

---

## Phase 4: User Story 2 - Verified contact capture before payment (Priority: P1)

**Goal**: Capture the customer as a `users` record, email a 6-digit OTP via SendGrid, and verify
it server-side to set `users.verified = true`, gating payment.

**Independent Test**: Submit valid email + WhatsApp → code emailed; correct code within the
window verifies and unlocks "continue to payment"; wrong/expired code is rejected and payment
stays blocked (spec US2; FR-004–010; SC-003–005).

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T014 [P] [US2] Unit tests for the OTP domain in `tests/unit/otp.test.ts` — 6-digit generation, hash+compare, expiry, attempt cap (5), cooldown (60s), daily-cap math. 17 tests, all passing.
- [X] T015 [P] [US2] Unit tests for checkout schemas in `tests/unit/checkout.schema.test.ts` — contact (email + non-empty whatsapp), 6-digit code, create-intent request. 10 tests, all passing.
- [X] T016 [P] [US2] Integration test in `tests/integration/checkout.send-otp.test.ts` — valid contact upserts a user + issues a code (SendGrid mocked); cooldown → 429; invalid input → 400; response never contains the code (DB-gated, skips without `DATABASE_URL`)
- [X] T017 [P] [US2] Integration test in `tests/integration/checkout.verify-otp.test.ts` — correct code sets `verified`; wrong code increments attempts and → 401; expired → 401; attempt cap → 429. PII-anonymization test written as a separate file `tests/integration/user.pii.test.ts` (contact cleared, verified state + id intact) — re-homed from 001's order-level test (DB-gated)

### Implementation for User Story 2

- [X] T018 [US2] Create `features/checkout/domain/otp.ts` — code generation, salted hashing + constant-time compare, and policy constants (6-digit, 10-min, 5 attempts, 60s cooldown, daily cap)
- [X] T019 [P] [US2] Create `features/checkout/schemas/checkout.schema.ts` (Zod: contact, otp-code, create-intent) and `features/checkout/types/checkout.types.ts` — create-intent schema is `.strict()` so a client-supplied amount is rejected
- [X] T020 [P] [US2] Create server-only SendGrid client in `lib/email/sendgrid.ts` — `import 'server-only'`; `sendOtpEmail(to, code)` reads `SENDGRID_API_KEY`/`SENDGRID_FROM_EMAIL`; normalized `EmailSendError`
- [X] T021 [US2] Create server-only user DAL in `features/checkout/data/user.repository.ts` — `import 'server-only'`; `createOrFindUser` (case-insensitive email reuse, unique-violation-safe), `issueOtp` (cooldown + daily-cap guards, window rollover), `verifyOtp` (attempt cap, hash compare, sets `verified`, clears OTP fields — folds "markVerified" into verifyOtp's side effect rather than a separate method), `getUserByEmail`/`getUserById`, `anonymizePii` (nulls user contact) (depends on T018)
- [X] T022 [US2] Implement `app/api/checkout/send-otp/route.ts` (POST, `runtime='nodejs'`) per contracts/checkout-api.md — Zod-validate, `createOrFindUser`, `issueOtp`, `sendOtpEmail`; 400/429/502 mapping. Added shared `app/api/checkout/_lib/respond.ts` helper (private folder, excluded from routing) for error-JSON shaping (depends on T019, T020, T021)
- [X] T023 [US2] Implement `app/api/checkout/verify-otp/route.ts` (POST) per contract — Zod-validate, `verifyOtp`; 200/400/401/429 mapping; unknown email treated the same as "no active code" (enumeration-resistant) (depends on T019, T021)

**Verification so far**: `tsc --noEmit` clean; `eslint` clean; `vitest run` 55 passed / 0 failed / 27 skipped (DB-gated tests correctly skip without `DATABASE_URL`).
- [X] T024 [US2] Add a TanStack Query provider — `components/providers/QueryProvider.tsx` (client) and wrap it in `app/layout.tsx`
- [X] T025 [US2] Create checkout mutation hooks in `features/checkout/hooks/use-checkout.ts` (TanStack Query: `useSendOtp`, `useVerifyOtp`) and the `ContactForm`/`OtpForm` client components in `features/checkout/components/`, then compose them into `app/checkout/page.tsx` (RHF + Zod, contact→otp→verified steps) (depends on T024, T019). **Verified live** in browser: ContactForm renders; native+Zod validation blocks bad email (no request sent); valid submit POSTs to send-otp and the error path (500, expected — no DB/SendGrid configured here) renders gracefully with no console errors.

**Checkpoint**: US1 + US2 work — CTA → checkout → verified contact, payment gated.

---

## Phase 5: User Story 3 - Provider-agnostic payment abstraction (Priority: P1)

**Goal**: Create + verify payments through a neutral interface with a Stripe adapter selected by
a factory; a verified user's "continue to payment" creates the order + intent and returns a
client secret.

**Independent Test**: Through `lib/payments` (not Stripe directly) create an intent for an
order and get `{ providerRef, clientSecret }`, then verify a reference and get a normalized
status — no provider types in the caller; adding a stub provider needs no caller changes (spec
US3; FR-011–016; SC-006/007).

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [X] T026 [P] [US3] Unit test the factory in `tests/unit/payment-factory.test.ts` — default resolves to Stripe; a stub `PaymentProvider` registers and is selected with zero caller changes (SC-007); public API exposes no provider-specific type (SC-006). **Note**: fixing this test surfaced a pre-existing latent bug — `server-only` throws unconditionally under plain Node/Vitest resolution (verified empirically), which would have broken 001's DB-gated tests the first time a real `DATABASE_URL` was set. Fixed in `vitest.config.mts` by resolving the `react-server` condition under `ssr.resolve.conditions`, matching how Next.js's bundler treats `server-only` for real Server Components. 9 tests, all passing.
- [X] T027 [P] [US3] Integration test `app/api/checkout/create-intent` in `tests/integration/checkout.create-intent.test.ts` — 403 unless the user is verified; success creates a pending order linked to the user, creates the intent (provider mocked via `vi.mock('@/lib/payments')`), attaches the reference, returns a client secret; a client-sent amount is rejected by the strict schema (400) rather than silently accepted (DB-gated)
- [X] T028 [P] [US3] Gated live test in `tests/integration/payment.stripe-adapter.test.ts` — `skipIf(!STRIPE_SECRET_KEY)`; create a real test-mode PaymentIntent and assert the normalized status mapping

### Implementation for User Story 3

- [X] T029 [P] [US3] Create `lib/payments/types.ts` — `PaymentProvider` interface + `CreateIntentInput`/`NormalizedIntent` (reuse the 001 `PaymentStatus` via `import type`, so no runtime import of the server-only orders module)
- [X] T030 [US3] Create `lib/payments/factory.ts` — provider registry, `registerProvider`, `getPaymentProvider(name?)` defaulting to `stripe` (depends on T029)
- [X] T031 [US3] Create server-only `lib/payments/providers/stripe.ts` — `import 'server-only'`; Stripe adapter (`createIntent` → PaymentIntents.create with `metadata.orderId`; `verify` → retrieve with `expand:['latest_charge']` + full status mapping incl. refunded, per contract) (depends on T029)
- [X] T032 [US3] Create `lib/payments/index.ts` — `createPaymentIntent()`/`verifyPayment()` over the factory; registers the Stripe adapter; no provider types cross this boundary (depends on T030, T031)
- [X] T033 [US3] Implement `app/api/checkout/create-intent/route.ts` (POST, `runtime='nodejs'`) per contract — Zod-validate (strict); load user, **403 unless `verified`**; read amount/currency from `lib/config/product.ts`; `createOrder({ userId, … })` (001 DAL); `createPaymentIntent(...)`; `attachPaymentReference(...)` (409 on `ConflictError`); return `{ clientSecret, orderId }` (depends on T032, T009)
- [X] T034 [US3] Wire the checkout "Continue to payment" action to `create-intent` — added `useCreateIntent` to `features/checkout/hooks/use-checkout.ts` and triggered from `app/checkout/page.tsx`'s verified step, showing the resulting order id (card-entry UI consuming the client secret is the next spec) (depends on T025, T033)

**Verification**: `tsc --noEmit` clean; `eslint` clean (feature files); `vitest run` 59 passed / 0 failed / 32 skipped (DB/Stripe-key-gated tests correctly skip). `next build` now requires real env vars (`DATABASE_URL` etc.) because Next's build-time "collecting page data" step evaluates the new route handlers' module graph, hitting `lib/db/index.ts`'s fail-fast validation (present since 001, only now exercised because a route finally imports it) — this is expected production behavior (Vercel injects env vars at build time), not a code defect; unverifiable further in this credential-less sandbox.

**Checkpoint**: Full funnel — CTA → checkout → OTP → create order+intent through the abstraction.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T035 [P] Verify the `server-only` guard for the new secret-holding modules (`lib/email/sendgrid.ts`, `lib/payments/providers/stripe.ts`, `lib/payments/index.ts`, `features/checkout/data/user.repository.ts`) — a temporary `'use client'` import must fail `next build`; document and revert (per 001 T026 method). **Result**: confirmed via a temporary client route (deleted after) — Turbopack's own `server-only` detection fires explicitly (clearer than 001's Node-builtin-resolution error) for all three modules plus the transitive `lib/db/index.ts`. `.next` cleaned afterward to clear the stale generated-types artifact from the intentionally-failed build; `tsc --noEmit` reconfirmed clean.
- [ ] T036 [P] (SKIPPED — left for the user to decide) Apply the recommended constitution PATCH in `.specify/memory/constitution.md` — clarify that a passwordless customer contact record (`users`) is permitted and distinct from an authenticated account (Principle I); bump to 1.0.2 with a Sync Impact note (see plan Complexity Tracking). Not applied without explicit confirmation.
- [X] T037 Run `quickstart.md` validation — **Result**: `tsc --noEmit` clean, `eslint` clean (feature files), `vitest run` 59 passed/0 failed/32 skipped (DB- and `STRIPE_SECRET_KEY`-gated tests correctly skip without those env vars), migration confirmed to contain `users` + `orders.user_id` FK (see T006). `next build` requires real env vars once live route handlers reference `lib/db` — expected (Vercel injects env vars at build time), not verifiable further in this credential-less sandbox; same limitation 001 documented.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no deps.
- **Foundational (P2)**: depends on Setup; BLOCKS US2 and US3. US1 does **not** depend on it.
- **US1 (P3)**: independent (only needs a `/checkout` route target) — can run right after Setup.
- **US2 (P4)**: depends on Foundational (users table + amended DAL).
- **US3 (P5)**: depends on Foundational; its create-intent (T033/T034) depends on US2 (verified
  user + checkout page) and the 001 order DAL.
- **Polish (P6)**: after the stories it verifies.

### Key task dependencies

- T006 → {T004, T005}; T009 → {T007, T008}; T010 → T009
- US2: T018 → T021; T022 → {T019,T020,T021}; T023 → {T019,T021}; T025 → {T024,T019}
- US3: T030/T031 → T029; T032 → {T030,T031}; T033 → {T032, T009}; T034 → {T025, T033}

### Shared-file serialization

- `lib/db/schema.ts`: T004 then T005 (sequential).
- `features/orders/data/order.repository.ts`: T009 (single edit).
- `app/checkout/page.tsx`: T011 (shell) → T025 (form) → T034 (continue action) — sequential.
- `features/checkout/hooks/use-checkout.ts`: T025 then T034 — sequential.

---

## Parallel Opportunities

- **Setup**: T002, T003 in parallel (T001 edits `package.json`).
- **Foundational**: T007, T008 in parallel (distinct files); T004→T005→T006 is the schema spine; T009→T010 follow.
- **US2 tests**: T014–T017 in parallel; impl T019/T020 in parallel, then T021, then the routes.
- **US3 tests**: T026–T028 in parallel; T029 then T030/T031 in parallel, then T032.
- **Across stories**: US1 can proceed in parallel with Foundational/US2 (independent files).

### Parallel Example: US2 tests

```bash
Task: "T014 OTP unit tests in tests/unit/otp.test.ts"
Task: "T015 schema unit tests in tests/unit/checkout.schema.test.ts"
Task: "T016 send-otp integration test in tests/integration/checkout.send-otp.test.ts"
Task: "T017 verify-otp integration test in tests/integration/checkout.verify-otp.test.ts"
```

---

## Implementation Strategy

### MVP scope

All three stories are P1 (one funnel). Recommended increment:

1. Setup → 2. Foundational → 3. US1 (CTA, quick win) → 4. US2 (checkout + OTP) →
5. US3 (payment abstraction + create-intent) → 6. Polish.

US1 is shippable on its own (CTA reaches a checkout shell). US2 makes the checkout functional
through verification. US3 completes the order+intent handoff to the (later) payment page.

### Notes

- Write each story's tests first; confirm they fail before implementing.
- Integration tests need a reachable test DB (see quickstart); SendGrid and the payment provider
  are mocked; the live Stripe test is gated by `STRIPE_SECRET_KEY`.
- This feature **amends 001** (schema + order DAL + its tests) — treat T004–T010 as a careful
  refactor, re-running `npx vitest run` after T010 to confirm 001's suite is green on the new shape.
- Total: **37 tasks** — Setup 3, Foundational 7, US1 3, US2 12, US3 9, Polish 3.
