# Production Guide — Microscope Store

Everything you need to take this site live and run it safely: servers, Stripe,
email, database, security, and the legal/policy pages you must add before selling.

> **Not legal advice.** The privacy / terms / refund sections below are practical
> guidance and a starting template. Because you are selling physical goods to
> consumers (in AU + NZ/US/GB/CA), have the final wording reviewed by someone
> qualified before you publish it. See [§8 Legal & Compliance](#8-legal--compliance).

---

## 0. What this system is (quick map)

| Thing | Value |
|---|---|
| Framework | Next.js 16.2 (App Router) + React 19 + TypeScript + Tailwind 4 |
| Hosting target | Vercel (per README) |
| Database | Supabase PostgreSQL via Drizzle ORM (postgres.js, transaction pooler :6543) |
| Payments | Stripe (Payment Intents + webhooks) |
| Email | SendGrid (checkout OTP code only) |
| Address check | Zod schema + ships-to / postal-format rules (`features/shipping`, `lib/config/shipping.ts`) — no external API |
| Product | **Single product**, AUD **$59.00** (`lib/config/product.ts`) |
| Fulfillment | Manual dropship — admin records supplier (Alibaba/AliExpress) order + tracking |
| Admin | One shared password + HMAC session cookie (no user accounts) |
| Reporting timezone | `Australia/Melbourne` (`lib/config/analytics.ts`) |
| Ships to | AU, NZ, US, GB, CA (`lib/config/shipping.ts`) |

Public pages today: `/` (landing) and `/checkout`. Admin at `/admin`.
**There are no `/privacy`, `/terms`, or `/refund-policy` pages yet — you must add them (see §8).**

---

## 1. Environment variables (the master list)

All secrets live only in `.env.local` locally and in your host's env settings in
production. Never commit real values. Only `NEXT_PUBLIC_*` vars reach the browser.

| Variable | Public? | Purpose | Production note |
|---|---|---|---|
| `DATABASE_URL` | server-only | Supabase Postgres (transaction pooler, port **6543**) | Use the **pooler** string, not the direct :5432 one, for serverless |
| `STRIPE_SECRET_KEY` | server-only | Stripe API key | Switch `sk_test_…` → **`sk_live_…`** |
| `STRIPE_WEBHOOK_SECRET` | server-only | Verifies Stripe webhook signatures | Use the **live** endpoint's `whsec_…` (different from the CLI one) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **public (by design)** | Browser Stripe.js/Elements | Switch `pk_test_…` → **`pk_live_…`** |
| `SENDGRID_API_KEY` | server-only | Sends the OTP email | Restrict the key to "Mail Send" only |
| `SENDGRID_FROM_EMAIL` | server-only | OTP "from" address | Must be a **verified sender / authenticated domain** |
| `NEXT_PUBLIC_WHATSAPP_SUPPORT` | public | Support number on success page | Real support number, digits e.g. `61400000000` |
| `ADMIN_PASSWORD` | server-only | Admin login | Strong passphrase, unique to prod |
| `ADMIN_SESSION_SECRET` | server-only | Signs the admin session cookie | Generate 32+ random bytes (below) |

Generate the admin session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Rule:** any DB / payment / email / API credential must **never** get a
`NEXT_PUBLIC_` prefix — that prefix inlines the value into the browser bundle and
leaks it to every visitor. The only intentionally-public secret is the Stripe
**publishable** key.

---

## 2. Third-party accounts — production setup

### 2.1 Supabase (database)
1. Create (or promote) a production Supabase project — keep it separate from any test project.
2. Copy the **Transaction pooler** connection string (port `6543`) into `DATABASE_URL`.
   The client is created with `{ prepare: false }` because the pooler doesn't support prepared statements — don't change that.
3. Run migrations against it (see §4).
4. Row-Level Security is enabled on every table with **no policies** — all access goes through the server-only Drizzle client. Do not add an anon/public policy; it would expose customer PII.
5. Turn on Point-in-Time Recovery / daily backups for the production DB.

### 2.2 Stripe (payments) — see full go-live in §5
- Activate the Stripe account (business details, bank account for payouts).
- Toggle the dashboard to **Live mode** and use live keys.
- Create the **live** webhook endpoint and copy its signing secret.

### 2.3 SendGrid (email)
1. **Authenticate your domain** (SPF + DKIM DNS records) — do not rely on single-sender verification for production; unauthenticated mail lands in spam.
2. `SENDGRID_FROM_EMAIL` must match a verified identity on the authenticated domain (e.g. `orders@yourdomain.com`).
3. Create an API key scoped to **Mail Send only**.
4. Send yourself a test OTP end-to-end after DNS propagates.

> The email only carries a 6-digit login code (10-min expiry). "Success" is
> measured as *accepted by SendGrid*, not inbox delivery — so deliverability
> (domain auth) is on you.

### 2.4 Address validation (no external service)
Shipping addresses are validated **in-app** — no third-party API, no key, nothing
to provision. A Zod schema (`features/shipping/schemas/address.schema.ts`) enforces
the structural floor, and the route checks the ships-to allow-list + per-country
postal format (`lib/config/shipping.ts`). To change which countries you ship to or
tighten postal rules, edit `lib/config/shipping.ts` — that's a config/business
decision, not a code change.

### 2.5 Vercel (hosting)
- Import the repo, framework auto-detected as Next.js.
- Add every variable from §1 under **Production** environment.
- Set a custom domain + HTTPS.

---

## 3. Deployment (Vercel)

1. Push to the branch Vercel builds (usually `main`).
2. In Vercel → Project → Settings → **Environment Variables**, add all of §1 for the **Production** scope (and Preview if you want test-mode previews).
3. Deploy. Build command `next build`, output is the default Next.js target.
4. Add your **custom domain** and confirm the certificate is issued.
5. Point Stripe's live webhook at `https://yourdomain.com/api/webhooks/stripe` (§5).
6. Smoke-test the full flow on the live domain (§9 checklist).

Notes:
- `next.config.ts` is currently empty (no custom headers/redirects). Consider adding security headers (§7) and any redirects (e.g. `www` → apex).
- The webhook route is `runtime = 'nodejs'` and reads the **raw** body for signature verification — don't put anything in front of it that rewrites the body.
- `proxy.ts` (renamed middleware in Next 16) gates `/admin` and `/api/admin` on the Edge runtime.

---

## 4. Database & migrations

Schema lives in `lib/db/schema.ts`; SQL migrations are in `drizzle/`.

```bash
# generate SQL from schema changes
npx drizzle-kit generate
# apply pending migrations to whatever DATABASE_URL points at
npx drizzle-kit migrate
```

Production procedure:
1. Point `DATABASE_URL` at the **production** Supabase DB.
2. Run `npx drizzle-kit migrate` once before the first real traffic (creates all tables, CHECK constraints, indexes, and enables RLS).
3. Re-run after any schema change ships.

Tables you now have: `users` (passwordless contact + OTP state), `orders`,
`shipping_addresses` (PII, 1:1 with order), `webhook_events` (idempotency +
audit), `order_notes`, `refunds`, `analytics_events`, `admin_auth_attempts`.

Utility scripts in `scripts/`:
- `reset-db-data.mjs` — **destructive**; wipes data. Never run against production.
- `backfill-order-paid-at.mjs` — one-off backfill helper.

Back up before running any migration or script against production.

---

## 5. Stripe go-live checklist

This is the highest-risk switch. Do it deliberately.

- [ ] **Activate** the Stripe account (identity, business, bank/payout details).
- [ ] Switch dashboard to **Live mode**.
- [ ] Replace all three keys: `sk_live_…`, `pk_live_…`, and a fresh **live** `whsec_…`.
- [ ] Create the live **webhook endpoint** → `https://yourdomain.com/api/webhooks/stripe`.
- [ ] Subscribe the endpoint to at least these events (the code handles them):
  - `payment_intent.succeeded`
  - `payment_intent.payment_failed`
  - `payment_intent.canceled`
  - `charge.refunded`
  - `charge.dispute.created`
- [ ] Copy that endpoint's signing secret into `STRIPE_WEBHOOK_SECRET` (prod). It is **different** from the `stripe listen` CLI secret used in dev.
- [ ] Set your **statement descriptor** in Stripe (what shows on the customer's card statement).
- [ ] Confirm currency: the app charges in **AUD** (`lib/config/product.ts`). Your Stripe account must support AUD payouts.
- [ ] Configure **Radar** (fraud rules) and turn on 3D Secure where required.
- [ ] Do one real low-value live transaction, then refund it from the admin panel, and confirm both the payment and the `refunded` webhook flow through.

How money/state actually flows (so you can debug it):
- The **amount is always server-computed** (`unitAmount × quantity`) — never taken from the browser. Good.
- The webhook is the **source of truth** for status. A signature failure returns `400` and changes nothing. A "not found yet" condition returns `503` so Stripe retries. Duplicate events are idempotent via `webhook_events` (keyed on the Stripe event id).
- A refund issued from admin only records the *request*; the order flips to `refunded` **only** when the verified `charge.refunded` webhook arrives.

**Disputes/chargebacks:** `charge.dispute.created` is received and logged. You still have to respond to disputes **in the Stripe dashboard** with evidence — the app doesn't do that for you. Keep order + tracking records (you have them) to contest.

---

## 6. Refunds & fulfillment operations

- **Refund window:** 90 days from `paidAt` (`features/admin/domain/refund-policy.ts`).
- **Full refunds only** (MVP — no partial refunds), **at most one refund per order** (DB-enforced).
- A refund does **not** un-fulfill an order — the product may already have shipped. Payment status and fulfillment are tracked independently.
- **Fulfillment is manual dropship:** admin marks an order fulfilled and records `supplierOrderRef` + `supplierTrackingRef` (e.g. the Alibaba/AliExpress order number and tracking). Recording these never changes payment status.
- This dropship model has **legal consequences** for shipping times and consumer rights — reflect real supplier lead times in your policy pages (§8).

---

## 7. Security hardening

Already in place:
- Secrets are server-only; RLS enabled on all tables (server-only access).
- Admin session is an HMAC-signed cookie: **30-min idle** + **12-hour absolute** timeout.
- Admin login has **per-IP brute-force lockout** (`admin_auth_attempts`).
- OTP codes are **hashed** (never stored in plaintext), 6 digits, 10-min expiry, 5 attempts, 60s resend cooldown, daily cap of 10.
- Webhook signatures verified; amounts never trusted from the client.

Do before / at launch:
- [ ] Set a **strong, unique `ADMIN_PASSWORD`** and a random 32-byte `ADMIN_SESSION_SECRET` in production (don't reuse dev values).
- [ ] Confirm the admin session cookie is `Secure` + `HttpOnly` + `SameSite` in production (HTTPS domain required).
- [ ] Add security headers in `next.config.ts` (empty today): `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`, a `Content-Security-Policy`, and a `Referrer-Policy`.
- [ ] Restrict/rotate every third-party key; scope them minimally (SendGrid → Mail Send only).
- [ ] Confirm `.env.local` and all `.env*` (except `.env.example`) are gitignored (they are) and that no real secret was ever committed.
- [ ] Consider rate-limiting the public checkout API routes at the edge (OTP send is capped in-app, but create-intent/analytics endpoints are open).

---

## 8. Legal & Compliance

**None of these pages exist yet.** For a store that takes real payments and
collects names, emails, phone numbers and shipping addresses, you need them
before launch. Add them as routes (e.g. `app/privacy/page.tsx`,
`app/terms/page.tsx`, `app/refund-policy/page.tsx`) and link them in the footer
and on the checkout page.

You're selling to consumers in **Australia (Melbourne timezone, AUD)** plus NZ/US/GB/CA,
so multiple regimes apply. Key ones:

- **Australian Consumer Law (ACL):** consumer guarantees you can't disclaim — goods must be of acceptable quality, match description, and be fit for purpose. Refund/repair/replacement rights apply for major/minor failures. Your policy must not claim "no refunds."
- **Privacy Act 1988 (Australian Privacy Principles):** you collect and store PII (email, WhatsApp/phone, shipping address). You need a privacy policy covering what you collect, why, who it's shared with (Stripe, SendGrid, Google, your dropship supplier), and how someone can request access/deletion. Note: the schema is built to **anonymize PII while keeping the financial record** — support that in your policy.
- **GDPR / UK GDPR (because you ship to GB):** if you knowingly sell into the UK/EU, data-subject rights and lawful basis apply.
- **Card data:** you never touch raw card numbers (Stripe Elements does), which keeps you in the lightest PCI-DSS tier — keep it that way; never build your own card form.

### 8.1 Privacy Policy — must cover
- What you collect: email, phone/WhatsApp, shipping address, order history, analytics/session data, IP (for admin lockout).
- Why, and legal basis.
- Third parties data is shared with: **Stripe** (payments), **SendGrid** (email), **Vercel** (hosting/analytics), and your **dropship supplier** (name + address to ship the order). This last one matters — customer addresses are sent overseas to a supplier. (Address validation is done in-app, so no address data leaves your stack for that step.)
- Data retention + how to request access/correction/deletion.
- Cookies/analytics (first-party funnel + Vercel Analytics).
- A contact method (your WhatsApp/support email).

### 8.2 Terms & Conditions — must cover
- Who you are (business name / ABN if registered), contact details.
- The product, price (AUD $59), and that price includes/excludes what.
- Order acceptance, payment terms (Stripe), currency.
- **Shipping:** where you ship (AU/NZ/US/GB/CA), realistic delivery times (dropship — often 2–6 weeks; state it honestly), and who bears customs/duties.
- Cancellation, returns, and refunds (link to refund policy).
- Limitation of liability (subject to ACL — you can't exclude consumer guarantees).
- Governing law (e.g. Victoria, Australia).

### 8.3 Refund / Returns Policy — must cover
- The **90-day** refund window your system enforces.
- What qualifies (faulty, not as described, ACL guarantees) vs change-of-mind (your choice — many dropshippers offer it but charge return shipping).
- **Full refunds only** currently (no partial refunds) — say so, or add partial support first.
- How to request one (via your support channel) and expected processing time.
- That refunds go back to the original payment method via Stripe.

### 8.4 Cookie / analytics consent
- You run Vercel Analytics + a first-party funnel that sets a session cookie. For UK/EU visitors you likely need a consent banner for non-essential analytics. Decide whether to geo-gate analytics or show a banner.

---

## 9. Pre-launch checklist

Environment & services:
- [ ] All §1 env vars set in Vercel **Production** with **live** values.
- [ ] Migrations applied to production Supabase; backups/PITR on.
- [ ] SendGrid domain authenticated (SPF/DKIM); test OTP received in inbox.
- [ ] Custom domain + HTTPS live.

Stripe:
- [ ] Live keys in place; live webhook endpoint created and secret set.
- [ ] Statement descriptor, AUD payouts, Radar configured.
- [ ] One real live purchase + refund tested end-to-end.

Security:
- [ ] Strong unique `ADMIN_PASSWORD` + random `ADMIN_SESSION_SECRET`.
- [ ] Security headers added; admin cookie Secure/HttpOnly confirmed.
- [ ] No secret in git history.

Legal (blocking):
- [ ] Privacy Policy page published + linked.
- [ ] Terms & Conditions page published + linked.
- [ ] Refund/Returns Policy page published + linked (matches 90-day / full-refund reality).
- [ ] Cookie/analytics consent handled.
- [ ] Real support contact (`NEXT_PUBLIC_WHATSAPP_SUPPORT`) working.

Functional smoke test on the live domain:
- [ ] Landing → checkout → OTP email → payment (real card) → success page.
- [ ] Order appears in `/admin`; refund works; fulfillment fields save.
- [ ] Address validation rejects a bad address (bad postal code / non-shipped country) and accepts a good one.
- [ ] Webhook events show up (Stripe dashboard → Events → delivered 200).

---

## 10. Ongoing operations

- **Monitor Stripe** daily at first: failed payments, disputes, webhook delivery failures (Stripe retries `503`s, but persistent failures need you).
- **Watch webhook health** — a broken `STRIPE_WEBHOOK_SECRET` means orders never move to `success`. The route logs the exact reason on a 400.
- **SendGrid** — watch bounce/spam rates; a poor sender reputation blocks OTP delivery and kills checkout.
- **Refunds/disputes** — respond to disputes in the Stripe dashboard within the deadline; keep supplier tracking as evidence.
- **Secret rotation** — rotate admin password and API keys periodically; rotating `ADMIN_SESSION_SECRET` invalidates all admin sessions (fine, just re-login).
- **Backups** — verify Supabase backups actually restore; test once.
- **Dependencies** — this is Next.js 16 / React 19 (recent). Track security advisories; test upgrades on a preview deploy first.

---

### Appendix — key files to know

| Concern | File |
|---|---|
| Env template | `.env.example` |
| Product price / currency | `lib/config/product.ts` |
| Ships-to countries + postal formats | `lib/config/shipping.ts` |
| Reporting timezone | `lib/config/analytics.ts` |
| Support number | `lib/config/support.ts` |
| DB schema | `lib/db/schema.ts` |
| DB client | `lib/db/index.ts` |
| Stripe provider | `lib/payments/providers/stripe.ts` |
| Stripe webhook route | `app/api/webhooks/stripe/route.ts` |
| Email (OTP) | `lib/email/sendgrid.ts` |
| Address validation (Zod + config) | `features/shipping/schemas/address.schema.ts`, `lib/config/shipping.ts` |
| Admin auth gate | `proxy.ts`, `lib/auth/session.ts` |
| Refund eligibility | `features/admin/domain/refund-policy.ts` |
| OTP policy | `features/checkout/domain/otp.ts` |
| Migrations | `drizzle/` |
