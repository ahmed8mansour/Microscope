# Quickstart: Admin Dashboard & Analytics

How to configure, run, and manually verify feature 004 locally. Assumes 001–003 are working
(orders, checkout, payment, webhook).

## 1. Environment

Add to `.env.local` (all documented in `.env.example`):

```bash
# Admin area — single shared password (server-only; NEVER NEXT_PUBLIC_)
ADMIN_PASSWORD="choose-a-strong-passphrase"
# HMAC key that signs the admin session cookie (server-only). Generate 32+ random bytes:
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
ADMIN_SESSION_SECRET="<random-32-byte-base64url>"
```

> Analytics is **first-party only** in the MVP — no analytics env var is needed. External Google
> Analytics export is deferred to a later iteration.

## 2. Migrate the database

```bash
npm run db:generate
npm run db:migrate
```

Creates `order_notes`, `refunds`, `analytics_events`, `admin_auth_attempts` and adds
`orders.paid_at`.

## 3. Run

```bash
npm run dev
```

- Public store: http://localhost:3000
- Admin: http://localhost:3000/admin → redirects to `/admin/login`.

## 4. Manual verification

### Auth (US1)
1. Visit `/admin` with no session → redirected to `/admin/login`. Hit `/api/admin/metrics`
   directly → `401`. (SC-001)
2. Log in with the wrong password 5× → 6th attempt returns `429 locked` for 15 min. (FR-005)
3. Log in with the correct password → dashboard home renders summary cards. (US1)
4. Leave idle > 30 min → next action redirects to login; or clear cookie via **Logout**. (FR-004)

### Dashboard home (US1)
5. Cards show total orders, payments-by-status, revenue today/month/all (net of refunds), and
   conversion rate — matching the DB. (FR-007..FR-011, SC-002/003)

### Orders management (US2)
6. `/admin/orders` lists all orders with every field, paginated (page 50). Filter by status /
   fulfilled. (FR-012/FR-019, SC-006)
7. Open an order → full detail. Mark a `success` order **fulfilled** → persists; re-click is a
   no-op. A non-success order shows no fulfill action. (FR-014/FR-015/FR-016)
8. Add an internal note → appears with a timestamp on re-open; works on a failed/refunded order
   too. Oversized/HTML body is bounded and rendered inert. (FR-017/FR-018)

### Refund (US5)
9. On a `success` order paid within 90 days, click **Refund** → confirmation dialog states the
   amount and that money returns to the customer. Confirm → `202`, a `refunds` row appears
   (`requested`); the order is **still `success`**. (FR-034..FR-037)
10. Trigger the `charge.refunded` webhook (via `stripe listen` / `stripe trigger charge.refunded`
    against the test order, or the seeded test event) → order flips to `refunded`, drops out of
    net revenue, payments-by-status updates. (FR-040)
11. Click Refund twice quickly / on an already-refunded or >90-day order → `409` (no second
    money movement). Simulate a provider error → `502`, order stays `success`. (FR-038/FR-039,
    SC-012/013)

### Analytics + instrumentation (US3/US4)
12. Browse the public funnel (landing → payment) → `analytics_events` gains `entry`/`payment`
    rows (unique per session; a refresh does not add a second `entry`). A completed payment adds
    a server-emitted `conversion`. (FR-026/FR-027/FR-028)
13. `/admin/analytics` shows revenue-over-time, orders/day, success rate, conversion rate, and
    traffic sources for the chosen range; an empty range shows zeros, not errors.
    (FR-021..FR-025, SC-007)
14. Make the first-party analytics endpoint fail (e.g. block `/api/analytics/event` in devtools)
    → the funnel still completes with no customer-facing error (fire-and-forget). No PII appears
    in any analytics payload. (FR-030/FR-031, SC-009/SC-010)

## 5. Tests

```bash
npm run test
```

Unit: session token expiry, lockout math, refund eligibility (incl. 90-day boundary),
net-of-refunds revenue + tz windows, conversion-rate, funnel session-dedup + bot/admin
exclusion. Integration: login/lockout/protected-routes, orders list/detail/fulfill/notes,
refund request → webhook-confirmed `refunded` (+ double/failure), metrics vs seeded data,
analytics event recording. The live Stripe `refunds.create` mapping test runs only when
`STRIPE_SECRET_KEY` is set.
