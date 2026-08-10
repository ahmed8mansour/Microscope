import 'server-only';

// Stateless, HMAC-signed admin session token. No user accounts exist
// (Constitution Principle I), so there is nothing to look up — a signed
// token needs no session table and no DB round-trip, which lets the check
// run in Edge middleware (Web Crypto is available there; Node's `crypto`
// module and Drizzle are not). See
// specs/004-admin-dashboard-analytics/research.md R1.

const IDLE_MS = 30 * 60_000; // 30 minutes — refreshed on every authenticated request
const ABSOLUTE_MS = 12 * 60 * 60_000; // 12 hours from login, never refreshed

// Exposed for the cookie's own browser-side Max-Age (belt-and-braces — the
// app-level check above is authoritative regardless).
export const ABSOLUTE_SESSION_SECONDS = ABSOLUTE_MS / 1000;

export interface SessionPayload {
  iat: number; // ms epoch — session start (absolute cap anchor)
  lastSeen: number; // ms epoch — last verified activity (idle-timeout anchor)
}

export interface VerifyResult {
  valid: boolean;
  // Present when valid — the same token with a refreshed `lastSeen` (same
  // `iat`, so the absolute cap is unaffected). Callers re-issue the cookie
  // with this value on every authenticated request.
  refreshedToken?: string;
}

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const b of buf) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET must be set (see .env.example).');
  }
  return secret;
}

async function getKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(payload: SessionPayload): Promise<string> {
  const key = await getKey();
  const payloadB64 = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${base64url(signature)}`;
}

// Verifies the HMAC signature and shape only — does not check expiry.
async function verifySignature(token: string): Promise<SessionPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;

  try {
    const key = await getKey();
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64urlDecode(signatureB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!valid) return null;

    const parsed: unknown = JSON.parse(new TextDecoder().decode(base64urlDecode(payloadB64)));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as SessionPayload).iat !== 'number' ||
      typeof (parsed as SessionPayload).lastSeen !== 'number'
    ) {
      return null;
    }
    return parsed as SessionPayload;
  } catch {
    // Malformed base64/JSON is treated the same as an invalid signature —
    // no session, no error leaked to the caller.
    return null;
  }
}

// Issues a brand-new session token (login).
export async function issueSession(): Promise<string> {
  const now = Date.now();
  return sign({ iat: now, lastSeen: now });
}

// Verifies a session token: signature must match AND idle (<=30m since
// lastSeen) AND absolute (<=12h since iat) must both hold. On success,
// returns a refreshed token with the same `iat` and a new `lastSeen`.
export async function verifySession(token: string | undefined | null): Promise<VerifyResult> {
  if (!token) return { valid: false };

  const payload = await verifySignature(token);
  if (!payload) return { valid: false };

  const now = Date.now();
  if (now - payload.lastSeen > IDLE_MS) return { valid: false };
  if (now - payload.iat > ABSOLUTE_MS) return { valid: false };

  const refreshedToken = await sign({ iat: payload.iat, lastSeen: now });
  return { valid: true, refreshedToken };
}
