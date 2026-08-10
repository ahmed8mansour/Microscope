import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { computeAmount } from '@/lib/config/product';
import { canFulfill, isValidTransition, type PaymentStatus } from '../domain/payment-status';
import {
  createOrderSchema,
  quantitySchema,
  statusUpdateSchema,
  type CreateOrderSchemaInput,
} from '../schemas/order.schema';
import type { CreateOrderInput, Order, OrderRow } from '../types/order.types';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(orderId: string) {
    super(`Order not found: ${orderId}`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class InvalidTransitionError extends Error {
  constructor(from: PaymentStatus, to: PaymentStatus) {
    super(`Cannot transition payment status from "${from}" to "${to}"`);
    this.name = 'InvalidTransitionError';
  }
}

export class NotFulfillableError extends Error {
  constructor(orderId: string, status: PaymentStatus) {
    super(`Order ${orderId} cannot be fulfilled while payment status is "${status}"`);
    this.name = 'NotFulfillableError';
  }
}

// Exported (aliased) via the feature barrel as `orderFromRow` — the single
// source of truth for the DB-row → domain-type mapping, reused by
// `features/admin` so it doesn't duplicate this conversion.
export function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.userId,
    amount: row.amount,
    currency: row.currency,
    quantity: row.quantity,
    paymentStatus: row.paymentStatus as PaymentStatus,
    fulfilled: row.fulfilled,
    stripePaymentIntentId: row.stripePaymentIntentId,
    stripeReceiptUrl: row.stripeReceiptUrl,
    stripeCustomerId: row.stripeCustomerId,
    notes: row.notes,
    supplierOrderRef: row.supplierOrderRef,
    supplierTrackingRef: row.supplierTrackingRef,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

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

async function requireOrder(orderId: string): Promise<OrderRow> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) throw new NotFoundError(orderId);
  return row;
}

function parseCreateInput(input: CreateOrderInput): CreateOrderSchemaInput {
  const result = createOrderSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(result.error.issues.map((i) => i.message).join('; '));
  }
  return result.data;
}

// FR-001, FR-002, FR-009. New orders always start pending/not-fulfilled.
// Callers are expected to have already verified the user (FR-009); this DAL
// only requires a userId, not the user's verified state.
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const parsed = parseCreateInput(input);
  const [row] = await db
    .insert(orders)
    .values({
      userId: parsed.userId,
      amount: parsed.amount,
      currency: parsed.currency,
      quantity: parsed.quantity,
    })
    .returning();
  return toOrder(row);
}

// FR-010, SC-004.
export async function getOrderById(id: string): Promise<Order | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  return row ? toOrder(row) : null;
}

// FR-010, SC-004.
export async function getOrderByPaymentReference(ref: string): Promise<Order | null> {
  const [row] = await db
    .select()
    .from(orders)
    .where(eq(orders.stripePaymentIntentId, ref))
    .limit(1);
  return row ? toOrder(row) : null;
}

// FR-007. Idempotent: re-attaching the same reference to the same order is a
// no-op. A different order claiming an already-used reference is a conflict
// (enforced by the partial unique index; SC-001).
export async function attachPaymentReference(orderId: string, ref: string): Promise<Order> {
  const current = await requireOrder(orderId);
  if (current.stripePaymentIntentId === ref) {
    return toOrder(current);
  }
  try {
    const [row] = await db
      .update(orders)
      .set({ stripePaymentIntentId: ref })
      .where(eq(orders.id, orderId))
      .returning();
    return toOrder(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        `Payment reference "${ref}" is already attached to a different order`
      );
    }
    throw err;
  }
}

// FR-004, FR-008, SC-002, SC-003. Re-applying the current status (and
// unchanged meta) is an idempotent no-op — safe under duplicate webhooks.
// On the FIRST verified transition to `success`, stamps `paidAt` (never
// overwritten afterwards, including by a later `refunded`) — this anchors
// admin revenue windows and the refund eligibility window (feature 004).
export async function updatePaymentStatus(
  orderId: string,
  next: PaymentStatus,
  meta?: { receiptUrl?: string; customerId?: string }
): Promise<Order> {
  statusUpdateSchema.parse({ status: next, receiptUrl: meta?.receiptUrl, customerId: meta?.customerId });

  const current = await requireOrder(orderId);
  const currentStatus = current.paymentStatus as PaymentStatus;

  if (!isValidTransition(currentStatus, next)) {
    throw new InvalidTransitionError(currentStatus, next);
  }

  const willStampPaidAt = next === 'success' && !current.paidAt;

  const noStatusChange = currentStatus === next;
  const noMetaChange =
    (meta?.receiptUrl === undefined || meta.receiptUrl === current.stripeReceiptUrl) &&
    (meta?.customerId === undefined || meta.customerId === current.stripeCustomerId);

  if (noStatusChange && noMetaChange && !willStampPaidAt) {
    return toOrder(current);
  }

  const [row] = await db
    .update(orders)
    .set({
      paymentStatus: next,
      ...(meta?.receiptUrl !== undefined ? { stripeReceiptUrl: meta.receiptUrl } : {}),
      ...(meta?.customerId !== undefined ? { stripeCustomerId: meta.customerId } : {}),
      ...(willStampPaidAt ? { paidAt: new Date() } : {}),
    })
    .where(eq(orders.id, orderId))
    .returning();
  return toOrder(row);
}

// FR-007a. Reuses the same order row for a retry after failure — no new
// record is created, keeping one order per purchase regardless of retry
// count. Stricter than the general transition table: only a currently
// `failed` order may be retried (unlike updatePaymentStatus's same-status
// no-op, retrying a `pending` order is not a valid retry).
export async function recordRetry(orderId: string, newRef: string): Promise<Order> {
  const current = await requireOrder(orderId);
  const currentStatus = current.paymentStatus as PaymentStatus;
  if (currentStatus !== 'failed') {
    throw new InvalidTransitionError(currentStatus, 'pending');
  }
  try {
    const [row] = await db
      .update(orders)
      .set({ paymentStatus: 'pending', stripePaymentIntentId: newRef })
      .where(eq(orders.id, orderId))
      .returning();
    return toOrder(row);
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new ConflictError(
        `Payment reference "${newRef}" is already attached to a different order`
      );
    }
    throw err;
  }
}

// Feature 005 (FR-002a). Re-price a still-pending order to a new quantity,
// recomputing the server-authoritative total (`unitAmount × quantity`) and
// writing `quantity` + `amount` together so the invariant
// `amount === unitAmount × quantity` always holds. Only a `pending` order may
// be re-priced — a settled order raises `ConflictError`, which the route maps
// to 409 `not_repriceable` (the intent must not be re-priced once confirming).
export async function repriceOrder(orderId: string, quantity: number): Promise<Order> {
  const q = quantitySchema.parse(quantity);
  const current = await requireOrder(orderId);
  if ((current.paymentStatus as PaymentStatus) !== 'pending') {
    throw new ConflictError(`Order ${orderId} is not pending and cannot be re-priced`);
  }
  const amount = computeAmount(q);
  const [row] = await db
    .update(orders)
    .set({ quantity: q, amount })
    .where(eq(orders.id, orderId))
    .returning();
  return toOrder(row);
}

// FR-005, FR-006, SC-005. Only permitted while payment status is success.
export async function markFulfilled(orderId: string): Promise<Order> {
  const current = await requireOrder(orderId);
  const status = current.paymentStatus as PaymentStatus;
  if (!canFulfill(status)) {
    throw new NotFulfillableError(orderId, status);
  }
  if (current.fulfilled) {
    return toOrder(current);
  }
  const [row] = await db
    .update(orders)
    .set({ fulfilled: true })
    .where(eq(orders.id, orderId))
    .returning();
  return toOrder(row);
}

// Feature 005 (FR-014). Records admin-supplied supplier order/tracking
// references. Only sets the fields provided; NEVER changes `payment_status`
// (fulfillment ≠ payment). A call with neither field is a no-op read.
export async function updateSupplierRefs(
  orderId: string,
  refs: { supplierOrderRef?: string; supplierTrackingRef?: string }
): Promise<Order> {
  const current = await requireOrder(orderId);
  if (refs.supplierOrderRef === undefined && refs.supplierTrackingRef === undefined) {
    return toOrder(current);
  }
  const [row] = await db
    .update(orders)
    .set({
      ...(refs.supplierOrderRef !== undefined ? { supplierOrderRef: refs.supplierOrderRef } : {}),
      ...(refs.supplierTrackingRef !== undefined
        ? { supplierTrackingRef: refs.supplierTrackingRef }
        : {}),
    })
    .where(eq(orders.id, orderId))
    .returning();
  return toOrder(row);
}

// FR-012. Never touches payment or fulfillment state.
export async function updateNotes(orderId: string, notes: string): Promise<Order> {
  await requireOrder(orderId);
  const [row] = await db
    .update(orders)
    .set({ notes })
    .where(eq(orders.id, orderId))
    .returning();
  return toOrder(row);
}
