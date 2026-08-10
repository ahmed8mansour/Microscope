# Implementation Plan: Quantity, Shipping Address & Semi-Automated Fulfillment

**Branch**: `005-quantity-shipping-fulfillment` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-quantity-shipping-fulfillment/spec.md`

## Summary

Turn the single-unit store into a **multi-unit physical dropship** flow on top of 001–004,
enabled by constitution **v2.0.0** (Single-Product Focus). Three slices:

1. **Quantity** — a +/− stepper on the **payment step** (beside the card). The intent already
   exists there, so a quantity change calls a new server **re-price** path that recomputes
   `amount = unitAmount × quantity` server-side and updates both the pending order and the
   **unconfirmed** PaymentIntent in lockstep (new `updateIntentAmount` on the payment
   abstraction). Confirmed intents are never re-priced. `orders.amount` stays server-authoritative,
   so 003's webhook amount check carries over unchanged.
2. **Shipping address** — a structured address collected **before** `create-intent` (a new step
   after OTP-verify), validated **Zod-only** (required fields, length bounds, ISO country on a
   ships-to allow-list, per-country postal format) and **deterministically normalized** — no
   external provider (revised 2026-08-09). Fields/order/labels/supplier-field names come from one
   canonical AliExpress mapping (`ADDRESS_FIELDS`) shared by the form, snapshot, and admin panel.
   The **normalized** address is stored as a **per-order snapshot** in a new `shipping_addresses`
   table (1:1 with the order, PII, RLS server-only, nullable for later anonymization). The
   recipient phone is the customer's existing WhatsApp number, snapshotted onto the row.
3. **Semi-automated fulfillment** — the admin order detail gains a **copy-ready panel** rendering
   the snapshot field-for-field in supplier-form order with per-field + "copy all" controls; the
   admin places the Alibaba/AliExpress order **by hand** and records the returned supplier
   order/tracking references (new nullable `orders` columns). No supplier API is ever called.

Provider isolation (Principle V) is preserved twice: the payment abstraction gains
`updateIntentAmount` (no Stripe type leaks), and address validation sits behind its own
factory/adapter seam mirroring `lib/payments`.

## Technical Context

**Language/Version**: TypeScript 5.x (strict); Node.js ≥ 20.9
**Primary Dependencies**: Next.js 16.2.12 (App Router), React 19.2.4; Drizzle ORM + postgres.js;
`stripe` (server) + `@stripe/stripe-js`/`@stripe/react-stripe-js` (client Elements); TanStack
Query; RHF + Zod — all existing from 001–004. **No new dependencies.** Address validation is
**Zod-only** (revised 2026-08-09) — structural Zod + ships-to allow-list + per-country postal +
deterministic normalization; no external provider, no key.
**Storage**: Supabase Postgres via Drizzle. **New** `shipping_addresses` table (per-order PII
snapshot, 1:1). `orders` gains `quantity` (int ≥ 1, default 1) and nullable
`supplier_order_ref` / `supplier_tracking_ref`. One Drizzle migration.
**Testing**: Vitest — unit (quantity validation + server re-price math, address Zod +
allow-list + postal rules, snapshot mapping, copy-string formatting) and integration
(create-intent with address, update-quantity re-price incl. confirmed-intent refusal, admin
fulfillment record) against a test DB with the payment provider and `AddressValidator` mocked;
a gated live Stripe test for `updateIntentAmount`.
**Target Platform**: Vercel (serverless, Node runtime) + Supabase Cloud
**Project Type**: Web application (Next.js App Router) — adds one client stepper + address form,
one Route Handler (`update-quantity`), extends `create-intent` and the admin fulfill route, and
adds server-only address/shipping modules plus a payment-abstraction method.
**Performance Goals**: Re-price is a single provider update + single indexed order write; address
validation is one provider round-trip on the address step (off the money path). No regression to
003's webhook/confirm latency.
**Constraints**: Amount stays server-authoritative (`unitAmount × quantity`); quantity is the only
client pricing input (Zod: positive integer, **no upper cap**). Re-price only mutates an
**unconfirmed** intent; the stepper is disabled during confirmation. Address is validated
server-side regardless of client validation; the validation provider key is **server-only** (no
`NEXT_PUBLIC_`). Shipping-address PII is server-only under RLS, nullable for erasure.
**Scale/Scope**: One product, many units, low volume, AUD, card payments only, ships-to allow-list.

**Runtime note**: `create-intent`, `update-quantity`, and the admin fulfill route run
`runtime = 'nodejs'` (Stripe + postgres.js + server `fetch` to the validation API). Bodies read
via `request.json()`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Evaluated against **constitution v2.0.0** (Principle I redefined to permit exactly these three
capabilities).

| Principle | Assessment | Status |
|-----------|------------|--------|
| I. Single-Product Focus (YAGNI) | Multiple units of the **one** product, physical shipping-address collection, and **human-placed** supplier fulfillment are the three capabilities v2.0.0 explicitly permits. No multi-product cart, no inventory, and **no supplier-ordering API** (the panel is copy-only). Directly in-bounds; cited to the amendment. | ✅ Pass |
| II. Conversion-First Experience | The address step adds funnel friction, but Principle II allows friction with a **data-quality justification** — a physical good is undeliverable without a validated address. The stepper lives on the existing payment step (no new step) and defaults to 1. | ✅ Pass (justified) |
| III. Payment Integrity (NON-NEGOTIABLE) | Amount remains server-authoritative (`unitAmount × quantity`); re-price mutates only **unconfirmed** intents and moves order + intent amounts in lockstep; 003's signature-verified, idempotent webhook and its amount-mismatch guard are unchanged. Provider isolation extended with `updateIntentAmount` — no Stripe type crosses the seam. | ✅ Pass |
| IV. Server-Side Trust & Security | Quantity and address are Zod-validated server-side (client validation is UX only); address re-validated + normalized server-side; re-price re-validates quantity and re-checks access scope by client secret; the validation-API key is server-only. | ✅ Pass |
| V. Clean, Layered Architecture | Address validation isolated behind an `AddressValidator` factory/adapter (mirrors `lib/payments`); per-order snapshot in its own `shipping_addresses` table + repository; route handlers stay thin; quantity/re-price logic in the orders/payment feature modules. | ✅ Pass |

**Gate result**: PASS. No violations; Complexity Tracking empty.

**Post-Design re-check (after Phase 1)**: PASS — the design's new surfaces stay in-bounds. The
`AddressValidator` seam and the `updateIntentAmount` method *strengthen* Principle V (both keep
provider specifics out of routes); the `shipping_addresses` table is 1:1 per-order PII (no cart,
no inventory); re-price only touches unconfirmed intents and keeps the amount server-set
(Principle III/IV intact). No new violations introduced by data-model or contracts.

> Note: this plan is only constitutional **because** the v2.0.0 amendment landed first. Under
> v1.0.1 it would have failed Principle I (named exclusions: cart, supplier automation,
> dropshipping). The amendment is the gate that opened it.

## Project Structure

### Documentation (this feature)

```text
specs/005-quantity-shipping-fulfillment/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── create-intent-ext.md      # create-intent now takes address (+ optional quantity)
│   ├── update-quantity-api.md    # POST /api/checkout/update-quantity (server re-price)
│   ├── address-validator.md      # the AddressValidator abstraction contract
│   └── admin-fulfillment.md      # fulfillment-panel data shape + supplier-ref recording
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
lib/
├── config/
│   ├── product.ts                # CHANGE: amount → unitAmount; add computeAmount(qty)
│   └── shipping.ts               # NEW: SHIPS_TO country allow-list + per-country postal rules
└── db/schema.ts                  # CHANGE: orders.quantity + supplier refs; NEW shipping_addresses
# (lib/address/ was NOT added — Zod-only; address logic lives in features/shipping/domain)

drizzle/                          # NEW generated migration

features/
├── shipping/                     # NEW feature module (address domain)
│   ├── schemas/address.schema.ts #   Zod: structured address, allow-list, postal format
│   ├── data/shipping-address.repository.ts  # per-order snapshot create/get (server-only)
│   ├── domain/format.ts          #   supplier-form field ordering + copy strings
│   ├── types/index.ts
│   └── index.ts
├── checkout/
│   ├── schemas/checkout.schema.ts  # CHANGE: create-intent body adds shippingAddress (+ quantity?)
│   └── components/AddressForm.tsx   # NEW: structured address form + client validation UX
├── orders/
│   ├── data/order.repository.ts    # CHANGE: createOrder takes quantity; NEW repriceOrder()
│   ├── schemas/order.schema.ts     # CHANGE: createOrderSchema + quantity; reprice schema
│   └── types/order.types.ts        # CHANGE: Order gains quantity + supplier refs
├── payment/
│   ├── components/PaymentForm.tsx   # CHANGE: mount QuantityStepper; call re-price; lock on confirm
│   ├── hooks/use-reprice.ts         # NEW
│   └── schemas/reprice.schema.ts    # NEW
└── admin/
    ├── components/OrderDetail.tsx   # CHANGE: fulfillment panel (copy-ready) + supplier-ref inputs
    ├── data/orders.repository.ts    # CHANGE: join shipping_addresses into detail
    └── schemas/…                    # NEW supplier-ref schema

components/ui/QuantityStepper.tsx     # NEW: accessible +/− stepper (aria, disabled at bound=1)

app/
├── checkout/page.tsx                 # CHANGE: address step after verify; pass quantity to payment
└── api/
    ├── checkout/
    │   ├── create-intent/route.ts    # CHANGE: validate+normalize address, snapshot, price qty=1
    │   └── update-quantity/route.ts  # NEW: access-scoped server re-price
    └── admin/orders/[id]/fulfill/route.ts  # CHANGE: record supplier order/tracking refs

.env.example                          # CHANGE: add ADDRESS_VALIDATION_API_KEY (server-only)
tests/                                # unit + integration per Testing above
```

**Structure Decision**: Web application (existing). One new domain module — `features/shipping`
(canonical AliExpress field mapping, Zod schema, deterministic normalization, per-order snapshot +
supplier-form
formatting) — keep the new domain out of route handlers and components, consistent with how
`lib/payments` + `features/orders` are organized. The address is a **dedicated 1:1 table**, not
inline `orders` columns, so PII stays grouped for the anonymization story and `orders` stays lean.

## Complexity Tracking

> No Constitution Check violations — section intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
