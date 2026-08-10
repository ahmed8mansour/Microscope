import 'server-only';

import { parseWebhookEvent } from '@/lib/payments';
import { handleWebhookEvent, RetryableNotFound } from '@/features/orders/order-sync';

export const runtime = 'nodejs';

// POST /api/webhooks/stripe — see specs/003-payment-webhook-success/contracts/webhook-api.md
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') ?? '';

  let event;
  try {
    event = await parseWebhookEvent(rawBody, signature);
  } catch (err) {
    // Invalid/missing signature, or outside replay tolerance — reject as
    // unauthorized, no state change (FR-008, FR-009, SC-003). Untrusted
    // content is not persisted as a keyed event record (FR-014a).
    //
    // In local dev this almost always means STRIPE_WEBHOOK_SECRET does not
    // match the secret the sender is signing with — e.g. the value printed
    // by `stripe listen` differs from what's in .env.local. Log the reason
    // so a silent 400 is diagnosable.
    console.error(
      '[stripe webhook] signature verification failed (400). Check that STRIPE_WEBHOOK_SECRET ' +
        'matches the secret from `stripe listen`, then restart the dev server. Reason:',
      err instanceof Error ? err.message : err
    );
    return new Response('Invalid signature', { status: 400 });
  }

  try {
    await handleWebhookEvent(event);
    // Acknowledge quickly so the provider does not retry (FR-016). Covers
    // processed, ignored, and duplicate outcomes alike.
    return new Response(null, { status: 200 });
  } catch (err) {
    if (err instanceof RetryableNotFound) {
      // Order not yet visible, or another transient condition — respond so
      // the provider redelivers later; no partial/inconsistent state and no
      // event row was written (FR-015, FR-018).
      return new Response('Retry later', { status: 503 });
    }
    throw err;
  }
}
