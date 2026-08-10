# Real-World QA Test Plan — Store + Admin Dashboard

A hands-on script for exercising the whole system end to end: the customer
purchase funnel, then every admin capability (fulfil, notes, refund, analytics)
and every state rule around them.

---

## 0. Setup

### Run the app
```bash
npm run dev
```
- Storefront: http://localhost:3000
- Admin: http://localhost:3000/admin (password = `ADMIN_PASSWORD` in `.env.local`)

### Make webhooks work locally (IMPORTANT for refunds)
Payment **success** shows immediately (the success page verifies with Stripe directly).
But an order only becomes **`refunded`** when Stripe's `charge.refunded` webhook is
received. Locally you must forward events with the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```
Copy the `whsec_…` it prints into `STRIPE_WEBHOOK_SECRET` in `.env.local` and restart
`npm run dev`. Without this, a refund is issued at Stripe but the order stays
`success` with a "refund requested" note until an event arrives.

### Stripe test cards (any future expiry, any CVC, any postcode)
| Card | Outcome |
|------|---------|
| `4242 4242 4242 4242` | Payment **succeeds** |
| `4000 0000 0000 0002` | Card **declined** (→ failed) |
| `4000 0025 0000 3155` | Requires **3-D Secure** authentication |
| `4000 0000 0000 9995` | Declined (insufficient funds) |

### How to create an order in each state (for admin testing)
| Target state | How |
|--------------|-----|
| `pending` | Start checkout, reach the payment step, **don't** complete the card |
| `success` | Pay with `4242 4242 4242 4242` |
| `failed` | Pay with `4000 0000 0000 0002` |
| `refunded` | Refund a `success` order in the admin (needs `stripe listen`) |
| `success` paid **>90 days** ago | Backdate for testing: `update orders set paid_at = now() - interval '100 days' where id = '…';` |

### Reset between runs
```bash
node scripts/reset-db-data.mjs --yes   # wipes all data, keeps schema
```

---

## 1. Purchasing funnel (customer)

> Use an email inbox you control — the OTP is emailed there.

**1.1 Happy path**
1. Landing page → click the buy CTA → checkout.
2. Enter your email + WhatsApp number → submit.
3. Check email for the 6-digit OTP → enter it → verify.
4. Continue to payment → pay with `4242 4242 4242 4242`.
5. **Expect:** in-checkout "Thank you / confirmed" step, order id + amount shown.
6. **Admin check:** the order appears with status **Success**.

**1.2 Declined card**
- Same flow, pay with `4000 0000 0000 0002`.
- **Expect:** decline message, can retry. Order stays `pending`/`failed` (not success).

**1.3 3-D Secure**
- Pay with `4000 0025 0000 3155` → complete the authentication challenge.
- **Expect:** returns to checkout, verifies server-side, shows success.

**1.4 Abandoned payment**
- Complete contact + OTP, reach payment, then close the tab.
- **Expect:** order exists as `pending` in the admin (never `success`).

**1.5 OTP rules**
- Wrong code → rejected. Expired code (>10 min) → rejected. "Resend" issues a new code.
- Too many attempts / resends → rate-limited.

**1.6 Amount can't be tampered**
- The price is server-set; there's no way to pay a different amount from the client.

---

## 2. Admin access & security

**2.1** Visit `/admin` with no session → redirected to `/admin/login`. Hitting
`/api/admin/metrics` directly → `401`.
**2.2** Wrong password → "Incorrect password". **5 wrong tries** → **locked out** (429)
for 15 minutes — even the correct password is refused while locked.
**2.3** Correct password → dashboard loads.
**2.4** Leave the tab idle **30 min** → next action bounces to login. (Absolute cap: 12 h.)
**2.5** Click **Sign out** → session cleared; `/admin` redirects to login again.

---

## 3. Dashboard overview (`/admin`)

- **Revenue** (all-time / today / this month) counts **only `success` orders, net of
  refunds** — a refunded order drops out.
- **Total orders** = every order ever.
- **Payments by status** meter + legend = live counts of pending/success/failed/refunded.
- **Conversion** = success orders ÷ unique funnel visitors.
- Numbers count up on load; empty store shows zeros (no errors, no divide-by-zero).

---

## 4. Orders management (`/admin/orders`)

**4.1 List** — every order with all fields; filter by **Status** and **Fulfilment**;
"Load more" paginates.
**4.2 Detail** — click an order → full record + internal notes.
**4.3 Internal notes** — add a note on an order of **any** status; it appears
timestamped and persists on reload. Notes render as inert text (safe).

### Fulfilment rules
- **Mark fulfilled** appears **only when status = `success`**.
- Clicking it is **idempotent** — re-clicking does nothing (shows "Fulfilled").
- Fulfilment has **no time limit** (you can fulfil an old paid order).
- It's **one-way** — there's no "un-fulfil".
- On `pending` / `failed` / `refunded` orders the fulfil action is **not shown**.

---

## 5. Refunds (`/admin/orders/[id]`)

> Needs `stripe listen` running (see §0) to see the order flip to `refunded`.

**5.1 Eligible refund**
1. Open a `success` order paid within 90 days → **Refund** button is visible.
2. Click it → confirmation dialog states the **amount** and that money returns to the
   customer.
3. Confirm → toast/inline "Refund requested — awaiting provider confirmation". Order is
   **still `success`** at this instant (money state is never set from the click).
4. Stripe sends `charge.refunded` → order flips to **Refunded**; it drops out of revenue;
   payments-by-status updates.

**5.2 Refund a FULFILLED order** (regression case)
- Fulfil a `success` order first, then refund it.
- **Expect:** refund works; order becomes `Refunded` but **Fulfilled stays "Yes"** (a
  shipped product isn't un-shipped by a refund).

**5.3 Not eligible — button hidden / action rejected**
- `pending` order → no Refund button.
- `failed` order → no Refund button.
- Already `refunded` → no Refund button.
- `success` but paid **>90 days** ago → no Refund button (past the window).

**5.4 At most one refund**
- After refunding once, the button is gone. A repeat/parallel request can't produce a
  second refund (customer is never paid back twice).

**5.5 Provider failure**
- If Stripe rejects the refund, the order stays `success` and the failure is shown — no
  half-refunded state.

---

## 6. Analytics (`/admin/analytics`)

- Browse the storefront (in a **non-admin** browser/incognito — admin traffic is excluded)
  → a funnel **entry** is recorded; reaching payment records a **payment** event; a
  completed purchase records a server-side **conversion**.
- The page shows revenue-over-time, orders/day, payment success rate, conversion rate,
  and traffic sources; the **7 / 30 / 90 day** range recomputes all of them.
- A period with no data shows empty states, not errors.
- Bots (by user-agent) and admin traffic are excluded from funnel counts.

---

## 7. Eligibility matrix — when can I fulfil vs refund?

| Order state | Can **fulfil**? | Can **refund**? |
|-------------|:---------------:|:---------------:|
| `pending` (not paid) | ❌ no | ❌ no |
| `failed` | ❌ no | ❌ no |
| `success`, not fulfilled, paid ≤ 90 days | ✅ **yes** | ✅ **yes** |
| `success`, already fulfilled, paid ≤ 90 days | — already fulfilled (no-op) | ✅ **yes** (fulfilment kept) |
| `success`, paid **> 90 days** ago | ✅ yes (no time limit on fulfilment) | ❌ no (past refund window) |
| `refunded` | ❌ no | ❌ no (already refunded) |

**In words:**
- **Fulfil** = only a **paid (`success`) order**, once, any time after payment. It's a
  one-way flag saying "I've shipped/delivered it."
- **Refund** = only a **paid (`success`) order that hasn't been refunded yet and was paid
  within the last 90 days**. Fulfilling it first does **not** block a refund; the money
  returns via Stripe and the order becomes `refunded` only after Stripe confirms.

---

## 8. Edge cases worth a look

- **Empty store** (right after a reset): dashboard + analytics show zeros/empty states, no
  errors.
- **Refund timing:** the order never shows `refunded` from the button alone — only after
  the webhook. This is deliberate (never trust the client for money state).
- **Duplicate webhooks:** replaying the same Stripe event doesn't double-apply anything.
- **Notes safety:** paste `<script>alert(1)</script>` as a note — it displays as plain
  text, never executes.
- **Direct URL access:** any `/admin/*` page or `/api/admin/*` endpoint without a valid
  session is refused.
