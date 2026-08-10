import 'server-only';

import { refundSchema } from '@/features/admin/schemas/refund.schema';
import { requestRefund } from '@/features/admin/services/refund.service';
import { requireAdmin } from '../../../_lib/guard';
import { errorResponse, parseJsonBody } from '../../../_lib/respond';

export const runtime = 'nodejs';

// POST /api/admin/orders/{id}/refund — see
// specs/004-admin-dashboard-analytics/contracts/admin-orders-api.md
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  const body = await parseJsonBody(request);
  const parsed = refundSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const result = await requestRefund(id, parsed.data.reason);

  switch (result.outcome) {
    case 'not_found':
      return errorResponse(404, 'not_found', 'Order not found');
    case 'not_refundable':
      return errorResponse(409, 'not_refundable', 'This order is not eligible for a refund');
    case 'already_exists':
      return errorResponse(409, 'refund_exists', 'A refund has already been requested for this order');
    case 'provider_error':
      return errorResponse(502, 'provider_error', result.message);
    case 'requested':
      return Response.json({ status: 'requested' }, { status: 202 });
  }
}
