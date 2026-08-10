import { NextResponse, type NextRequest } from 'next/server';
import { verifySession } from '@/lib/auth/session';
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_COOKIE_OPTIONS } from '@/lib/auth/cookie';

// Edge runtime — deliberately imports only `session.ts` + `cookie.ts`
// (Web Crypto only), never the `@/lib/auth` barrel, which also pulls in
// `password.ts` (node:crypto, unsupported on Edge). See
// specs/004-admin-dashboard-analytics/research.md R1/R10.
//
// Named `proxy.ts` per Next.js 16's file-convention rename of
// `middleware.ts` (https://nextjs.org/docs/messages/middleware-to-proxy).
export const config = {
  matcher: ['/admin/:path*', '/api/admin/:path*'],
};

// Excluded from the gate: the login page/route (must be reachable to log
// in) and logout (always allowed to clear a session).
const PUBLIC_PATHS = new Set(['/admin/login', '/api/admin/login', '/api/admin/logout']);

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const result = await verifySession(token);

  if (!result.valid) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: { code: 'unauthorized', message: 'Admin session required' } },
        { status: 401 }
      );
    }
    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Idle-timeout refresh: same `iat` (absolute cap untouched), new
  // `lastSeen`. Re-verified per-handler too (defense in depth).
  const response = NextResponse.next();
  if (result.refreshedToken) {
    response.cookies.set(ADMIN_SESSION_COOKIE, result.refreshedToken, ADMIN_SESSION_COOKIE_OPTIONS);
  }
  return response;
}
