# Contract: `POST /api/checkout/create-intent` (extended for 005)

Extends the 002 contract. The request now carries a **validated shipping address**; the response
adds `quantity`. Quantity defaults to **1** at intent creation (the stepper lives on the payment
step and re-prices later — see `update-quantity-api.md`). Amount stays server-authoritative.

## Request

`Content-Type: application/json`. Schema (`features/checkout/schemas/checkout.schema.ts`,
`.strict()` — any unexpected field, including a client `amount`, is rejected):

```jsonc
{
  "email": "buyer@example.com",
  "shippingAddress": {
    "recipientName": "Jane Doe",
    "country": "AU",              // ISO-3166 alpha-2, must be in SHIPS_TO
    "state": "VIC",
    "city": "Melbourne",
    "line1": "123 Example St",
    "line2": "Unit 4",            // optional
    "postalCode": "3000"
  },
  "quantity": 1                    // optional, default 1; positive integer, no upper cap
}
```

- `email` — must map to a user with a **fresh, unconsumed** verification (unchanged 002/003 gate).
- `shippingAddress` — Zod-validated server-side (required fields, length bounds), then checked
  against the ships-to allow-list + per-country postal format, then **deterministically normalized**
  (Zod-only — no external provider; see `address-validator.md`). The **normalized** address is
  what is stored.
- `quantity` — Zod `int().min(1)`; no maximum. Any client `amount` is rejected by `.strict()`.

## Behavior

1. Validate body (400 `invalid_input` on failure).
2. Resolve + consume fresh verification (403 `not_verified` otherwise) — unchanged.
3. Zod-validate the address (structural); on failure → 400 `invalid_input`.
4. Ships-to allow-list + per-country postal check; if `country ∉ SHIPS_TO` or postal format fails
   → 422 `address_invalid` (no order created).
5. `normalizeAddress(address)` — pure, deterministic (trim / uppercase / clean postal).
6. `createOrder({ userId, amount: unitAmount, currency, quantity: 1 })`.
7. `createSnapshot(order.id, normalizedAddress, user.whatsapp)` — the per-order address snapshot
   (phone = the user's WhatsApp number).
8. `createPaymentIntent({ orderId, amount, currency })`; `attachPaymentReference`.

Steps 6–8 are the existing order/intent path, now parameterized by `quantity` and preceded by the
address snapshot. Amount is never read from the request (FR-002).

## Response

`200`:

```jsonc
{ "clientSecret": "pi_..._secret_...", "orderId": "uuid", "quantity": 1, "amount": 8900 }
```

## Errors

| Status | code | When |
|--------|------|------|
| 400 | `invalid_input` | Body fails Zod (missing/extra field, bad quantity, malformed address) |
| 403 | `not_verified` | No fresh, unconsumed verification for the email |
| 422 | `address_invalid` | Country not shippable or postal format invalid |
| 409 | `conflict` | Payment-reference uniqueness conflict (unchanged) |

## Guarantees

- `amount === computeAmount(quantity)`; client cannot influence it (Principle IV, FR-002).
- Exactly one `shipping_addresses` row per order (1:1); stored values are provider-normalized.
- No order/intent/snapshot is created on any address-validation failure (SC-003/SC-004).
