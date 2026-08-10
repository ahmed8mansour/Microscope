# Phase 1 Data Model: Admin Dashboard & Analytics

Extends the 001–003 schema (`lib/db/schema.ts`). All new tables `enableRLS()` with **no
policies** — access is exclusively via the server-only Drizzle client, matching existing tables.
Money stays in integer **minor units** (`bigint`), consistent with `orders.amount`.

---

## Amended entity: `orders`

Add one column; no existing column changes.

| Field | Type | Notes |
|-------|------|-------|
| `paid_at` | `timestamptz` NULL | Set once, when `order-sync` first transitions the order to `success`. Drives the refund 90-day window (R5) and can anchor revenue windows. NULL until first success. |

- **Rule**: `paid_at` is written **only** by `order-sync` on the `→ success` transition, and is
  never cleared (a later `refunded` keeps `paid_at`). Idempotent: re-applying `success` does not
  overwrite an existing `paid_at`.
- **Migration**: `ALTER TABLE orders ADD COLUMN paid_at timestamptz;` (nullable, no backfill
  required for the feature; optional backfill from `webhook_events`/Stripe is out of scope).

---

## New entity: `order_notes` (append-only internal notes)

Backs FR-017/FR-018 and User Story 2. One row per admin note.

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | `uuid` PK | `defaultRandom()` |
| `order_id` | `uuid` NOT NULL | `references(orders.id)` |
| `body` | `text` NOT NULL | `check(char_length(body) between 1 and 2000)` — length-bounded (FR-018) |
| `created_at` | `timestamptz` NOT NULL | `defaultNow()` |

- Indexes: `index(order_id, created_at desc)` — list a single order's notes newest-first.
- **Rules**: Insert-only (no update/delete in this feature). `body` is stored verbatim and
  rendered as **inert text** (escaped) in the UI — never as HTML/markup (FR-018, edge case
  "malicious note content"). Notes may attach to an order of **any** payment status (FR-017).
- **Relationship**: many `order_notes` → one `orders`.
- **Not** the same as `orders.notes` (that column stays owned by `order-sync` for
  amount/currency anomaly flags — R3).

---

## New entity: `refunds` (admin-initiated refund record + at-most-once guard)

Backs User Story 5 and FR-032–FR-041. **Exactly one refund per order** (MVP: full refunds only).

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | `uuid` PK | `defaultRandom()` |
| `order_id` | `uuid` NOT NULL | `references(orders.id)`, **`unique`** → at-most-once (FR-038, SC-012) |
| `amount` | `bigint` NOT NULL | `check(amount >= 0)`; full order amount, minor units |
| `currency` | `text` NOT NULL | `check(char_length = 3)` |
| `status` | `text` NOT NULL | `check in ('requested','failed')` default `'requested'` |
| `provider_refund_ref` | `text` NULL | provider refund id (e.g. Stripe `re_…`) once accepted |
| `reason` | `text` NULL | optional admin-supplied reason, `check(char_length <= 500)` |
| `requested_by` | `text` NOT NULL | admin session marker (single admin — e.g. `'admin'`); provenance (FR-040) |
| `failure_message` | `text` NULL | provider error, when `status = 'failed'` |
| `created_at` | `timestamptz` NOT NULL | `defaultNow()` |
| `updated_at` | `timestamptz` NOT NULL | `defaultNow()` `$onUpdate` |

- **State**: `requested` (provider accepted the refund; awaiting `charge.refunded` webhook to move
  the **order** to `refunded`) → terminal. `failed` (provider rejected; order left `success`,
  FR-039). There is deliberately **no `succeeded`** state on this row — the order's
  `payment_status = 'refunded'` (set by the webhook) is the source of truth that a refund
  completed; this row records the *request* and its provenance.
- **Idempotency**: the `unique(order_id)` insert is the concurrency guard — a second concurrent
  refund attempt hits a unique violation and is rejected without calling the provider. The
  provider call additionally uses Stripe idempotency key `refund_<order_id>` (belt-and-braces).
- **Relationship**: one `refunds` → one `orders`.

### Refund → order status interaction (no new transition)

The refund does **not** itself set `orders.payment_status`. The existing `charge.refunded`
webhook flows through `order-sync.reconcile` → `updatePaymentStatus(order, 'refunded')`, using
001's transition table (`success → refunded` already valid). `order-sync` also stamps the
`refunds` row / order provenance when it applies `refunded` (idempotent).

---

## New entity: `analytics_events` (first-party funnel/conversion store)

Backs User Stories 3 & 4 and FR-021–FR-029. The **sole** source for the dashboard's conversion
and traffic-source figures (first-party only; Google Analytics deferred post-MVP — R8).

| Field | Type | Constraints |
|-------|------|-------------|
| `id` | `uuid` PK | `defaultRandom()` |
| `step` | `text` NOT NULL | `check in ('entry','payment','conversion')` |
| `session_id` | `text` NOT NULL | first-party analytics session id (cookie); dedup key |
| `source` | `text` NULL | normalized traffic source (e.g. `google`, `direct`, `referral`, campaign source) |
| `referrer` | `text` NULL | referrer host only (no full URL/PII) |
| `campaign` | `text` NULL | `utm_campaign` when present |
| `order_id` | `uuid` NULL | `references(orders.id)`; set on `conversion` (and `payment` when known) |
| `created_at` | `timestamptz` NOT NULL | `defaultNow()` |

- Indexes: `index(step, created_at)` (period aggregation), `index(session_id)` (dedup / funnel
  joins), `index(order_id)`.
- **Dedup rule**: at most one countable `entry` per `session_id` (a repeated landing within the
  same session does not add a second entry — enforced by a `uniqueIndex(session_id) where step =
  'entry'` partial index, or an insert-if-absent check). `conversion` is unique per `order_id`
  (partial `uniqueIndex(order_id) where step = 'conversion'`) so the server-emitted conversion is
  idempotent under duplicate webhooks (FR-028).
- **Exclusions (write-time, R9)**: events from known bots (User-Agent) or from a request carrying
  a valid admin session are **not written** as countable entries — keeps the denominator honest.
- **Privacy (FR-031)**: no email, WhatsApp, name, IP, or full URL is ever stored — only coarse
  `source`/`referrer host`/`campaign`. Nothing here is personal or sensitive.
- **Relationship**: optional many `analytics_events` → one `orders` (via `order_id`).

### Derived metrics (computed, not stored)

| Metric | Definition (server-side query) |
|--------|--------------------------------|
| Total orders | `count(*)` over `orders` |
| Payments by status | `count(*) group by payment_status` (pending/success/failed/refunded) |
| Revenue today / month / all | `sum(amount) where payment_status='success'` within tz window (R6) — refunded excluded automatically |
| Conversion rate | `success orders ÷ count(distinct session_id where step='entry')` over period |
| Payment success rate | `success ÷ total payment attempts` over period |
| Orders / day | `count(*) group by day(created_at at tz)` |
| Revenue over time | `sum(amount) where success group by day(paid_at at tz)` |
| Traffic sources | `count(distinct session_id) group by source` over `entry` events |

---

## New entity: `admin_auth_attempts` (brute-force lockout)

Backs FR-005 and the "repeated wrong password" edge case. One row per client IP.

| Field | Type | Constraints |
|-------|------|-------------|
| `ip` | `text` PK | client IP (from `x-forwarded-for`) |
| `attempt_count` | `integer` NOT NULL | `check(attempt_count >= 0)` default `0` |
| `window_start` | `timestamptz` NOT NULL | `defaultNow()`; rolling 15-min window anchor |
| `locked_until` | `timestamptz` NULL | set to `now + 15 min` when count reaches 5 |
| `updated_at` | `timestamptz` NOT NULL | `defaultNow()` `$onUpdate` |

- **Rules** (evaluated server-side in the login route, R2):
  - If `locked_until` is set and `now < locked_until` → **locked**, reject before checking the
    password. Response reveals only "too many attempts", not password closeness (FR-005).
  - On a **failed** attempt: if `now - window_start > 15 min`, reset `window_start = now`,
    `attempt_count = 1`; else increment. When `attempt_count >= 5`, set `locked_until = now +
    15 min`.
  - On a **successful** login: delete the row (clean slate).
- No relationship to other tables. This table holds no PII (IP only, transient).

---

## Entity relationship summary

```text
users (001/002) ──1:N──> orders (001, +paid_at) ──1:N──> order_notes        (new)
                                     │
                                     ├──1:1──> refunds                       (new, unique order_id)
                                     ├──1:N──> webhook_events (003)
                                     └──0:N──< analytics_events (order_id?)  (new)

admin_auth_attempts (new, standalone, keyed by IP)
```

## Zod schema surface (validation, Principle IV)

All external input is Zod-validated before use (merge gate):

- `loginSchema` — `{ password: string (1..256) }`
- `noteSchema` — `{ body: string (1..2000) }`
- `refundSchema` — `{ reason?: string (<=500) }`
- `ordersQuerySchema` — `{ cursor?, status?: PaymentStatus, fulfilled?: boolean, limit? (<=50) }`
- `analyticsRangeSchema` — `{ from: date, to: date }` (bounded, `from <= to`)
- `funnelEventSchema` — `{ step: 'entry'|'payment', sessionId, source?, referrer?, campaign?, orderId? }`
  (note: `conversion` is server-emitted only, never accepted from the client)
