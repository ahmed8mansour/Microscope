import 'server-only';

import { confirmRequestSchema } from '@/features/payment/schemas/confirm.schema';
import { isAuthorizedForSnapshot } from '@/features/payment/domain/access-scope';
import { getPaymentSnapshot } from '@/lib/payments';
import { reconcile, RetryableNotFound } from '@/features/orders/order-sync';
import { errorResponse, parseJsonBody } from '../_lib/respond';

export const runtime = 'nodejs';

interface SuccessView {
  status: 'success' | 'pending' | 'failed' | 'refunded' | 'not_found';
  orderId: string | null;
  amount: number | null;
  currency: string | null;
}

function notFoundView(): Response {
  const view: SuccessView = { status: 'not_found', orderId: null, amount: null, currency: null };
  return Response.json(view, { status: 404 });
}

// POST /api/checkout/confirm — see specs/003-payment-webhook-success/contracts/confirm-api.md
export async function POST(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = confirmRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_input', parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { paymentIntentId, clientSecret } = parsed.data;

  let snapshot;
  try {
    snapshot = await getPaymentSnapshot(paymentIntentId);
  } catch {
    return notFoundView();
  }

  // Access scoping (FR-022, SC-008): the caller must present the exact
  // client secret. Do not reveal whether the intent exists otherwise.
  if (!isAuthorizedForSnapshot(clientSecret, snapshot.clientSecret)) {
    return errorResponse(403, 'unauthorized', 'Client secret does not match');
  }

  try {
    // Immediate server-side verification, hybrid with the durable webhook
    // (FR-020, FR-021) — reconciles idempotently either way.
    const result = await reconcile(paymentIntentId, {
      status: snapshot.status,
      amount: snapshot.amount,
      currency: snapshot.currency,
      receiptRef: snapshot.receiptRef,
      customerRef: snapshot.customerRef,
    });

    const view: SuccessView = {
      status: result.flagged ? 'pending' : result.order.paymentStatus,
      orderId: result.order.id,
      amount: result.order.amount,
      currency: result.order.currency,
    };
    return Response.json(view);
  } catch (err) {
    if (err instanceof RetryableNotFound) {
      return notFoundView();
    }
    throw err;
  }
}
