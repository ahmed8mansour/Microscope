import 'server-only';

import { addNote, getOrderById } from '@/features/orders';
import { noteSchema } from '@/features/admin/schemas/note.schema';
import { requireAdmin } from '../../../_lib/guard';
import { errorResponse, parseJsonBody } from '../../../_lib/respond';

export const runtime = 'nodejs';

// POST /api/admin/orders/{id}/notes — allowed for an order of any payment
// status (FR-017). See specs/004-admin-dashboard-analytics/contracts/admin-orders-api.md
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;

  // Confirm the order exists first so a bad id gets a clean 404 rather than
  // a raw FK-violation error from the insert.
  const order = await getOrderById(id);
  if (!order) {
    return errorResponse(404, 'not_found', 'Order not found');
  }

  const body = await parseJsonBody(request);
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const note = await addNote(id, parsed.data.body);
  return Response.json(note, { status: 201 });
}
