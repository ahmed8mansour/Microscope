# Internal Contract: Order Repository (Data Access Layer)

This feature exposes no external HTTP API. Its "contract" is the **server-only DAL** that
every later feature (payment, webhook sync, dashboard, orders management) consumes. This
document fixes that interface so downstream specs can depend on it.

**Module**: `features/orders/data/order.repository.ts` — carries `import 'server-only'`.
All methods validate input with Zod before any DB call and throw a typed error on invalid
input (never a raw DB error for validation failures).

## Types (see `features/orders/types/order.types.ts`)

```ts
type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

interface Order {
  id: string;
  email: string | null;
  whatsapp: string | null;
  amount: number;          // integer, minor units
  currency: string;        // ISO-4217, uppercase
  paymentStatus: PaymentStatus;
  fulfilled: boolean;
  stripePaymentIntentId: string | null;
  stripeReceiptUrl: string | null;
  stripeCustomerId: string | null;
  notes: string | null;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
}

interface CreateOrderInput {
  email: string;           // required at creation
  whatsapp: string;        // required at creation
  amount: number;          // integer >= 0
  currency: string;        // 3-char ISO-4217
}
```

## Methods

### `createOrder(input: CreateOrderInput): Promise<Order>`
- Validates `input` (email format, non-empty whatsapp, integer amount ≥ 0, 3-char currency).
- Inserts a new order with `paymentStatus = 'pending'`, `fulfilled = false`.
- **Errors**: `ValidationError` on malformed input (FR-009).
- Satisfies: FR-001, FR-002, US1 scenario 1.

### `getOrderById(id: string): Promise<Order | null>`
- Single indexed lookup by primary key. Returns `null` if absent.
- Satisfies: FR-010, SC-004, US1 scenario 2.

### `getOrderByPaymentReference(ref: string): Promise<Order | null>`
- Single indexed lookup by `stripe_payment_intent_id`.
- Satisfies: FR-010, SC-004.

### `attachPaymentReference(orderId: string, ref: string): Promise<Order>`
- Sets `stripe_payment_intent_id` on an existing order.
- **Idempotent**: re-attaching the same `ref` to the same order is a no-op success.
- **Errors**: `ConflictError` if `ref` already belongs to a *different* order (unique index).
- Satisfies: FR-007.

### `updatePaymentStatus(orderId: string, next: PaymentStatus, meta?: { receiptUrl?: string; customerId?: string; }): Promise<Order>`
- Applies `next` only if the transition is allowed (see data-model transition table).
- Re-applying the current status is an idempotent no-op (safe under duplicate webhooks).
- Optionally records `stripe_receipt_url` / `stripe_customer_id`.
- **Errors**: `InvalidTransitionError` for disallowed transitions.
- Satisfies: FR-004, FR-008, US2 scenarios, US3 scenario 2, SC-002, SC-003.

### `recordRetry(orderId: string, newRef: string): Promise<Order>`
- For a `failed` order: updates it in place to the retry's new payment reference and resets
  status to `pending` — reusing the same row (no new record).
- Satisfies: FR-007a, retry edge case.

### `markFulfilled(orderId: string): Promise<Order>`
- Sets `fulfilled = true` **only if** `paymentStatus = 'success'`.
- **Errors**: `NotFulfillableError` if payment status is not `success`.
- Satisfies: FR-005, FR-006, SC-005, US2 scenario 3.

### `updateNotes(orderId: string, notes: string): Promise<Order>`
- Updates `notes` only; never alters payment or fulfillment state.
- Satisfies: FR-012.

### `anonymizePii(orderId: string): Promise<Order>`
- Nulls/masks `email` and `whatsapp`; leaves amount, currency, status, references, and
  timestamps intact.
- Satisfies: FR-013, SC-007.

## Cross-cutting invariants

- Every method returns fresh `Order` state (or `null` for not-found reads).
- `updatedAt` advances on every mutating call (FR-008).
- No method reads client-supplied trust decisions; the DAL is the authority (FR-001, Principle IV).
- Concurrent creation/attach for the same payment reference yields exactly one owning order
  (partial unique index; the loser gets `ConflictError`).
