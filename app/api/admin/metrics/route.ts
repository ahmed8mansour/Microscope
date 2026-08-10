import 'server-only';

import { getDashboardMetrics } from '@/features/admin/data/metrics.repository';
import { requireAdmin } from '../_lib/guard';

export const runtime = 'nodejs';

// GET /api/admin/metrics — see specs/004-admin-dashboard-analytics/contracts/admin-analytics-api.md
export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const metrics = await getDashboardMetrics();
  return Response.json(metrics);
}
