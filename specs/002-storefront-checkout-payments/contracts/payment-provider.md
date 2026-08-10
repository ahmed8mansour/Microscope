# Contract: Payment Provider Abstraction (`lib/payments`)

The provider-agnostic seam every payment caller uses. Callers import only from
`lib/payments` — never from `stripe` or any provider SDK (SC-006). All modules are
server-only.

## Public API (`lib/payments/index.ts`)

```ts
// Reuses the 001 PaymentStatus vocabulary.
type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded';

interface CreateIntentInput {
  orderId: string;
  amount: number;   // integer minor units, server-set
  currency: string; // ISO-4217 (e.g. 'AUD')
}

interface NormalizedIntent {
  providerRef: string;   // provider payment reference (e.g. Stripe PaymentIntent id)
  clientSecret: string;  // consumed by the later payment-page spec
}

// Uses the configured provider (factory). No provider types cross this boundary.
function createPaymentIntent(input: CreateIntentInput): Promise<NormalizedIntent>;
function verifyPayment(providerRef: string): Promise<PaymentStatus>;
```

## Provider interface (`lib/payments/types.ts`)

```ts
interface PaymentProvider {
  readonly name: string;
  createIntent(input: CreateIntentInput): Promise<NormalizedIntent>;
  verify(providerRef: string): Promise<PaymentStatus>;
}
```

## Factory (`lib/payments/factory.ts`)

```ts
// Registry keyed by provider name; default resolves to 'stripe'.
function registerProvider(provider: PaymentProvider): void;
function getPaymentProvider(name?: string): PaymentProvider;
```

- Adding a provider = implement `PaymentProvider` + `registerProvider(...)`. **No caller
  changes** (FR-012, SC-007). A stub adapter registered in a test proves this.

## Stripe adapter (`lib/payments/providers/stripe.ts`, server-only)

- `name = 'stripe'`.
- `createIntent({ orderId, amount, currency })` → `stripe.paymentIntents.create({ amount,
  currency, metadata: { orderId } })` → `{ providerRef: pi.id, clientSecret: pi.client_secret }`.
- `verify(ref)` → `stripe.paymentIntents.retrieve(ref)` mapped:

  | Stripe status | Normalized |
  |---------------|------------|
  | `succeeded` | `success` |
  | `canceled` | `failed` |
  | `processing`, `requires_payment_method`, `requires_confirmation`, `requires_action`, `requires_capture` | `pending` |
  | retrieved PI's latest charge shows `refunded` | `refunded` |

## Invariants

- No provider-specific type appears in any return value or parameter of the public API
  (verifiable by callers' imports — SC-006).
- `verify` derives status only from the provider (server-side), never from client input (FR-014).
- Provider errors are caught and re-surfaced as a normalized, non-leaking error (FR-013,
  acceptance scenario 4).
- Amounts are integer minor units; the abstraction does not read prices from client input.
