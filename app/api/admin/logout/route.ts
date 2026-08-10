import 'server-only';

import { clearSessionCookieHeader } from '@/lib/auth';

// POST /api/admin/logout — always 200, idempotent. See
// specs/004-admin-dashboard-analytics/contracts/admin-auth-api.md
export async function POST(): Promise<Response> {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': clearSessionCookieHeader(),
    },
  });
}
