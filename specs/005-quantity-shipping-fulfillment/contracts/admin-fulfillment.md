# Contract: Admin fulfillment panel + supplier-ref recording (extends 004)

Adds the copy-ready fulfillment panel to the admin order detail and lets the admin record the
supplier order/tracking references after placing the order manually. No supplier API is called.

## Order-detail payload addition

The existing admin order-detail response (004) gains:

```jsonc
{
  // …existing order fields…
  "quantity": 3,
  "shippingAddress": {                 // null for pre-005 / addressless orders
    "recipientName": "Jane Doe",
    "phone": "+61...",                 // = snapshotted WhatsApp number
    "country": "AU",
    "state": "VIC",
    "city": "Melbourne",
    "line1": "123 Example St",
    "line2": "Unit 4",                 // or null
    "postalCode": "3000"
  },
  "supplierOrderRef": null,
  "supplierTrackingRef": null
}
```

- `shippingAddress` is joined from `shipping_addresses` (1:1). `null` → the panel shows "address
  unavailable" instead of blank fields (FR-016).
- Fields render in **supplier-form order** (D7): recipient name, phone, country, state/province,
  city, line 1, line 2, postal code, then quantity. Per-field **copy** + **copy all**; copied text
  equals the stored normalized values byte-for-byte (SC-005).
- The panel offers placement/recording only when `payment_status ∈ ('success','refunded')`
  (paid); hidden/disabled otherwise (FR-016).

## `PATCH|POST /api/admin/orders/[id]/fulfill` (extended)

Admin-guarded (004 auth). Records supplier references and/or marks fulfilled.

```jsonc
{
  "supplierOrderRef": "ALI-123456789",     // optional
  "supplierTrackingRef": "LP00612345678",  // optional
  "fulfilled": true                         // optional; marks fulfilled
}
```

Schema (Zod): each ref optional, trimmed, length-bounded (≤ 200); `fulfilled` optional boolean.

### Behavior

1. Admin guard (401/403 as in 004).
2. Validate body → 400 `invalid_input`.
3. Persist `supplier_order_ref` / `supplier_tracking_ref` when present (overwritable — editable).
4. If `fulfilled: true` → `markFulfilled(orderId)` (existing 001 rule: permitted only while
   `payment_status ∈ ('success','refunded')`; else 409 `not_fulfillable`).
5. Recording refs **never** changes `payment_status` (fulfillment ≠ payment, FR-014).

### Response

`200` — the updated order-detail payload (including the new fields above).

### Errors

| Status | code | When |
|--------|------|------|
| 400 | `invalid_input` | Body fails Zod |
| 401/403 | `unauthorized` | Admin guard (unchanged 004) |
| 409 | `not_fulfillable` | `fulfilled:true` on a non-paid order |

## Guarantees

- Copy strings equal stored normalized address/quantity values exactly (SC-005).
- No supplier ordering API is invoked at any point (FR-015); placement is a human action.
- Supplier refs and `fulfilled` are independent of `payment_status` (FR-014).
