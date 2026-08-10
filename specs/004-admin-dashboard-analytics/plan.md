# Implementation Plan: Admin Dashboard & Analytics

**Branch**: `004-admin-dashboard-analytics` | **Date**: 2026-08-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-admin-dashboard-analytics/spec.md`

## Summary

Build the internal, staff-facing side of the store on top of the existing order/payment truth
(001) and webhook sync (003). Four slices: (1) a **password gate + admin session** (single
shared password, stateless HMAC-signed cookie with 30-min idle + 12-h absolute expiry, and a
DB-backed per-IP lockout) protecting a **dashboard home** of summary cards; (2) **orders
management** — a paginated list of all orders, a detail view, idempotent *mark-fulfilled*
(reuses 001's `markFulfilled`), and **append-only timestamped internal notes** (a new
`order_notes` table, since the existing single `orders.notes` column is used by order-sync for
anomaly flags); (3) an **analytics page** computing revenue-over-time, orders/day, payment
success rate, conversion rate, and traffic sources from a **first-party `analytics_events`
store**; and (4) **funnel instrumentation** that records entry/payment/conversion events
first-party (deduped to unique sessions, excluding bots and admin traffic). External Google
Analytics export is **deferred post-MVP** — instrumentation is first-party only.

The one money-movement capability — an **admin-initiated full refund** — extends the 002/003
payment abstraction with a `refund()` method (Stripe `refunds.create` with an idempotency key).
Per Principle III, the admin action only *requests* the refund; the order's status becomes
`refunded` solely from the **verified `charge.refunded` webhook** flowing through the existing
`order-sync.reconcile` (which already maps to `refunded`). A new `refunds` table (unique per
order) enforces at-most-once and records provenance. Eligibility: `success`, not already
refunded, within a **90-day** window (new `orders.paid_at` column).

## Technical Context

**Language/Version**: TypeScript 5.x (strict); Node.js ≥ 20.9
**Primary Dependencies**: Next.js 16.2.12 (App Router), React 19.2.4; Drizzle ORM + postgres.js,
`stripe` (server), TanStack Query, React Hook Form, Zod (all existing from 001–003). New: a
small server-only `lib/auth` (Web Crypto HMAC — no new package). No new runtime deps.
(Google Analytics export is deferred post-MVP — no `gtag`/GA env var in the MVP.)
**Storage**: Supabase Postgres via Drizzle. New tables: `order_notes`, `refunds`,
`analytics_events`, `admin_auth_attempts`. `orders` amended with `paid_at`. RLS enabled with no
policies (all access via the server-only Drizzle client), matching 001–003.
**Testing**: Vitest — unit (session token sign/verify + expiry, lockout window math, refund
eligibility, conversion-rate/success-rate aggregation, funnel session-dedup + bot/admin
exclusion) + integration (login lockout, protected-route rejection, fulfill, notes append,
refund request → webhook-confirmed `refunded`, metrics queries, analytics event recording)
against a test DB with the payment provider mocked; a gated live Stripe-adapter test for
`refund()` behind `STRIPE_SECRET_KEY`.
**Target Platform**: Vercel (serverless, Node runtime) + Supabase Cloud
**Project Type**: Web application (Next.js App Router) — adds a protected `app/admin` area
(login + 4 pages), an `app/api/admin/*` route group, one middleware, a new server-only
`features/admin` + `features/analytics` module, and an extension to `lib/payments`.
**Performance Goals**: Orders list responsive with ≥ 10,000 orders via keyset/offset pagination
on the existing `orders_created_at_idx` (SC-006); dashboard/analytics aggregates are single
indexed `GROUP BY` queries; admin session check is a stateless cookie verify (no DB round-trip).
**Constraints**: Admin password + session secret server-only (never `NEXT_PUBLIC_`). Access
control decided server-side (middleware + per-route re-verify); the client never gates itself.
Refund status change is **provider-verified only** (webhook), idempotent (unique `refunds` row
+ Stripe idempotency key). Internal notes are length-bounded and stored/rendered as inert text.
No personal/sensitive data in analytics payloads or URLs. Revenue is **net of refunds**,
computed in a single fixed timezone.
**Scale/Scope**: One product, low volume, single admin, AUD. ~4 admin pages, ~8 route handlers,
4 new tables.

**Runtime note**: `app/api/admin/orders/[id]/refund` runs `runtime = 'nodejs'` (Stripe +
postgres.js). Middleware runs on the Edge runtime; it only verifies the signed session cookie
via Web Crypto (`crypto.subtle` HMAC) — no Node APIs, no DB — so it stays Edge-compatible.
(No `NEXT_PUBLIC_` analytics var in the MVP — Google Analytics export is deferred post-MVP.)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Single-Product Simplicity (YAGNI) | Adds only the mandated admin surface: one shared password (no accounts/roles/usernames — explicitly allowed by IV), fulfillment + notes + refund on the existing single order, and analytics. New tables (`order_notes`, `refunds`, `analytics_events`, `admin_auth_attempts`) each back a stated FR (append-only notes, at-most-once refund + audit, first-party funnel metrics, brute-force lockout) — not speculative. No cart/multi-product/user-accounts. | ✅ Pass |
| II. Conversion-First Experience | Internal-only; does not touch the public funnel UX. Instrumentation is fire-and-forget and MUST NOT add friction or fail the funnel (FR-030) — no conversion cost. | ✅ Pass |
| III. Payment Integrity (NON-NEGOTIABLE) | Refund executed **server-side through the payment abstraction** (`lib/payments` extended with `refund()`); Stripe stays isolated (no Stripe type leaks to routes). Order → `refunded` only from the **signature-verified, idempotent** `charge.refunded` webhook via existing `order-sync`; admin click never sets money state. Unique `refunds` row + Stripe idempotency key = no double refund. | ✅ Pass |
| IV. Server-Side Trust & Security | Every admin route protected server-side (middleware + re-verify); password/session secret server-only; all inputs Zod-validated; lockout resists brute-force; conversion/traffic figures come from the **first-party** store, not the client. Notes stored inert. | ✅ Pass |
| V. Clean, Layered Architecture | New self-contained `features/admin` and `features/analytics` modules (data/domain/components/hooks/schemas/types) with explicit `index.ts` exports; thin Route Handlers delegate to server-only services; payment provider isolation preserved by extension; reuses 001's `markFulfilled`/transition table and 003's `order-sync`. | ✅ Pass |

**Gate result**: PASS. No violations; Complexity Tracking empty.

## Project Structure

### Documentation (this feature)

```text
specs/004-admin-dashboard-analytics/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── admin-auth-api.md         # POST /api/admin/login, /logout; session cookie + lockout
│   ├── admin-orders-api.md       # GET list/detail; POST fulfill, notes, refund
│   ├── admin-analytics-api.md    # GET dashboard metrics + analytics-page series
│   ├── analytics-events.md       # first-party funnel event recording contract
│   └── payment-provider-ext.md   # abstraction addition: refund()
└── checklists/
    └── requirements.md  # from /speckit-specify
```

### Source Code (repository root)

```text
lib/
├── db/
│   └── schema.ts              # AMEND: + order_notes, refunds, analytics_events, admin_auth_attempts;
│                              #        + orders.paid_at (set on success transition)
├── auth/                      # NEW server-only admin auth (no new package; Web Crypto HMAC)
│   ├── session.ts             # sign/verify signed session token; issue (idle+absolute), refresh, clear
│   ├── password.ts            # constant-time compare vs ADMIN_PASSWORD
│   └── index.ts               # public exports (verifyRequestSession, issueSession, …)
├── config/
│   └── analytics.ts           # NEW: fixed reporting timezone (Australia/Melbourne)
└── payments/
    ├── types.ts               # AMEND: + RefundInput/RefundResult; extend PaymentProvider with refund()
    ├── providers/stripe.ts    # AMEND: + refund() (stripe.refunds.create, idempotencyKey)
    └── index.ts               # AMEND: + refund() passthrough (no provider types leak)

features/
├── orders/
│   ├── data/
│   │   └── order-notes.repository.ts   # NEW server-only: addNote (append, timestamped), listNotes
│   ├── data/order.repository.ts        # REUSE: getOrderById, markFulfilled, updatePaymentStatus, paid_at set
│   ├── order-sync.ts                   # AMEND: on success→record paid_at + emit 'conversion' event;
│   │                                   #        on refunded→stamp refund provenance (idempotent)
│   └── index.ts                        # AMEND exports
├── admin/                     # NEW server-facing feature module
│   ├── domain/
│   │   ├── revenue.ts         # net-of-refunds revenue windows (today/month/all) in fixed tz
│   │   └── refund-policy.ts   # pure eligibility: success && !refunded && withinDays(paid_at,90)
│   ├── data/
│   │   ├── metrics.repository.ts   # dashboard cards: counts, payments-by-status, revenue, conversion
│   │   ├── analytics.repository.ts # series: revenue/time, orders/day, success rate, sources
│   │   ├── refund.repository.ts    # create-if-absent refunds row (unique per order), status updates
│   │   └── auth-attempts.repository.ts # per-IP attempt window + lockout
│   ├── services/
│   │   ├── login.service.ts   # verify password + lockout gate → issue session
│   │   └── refund.service.ts  # eligibility → insert refunds row → provider.refund → outcome (order unchanged until webhook)
│   ├── components/            # AdminShell, SummaryCards, OrdersTable, OrderDetail, RefundButton, AnalyticsCharts
│   ├── hooks/                 # useOrders, useOrder, useFulfill, useAddNote, useRefund, useMetrics (TanStack Query)
│   ├── schemas/              # Zod: login, notes, refund, pagination/filter, analytics range
│   ├── types/
│   └── index.ts
└── analytics/                 # NEW instrumentation module
    ├── data/
    │   └── event.repository.ts     # recordEvent (entry/payment/conversion), dedup per (session,step)
    ├── domain/
    │   ├── session.ts              # first-party analytics session id (cookie) helpers
    │   ├── bot.ts                  # user-agent bot/crawler detection
    │   └── attribution.ts          # referrer / UTM parse (no PII)
    └── index.ts
    # (GoogleAnalytics component + gtag deferred post-MVP — first-party only)

app/
├── admin/
│   ├── login/page.tsx         # password gate (public)
│   ├── layout.tsx             # AdminShell; server-verifies session, redirects to login
│   ├── page.tsx               # dashboard home (summary cards)
│   ├── orders/page.tsx        # orders table (paginated, filterable)
│   ├── orders/[id]/page.tsx   # order detail: fulfill, notes, refund
│   └── analytics/page.tsx     # analytics charts + range picker
└── api/
    ├── admin/
    │   ├── login/route.ts             # POST (nodejs): lockout gate + password → Set-Cookie session
    │   ├── logout/route.ts            # POST: clear cookie
    │   ├── orders/route.ts            # GET: paginated/filtered list
    │   └── orders/[id]/
    │       ├── route.ts               # GET: detail + notes
    │       ├── fulfill/route.ts       # POST: markFulfilled (idempotent)
    │       ├── notes/route.ts         # POST: append note
    │       └── refund/route.ts        # POST (nodejs): refund.service
    ├── admin/metrics/route.ts         # GET: dashboard cards
    ├── admin/analytics/route.ts       # GET: analytics series for a range
    └── analytics/event/route.ts       # POST: record funnel entry/payment event (first-party)

middleware.ts                 # NEW (Edge): protect /admin/** and /api/admin/** (except login/logout);
                              #             verify signed session cookie, redirect/401 otherwise

tests/
├── unit/
│   ├── admin-session.test.ts          # sign/verify, idle refresh, absolute cap, tamper reject
│   ├── admin-lockout.test.ts          # 5-in-15min → locked 15min; window reset
│   ├── refund-policy.test.ts          # eligibility matrix incl. 90-day boundary
│   ├── revenue-net.test.ts            # net-of-refunds + tz window boundaries
│   ├── conversion-rate.test.ts        # success ÷ unique funnel entries
│   └── funnel-dedup.test.ts           # session dedup + bot/admin exclusion
└── integration/
    ├── admin.auth.test.ts             # login ok/bad, lockout, protected-route 401, logout, expiry
    ├── admin.orders.test.ts           # list pagination/filter, detail, fulfill idempotent, notes append
    ├── admin.refund.test.ts           # eligible→provider called→refunds row; webhook charge.refunded→order refunded;
    │                                  #   double/concurrent = one refund; provider failure leaves success
    ├── admin.metrics.test.ts          # cards + analytics series vs seeded data
    ├── analytics.events.test.ts       # entry/payment/conversion recording, session dedup, no PII
    └── payment.stripe-refund.test.ts  # gated live: refunds.create mapping (STRIPE_SECRET_KEY)
```

**Structure Decision**: Web application (Next.js App Router). Two new self-contained feature
modules (`features/admin`, `features/analytics`) with explicit public exports; thin Route
Handlers under an `app/api/admin` group delegate to server-only services. Access control is
enforced twice: an Edge `middleware.ts` gates `/admin` and `/api/admin` by verifying the signed
session cookie, and each server component/route re-verifies before touching data (defense in
depth, Principle IV). Payment-provider specifics stay inside `lib/payments` (extended with one
`refund()` method); the refund's money-state change is delegated entirely to the existing
signature-verified webhook + `order-sync` path so Principle III is preserved unchanged. Notes
move to an append-only `order_notes` table because the existing `orders.notes` column is already
owned by order-sync's anomaly flagging.

## Complexity Tracking

> No constitution violations — no entries required.
