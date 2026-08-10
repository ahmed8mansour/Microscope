import 'server-only';

import { repriceRequestSchema } from '@/features/payment/schemas/reprice.schema';
import { isAuthorizedForSnapshot } from '@/features/payment/domain/access-scope';
import { getPaymentSnapshot, updateIntentAmount, NotRepriceableError } from '@/lib/payments';
import { getOrderByPaymentReference, repriceOrder, ConflictError } from '@/features/orders';
import { computeAmount } from '@/lib/config/product';
import { errorResponse, parseJsonBody } from '../_lib/respond';

export const runtime = 'nodejs';

// POST /api/checkout/update-quantity — server-authoritative re-price of an
// UNCONFIRMED intent when the customer changes the quantity stepper on the
// payment step. See specs/005-quantity-shipping-fulfillment/contracts/update-quantity-api.md
export async function POST(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = repriceRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_input', parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { paymentIntentId, clientSecret, quantity } = parsed.data;

  // Retrieve the intent snapshot (also the source of the authoritative status).
  let snapshot;
  try {
    snapshot = await getPaymentSnapshot(paymentIntentId);
  } catch {
    return errorResponse(404, 'not_found', 'No such payment');
  }

  // Access scope: the caller must present the exact client secret (no guessable
  // ids). Do not reveal whether the intent exists otherwise (SC-008-style).
  if (!isAuthorizedForSnapshot(clientSecret, snapshot.clientSecret)) {
    return errorResponse(403, 'unauthorized', 'Client secret does not match');
  }

  // A settled/confirming intent is never re-priced (FR-002a).
  if (snapshot.status !== 'pending') {
    return errorResponse(409, 'not_repriceable', 'This payment can no longer be re-priced');
  }

  const order = await getOrderByPaymentReference(paymentIntentId);
  if (!order) {
    return errorResponse(404, 'not_found', 'No order for this payment');
  }

  try {
    // Order amount first, then the intent — kept in lockstep so 003's amount
    // check never sees a self-inflicted mismatch.
    await repriceOrder(order.id, quantity);
    await updateIntentAmount(paymentIntentId, computeAmount(quantity));
  } catch (err) {
    if (err instanceof ConflictError || err instanceof NotRepriceableError) {
      return errorResponse(409, 'not_repriceable', 'This payment can no longer be re-priced');
    }
    throw err;
  }

  return Response.json({ quantity, amount: computeAmount(quantity) });
}
