import 'server-only';

import { and, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders, refunds } from '@/lib/db/schema';
import { orderFromRow, listNotes, type Order, type OrderNote, type PaymentStatus } from '@/features/orders';
import { getByOrderId as getShippingAddress } from '@/features/shipping/data/shipping-address.repository';
import type { StoredShippingAddress } from '@/features/shipping';
import { isRefundable } from '../domain/refund-policy';
import { getRefundByOrderId, type RefundRow } from './refund.repository';
import type { OrderWithRefundable, RefundState } from '../types';

export type { OrderWithRefundable, RefundState } from '../types';

// `refundable` (the admin can START a refund) requires the policy to pass AND
// no refund to already exist — an order with a requested/failed refund is not
// eligible for a new one (at-most-one, unique per order). `refundState`
// surfaces an in-progress/failed refund so the list can label it rather than
// misleadingly showing "Eligible".
function withRefund(order: Order, refundState: RefundState): OrderWithRefundable {
  return { ...order, refundState, refundable: isRefundable(order) && refundState === 'none' };
}

export interface ListOrdersFilter {
  status?: PaymentStatus;
  fulfilled?: boolean;
  cursor?: string;
  limit?: number;
}

export interface ListOrdersResult {
  orders: OrderWithRefundable[];
  nextCursor: string | null;
}

interface Cursor {
  createdAt: string; // ISO
  id: string;
}

function encodeCursor(order: Order): string {
  const payload: Cursor = { createdAt: order.createdAt, id: order.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeCursor(cursor: string): Cursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as Cursor).createdAt !== 'string' ||
      typeof (parsed as Cursor).id !== 'string'
    ) {
      return null;
    }
    return parsed as Cursor;
  } catch {
    return null;
  }
}

// FR-012, FR-019, SC-006. Keyset pagination ordered `created_at desc, id
// desc` — stays O(page) regardless of table size, riding the existing
// `orders_created_at_idx` (research R7). Returns every stored order field
// (FR-012), not a trimmed summary.
export async function listOrders(filter: ListOrdersFilter = {}): Promise<ListOrdersResult> {
  const limit = filter.limit ?? 50;
  const conditions = [];

  if (filter.status) conditions.push(eq(orders.paymentStatus, filter.status));
  if (filter.fulfilled !== undefined) conditions.push(eq(orders.fulfilled, filter.fulfilled));

  if (filter.cursor) {
    const decoded = decodeCursor(filter.cursor);
    if (decoded) {
      const cursorDate = new Date(decoded.createdAt);
      conditions.push(
        or(
          lt(orders.createdAt, cursorDate),
          and(eq(orders.createdAt, cursorDate), lt(orders.id, decoded.id))
        )
      );
    }
  }

  const rows = await db
    .select()
    .from(orders)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit + 1); // one extra row reveals whether a next page exists

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const pageOrders = pageRows.map(orderFromRow);
  const nextCursor = hasMore ? encodeCursor(pageOrders[pageOrders.length - 1]) : null;

  // Batch-fetch refund state for the page (unique per order) so the list can
  // tell "eligible" apart from "refund already requested/failed".
  const ids = pageOrders.map((o) => o.id);
  const refundRows = ids.length
    ? await db
        .select({ orderId: refunds.orderId, status: refunds.status })
        .from(refunds)
        .where(inArray(refunds.orderId, ids))
    : [];
  const refundByOrder = new Map<string, RefundState>(
    refundRows.map((r) => [r.orderId, r.status as RefundState])
  );

  return {
    orders: pageOrders.map((o) => withRefund(o, refundByOrder.get(o.id) ?? 'none')),
    nextCursor,
  };
}

export interface OrderDetail {
  order: OrderWithRefundable;
  refund: RefundRow | null;
  notes: OrderNote[];
  // Per-order shipping snapshot for the fulfillment panel (feature 005); null
  // when no address was captured (pre-005 / anonymized) — FR-016.
  shippingAddress: StoredShippingAddress | null;
}

// FR-013. Full order detail plus its internal notes and any refund record
// (US5) — `refund` is null when no refund has ever been requested for this
// order (including one issued directly in the provider dashboard, outside
// this admin flow).
export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const [row] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!row) return null;
  const order = orderFromRow(row);
  const [notes, refund, shippingAddress] = await Promise.all([
    listNotes(orderId),
    getRefundByOrderId(orderId),
    getShippingAddress(orderId),
  ]);
  const refundState: RefundState = refund ? (refund.status as RefundState) : 'none';
  return { order: withRefund(order, refundState), refund, notes, shippingAddress };
}
