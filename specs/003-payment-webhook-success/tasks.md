---
description: "Task list for Payment Page, Webhook & Order Sync, and Success Page"
---

# Tasks: Payment Page, Webhook & Order Sync, and Success Page

> **Post-completion note (2026-08-04)**: this checklist records the tasks as originally built,
> including a standalone `app/success/page.tsx`. That page was later **removed** and its
> confirmation folded into an **in-checkout "confirmed" step** (card confirms inline via
> `confirmPayment({ redirect: 'if_required' })`; client secret in the POST body, not the URL).
> See the spec's Clarifications 2026-08-04. The confirm route, webhook, and server verification
> are unchanged — treat any `/success` references below as superseded.

**Input**: Design documents from `/specs/003-payment-webhook-success/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/webhook-api.md,
contracts/confirm-api.md, contracts/payment-provider-ext.md, quickstart.md

**Tests**: INCLUDED. Success criteria (SC-002/003/006/007/008) and the security/idempotency
acceptance scenarios are only verifiable through automated tests. Research R9: Vitest — unit
(event→status mapping, success scoping) + integration (webhook & confirm routes, provider
mocked; a live Stripe test gated by `STRIPE_SECRET_KEY`). The payment page's Stripe Elements
flow is verified manually with test cards (no E2E runner in this repo).

**Organization**: By user story (US1 Payment page, US2 Webhook & sync, US3 Success page).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: different files, no incomplete dependencies → parallelizable
- All paths repo-root relative. Server-only modules carry `import 'server-only'`.

## Path Conventions

- Provider abstraction: `lib/payments`; shared sync: `features/orders`
- Payment UI: `features/payment`, `app/checkout` (existing), `app/success`
- Routes: `app/api/webhooks/stripe`, `app/api/checkout/confirm`
- Tests: `tests/unit`, `tests/integration`

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Install client Stripe SDKs in `package.json`: `@stripe/stripe-js`, `@stripe/react-stripe-js` (server `stripe` already present)
- [X] T002 [P] Add to `.env.example`: `STRIPE_WEBHOOK_SECRET` (server-only, secret) and the two intentionally-public values `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` + `NEXT_PUBLIC_WHATSAPP_SUPPORT`, with a comment noting the publishable key is public by design
- [X] T003 [P] Create `lib/config/support.ts` — export the WhatsApp support link built from `NEXT_PUBLIC_WHATSAPP_SUPPORT` (public; used by the success page button)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Extend the payment abstraction (webhook parse + snapshot) and the shared idempotent
order-sync `reconcile` used by both US2 and US3.

**⚠️ CRITICAL**: US2 and US3 depend on this phase.

- [X] T004 Extend `lib/payments/types.ts` — add `WebhookEventKind`, `NormalizedWebhookEvent`, `NormalizedPaymentSnapshot`, and the two new `PaymentProvider` methods (`parseWebhookEvent`, `getPaymentSnapshot`) per contracts/payment-provider-ext.md (reuse 001 `PaymentStatus`)
- [X] T005 Extend `lib/payments/providers/stripe.ts` — implement `parseWebhookEvent` (`stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET)` + event-type→`kind` mapping + extract providerRef/amount/currency; `receiptRef` intentionally null here — not reliably present without an extra expand, filled in instead by `getPaymentSnapshot` on the success-page path) and `getPaymentSnapshot` (retrieve intent with `expand:['latest_charge']`, normalize incl. receipt/customer ref) (depends on T004). Also updated the 002 `payment-factory.test.ts` stub provider to implement the two new methods (interface grew).
- [X] T006 Extend `lib/payments/index.ts` — export `parseWebhookEvent()` and `getPaymentSnapshot()`; no provider types cross the boundary (depends on T005)
- [X] T007 [P] Create `features/orders/order-sync.ts` (`import 'server-only'`) — shared `reconcile(providerRef, snapshot)`: load order by payment reference; if absent throw `RetryableNotFound`; on `success` enforce the amount/currency match guard (mismatch → `updateNotes` + return `flagged`, do NOT mark success); apply status via 001 `updatePaymentStatus` (idempotent, forward-only); catches `InvalidTransitionError` and returns `stale: true` for out-of-order events instead of throwing (FR-012); export `RetryableNotFound` (depends on T004; uses the 001 order repository)

**Verification**: `tsc --noEmit` clean, `eslint` clean, `vitest run` 59 passed/0 failed/32 skipped (unchanged from before — no new tests yet, this phase is pure abstraction/service code consumed by US2/US3).

**Checkpoint**: Abstraction + shared reconcile ready.

---

## Phase 3: User Story 1 - Customer completes payment on the payment page (Priority: P1) 🎯 MVP

**Goal**: Confirm the card against the existing Payment Intent (Stripe Elements — Payment
Intents, not Checkout Sessions), handling SCA/declines/double-submit, then redirect to success.

**Independent Test**: From a created intent, the payment step mounts the card form; a test
approval card advances to `/success`; a decline shows a clear retryable message; a 3-D Secure
card presents and completes the challenge (verified manually with Stripe test cards + `stripe
listen`).

### Implementation for User Story 1

- [X] T008 [US1] Create `features/payment/lib/stripe-client.ts` (client) — `loadStripe(NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)` memoized singleton
- [X] T009 [US1] Create `features/payment/components/PaymentForm.tsx` (client) — `<Elements>` + `<PaymentElement>` + `stripe.confirmPayment({ elements, confirmParams: { return_url: <origin>/success } })`; disable submit while pending (double-submit guard, FR-004); surface decline/error messages (FR-003) (depends on T008)
- [X] T010 [US1] Amend `app/checkout/page.tsx` — added a `payment` step that, after `create-intent` succeeds, mounts `<PaymentForm>` with the **in-memory** client secret (never in a URL); replaced the prior "Order created" placeholder (depends on T009)
- [X] T011 [US1] Create a minimal `app/success/page.tsx` shell (client) so the `return_url` resolves; US3 replaces it with the server-verified page

**Verification**: `tsc --noEmit` clean, `eslint` clean. Browser check (no live DB/Stripe keys in this sandbox): `/checkout` and `/success` both load with zero console errors. **The actual card-confirm flow (test-card approval, decline, 3-D Secure) requires your Stripe test keys + `stripe listen` and cannot be exercised here** — per quickstart.md §6, once you have `.env.local` filled in: run `npm run dev` + `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, go through checkout, and test with `4242 4242 4242 4242` (approve), `4000 0025 0000 3155` (3DS), `4000 0000 0000 9995` (decline). Report back what you see.

---

## Phase 4: User Story 2 - Authoritative, idempotent, verified order sync via webhooks (Priority: P1)

**Goal**: A signature-verified, idempotent webhook endpoint that is the durable source of order
truth, deduplicated and audited via `webhook_events`.

**Independent Test**: A signed `succeeded` event marks the order `success`; the same event
re-sent changes nothing; a forged signature is rejected (400); a `failed` event marks `failed`;
an amount mismatch is not-success + flagged; order-not-visible returns a retryable 503.

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T012 [P] [US2] Unit tests in `tests/unit/webhook-event-mapping.test.ts` — normalized event `kind` → target action (`succeeded`→success, `failed`/`canceled`→failed, `refunded`→refunded, `refund_partial`/`dispute`→flagged, other→ignored). **Note**: the pure classifier was extracted to `features/orders/domain/webhook-classification.ts` (not left inline in `order-sync.ts`) specifically so this unit test can import it without pulling in the DB-touching `@/features/orders` chain — mirrors 001's domain/data split.
- [X] T013 [P] [US2] Integration tests in `tests/integration/webhook.stripe.test.ts` (provider mocked via the factory) — signed succeeded → order success + `processed` row; **duplicate ≥5× and concurrent** → one effect (SC-002); **forged** → 400 no change (SC-003); failed → failed; **amount mismatch** → not success + `flagged` + order note (SC-007); full refund → refunded; **order-not-visible** → 503 and **no** event row (FR-018)

### Implementation for User Story 2

- [X] T014 [US2] Added the `webhook_events` table to `lib/db/schema.ts` per data-model.md (event-id `text` PK, `type`, `outcome` CHECK in (`processed`/`ignored`/`flagged`), nullable `order_id` FK → orders + index, `created_at`, RLS enabled); `npm run db:generate` emitted a clean **incremental** migration (`drizzle/0001_rich_archangel.sql`) touching only the new table — 001/002 tables untouched
- [X] T015 [US2] Create `features/orders/data/webhook-event.repository.ts` (`import 'server-only'`) — `hasProcessed(eventId)` and `recordEvent(id, type, outcome, orderId?)` using insert-if-absent semantics (catches unique-violation as a no-op) for atomic dedup under concurrency (depends on T014)
- [X] T016 [US2] Add `handleWebhookEvent(event)` to `features/orders/order-sync.ts` — dedup via the repo (already-processed → `duplicate`); classify via the pure `classifyEventKind`; call `reconcile` for order-affecting kinds (propagating `RetryableNotFound` uncaught so no event row is written); record the `webhook_events` outcome (`processed`/`ignored`/`flagged`, with `stale` out-of-order results recorded as `ignored`) (depends on T015, T007)
- [X] T017 [US2] Create `app/api/webhooks/stripe/route.ts` (POST, `runtime='nodejs'`) — read raw body via `request.text()` + `stripe-signature` header; `parseWebhookEvent` (400 on failure, log only); `handleWebhookEvent`; 200 on processed/ignored/duplicate; **503** on `RetryableNotFound` (no partial write) per contracts/webhook-api.md (depends on T006, T016)

**Verification**: `tsc --noEmit` clean, `eslint` clean, `vitest run` 66 passed/0 failed/39 skipped (all new webhook tests pass; DB-gated integration tests correctly skip without `DATABASE_URL`).

**Checkpoint**: Webhook is the durable, idempotent, verified order truth (US1 + US2 done).

---

## Phase 5: User Story 3 - Server-verified success page (Priority: P2)

**Goal**: A success page whose confirmation is server-verified (immediate provider retrieval,
hybrid with the webhook), reference-scoped, showing order details + WhatsApp support.

**Independent Test**: After payment, the success page shows a server-verified confirmation with
order details; opening it with a wrong/absent client secret shows no paid confirmation (403 /
not_found); a still-processing intent shows a pending state.

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [X] T018 [P] [US3] Unit tests in `tests/unit/success-scoping.test.ts` — the client-secret match gate authorizes only when the supplied secret equals the intent's (no id-guessing; SC-008). **Note**: extracted the check into a pure `features/payment/domain/access-scope.ts` (`isAuthorizedForSnapshot`) so it's testable without DB/route, mirroring the webhook classifier split.
- [X] T019 [P] [US3] Integration tests in `tests/integration/checkout.confirm.test.ts` (provider mocked) — verified → reconciled success view; pending intent → pending view; **client-secret mismatch → 403**; unknown reference → `not_found`; a client-reported "paid" is ignored (status only from the snapshot)
- [X] T020 [P] [US3] Gated live test in `tests/integration/payment.stripe-webhook.test.ts` — `skipIf(!STRIPE_SECRET_KEY)`; asserts real `getPaymentSnapshot` normalization (pending status, amount/currency/clientSecret) and that `parseWebhookEvent` rejects an invalid signature

### Implementation for User Story 3

- [X] T021 [US3] Create `app/api/checkout/confirm/route.ts` (POST, `runtime='nodejs'`) — Zod-validate `{ paymentIntentId, clientSecret }`; `getPaymentSnapshot` (404-style `not_found` view if retrieval fails); **403 unless the supplied client secret matches** (access scope, FR-022, via `isAuthorizedForSnapshot`); `reconcile` idempotently (404-style `not_found` view on `RetryableNotFound`); return the minimal `SuccessView` (status/orderId/amount/currency), per contracts/confirm-api.md (depends on T006, T007)
- [X] T022 [US3] Create `features/payment/hooks/use-confirm.ts` (client) — TanStack Query mutation → `POST /api/checkout/confirm`
- [X] T023 [US3] Replace `app/success/page.tsx` with the real client page — reads `payment_intent` + `payment_intent_client_secret` from the redirect params (wrapped in `<Suspense>` per Next's `useSearchParams` requirement), calls `use-confirm` on mount, and renders the server-verified states (success / pending / refunded / failed / not_found / no-params) with thank-you, order details, and the WhatsApp support button from `lib/config/support.ts` (depends on T021, T022)

**Verification**: `tsc --noEmit` clean, `eslint` clean, `vitest run` 71 passed/0 failed/46 skipped. Browser check on `/success`: zero console errors observed (the local dev server subsequently stopped mid-session — an external process lifecycle issue, not a code defect; not re-verified after restart since real end-to-end payment testing needs your live Stripe keys regardless, per quickstart.md §6).

**Checkpoint**: Full funnel complete — pay → webhook truth → server-verified success.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T024 [P] Verify the `server-only` guard for the new secret/DB modules — a temporary `'use client'` import of `features/orders/order-sync.ts` / `features/orders/data/webhook-event.repository.ts` / `lib/payments` must fail `next build`. **Result**: confirmed via a temporary client route (deleted after) — Turbopack's `server-only` detection fires for all three plus the transitive `lib/db/index.ts` and `order.repository.ts`. `.next` cleaned afterward; `tsc --noEmit` reconfirmed clean.
- [X] T025 Run `quickstart.md` validation — `tsc --noEmit` clean, `eslint` clean, `vitest run` 71 passed/0 failed/46 skipped, migration confirmed (`webhook_events` PK + `orders` FK present). **Important correction discovered during this pass**: a real `.env.local` appeared mid-session (`DATABASE_URL`, `SENDGRID_*`, `STRIPE_SECRET_KEY` set). Tests still skipped — investigated and found `@next/env`'s `loadEnvConfig` **deliberately excludes `.env.local` when `NODE_ENV=test`** (Vitest sets this automatically), by Next's own design, precisely to stop test runs from silently writing to whatever DB a developer's local env points at. I attempted wiring the same loader into `vitest.config.mts` (matching the user's `drizzle.config.ts` pattern) but **reverted it** once I understood *why* Next excludes `.env.local` in test mode — forcing it back on would mean my write/delete-heavy integration tests could hit a real, uninspected database, which isn't a call to make unilaterally. **Corrected guidance for the user**: the "add `DATABASE_URL` to `.env.local` and the skipped tests will run for real" statement made in 001/002/003's quickstarts is not accurate as written — to actually run the DB/Stripe-gated tests, create **`.env.test.local`** (or `.env.test`) with test-safe credentials (ideally a separate/disposable test database), or export the vars directly in the shell before `npm test`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)**: no deps.
- **Foundational (P2)**: depends on Setup; BLOCKS US2 and US3. US1 is largely independent (needs
  only the client SDK + publishable key from Setup).
- **US1 (P3)**: independent of Foundational; its `return_url` resolves via the T011 success shell.
- **US2 (P4)**: depends on Foundational (T006 abstraction, T007 reconcile).
- **US3 (P5)**: depends on Foundational (T006, T007); its success page replaces the US1 shell.
- **Polish (P6)**: after the stories it verifies.

### Key task dependencies

- T005 → T004; T006 → T005; T007 → T004
- US1: T009 → T008; T010 → T009
- US2: T015 → T014; T016 → {T015, T007}; T017 → {T006, T016}
- US3: T021 → {T006, T007}; T023 → {T021, T022}

### Shared-file serialization

- `lib/payments/{types,providers/stripe,index}.ts`: T004 → T005 → T006 (sequential spine).
- `features/orders/order-sync.ts`: T007 (reconcile) → T016 (handleWebhookEvent) — sequential.
- `app/checkout/page.tsx`: T010 (single edit). `app/success/page.tsx`: T011 (shell) → T023 (real).
- `lib/db/schema.ts`: T014 (single edit).

---

## Parallel Opportunities

- **Setup**: T002, T003 in parallel (T001 edits `package.json`).
- **Foundational**: T007 in parallel with the T004→T005→T006 spine (different file, needs only T004).
- **US2 tests**: T012, T013 in parallel. **US3 tests**: T018, T019, T020 in parallel.
- **Across stories**: US1 (client UI) can proceed in parallel with Foundational/US2 (different files).

### Parallel Example: US3 tests

```bash
Task: "T018 success scoping unit tests in tests/unit/success-scoping.test.ts"
Task: "T019 confirm route integration tests in tests/integration/checkout.confirm.test.ts"
Task: "T020 gated live Stripe test in tests/integration/payment.stripe-webhook.test.ts"
```

---

## Implementation Strategy

### MVP scope

US1 + US2 are both P1 (payment capture + durable verified truth); US3 (P2) completes
confirmation. Recommended increment:

1. Setup → 2. Foundational → 3. US1 (payment page + success shell) → 4. US2 (webhook truth) →
5. US3 (server-verified success page) → 6. Polish.

US2 is the constitutional heart (server-side, idempotent, signature-verified truth) and should
not be skipped even though US1 is the visible moment.

### Notes

- Write each story's tests first; confirm they fail before implementing.
- Integration tests need a reachable test DB (see quickstart) and mock the provider via the
  factory; the live Stripe test is gated by `STRIPE_SECRET_KEY`. Reuse the 002 `ssr.resolve`
  `react-server` vitest fix so `server-only` modules import cleanly.
- This feature is **additive** — the only schema change is the new `webhook_events` table
  (incremental migration; no 001/002 regeneration).
- Total: **25 tasks** — Setup 3, Foundational 4, US1 4, US2 6, US3 6, Polish 2.
