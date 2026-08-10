// Tiny shared cookie-header reader. Route handlers in this codebase are
// tested by constructing plain `Request` objects (no running Next server),
// so cookie reads go through the raw `Cookie` header rather than
// `next/headers`' request-scoped `cookies()` API.
export function getCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}
