import 'server-only';

import {
  markFulfilled,
  updateSupplierRefs,
  getOrderById,
  NotFoundError,
  NotFulfillableError,
} from '@/features/orders';
import { fulfillRequestSchema } from '@/features/admin/schemas/fulfill.schema';
import { requireAdmin } from '../../../_lib/guard';
import { errorResponse } from '../../../_lib/respond';

export const runtime = 'nodejs';

// POST /api/admin/orders/{id}/fulfill — records supplier order/tracking refs
// and/or marks the order fulfilled (feature 005). A bodyless POST preserves the
// 004 behaviour of simply marking fulfilled. Recording refs never changes
// `payment_status` (FR-014). See
// specs/005-quantity-shipping-fulfillment/contracts/admin-fulfillment.md
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  // Empty body (legacy 004 fulfill button) → mark fulfilled. Otherwise use the
  // explicit fields.
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    raw = undefined;
  }
  const parsed = fulfillRequestSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return errorResponse(400, 'invalid_input', parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { supplierOrderRef, supplierTrackingRef, fulfilled } = parsed.data;
  const shouldFulfill = raw === undefined ? true : fulfilled === true;

  try {
    if (supplierOrderRef !== undefined || supplierTrackingRef !== undefined) {
      await updateSupplierRefs(id, { supplierOrderRef, supplierTrackingRef });
    }
    if (shouldFulfill) {
      await markFulfilled(id);
    }
    const order = await getOrderById(id);
    if (!order) {
      return errorResponse(404, 'not_found', 'Order not found');
    }
    return Response.json({ order });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return errorResponse(404, 'not_found', 'Order not found');
    }
    if (err instanceof NotFulfillableError) {
      return errorResponse(409, 'not_fulfillable', err.message);
    }
    throw err;
  }
}
