import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { webhookEvents } from '@/lib/db/schema';

// Postgres unique_violation error code.
const UNIQUE_VIOLATION = '23505';

function pgCode(err: unknown): unknown {
  if (typeof err !== 'object' || err === null) return undefined;
  if ('code' in err) return (err as { code?: unknown }).code;
  // drizzle-orm wraps the raw postgres error in a DrizzleQueryError; the
  // pg error code lives on `.cause`, not the top-level object.
  if ('cause' in err) return pgCode((err as { cause?: unknown }).cause);
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === UNIQUE_VIOLATION;
}

// FR-009/009a. The event id is the primary key — its presence is the
// idempotency mechanism.
export async function hasProcessed(eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: webhookEvents.id })
    .from(webhookEvents)
    .where(eq(webhookEvents.id, eventId))
    .limit(1);
  return Boolean(row);
}

export type WebhookEventOutcome = 'processed' | 'ignored' | 'flagged';

// FR-014a. Insert-if-absent: a concurrent duplicate insert (same event id)
// is swallowed as a no-op rather than an error, keeping dedup atomic under
// concurrency (SC-002).
export async function recordEvent(
  id: string,
  type: string,
  outcome: WebhookEventOutcome,
  orderId?: string
): Promise<void> {
  try {
    await db.insert(webhookEvents).values({ id, type, outcome, orderId });
  } catch (err) {
    if (isUniqueViolation(err)) return;
    throw err;
  }
}
