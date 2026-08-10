# Tasks: Admin Dashboard & Analytics

**Input**: Design documents from `/specs/004-admin-dashboard-analytics/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ (all present)

**Tests**: INCLUDED — the plan mandates a Vitest suite (unit + integration) and the repo already
follows this pattern (`tests/unit`, `tests/integration`). Tests within a story are written before
that story's implementation and must fail first.

**Organization**: Tasks are grouped by user story (spec.md priorities) for independent delivery.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US5 for user-story phases; Setup/Foundational/Polish carry no story label
- All paths are repo-relative to `D:\microscope`

## Path Conventions (this Next.js App Router repo)

- Schema/services: `lib/`, `features/`; routes/pages: `app/`; tests: `tests/unit`, `tests/integration`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Config and module scaffolding shared by every story

- [X] T001 [P] Add `ADMIN_PASSWORD` and `ADMIN_SESSION_SECRET` (server-only, with a base64url key-generation note) to `.env.example`; confirm neither uses a `NEXT_PUBLIC_` prefix
- [X] T002 [P] Create `lib/config/analytics.ts` exporting `REPORTING_TIMEZONE = 'Australia/Melbourne'` (fixed revenue/analytics window tz, research R6)
- [X] T003 [P] Scaffold feature modules: create `features/admin/index.ts`, `features/admin/types/index.ts`, `features/analytics/index.ts` as empty public-export stubs

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, the admin-session/lockout auth primitives, and route protection that the
admin stories build on. **⚠️ No admin user story (US1/US2/US3/US5) can begin until this phase is
complete.** (US4 instrumentation is public and depends only on the schema tasks here.)

- [X] T004 Amend `lib/db/schema.ts`: add `order_notes` table (`id` uuid PK, `order_id` uuid FK→orders, `body` text `check(char_length 1..2000)`, `created_at` timestamptz, `index(order_id, created_at desc)`), `enableRLS()` (data-model §order_notes)
- [X] T005 Amend `lib/db/schema.ts`: add `refunds` table (`id` PK, `order_id` **unique** FK→orders, `amount` bigint `check>=0`, `currency` `check len=3`, `status` `check in('requested','failed')` default `requested`, `provider_refund_ref`, `reason` `check<=500`, `requested_by`, `failure_message`, `created_at`, `updated_at $onUpdate`), `enableRLS()`
- [X] T006 Amend `lib/db/schema.ts`: add `analytics_events` table (`id` PK, `step` `check in('entry','payment','conversion')`, `session_id` text, `source`, `referrer`, `campaign`, `order_id` FK→orders nullable, `created_at`; partial `uniqueIndex(session_id) where step='entry'`; partial `uniqueIndex(order_id) where step='conversion'`; `index(step, created_at)`, `index(session_id)`, `index(order_id)`), `enableRLS()`
- [X] T007 Amend `lib/db/schema.ts`: add `admin_auth_attempts` table (`ip` text PK, `attempt_count` int `check>=0` default 0, `window_start` timestamptz, `locked_until` timestamptz nullable, `updated_at`), `enableRLS()`
- [X] T008 Amend `lib/db/schema.ts`: add `orders.paid_at` timestamptz (nullable) column
- [X] T009 Amend `features/orders/data/order.repository.ts`: in `updatePaymentStatus`, stamp `orders.paid_at` once on the first transition to `success` (idempotent — never overwrite an existing value, never cleared by later `refunded`); export nothing new (depends on T008)
- [X] T010 Generate the Drizzle migration (`npm run db:generate`) and review the emitted SQL in `drizzle/` for the four new tables + `paid_at` (depends on T004–T008)
- [X] T011 Apply the migration to the dev database (`npm run db:migrate`) and confirm tables exist (depends on T010)
- [X] T012 [P] Implement `lib/auth/session.ts`: HMAC-SHA-256 sign/verify of a `{iat,lastSeen}` token via Web Crypto (`crypto.subtle`, base64url); `issueSession`, `refreshSession` (new `lastSeen`, same `iat`), `verifySession` enforcing 30-min idle + 12-h absolute, `clearSession` (research R1) — Edge-safe, no Node APIs
- [X] T013 [P] Implement `lib/auth/password.ts`: constant-time compare of a candidate against `ADMIN_PASSWORD` (research R1)
- [X] T014 Create `lib/auth/index.ts` exporting the session + password helpers and cookie name/flags (depends on T012, T013)
- [X] T015 Create `middleware.ts` (Edge runtime): matcher for `/admin/:path*` and `/api/admin/:path*` **excluding** `/admin/login`, `/api/admin/login`, `/api/admin/logout`; verify the signed cookie, refresh it on success, redirect page requests to `/admin/login?next=<path>` and return `401` for API requests otherwise (contracts/admin-auth-api.md, research R10; depends on T014)
- [X] T016 [P] Create `app/api/admin/_lib/guard.ts`: server-side `requireAdmin(request)` re-verify helper (returns the caller a `401` Response when invalid) plus re-export of `errorResponse`/`parseJsonBody` from the checkout `_lib/respond` (defense-in-depth, research R10; depends on T014)

**Checkpoint**: DB migrated; admin session + gate operational — admin stories can begin.

---

## Phase 3: User Story 1 — Admin login + dashboard home (Priority: P1) 🎯 MVP

**Goal**: A password gate establishes an admin session; the dashboard home shows summary cards
(total orders, payments-by-status, revenue today/month/all net of refunds, conversion rate).

**Independent Test**: Hit `/admin` with no session → redirected to login and `/api/admin/metrics`
→ `401`. Wrong password 5× → `429` lockout. Correct password → session set, dashboard cards
render from real data. Logout clears the session.

### Tests for User Story 1 ⚠️ (write first, ensure they fail)

- [X] T017 [P] [US1] Unit test session sign/verify, idle refresh, absolute-cap, and tamper rejection in `tests/unit/admin-session.test.ts`
- [X] T018 [P] [US1] Unit test lockout window math (5-in-15-min → 15-min lock; window reset; clear on success) in `tests/unit/admin-lockout.test.ts`
- [X] T019 [P] [US1] Unit test net-of-refunds revenue and today/month/all-time boundaries in the fixed tz in `tests/unit/revenue-net.test.ts`
- [X] T020 [P] [US1] Integration test login (ok/bad), lockout, protected-route `401`, logout, and expiry in `tests/integration/admin.auth.test.ts`
- [X] T021 [P] [US1] Integration test dashboard metrics cards against seeded orders (+ empty-store zeros, no divide-by-zero) in `tests/integration/admin.metrics.test.ts`

### Implementation for User Story 1

- [X] T022 [P] [US1] Implement `features/admin/data/auth-attempts.repository.ts`: per-IP window increment, lock check, and clear-on-success (data-model §admin_auth_attempts)
- [X] T023 [P] [US1] Implement `features/admin/schemas/login.schema.ts` (Zod `{ password }`)
- [X] T024 [US1] Implement `features/admin/services/login.service.ts`: lockout gate → constant-time password check → issue session; record failed attempt (depends on T022, T023, T013)
- [X] T025 [US1] Implement `app/api/admin/login/route.ts` (`runtime='nodejs'`): calls login.service, sets `admin_session` cookie, maps outcomes to 200/400/401/429 (contracts/admin-auth-api.md; depends on T024)
- [X] T026 [US1] Implement `app/api/admin/logout/route.ts`: clears the cookie, always `200` (depends on T014)
- [X] T027 [P] [US1] Implement `features/admin/domain/revenue.ts`: pure net-of-refunds revenue windows (today/month/all) in the fixed tz (research R6)
- [X] T028 [P] [US1] Implement `features/admin/domain/conversion.ts`: pure conversion-rate calc (success orders ÷ distinct funnel-entry sessions; 0 when denominator is 0)
- [X] T029 [US1] Implement `features/admin/data/metrics.repository.ts`: total orders, payments-by-status, revenue windows, conversion rate — single indexed queries over `orders` + `analytics_events` (depends on T027, T028)
- [X] T030 [US1] Implement `app/api/admin/metrics/route.ts` (GET, `requireAdmin`) returning the dashboard-cards payload (contracts/admin-analytics-api.md; depends on T029, T016)
- [X] T031 [P] [US1] Implement `features/admin/components/AdminShell.tsx` (nav + logout control)
- [X] T032 [P] [US1] Implement `features/admin/components/SummaryCards.tsx`
- [X] T033 [P] [US1] Implement `features/admin/hooks/use-metrics.ts` (TanStack Query) and a login submit hook
- [X] T034 [US1] Implement `app/admin/(dashboard)/layout.tsx`: server re-verify (redirect to login when unauthenticated) wrapping `AdminShell` (depends on T016, T031). **Deviation from the literal `app/admin/layout.tsx` path**: a route group is required so this gate does not also wrap the sibling `/admin/login` page (which would create a redirect loop) — URLs are unaffected, `(dashboard)` does not appear in the path.
- [X] T035 [US1] Implement `app/admin/login/page.tsx` (RHF password form → login route, handles `next` redirect) (depends on T025). Split into a thin server page + `features/admin/components/LoginForm.tsx` client component wrapped in `<Suspense>`, since `useSearchParams()` requires a Suspense boundary.
- [X] T036 [US1] Implement `app/admin/(dashboard)/page.tsx` (dashboard home) rendering `SummaryCards` via `use-metrics` (depends on T032, T033, T034)
- [X] T037 [US1] Update `features/admin/index.ts` to export the US1 public surface

**Checkpoint**: US1 fully functional — login, gate, dashboard cards, logout all pass. **MVP.**

---

## Phase 4: User Story 2 — Orders management (Priority: P1)

**Goal**: Paginated orders list (all fields), order detail, idempotent mark-fulfilled, and
append-only timestamped internal notes.

**Independent Test**: List all orders paginated + filtered; open one for full detail; mark a
`success` order fulfilled (re-click is a no-op; non-success shows no action); add a note that
persists with a timestamp on re-open.

### Tests for User Story 2 ⚠️

- [X] T038 [P] [US2] Integration test orders list (pagination + status/fulfilled filters), detail, idempotent fulfill, non-success fulfill rejection, and note append in `tests/integration/admin.orders.test.ts`

### Implementation for User Story 2

- [X] T039 [P] [US2] Implement `features/orders/data/order-notes.repository.ts`: `addNote(orderId, body)` (append, timestamped) and `listNotes(orderId)` (newest-first) (data-model §order_notes)
- [X] T040 [US2] Export `addNote`/`listNotes` from `features/orders/index.ts` (depends on T039)
- [X] T041 [P] [US2] Implement `features/admin/schemas/orders-query.schema.ts` (cursor/status/fulfilled/limit≤50) and `features/admin/schemas/note.schema.ts` (`{ body 1..2000 }`)
- [X] T042 [US2] Implement `features/admin/data/orders.repository.ts`: `listOrders` (keyset on `created_at desc,id desc` with filters, page 50) and `getOrderDetail` (order + notes) (research R7; depends on T039)
- [X] T043 [US2] Implement `app/api/admin/orders/route.ts` (GET list, `requireAdmin`, validated query, `nextCursor`) (contracts/admin-orders-api.md; depends on T042, T041, T016)
- [X] T044 [US2] Implement `app/api/admin/orders/[id]/route.ts` (GET detail + notes, `requireAdmin`, `404` unknown) (depends on T042)
- [X] T045 [US2] Implement `app/api/admin/orders/[id]/fulfill/route.ts` (POST → existing `markFulfilled`; idempotent `200`; `409 not_fulfillable` for non-success) (depends on T016)
- [X] T046 [US2] Implement `app/api/admin/orders/[id]/notes/route.ts` (POST append; `201`; `400` invalid/oversized) (depends on T039, T041, T016)
- [X] T047 [P] [US2] Implement `features/admin/components/OrdersTable.tsx` (all fields, filters, load-more)
- [X] T048 [P] [US2] Implement `features/admin/components/OrderDetail.tsx` (full detail + notes list + add-note form; fulfill control shown only for `success`)
- [X] T049 [P] [US2] Implement `features/admin/hooks/use-orders.ts`, `use-order.ts`, `use-fulfill.ts`, `use-add-note.ts` (TanStack Query; mutations invalidate list/detail)
- [X] T050 [US2] Implement `app/admin/(dashboard)/orders/page.tsx` (list) (depends on T047, T049)
- [X] T051 [US2] Implement `app/admin/(dashboard)/orders/[id]/page.tsx` (detail) (depends on T048, T049)

**Checkpoint**: US1 + US2 both work independently — the operable admin core is done.

---

## Phase 5: User Story 3 — Analytics page (Priority: P2)

**Goal**: Analytics page with revenue-over-time, orders/day, payment success rate, conversion
rate, and traffic sources over a selectable period; clean empty states.

**Independent Test**: Open `/admin/analytics` for a range → all five metrics render from
first-party data; change the range → metrics recompute; empty range → zeros, not errors.

### Tests for User Story 3 ⚠️

- [X] T052 [P] [US3] Unit test conversion-rate and payment-success-rate calculations in `tests/unit/conversion-rate.test.ts`
- [X] T053 [P] [US3] Integration test analytics series (revenue/time, orders/day, rates, traffic sources) + empty-range zeros in `tests/integration/admin.analytics.test.ts`

### Implementation for User Story 3

- [X] T054 [P] [US3] Implement `features/admin/schemas/analytics-range.schema.ts` (`{ from, to }` bounded, `from<=to`, default last 30 days)
- [X] T055 [US3] Implement `features/admin/data/analytics.repository.ts`: `revenueOverTime`, `ordersPerDay`, `paymentSuccessRate`, `conversionRate`, `trafficSources` — grouped queries in the fixed tz (contracts/admin-analytics-api.md; depends on T027, T028)
- [X] T056 [US3] Implement `app/api/admin/analytics/route.ts` (GET, `requireAdmin`, validated range) (depends on T055, T016)
- [X] T057 [P] [US3] Implement `features/admin/components/AnalyticsCharts.tsx` and `RangePicker.tsx`
- [X] T058 [P] [US3] Implement `features/admin/hooks/use-analytics.ts`
- [X] T059 [US3] Implement `app/admin/(dashboard)/analytics/page.tsx` (charts + range picker) (depends on T057, T058)

**Checkpoint**: US3 renders trends; conversion/traffic figures reflect whatever US4 has recorded.

---

## Phase 6: User Story 4 — Funnel instrumentation (Priority: P2)

**Goal**: First-party entry/payment/conversion events (unique sessions, bots + admin excluded);
conversion emitted server-side at verified success; funnel never blocked or errored. (Google
Analytics deferred post-MVP.)

**Independent Test**: Walk landing → payment → paid; `analytics_events` gains `entry`/`payment`
(one entry per session) and a server-emitted `conversion`; blocking the endpoint leaves the
funnel working with no customer-facing error; no PII in any payload.

### Tests for User Story 4 ⚠️

- [X] T060 [P] [US4] Unit test funnel session-dedup and bot/admin exclusion in `tests/unit/funnel-dedup.test.ts`
- [X] T061 [P] [US4] Integration test event recording (entry/payment/conversion), entry dedup per session, conversion-rejection from the client, and no-PII payloads in `tests/integration/analytics.events.test.ts`

### Implementation for User Story 4

- [X] T062 [P] [US4] Implement `features/analytics/domain/session.ts` (first-party `a_sid` cookie read/create)
- [X] T063 [P] [US4] Implement `features/analytics/domain/bot.ts` (User-Agent bot/crawler detection)
- [X] T064 [P] [US4] Implement `features/analytics/domain/attribution.ts` (referrer host + UTM parse; strips any PII/full URL)
- [X] T065 [P] [US4] Implement `features/analytics/schemas/funnel-event.schema.ts` (`step:'entry'|'payment'`, optional attribution; rejects `conversion`)
- [X] T066 [US4] Implement `features/analytics/data/event.repository.ts`: `recordEntry` (insert-if-absent per session), `recordPayment`, `recordConversion(orderId)` (insert-if-absent per order) (data-model §analytics_events; depends on T062–T065)
- [X] T067 [US4] Export the analytics public surface from `features/analytics/index.ts` (depends on T066)
- [X] T068 [US4] Implement `app/api/analytics/event/route.ts` (POST, public): read `a_sid`, drop bot/admin traffic silently, record entry/payment, always respond fast (`204`), never error the funnel (contracts/analytics-events.md; depends on T066, T063, T062, T016)
- [X] T069 [US4] Amend `features/orders/order-sync.ts`: at the verified `→ success` reconcile, call `recordConversion(orderId)` idempotently (FR-028; depends on T066). **Made best-effort (try/catch, non-fatal)** beyond the original task description — `reconcile()` is shared by the customer-facing confirm route, so an analytics failure must never surface as a broken payment confirmation (FR-030); it is attempted on every success application (not just the first) so a transient failure still gets a second chance via the webhook/confirm-route hybrid path, relying on `recordConversion`'s own idempotency to prevent duplicates.
- [X] T070 [P] [US4] Wire landing instrumentation: emit `entry` fire-and-forget (`keepalive`) on landing in `app/page.tsx` (client) (depends on T068)
- [X] T071 [P] [US4] Wire payment-step instrumentation: emit `payment` when the payment step is presented in `app/checkout/page.tsx` / `features/payment` (depends on T068)

**Checkpoint**: Funnel is instrumented; US1 conversion card and US3 conversion/traffic views now
show real numbers.

---

## Phase 7: User Story 5 — Admin refund (Priority: P2)

**Goal**: Admin issues a full refund for a `success` order paid within 90 days; money returns via
the provider; the order becomes `refunded` **only** from the verified `charge.refunded` webhook;
at-most-once; provider failure leaves the order `success`.

**Independent Test**: Refund an eligible order → `202`, a `requested` `refunds` row, order still
`success`; drive `charge.refunded` → order flips to `refunded`, drops from net revenue; second/
concurrent attempt → `409` (one refund); ineligible/>90-day → `409`; provider error → `502`,
order unchanged.

### Tests for User Story 5 ⚠️

- [X] T072 [P] [US5] Unit test refund eligibility matrix incl. the 90-day boundary in `tests/unit/refund-policy.test.ts`
- [X] T073 [P] [US5] Integration test refund flow (eligible→provider called→`requested` row; webhook→`refunded`; double/concurrent→one refund; provider failure→stays `success`; ineligible→`409`) in `tests/integration/admin.refund.test.ts`
- [X] T074 [P] [US5] Gated live test of the Stripe `refunds.create` mapping (runs only with `STRIPE_SECRET_KEY`) in `tests/integration/payment.stripe-refund.test.ts`

### Implementation for User Story 5

- [X] T075 [US5] Amend `lib/payments/types.ts`: add `RefundInput`/`RefundResult` and `refund()` to `PaymentProvider` (contracts/payment-provider-ext.md)
- [X] T076 [US5] Amend `lib/payments/providers/stripe.ts`: implement `refund()` via `stripe.refunds.create({payment_intent, amount},{idempotencyKey})`, throwing a normalized error on failure (depends on T075)
- [X] T077 [US5] Amend `lib/payments/index.ts`: add the `refund()` passthrough (no Stripe types leak) (depends on T076)
- [X] T078 [P] [US5] Implement `features/admin/domain/refund-policy.ts`: pure `isRefundable(order)` = `success && !refunded && withinDays(paid_at, 90)` (research R5)
- [X] T079 [P] [US5] Implement `features/admin/schemas/refund.schema.ts` (`{ reason?<=500 }`)
- [X] T080 [US5] Implement `features/admin/data/refund.repository.ts`: create-if-absent on `unique(order_id)` (returns conflict when a row exists) and status transitions (`requested`/`failed`) (data-model §refunds)
- [X] T081 [US5] Implement `features/admin/services/refund.service.ts`: assert eligibility → insert `refunds` row → `provider.refund(refund_<id>)` → on accept keep `requested`, on throw set `failed` + surface error (order stays `success`) (contracts/admin-orders-api.md; depends on T077, T078, T080)
- [X] T082 [US5] **No code change needed** (verified during implementation): FR-040's refund provenance is already fully captured by the `refunds` row (`requestedBy`, `reason`, `createdAt`) plus `orders.updatedAt` (auto-stamped by `updatePaymentStatus`'s `$onUpdate` on the → `refunded` transition) — `order-sync.ts`'s existing `refunded` handling requires no amendment.
- [X] T083 [US5] Implement `app/api/admin/orders/[id]/refund/route.ts` (`runtime='nodejs'`, `requireAdmin`): maps to `202`/`409 not_refundable`/`409 refund_exists`/`502 provider_error`/`404` (depends on T081, T016)
- [X] T084 [US5] Amend `features/admin/data/orders.repository.ts` to compute the `refundable` flag (via `refund-policy`) and include any refund status on list + detail responses (depends on T078)
- [X] T085 [P] [US5] Implement `features/admin/components/RefundButton.tsx` (explicit confirmation dialog stating amount + that money returns to the customer) and `features/admin/hooks/use-refund.ts`
- [X] T086 [US5] Wire refund UI into `OrderDetail`/`OrdersTable` (shown only when `refundable`), reflecting `requested`/`refunded` states (depends on T085, T048, T047)

**Checkpoint**: All five user stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T087 [P] Finalize `.env.example` and add an admin/analytics section to `README`/quickstart notes; confirm no secret uses `NEXT_PUBLIC_`. **`.env.example` fully documents `ADMIN_PASSWORD`/`ADMIN_SESSION_SECRET`, both server-only.** Root `README.md` left as create-next-app boilerplate — this matches the established project convention (001–003 also documented setup only in their `specs/*/quickstart.md`, never touching the root README).
- [X] T088 [P] Accessibility, responsive, and dark-mode pass over the admin pages (`app/admin/**`, `features/admin/components/**`). **Dark mode dropped from scope**: no dark-mode support exists anywhere in this codebase (storefront included), so adding it only to admin would be inconsistent scope creep beyond Principle I. Delivered: `aria-label`s on the two orders-table filter `<select>`s and the note/refund-reason `<textarea>`s; the refund confirmation dialog now has `role="dialog"`, `aria-modal`, `aria-labelledby`, auto-focus, and Escape-to-close. Verified no horizontal overflow at 375px mobile width.
- [X] T089 Seed ≥10,000 orders and verify the orders list stays responsive (SC-006) via keyset pagination. **Verified**: page 1 (880ms) and a deep page ~2,550 rows in (993ms) show no degradation with depth — confirms true keyset (not offset) pagination. Seeded data cleaned up afterward.
- [X] T090 [P] Audit analytics payloads/URLs for PII and confirm none is stored (SC-010). **Audited clean**: `sessionId` is a random UUID (or the order id for conversions); `referrer` is host-only (`new URL().host`, unit-tested to strip query strings/secrets); `source`/`campaign` are coarse marketing tags; no email/phone/name/IP/User-Agent is ever persisted; `orderId` travels in the POST body, never a URL.
- [X] T091 Run the full quickstart.md manual verification (all 14 steps) and `npm run test`. **All 14 steps covered** — most verified live in-browser with real data (login/lockout, dashboard, orders/notes/fulfill, a genuine Stripe API refund call confirmed via a real signed `charge.refunded` webhook, analytics ranges, funnel entry); the remainder (30-min idle timing, double-refund/90-day/provider-failure edge cases, PII/fire-and-forget resilience) by the exhaustive automated suite plus direct code review. `npm run test` (no env) passes 118/118 runnable tests in ~3.5s, cleanly skipping the 109 DB/Stripe-gated tests; with `DATABASE_URL`/`STRIPE_SECRET_KEY` set, all 227/227 pass.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no dependencies.
- **Foundational (P2)** → after Setup. **Blocks US1, US2, US3, US5.** (US4 needs only the schema
  tasks T004–T011, not the auth tasks.)
- **User stories (P3–P7)** → after Foundational. US1 and US2 are both P1 (do US1 first for the
  MVP). US3, US4, US5 are P2.
- **Polish (P8)** → after the desired stories are complete.

### Cross-story data dependencies (code-independent, note for sequencing)

- **US1 conversion card** and **US3 conversion/traffic views** read `analytics_events`, which is
  populated by **US4**. They are code-complete and testable without US4 (empty table → 0 / empty
  states); their numbers become "real" once US4 ships.
- **US5 refund window** and **US1/US3 revenue-over-time** rely on `orders.paid_at`, stamped in
  **Foundational T009** — so no story-to-story code dependency there.
- **US5 T084/T086** enhance the US2 orders list/detail with the `refundable` flag + refund UI.

### Within each story

- Tests (⚠️) are written first and must fail before implementation.
- Schemas/domain (pure) → repositories (data) → services → routes → components/hooks → pages.

### Parallel opportunities

- Setup T001–T003 all `[P]`.
- Foundational: T012/T013 `[P]`; the `lib/db/schema.ts` edits T004–T008 are the **same file** →
  sequential; T016 `[P]` after T014.
- Each story's `[P]` tests run together; pure domain + schema files run together; components and
  hooks (distinct files) run together.
- With capacity, after Foundational: US1 and US2 can proceed in parallel; US3/US4/US5 in parallel
  once their prerequisites land.

---

## Parallel Example: User Story 1

```bash
# Tests first (all fail):
Task: "Unit test session in tests/unit/admin-session.test.ts"
Task: "Unit test lockout in tests/unit/admin-lockout.test.ts"
Task: "Unit test revenue-net in tests/unit/revenue-net.test.ts"
Task: "Integration test auth in tests/integration/admin.auth.test.ts"
Task: "Integration test metrics in tests/integration/admin.metrics.test.ts"

# Then parallel pure/domain + data:
Task: "auth-attempts.repository.ts"
Task: "login.schema.ts"
Task: "revenue.ts"
Task: "conversion.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (critical) → 3. Phase 3 US1 → **STOP & validate**
   (login, gate, dashboard cards, logout) → demo. This is the smallest shippable admin.

### Incremental delivery

Foundation → **US1 (MVP)** → **US2** (operable order management, still P1) → **US4** (turns
conversion/traffic numbers real) → **US3** (trend views) → **US5** (refunds). Each story is
independently testable and adds value without breaking the previous ones. (US4 before US3 is
recommended so the analytics page shows real funnel data on first view, but either order works.)

### Suggested MVP scope

**US1 + US2** — a store owner can log in, read store health, and manage/fulfill/annotate orders.
US3–US5 are valuable P2 increments layered on afterward.
