---
description: "Task list for Data & Payment Foundation"
---

# Tasks: Data & Payment Foundation

**Input**: Design documents from `/specs/001-data-payment-foundation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/order-repository.md, quickstart.md

**Tests**: INCLUDED. This feature has no UI; its success criteria (SC-001–SC-007) and each
story's independent-test are only verifiable through automated tests. Research D10 selected
Vitest (unit for domain/schemas, integration against a Supabase test DB).

**Organization**: Tasks are grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3 (maps to spec.md user stories)
- All paths are repo-root relative (Next.js App Router; server-only `lib/` + `features/`)

## Path Conventions

- Shared infra: `lib/db/` (Drizzle client + schema; reads `DATABASE_URL`)
- Order domain module: `features/orders/`
- Drizzle schema + generated migrations: `lib/db/schema.ts`, `drizzle.config.ts`, `drizzle/`
- Tests: `tests/unit/`, `tests/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add dependencies and test tooling

- [X] T001 Add dependencies to `package.json` and install: runtime `drizzle-orm`, `postgres` (postgres.js), `zod`, `server-only`; dev `drizzle-kit`, `vitest`; add `"test": "vitest"`, `"db:generate": "drizzle-kit generate"`, `"db:migrate": "drizzle-kit migrate"` scripts
- [X] T002 [P] Create `vitest.config.mts` at repo root (node environment, include `tests/**/*.test.ts`; `.mts` avoids an ESM/CJS warning since `package.json` has no `"type": "module"`)
- [X] T003 [P] Verify/add `@/*` → repo-root path alias in `tsconfig.json` (quickstart imports use `@/features/orders`)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared infrastructure every user story depends on — env access, DB client, the
`orders` schema, the status vocabulary, types, validation schemas, and the DAL skeleton.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T004 [P] Env configuration (no code module) — confirm `.env.local` holds `DATABASE_URL` with **no `NEXT_PUBLIC_` prefix**, that `.gitignore` ignores `.env*` but keeps `!.env.example`, and that the committed `.env.example` template documents the var with a placeholder only. (No `lib/env.ts` — a single secret doesn't warrant a module; validation is folded into `lib/db` per T005.)
- [X] T005 Create server-only Drizzle client in `lib/db/index.ts` — `import 'server-only'`; read and validate `process.env.DATABASE_URL` (throw a clear error if missing) and build the postgres.js client with `{ prepare: false }` (Supabase pooler), wrapped by `drizzle()`. This module is the sole reader of the DB secret (research D2/D3; Next 16 has no runtime-config API)
- [X] T006 [P] Define the `orders` table in `lib/db/schema.ts` per data-model.md (columns + defaults; `check()` for amount≥0, 3-char currency, `payment_status IN (...)`, and `NOT fulfilled OR payment_status='success'`; partial `uniqueIndex('orders_payment_intent_uidx').on(stripePaymentIntentId).where(sql\`... is not null\`)`; `orders_created_at_idx`; `updatedAt.$onUpdate(...)`; RLS-enable statement), create `drizzle.config.ts` (schema path, `out: 'drizzle'`, postgres dialect, `DATABASE_URL`), then run `npm run db:generate` to emit the SQL migration into `drizzle/`
- [X] T007 [P] Create `features/orders/domain/payment-status.ts` — `PaymentStatus` union, allowed-transitions map, `isValidTransition(from,to)`, `canFulfill(status)` guards (data-model transition table)
- [X] T008 [P] Create `features/orders/types/order.types.ts` — `Order` (via `InferSelectModel<typeof orders>`) and `CreateOrderInput` DTO (contracts/order-repository.md types)
- [X] T009 Create `features/orders/schemas/order.schema.ts` — Zod schemas: money (integer minor units ≥0), contact (email + non-empty whatsapp), currency (3-char ISO-4217, uppercased), `createOrderSchema`, `statusUpdateSchema` (depends on T008)
- [X] T010 Create DAL skeleton in `features/orders/data/order.repository.ts` (`import 'server-only'`) and public surface in `features/orders/index.ts` — typed errors `ValidationError`/`ConflictError`/`InvalidTransitionError`/`NotFulfillableError`, import the Drizzle client + `orders` schema; export from `index.ts` (depends on T005, T006, T007, T008, T009)

**Checkpoint**: Foundation ready — user stories can now proceed (sequentially on the shared
repository file, or in parallel across their separate test files).

---

## Phase 3: User Story 1 - Every purchase becomes one authoritative order record (Priority: P1) 🎯 MVP

**Goal**: Create a durable, authoritative order record at purchase start and retrieve it by
id or payment reference, with malformed input rejected.

**Independent Test**: Create an order → it holds contact/amount/currency, `pending` status,
`fulfilled=false`, and timestamps; retrieve it by id and by payment reference; malformed
input is rejected (spec US1; FR-001, FR-002, FR-003, FR-009, FR-010; SC-004).

### Tests for User Story 1 ⚠️ (write first, ensure they FAIL)

- [X] T011 [P] [US1] Unit tests for create/contact/money/currency schemas in `tests/unit/order.schema.test.ts` (valid input passes; bad email, negative amount, 2-char currency rejected)
- [X] T012 [P] [US1] Integration test in `tests/integration/order.create.test.ts` — create → `pending`/`fulfilled=false`/timestamps set; get by id returns saved fields; get by payment reference; malformed create rejected

### Implementation for User Story 1

- [X] T013 [US1] Implement `createOrder(input)` in `features/orders/data/order.repository.ts` — Zod-validate then insert with `payment_status='pending'`, `fulfilled=false` (FR-001, FR-002, FR-009)
- [X] T014 [US1] Implement `getOrderById(id)` and `getOrderByPaymentReference(ref)` in `features/orders/data/order.repository.ts` — single indexed lookups, return `null` if absent (FR-010, SC-004)

**Checkpoint**: US1 fully functional — the authoritative record can be created and retrieved.

---

## Phase 4: User Story 2 - Payment lifecycle as distinct, unambiguous states (Priority: P1)

**Goal**: Move an order through the allowed payment states, attach a payment reference, and
track fulfillment separately (only on a paid order), including refunds.

**Independent Test**: Allowed transitions succeed (`pending→success`, `success→refunded`);
disallowed ones (`failed→refunded`, `refunded→success`) are rejected; `markFulfilled`
succeeds only on `success`; a refund flips status to `refunded` (spec US2; FR-004, FR-005,
FR-006, FR-008; SC-002, SC-005).

### Tests for User Story 2 ⚠️ (write first, ensure they FAIL)

- [X] T015 [P] [US2] Unit tests for `isValidTransition`/`canFulfill` in `tests/unit/payment-status.test.ts` (transition table + fulfillment guard)
- [X] T016 [P] [US2] Integration test in `tests/integration/order.status.test.ts` — allowed vs rejected transitions; `markFulfilled` allowed only on `success` and rejected otherwise; `success→refunded`

### Implementation for User Story 2

- [X] T017 [US2] Implement `attachPaymentReference(orderId, ref)` in `features/orders/data/order.repository.ts` — set `stripe_payment_intent_id` (FR-007)
- [X] T018 [US2] Implement `updatePaymentStatus(orderId, next, meta?)` in `features/orders/data/order.repository.ts` — enforce transition guard, idempotent no-op on same status, optional receipt/customer, advance `updated_at` (FR-004, FR-008, SC-002)
- [X] T019 [US2] Implement `markFulfilled(orderId)` in `features/orders/data/order.repository.ts` — set `fulfilled=true` only if `payment_status='success'`, else `NotFulfillableError` (FR-005, FR-006, SC-005)

**Checkpoint**: US1 + US2 both work independently — records progress through their lifecycle.

---

## Phase 5: User Story 3 - Duplicate payment events never create duplicate orders (Priority: P2)

**Goal**: Guarantee one order record per payment/purchase under repeated notifications,
concurrent creation, and retries.

**Independent Test**: Referencing the same payment twice yields exactly one record; repeated
status notifications converge to one final state; a retry after failure reuses the same row
(spec US3; FR-007, FR-007a; SC-001, SC-003).

### Tests for User Story 3 ⚠️ (write first, ensure they FAIL)

- [X] T020 [P] [US3] Integration test in `tests/integration/order.idempotency.test.ts` — attaching the same reference twice is a no-op; a different order claiming a used reference errors; applying one status ≥5× converges; retry reuses the same row

### Implementation for User Story 3

- [X] T021 [US3] Implement `recordRetry(orderId, newRef)` in `features/orders/data/order.repository.ts` — for a `failed` order, reset to `pending` with the new reference, no new row (FR-007a)
- [X] T022 [US3] Harden `attachPaymentReference`/`updatePaymentStatus` in `features/orders/data/order.repository.ts` — idempotent re-apply; map partial-unique-index violation to `ConflictError` when a different order claims a used reference (FR-007, SC-001, SC-003) (depends on T017, T018)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Remaining FRs not owned by a single story, plus verification.

- [X] T023 Implement `updateNotes(orderId, notes)` in `features/orders/data/order.repository.ts` — update notes only, never touch payment/fulfillment state (FR-012)
- [X] T024 Implement `anonymizePii(orderId)` in `features/orders/data/order.repository.ts` — null/mask `email` and `whatsapp`, leave financial record intact (FR-013, SC-007)
- [X] T025 [P] Integration test in `tests/integration/order.pii.test.ts` — `updateNotes` leaves state unchanged; `anonymizePii` clears contact fields but keeps amount/currency/status/reference/timestamps
- [X] T026 [P] Verify the `server-only` guard per quickstart step 5 — importing `@/features/orders` from a `'use client'` module fails the build. **Result**: confirmed via a temporary client-component route (`app/server-only-check-tmp/page.tsx`, deleted after); `next build` fails hard with "Module not found: net/tls/perf_hooks" tracing through `features/orders/data/order.repository.ts` → `lib/db/index.ts` → `postgres`. The boundary is enforced — the client bundle graph cannot resolve the Node-only DB driver, so the build cannot succeed regardless of the explicit `server-only` sentinel message. Baseline build reconfirmed green after cleanup.
- [X] T027 [P] Amend constitution Technology Constraints "Next.js 15" → "Next.js 16 (App Router)" (PATCH bump) in `.specify/memory/constitution.md` to match the installed stack (plan Stack-version note)
- [X] T028 Run `quickstart.md` validation — apply migration, `npx vitest run` green, confirm the fulfillment CHECK and partial unique index exist. **Result**: `tsc --noEmit` clean, `eslint` clean, `vitest run` 31 passed/0 failed (18 integration tests correctly skipped — no `DATABASE_URL` in this environment), generated `drizzle/0000_amazing_raza.sql` confirmed to contain `orders_fulfilled_requires_success_check` and the partial `orders_payment_intent_uidx`. Actually applying the migration to a live Postgres instance requires a real `DATABASE_URL`, which this environment does not have — left for the developer per quickstart.md steps 2–3.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3–5)**: all depend on Foundational (esp. T010 DAL skeleton + T006 migration)
- **Polish (Phase 6)**: depends on the methods it extends/verifies

### Key task dependencies

- T009 → T008; T010 → {T005, T006, T007, T008, T009}
- T004 (env config) and T005 (client) are independent; T005 reads the env var itself, so it does not depend on the config task
- T006 is independent (`drizzle-kit generate` reads only `lib/db/schema.ts` + `drizzle.config.ts`; a live DB/client is needed only later for `db:migrate`)
- US1 impl (T013, T014) → T010
- US2 impl (T017–T019) → T010, T007
- US3 impl (T021, T022) → T017, T018
- Polish T024 → T010; T028 → all desired stories complete

### Within/across stories on the shared repository file

`features/orders/data/order.repository.ts` is edited by T010, T013–T014, T017–T019, T021–T024.
These are **sequential** (same file) — not marked [P] with each other. Each story's **tests**
live in separate files and ARE [P].

---

## Parallel Opportunities

- **Setup**: T002, T003 in parallel (T001 edits `package.json` alone).
- **Foundational**: T004, T006, T007, T008 in parallel (distinct files/config); T005 is independent too; T008→T009→T010 is the sequential spine.
- **Tests**: T011+T012 (US1), T015+T016 (US2), T020 (US3), T025 (Polish) each [P] within their step.
- **Across stories**: once Foundational is done, US1/US2/US3 test files can be authored in parallel; the repository-method implementations serialize on the one file.

### Parallel Example: Foundational

```bash
# These are independent files (T006 needs only schema+config, not the T005 client):
Task: "T006 Drizzle schema in lib/db/schema.ts (+ drizzle.config.ts, db:generate)"
Task: "T007 payment-status domain in features/orders/domain/payment-status.ts"
Task: "T008 order types in features/orders/types/order.types.ts"
```

---

## Implementation Strategy

### MVP scope

US1 and US2 are **both P1** — a "record of truth" is only useful once it can also progress
through its payment lifecycle. Minimum viable increment:

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **validate** (create/retrieve).
4. Phase 4 US2 → **validate** (lifecycle + fulfillment). This is the recommended shippable MVP.

### Incremental delivery

- Foundation ready → US1 (create/retrieve) → US2 (lifecycle) → US3 (idempotency hardening) →
  Polish (notes, PII, verification). Each phase is independently testable via its own test file.

---

## Notes

- [P] = different files, no incomplete dependencies.
- Write each story's tests first and confirm they fail before implementing.
- Integration tests need a reachable Supabase test DB (see quickstart); unit tests (schemas,
  transitions) need no DB.
- Commit after each task or logical group; stop at any checkpoint to validate a story.
- Total: **28 tasks** — Setup 3, Foundational 7, US1 4, US2 5, US3 3, Polish 6.
