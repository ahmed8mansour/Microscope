# Contract: Admin Metrics & Analytics API

Require a valid admin session (`401` otherwise). Read-only aggregates over `orders` +
`analytics_events`. All money in minor units; time windows in the fixed reporting timezone
(`Australia/Melbourne`, R6). Runtime `nodejs`.

## GET /api/admin/metrics  (dashboard home cards)

- `200` →
  ```json
  {
    "totalOrders": 128,
    "paymentsByStatus": { "pending": 4, "success": 110, "failed": 9, "refunded": 5 },
    "revenue": { "today": 25800, "month": 412900, "allTime": 1420000, "currency": "AUD" },
    "conversionRate": 0.031
  }
  ```
- `revenue.*` counts `success` orders only (refunded excluded automatically), net of refunds
  (FR-009). `conversionRate` = success orders ÷ distinct funnel-entry sessions (FR-010). Empty
  store → all zeros, `conversionRate: 0` (no divide-by-zero — edge case).

## GET /api/admin/analytics  (analytics page series)

Query: `?from=<ISO date>&to=<ISO date>` (bounded, `from ≤ to`; default last 30 days).

- `200` →
  ```json
  {
    "range": { "from": "…", "to": "…", "timezone": "Australia/Melbourne" },
    "revenueOverTime": [ { "date": "2026-08-01", "amount": 12900 } ],
    "ordersPerDay":    [ { "date": "2026-08-01", "count": 3 } ],
    "paymentSuccessRate": 0.92,
    "conversionRate": 0.031,
    "trafficSources":  [ { "source": "google", "entries": 210, "share": 0.48 } ]
  }
  ```
- `paymentSuccessRate` = success ÷ total payment attempts in range (FR-023). `trafficSources`
  groups distinct funnel-entry sessions by `source` (FR-025). Period with no activity → empty
  arrays and `0` rates, not an error (FR-024).
- Invalid/unbounded range → `400 invalid_request`.

## Acceptance mapping

FR-007..FR-011 (dashboard cards), FR-021..FR-025 (analytics page), SC-002/SC-003/SC-007.
