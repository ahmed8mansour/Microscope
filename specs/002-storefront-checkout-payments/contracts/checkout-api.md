# Contract: Checkout API (Route Handlers)

Three `POST` Route Handlers under `app/api/checkout/*` (Node runtime). All accept/return JSON,
validate the body with Zod before use, and never trust client-reported verification or price.
Errors return a normalized `{ error: { code, message } }` with an appropriate HTTP status.

## `POST /api/checkout/send-otp`

Create or reuse the user for an email, issue a code, and email it via SendGrid.

**Request**
```json
{ "email": "buyer@example.com", "whatsapp": "+61400000000" }
```

**Behavior**
- Zod-validate email + non-empty WhatsApp (FR-004, FR-018).
- `createOrFindUser(email, whatsapp)` — reuse existing record for the email; else create with
  `verified = false`.
- Enforce resend cooldown (60 s) and per-email daily cap (FR-008); if blocked → `429`.
- Generate a 6-digit code, store its hash + 10-min expiry, reset attempt count, bump send
  counters (FR-006).
- Send via SendGrid; if the send is not accepted → `502`, no verified state granted (FR-005).

**Responses**
- `200 { "ok": true }` — code sent (response never contains the code).
- `400 { error }` — invalid input.
- `429 { error }` — cooldown or daily cap hit.
- `502 { error }` — email provider failed; safe to retry.

## `POST /api/checkout/verify-otp`

Verify a submitted code and, on success, mark the user verified.

**Request**
```json
{ "email": "buyer@example.com", "code": "123456" }
```

**Behavior**
- Zod-validate email + 6-digit code.
- Load the user; reject if no active code, expired, or attempt cap exceeded (FR-007).
- Compare the submitted code's hash; on mismatch increment `otp_attempt_count` and reject.
- On match+unexpired+under cap → set `verified = true`, stamp `verified_at = now`, clear OTP
  fields (FR-007a). (`issueOtp` first reset `verified = false` when this code was sent, so a
  returning customer always verifies afresh — Session 2026-08-04.)

**Responses**
- `200 { "verified": true }`
- `400 { error }` — invalid input.
- `401 { error }` — wrong code (with attempts remaining) / expired.
- `429 { error }` — attempt cap exceeded; request a new code.

## `POST /api/checkout/create-intent`

Fresh-verification-only. Create the order (server-set price) and a provider payment intent;
return the client secret the payment surface confirms with.

**Request**
```json
{ "email": "buyer@example.com" }
```

**Behavior**
- Zod-validate email; load the user; **atomically require a fresh verification and consume it**
  — `consumeFreshVerification` succeeds only if `verified = true` AND `verified_at` is within
  the ~15-minute window, and resets `verified = false` in the same statement (single-use,
  race-safe). Reject with `403` otherwise (FR-009, server-side check — never a client flag;
  Session 2026-08-04).
- Read the authoritative amount + currency from `lib/config/product.ts` (never the request;
  FR-015, server-authoritative price).
- `createOrder({ userId, amount, currency })` via the 001 DAL (pending).
- `createPaymentIntent({ orderId, amount, currency })` via `lib/payments` (provider-agnostic).
- `attachPaymentReference(orderId, providerRef)` via the 001 DAL (idempotent; conflict → `409`).

**Responses**
- `200 { "clientSecret": "…", "orderId": "…" }`
- `400 { error }` — invalid input.
- `403 { error }` — no fresh verification to consume (never verified this checkout, stale, or
  already used).
- `409 { error }` — payment reference conflict (concurrent/duplicate).
- `502 { error }` — payment provider unavailable; not charged, safe to retry.

## Cross-cutting

- Secrets (`SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `STRIPE_SECRET_KEY`) read server-side only.
- No endpoint returns the OTP code or any provider-specific object; only normalized fields.
- All three run on `runtime = 'nodejs'` (Node SDKs + postgres.js).
