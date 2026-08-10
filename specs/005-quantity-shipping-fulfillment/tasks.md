---
description: "Task list for feature 005 — Quantity, Shipping Address & Semi-Automated Fulfillment"
---

# Tasks: Quantity, Shipping Address & Semi-Automated Fulfillment

**Input**: Design documents from `/specs/005-quantity-shipping-fulfillment/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: INCLUDED — the plan specifies a Vitest unit + integration strategy and this feature
touches the constitution-critical payment path (Principle III/IV: amount stays server-set;
re-price only on unconfirmed intents). Test tasks precede the implementation they cover.

**Organization**: Grouped by user story. US1 (quantity) and US2 (address) are both P1; US1 is the
MVP slice because it is independently testable at the API level without US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 = quantity, US2 = shipping address, US3 = admin fulfillment

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Config + env scaffolding shared by all stories.

- [x] T001 [P] Add server-only `ADDRESS_VALIDATION_API_KEY` (Google Address Validation) to `.env.example` with a comment noting NO `NEXT_PUBLIC_` variant.
- [x] T002 [P] In `lib/config/product.ts`, rename `PRODUCT.amount` → `PRODUCT.unitAmount` and add `computeAmount(quantity: number)` returning `unitAmount * quantity`; update `formatPrice`/`formatPriceShort` to read `unitAmount`.
- [x] T003 [P] Create `lib/config/shipping.ts` exporting `SHIPS_TO` (ISO-3166 alpha-2 allow-list) and a per-country `POSTAL_FORMATS` map (regex per country), with a conservative MVP default.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: DB schema + order plumbing that every story reads. **⚠️ No user story can begin until this phase is complete.**

- [x] T004 Extend `lib/db/schema.ts`: add `orders.quantity` (`integer notNull default 1` + `check(quantity >= 1)`), `orders.supplierOrderRef`, `orders.supplierTrackingRef` (nullable text); add the new `shippingAddresses` pgTable (per-order 1:1: `orderId` FK + `uniqueIndex`, nullable address columns, `check(char_length(country)=2)`, `.enableRLS()`) per data-model.md.
- [x] T005 Run `drizzle-kit generate` to emit the migration into `drizzle/` (orders ALTER + shipping_addresses CREATE) and confirm it applies against the test DB. (depends T004)
- [x] T006 [P] Update `features/orders/types/order.types.ts`: add `quantity` and `supplierOrderRef`/`supplierTrackingRef` to `Order`; add optional `quantity` to `CreateOrderInput`.
- [x] T007 Update `features/orders/schemas/order.schema.ts` (add `quantity: z.number().int().min(1)` to `createOrderSchema`) and `features/orders/data/order.repository.ts` (`toOrder` maps the new columns; `createOrder` persists `quantity`, defaulting to 1). (depends T006)

**Checkpoint**: Schema migrated, order shape carries quantity + supplier refs — stories can start.

---

## Phase 3: User Story 1 - Quantity stepper + server re-price (Priority: P1) 🎯 MVP

**Goal**: Customer picks quantity on the payment step; the server re-prices the unconfirmed intent + order to `unitAmount × quantity`; confirmed intents are never re-priced.

**Independent Test**: Create an intent (fixture), POST `/api/checkout/update-quantity` with quantity 3 → order+intent amount = `3 × unit`; with `0/-1/2.5` → 400; after confirmation → 409; wrong client secret → 403.

### Tests for User Story 1

- [x] T008 [P] [US1] Unit tests in `tests/unit/reprice.test.ts`: `computeAmount`, quantity Zod (`reject 0/-1/2.5/NaN`), and `repriceOrder` pending-only guard.
- [x] T009 [P] [US1] Integration tests in `tests/integration/update-quantity.test.ts` (payment provider mocked): valid re-price, forged `amount` field → 400, non-pending intent → 409 `not_repriceable`, mismatched client secret → 403.

### Implementation for User Story 1

- [x] T010 [P] [US1] Add `updateIntentAmount(providerRef, amount)` to the `PaymentProvider` interface in `lib/payments/types.ts` and a normalized `NotRepriceableError`.
- [x] T011 [US1] Implement `updateIntentAmount` in `lib/payments/providers/stripe.ts` (`paymentIntents.update`; map a settled-intent error → `NotRepriceableError`) and export the seam from `lib/payments/index.ts`. (depends T010)
- [x] T012 [P] [US1] Add `repriceOrder(orderId, quantity)` to `features/orders/data/order.repository.ts` — requires `payment_status === 'pending'` (else `ConflictError`), writes `quantity` + `amount = computeAmount(quantity)`.
- [x] T013 [P] [US1] Create `features/payment/schemas/reprice.schema.ts` (`paymentIntentId`, `clientSecret`, `quantity: int().min(1)`).
- [x] T014 [US1] Implement `app/api/checkout/update-quantity/route.ts` per contracts/update-quantity-api.md (validate → snapshot → `isAuthorizedForSnapshot` → pending check → `repriceOrder` → `updateIntentAmount`; `runtime = 'nodejs'`). (depends T011, T012, T013)
- [x] T015 [P] [US1] Create accessible `components/ui/QuantityStepper.tsx` (+/− buttons, `aria-label`s, live value, min 1 with `−` disabled at 1, controlled value/onChange).
- [x] T016 [P] [US1] Create `features/payment/hooks/use-reprice.ts` (TanStack mutation → `/api/checkout/update-quantity`).
- [x] T017 [US1] Wire `features/payment/components/PaymentForm.tsx`: mount `QuantityStepper`, call `use-reprice` on change, disable stepper + pay button while re-pricing and during confirmation, show `computeAmount(quantity)` in the pay label. (depends T015, T016)
- [x] T018 [US1] Update `app/checkout/page.tsx` to hold quantity state and pass it into `PaymentForm`; confirm view shows the quantity + total. (depends T017)

**Checkpoint**: Multi-unit purchase works end-to-end and re-prices safely; 003's amount check unaffected.

---

## Phase 4: User Story 2 - Validated shipping address (Priority: P1)

**Goal**: Collect a structured address before `create-intent`, validate deliverability + normalize via the `AddressValidator`, re-validate with Zod, store as a per-order snapshot; block payment on invalid/undeliverable/unverified.

**Independent Test**: POST `/api/checkout/create-intent` with a deliverable address → order + snapshot created (normalized values, phone = WhatsApp); nonsense address → 422 `address_undeliverable`; country ∉ `SHIPS_TO` → 422 `address_invalid`; validator throws → 503 `address_unverified`, no order.

### Tests for User Story 2

- [x] T019 [P] [US2] Unit tests in `tests/unit/address-schema.test.ts`: required fields, `SHIPS_TO` gate, per-country postal format, length bounds; and `AddressValidator` result → normalized-address mapping.
- [x] T020 [P] [US2] Integration tests in `tests/integration/create-intent-address.test.ts` (`AddressValidator` + provider mocked): happy path creates order+snapshot; undeliverable → 422; out-of-list → 422; validator error → 503; no order/snapshot on any failure.

### Implementation for User Story 2

- [x] T021 [P] [US2] Create the `AddressValidator` seam: `lib/address/types.ts`, `lib/address/factory.ts`, `lib/address/index.ts` (`validateAddress`, server-only) per contracts/address-validator.md.
- [x] T022 [US2] Implement `lib/address/providers/google.ts` (Google Address Validation via server `fetch`, key from `process.env.ADDRESS_VALIDATION_API_KEY`; map verdict → `deliverable`, standardized components → `normalized`; throw on error/missing key). (depends T021)
- [x] T023 [P] [US2] Create `features/shipping/schemas/address.schema.ts` (structured address Zod using `SHIPS_TO` + `POSTAL_FORMATS`) and `features/shipping/types/index.ts` + `features/shipping/index.ts` barrel.
- [x] T024 [P] [US2] Create `features/shipping/data/shipping-address.repository.ts`: `createSnapshot(orderId, normalized, phone)` (insert 1:1 row) and `getByOrderId(orderId)` (server-only).
- [x] T025 [US2] Extend `features/checkout/schemas/checkout.schema.ts`: add `shippingAddress` (address schema) and optional `quantity` to `createIntentRequestSchema`, keeping `.strict()` (client `amount` still rejected).
- [x] T026 [US2] Update `app/api/checkout/create-intent/route.ts` per contracts/create-intent-ext.md: Zod-validate address → `validateAddress` (422/503 handling) → `computeAmount(quantity)` → `createOrder({quantity})` → `createSnapshot(order.id, normalized, user.whatsapp)` → intent. (depends T022, T024, T025)
- [x] T027 [P] [US2] Create `features/checkout/components/AddressForm.tsx` (structured fields, country from `SHIPS_TO`, client-side validation UX, recoverable error display).
- [x] T028 [US2] Insert an address step into `app/checkout/page.tsx` between `verified` and payment; on submit call `create-intent` with the address; surface 422/503 messages. (depends T027, T026)

**Checkpoint**: No order reaches payment without a validated, normalized, snapshotted address.

---

## Phase 5: User Story 3 - Admin copy-ready fulfillment panel (Priority: P2)

**Goal**: Admin sees the paid order's address + quantity field-for-field in supplier-form order with copy controls, and records supplier order/tracking refs manually. No supplier API is called.

**Independent Test**: Open a paid order in `/admin` → panel shows normalized address + quantity; "copy all" equals stored values byte-for-byte; record refs + mark fulfilled persists; unpaid order shows no placement controls.

### Tests for User Story 3

- [x] T029 [P] [US3] Unit tests in `tests/unit/fulfillment-format.test.ts`: `format.ts` produces supplier-form field order and copy strings equal to stored normalized values (byte-for-byte); missing-address → "unavailable".
- [x] T030 [P] [US3] Integration tests in `tests/integration/admin-fulfill.test.ts`: records supplier refs; `fulfilled:true` on paid order succeeds; on unpaid → 409 `not_fulfillable`; refs never change `payment_status`.

### Implementation for User Story 3

- [x] T031 [P] [US3] Create `features/shipping/domain/format.ts` — canonical supplier-form field order + per-field and "copy all" strings from a `FulfillmentView`.
- [x] T032 [P] [US3] Add a supplier-ref/fulfill Zod schema in `features/admin/schemas/` (optional trimmed refs ≤200, optional `fulfilled` boolean).
- [x] T033 [US3] Update `features/admin/data/orders.repository.ts` to join `shipping_addresses` and include `quantity` + supplier refs in the order-detail payload (`FulfillmentView`). (depends T031)
- [x] T034 [US3] Extend `app/api/admin/orders/[id]/fulfill/route.ts` per contracts/admin-fulfillment.md: persist supplier refs (overwritable), optionally `markFulfilled` (paid-only 409), never touch `payment_status`. (depends T032)
- [x] T035 [US3] Build the fulfillment panel in `features/admin/components/OrderDetail.tsx` (render `format.ts` output, per-field + copy-all buttons with a selectable-text fallback, ref inputs, paid-only gating) and extend `features/admin/hooks/use-fulfill.ts` for the ref payload. (depends T033, T034)

**Checkpoint**: Admin can fulfill by paste; placement stays a human action.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T036 [P] Show `quantity` in `features/admin/components/OrdersTable.tsx` (and order-detail header) for at-a-glance multi-unit orders.
- [x] T037 [P] Security pass: grep for `ADDRESS_VALIDATION_API_KEY` to confirm it is read only server-side and never `NEXT_PUBLIC_`; confirm `.strict()` still rejects client `amount` on both routes.
- [x] T038 [P] Add `tests/unit/product-config.test.ts` for `computeAmount` edge values and the `unitAmount` rename (guards accidental total/unit confusion).
- [~] T039 Run `quickstart.md` end-to-end validation (migrate → multi-unit purchase → admin fulfillment) and fix any gaps. — NOT run here: needs live DATABASE_URL + Stripe + address API. Proxy checks done (tsc clean, 142 unit tests pass, full suite imports clean, security grep).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → depends on Setup; **blocks all stories** (schema + order shape).
- **US1 / US2 (P3/P4)** → depend on Foundational; independently testable at the API level. File overlap: both edit `app/checkout/page.tsx` (US1 adds quantity to the payment step; US2 adds the address step) — sequence T018 and T028 to avoid a merge conflict; everything else is disjoint.
- **US3 (P5)** → depends on Foundational (supplier columns) and US2 (address snapshot to display). Testable once US2's snapshot exists.
- **Polish (P6)** → after the desired stories.

### Within each story

- Tests before implementation; interface (`types.ts`) before adapter; schema/repo before route; route before UI wiring.

### Parallel opportunities

- Setup T001–T003 all `[P]`.
- Foundational T006 `[P]`; T004→T005→T007 sequential.
- US1: T008/T009 (tests) `[P]`; T010, T012, T013, T015, T016 `[P]` (distinct files); T011/T014/T017/T018 sequential on their deps.
- US2: T019/T020 `[P]`; T021, T023, T024, T027 `[P]`; T022/T025/T026/T028 sequential.
- US3: T029/T030 `[P]`; T031/T032 `[P]`; T033/T034/T035 sequential.
- With staff: once Foundational lands, US1 and US2 proceed in parallel (mind the `page.tsx` overlap); US3 follows US2.

---

## Implementation Strategy

### MVP first (US1)

1. Setup → Foundational → US1. **Stop and validate** the re-price path (server-authoritative amount, confirmed-intent refusal). Deploy/demo multi-unit purchase.

### Incremental delivery

2. Add US2 (address + snapshot) → validate no order reaches payment without a real address.
3. Add US3 (admin fulfillment) → validate copy fidelity + manual placement.
4. Polish.

### Notes

- `[P]` = different files, no incomplete dependency.
- Keep `orders.amount === unitAmount × orders.quantity` invariant intact (write them together only).
- Never re-price a confirmed intent; disable the stepper during confirmation.
- Commit after each task or logical group.
