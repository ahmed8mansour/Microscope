import 'server-only';

import { createIntentRequestSchema } from '@/features/checkout/schemas/checkout.schema';
import { getUserByEmail, consumeFreshVerification } from '@/features/checkout/data/user.repository';
import { createOrder, attachPaymentReference, ConflictError } from '@/features/orders';
import { createSnapshot } from '@/features/shipping/data/shipping-address.repository';
import { normalizeAddress } from '@/features/shipping';
import { createPaymentIntent } from '@/lib/payments';
import { PRODUCT, computeAmount } from '@/lib/config/product';
import { errorResponse, parseJsonBody } from '../_lib/respond';

export const runtime = 'nodejs';

// POST /api/checkout/create-intent — see
// specs/005-quantity-shipping-fulfillment/contracts/create-intent-ext.md
export async function POST(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = createIntentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_input', parsed.error.issues.map((i) => i.message).join('; '));
  }
  const { email, shippingAddress, quantity } = parsed.data;

  // No ships-to allow-list or postal-format gate anymore: the Zod schema above
  // is the only address check (Places autocomplete keeps real input clean).

  const user = await getUserByEmail(email);
  if (!user) {
    return errorResponse(403, 'not_verified', 'Email must be verified before payment');
  }

  // Zod-only structural validation (checked above) plus deterministic
  // normalization — no external validation provider. The supplier order is
  // placed manually from the copy-ready panel, so the stored snapshot just
  // needs to be clean and AliExpress-field-shaped (FR-006/FR-007).
  const normalized = normalizeAddress(shippingAddress);

  // Per-checkout verification (spec 002/003): authorize this payment only if
  // the email was verified fresh this checkout, and consume it so a later
  // purchase must re-verify. Server-side only; never a client flag.
  const authorized = await consumeFreshVerification(user.id);
  if (!authorized) {
    return errorResponse(403, 'not_verified', 'Email must be verified before payment');
  }

  try {
    // Server-authoritative price (FR-002): the total is derived from the
    // customer's chosen quantity, never read from the request. The quantity is
    // final by the time this runs — it was picked on the pay screen before the
    // intent existed — so there is no post-creation re-price.
    const amount = computeAmount(quantity);
    const order = await createOrder({
      userId: user.id,
      amount,
      currency: PRODUCT.currency,
      quantity,
    });

    // Per-order address snapshot (FR-006/FR-007) — normalized values; the
    // recipient phone is the customer's WhatsApp number.
    await createSnapshot(order.id, normalized, user.whatsapp ?? null);

    const intent = await createPaymentIntent({
      orderId: order.id,
      amount,
      currency: PRODUCT.currency,
    });

    await attachPaymentReference(order.id, intent.providerRef);

    return Response.json({
      clientSecret: intent.clientSecret,
      orderId: order.id,
      paymentIntentId: intent.providerRef,
    });
  } catch (err) {
    if (err instanceof ConflictError) {
      return errorResponse(409, 'conflict', err.message);
    }
    throw err;
  }
}
