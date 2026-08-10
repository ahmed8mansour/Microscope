// One-off / re-runnable backfill for `orders.paid_at` (feature 004).
//
// WHY: `paid_at` is stamped going forward by order-sync on the verified
// `→ success` transition, and the admin refund window (90 days) keys off it.
// Any order that reached `success` BEFORE this column existed has a NULL
// `paid_at`, which makes it permanently non-refundable in the admin — the
// refund action never appears. This backfills those rows from the
// authoritative source: the Stripe charge's creation time. Falls back to the
// order's `updated_at` (its last state change ≈ the success transition) when
// Stripe has no usable charge time.
//
// Safe to re-run: only touches `success`/`refunded` orders whose `paid_at`
// is still NULL. Idempotent.
//
//   node scripts/backfill-order-paid-at.mjs [--dry-run]

import nextEnv from '@next/env';
import postgres from 'postgres';
import Stripe from 'stripe';

nextEnv.loadEnvConfig(process.cwd());

const DRY_RUN = process.argv.includes('--dry-run');

const databaseUrl = process.env.DATABASE_URL;
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');
if (!stripeKey) throw new Error('STRIPE_SECRET_KEY is not set');

const sql = postgres(databaseUrl, { prepare: false });
const stripe = new Stripe(stripeKey);

async function chargeTimeFor(paymentIntentId) {
  if (!paymentIntentId) return null;
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
    const charge = typeof pi.latest_charge === 'object' && pi.latest_charge ? pi.latest_charge : null;
    if (charge?.created) return new Date(charge.created * 1000);
    return null;
  } catch (err) {
    console.warn(`  ! Stripe lookup failed for ${paymentIntentId}: ${err.message}`);
    return null;
  }
}

async function main() {
  const rows = await sql`
    select id, stripe_payment_intent_id, updated_at
    from orders
    where payment_status in ('success', 'refunded') and paid_at is null
    order by created_at asc
  `;

  console.log(`Found ${rows.length} order(s) needing a paid_at backfill${DRY_RUN ? ' (dry run)' : ''}.`);

  let updated = 0;
  for (const row of rows) {
    const fromStripe = await chargeTimeFor(row.stripePaymentIntentId ?? row.stripe_payment_intent_id);
    const paidAt = fromStripe ?? row.updatedAt ?? row.updated_at;
    const source = fromStripe ? 'stripe-charge' : 'updated_at-fallback';
    console.log(`  ${row.id.slice(0, 8)} → ${new Date(paidAt).toISOString()} (${source})`);
    if (!DRY_RUN) {
      await sql`update orders set paid_at = ${paidAt} where id = ${row.id}`;
      updated += 1;
    }
  }

  console.log(DRY_RUN ? 'Dry run complete — no rows written.' : `Backfilled ${updated} order(s).`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
