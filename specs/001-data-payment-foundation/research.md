# Phase 0 Research: Data & Payment Foundation

All Technical Context unknowns are resolved below. Findings are grounded in the repository's
installed versions and the bundled Next.js 16 docs (`node_modules/next/dist/docs/`), per
AGENTS.md ("this is NOT the Next.js you know — read the bundled guide before writing code").

## D1. Installed framework version — Next 16, not 15

- **Decision**: Target **Next.js 16.2.12 / React 19.2.4 / TypeScript 5** as installed.
- **Rationale**: `package.json` pins `next@16.2.12`, `react@19.2.4`. The constitution's
  "Next.js 15" line is stale relative to the repo. Building to the installed version avoids
  fighting removed/renamed APIs.
- **v16 facts that affect this feature** (from `upgrading/version-16.md`):
  - `serverRuntimeConfig` / `publicRuntimeConfig` are **removed** → read secrets directly from
    `process.env` inside the DAL.
  - Turbopack is the default bundler; `next lint` is removed (use ESLint CLI / Biome).
  - Async request APIs (`cookies`, `headers`, `params`) are irrelevant here — the data layer
    takes none of them.
- **Alternatives considered**: Downgrade to Next 15 to match the constitution — rejected;
  needlessly regresses the repo. Instead recommend a PATCH constitution amendment.

## D2. Where DB credentials live — server-only Data Access Layer

- **Decision**: Implement a **Data Access Layer (DAL)** in `features/orders/data/order.repository.ts`
  as the sole path through which orders are created/read/transitioned. `DATABASE_URL` is read
  and validated only in `lib/db/index.ts`, where the Drizzle client is built; both that module
  and the DAL carry `import 'server-only'`. (A dedicated `lib/env.ts` is intentionally omitted
  — one secret does not warrant a separate module (Principle I / YAGNI); introduce it when a
  later spec adds more secrets, e.g. Stripe/OTP keys.)
- **Rationale**: The bundled `data-security.md` guide explicitly recommends a DAL for new
  projects: "Only the Data Access Layer should access `process.env`. This keeps secrets from
  being exposed to other parts of the application," and `import 'server-only'` "causes a
  build error if the module is imported in the client environment." This directly satisfies
  Constitution Principle IV.
- **Alternatives considered**: Component-level DB access — rejected by the guide as
  exposure-prone. HTTP-API layer — overkill for an MVP with no separate backend team.

## D3. Data access — Drizzle ORM over the Supabase Postgres connection (server-only)

- **Decision**: Use **Drizzle ORM** as the typed data-access layer against the Supabase
  PostgreSQL database. Add `drizzle-orm` + the `postgres` (postgres.js) driver, and
  `drizzle-kit` (dev) for schema-as-code and migration generation. The Drizzle client is
  constructed in `lib/db/index.ts` (`import 'server-only'`); the table is defined in
  `lib/db/schema.ts`; migrations are generated into `drizzle/` from the schema.
- **Rationale**: Chosen over Prisma and over the raw `@supabase/supabase-js` client. Drizzle
  is serverless-friendly (no query-engine binary, negligible cold start on Vercel), gives
  first-class TypeScript inference without a runtime codegen step, and compiles schema-as-TS
  to plain SQL migrations — which fits the spec's "schema should evolve" note. Crucially, the
  constraints this feature needs are all expressible in Drizzle: `check()` for the amount /
  currency / status / fulfillment rules, and a **partial** unique index via
  `uniqueIndex(...).on(...).where(sql\`... is not null\`)`.
- **Connection on Vercel serverless**: connect via the **Supabase transaction pooler**
  connection string (port `6543`) using postgres.js with `{ prepare: false }` (transaction-mode
  pooling does not support prepared statements). A single `DATABASE_URL` env var holds this
  string. This keeps DB credentials server-side; the `server-only` guard on `lib/db` enforces
  it. Row Level Security is enabled on the table as defence-in-depth (no anon policies — all
  access in this feature is trusted server code).
- **updated_at**: handled at the ORM layer via Drizzle's `$onUpdate(() => new Date())` rather
  than a DB trigger — one less migration artifact, satisfies FR-008.
- **Prisma rejected because**: heaviest option on Vercel serverless (engine binary, larger
  bundle, cold-start cost), assumes it owns the schema, and would still need raw-SQL escape
  hatches for the partial unique index and the fulfillment CHECK — no net advantage here.
- **Raw supabase-js rejected because**: the PostgREST query builder is less ergonomic for the
  guarded writes/transitions this DAL performs, and types come from a separate `gen types`
  step rather than being inferred from a single schema source. (`@supabase/supabase-js` may
  still return in later features for auth/storage; it is simply not the DB-access tool here.)

## D4. Validation — Zod at the DAL boundary

- **Decision**: Add `zod`. Every public DAL write method validates its input with a Zod
  schema (`features/orders/schemas/order.schema.ts`) before touching the DB; parse failures
  throw a typed validation error and never reach Supabase.
- **Rationale**: Constitution IV ("validate every request server-side with Zod; never trust
  client values") and FR-009 (reject malformed creation). Centralizing validation in the DAL
  guarantees no write bypasses it.
- **Alternatives considered**: DB constraints only — insufficient; gives poor error messages
  and doesn't cover business rules like contact-format. DB constraints are kept as a second
  layer, not the only one.

## D5. Money representation — integer minor units

- **Decision**: Store `amount` as a **`bigint` in the currency's smallest unit** (e.g. cents).
  Currency stored per-row as a 3-char ISO-4217 code.
- **Rationale**: Spec Assumptions + FR-011 (no rounding drift) + SC-006 (exact minor-unit
  reconciliation). Integer minor units match Stripe's own amount convention, so later
  reconciliation is a direct comparison.
- **Alternatives considered**: `numeric`/decimal — acceptable but invites float coercion in
  JS; `float` — rejected outright (drift).

## D6. Status vocabulary storage — text + CHECK constraint (not a native enum)

- **Decision**: Store `payment_status` as `text` with a `CHECK` constraint limiting it to
  `pending / success / failed / refunded`, mirrored by a Zod enum + a TypeScript union.
- **Rationale**: The spec's Note expects the schema to evolve; a `CHECK` constraint is far
  cheaper to amend than a Postgres `ENUM` type (`ALTER TYPE ... ADD VALUE` is restrictive and
  non-transactional). Three representations (DB CHECK, Zod enum, TS union) stay in lockstep
  as the single source of allowed values.
- **Alternatives considered**: Native `CREATE TYPE ... AS ENUM` — rejected for evolvability;
  a lookup table — over-engineered for four fixed values (violates Principle I).

## D7. Idempotency & retry — partial unique index + upsert-by-reference

- **Decision**: Partial **unique index** on `stripe_payment_intent_id WHERE ... IS NOT NULL`.
  The DAL exposes an upsert-by-purchase operation so repeated notifications for one payment
  resolve to the same row (FR-007, US3), and a retry after failure updates the existing
  order's reference + status rather than inserting (FR-007a).
- **Rationale**: Postgres treats multiple NULLs as distinct, so orders created before a
  PaymentIntent exists don't collide, while any real reference is globally unique. Enforcing
  this at the DB layer makes idempotency true even under concurrent webhook deliveries
  (Edge Case: race for same reference).
- **Alternatives considered**: App-level "check then insert" — rejected; racy. A dedicated
  idempotency-key table — deferred to the webhook spec (#6) where event ids matter; the
  unique payment reference is sufficient for this layer.

## D8. Fulfillment integrity — DB CHECK + guarded DAL method

- **Decision**: `fulfilled boolean` column with a table `CHECK (NOT fulfilled OR
  payment_status = 'success')`, plus a `markFulfilled` DAL method that refuses non-`success`
  orders.
- **Rationale**: FR-006 / SC-005 (zero fulfilled-while-not-success). Enforced in both the DAL
  (clear error) and the DB (last line of defence).

## D9. PII deletion/anonymization — nullable contact columns, financial record retained

- **Decision**: `email` and `whatsapp` columns are **nullable at the DB level** (presence
  enforced at creation by Zod/the DAL, per FR-009). An `anonymizePii` DAL method nulls/masks
  them while leaving amount, currency, status, reference, and timestamps intact.
- **Rationale**: FR-013 + SC-007 (delete contact PII without deleting the financial record).
  Keeping the columns non-null would block anonymization; enforcing presence at the
  write boundary preserves data quality without blocking erasure.
- **Alternatives considered**: Hard-deleting the row — rejected; destroys the financial
  record needed for reconciliation. Separate PII table — deferred; unnecessary for two fields
  at MVP scale.

## D10. Testing approach

- **Decision**: Add **Vitest**. Unit-test the status-transition guards and Zod schemas with
  no DB; integration-test the repository against a local/test Supabase database.
- **Rationale**: The high-value logic (allowed transitions, validation, idempotent upsert,
  fulfillment guard) is testable in isolation; idempotency and constraints need a real DB.
- **Alternatives considered**: Jest — heavier config with ESM/TS; Playwright — for later UI
  specs, not this data layer.
