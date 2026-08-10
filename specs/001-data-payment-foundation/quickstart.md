# Quickstart: Data & Payment Foundation

How to stand up and verify this feature locally. No UI is involved — verification is schema +
DAL behavior.

## Prerequisites

- Node.js ≥ 20.9 (Next 16 requirement)
- A Supabase project (cloud) or local Supabase, with connection details
- Repo dependencies installed (`npm install`)

## 1. Install feature dependencies

```bash
npm install drizzle-orm postgres zod server-only
npm install -D drizzle-kit vitest
```

## 2. Environment variables

Copy the committed template to `.env.local` (gitignored — never committed) and fill in the
real value. Only `lib/db` (server-only) reads and validates it:

```bash
cp .env.example .env.local
# then edit .env.local:
# Supabase transaction pooler connection string (port 6543) for serverless
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
```

Secrets carry **no `NEXT_PUBLIC_` prefix** — that prefix would inline the value into the
browser bundle. `.env.example` holds placeholders only.

> Per Next 16, `serverRuntimeConfig`/`publicRuntimeConfig` are gone — the secret is read
> directly from `process.env` inside `lib/db` (server-only). It is not prefixed
> `NEXT_PUBLIC_`, so it cannot reach the browser bundle. The postgres.js client is created
> with `{ prepare: false }` because transaction-mode pooling doesn't support prepared
> statements.

## 3. Generate and apply the database migration

The `orders` table is defined in `lib/db/schema.ts`. Generate the SQL migration from it and
apply it:

```bash
npx drizzle-kit generate   # emits SQL into drizzle/ from lib/db/schema.ts
npx drizzle-kit migrate    # applies pending migrations to DATABASE_URL
```

This creates the `orders` table with all CHECK constraints, the partial unique index on the
payment reference, and the `created_at`/`updated_at` columns. RLS is enabled via a statement
included in the schema/migration.

## 4. Verify the model behaves

Run the tests:

```bash
npx vitest run
```

Expected coverage maps to the spec:

- **Create** an order → status `pending`, `fulfilled=false`, timestamps set (US1 / FR-001).
- **Reject** malformed input — bad email, negative amount, 2-char currency (FR-009).
- **Status transitions** — allow `pending→success`, `success→refunded`; reject
  `failed→refunded`, `refunded→success` (US2 / FR-004).
- **Idempotency** — applying the same status twice, or attaching the same payment reference
  twice, is a safe no-op; a second order cannot claim a used reference (US3 / FR-007 / SC-003).
- **Retry** — a `failed` order reused with a new reference stays one row (FR-007a).
- **Fulfillment guard** — `markFulfilled` succeeds only on `success` (FR-006 / SC-005).
- **PII anonymization** — `anonymizePii` clears contact fields, keeps the financial record
  (FR-013 / SC-007).

## 5. Manual smoke check (optional)

From a server context (e.g. a throwaway Route Handler or a `tsx` script), import the DAL and:

```ts
import { createOrder, updatePaymentStatus, markFulfilled } from '@/features/orders';

const o = await createOrder({ email: 'a@b.com', whatsapp: '+10000000000', amount: 4999, currency: 'USD' });
await updatePaymentStatus(o.id, 'success', { receiptUrl: 'https://…' });
await markFulfilled(o.id); // succeeds only because status is 'success'
```

Importing `@/features/orders` from a `'use client'` module MUST fail the build — that is the
`server-only` guard working as intended.

## Definition of done

- Migration applies cleanly; all constraints present (verify the fulfillment CHECK and the
  partial unique index exist).
- `vitest run` is green.
- The DAL cannot be imported client-side (build error if attempted).
