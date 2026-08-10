import 'server-only';

import { verifySession } from '@/lib/auth/session';
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/cookie';
import { getCookie } from '@/lib/http/cookies';
import { errorResponse } from './respond';

// Defense-in-depth re-verify at the data boundary (middleware already gates
// the route by matcher, but each handler re-checks — Principle IV). Returns
// a 401 Response when the session is missing/invalid/expired; callers
// return it directly. Reads the `Cookie` header off the request directly
// (not `next/headers`) so routes stay testable by constructing a plain
// `Request` — matching this codebase's existing route-handler test style.
export async function requireAdmin(request: Request): Promise<Response | null> {
  const token = getCookie(request, ADMIN_SESSION_COOKIE);
  const result = await verifySession(token);
  if (!result.valid) {
    return errorResponse(401, 'unauthorized', 'Admin session required');
  }
  return null;
}
