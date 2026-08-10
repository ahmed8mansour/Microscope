import 'server-only';

import { getOrderDetail } from '@/features/admin/data/orders.repository';
import { requireAdmin } from '../../_lib/guard';
import { errorResponse } from '../../_lib/respond';

export const runtime = 'nodejs';

// GET /api/admin/orders/{id} — see specs/004-admin-dashboard-analytics/contracts/admin-orders-api.md
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  const detail = await getOrderDetail(id);
  if (!detail) {
    return errorResponse(404, 'not_found', 'Order not found');
  }
  return Response.json(detail);
}
