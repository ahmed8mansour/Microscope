# Feature Specification: Data & Payment Foundation

**Feature Branch**: `001-data-payment-foundation`
**Created**: 2026-07-31
**Status**: Draft
**Input**: User description: "Data and payment foundation: orders record of truth, payment status model, and shared foundations for the single-product store (spec #1 from the session's specs-suggestions table)."

## Clarifications

### Session 2026-07-31

- Q: How should "Fulfilled" be modeled relative to payment status? → A: Payment status is money-lifecycle only (Pending / Success / Failed); fulfillment is a separate boolean. A "Fulfilled" order = Success + fulfilled = true.
- Q: On a payment retry after a failed attempt (new payment reference), reuse the order or create a new one? → A: Reuse the existing order record — update its payment reference and status to the latest attempt. One record per purchase.
- Q: How should customer contact PII (email, WhatsApp) be retained and handled? → A: Retain for the order's lifetime; support manual per-order PII deletion/anonymization on request; no automatic expiry.
- Q: Should post-success reversals (refunds/chargebacks) be representable in the status vocabulary? → A: Add a `Refunded` payment status now (Pending / Success / Failed / Refunded); reconciliation excludes refunded amounts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Every purchase becomes one authoritative order record (Priority: P1)

When a customer attempts a purchase, the business needs a single, durable record that
captures who they are, how much they paid, and where that payment stands. This record is
the source of truth the business reconciles against the payment provider — not the
customer's browser or any screen they saw.

**Why this priority**: Without a reliable order record, no other part of the store can
function — the dashboard has nothing to show, fulfillment has nothing to act on, and
revenue cannot be reconciled. This is the bedrock every later feature depends on.

**Independent Test**: Create an order record for a purchase attempt, then retrieve it and
confirm it holds the customer contact details, amount, currency, payment status, and a
unique reference to the underlying payment. Delivers value because the business now has a
verifiable, queryable record of the sale.

**Acceptance Scenarios**:

1. **Given** a customer begins a purchase, **When** an order record is created, **Then** it
   stores the customer email, WhatsApp number, amount, currency, an initial payment status
   of Pending, a fulfillment state of not-fulfilled, and creation/update timestamps.
2. **Given** an existing order record, **When** it is retrieved by its unique identifier,
   **Then** all stored fields are returned exactly as last saved.
3. **Given** a payment outcome is confirmed by the provider, **When** the order's payment
   status is updated, **Then** the update timestamp advances and the new status is durably
   stored.

---

### User Story 2 - Payment lifecycle is represented as distinct, unambiguous states (Priority: P1)

The business must always be able to tell a paid order from a failed one, and a paid order
that still needs supplier fulfillment from one that is fully complete. The record must
express these states in a fixed, well-defined vocabulary so reporting and operations are
consistent.

**Why this priority**: Money decisions depend on unambiguous state. Confusing "paid but not
yet fulfilled" with "failed" would mean either lost revenue or shipping against a failed
payment. The state model must be locked down before payment or dashboard work builds on it.

**Independent Test**: Move a record through each allowed state transition and confirm that
only the defined states are accepted and that fulfillment is tracked separately from
payment outcome. Delivers value because every downstream report can rely on a consistent
state vocabulary.

**Acceptance Scenarios**:

1. **Given** an order record, **When** its payment status is set, **Then** the value MUST be
   exactly one of the allowed states and any other value is rejected.
2. **Given** a payment that succeeds, **When** the provider confirms it, **Then** the record
   reflects a successful payment while remaining not-fulfilled until the business acts.
3. **Given** a successfully paid order, **When** the business completes supplier fulfillment,
   **Then** the record reflects a fulfilled state without altering the fact that the payment
   itself succeeded.
4. **Given** a payment that fails or is canceled, **When** the provider reports the outcome,
   **Then** the record reflects a failed payment and cannot be marked fulfilled.
5. **Given** a successfully paid order, **When** the payment is later refunded at the
   provider, **Then** the record reflects a refunded payment and its amount is excluded from
   reconciled revenue.

---

### User Story 3 - Duplicate payment events never create duplicate orders (Priority: P2)

Payment providers deliver notifications that can arrive more than once. The record system
must ensure that repeated notifications about the same payment resolve to the same single
order record rather than creating duplicates.

**Why this priority**: Duplicate orders corrupt revenue totals and could trigger duplicate
fulfillment. Guaranteeing one-record-per-payment at the data layer is what makes safe,
idempotent payment handling possible later.

**Independent Test**: Reference the same underlying payment twice and confirm exactly one
order record exists for it. Delivers value because revenue counts and fulfillment stay
correct even when notifications repeat.

**Acceptance Scenarios**:

1. **Given** an order tied to a specific payment reference, **When** a second creation is
   attempted with the same payment reference, **Then** the system resolves to the existing
   record instead of creating a new one.
2. **Given** repeated payment-outcome notifications for one payment, **When** each is
   applied, **Then** the order's final state is the same as if a single notification had
   been applied.

---

### Edge Cases

- What happens when an order-creation attempt supplies an invalid or unsupported payment
  status value? → It MUST be rejected; only the defined states are permitted.
- What happens when a fulfillment update is attempted on an order whose payment did not
  succeed? → It MUST be rejected; fulfillment is only valid on a successfully paid order.
- What happens when required contact details (email, WhatsApp) are missing at record
  creation? → Creation MUST be rejected with a clear validation error.
- What happens when two creation attempts race for the same payment reference? → Exactly one
  record MUST result; the second resolves to the first.
- What happens when the amount or currency is missing or malformed? → Creation MUST be
  rejected.
- What happens when a customer retries after a failed payment? → The existing order record
  is reused and updated to the latest attempt's reference and status; no new record is
  created (FR-007a).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST persist an order record for each purchase, and that record MUST be
  the authoritative source of order and payment state (never a client-reported value).
- **FR-002**: Each order record MUST capture: customer email, WhatsApp number, payment
  amount, currency, payment status, fulfillment state, payment-provider payment reference,
  payment receipt reference, an optional payment-provider customer reference, free-form
  internal notes, and creation and last-updated timestamps.
- **FR-003**: Each order record MUST be uniquely and stably identifiable independent of any
  provider-supplied reference.
- **FR-004**: Payment status MUST be constrained to exactly the defined set: Pending,
  Success, Failed, and Refunded; any other value MUST be rejected.
- **FR-005**: Fulfillment state MUST be tracked independently of payment status, so that a
  successfully paid order can be either awaiting fulfillment or fulfilled.
- **FR-006**: System MUST reject marking an order as fulfilled unless its payment status is
  Success.
- **FR-007**: The payment-provider payment reference MUST be unique across order records at
  any point in time, so that repeated notifications about one payment resolve to a single
  record.
- **FR-007a**: When a customer retries payment after a failed attempt (yielding a new
  payment reference), the system MUST reuse the existing order record for that purchase —
  updating its payment reference and payment status to reflect the latest attempt — rather
  than creating an additional record. The result is one order record per purchase regardless
  of retry count.
- **FR-008**: System MUST record the creation timestamp once and advance the last-updated
  timestamp on every change to a record.
- **FR-009**: System MUST reject creation of an order record when any required field (email,
  WhatsApp number, amount, currency) is missing or malformed.
- **FR-010**: System MUST allow retrieval of an order record by its unique identifier and by
  its payment-provider payment reference.
- **FR-011**: Amount MUST be stored in a precise, non-lossy form suitable for financial
  reconciliation (no rounding drift).
- **FR-012**: System MUST allow internal notes to be added to or updated on an order record
  without affecting payment or fulfillment state.
- **FR-013**: System MUST retain customer contact data (email, WhatsApp number) for the
  lifetime of the order record with no automatic expiry, and MUST support deleting or
  anonymizing an individual order's contact data on request without deleting the order's
  financial record (amount, currency, payment status, payment reference, timestamps).

### Key Entities *(include if feature involves data)*

- **Order**: The authoritative record of a single purchase for the single product. Key
  attributes: unique identifier; customer email; customer WhatsApp number; payment amount;
  currency; payment status (Pending / Success / Failed / Refunded); fulfillment state
  (not-fulfilled / fulfilled); payment-provider payment reference (unique); payment receipt
  reference; optional payment-provider customer reference; internal notes; created-at
  timestamp; updated-at timestamp. An Order is created at purchase start and updated as
  payment and fulfillment progress.
- **Payment Status**: The controlled vocabulary describing where a payment stands — Pending
  (initiated, unconfirmed), Success (completed), Failed (failed or canceled), Refunded
  (previously successful, then reversed at the provider). "Fulfilled" is NOT a payment
  status; it is a business-level state expressed through the fulfillment attribute on a
  Success order (see Assumptions).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of purchase attempts that reach payment confirmation result in exactly one
  order record — no missing records and no duplicates.
- **SC-002**: 100% of stored order records carry a payment status drawn only from the defined
  set; zero records exist with an out-of-vocabulary status.
- **SC-003**: Repeated notifications for the same payment (up to at least 5 repeats) always
  resolve to a single order record with a single final state.
- **SC-004**: Any order record can be located by its unique identifier or its payment
  reference in a single lookup.
- **SC-005**: Zero orders can be recorded as fulfilled while their payment status is anything
  other than Success.
- **SC-006**: Net revenue reconciled from stored order records (Success amounts minus
  Refunded amounts) matches the payment provider's reported net totals to the exact
  minor-unit amount across a test set of transactions.
- **SC-007**: A per-order PII deletion/anonymization request removes or masks the customer's
  email and WhatsApp number in 100% of cases while leaving the order's financial record
  (amount, currency, payment status, payment reference, timestamps) intact and reconcilable.

## Assumptions

- **Fulfillment modeling** (confirmed — see Clarifications 2026-07-31): The source material
  lists "Fulfilled" both as a payment status and as a separate boolean field. This spec
  resolves that overlap by treating payment status as the money-lifecycle only (Pending /
  Success / Failed) and modeling fulfillment as a separate boolean state on a successfully
  paid order. A "Fulfilled" order is therefore a Success order with fulfillment = true.
- **Single currency, stored per order**: The store sells one product, expected to transact
  in a single configured currency, but currency is stored on each order for correctness and
  future flexibility.
- **Amount unit**: Amounts are stored in the currency's smallest unit (e.g. cents) as
  precise integers to avoid rounding drift, consistent with common payment-provider
  conventions.
- **No customer accounts**: Orders are identified by their own key and payment reference;
  there is no customer login, and email/WhatsApp are contact data only.
- **Data store**: The record of truth is the project's mandated managed PostgreSQL database
  (per the project constitution); this feature establishes the schema and shared data-access
  foundations that later features (payment, webhooks, dashboard) build upon.
- **Scope of this feature**: This feature covers the order data model, the payment-status
  vocabulary, and the shared foundational scaffolding for data and payment access. It does
  NOT include the payment provider integration, webhook handling, or any UI — those are
  separate specs that depend on this one.

## Dependencies

- None. This is the foundational feature; later features (payment provider abstraction,
  payment page, webhook & order sync, dashboard, orders management) depend on it.
