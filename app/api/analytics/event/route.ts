import 'server-only';

import {
  funnelEventSchema,
  isKnownBot,
  getOrCreateSessionId,
  sessionCookieHeader,
  parseAttribution,
  recordEntry,
  recordPayment,
} from '@/features/analytics';
import { verifySession } from '@/lib/auth/session';
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/cookie';
import { getCookie } from '@/lib/http/cookies';
import { parseJsonBody } from '../../checkout/_lib/respond';

export const runtime = 'nodejs';

// POST /api/analytics/event — public, fire-and-forget. See
// specs/004-admin-dashboard-analytics/contracts/analytics-events.md
export async function POST(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = funnelEventSchema.safeParse(body);
  if (!parsed.success) {
    // `step: "conversion"` (server-emitted only) also lands here — it is
    // not in the accepted enum.
    return new Response(null, { status: 400 });
  }

  const userAgent = request.headers.get('user-agent');
  const adminToken = getCookie(request, ADMIN_SESSION_COOKIE);
  const adminSession = await verifySession(adminToken);

  if (isKnownBot(userAgent) || adminSession.valid) {
    // Silently not recorded — keeps the funnel-entry denominator honest
    // (research R9). Still 204: the client never sees a difference.
    return new Response(null, { status: 204 });
  }

  const { sessionId, isNew } = getOrCreateSessionId(request);
  const attribution = parseAttribution(request.headers.get('referer'), request.url);

  const eventInput = {
    sessionId,
    source: parsed.data.source ?? attribution.source,
    referrer: parsed.data.referrer ?? attribution.referrer,
    campaign: parsed.data.campaign ?? attribution.campaign,
    orderId: parsed.data.orderId ?? null,
  };

  if (parsed.data.step === 'entry') {
    await recordEntry(eventInput);
  } else {
    await recordPayment(eventInput);
  }

  const headers: HeadersInit = {};
  if (isNew) {
    headers['set-cookie'] = sessionCookieHeader(sessionId);
  }
  return new Response(null, { status: 204, headers });
}
