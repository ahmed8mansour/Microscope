# Phase 1 Data Model: Storefront, Checkout & Payment Abstraction

Amends the `001` schema (adds `users`, relates `orders` to it) and defines the payment
abstraction's normalized shapes. Column names are snake_case in Postgres, camelCase in Drizzle.

## Entity: User (new — `users` table)

A passwordless customer contact record (NOT an authenticated account). Holds verified contact
and the transient OTP verification state.

| Field | Type (DB) | Null? | Default | Rules / Source |
|-------|-----------|-------|---------|----------------|
| `id` | `uuid` | no | `gen_random_uuid()` | Primary key. |
| `email` | `text` | yes¹ | — | Unique (case-insensitive). Required at creation via Zod; nullable so PII can be anonymized (FR-013 of 001, relocated here). |
| `whatsapp` | `text` | yes¹ | — | Required at creation; nullable for anonymization. |
| `verified` | `boolean` | no | `false` | Set true on successful OTP verification (FR-007a). **Per-checkout, not persistent**: reset to false when a new code is issued, and consumed (reset to false) on payment-intent creation (Session 2026-08-04). |
| `verified_at` | `timestamptz` | yes | — | When `verified` was last set true. Payment-intent creation requires this to be within the freshness window (~15 min) and then clears it (Session 2026-08-04). |
| `otp_code_hash` | `text` | yes | — | Salted hash of the current code; never plaintext (FR-006). Cleared after verify. |
| `otp_expires_at` | `timestamptz` | yes | — | Current code expiry (10 min). |
| `otp_attempt_count` | `integer` | no | `0` | Failed verify attempts for the current code; cap 5 (FR-007). |
| `otp_last_sent_at` | `timestamptz` | yes | — | For the 60-s resend cooldown (FR-008). |
| `otp_send_count` | `integer` | no | `0` | Sends within the current daily window (per-email cap). |
| `otp_send_window_start` | `timestamptz` | yes | — | Start of the current daily send window. |
| `created_at` | `timestamptz` | no | `now()` | |
| `updated_at` | `timestamptz` | no | `now()` | Advanced via Drizzle `$onUpdate`. |

¹ Enforced required at creation by Zod/the DAL; nullable only to permit PII anonymization.

### Constraints & indexes

- `PRIMARY KEY (id)`
- **Unique** on lower(`email`): `CREATE UNIQUE INDEX users_email_uidx ON users (lower(email))`
  (FR-004 — one record per email; case-insensitive).
- `CHECK (otp_attempt_count >= 0)`, `CHECK (otp_send_count >= 0)`.
- RLS enabled, no anon policies (server-only access, matching 001).

## Entity: Order (amended from 001)

| Change | Detail |
|--------|--------|
| **Add** `user_id` | `uuid NOT NULL`, `REFERENCES users(id)`. Every order belongs to one user. Index `orders_user_id_idx`. |
| **Remove** `email` | Contact now lives on `users`. |
| **Remove** `whatsapp` | Contact now lives on `users`. |
| Unchanged | `id`, `amount`, `currency`, `payment_status`, `fulfilled`, `stripe_payment_intent_id` (+ partial unique index), `stripe_receipt_url`, `stripe_customer_id`, `notes`, `created_at`, `updated_at`, and all existing CHECK constraints. |

Relationship: **User 1—* Order** (`orders.user_id → users.id`).

## OTP lifecycle (on the user row)

```text
createOrFindUser(email, whatsapp)         → user (verified=false)
issueOtp(user)                            → set otp_code_hash, otp_expires_at,
   guard: cooldown (otp_last_sent_at)          otp_attempt_count=0, bump send counters
   guard: daily cap (otp_send_count)      → send email via SendGrid
issueOtp(user)                            → ALSO resets verified=false, verified_at=null
   (a new checkout invalidates any prior verification — Session 2026-08-04)
verifyOtp(user, code)
   reject if: expired | attempts exhausted | hash mismatch (bump otp_attempt_count)
   accept if: match & unexpired & under cap → verified=true, verified_at=now, clear otp_* fields
consumeFreshVerification(user)            → payment-intent gate: atomically require
   verified=true AND verified_at within freshness window, then reset verified=false
   (single-use authorization for one purchase — Session 2026-08-04)
```

- **Verification is per-checkout, not a standing credential** (reverses the 2026-08-02
  "verified persists" decision). A returning customer re-verifies for each purchase: issuing a
  new code resets any prior verification, a successful verify authorizes at most one payment
  intent within a ~15-minute freshness window, and creating that intent consumes it. There is
  no "already verified → skip OTP" path; a stale or already-used verification cannot authorize
  payment. (See spec Clarifications 2026-08-04.)

## Value objects: Payment abstraction (no new tables)

Normalized types exposed by `lib/payments` — provider-neutral, reusing the 001 `PaymentStatus`.

```ts
type PaymentStatus = 'pending' | 'success' | 'failed' | 'refunded'; // from features/orders

interface CreateIntentInput {
  orderId: string;
  amount: number;   // integer minor units (server-set)
  currency: string; // ISO-4217, e.g. 'AUD'
}

interface NormalizedIntent {
  providerRef: string;    // e.g. Stripe PaymentIntent id
  clientSecret: string;   // consumed later by the payment page (separate spec)
}

interface PaymentProvider {
  readonly name: string;                                   // 'stripe'
  createIntent(input: CreateIntentInput): Promise<NormalizedIntent>;
  verify(providerRef: string): Promise<PaymentStatus>;
}
```

- **Provider status mapping (Stripe → normalized)**: `succeeded → success`;
  `canceled → failed`; `processing | requires_* → pending`; refunded charge → `refunded`.
- `getPaymentProvider(name?)` (factory) returns the registered provider (default `stripe`).
  Adding a provider = implement `PaymentProvider` + register — no caller changes (SC-007).

## Server-set product config (no table)

`lib/config/product.ts` holds the single product's authoritative price and currency
(`amount: 8900`, `currency: 'AUD'`). The client never supplies the amount (FR-015; server-
authoritative price). Payment-intent creation reads price from here, not from the request.

## Cross-entity flow (this feature's boundary)

```text
Landing CTA → /checkout
  ContactForm  → POST /api/checkout/send-otp   → createOrFindUser + issueOtp + SendGrid
  OtpForm      → POST /api/checkout/verify-otp → verifyOtp → users.verified = true
  Continue     → POST /api/checkout/create-intent (verified-only):
                    createOrder({ userId, amount(server), currency(server) })  [001 DAL]
                    lib/payments.createPaymentIntent(order)  → { providerRef, clientSecret }
                    attachPaymentReference(orderId, providerRef)               [001 DAL]
                    return clientSecret  → (payment page consumes it — later spec)
```
