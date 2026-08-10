<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.1 → 2.0.0
Bump rationale: MAJOR. Principle I (Single-Product Simplicity) is renamed to
Single-Product Focus and redefined to permit three capabilities it previously
excluded by name: (1) multiple units of the one product per order, (2) collection
of a physical shipping address, and (3) semi-automated, human-placed supplier
fulfillment via an admin copy-ready panel. Full dropshipping-API automation, a
multi-product shopping cart, and inventory management remain excluded.

Modified principles:
  - I. Single-Product Simplicity → I. Single-Product Focus (renamed + redefined)

Added sections: None (new guidance folded into Principle I)
Removed sections: None

Templates requiring updates:
  - .specify/templates/plan-template.md ...... ✅ compatible (reads gates dynamically from this file)
  - .specify/templates/spec-template.md ...... ✅ compatible (no constitution-coupled sections)
  - .specify/templates/tasks-template.md ..... ✅ compatible (no principle-coupled task types)
  - .specify/templates/checklist-template.md . ✅ compatible

Migration impact (implemented by new feature 005-quantity-shipping-fulfillment):
  - orders: add `quantity` (positive integer >= 1, no upper cap); order `amount`
    becomes unit price x quantity, still server-computed (never client-supplied).
  - Structured, validated shipping address stored as PII under the same server-only /
    RLS / anonymizable handling as existing customer contact data.
  - specs 001/002 amended for the order shape + checkout fields; 003's webhook
    amount-check mechanism is UNCHANGED (it already asserts event.amount ===
    order.amount, which now equals unit x quantity); 004 admin shows quantity and
    gains the copy-ready fulfillment panel.

Deferred TODOs:
  - RATIFICATION_DATE remains initial adoption date (2026-07-31). Update if an
    earlier formal adoption date is confirmed.
-->

# Microscope Store Constitution

## Core Principles

### I. Single-Product Focus (YAGNI)

The system exists to sell exactly **one product**. Every feature MUST directly support the
sales process for that single product; anything that does not is out of scope. A customer MAY
purchase **multiple units** of that one product in a single order, but the system MUST NOT
introduce a second sellable product or a multi-product cart.

- Permitted as of v2.0.0:
  - **Multiple units** of the single product per order (a quantity selector), with **no
    upper cap** on quantity. The charged amount MUST be computed **server-side** as
    `unit price × quantity`. Quantity is the *only* client-supplied pricing input and MUST be
    validated server-side as a **positive integer (≥ 1)** — the server MUST reject zero,
    negative, or non-integer values and re-price from the server's unit price, so a tampered
    amount can never take effect. (The payment provider's own per-transaction maximum is the
    only ceiling.)
  - **Physical shipping-address collection** — a structured, validated recipient address
    required to deliver the physical product — treated as PII under the same server-only,
    RLS-protected, anonymizable handling as existing customer contact data.
  - **Semi-automated supplier fulfillment** — an admin-facing, copy-ready panel that presents
    a paid order's shipping address field-for-field for **manual** placement with a
    third-party supplier, plus storage of a returned supplier order/tracking reference. Order
    placement remains a human action; the application never calls a supplier API.

- The following remain excluded and MUST NOT be introduced without a further constitution
  amendment: a **multi-product shopping cart** (multiple distinct products / line items),
  additional products, product reviews, wishlist, inventory management, roles & permissions,
  **automated dropshipping via a supplier order-placement API** (programmatic order creation
  against AliExpress/Alibaba), subscription payments, user accounts, passwords, and general
  authentication systems.

- New complexity MUST be justified against the sales flow. When two designs satisfy the
  requirement, choose the simpler one.

**Rationale**: The store sells one product but now ships it as a physical good that may be
ordered in quantity and fulfilled through a third-party supplier. Allowing multiple units and
a *manual* supplier bridge reflects that reality while still refusing the open-ended
complexity — multi-product cart, inventory, supplier-API automation — that this principle
exists to prevent.

### II. Conversion-First Experience

Product and UI decisions MUST prioritize conversion over feature breadth. The purchase
path (Landing → Contact + OTP → Payment → Success) MUST stay short, fast, and low-friction.

- The landing page MUST be optimized for conversion (clear hero, product imagery, benefits,
  social proof, and CTA) and MUST load fast.
- Friction added to the funnel (fields, steps, confirmations) MUST have an explicit
  conversion or data-quality justification; OTP verification is the one mandated gate.

**Rationale**: A single-product store lives or dies by conversion rate; every added step
costs sales unless it demonstrably earns its place.

### III. Payment Integrity (NON-NEGOTIABLE)

Payments MUST use the Stripe Payment Intents workflow — NOT Stripe Checkout Sessions — and
the payment result MUST be trusted only from the server side.

- Webhook signatures MUST be verified; webhook processing MUST be idempotent; duplicate
  webhook deliveries MUST NOT create duplicate side effects.
- Payment success MUST be confirmed via server-side verification (webhook + Stripe API),
  never solely from a frontend response or redirect.
- Payment Intent lifecycle (create → confirm → succeed/fail) MUST be managed explicitly,
  with orders persisted/updated from verified webhook events.
- The payment domain MUST be isolated behind an abstraction (e.g. Strategy / Factory /
  Adapter) so an additional provider can be added with minimal changes to application code.

**Rationale**: Money movement is the highest-risk surface. Server-side verification,
idempotency, and provider isolation prevent fraud, double-charging, and lock-in.

### IV. Server-Side Trust & Security

The server is the sole source of truth. Client-supplied values MUST NOT be trusted for any
security- or money-relevant decision.

- Every request MUST be validated on the server; all inputs MUST be validated with Zod
  schemas before use.
- Secrets (Stripe keys, Supabase service keys, webhook secrets) MUST live in environment
  variables and MUST NOT be committed or exposed to the client.
- Dashboard routes MUST be protected (password protection is sufficient for MVP).
- Email ownership MUST be verified via OTP before a customer may proceed to payment.

**Rationale**: The spec mandates zero trust in the client and explicit protection of admin
and payment surfaces; these are the minimum bar for a store that handles real payments.

### V. Clean, Layered Architecture

Business logic MUST be separated from UI, and domains MUST be isolated behind reusable
services rather than tangled into components or route handlers.

- The payment domain MUST be separated from application logic; Stripe integration MUST stay
  isolated behind the payment abstraction (see Principle III).
- Code MUST follow SOLID principles, prefer composition over inheritance, and avoid tight
  coupling. Design patterns MUST be applied where they measurably improve maintainability,
  not decoratively.
- Features MUST be organized as self-contained, feature-based modules (api / components /
  hooks / schemas / types) with explicit public exports.

**Rationale**: The codebase must evolve into a larger platform and be reused as a template
without major refactoring; clean seams are what make that possible.

## Technology & Structure Constraints

The MVP MUST be built on the mandated stack; substitutions require an amendment.

- Frontend: Next.js 16 (App Router), TypeScript, Tailwind CSS, shadcn/ui, React Hook Form,
  Zod, TanStack Query.
- Backend: no dedicated server — Next.js Route Handlers and Server Actions (where
  appropriate) only.
- Database: Supabase (PostgreSQL); the `orders` table is the system of record for order and
  payment state.
- Payments: Stripe Payment Intents API + Stripe Webhooks.
- Hosting: Vercel + Supabase Cloud. Analytics: Google Analytics, Stripe Dashboard, and the
  internal dashboard.
- Structure: feature-based modules under `features/`, shared services under `lib/` (stripe,
  supabase, validations, payments, otp), and a component hierarchy under `components/`.

Payment statuses tracked by the system MUST be limited to: `Pending`, `Success`, `Failed`,
and `Refunded`. `Fulfilled` is NOT a payment status — it is a separate, business-level
boolean tracked independently on a successfully paid (`Success`) order.

## Development Workflow & Quality Gates

- Server-side input validation with Zod is a merge gate for any route handler or server
  action that accepts external input.
- Any change touching the payment or webhook path MUST preserve signature verification and
  idempotency, and MUST NOT introduce reliance on client-reported payment outcomes.
- New dependencies or features that expand scope MUST be checked against Principle I before
  implementation.
- Secrets MUST be referenced only via environment variables; no secret literals in code or
  version control.

## Governance

This constitution supersedes other development practices for this project. When guidance
conflicts, the constitution wins.

- Amendments MUST be documented in this file, include a version bump and updated dates, and
  note any migration impact in the Sync Impact Report.
- Versioning follows semantic versioning: MAJOR for backward-incompatible principle
  removals or redefinitions, MINOR for a new principle or materially expanded guidance,
  PATCH for clarifications and non-semantic refinements.
- All pull requests and reviews MUST verify compliance with these principles; any added
  complexity MUST be justified against Principle I (Single-Product Simplicity).
- Runtime and agent development guidance lives in `AGENTS.md` / `CLAUDE.md`; those files
  MUST NOT contradict this constitution.

**Version**: 2.0.0 | **Ratified**: 2026-07-31 | **Last Amended**: 2026-08-09
