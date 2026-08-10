# Phase 0 Research: Admin Dashboard & Analytics

All spec clarifications were resolved in `/speckit-clarify` (5 answers in spec §Clarifications).
This document records the remaining technical decisions and how they map onto the existing
001–003 codebase. No `NEEDS CLARIFICATION` markers remain.

---

## R1. Admin session mechanism (stateless signed cookie)

- **Decision**: A **stateless, HMAC-signed session cookie** (`admin_session`), payload
  `{ iat, lastSeen }`, signed with `ADMIN_SESSION_SECRET` via Web Crypto (`crypto.subtle`,
  HMAC-SHA-256, base64url). Cookie flags: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
  Expiry is enforced in-token: **idle** = reject if `now - lastSeen > 30 min`; **absolute** =
  reject if `now - iat > 12 h`. Each authenticated request re-issues the cookie with a fresh
  `lastSeen` (idle refresh) but the **same `iat`** (absolute cap unaffected). Logout clears it.
- **Rationale**: No user accounts exist (Principle I), so there is nothing to look up — a
  signed token needs no `sessions` table and no DB round-trip, which keeps the check runnable in
  **Edge middleware** (`crypto.subtle` is available; `crypto` Node module and Drizzle are not).
  HMAC verification is constant-work and tamper-evident (FR-003, edge case "tampered session").
- **Alternatives considered**: (a) DB-backed session table — needs a Node runtime or DB call in
  middleware, more moving parts, no benefit for a single admin. (b) JWT library — unnecessary
  dependency; our payload is two timestamps. (c) Iron-session/next-auth — violates Principle I
  (auth framework for a one-password gate).

## R2. Brute-force lockout store (DB-backed, per-IP)

- **Decision**: A `admin_auth_attempts` table keyed by client IP: `{ ip, window_start,
  attempt_count, locked_until }`. On a failed login: if `now < locked_until` → reject (locked);
  else increment within a rolling 15-min window; when `attempt_count` reaches **5**, set
  `locked_until = now + 15 min` (FR-005). A successful login clears the row. Client IP is read
  from `x-forwarded-for` (Vercel sets it) with a fallback.
- **Rationale**: Serverless functions do not share memory, so an in-memory counter would reset
  per invocation and never lock out — the counter must be durable. A tiny Postgres table is the
  simplest durable option and fits the server-side-trust model. Login is a Node-runtime route
  (needs DB), so this is done there, not in Edge middleware.
- **Alternatives considered**: In-memory / LRU (fails on serverless — rejected). Upstash/Redis
  rate-limiter (new external dependency, overkill for one password — rejected). Middleware-level
  limiting (Edge has no DB access — rejected).

## R3. Internal notes: append-only table vs the existing `orders.notes` column

- **Decision**: Add an **`order_notes`** table (`id, order_id, body, created_at`) for admin
  notes; each note is a row (FR-017 "persisted with a timestamp", visible on re-open). Keep the
  existing single `orders.notes` text column **as-is** for order-sync's amount/currency anomaly
  flags.
- **Rationale**: `order-sync.reconcile` already writes to `orders.notes` via `updateNotes()`
  (overwrite semantics) for anomaly flagging. Admin notes are additive and multi-valued;
  overloading one column would either clobber anomaly flags or force fragile string concat. A
  child table is the clean, queryable model and keeps the two concerns separated (Principle V).
- **Alternatives considered**: JSON array column on `orders` (no per-note timestamp indexing,
  awkward appends — rejected). Reusing `orders.notes` (collides with order-sync — rejected).

## R4. Admin-initiated refund: request here, confirm via webhook

- **Decision**: Extend `PaymentProvider` with `refund(input: RefundInput): Promise<RefundResult>`
  → Stripe `stripe.refunds.create({ payment_intent }, { idempotencyKey })`. The refund
  **service** (`features/admin/services/refund.service.ts`): (1) load order + assert eligibility
  (`success`, not `refunded`, `paid_at` within 90 days, no prior `refunds` row); (2) insert a
  `refunds` row (`unique(order_id)`) in status `requested` — this row is the at-most-once guard;
  (3) call `provider.refund` with idempotency key `refund_<orderId>`; (4) on provider accept,
  keep row `requested`; on provider error, set row `failed`, surface the error, **leave the
  order `success`** (FR-038). The order transitions to `refunded` **only** when the existing
  `charge.refunded` webhook arrives and flows through `order-sync.reconcile` (already maps to
  `refunded`; already idempotent). `order-sync` additionally stamps refund provenance on the
  row when it applies `refunded`.
- **Rationale**: Principle III forbids trusting anything but the provider, server-side, for
  money state. The webhook path already exists and is signature-verified + idempotent (003), so
  reusing it for the confirmation means **zero new money-state code** — the admin action is just
  an authenticated *request*. Two idempotency layers (unique `refunds.order_id` + Stripe
  idempotency key) make double/concurrent clicks safe (FR-038, SC-012).
- **Alternatives considered**: Optimistically set `refunded` on the API response (violates
  III/FR-037 — rejected). Poll `verify()` after refund instead of relying on the webhook (works,
  but duplicates the durable webhook path and races it; the webhook is authoritative — rejected
  as the primary, though `verify()` remains available as the same hybrid safety net 003 uses).

## R5. Refund eligibility window & `paid_at`

- **Decision**: Add an **`orders.paid_at`** timestamp, set when `order-sync` first transitions an
  order to `success`. Eligibility uses `paid_at` (not `created_at`, which is order-creation time
  and can precede payment). The 90-day boundary is evaluated **server-side** in the refund
  service and re-checked in `refund-policy.ts` (pure, unit-tested).
- **Rationale**: "Paid within the last 90 days" must key off payment time. `created_at` predates
  payment (order is created at intent time) and would drift. A dedicated `paid_at` is
  unambiguous and also useful for revenue windows (R6).
- **Alternatives considered**: Derive payment time from the `webhook_events` audit row (indirect,
  extra join, and refund-partial/dispute rows muddy it — rejected). Use Stripe charge time at
  refund attempt (extra API call on every list render for the eligibility badge — rejected).

## R6. Revenue (net of refunds) & fixed reporting timezone

- **Decision**: Revenue = `SUM(amount)` over orders with `payment_status = 'success'`
  **excluding** any that later became `refunded` (a refunded order is no longer `success`, so it
  drops out automatically). "Today"/"this month" boundaries computed in a single fixed timezone
  from `lib/config/analytics.ts` (**`Australia/Melbourne`**, matching the store's locale) applied
  in SQL via `AT TIME ZONE`. All money stays in integer minor units (existing `bigint` amount).
- **Rationale**: The status model already makes net-of-refunds automatic (refunded ≠ success),
  matching 001's reconciliation rule. A single declared tz makes "today" stable and reconcilable
  (spec edge case "Revenue period boundaries"). Melbourne matches the seller (`.env` WhatsApp
  `61…`, AUD).
- **Alternatives considered**: UTC day boundaries (surprising "today" for the operator —
  rejected). Per-request tz from the browser (non-deterministic, untestable — rejected).

## R7. Orders list scale (≥ 10k) — pagination strategy

- **Decision**: **Keyset (cursor) pagination** ordered by `created_at DESC, id DESC` using the
  existing `orders_created_at_idx`, page size 50, with optional filters (`payment_status`,
  `fulfilled`). The list endpoint returns a `nextCursor`.
- **Rationale**: Keyset stays O(page) regardless of table size and rides the existing descending
  index (SC-006, "responsive with ≥ 10,000 orders"). Filters are indexed/bounded.
- **Alternatives considered**: OFFSET pagination (degrades on deep pages — acceptable at this
  scale but keyset is strictly better and cheap here). Loading all orders client-side (fails
  SC-006 — rejected).

## R8. First-party funnel analytics (Google Analytics deferred post-MVP)

- **Decision**: Record funnel events **first-party** in `analytics_events`
  (`step ∈ {entry, payment, conversion}`, `session_id`, `source`, `referrer`, `campaign`,
  `order_id?`, `created_at`). The dashboard/analytics pages read **only** this table (FR-029).
  `entry`/`payment` are posted from the public funnel (a first-party analytics session cookie is
  set on landing); `conversion` is emitted **server-side from `order-sync`** when payment is
  verified `success` (ties conversion to server-verified success, FR-028) — never from the
  client. **Google Analytics is deferred to a later iteration** (MVP scope decision): no `gtag`
  script and no GA env var ship in the MVP. When added later, GA would be a parallel best-effort
  mirror and would **never** be read back by the dashboard — so deferring it changes no metric.
- **Rationale**: The dashboard's numbers must be server-verifiable (Principle IV), so they come
  from the first-party table regardless of GA; GA was only ever a parallel export. For a simple
  MVP the external product adds config + a client script with no effect on any dashboard figure,
  so it is cut now and can be re-added without touching the data model.
- **Alternatives considered**: Ship GA in the MVP (extra config/script for zero dashboard impact
  — deferred per the MVP decision). GA Reporting API as the dashboard's source (sampling/latency/
  ad-block skew, OAuth complexity — rejected, per clarify Q3=A). `@vercel/analytics` (already a
  dep) for funnel counts (not queryable first-party for custom breakdowns — not used here).

## R9. Funnel-entry counting: unique sessions, minus bots & admin (clarify Q4=C)

- **Decision**: The conversion-rate denominator counts **distinct `session_id`** among `entry`
  events, **excluding** (a) requests whose User-Agent matches a known bot/crawler list
  (`analytics/domain/bot.ts`) and (b) any request carrying a valid admin session cookie. Bot and
  admin checks happen at **record time** (excluded events are simply not written as countable
  entries), keeping aggregation a simple `COUNT(DISTINCT session_id)`.
- **Rationale**: Filtering at write time keeps the read path trivial and the denominator honest
  (spec FR-026). A first-party session cookie gives reliable de-duplication of refreshes within a
  session. Excluding admin traffic prevents the operator's own visits from deflating conversion.
- **Alternatives considered**: Filter at read time via UA stored per event (heavier queries,
  stores more UA data than needed — rejected). No filtering (denominator inflated by bots —
  rejected, fails SC-007's manual-equivalence check).

## R10. Route protection: Edge middleware + per-handler re-verify

- **Decision**: `middleware.ts` matches `/admin/:path*` and `/api/admin/:path*` (excluding
  `/admin/login`, `/api/admin/login`, `/api/admin/logout`) and verifies the signed cookie in the
  Edge runtime; unauthenticated **page** requests redirect to `/admin/login?next=<path>`,
  unauthenticated **API** requests get `401`. Each server component (`app/admin/layout.tsx`) and
  each protected Route Handler **re-verifies** before reading data.
- **Rationale**: Middleware is a single choke point (FR-001, SC-001), but middleware alone is not
  a sufficient security boundary in Next.js; re-verifying at the data boundary is defense in
  depth (Principle IV). The stateless cookie makes re-verify essentially free.
- **Alternatives considered**: Middleware-only (single point of failure if a matcher gap appears
  — rejected). Per-route only, no middleware (works but scatters the redirect UX — middleware
  gives one clean gate).

---

## Resolved unknowns summary

| Topic | Decision |
|-------|----------|
| Session | Stateless HMAC cookie; 30-min idle refresh + 12-h absolute (R1) |
| Lockout | DB `admin_auth_attempts`, 5/15-min per IP → 15-min lock (R2) |
| Notes | New append-only `order_notes` table; keep `orders.notes` for anomalies (R3) |
| Refund exec | Provider `refund()`; status set only by `charge.refunded` webhook (R4) |
| Refund window | New `orders.paid_at`; 90-day server-side check (R5) |
| Revenue | Net-of-refunds (refunded ≠ success); fixed `Australia/Melbourne` tz (R6) |
| List scale | Keyset pagination on existing index, page 50 (R7) |
| Analytics source | First-party `analytics_events` only; GA deferred post-MVP (R8) |
| Funnel dedup | Distinct session, exclude bots + admin at write time (R9) |
| Protection | Edge middleware + per-handler re-verify (R10) |

**New environment variables** (all documented in `.env.example`): `ADMIN_PASSWORD` (server-only)
and `ADMIN_SESSION_SECRET` (server-only, HMAC key). No analytics env var in the MVP — Google
Analytics (and its public measurement id) is deferred post-MVP.
