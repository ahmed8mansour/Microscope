// Shared cookie identity + flags (contracts/admin-auth-api.md). Kept in its
// own module — deliberately independent of `session.ts`/`password.ts` — so
// Edge middleware can import just this plus `session.ts` without pulling in
// `password.ts`'s `node:crypto` dependency (Edge Runtime forbids Node
// built-ins). `secure` is relaxed outside production so the gate is
// testable over local http.
import { ABSOLUTE_SESSION_SECONDS } from './session';

export const ADMIN_SESSION_COOKIE = 'admin_session';

export const ADMIN_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
};

// Raw `Set-Cookie` header value builders — used by route handlers that
// return plain `Response` objects (this codebase's routes are tested by
// constructing `Request`/`Response` directly, without a running Next
// server, so the request-scoped `next/headers` `cookies()` API is not used
// here).
function baseAttributes(): string {
  const opts = ADMIN_SESSION_COOKIE_OPTIONS;
  const parts = [`Path=${opts.path}`, `SameSite=Lax`];
  if (opts.httpOnly) parts.push('HttpOnly');
  if (opts.secure) parts.push('Secure');
  return parts.join('; ');
}

export function setSessionCookieHeader(token: string): string {
  return `${ADMIN_SESSION_COOKIE}=${token}; ${baseAttributes()}; Max-Age=${ABSOLUTE_SESSION_SECONDS}`;
}

export function clearSessionCookieHeader(): string {
  return `${ADMIN_SESSION_COOKIE}=; ${baseAttributes()}; Max-Age=0`;
}
