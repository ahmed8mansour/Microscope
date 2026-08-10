import 'server-only';

import { ordersQuerySchema } from '@/features/admin/schemas/orders-query.schema';
import { listOrders } from '@/features/admin/data/orders.repository';
import { requireAdmin } from '../_lib/guard';
import { errorResponse } from '../_lib/respond';

export const runtime = 'nodejs';

// GET /api/admin/orders — see specs/004-admin-dashboard-analytics/contracts/admin-orders-api.md
export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = ordersQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const result = await listOrders(parsed.data);
  return Response.json(result);
}
