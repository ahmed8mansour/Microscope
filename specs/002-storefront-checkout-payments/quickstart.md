# Quickstart: Storefront, Checkout (Contact + OTP) & Payment Abstraction

How to stand up and verify this feature locally. Builds on `001-data-payment-foundation`.

## Prerequisites

- Node.js ≥ 20.9; repo deps installed (`npm install`)
- A Supabase Postgres database (pooler URL) — see 001's quickstart
- A SendGrid account with an API key and a **verified sender identity**
- A Stripe account (test mode) with a secret key

## 1. Install feature dependencies

```bash
npm install stripe @sendgrid/mail @tanstack/react-query react-hook-form
```

## 2. Environment variables (`.env.local`, server-only, no `NEXT_PUBLIC_`)

```bash
# existing (001)
DATABASE_URL="postgresql://…:6543/postgres"

# new (002) — all server-only
SENDGRID_API_KEY="SG.xxxxx"
SENDGRID_FROM_EMAIL="orders@yourdomain.com"   # a SendGrid-verified sender
STRIPE_SECRET_KEY="sk_test_xxxxx"
```

Keep `.env.example` in sync with placeholders for the three new keys (no real values).

## 3. Apply the amended schema

The schema now includes `users` and an amended `orders` (adds `user_id`, drops inline
`email`/`whatsapp`). Regenerate the baseline migration and apply it:

```bash
npm run db:generate   # regenerates drizzle/ from lib/db/schema.ts (users + amended orders)
npm run db:migrate    # applies to DATABASE_URL
```

> Because 001's migration was never applied to a live DB, the baseline is regenerated as a
> single clean migration. If you already applied 001 somewhere, drop that database/schema first.

## 4. Verify the model & endpoints

```bash
npx vitest run
```

Expected coverage maps to the spec:

- **OTP logic** (unit) — code generation, hashing, expiry, attempt cap, cooldown, daily cap.
- **Schemas** (unit) — contact, 6-digit code, create-intent request.
- **Payment factory** (unit) — default resolves to Stripe; a stub adapter registers and is
  selected with no caller changes (SC-007); no provider types leak (SC-006).
- **send-otp** (integration) — valid contact upserts a user + sends (SendGrid mocked); cooldown
  and daily cap return 429; invalid input 400.
- **verify-otp** (integration) — correct code sets `verified`; wrong/expired rejected; attempt
  cap enforced.
- **create-intent** (integration) — rejected 403 unless verified; on success creates a pending
  order linked to the user, creates the intent (provider mocked), attaches the reference, and
  returns a client secret; server-set price is used regardless of any client-sent amount.
- **Stripe adapter** (integration, gated) — runs only when `STRIPE_SECRET_KEY` is set; creates a
  real test-mode PaymentIntent and maps its status.

## 5. Manual smoke check

```bash
npm run dev
```

1. Open the landing page → the primary "Add to cart" CTA now routes to `/checkout`.
2. On `/checkout`, submit email + WhatsApp → a code arrives by email (SendGrid).
3. Enter the code → the UI advances to "continue to payment".
4. Continue → `create-intent` returns a client secret and an order id (the card-entry UI that
   consumes the client secret is the next spec).

Verify the guards: entering a wrong code is rejected; requesting codes rapidly hits the
cooldown; hitting `create-intent` without a verified user returns 403.

## Definition of done

- `users` + amended `orders` migration applies cleanly; `orders.user_id` FK present; contact
  columns gone from `orders`.
- `npx vitest run` green (integration/live-Stripe tests skip cleanly without their env vars).
- The landing CTA reaches `/checkout`; the three route handlers behave per
  `contracts/checkout-api.md`; no provider type is importable outside `lib/payments`.
- 001's order tests updated to the new `createOrder({ userId, … })` shape and passing.
