import 'server-only';

import { loginSchema } from '@/features/admin/schemas/login.schema';
import { login } from '@/features/admin/services/login.service';
import { setSessionCookieHeader } from '@/lib/auth';
import { errorResponse, parseJsonBody } from '../_lib/respond';

export const runtime = 'nodejs';

function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}

// POST /api/admin/login — see specs/004-admin-dashboard-analytics/contracts/admin-auth-api.md
export async function POST(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_request', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const ip = clientIp(request);
  const result = await login(parsed.data.password, ip);

  if (result.outcome === 'locked') {
    return errorResponse(429, 'locked', 'Too many failed attempts. Try again later.');
  }
  if (result.outcome === 'invalid_credentials') {
    return errorResponse(401, 'invalid_credentials', 'Incorrect password');
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'set-cookie': setSessionCookieHeader(result.token),
    },
  });
}
