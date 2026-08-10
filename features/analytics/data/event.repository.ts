import 'server-only';

import { db } from '@/lib/db';
import { analyticsEvents } from '@/lib/db/schema';

const UNIQUE_VIOLATION = '23505';

function pgCode(err: unknown): unknown {
  if (typeof err !== 'object' || err === null) return undefined;
  if ('code' in err) return (err as { code?: unknown }).code;
  // drizzle-orm wraps the raw postgres error in a DrizzleQueryError; the pg
  // error code lives on `.cause`, not the top-level object.
  if ('cause' in err) return pgCode((err as { cause?: unknown }).cause);
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === UNIQUE_VIOLATION;
}

export interface RecordEventInput {
  sessionId: string;
  source?: string | null;
  referrer?: string | null;
  campaign?: string | null;
  orderId?: string | null;
}

// FR-026. Insert-if-absent per session — the partial unique index
// (`session_id` where `step='entry'`) is the dedup mechanism, so a repeated
// landing within the same session is a silent no-op (research R9).
export async function recordEntry(input: RecordEventInput): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      step: 'entry',
      sessionId: input.sessionId,
      source: input.source ?? null,
      referrer: input.referrer ?? null,
      campaign: input.campaign ?? null,
      orderId: input.orderId ?? null,
    });
  } catch (err) {
    if (isUniqueViolation(err)) return;
    throw err;
  }
}

// FR-027. Not deduplicated — a customer may reach the payment step more
// than once per session (e.g. after a retry); each is a distinct signal.
export async function recordPayment(input: RecordEventInput): Promise<void> {
  await db.insert(analyticsEvents).values({
    step: 'payment',
    sessionId: input.sessionId,
    source: input.source ?? null,
    referrer: input.referrer ?? null,
    campaign: input.campaign ?? null,
    orderId: input.orderId ?? null,
  });
}

// FR-028. Server-emitted only, from the verified `→ success` transition in
// order-sync — never from a client request. Insert-if-absent per order
// (partial unique index on `order_id` where `step='conversion'`) makes this
// idempotent under duplicate webhook deliveries (SC-008). `sessionId` has
// no real funnel-session context available at this call site (webhooks
// carry no cookies), so the order id is reused as a stand-in value — it
// satisfies the NOT NULL constraint and never collides with the separate
// entry-uniqueness index (different `step`).
export async function recordConversion(orderId: string): Promise<void> {
  try {
    await db.insert(analyticsEvents).values({
      step: 'conversion',
      sessionId: orderId,
      orderId,
    });
  } catch (err) {
    if (isUniqueViolation(err)) return;
    throw err;
  }
}
