# Contract: Funnel Analytics Events (first-party)

First-party recording of funnel steps; the dashboard reads only this store (R8). External Google
Analytics export is deferred post-MVP. No PII (FR-031).

## First-party analytics session

- A first-party cookie `a_sid` (opaque random id, `SameSite=Lax`, ~30-day) is set on first
  landing if absent. Used only to de-duplicate funnel entries into unique sessions (R9). Not
  linked to customer identity.

## POST /api/analytics/event  (public, funnel entry/payment)

Request: `{ "step": "entry" | "payment", "source"?, "referrer"?, "campaign"?, "orderId"? }`
(`sessionId` is taken from the `a_sid` cookie server-side, not the body.)

| Condition | Effect |
|-----------|--------|
| Known bot User-Agent, OR request carries a valid admin session | Silently **not** recorded as a countable event → `204` (keeps denominator honest, R9) |
| `step:"entry"` and this session already has an entry | Insert-if-absent no-op (partial unique on `session_id where step='entry'`) → `204` |
| Valid `entry`/`payment` | Insert `analytics_events` row → `204` |
| `step:"conversion"` supplied | **Rejected** `400` — conversion is server-emitted only |
| Invalid body | `400 invalid_request` |

- **Must never block or error the funnel** (FR-030): the client calls this fire-and-forget
  (`keepalive`), ignores failures; a `5xx`/timeout/unavailable analytics path produces **no**
  customer-facing error. Endpoint returns fast (`204`, no body).
- Stores only coarse attribution: `referrer` = host only; no full URL, email, WhatsApp, name, or
  IP (FR-031).

## Server-emitted `conversion` (not an HTTP endpoint)

- Emitted inside `order-sync` at the verified `→ success` transition (FR-028) via
  `analytics/event.repository.recordConversion(orderId, sessionId?)`. Idempotent: partial unique
  on `order_id where step='conversion'` — duplicate webhooks emit once (SC-008).
- Ties every conversion to **server-verified** payment success; a client can never fabricate one.

## Google Analytics — deferred (post-MVP)

- The MVP ships **first-party only**. External Google Analytics export (a `gtag` script + public
  measurement id) is deferred to a later iteration. When added, it would `gtag('event', …)`
  best-effort in parallel and would **never** be queried by the dashboard — so adding it later
  changes no metric and needs no data-model change.

## Acceptance mapping

FR-026 (entry, unique-session, bot/admin exclusion), FR-027 (payment), FR-028 (server-verified
conversion), FR-029 (first-party store is the dashboard's sole source), FR-030 (non-blocking/
silent-fail), FR-031 (no PII). SC-008 (≥95% conversions recorded), SC-009 (no funnel
regression), SC-010 (no PII in payloads).
