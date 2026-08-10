// Wipes all APPLICATION DATA from the database while leaving the schema and
// migration history intact — a clean slate for manual/QA testing.
//
// Truncates (child tables first, though CASCADE handles ordering):
//   order_notes, analytics_events, refunds, webhook_events, orders, users,
//   admin_auth_attempts
// It never drops tables and never touches `drizzle`/`__drizzle_migrations`.
//
// Guarded: requires `--yes` to actually run, so it can't wipe data by
// accident. Refuses if DATABASE_URL looks like a production host.
//
//   node scripts/reset-db-data.mjs --yes

import nextEnv from '@next/env';
import postgres from 'postgres';

nextEnv.loadEnvConfig(process.cwd());

const CONFIRMED = process.argv.includes('--yes');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

if (/prod|production/i.test(databaseUrl)) {
  console.error('Refusing to run: DATABASE_URL looks like production.');
  process.exit(1);
}

const TABLES = [
  'order_notes',
  'analytics_events',
  'refunds',
  'webhook_events',
  'orders',
  'users',
  'admin_auth_attempts',
];

const sql = postgres(databaseUrl, { prepare: false });

async function main() {
  console.log('Row counts BEFORE:');
  for (const t of TABLES) {
    const [{ count }] = await sql`select count(*)::int as count from ${sql(t)}`;
    console.log(`  ${t.padEnd(20)} ${count}`);
  }

  if (!CONFIRMED) {
    console.log('\nDry run (no --yes flag) — nothing was deleted.');
    await sql.end();
    return;
  }

  // One statement so CASCADE + FK ordering is handled atomically.
  await sql.unsafe(`TRUNCATE TABLE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);

  console.log('\nRow counts AFTER:');
  for (const t of TABLES) {
    const [{ count }] = await sql`select count(*)::int as count from ${sql(t)}`;
    console.log(`  ${t.padEnd(20)} ${count}`);
  }
  console.log('\nDatabase data cleared. Schema and migrations untouched.');
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
