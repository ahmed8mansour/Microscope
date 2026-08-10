import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { refunds } from '@/lib/db/schema';
import type { RefundRow } from '../types';

export type { RefundRow } from '../types';

const UNIQUE_VIOLATION = '23505';

function pgCode(err: unknown): unknown {
  if (typeof err !== 'object' || err === null) return undefined;
  if ('code' in err) return (err as { code?: unknown }).code;
  if ('cause' in err) return pgCode((err as { cause?: unknown }).cause);
  return undefined;
}

function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === UNIQUE_VIOLATION;
}

export class RefundExistsError extends Error {
  constructor(orderId: string) {
    super(`A refund already exists for order ${orderId}`);
    this.name = 'RefundExistsError';
  }
}

function toRefund(row: {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  providerRefundRef: string | null;
  reason: string | null;
  requestedBy: string;
  failureMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RefundRow {
  return {
    id: row.id,
    orderId: row.orderId,
    amount: row.amount,
    currency: row.currency,
    status: row.status as 'requested' | 'failed',
    providerRefundRef: row.providerRefundRef,
    reason: row.reason,
    requestedBy: row.requestedBy,
    failureMessage: row.failureMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// FR-038. Create-if-absent — the unique(order_id) index is the at-most-once
// guard (SC-012); a concurrent/duplicate request hits the constraint and is
// rejected here as `RefundExistsError`, never issuing a second provider call.
export async function createRefundRequest(input: {
  orderId: string;
  amount: number;
  currency: string;
  reason?: string;
  requestedBy: string;
}): Promise<RefundRow> {
  try {
    const [row] = await db
      .insert(refunds)
      .values({
        orderId: input.orderId,
        amount: input.amount,
        currency: input.currency,
        reason: input.reason,
        requestedBy: input.requestedBy,
        status: 'requested',
      })
      .returning();
    return toRefund(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new RefundExistsError(input.orderId);
    }
    throw err;
  }
}

// Stamped once the provider accepts the refund — completes the audit trail
// (FR-040) even though the ORDER's money state still only changes from the
// verified webhook, never from this row.
export async function setProviderRefundRef(orderId: string, providerRefundRef: string): Promise<void> {
  await db.update(refunds).set({ providerRefundRef }).where(eq(refunds.orderId, orderId));
}

// FR-039. Provider rejected/failed — order money state is left untouched by
// the caller; this only records the outcome for the admin.
export async function markRefundFailed(orderId: string, failureMessage: string): Promise<void> {
  await db.update(refunds).set({ status: 'failed', failureMessage }).where(eq(refunds.orderId, orderId));
}

export async function getRefundByOrderId(orderId: string): Promise<RefundRow | null> {
  const [row] = await db.select().from(refunds).where(eq(refunds.orderId, orderId)).limit(1);
  return row ? toRefund(row) : null;
}
