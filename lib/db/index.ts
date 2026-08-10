import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Sole reader of DATABASE_URL. Per the project constitution, database
// credentials must never reach the client — this module is server-only.
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env.local and fill in your ' +
      'Supabase connection string (see specs/001-data-payment-foundation/quickstart.md).'
  );
}

// Supabase transaction-mode pooler (port 6543) does not support prepared
// statements — prepare must stay false for serverless connections.
const client = postgres(databaseUrl, { prepare: false });

export const db = drizzle(client, { schema });
