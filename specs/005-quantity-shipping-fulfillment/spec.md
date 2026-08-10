# Feature Specification: Quantity, Shipping Address & Semi-Automated Fulfillment

**Feature Branch**: `005-quantity-shipping-fulfillment`
**Created**: 2026-08-09
**Status**: Draft
**Input**: User edits to the 003 payment flow — (1) let a customer buy more than one unit of
the product via a +/− quantity stepper; (2) collect where to ship the physical product so the
admin can order it from a third-party supplier (Alibaba/AliExpress) and have it delivered to
the customer; (3) make the shipping address trustworthy (validated / "a real place") and shaped
to match the supplier's order form. Enabled by constitution **v2.0.0** (Single-Product Focus),
which permits multiple units, physical shipping-address collection, and semi-automated,
**human-placed** supplier fulfillment.

## Overview

Features 001–004 sell exactly one unit of one product to a customer identified only by email +
WhatsApp, with no physical destination — the order carries `amount`/`currency` and payment
state but nothing about *how many* or *where to ship*. This feature makes the store sell a
**physical good in quantity**:

1. **Quantity** — the customer chooses how many units to buy (a +/− stepper, integer ≥ 1, no
   upper cap). The price is re-computed **server-side** as `unit price × quantity`; quantity is
   the only client-supplied input that affects the amount, and it can never set the amount
   directly.
2. **Shipping address** — the customer provides a structured recipient address, validated for
   deliverability (address-validation API + server-side Zod), stored as PII.
3. **Semi-automated fulfillment** — after a verified `success`, the order appears in the admin
   with a **copy-ready fulfillment panel**: the shipping address laid out field-for-field in the
   shape the supplier's order form expects, so the admin places the supplier order **manually**
   and records the returned supplier order/tracking reference. The application never calls a
   supplier API.

The money-integrity guarantees of 003 are preserved unchanged: payment outcome is trusted only
from the provider, server-side, idempotently. The webhook's amount check (`event.amount ===
order.amount`) still holds because `order.amount` is now `unit × quantity`, still server-set.

## Clarifications

### Session 2026-08-09

- Q: Is there a maximum quantity? → A: **No upper cap.** Quantity MUST be a positive integer
  (≥ 1); the server rejects zero, negative, and non-integer values and always re-prices from the
  server-held unit price. The payment provider's per-transaction maximum is the only ceiling.
- Q: What does "semi-automated" supplier fulfillment mean for the MVP? → A: The admin panel
  **collects and formats** the paid order's shipping data for easy copying; the **admin manually
  enters it into the Alibaba/AliExpress website** to place the real order. The application does
  **not** integrate a supplier ordering API and does **not** place orders automatically. Auto
  placement would be a further constitution amendment.
- Q: How is "a real place" guaranteed? → A: It cannot be guaranteed with certainty, so
  confidence is raised in layers: an **address-validation API** verifies deliverability and
  returns a normalized address at input time; **server-side Zod** re-validates structure,
  required fields, a ships-to **country allow-list**, and per-country postal format; the
  normalized address (never the raw client claim alone) is what is stored and shown for
  fulfillment.
- Q: What does "sync with the Alibaba form" mean? → A: The address is stored in the **structured
  shape supplier order forms use** (recipient name, phone, ISO-3166 country, state/province,
  city, line 1, line 2, postal code) so the fulfillment panel maps field-for-field to the
  supplier form. It is a **presentation/data-shape** contract, not a live integration.
- Q: Where does the shipping address semantically belong — the order or the customer? → A: A
  **per-order snapshot**. The address is captured with the order at purchase time and is
  immutable thereafter (like `amount`/`quantity`); a later customer edit or PII erasure never
  rewrites what a past order shipped to. It is NOT a single mutable "current address" on `users`.
- Q: Is the shipping recipient's phone a new field or the existing contact number? → A: **Reuse
  the customer's existing (verified) WhatsApp number** as the recipient/courier phone — there is
  **no separate phone field** in the address form. The value is captured into the per-order
  shipping snapshot at purchase (so it stays immutable with the order, consistent with the
  address snapshot) and shown as the phone in the fulfillment panel.
- Q: (Revision) Should address validation call a paid external API? → A: **No — Zod-only.**
  Dropped the external address-validation/deliverability API to avoid per-call cost. Validation
  is now **structural Zod** (required fields, length bounds) + **ships-to allow-list** + **per-country
  postal format** + **deterministic normalization** (trim, uppercase country/postal). Because the
  supplier order is placed **manually** from the copy-ready panel, exact field-shape sync with the
  supplier form matters more than automated deliverability. The checkout form, Zod schema, stored
  snapshot, and admin fulfillment panel are all driven by **one canonical AliExpress/Alibaba field
  mapping** (`ADDRESS_FIELDS`) so they cannot drift; a drift is caught by a unit test.
- Q: Where does the quantity stepper live, and when is quantity locked? → A: **On the payment
  step, beside the card entry.** Because the payment intent already exists by then, a quantity
  change **re-prices the existing *unconfirmed* PaymentIntent and its pending order** to
  `unit × new quantity`, recomputed **server-side** via a dedicated update path (through the
  payment abstraction). A confirmed/succeeded intent is **never** re-priced, and the stepper is
  disabled during confirmation. The 003 webhook amount check still holds because the order amount
  is updated in lockstep with the intent amount.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Customer buys multiple units with a quantity stepper (Priority: P1)

A customer on the **payment step** (beside the card entry) chooses how many units of the product
to buy using a + / − stepper (defaulting to 1). The displayed line total updates as they change
the quantity, and the amount they are actually charged is set by the server from that quantity —
never by the client. Because the payment intent already exists on this step, changing the
quantity re-prices the existing unconfirmed intent server-side before confirmation.

**Why this priority**: Multi-unit purchase is the headline capability this feature adds and it
directly increases order value; without it the store is still single-unit.

**Independent Test**: On the payment step, increase quantity to 3 with the stepper, observe the
shown total become `3 × unit` and the intent/order re-price to `3 × unit` server-side; confirm
payment and confirm the charged and stored `amount` equal `3 × unit`; attempt to submit quantity
`0`, `-1`, `2.5`, or a forged amount and confirm each is rejected server-side; attempt to change
quantity after confirmation has started and confirm it is refused.

**Acceptance Scenarios**:

1. **Given** the payment step, **When** the customer presses + / −, **Then** the quantity changes
   by one (never below 1) and the displayed line total updates to `unit × quantity`.
2. **Given** a quantity change on the payment step (intent already exists), **When** it is
   applied, **Then** the server re-prices the existing **unconfirmed** PaymentIntent and its
   pending order to `amount = unit price × quantity` computed **server-side**, and the client-sent
   quantity is the only quantity input the server trusts.
3. **Given** a request carrying a non-integer, zero, or negative quantity (or a client-supplied
   amount), **When** the server processes it, **Then** it is rejected with a validation error and
   neither the order nor the intent is re-priced or created.
4. **Given** a valid quantity, **When** the payment succeeds and the webhook arrives, **Then**
   the webhook's amount check still passes because `order.amount = unit × quantity`, and the
   order is marked `success` exactly as in 003.
5. **Given** a PaymentIntent that is already confirmed/succeeded, **When** a quantity change is
   attempted, **Then** the re-pricing is refused (the intent is never re-priced) and the stepper
   is disabled during confirmation.

---

### User Story 2 - Customer provides a validated shipping address (Priority: P1)

Before paying, the customer enters the recipient's shipping address in structured fields. As
they enter it, an address-validation step confirms the address is real/deliverable and
normalizes it; the server re-validates it. The order cannot proceed to payment without a valid
address, and the stored address is the normalized one.

**Why this priority**: A physical product cannot be fulfilled without a real destination; a
wrong or fake address means a lost shipment and an unfulfillable order. It is a payment
prerequisite, hence P1.

**Independent Test**: Enter a well-formed, real address and confirm it validates and payment
proceeds; enter a nonsense/undeliverable address and confirm it is rejected with a clear
message and payment is blocked; submit a structurally invalid address directly to the server
(bypassing the client) and confirm server-side Zod rejects it; confirm the address persisted is
the API-normalized form.

**Acceptance Scenarios**:

1. **Given** the checkout address form, **When** the customer enters a complete address, **Then**
   the address-validation API confirms deliverability and returns a normalized address, and the
   customer may proceed.
2. **Given** an undeliverable, incomplete, or unrecognized address, **When** validation runs,
   **Then** a clear, non-technical message is shown, the address is not accepted, and payment is
   blocked until a valid address is provided.
3. **Given** a country not on the ships-to allow-list, **When** the customer selects it, **Then**
   the address is rejected as not shippable with a clear message.
4. **Given** a request that reaches the server with a structurally invalid or unvalidated
   address (client bypassed), **When** the server processes it, **Then** server-side Zod rejects
   it and no intent/order is created.
5. **Given** a successfully validated address, **When** the order is created, **Then** the
   **normalized** address (not the raw client string) is stored, as PII, server-side only.

---

### User Story 3 - Admin fulfills a paid order via a copy-ready supplier panel (Priority: P2)

After an order is verified `success`, the admin opens it in the dashboard and sees a fulfillment
panel that presents the shipping address and quantity field-for-field in the shape the supplier
(Alibaba/AliExpress) order form expects, with per-field copy controls. The admin places the
order on the supplier's website manually, then records the supplier order/tracking reference and
marks the order fulfilled.

**Why this priority**: Fulfillment closes the loop, but the money is already captured by
003; a manual step here does not risk revenue, so P2. It is the deliberate MVP boundary
(human-placed, no supplier API).

**Independent Test**: For a paid order, open the admin detail, confirm the fulfillment panel
shows the normalized address + quantity in supplier-form field order with copy controls; copy a
field and confirm the exact normalized value is copied; record a supplier reference and mark
fulfilled, and confirm both persist and the existing `fulfilled`-requires-paid rule (001/004)
still holds.

**Acceptance Scenarios**:

1. **Given** a `success` order with a stored address, **When** the admin opens its detail,
   **Then** the fulfillment panel shows recipient name, phone, country, state/province, city,
   line 1, line 2, postal code, and quantity, each individually copyable, matching the supplier
   form's field order.
2. **Given** the panel, **When** the admin copies a field (or "copy all"), **Then** the copied
   text is exactly the stored normalized value(s), safe to paste into the supplier form.
3. **Given** the admin has placed the supplier order manually, **When** they record the returned
   supplier order/tracking reference and mark the order fulfilled, **Then** both persist and
   `fulfilled = true` is permitted only because `payment_status ∈ ('success','refunded')`
   (existing invariant).
4. **Given** an unpaid (`pending`/`failed`) order, **When** the admin views it, **Then** the
   fulfillment panel does not offer placement/fulfillment (nothing to ship yet).

### Edge Cases

#### Quantity

- **Quantity below 1 / zero / negative / non-integer / NaN** → rejected server-side; re-priced
  from unit price; no order created.
- **Client-supplied amount in the request** → ignored; the server computes `unit × quantity`
  (unchanged 003/002 rule, now parameterized by quantity).
- **Very large quantity** → accepted as an integer, but the resulting amount is subject to the
  payment provider's per-transaction maximum; if the provider rejects the intent, the customer
  sees a recoverable error (no partial order left `success`).
- **Quantity changed on the payment step** (after the intent exists) → the existing **unconfirmed**
  PaymentIntent and pending order are re-priced server-side to `unit × new quantity`; a
  confirmed/succeeded intent is never re-priced (the stepper is disabled during confirmation), so
  the charged amount always matches the final quantity.
- **Quantity-change / confirm race** (a re-price request and a card confirmation overlap) → the
  re-price is refused once confirmation has begun; the amount that confirms is the last
  server-applied `unit × quantity`, and 003's amount check flags any residual mismatch rather than
  marking `success`.
- **Stepper spam / rapid clicks** → debounced/clamped in the UI; server is the price authority
  regardless.

#### Shipping address

- **Undeliverable / unrecognized address** → rejected with a clear message; payment blocked.
- **Address-validation API unavailable / times out** → the flow degrades safely: it does not
  silently accept an unvalidated address as "verified"; it either retries, or blocks with a
  "couldn't verify address, try again" message rather than proceeding on an unverified address.
  (Server-side Zod structural validation still applies as a floor.)
- **Country outside the ships-to allow-list** → rejected as not shippable.
- **Postal code inconsistent with country** → rejected by per-country format validation.
- **Address contains injection / oversized input** → length-bounded and sanitized by Zod; never
  rendered unsafely in the admin panel.
- **Normalized address differs from what the customer typed** → the normalized form is what is
  stored and shown for fulfillment (the deliverable form).
- **PII erasure later** (existing anonymization story) → address columns are nullable so they can
  be cleared while retaining the financial record, matching email/WhatsApp handling.

#### Fulfillment

- **Admin views a paid order with a missing/partial address** (e.g. legacy order created before
  this feature) → the panel clearly indicates the address is unavailable rather than showing
  blanks that could be mis-pasted.
- **Copy on an unsupported clipboard context** → a visible fallback (selectable text) so the
  admin can still copy manually.
- **Recording a supplier reference twice / editing it** → idempotent/overwritable per the admin
  data rules; recording it does not itself change payment status (fulfillment ≠ payment).
- **Refund after fulfillment** → unchanged from 004: a refund does not reverse fulfillment; the
  panel reflects current state.

## Requirements *(mandatory)*

### Functional Requirements

#### Quantity (US1)

- **FR-001**: The **payment step** (beside the card entry) MUST provide a quantity selector
  (+ / − stepper) defaulting to 1, that never lets the displayed quantity fall below 1, and that
  shows a live line total of `unit price × quantity`.
- **FR-002**: The server MUST compute the order and payment-intent `amount` as `unit price ×
  quantity` using the server-held unit price; it MUST NOT accept a client-supplied amount.
- **FR-002a**: When the customer changes quantity on the payment step (the intent already
  exists), the server MUST re-price the existing **unconfirmed** PaymentIntent and its pending
  order to `unit price × new quantity` (recomputed server-side, via the payment abstraction),
  re-validating the new quantity. It MUST refuse re-pricing once the intent is confirmed or
  succeeded, and the UI MUST disable quantity changes during confirmation. The order `amount` and
  the intent `amount` MUST always move in lockstep so the 003 amount check never sees a
  self-inflicted mismatch.
- **FR-003**: The server MUST validate quantity as a **positive integer (≥ 1)** with **no upper
  cap**, rejecting zero, negative, non-integer, and non-numeric values before any order or intent
  is created.
- **FR-004**: The order record MUST persist the purchased `quantity` alongside the computed
  `amount`, so the amount is auditable as `unit × quantity`.
- **FR-005**: The webhook/confirmation amount verification (003, FR-013) MUST continue to compare
  the provider event amount against the order's server-set `amount` (now `unit × quantity`) with
  no weakening of the mismatch-flagging behavior.

#### Shipping address (US2)

- **FR-006**: The checkout flow MUST collect a **structured** shipping address: recipient name,
  country (ISO-3166), state/province, city, address line 1, optional line 2, and postal code. The
  recipient/courier **phone is NOT separately collected** — the customer's existing verified
  WhatsApp number is used as the shipping phone and captured into the per-order snapshot at
  purchase (immutable with the order, consistent with the address).
- **FR-007**: The system MUST normalize the validated address **deterministically** (trim,
  uppercase ISO country, clean postal code) and store the **normalized** values as the snapshot.
  Validation is **Zod-only** — there is no external deliverability provider (revision 2026-08-09).
- **FR-008**: The server MUST validate the address with **Zod** (required fields, country on a
  configured ships-to allow-list, per-country postal-code format, length bounds) and MUST reject
  invalid addresses regardless of any client-side validation.
- **FR-009**: The flow MUST NOT allow payment to proceed without a valid shipping address (Zod +
  allow-list + postal); an invalid or out-of-allow-list address MUST block intent creation.
- **FR-010**: The address form, Zod schema, stored snapshot, and admin fulfillment panel MUST all
  derive from **one canonical AliExpress/Alibaba field mapping** (fields, order, labels, supplier
  field names) so they cannot drift; the customer-entered form fields MUST equal the schema keys
  (enforced by a unit test). The recipient phone is the customer's WhatsApp number (not a form
  field).
- **FR-011**: The shipping address MUST be stored as PII on the server only (RLS, no anon
  access), reusing the existing contact-data handling, and MUST be **nullable** so it can be
  anonymized later while retaining the order's financial record.

#### Semi-automated fulfillment (US3)

- **FR-012**: The admin order detail MUST present a **fulfillment panel** for `success`/paid
  orders that shows the normalized shipping address and quantity **field-for-field in the order a
  supplier order form expects**, with per-field copy controls and a "copy all" affordance.
- **FR-013**: The copied values MUST be exactly the stored normalized address/quantity values,
  suitable for pasting into the supplier's website form without transformation.
- **FR-014**: The system MUST let the admin record a **supplier order / tracking reference** on a
  fulfilled order and persist it; recording it MUST NOT by itself change `payment_status`
  (fulfillment and payment stay independent, per 001/004).
- **FR-015**: The application MUST NOT call any supplier ordering API and MUST NOT place supplier
  orders automatically; supplier order placement is a manual admin action (constitution v2.0.0).
- **FR-016**: The fulfillment panel MUST only offer placement/fulfillment for orders whose
  `payment_status` permits fulfillment (existing `fulfilled` ⇒ paid invariant), and MUST clearly
  indicate when an address is missing rather than showing blank/mis-pasteable fields.

#### Cross-cutting

- **FR-017**: All new client inputs (quantity, address) MUST be validated server-side with Zod
  before use (constitution Principle IV); client-side validation is UX only.
- **FR-018**: Server-only provider credentials (address-validation API key) MUST be read from
  environment variables, MUST live only in server code, and MUST NOT be exposed to the client.
  Any client-exposed key (if the provider's autocomplete widget requires one) MUST be limited to
  that role, matching the Stripe publishable-key precedent.

### Key Entities *(include if feature involves data)*

- **Order** (from 001/002, extended): gains **`quantity`** (positive integer ≥ 1) so `amount =
  unit price × quantity` is auditable; may gain a **supplier fulfillment reference** (order/
  tracking id recorded by the admin). Payment-integrity columns and rules are unchanged.
- **Shipping Address** (new PII): the structured, normalized recipient address for a purchase —
  recipient name, ISO country, state/province, city, line 1, line 2, postal code, plus a recipient
  phone **sourced from the customer's WhatsApp number** (captured into the snapshot, not separately
  entered). Stored as a **per-order snapshot** (bound to the order, immutable after purchase — NOT
  a mutable current address on `users`), server-only under RLS, nullable for later anonymization.
  (Physical placement — a column group on `orders` vs a dedicated per-order `shipping_addresses`
  table — is a plan/data-model concern; the per-order snapshot *semantics* are fixed here.)
- **Product unit price** (config, from 002): the single server-held unit price; `amount` is
  always derived from it × quantity, never from the client.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For 100% of orders, the charged `amount` equals `server unit price × quantity`; no
  order is ever created at a client-supplied amount, verified by attempting amount tampering.
- **SC-002**: 100% of quantity values that are zero, negative, non-integer, or non-numeric are
  rejected server-side with no order/intent created.
- **SC-003**: 100% of orders that reach `success` have a stored, previously-validated shipping
  address; zero paid orders exist with no destination.
- **SC-004**: 100% of undeliverable/invalid addresses and out-of-allow-list countries are blocked
  before payment; an address-validation outage never results in an order stored as
  address-verified.
- **SC-005**: In the admin fulfillment panel, copied field values match the stored normalized
  address exactly (byte-for-byte) so a supplier order can be placed by paste with zero manual
  retyping of address fields.
- **SC-006**: The 003 webhook amount-mismatch guard still flags 100% of amount/currency
  mismatches with the quantity-derived amount in place (no regression).

## Assumptions

- **Builds on 001–004**: the `orders` record + idempotent status transitions (001), the
  checkout/OTP/create-intent flow and server-authoritative pricing (002), the payment-confirm +
  webhook order-sync (003), and the admin order detail/fulfillment surface (004) are present and
  reused; this feature extends them.
- **One product, many units**: still exactly one product (constitution v2.0.0); quantity is
  units of that one product, not a multi-product cart.
- **Manual supplier placement (MVP)**: the admin places supplier orders on Alibaba/AliExpress by
  hand from the copy-ready panel; there is no supplier API integration and no automated ordering.
  "Sync with the Alibaba form" means the stored address matches the supplier form's field shape,
  not a live connection.
- **Address validation provider**: a third-party address-validation/deliverability API (e.g. a
  Google Address Validation-class service) verifies and normalizes addresses; its key is
  server-only (a client widget key, if needed, is the only client-exposed value).
- **Ships-to allow-list**: a configured set of countries the supplier can ship to; addresses
  outside it are rejected. The specific list is a config/plan detail.
- **Currency unchanged**: pricing stays in the existing currency (AUD); quantity scales the
  amount, not the currency.
- **PII handling reused**: the shipping address follows the same server-only, RLS, nullable-for-
  anonymization handling as the existing email/WhatsApp contact data.

## Dependencies

- **001-data-payment-foundation**: order record, amount/currency, idempotent status transitions,
  server-only data-access + RLS, the `fulfilled` ⇒ paid invariant.
- **002-storefront-checkout-payments**: server-authoritative unit price, the checkout page, the
  create-intent endpoint, the OTP/verified gate.
- **003-payment-webhook-success**: the payment-confirm surface (quantity lives here), the webhook
  order-sync, and its amount-mismatch guard (reused with the quantity-derived amount).
- **004-admin-dashboard-analytics**: the admin order detail + `fulfilled` flow that the copy-ready
  fulfillment panel and supplier-reference recording extend.
- **Constitution v2.0.0**: the amendment permitting multiple units, physical shipping-address
  collection, and semi-automated human-placed supplier fulfillment.
- **Address-validation provider**: an external deliverability/normalization API (server-side key).

## Out of Scope

- **Automated supplier ordering** via an AliExpress/Alibaba (or any) order-placement API — placing
  supplier orders programmatically. Remains excluded by the constitution; MVP is human-placed.
- **A multi-product shopping cart / multiple products / inventory management** — still excluded.
- **Per-unit shipping cost / tax calculation** — pricing is `unit × quantity` only; shipping/tax
  modeling is not introduced here.
- **Live order/tracking sync from the supplier** back into the store — the supplier reference is
  admin-recorded free text, not a fetched status.
- **Full PII-erasure tooling** — this feature only ensures address columns are nullable/compatible
  with the existing anonymization story; the erasure workflow itself is unchanged.
