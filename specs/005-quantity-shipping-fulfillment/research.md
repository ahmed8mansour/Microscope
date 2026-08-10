# Phase 0 Research: Quantity, Shipping Address & Semi-Automated Fulfillment

All spec clarifications were resolved in the `/speckit.clarify` session (spec → Clarifications
2026-08-09). The open items here are technical: how to re-price safely, which address-validation
approach, how to store the snapshot, and how the copy-ready panel maps to the supplier form.

## D1 — Quantity representation & server-authoritative pricing

**Decision**: Add `orders.quantity` (`integer NOT NULL DEFAULT 1`, `CHECK (quantity >= 1)`, **no
upper bound**). Rename `PRODUCT.amount → PRODUCT.unitAmount` and add `computeAmount(qty) =
unitAmount * qty`. `orders.amount` continues to hold the **total** (`unitAmount × quantity`).

**Rationale**: `orders.amount` is already the system-of-record total that 003's webhook checks
(`event.amount === order.amount`) and 004's revenue sums. Keeping `amount` as the total means
**zero change** to webhook verification and revenue math; `quantity` is additive audit detail.
Quantity is the only client-supplied pricing input, so it is Zod-validated as a positive integer
and the amount is always recomputed server-side — a client can never send an amount.

**Alternatives considered**: (a) Store only `quantity` and derive `amount` everywhere at read
time — rejected: forces 003/004 to change and re-derive, and loses the historical unit price if
it ever changes. (b) A hard cap (e.g. 10) — rejected per the user's explicit "no cap"; the
provider's per-transaction maximum is the only ceiling, and `≥ 1 integer` is the real guard.

## D2 — Quantity changed on the payment step → re-price mechanics

**Decision**: New endpoint **`POST /api/checkout/update-quantity`** taking `{ paymentIntentId,
clientSecret, quantity }`. It (1) re-validates quantity, (2) authorizes via the **exact client
secret** (reusing 003's `isAuthorizedForSnapshot` against a fresh snapshot), (3) refuses if the
intent is no longer re-priceable (confirmed/succeeded/failed → `409`), (4) recomputes
`amount = unitAmount × quantity`, (5) updates the pending order (`repriceOrder`) and (6) calls the
new `updateIntentAmount(providerRef, amount)` on the payment abstraction. Order and intent amounts
move in lockstep. The client disables the stepper and the pay button while a re-price is in
flight and during confirmation.

**Rationale**: The stepper lives on the payment step (clarify Q3 = Option C), so the intent
already exists; Stripe supports updating an **unconfirmed** PaymentIntent's `amount`
(`paymentIntents.update`). Authorizing by client secret matches how `/confirm` already scopes
access without guessable ids. Refusing on non-re-priceable states plus 003's amount-mismatch guard
means a race can never charge an amount the order doesn't expect.

**Alternatives considered**: (a) Create a brand-new intent/order on each quantity change —
rejected: leaves abandoned pending orders and re-consumes the per-checkout verification. (b) Put
the stepper before `create-intent` so no re-price is needed — rejected: the user chose the payment
step. (c) Trust the client to pass the new amount — rejected outright (Principle IV).

**Stripe note**: `paymentIntents.update` on a confirmed/succeeded intent throws; the Stripe
adapter maps that to a normalized "not re-priceable" error the route turns into `409`, never a 500.

## D3 — Address validation (Zod-only) + canonical AliExpress field mapping

**Decision (revised 2026-08-09)**: **Zod-only** — no external validation provider. Validate
server-side with Zod (required fields, length bounds, 2-letter country), gate on the `SHIPS_TO`
allow-list + per-country postal format (`lib/config/shipping.ts`), and **normalize deterministically**
(`features/shipping/domain/normalize.ts`: trim, uppercase country, clean postal). The shipping
address's fields, order, labels, and supplier-field names live in one canonical mapping
(`features/shipping/domain/fields.ts` → `ADDRESS_FIELDS`) that the checkout form, the stored
snapshot, and the admin fulfillment panel all read from — guaranteeing they never drift (a unit
test asserts the form fields equal the schema keys).

**Rationale**: The external deliverability API (Google Address Validation) is a **paid** per-call
service; the store places supplier orders **manually** from the copy-ready panel, so exact
field-shape sync with the AliExpress/Alibaba form is what actually matters — not automated
deliverability. Dropping it removes recurring cost and a server key with no loss to the manual
fulfillment flow. Structural + allow-list + postal validation still blocks garbage addresses.

**Alternatives considered**: (a) Google Address Validation API behind an `AddressValidator` seam —
implemented first, then **removed** to avoid per-call cost. (b) Client autocomplete widget —
rejected (adds a client key; not needed). The abstraction seam is gone, but a future provider can
be reintroduced behind the same `normalizeAddress`/validation call sites if deliverability is ever
required.

## D4 — Where the per-order address snapshot lives

**Decision**: A dedicated **`shipping_addresses`** table, **1:1 with `orders`** (`order_id`
unique FK). Columns nullable (required-at-creation via Zod, nullable for later anonymization),
RLS enabled with no anon policies (server-only), mirroring how contact PII is handled on `users`.

**Rationale**: The address is a per-order **snapshot** (clarify Q1), immutable after purchase.
A dedicated table keeps `orders` lean, groups the PII in one place for the erasure story (null the
fields or drop the row), and cleanly expresses the 1:1 without widening the hot `orders` row.
Consistent with the codebase pattern of separating PII (`users`) from the financial record
(`orders`).

**Alternatives considered**: (a) Inline columns on `orders` — rejected: widens `orders`, scatters
PII, and muddies anonymization. (b) On `users` as a mutable current address — rejected by clarify
Q1 (would retroactively rewrite past orders).

## D5 — Recipient phone

**Decision**: No separate phone field. Snapshot the customer's existing verified
`users.whatsapp` into `shipping_addresses.phone` at order creation.

**Rationale**: Clarify Q2 — reuse the WhatsApp number. Snapshotting (rather than reading `users`
live at fulfillment time) keeps it immutable with the order and consistent with the address
snapshot and the anonymization story.

## D6 — Supplier order/tracking reference storage

**Decision**: Two nullable text columns on `orders`: `supplier_order_ref` and
`supplier_tracking_ref`, recorded by the admin via the extended fulfill route. Recording them does
**not** change `payment_status` (fulfillment ≠ payment, per 001/004).

**Rationale**: Low-cardinality, exactly-one-per-order admin annotations tied to fulfillment;
columns on `orders` are the simplest fit (a table would be over-modeling for 1:1 optional
strings). Mirrors how `fulfilled`/`paidAt` already live on `orders`.

**Alternatives considered**: a `fulfillments` table — rejected (over-modeling for MVP; no
multi-shipment requirement).

## D7 — Copy-ready panel ↔ supplier form mapping

**Decision**: `features/shipping/domain/format.ts` owns the canonical **supplier-form field
order** — recipient name, phone, country, state/province, city, address line 1, line 2, postal
code — and produces per-field copy strings plus a "copy all" block. The admin panel renders from
this single source so the field order always matches the AliExpress/AliExpress-class order form.

**Rationale**: "Sync with the Alibaba form" is a presentation/data-shape contract (clarify), so a
single formatting module keeps the panel and any future export consistent and testable
(byte-for-byte copy equals stored normalized value, SC-005). No live supplier integration.

## D8 — Ships-to allow-list & postal formats

**Decision**: `lib/config/shipping.ts` exports `SHIPS_TO` (ISO-3166 alpha-2 codes) and a
per-country postal-format map used by both the Zod schema and the address step. MVP default is
intentionally conservative and edited as a config change, not code.

**Rationale**: The shippable set is a business decision, not logic; centralizing it as config lets
it change without touching validation code, and lets Zod reject out-of-list countries early
(FR-008/US2 scenario 3).

## Dependencies & environment

- **No new npm dependencies**: Google Address Validation is called via server `fetch`; Stripe
  re-price uses the already-installed `stripe` SDK.
- **New env var**: `ADDRESS_VALIDATION_API_KEY` — server-only (no `NEXT_PUBLIC_` prefix), added to
  `.env.example`. Joins the existing server-only secrets (`STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`); the Stripe **publishable** key remains the only client-exposed value.

**All NEEDS CLARIFICATION resolved** — proceed to Phase 1.
