import { getCookie } from '@/lib/http/cookies';

// First-party analytics session id — a random cookie value used only to
// de-duplicate funnel entries into unique sessions (research R9). Not
// linked to customer identity; contains no PII.
export const ANALYTICS_SESSION_COOKIE = 'a_sid';

const MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export interface SessionResult {
  sessionId: string;
  isNew: boolean;
}

export function getOrCreateSessionId(request: Request): SessionResult {
  const existing = getCookie(request, ANALYTICS_SESSION_COOKIE);
  if (existing) return { sessionId: existing, isNew: false };
  return { sessionId: crypto.randomUUID(), isNew: true };
}

export function sessionCookieHeader(sessionId: string): string {
  return `${ANALYTICS_SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}
