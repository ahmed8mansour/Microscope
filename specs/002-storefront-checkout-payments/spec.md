# Feature Specification: Storefront, Checkout (Contact + OTP) & Payment Abstraction

**Feature Branch**: `002-storefront-checkout-payments`
**Created**: 2026-08-01
**Status**: Draft
**Input**: User selection of three items from the session's specs-suggestions table — #3 Landing
page (already implemented; documented here retrospectively), #4 Checkout: contact + email OTP,
and #2 Payment provider abstraction — consolidated by request into a single spec. Email OTP
delivery uses SendGrid.

## Clarifications

### Session 2026-08-01

- Q: Which service delivers the verification email (OTP)? → A: SendGrid.
- Q: Is the payment UI (payment page) in scope here? → A: No. This spec delivers the
  provider-agnostic payment abstraction (create-intent + verify) and its Stripe adapter; the
  payment page that consumes it is a separate later spec.
- Q: What does "landing page already done" mean for scope? → A: The landing experience is
  already built (see Assumptions); this spec documents it and covers only the gap of routing
  its primary purchase CTA into the checkout flow.

### Session 2026-08-02

- Q: How should customer contact and email verification be modeled relative to orders? → A:
  Two related tables. A persistent `users` table holds email, WhatsApp, and a `verified`
  boolean (email-OTP verified); the `orders` table relates to it by a foreign key
  (`orders.user_id`). Contact submission creates/finds the user; OTP verification sets
  `users.verified = true`; the order is created at payment time and linked to the verified
  user. (This moves contact off the `orders` table from feature 001 — see Dependencies.)
- Q: What OTP policy values should apply? → A: Defaults — 6-digit numeric code, 10-minute
  expiry, max 5 attempts per code, 60-second resend cooldown, plus a per-email daily cap.

### Session 2026-08-04

- Q: A persistent `verified` flag lets a returning customer (or anyone who knows a
  previously-verified email) create a payment intent days later without any OTP — the flag is
  keyed by email and never expires. How should verification work? → A: **Verification is
  per-checkout, not a standing credential** (reverses the "verified persists" decision from
  2026-08-02). Issuing a new OTP resets `verified=false`; a successful verification stamps
  `verified_at`; creating a payment intent requires a *fresh* verification (within a ~15-minute
  window) and **consumes** it (resets `verified=false`). So every purchase requires its own OTP,
  and a stale/already-used verification cannot authorize payment. (Also removed a latent bug
  where an already-verified user's OTP check returned success for any code, including a wrong
  one.)

### User Story 1 - A high-converting landing page that funnels to purchase (Priority: P1)

A prospective customer arrives at the store and is presented with a fast, single-product
landing experience for "The Field Microscope" that builds desire (problem, product, proof)
and gives them one obvious way to start buying.

**Why this priority**: The landing page is the top of the funnel and the first impression;
without a clear path from it into checkout, nothing downstream can convert. It is already
built, so the remaining value is ensuring its primary call-to-action leads into the purchase
flow rather than a dead link.

**Independent Test**: Load the landing page and confirm it renders the full narrative (hero,
premise, discovery, instrument, social proof, offer, footer), loads quickly, and that its
primary purchase call-to-action navigates the customer into the checkout step for the single
product.

**Acceptance Scenarios**:

1. **Given** a visitor opens the store, **When** the landing page loads, **Then** it presents
   the product hero, supporting sections (problem, product detail, social proof), and a clear
   price and purchase call-to-action, and becomes interactive quickly.
2. **Given** a visitor decides to buy, **When** they activate the primary purchase
   call-to-action, **Then** they are taken to the checkout step for the single product.
3. **Given** a visitor on a small screen, **When** the page loads, **Then** the layout is
   responsive and the purchase call-to-action remains reachable.

---

### User Story 2 - Verified contact capture before payment (Priority: P1)

Before paying, the customer provides an email and a WhatsApp number — captured as a `users`
record — then proves the email is theirs by entering a one-time code sent to it. Verifying the
code sets the user's `verified` flag; only a verified user may continue to payment. There are
no passwords and no login (the `users` record is a passwordless contact record, not an
authenticated account).

**Why this priority**: Verified contact is the store's only channel to reach the customer
after purchase and its primary defense against junk/mistyped orders. It is a hard gate that
must exist before any payment can be taken.

**Independent Test**: Submit a valid email + WhatsApp, receive a code by email, enter it, and
confirm the flow advances to payment; enter a wrong or expired code and confirm it is rejected
and payment stays blocked.

**Acceptance Scenarios**:

1. **Given** a customer at checkout, **When** they submit a valid email and WhatsApp number,
   **Then** the input is validated server-side, a `users` record is created (or reused for an
   existing email) with `verified = false`, and a one-time verification code is sent to the
   email.
2. **Given** a code was sent, **When** the customer enters the correct code before it expires,
   **Then** the user's `verified` flag is set to true and the customer may proceed to payment.
3. **Given** a code was sent, **When** the customer enters an incorrect code, **Then** it is
   rejected, the attempt is counted, and the customer is not allowed to proceed.
4. **Given** a code has expired, **When** the customer enters it, **Then** it is rejected and
   the customer must request a new code.
5. **Given** a customer requests another code, **When** they request again within the cooldown
   window, **Then** the resend is refused until the cooldown passes.
6. **Given** repeated incorrect attempts, **When** the attempt limit is exceeded, **Then**
   further attempts for that code are blocked and a new code must be requested.
7. **Given** invalid input (malformed email or empty WhatsApp), **When** submitted, **Then**
   the request is rejected with a clear validation message and no code is sent.

---

### User Story 3 - A provider-agnostic payment abstraction (Priority: P1)

The system can create a payment for an order and later verify that payment's outcome through a
single internal interface that hides the specific payment provider. Stripe is the first (and
only, for MVP) implementation, added as an adapter selected by a factory, so a second provider
could be introduced later without changing any calling code.

**Why this priority**: Payment integrity and provider isolation are constitutional
non-negotiables. Establishing the neutral interface now is what lets the later payment page and
webhook features build against a stable seam and prevents Stripe details from leaking across
the codebase.

**Independent Test**: Through the abstraction (not a Stripe-specific call), create a payment
intent for a given amount/currency/order and receive a normalized result containing a client
secret and a provider reference; then verify that reference and receive a normalized status —
all without the caller importing any provider-specific types.

**Acceptance Scenarios**:

1. **Given** a verified user proceeding to pay, **When** a caller requests a payment intent
   through the abstraction, **Then** the server creates the order linked to that user
   (`orders.user_id`) with the server-set amount/currency, and the abstraction returns a
   normalized result (client secret + provider payment reference) with the order linked to that
   reference.
2. **Given** a provider payment reference, **When** a caller verifies it through the
   abstraction, **Then** it returns a normalized payment status (pending / success / failed /
   refunded) derived from the provider, never from client-supplied data.
3. **Given** the need to support another provider in future, **When** a new provider adapter is
   added and registered with the factory, **Then** no calling code changes — only the new
   adapter and its registration.
4. **Given** a provider error or unexpected response, **When** it occurs during create or
   verify, **Then** the abstraction surfaces a normalized, non-leaking error rather than a
   raw provider exception.

---

### Edge Cases

- What happens when the email provider (SendGrid) fails to accept the send? → The customer is
  told the code could not be sent and is invited to retry; no verified state is granted.
- What happens if a customer submits contact details but never verifies? → A `users` record
  exists with `verified = false`; no order is created and no payment can proceed for an
  unverified user.
- What happens if a customer requests many codes rapidly? → Resend cooldown and a per-email
  rate limit prevent abuse and inbox flooding.
- What happens if a returning customer re-enters an email that already has a `users` record? →
  The existing record is reused, but the customer **re-verifies for this purchase**: issuing a
  new code resets any prior verification (subject to cooldown/rate limits). A previous
  purchase's verification never carries over (see Clarifications 2026-08-04).
- What happens when a payment intent is requested twice for the same order? → The same order is
  reused (per the data foundation), not duplicated; the abstraction does not create a second
  order record.
- What happens if the configured payment provider is unavailable? → Intent creation fails with
  a normalized error; the customer is not charged and can retry.
- What happens if the landing CTA is activated before checkout exists? → Out of scope guard:
  the CTA routes to the checkout step defined by US2.

## Requirements *(mandatory)*

### Functional Requirements

#### Landing (US1)

- **FR-001**: The store MUST present a single-product landing page containing, at minimum, a
  hero, product detail/benefits, social proof, an offer with price, and a footer.
- **FR-002**: The landing page MUST expose one primary purchase call-to-action that navigates
  the customer into the checkout step (US2).
- **FR-003**: The landing page MUST be responsive across common mobile and desktop widths and
  MUST become interactive quickly (see Success Criteria).

#### Checkout contact + OTP (US2)

- **FR-004**: The system MUST collect a customer email and WhatsApp number at checkout, validate
  both server-side, and persist them as a `users` record (creating a new one, or reusing the
  existing record for that email) with `verified = false`. Email MUST be unique in `users`.
- **FR-005**: On valid contact submission, the system MUST generate a one-time verification code
  and send it to the provided email via SendGrid.
- **FR-006**: The system MUST NOT store the raw verification code in a recoverable form; it MUST
  store only what is needed to verify a submitted code and MUST record an expiry.
- **FR-007**: The system MUST verify a submitted code only if it matches, is unexpired, and has
  not exceeded the maximum attempt count; otherwise it MUST reject the attempt.
- **FR-007a**: On successful verification, the system MUST set the user's `verified` flag to
  true (server-side).
- **FR-008**: The system MUST enforce a resend cooldown and a per-email rate limit on code
  requests.
- **FR-009**: The customer MUST NOT be able to proceed to payment unless their email was
  verified **fresh for the current checkout**; the verified state MUST be read server-side,
  never from a client-reported flag. Verification is per-checkout (see Clarifications
  2026-08-04): issuing a new code resets it, and creating the payment intent consumes it, so
  each purchase requires its own OTP and a stale verification cannot authorize a later payment.
- **FR-010**: The system MUST NOT create passwords or a login/authentication mechanism; the
  `users` record is a passwordless contact record. The `verified` flag does NOT persist as a
  standing payment authorization across checkouts — it authorizes at most one payment intent
  within a short freshness window and is then consumed (no account login is implied).

#### Payment provider abstraction (US3)

- **FR-011**: The system MUST expose a provider-agnostic payment interface offering at least two
  operations: create a payment intent (from amount, currency, and order reference) and verify a
  payment's status (from a provider payment reference).
- **FR-012**: The concrete provider MUST be selected via a factory/registry so that adding a new
  provider requires only a new adapter and its registration — no changes to calling code
  (Strategy/Factory/Adapter).
- **FR-013**: The abstraction MUST return normalized results and a normalized payment status
  vocabulary (pending / success / failed / refunded) consistent with the data foundation, and
  MUST NOT expose provider-specific types to callers.
- **FR-014**: Payment status MUST be derived from the provider (server-side verification), never
  trusted from client input, consistent with the project's payment-integrity principle.
- **FR-015**: When a verified user proceeds to pay, the system MUST create the order linked to
  that user via a foreign key (`orders.user_id`) using a server-set amount and currency (never a
  client-supplied price), then link the resulting provider payment reference to that order,
  reusing the order rather than creating a duplicate on retry.
- **FR-016**: The payment module MUST be isolated (server-side) so the specific provider (Stripe)
  can be replaced or supplemented with minimal changes.
- **FR-016a**: The `orders` table MUST relate to the `users` table by a foreign key
  (`orders.user_id`); customer contact (email, WhatsApp) lives on `users`, not on `orders`.

#### Cross-cutting

- **FR-017**: All secrets required by this feature (SendGrid API key, Stripe secret key) MUST be
  read only on the server from environment variables, MUST live only in `.env.local`, and MUST
  NOT carry a `NEXT_PUBLIC_` prefix.
- **FR-018**: All external inputs (contact form, OTP code, payment-intent request) MUST be
  validated server-side with schema validation before use.

### Key Entities *(include if feature involves data)*

- **User**: A passwordless customer contact record (NOT an authenticated account). Attributes:
  id; email (unique); WhatsApp number; `verified` boolean + `verified_at` timestamp — a
  **per-checkout** verification, not a standing credential (reset when a new code is issued,
  consumed on payment-intent creation, honored only while fresh; see Clarifications 2026-08-04);
  plus the transient fields needed to check a submitted code — a non-recoverable representation
  of the current code, its expiry, and an attempt count (cleared once verified);
  created/updated timestamps. One user relates to zero-or-more orders.
- **Order** (from feature 001, amended here): now relates to a `User` via `user_id` (foreign
  key); customer contact (email, WhatsApp) moves off `orders` and onto `users`. All other order
  fields (amount, currency, payment status, payment reference, fulfillment, timestamps) are
  unchanged.
- **Payment Intent (abstraction view)**: A normalized representation of a provider payment.
  Attributes: amount (minor units); currency; order reference; provider payment reference;
  client secret (for the front-end confirmation step, handled later); normalized status. Maps
  onto the `Order` record's payment reference and status from the data foundation.
- **Payment Provider Adapter**: An implementation of the payment interface for one provider
  (Stripe for MVP), selected by the factory/registry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The landing page reaches interactivity quickly on a typical mobile connection
  (target: largest contentful paint under ~2.5s on a mid-tier mobile device).
- **SC-002**: 100% of landing-page visitors who activate the primary purchase CTA arrive at the
  checkout step (no dead-end CTA).
- **SC-003**: A verification email is dispatched within a few seconds of a valid contact
  submission (target: send accepted by the email provider in under 5 seconds for 95% of
  requests).
- **SC-004**: 100% of proceed-to-payment transitions are backed by a server-verified email; zero
  can be reached with an unverified or client-asserted verification.
- **SC-005**: Expired or incorrect codes are rejected in 100% of cases, and the attempt/rate
  limits demonstrably block brute-force and resend-flood attempts.
- **SC-006**: A caller can create and verify a payment entirely through the abstraction without
  referencing any provider-specific type (verifiable by the calling code's imports).
- **SC-007**: Adding a hypothetical second provider requires changes only to a new adapter plus
  its registration — zero edits to existing caller code (demonstrated by a design walkthrough or
  a stub adapter test).

## Assumptions

- **Landing already implemented**: The landing experience for "The Field Microscope" (brand
  "Field Notes", AUD 89, Australia) already exists as a scroll-driven, single-product page with
  hero, premise, discovery specimens, instrument detail, field-report social proof, offer, and
  footer, including a 3D product scene. This spec documents it and covers only wiring its primary
  purchase CTA into checkout (its CTAs currently point to a placeholder link).
- **Email delivery**: Email OTP is sent via **SendGrid**, requiring a server-only
  `SENDGRID_API_KEY` and a verified sender identity. Delivery to the customer's inbox depends on
  SendGrid and is outside the system's guaranteed control (measured at "send accepted").
- **OTP policy defaults** (informed defaults, adjustable): 6-digit numeric code; 10-minute
  expiry; maximum 5 verification attempts per code; 60-second resend cooldown with a per-email
  daily cap. Codes are stored hashed, never in plaintext.
- **Single currency**: The store transacts in AUD (matching the landing offer), stored per order
  in the data foundation.
- **First payment provider**: Stripe, using the Payment Intents workflow per the constitution;
  the abstraction defines a neutral seam but ships only the Stripe adapter for MVP.
- **Payment UI is separate**: The client-side payment page/confirmation and Stripe webhook
  handling are separate later specs; this spec provides the abstraction (create-intent + verify)
  and its Stripe adapter that those specs consume.
- **Builds on the data foundation**: Orders, the payment-status vocabulary, and the server-only
  data-access layer from feature `001-data-payment-foundation` are assumed present and are reused
  (order creation, linking a payment reference, and status updates).
- **Amends the 001 orders schema**: introducing the `users` table moves customer contact (email,
  WhatsApp) off `orders` and adds `orders.user_id` (FK → `users.id`). Because 001's migration
  has not been applied to a live database yet, this is a schema revision to 001 (drop the inline
  `email`/`whatsapp` columns, add `user_id`) plus a new `users` table and migration, done as part
  of this feature's foundational work. 001's PII-anonymization requirement (FR-013) now targets
  the `users` record's contact fields while the order's financial record stays intact.
- **Server-authoritative price**: the payable amount (AUD 89) is fixed on the server (config/
  product constant); the client never supplies or influences the charged amount.

## Dependencies

- **001-data-payment-foundation**: order record of truth, payment-status vocabulary, and the
  server-only data-access layer (this feature creates/links/updates orders through it).
- **SendGrid**: transactional email delivery for the OTP (server-only API key, verified sender).
- **Stripe**: first payment provider (Payment Intents), integrated behind the abstraction.
- Not included here (separate later specs): the customer-facing payment page/confirmation UI,
  Stripe webhook & order-sync, the success page, and the admin dashboard.
