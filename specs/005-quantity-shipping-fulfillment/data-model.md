# Phase 1 Data Model: Quantity, Shipping Address & Semi-Automated Fulfillment

Extends `orders` (001/002/004) with `quantity` + supplier refs, and adds one new PII table
`shipping_addresses`. `amount` semantics are unchanged: it remains the **total** in minor units,
now equal to `unitAmount × quantity`. No change to `webhook_events`, `refunds`, `order_notes`,
`analytics_events`, `users`.

## Entity: Order (extended — `orders`)

New columns only; everything from 001/002/004 is retained.

| Column | Type (DB) | Null? | Default | Rules / Source |
|--------|-----------|-------|---------|----------------|
| `quantity` | `integer` | no | `1` | Units of the single product. `CHECK (quantity >= 1)` — positive integer, **no upper cap** (FR-003). |
| `supplier_order_ref` | `text` | yes | — | Admin-recorded supplier (Alibaba/AliExpress) order id, set at fulfillment (FR-014). |
| `supplier_tracking_ref` | `text` | yes | — | Admin-recorded tracking number (FR-014). |

- `amount` (existing) is now `unitAmount × quantity`, still server-computed in `create-intent` /
  re-price; never client-supplied (FR-002).
- **Invariant preserved**: `orders.amount === unitAmount × orders.quantity` at all times (enforced
  by only ever writing them together in `createOrder`/`repriceOrder`).
- No change to the existing checks, the payment-intent unique index, or the `fulfilled ⇒ paid`
  check. Recording supplier refs does **not** touch `payment_status` (FR-014).

### Drizzle (schema.ts) additions to `orders`

```ts
quantity: integer('quantity').notNull().default(1),
supplierOrderRef: text('supplier_order_ref'),
supplierTrackingRef: text('supplier_tracking_ref'),
// table-level:
check('orders_quantity_check', sql`${t.quantity} >= 1`),
```

## Entity: Shipping Address (new — `shipping_addresses`)

A **per-order snapshot** of the validated, normalized destination (clarify Q1). 1:1 with `orders`.
PII: RLS enabled, no anon policies (server-only), columns nullable so PII can be anonymized later
while the order/financial record survives (same rule as `users.email`/`whatsapp`).

| Field | Type (DB) | Null? | Default | Rules / Source |
|-------|-----------|-------|---------|----------------|
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key. |
| `order_id` | `uuid` | no | — | FK → `orders.id`. **Unique** (`shipping_addresses_order_id_uidx`) — one snapshot per order (1:1). |
| `recipient_name` | `text` | yes¹ | — | Delivery recipient. |
| `phone` | `text` | yes¹ | — | Snapshot of the customer's `users.whatsapp` at purchase (D5). |
| `country` | `text` | yes¹ | — | ISO-3166 **alpha-2**, uppercase. Must be in `SHIPS_TO` (FR-008). `CHECK (char_length(country) = 2)`. |
| `state` | `text` | yes¹ | — | State / province / region. |
| `city` | `text` | yes¹ | — | City / suburb. |
| `line1` | `text` | yes¹ | — | Address line 1. |
| `line2` | `text` | yes | — | Address line 2 (optional even at creation). |
| `postal_code` | `text` | yes¹ | — | Validated against the per-country format (FR-008). |
| `created_at` | `timestamptz` | no | `now()` | Snapshot time (= order creation). |

¹ **Required at creation** via the Zod address schema / repository; the column is nullable only to
permit later PII anonymization (mirrors `orders.email`/`whatsapp` in 001).

- `PRIMARY KEY (id)`, `UNIQUE (order_id)`, `CHECK (char_length(country) = 2)`.
- Index: `shipping_addresses_order_id_uidx` (also serves lookups by order).
- Values stored are the **provider-normalized** address (FR-007), not the raw client input.

### Drizzle (schema.ts) — new table

```ts
export const shippingAddresses = pgTable(
  'shipping_addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('order_id').notNull().references(() => orders.id),
    recipientName: text('recipient_name'),
    phone: text('phone'),
    country: text('country'),
    state: text('state'),
    city: text('city'),
    line1: text('line1'),
    line2: text('line2'),
    postalCode: text('postal_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('shipping_addresses_country_check', sql`${t.country} is null or char_length(${t.country}) = 2`),
    uniqueIndex('shipping_addresses_order_id_uidx').on(t.orderId),
  ]
).enableRLS();
```

## Value objects (no tables)

### Product config — `lib/config/product.ts` (changed)

```ts
export const PRODUCT = {
  unitAmount: 8900, // AUD 89.00, minor units — renamed from `amount`
  currency: 'AUD',
} as const;

export function computeAmount(quantity: number): number {
  return PRODUCT.unitAmount * quantity; // server-authoritative total
}
```

### Address abstraction — `lib/address/types.ts` (new; provider-neutral)

```ts
export interface AddressInput {
  recipientName: string;
  country: string;   // ISO-3166 alpha-2
  state: string;
  city: string;
  line1: string;
  line2?: string;
  postalCode: string;
}

export interface NormalizedAddress extends Required<Omit<AddressInput, 'line2'>> {
  line2: string | null;
}

export interface AddressValidationResult {
  deliverable: boolean;            // provider verdict
  normalized: NormalizedAddress;   // standardized values to store
  verdict: string;                 // raw provider verdict/quality (audit)
}

export interface AddressValidator {
  readonly name: string;
  validate(input: AddressInput): Promise<AddressValidationResult>;
}
```

- `phone` is not part of `AddressInput` — it comes from `users.whatsapp` server-side (D5) and is
  written to the snapshot by the repository, not entered in the form.

### Payment abstraction addition — `lib/payments/types.ts` (changed)

```ts
export interface PaymentProvider {
  // …existing…
  // Re-price an UNCONFIRMED intent to a new server-set amount (FR-002a).
  // Throws a normalized NotRepriceableError if the intent is already
  // confirmed/succeeded/failed — never mutates a settled intent.
  updateIntentAmount(providerRef: string, amount: number): Promise<void>;
}
```

## Repository / service semantics (server-only)

```text
createOrder(userId, quantity):                                   # features/orders
  amount = computeAmount(quantity)                               # server-set total
  insert orders { userId, amount, currency, quantity }           # quantity ≥ 1 (Zod)
  return order

createSnapshot(orderId, normalizedAddress, phone):              # features/shipping
  insert shipping_addresses { orderId, ...normalized, phone }    # 1:1 (unique order_id)

repriceOrder(orderId, quantity):                                 # features/orders
  require order.payment_status == 'pending'                      # else ConflictError
  amount = computeAmount(quantity)
  update orders set quantity, amount where id = orderId          # lockstep with intent

reprice(paymentIntentId, clientSecret, quantity):               # update-quantity route
  snapshot = getPaymentSnapshot(paymentIntentId)                 # 003 seam
  require isAuthorizedForSnapshot(clientSecret, snapshot)        # access scope (SC-008-style)
  require snapshot.status == 'pending'                           # else 409 (not re-priceable)
  order = getOrderByPaymentReference(paymentIntentId)
  repriceOrder(order.id, quantity)                               # order amount first…
  updateIntentAmount(paymentIntentId, computeAmount(quantity))   # …then intent, lockstep
  return { quantity, amount }
```

- **Ordering** (order write before intent update): if the intent update fails, the order is
  pending and its amount is re-derivable/re-settable on the next re-price; 003's amount-mismatch
  guard is the backstop if anything drifts.
- **Amount check unchanged**: because `orders.amount` is kept equal to `unitAmount × quantity`,
  003's `reconcile` (`event.amount === order.amount`) needs no modification (FR-005).

## Admin fulfillment view (extends 004 order detail)

```ts
interface FulfillmentView {         // added to the admin order-detail payload
  quantity: number;
  address: {                        // null when no snapshot (legacy/pre-005 orders)
    recipientName: string; phone: string; country: string; state: string;
    city: string; line1: string; line2: string | null; postalCode: string;
  } | null;
  supplierOrderRef: string | null;
  supplierTrackingRef: string | null;
}
```

- Rendered field-for-field in supplier-form order (D7); copy strings equal the stored normalized
  values byte-for-byte (SC-005). Placement/fulfillment offered only for paid orders (FR-016).

## Migration

One Drizzle migration (`drizzle-kit generate`): `ALTER TABLE orders ADD quantity/… + CHECK`;
`CREATE TABLE shipping_addresses` (+ unique index, check, RLS). Backfill: existing rows get
`quantity = 1` (default) and no address snapshot — the admin panel shows "address unavailable" for
those (FR-016).
