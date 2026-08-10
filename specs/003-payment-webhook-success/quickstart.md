# Quickstart: Payment Page, Webhook & Order Sync, and Success Page

How to stand up and verify this feature locally. Builds on 001 + 002.

## Prerequisites

- 001 + 002 in place; deps installed (`npm install`)
- Supabase Postgres (pooler URL); a Stripe account (test mode) with: secret key, **publishable
  key**, and a **webhook signing secret**
- The Stripe CLI (`stripe listen`) to forward webhooks locally, or a tunnel to the webhook URL

## 1. Install feature dependencies

```bash
npm install @stripe/stripe-js @stripe/react-stripe-js
```

(`stripe` server SDK is already installed from 002.)

## 2. Environment variables (`.env.local`)

```bash
# existing (001/002): DATABASE_URL, SENDGRID_*, STRIPE_SECRET_KEY …

# NEW — server-only (no NEXT_PUBLIC_):
STRIPE_WEBHOOK_SECRET="whsec_xxxxx"          # from `stripe listen` or the dashboard endpoint

# NEW — the ONLY client-exposed value (publishable key is public by design):
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_xxxxx"
NEXT_PUBLIC_WHATSAPP_SUPPORT="61400000000"   # confirmation support link (public)
```

Keep `.env.example` in sync with placeholders (the two `NEXT_PUBLIC_` values are intentionally
public; `STRIPE_WEBHOOK_SECRET` is a secret).

## 3. Apply the schema change

Adds the `webhook_events` table (no `orders` change):

```bash
npm run db:generate   # emits an incremental migration for webhook_events
npm run db:migrate
```

## 4. Forward webhooks locally (Stripe CLI)

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
# copy the printed whsec_… into STRIPE_WEBHOOK_SECRET
```

## 5. Verify the model & endpoints

```bash
npx vitest run
```

Expected coverage maps to the spec:

- **Webhook mapping** (unit) — event `kind` → target status; `ignored`/`flagged` outcomes.
- **Success scoping** (unit) — client-secret match gates access (no id-guessing).
- **Webhook route** (integration, provider mocked) — signed event marks `success`; **duplicate**
  delivery (≥5×) and concurrent delivery → one effect (SC-002); **forged** signature → 400,
  no change (SC-003); `failed`/`canceled` → `failed`; **amount mismatch** → not success +
  `flagged` (SC-007); full refund → `refunded`; **order-not-visible** → 503 retryable, no row.
- **Confirm route** (integration, provider mocked) — verified → reconciled success view;
  pending state; **client-secret mismatch** → 403; unknown reference → not_found.
- **Live Stripe** (integration, gated by `STRIPE_SECRET_KEY`) — real `getPaymentSnapshot`
  mapping; `parseWebhookEvent` against a CLI-generated signed event.

## 6. Manual smoke check (`npm run dev` + `stripe listen`)

> Confirmation is an in-checkout "confirmed" step (Session 2026-08-04), not a `/success` page.

1. Landing CTA → `/checkout` → verify contact (OTP) → **Continue to payment**.
2. The payment step mounts the card form. Use Stripe test cards:
   - `4242 4242 4242 4242` → approves **inline** → checkout advances to the "Thank you" confirmed
     step. The address bar stays `/checkout` with **no** `payment_intent`/`client_secret` query
     params.
   - `4000 0025 0000 3155` → triggers 3-D Secure → complete the challenge → returns to
     `/checkout` (params read once, then stripped from the URL) → confirmed step.
   - `4000 0000 0000 9995` → declined → clear inline message, order stays unpaid, retry works.
3. Watch `stripe listen` deliver `payment_intent.succeeded`; the order becomes `success` in the
   DB (also confirmed immediately by the in-checkout confirmation's server verification).
4. Re-trigger the same event (`stripe events resend <evt_id>`) → order unchanged (idempotent).
5. Direct-POST `/api/checkout/confirm` with a wrong/absent client secret → 403 / `not_found`
   (no confirmation leaked).

## Definition of done

- `webhook_events` migration applies; event-id PK + `orders` FK present.
- `npx vitest run` green (integration/live tests skip cleanly without their env vars).
- Card confirms via Payment Intents inline (no Checkout Session, no client secret in the URL on
  the common path); declines/3DS handled.
- Webhook verifies signatures, is idempotent, and is the durable order-truth; the in-checkout
  confirmation is server-verified and secret-scoped. No `Stripe.*` type imported outside
  `lib/payments`.
