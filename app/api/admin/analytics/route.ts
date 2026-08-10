import 'server-only';

import { analyticsRangeSchema } from '@/features/admin/schemas/analytics-range.schema';
import { getAnalyticsSeries } from '@/features/admin/data/analytics.repository';
import { REPORTING_TIMEZONE } from '@/lib/config/analytics';
import { requireAdmin } from '../_lib/guard';
import { errorResponse } from '../_lib/respond';

export const runtime = 'nodejs';

const DEFAULT_RANGE_DAYS = 30;

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - DEFAULT_RANGE_DAYS * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

// GET /api/admin/analytics — see specs/004-admin-dashboard-analytics/contracts/admin-analytics-api.md
export async function GET(request: Request): Promise<Response> {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const hasFrom = url.searchParams.has('from');
  const hasTo = url.searchParams.has('to');
  const fallback = defaultRange();
  const raw = {
    from: hasFrom ? url.searchParams.get('from') : fallback.from,
    to: hasTo ? url.searchParams.get('to') : fallback.to,
  };

  const parsed = analyticsRangeSchema.safeParse(raw);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const from = new Date(parsed.data.from);
  const to = new Date(parsed.data.to);
  const series = await getAnalyticsSeries({ from, to });

  return Response.json({
    range: { from: from.toISOString(), to: to.toISOString(), timezone: REPORTING_TIMEZONE },
    ...series,
  });
}
