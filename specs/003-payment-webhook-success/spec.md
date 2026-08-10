# Feature Specification: Payment Page, Webhook & Order Sync, and Success Page

**Feature Branch**: `003-payment-webhook-success`
**Created**: 2026-08-03
**Status**: Draft
**Input**: User selection of three items from the specs-suggestions table — #5 Payment page
(Stripe Payment Intents, client confirm flow, NOT Checkout Sessions), #6 Stripe webhook &
order sync (signature verification, idempotent handling, server-side verification, persist/
update order), #7 Success page (thank-you, confirmation, order details, WhatsApp support) —
consolidated into one spec. Explicit direction: **handle idempotency, make the flow secure,
and enumerate every edge case a payment system may face.**

## Overview

This feature completes the purchase funnel. Feature 002 ends by creating an order and a
payment intent and handing the browser a client secret. This feature: (1) lets the customer
**confirm the card payment** (inline, on the checkout page); (2) receives and processes
**provider webhook events** as the *authoritative, idempotent, signature-verified* source of
order/payment truth; and (3) shows a **post-payment confirmation** — an in-checkout "confirmed"
step — whose state is *server-verified*, never taken from the client. The guiding principle
throughout: **the client is never trusted for payment outcome; money state is derived only from
the provider, server-side, and every state change is idempotent.**

## Clarifications

### Session 2026-08-03

- Q: What is the success page's confirmation source? → A: Hybrid — the webhook durably
  persists order state, and the success page also performs an immediate server-side provider
  retrieval of the payment intent so it shows correct status instantly even if the webhook
  lags; both reconcile idempotently to the same result.
- Q: How are security anomalies durably recorded? → A: Durable audit via the dedup record —
  each verified event's row stores its type and an outcome (`processed` / `ignored` /
  `flagged`), giving one table that serves both idempotency and audit; order-level anomalies
  (e.g. amount mismatch) are additionally noted on the order. Signature-rejected/forged events
  go to application logs only (their content is untrusted and cannot be safely keyed).
- Q: How is a webhook that arrives before its order is visible handled? → A: Return a
  retryable (non-2xx) response so the provider redelivers shortly; idempotency ensures the
  eventual successful processing is applied exactly once. The hybrid success-page verification
  is a second safety net.

### Session 2026-08-04

- Q: The standalone `/success` page receives the payment intent's client secret as a URL
  query param (Stripe's `return_url` redirect), making the confirmation a shareable
  bearer-link — should this change? → A: Yes. Confirm the card **inline** with
  `confirmPayment({ redirect: 'if_required' })` so the common (no-3-D-Secure) path never
  navigates and the client secret stays in memory. Show confirmation as an **in-checkout
  "confirmed" step** (server-verified via the confirm endpoint, secret sent in the POST body),
  and **remove the standalone `/success` route**. Only the provider-forced 3-D Secure redirect
  still returns to a URL carrying the secret; it points back to `/checkout`, is read once, and
  is stripped from history. The server-side verification and the webhook are unchanged — the
  page and the secret-in-URL are what's removed, not the verification.

### User Story 1 - Customer completes payment on the payment page (Priority: P1)

A verified customer who has started checkout enters their card details and confirms payment.
The page handles authentication challenges (e.g. 3-D Secure), declines, and transient errors
gracefully, and moves the customer forward only when the provider accepts the payment.

**Why this priority**: This is the moment money is captured; without it there is no revenue.
It is the highest-risk customer-facing surface and must handle failure cleanly so customers
are neither double-charged nor stranded.

**Independent Test**: Starting from a created payment intent (client secret), enter a test
card, confirm, and observe the customer advance to the confirmation on approval; enter a
declined card and observe a clear error with the ability to retry; trigger an authentication
challenge and observe it complete.

**Acceptance Scenarios**:

1. **Given** a customer with an active payment intent, **When** they submit valid card details,
   **Then** the payment is confirmed with the provider and the customer is taken to the success
   page only after the provider accepts (or begins processing) the payment.
2. **Given** a card that requires authentication (3-D Secure / SCA), **When** the customer
   confirms, **Then** the authentication challenge is presented and, on success, the payment
   proceeds; on failure or cancellation, the customer is returned to the payment page with a
   clear message and can retry.
3. **Given** a declined card, **When** the customer confirms, **Then** a clear,
   non-technical decline message is shown, no order is marked paid, and the customer can retry
   with a different card.
4. **Given** the customer double-clicks the pay button, **When** the second submission fires,
   **Then** it is prevented/de-duplicated and the customer is never charged twice.
5. **Given** the payment amount, **When** the payment is confirmed, **Then** the charged amount
   is the server-set price and cannot be altered by the client.

---

### User Story 2 - Authoritative, idempotent, verified order sync via webhooks (Priority: P1)

The system receives payment lifecycle events from the provider, verifies each event is
genuine, processes each exactly once even under duplicate or out-of-order delivery, and
updates the order's payment state from the verified event — making the order record the
durable source of truth regardless of what the browser did or didn't do.

**Why this priority**: Constitutional non-negotiable — payment success MUST be confirmed
server-side and MUST NOT rely on the frontend. This is the mechanism that makes the money
state trustworthy and durable (survives the customer closing the tab, network loss, etc.).

**Independent Test**: Send a signed `succeeded` event for a known payment intent and confirm
the order becomes `success`; re-send the identical event and confirm nothing changes (no
double side-effect); send an event with a bad signature and confirm it is rejected; send a
`failed` event and confirm the order becomes `failed`.

**Acceptance Scenarios**:

1. **Given** a genuine, signed payment-succeeded event, **When** it is received, **Then** its
   signature is verified, the referenced order is set to `success` (with receipt reference
   recorded), and the event is acknowledged.
2. **Given** the same event is delivered again (provider retry), **When** it is received a
   second (or Nth) time, **Then** it is recognized as already processed and produces no
   additional state change or side-effect (idempotent).
3. **Given** an event with an invalid or missing signature, **When** it is received, **Then**
   it is rejected as unauthorized and no order state changes.
4. **Given** a payment-failed or canceled event, **When** it is received, **Then** the order is
   set to `failed` (server-side), never `success`.
5. **Given** transient processing failure (e.g. datastore briefly unavailable), **When** the
   event cannot be fully processed, **Then** the system responds so the provider will retry
   later, and no partial/inconsistent order state is left behind.
6. **Given** the amount in the verified event does not match the order's server-set expected
   amount, **When** processing, **Then** the order is NOT marked `success`; the discrepancy is
   flagged for review.

---

### User Story 3 - Server-verified post-payment confirmation (Priority: P2)

After paying, the customer sees a thank-you confirmation of their order with its key details
and a WhatsApp support button — shown as an in-checkout "confirmed" step, not a separate page.
What it displays reflects the *server-verified* payment state — it will not falsely claim
success on the customer's say-so, and it behaves correctly even if the webhook has not yet
arrived.

**Why this priority**: Confirmation and post-purchase support close the loop and build trust,
but the money is already captured by US1/US2; a delayed or degraded confirmation does not lose
revenue.

**Independent Test**: Complete a payment and reach the confirmation; confirm it shows the order
confirmation and details from server-verified state; call the confirmation endpoint with a
wrong/absent client secret and confirm it does NOT return a paid confirmation.

**Acceptance Scenarios**:

1. **Given** a completed payment, **When** the customer reaches the confirmation, **Then** it
   shows a thank-you message, a payment-confirmed indication, the order confirmation/reference
   and key details (amount, currency), and a WhatsApp support button — all from server-verified
   state.
2. **Given** the webhook has not yet been processed at the moment the confirmation loads, **When**
   status is determined, **Then** it performs a server-side verification with the provider so it
   can confirm (or show a "still confirming" state) without waiting solely on the webhook.
3. **Given** a confirmation request without a valid, matching payment reference (its client
   secret), **When** it is made, **Then** it does NOT return a paid confirmation or another
   customer's details.
4. **Given** the payment is still processing (asynchronous outcome), **When** the confirmation
   loads, **Then** it shows a pending/"we'll confirm by email" state rather than a false success.

---

### Edge Cases

> Per the explicit request, this section enumerates payment-system edge cases exhaustively.
> Each maps to a requirement below.

#### Payment page (client confirm)

- **Card declined** (insufficient funds, expired card, incorrect number/CVC/expiry, generic
  decline, lost/stolen, do-not-honor) → clear per-reason message where available; order stays
  unpaid; retry allowed.
- **Authentication required (3-D Secure / SCA)** → challenge shown; success proceeds; failure
  or user-cancel returns to the page with a retry option.
- **Authentication abandoned** (user closes the challenge popup) → treated as not-completed;
  no charge; retry allowed.
- **Double submission / rapid re-click** → de-duplicated; single charge only.
- **Network failure mid-confirmation** → the outcome is indeterminate on the client; the page
  recovers by re-checking the payment status server-side rather than assuming failure (avoids
  a hidden successful charge being treated as failed).
- **Customer closes the tab after confirming** → payment still completes via the provider;
  the webhook durably records success; the customer can be reached (email/WhatsApp).
- **Client secret invalid/expired** → the page detects it and restarts the intent creation or
  shows a recoverable error.
- **Payment intent already succeeded** (customer returns/refreshes) → the page recognizes the
  paid state and forwards to success instead of charging again.
- **Payment intent canceled/expired** → the page shows a recoverable state and can start a new
  intent.
- **Client-side amount tampering** → impossible to affect the charge; the amount is fixed by
  the provider intent created server-side.
- **Slow processing / provider latency** → the page shows a processing indicator and does not
  let the customer double-submit.

#### Webhook & order sync

- **Duplicate event delivery** (provider retries after a slow/failed ack) → processed exactly
  once (dedup by event identity).
- **Out-of-order delivery** (e.g. `succeeded` arrives before `created`, or `failed` after a
  later `succeeded`) → terminal/authoritative states are not overwritten by stale earlier
  events; only valid forward transitions are applied.
- **Invalid/forged signature** → rejected as unauthorized; no state change.
- **Replay attack** (a genuine old event re-sent) → rejected via signature timestamp tolerance
  and/or event-dedup; no state change.
- **Unknown/unsubscribed event type** → acknowledged and ignored (no error).
- **Event references an order that does not exist yet** (race: webhook arrives before the
  order write is visible) → the endpoint returns a retryable (non-2xx) response so the provider
  redelivers; idempotency ensures exactly-once eventual processing; never crashes or corrupts
  state.
- **Event references an unknown payment reference** → acknowledged; flagged, no incorrect order
  is touched.
- **Amount/currency mismatch** between event and the order's server-set expectation → order is
  NOT marked success; flagged for review (fraud/tampering guard).
- **Refund event** (full refund) → order transitioned to `refunded`.
- **Partial refund event** → recorded/flagged; net revenue reflects the refunded portion
  (payment status handling per the data foundation's vocabulary; full partial-refund
  accounting beyond marking is deferred to the dashboard feature).
- **Dispute/chargeback event** → recorded/flagged for follow-up (full dispute management is the
  admin dashboard's concern; this feature must not silently drop it).
- **Multiple charges on one intent** (retries) → the final authoritative status governs; no
  duplicate order.
- **Processing failure / datastore unavailable** → respond so the provider retries; no partial
  writes.
- **Slow processing risking provider timeout** → acknowledge quickly; heavy work must not make
  the provider consider the delivery failed.
- **Test-mode event hitting live config (or vice-versa)** → rejected/ignored; environments do
  not cross-contaminate.
- **Raw-body tampering** → signature verification operates on the exact received payload;
  any modification invalidates the signature.

#### Post-payment confirmation

- **Confirmation requested without paying** → no false confirmation; access is scoped to a
  valid, matching payment reference (its client secret).
- **Webhook not yet processed when confirmation loads** → immediate server-side verification
  confirms (or shows "confirming") without depending on webhook timing.
- **Payment still processing** → pending state, not success.
- **Payment failed but customer reached the confirmation** → shows the failure/retry path, not
  success.
- **Order not found / mismatched reference** → generic, non-leaking message; no other
  customer's data shown.
- **Confirmation request forged/replayed by a third party** → does not expose personal data;
  authorized only by the payment reference's client secret (sent in the request body on the
  inline path), not guessable order ids.
- **Refunded order viewed later** → reflects the current (refunded) state, not a stale "paid".

#### Cross-cutting

- **Client claims success but server disagrees** → server state wins; the customer never sees a
  paid confirmation the server cannot verify.
- **Redirect/webhook race** → the confirmation (immediate server verification) and webhook
  (durable persistence) reconcile to the same truth; whichever confirms first, the order ends
  correct.
- **Concurrent updates** (webhook + confirmation verification updating the same order at once)
  → idempotent, converging to one consistent final state.

## Requirements *(mandatory)*

### Functional Requirements

#### Payment page (US1)

- **FR-001**: The system MUST provide a payment page that confirms a card payment against an
  existing server-created payment intent using the provider's client confirmation flow (Payment
  Intents), and MUST NOT use a hosted Checkout Session.
- **FR-002**: The payment page MUST handle authentication challenges (3-D Secure / SCA),
  completing the payment on success and returning the customer to a retryable state on failure
  or cancellation.
- **FR-003**: The payment page MUST present clear, non-technical messages for declines and
  errors, keep the order unpaid on failure, and allow retry.
- **FR-004**: The payment page MUST prevent duplicate submissions so a customer cannot be
  charged twice for one intent.
- **FR-005**: The charged amount and currency MUST be those fixed on the server-created intent;
  the client MUST NOT be able to influence them.
- **FR-006**: After a successful (or processing) confirmation, the customer MUST be advanced to
  the in-checkout confirmation step; the payment surface MUST NOT itself mark the order paid
  (that is the webhook's / server verification's authority).
- **FR-007**: On indeterminate client outcomes (e.g. network loss mid-confirm), the page MUST
  reconcile by checking payment status rather than assuming failure, to avoid mistreating a
  successful charge.

#### Webhook & order sync (US2)

- **FR-008**: The system MUST expose a webhook endpoint that verifies the authenticity of every
  incoming event (cryptographic signature over the exact raw payload) and MUST reject events
  that fail verification as unauthorized, with no state change.
- **FR-009**: The system MUST reject replayed events (e.g. via signature timestamp tolerance)
  and MUST process each unique event at most once (idempotent), deduplicated by event identity.
- **FR-009a**: The system MUST persist a record of processed event identities so idempotency
  survives restarts and concurrent deliveries.
- **FR-010**: On a verified payment-succeeded event, the system MUST set the referenced order
  to `success` and record the receipt reference, deriving status from the provider — never from
  client input.
- **FR-011**: On a verified payment-failed or canceled event, the system MUST set the order to
  `failed`; it MUST NOT mark such an order `success`.
- **FR-012**: The system MUST apply only valid forward state transitions and MUST NOT let a
  stale or out-of-order event overwrite a later authoritative state (consistent with the data
  foundation's transition rules).
- **FR-013**: The system MUST verify that the event's amount and currency match the order's
  server-set expected amount/currency before marking `success`; on mismatch it MUST NOT mark
  success, MUST record the event's outcome as `flagged`, and MUST additionally note the
  discrepancy on the order.
- **FR-014**: On a verified full-refund event, the system MUST set the order to `refunded`.
  Partial-refund and dispute/chargeback events MUST be recorded with outcome `flagged` (not
  silently dropped); full accounting/management of those is out of scope here.
- **FR-014a**: Each verified event's processed record MUST store its type and an outcome —
  `processed` (state applied), `ignored` (unknown/unsubscribed type, no-op), or `flagged`
  (anomaly requiring review) — forming a durable, queryable audit trail alongside the
  idempotency guarantee. Signature-rejected/forged events MUST be captured in application logs
  only (their untrusted content MUST NOT be persisted as a keyed event record).
- **FR-015**: On transient processing failure, the endpoint MUST respond such that the provider
  will retry, and MUST NOT leave partial or inconsistent order state.
- **FR-016**: The endpoint MUST acknowledge quickly enough to avoid provider-side delivery
  timeouts, without sacrificing exactly-once processing.
- **FR-017**: Unknown or unsubscribed event types MUST be acknowledged and ignored without
  error.
- **FR-018**: When an event's referenced order/payment reference is not yet visible, the
  endpoint MUST return a retryable (non-2xx) response so the provider redelivers the event
  later; combined with idempotency (FR-009) this guarantees the event is eventually processed
  exactly once, with no data loss or corruption. (This race is rare because the order and its
  payment reference are created before the customer confirms payment.)

#### Post-payment confirmation (US3)

> Delivered as an in-checkout "confirmed" step, not a standalone `/success` page (see
> Clarifications 2026-08-04).

- **FR-019**: The post-payment confirmation MUST display a thank-you message, a
  payment-confirmed indication, the order confirmation/reference and key details (amount,
  currency), and a WhatsApp support button.
- **FR-020**: The confirmation MUST reflect server-verified payment state; it MUST NOT show a
  paid confirmation based on a client-reported outcome.
- **FR-021**: The confirmation MUST be established via immediate server-side verification with
  the provider, so it does not depend solely on webhook timing; if still unconfirmed it MUST
  show a pending/"we'll confirm by email" state rather than false success.
- **FR-022**: The confirmation MUST be authorized by the payment reference's client secret,
  which MUST be sent to the server in the request body (never placed in a shareable URL) for
  the common inline-confirmation path; it MUST NOT be reachable by guessing order ids, and MUST
  NOT expose another customer's personal data. (The provider-forced 3-D Secure redirect is the
  one path where the secret transits the URL; it is read once on return and stripped from
  history.)

#### Cross-cutting (security & idempotency)

- **FR-023**: Payment outcome MUST be trusted only from the provider (server-side verification
  via webhook and/or intent retrieval), never from client-reported values.
- **FR-024**: All order state changes in this feature MUST be idempotent, so duplicate webhook
  deliveries, retries, and concurrent confirmation verifications converge to one consistent
  final state (reusing the data foundation's idempotent update semantics).
- **FR-025**: All provider secrets (webhook signing secret, API keys) MUST be read only on the
  server from environment variables, MUST live only in local secret storage, and MUST NOT carry
  a client-exposed prefix. The provider's publishable key (used by the card-confirm surface) is
  the only client-exposed value and MUST be limited to that role.

### Key Entities *(include if feature involves data)*

- **Order** (from feature 001, reused): the durable source of truth. This feature updates its
  `payment_status` (to `success` / `failed` / `refunded`), receipt reference, and provider
  customer reference from verified events. Contact lives on the related `users` record (feature
  002); the confirmation shows minimal order details only.
- **Processed Webhook Event** (new): a record of each *verified* provider event that has been
  handled, keyed by the provider's unique event identity. Attributes: event id (unique / primary
  key); event type; **outcome** (`processed` / `ignored` / `flagged`); processed timestamp;
  optional reference to the affected order. Its presence keyed by event id is what makes webhook
  handling idempotent and replay-resistant; the outcome column makes it a durable audit trail.
  Signature-rejected/forged events are NOT stored here (untrusted, unkeyable) — they go to
  application logs.
- **Payment Intent** (provider-side, referenced): the authoritative payment object. Its signed
  events drive order sync; the confirmation may retrieve it server-side for immediate status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of orders marked `success` are backed by a verified provider event or a
  server-side provider verification — zero are marked paid from client-reported state.
- **SC-002**: Duplicate webhook deliveries (tested with at least 5 repeats and concurrent
  deliveries of the same event) produce exactly one set of side-effects; the order's final
  state is identical to a single delivery.
- **SC-003**: 100% of events with an invalid/forged signature or outside the replay tolerance
  are rejected with no state change.
- **SC-004**: No customer can be charged twice for a single payment intent, including under
  double-click and network-retry conditions.
- **SC-005**: For every declined/failed/authentication-cancelled attempt, the order remains
  unpaid and the customer is offered a clear retry — zero silent failures or false successes.
- **SC-006**: When the webhook lags, the confirmation still reflects correct status via
  server-side verification within a few seconds for 95% of loads, and never shows a false
  success.
- **SC-007**: An amount/currency mismatch between a provider event and the order's server-set
  expectation results in the order NOT being marked `success` in 100% of cases, and the
  discrepancy is flagged.
- **SC-008**: The success confirmation cannot be obtained by guessing order ids and never
  exposes another customer's personal data (verified by attempting access without the matching
  payment reference/secret).

## Assumptions

- **Builds on 001 + 002**: The order record and its idempotent payment-status transitions
  (001), and the payment provider abstraction + Stripe adapter, the `create-intent` endpoint,
  the `users`/verified flow, and the checkout page (002) are present and reused. This feature
  adds the card-confirm surface, the webhook endpoint, and the in-checkout confirmation.
- **Provider**: Stripe, using the **Payment Intents** workflow and **Stripe webhooks** (not
  Checkout Sessions), consistent with the constitution. The card-confirm surface uses the
  provider's client SDK to confirm the intent (inline, `redirect: 'if_required'`) with the
  client secret from 002's `create-intent`.
- **Payment methods**: Card payments in AUD for the MVP. Asynchronous/delayed payment methods
  (e.g. bank-debit style) are out of scope; the confirmation's "still processing" state covers
  any transient processing but the product does not enable async methods now.
- **Server-set price**: The charged amount remains the server-authoritative single-product
  price (AUD 89) from 002; this feature never accepts a client-supplied amount.
- **Webhook is the durable authority; confirmation verification is the immediate check**: the
  order is updated durably by verified webhook events; the confirmation additionally performs an
  immediate server-side verification so it does not depend on webhook timing. Both reconcile to
  the same idempotent result.
- **Refund/dispute depth**: This feature marks orders `refunded` on full-refund events and
  records/flags partial-refund and dispute events. Full refund accounting and dispute management
  belong to the later admin dashboard feature.
- **Publishable key**: The provider's publishable (client) key is the only client-exposed
  value; all other provider secrets (secret key, webhook signing secret) are server-only.
- **WhatsApp support**: The confirmation's WhatsApp button opens a conversation with the
  business's support number (configured server-side/build-time); no message is sent
  automatically.
- **No standalone success page** (Session 2026-08-04): confirmation is an in-checkout step and
  the card confirms inline, so the client secret is not placed in a shareable URL on the common
  path. There is no persistent, URL-addressable order-status page; post-purchase reach-out is
  via email/WhatsApp.

## Dependencies

- **001-data-payment-foundation**: order record, payment-status vocabulary (incl. `refunded`),
  idempotent status transitions, server-only data-access layer.
- **002-storefront-checkout-payments**: payment provider abstraction (create-intent + verify)
  and Stripe adapter, the `create-intent` endpoint, the `users`/verified gate, and the checkout
  page that leads into payment.
- **Stripe**: Payment Intents (client confirm) + Webhooks (signed events). Requires a webhook
  signing secret and a publishable key in addition to the existing secret key.
- Not included here (separate later specs): the admin dashboard (orders, analytics, fulfillment,
  refund/dispute management) and any post-purchase automation.
