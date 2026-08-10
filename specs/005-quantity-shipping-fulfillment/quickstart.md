# Quickstart: Quantity, Shipping Address & Semi-Automated Fulfillment

How to run and validate feature 005 locally. Builds on the 001–004 setup.

## Prerequisites

- 001–004 running (Supabase Postgres, Stripe test keys, admin password).
- Existing env (`.env.local`): `DATABASE_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, admin secret, SendGrid.
- **New (server-only)**: `ADDRESS_VALIDATION_API_KEY` — a Google Address Validation API key. See
  `.env.example`. No `NEXT_PUBLIC_` variant.

## Migrate

```bash
npx drizzle-kit generate   # emits the orders ALTER + shipping_addresses CREATE
npx drizzle-kit migrate    # or your existing apply step
```

Adds `orders.quantity` (default 1) + `supplier_order_ref` / `supplier_tracking_ref`, and the
`shipping_addresses` table (1:1, RLS). Existing orders backfill to `quantity = 1`, no address.

## Happy path (multi-unit purchase)

1. `npm run dev` → open `/checkout`.
2. Enter email + WhatsApp → receive OTP → verify.
3. **Address step**: enter a real, deliverable address in a `SHIPS_TO` country → it validates and
   normalizes → **Continue to payment** (this calls `create-intent`; order + address snapshot +
   intent created at quantity 1).
4. **Payment step**: the **quantity stepper** sits beside the card. Set it to **3** → the pay
   button total updates to `3 × $89`, and a background `update-quantity` call re-prices the intent
   + order server-side.
5. Pay with Stripe test card `4242 4242 4242 4242` → inline confirm → "Thank you" with amount
   `= 3 × unit`.
6. Verify in DB: `orders.quantity = 3`, `orders.amount = 26700`, one `shipping_addresses` row with
   the **normalized** values and `phone` = the WhatsApp number.

## Validation checks (map to Success Criteria)

- **Server-authoritative amount (SC-001)**: POST `create-intent` with an extra `"amount": 1` →
  400 (`.strict()`). POST `update-quantity` with a forged amount field → 400.
- **Quantity guard (SC-002)**: `update-quantity` with `quantity` of `0`, `-1`, `2.5` → 400; order
  unchanged.
- **Re-price refusal (US1 #5)**: confirm the payment, then POST `update-quantity` again → 409
  `not_repriceable`; amount unchanged.
- **Address realness (SC-003/004)**: submit a nonsense address → 422 `address_undeliverable`, no
  order. Submit a country not in `SHIPS_TO` → 422 `address_invalid`. Simulate the validator
  throwing (unset `ADDRESS_VALIDATION_API_KEY`) → 503 `address_unverified`, no order.
- **Webhook amount check unchanged (SC-006)**: send a signed `succeeded` event whose amount ≠
  `unit × quantity` → order flagged, not `success` (003 behavior, now with quantity).
- **Copy fidelity (SC-005)**: in `/admin`, open the paid order → fulfillment panel → "copy all" →
  paste → equals the stored normalized address + quantity byte-for-byte.

## Admin fulfillment

1. `/admin` → open the paid order.
2. Fulfillment panel shows the address field-for-field (supplier-form order) + quantity, with copy
   controls.
3. Manually place the order on Alibaba/AliExpress (out of app), then record `supplierOrderRef` +
   `supplierTrackingRef` and mark **fulfilled**. Recording refs does not change payment status.

## Tests

```bash
npm run test            # vitest: quantity + reprice math, address Zod/allow-list/postal,
                        # snapshot mapping, copy-string formatting, route integration
```

Provider (`stripe`) and `AddressValidator` are mocked in unit/integration; a gated live Stripe
test exercises `updateIntentAmount` when `STRIPE_SECRET_KEY` is present.
