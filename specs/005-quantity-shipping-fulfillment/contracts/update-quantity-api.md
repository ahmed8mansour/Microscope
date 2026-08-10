# Contract: `POST /api/checkout/update-quantity` (new — server re-price)

Re-prices an **existing unconfirmed** PaymentIntent + its pending order when the customer changes
the quantity stepper on the payment step (FR-002a). Amount is recomputed server-side; the client
never sends an amount. Access is scoped by the intent's **client secret** (no guessable ids).

`runtime = 'nodejs'`.

## Request

```jsonc
{
  "paymentIntentId": "pi_...",
  "clientSecret": "pi_..._secret_...",
  "quantity": 3                      // positive integer, no upper cap
}
```

Schema `features/payment/schemas/reprice.schema.ts`: `paymentIntentId` non-empty, `clientSecret`
non-empty, `quantity` `int().min(1)`.

## Behavior

1. Validate body → 400 `invalid_input`.
2. `snapshot = getPaymentSnapshot(paymentIntentId)`; on provider miss → 404 `not_found`.
3. `isAuthorizedForSnapshot(clientSecret, snapshot.clientSecret)` (003 access-scope) → 403
   `unauthorized` on mismatch. Does not reveal whether the intent exists.
4. **Re-priceable check**: `snapshot.status === 'pending'`. If `success`/`failed`/`refunded` →
   409 `not_repriceable` (a settled intent is never re-priced; the stepper is disabled during
   confirmation, so this is the race backstop).
5. `order = getOrderByPaymentReference(paymentIntentId)`; if none → 404 `not_found`.
6. `repriceOrder(order.id, quantity)` — requires `order.payment_status === 'pending'`
   (`ConflictError` → 409 `not_repriceable`); writes `quantity` + `amount = computeAmount(quantity)`.
7. `updateIntentAmount(paymentIntentId, computeAmount(quantity))` — Stripe
   `paymentIntents.update`. If the adapter throws `NotRepriceableError` (intent moved to a
   non-mutable state between steps 4 and 7) → 409 `not_repriceable`.

Order write precedes intent update so the two amounts converge; 003's amount-mismatch guard flags
any residual drift rather than marking `success`.

## Response

`200`:

```jsonc
{ "quantity": 3, "amount": 26700 }
```

## Errors

| Status | code | When |
|--------|------|------|
| 400 | `invalid_input` | Body fails Zod (bad quantity, missing fields) |
| 403 | `unauthorized` | Client secret does not match the intent |
| 404 | `not_found` | Intent/order not found for the reference |
| 409 | `not_repriceable` | Intent/order no longer pending (confirmed/settled/confirming) |

## Guarantees

- `amount === computeAmount(quantity)` after success; client cannot set the amount (FR-002a).
- A confirmed/succeeded/failed intent is **never** re-priced (FR-002a, US1 scenario 5).
- Idempotent for a repeated identical quantity (re-applying the same amount is a no-op update).
- No re-verification is required (the order/intent already belong to this authorized checkout).
