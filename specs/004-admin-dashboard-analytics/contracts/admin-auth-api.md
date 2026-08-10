# Contract: Admin Auth API

Single shared password → stateless signed session cookie. Protects all `/admin` and
`/api/admin` routes. Runtime: `nodejs` (needs DB for lockout). See research R1/R2/R10.

## Session cookie

- Name: `admin_session`; flags `HttpOnly; Secure; SameSite=Lax; Path=/`.
- Value: base64url(`{iat,lastSeen}`) + `.` + base64url(HMAC-SHA-256 over the payload with
  `ADMIN_SESSION_SECRET`).
- Valid iff signature matches AND `now - lastSeen ≤ 30m` (idle) AND `now - iat ≤ 12h` (absolute).
- On each authenticated request the middleware/handler re-issues the cookie with refreshed
  `lastSeen` (same `iat`).

## POST /api/admin/login

Request (JSON): `{ "password": "<string>" }`

| Condition | Status | Body / Effect |
|-----------|--------|---------------|
| IP currently locked (`now < locked_until`) | `429` | `{ error: { code: "locked", message } }` — checked **before** password |
| Missing/invalid body | `400` | `{ error: { code: "invalid_request", message } }` |
| Wrong password | `401` | `{ error: { code: "invalid_credentials", message } }`; attempt recorded (may trigger lock at 5) |
| Correct password | `200` | `Set-Cookie: admin_session=…`; body `{ ok: true }`; attempts row cleared |

- Response never indicates how close the password was (FR-005).
- Password compared with a constant-time equality against `ADMIN_PASSWORD`.

## POST /api/admin/logout

- Always `200`; `Set-Cookie: admin_session=; Max-Age=0` (clears session). Idempotent.

## Protected routes (middleware, Edge)

- Matcher: `/admin/:path*`, `/api/admin/:path*` — **except** `/admin/login`, `/api/admin/login`,
  `/api/admin/logout`.
- No/invalid/expired session:
  - Page request → `302` redirect to `/admin/login?next=<original path>`.
  - API request → `401 { error: { code: "unauthorized" } }`.
- Valid session → refresh cookie, continue. Handlers/server components **re-verify** (defense in
  depth).

## Acceptance mapping

- FR-001/FR-002/FR-003 → protection + server-side password check.
- FR-004 → logout + idle(30m)/absolute(12h) expiry.
- FR-005 → 5-attempts/15-min per-IP lockout, no closeness leak.
- SC-001 → 100% of admin routes unreachable without a valid session.
