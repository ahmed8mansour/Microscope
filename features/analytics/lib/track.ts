'use client';

// Fire-and-forget funnel event recording. `keepalive` lets the request
// survive a page unload; the promise is always caught and ignored — a
// slow/blocked/unavailable analytics endpoint MUST NOT affect the funnel
// (FR-030). Never awaited by callers.
export function trackFunnelEvent(step: 'entry' | 'payment', extra?: { orderId?: string }): void {
  try {
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step, ...extra }),
      keepalive: true,
      credentials: 'include',
    }).catch(() => {
      // Intentionally ignored — see comment above.
    });
  } catch {
    // Guards the synchronous path too (e.g. `fetch` unavailable/blocked in
    // an unusual environment) — still must never break the page.
  }
}
