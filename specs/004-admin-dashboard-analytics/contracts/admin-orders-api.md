# Contract: Admin Orders API

All routes require a valid admin session (else `401`, per admin-auth-api). Amounts are integer
minor units. Runtime `nodejs`.

## GET /api/admin/orders

Query: `?cursor=<opaque>&status=<pending|success|failed|refunded>&fulfilled=<true|false>&limit=<=50`

- `200` →
  ```json
  {
    "orders": [
      { "id": "…", "amount": 12900, "currency": "AUD", "paymentStatus": "success",
        "fulfilled": false, "paidAt": "…|null", "createdAt": "…", "updatedAt": "…",
        "refundable": true }
    ],
    "nextCursor": "…|null"
  }
  ```
- Keyset pagination ordered `created_at desc, id desc` (R7). `refundable` is the server-computed
  eligibility (success && !refunded && paid_at within 90d) so the UI need not re-derive it.
- Invalid query → `400 invalid_request`.

## GET /api/admin/orders/{id}

- `200` → full order (all stored fields) + notes:
  ```json
  { "order": { …, "userId": "…", "stripePaymentIntentId": "…", "refundable": true,
               "refund": { "status": "requested|failed", "createdAt": "…" } | null },
    "notes": [ { "id": "…", "body": "…", "createdAt": "…" } ] }
  ```
- Unknown id → `404 not_found`.

## POST /api/admin/orders/{id}/fulfill

- Marks a `success` order fulfilled (reuses 001 `markFulfilled`, idempotent).
- `200` → updated order. Already fulfilled → `200` (no-op, idempotent, FR-016).
- Order not `success` → `409 not_fulfillable` (FR-015).
- Unknown id → `404`.

## POST /api/admin/orders/{id}/notes

Request: `{ "body": "<1..2000 chars>" }`

- `201` → created note `{ id, body, createdAt }`; appended (FR-017). Allowed for **any** status.
- Invalid/oversized body → `400 invalid_request` (FR-018).
- Unknown id → `404`.

## POST /api/admin/orders/{id}/refund

Request: `{ "reason": "<optional, <=500>" }` — the client must have shown an explicit
confirmation first (FR-034); this endpoint is the confirmed action.

| Condition | Status | Body / Effect |
|-----------|--------|---------------|
| Eligible (success, not refunded, paid_at ≤ 90d, no prior refund) | `202` | inserts `refunds` row, calls provider refund; `{ status: "requested" }`. Order stays `success` until the `charge.refunded` webhook lands (FR-036/FR-037). |
| Not eligible (status ≠ success / already refunded / > 90d) | `409` | `{ error: { code: "not_refundable", message } }` (FR-033) |
| Prior refund already exists (incl. concurrent) | `409` | `{ error: { code: "refund_exists" } }` — unique `order_id` guard (FR-038, SC-012) |
| Provider rejects/fails the refund | `502` | `refunds` row set `failed`; order left `success`; `{ error: { code: "provider_error", message } }` (FR-039, SC-013) |
| Unknown id | `404` | `not_found` |

- Idempotency: unique `refunds.order_id` + Stripe idempotency key `refund_<id>`. A retried
  request after a `requested` refund returns `409 refund_exists` (never a second money movement).
- The order's transition to `refunded`, exclusion from net revenue, and payments-by-status
  update are **observed later** via the webhook path (FR-040) — asserted in integration tests by
  driving a `charge.refunded` event after the `202`.

## Acceptance mapping

FR-012..FR-020 (orders/notes/fulfill), FR-032..FR-041 (refund), SC-004/SC-005/SC-006/SC-011..013.
