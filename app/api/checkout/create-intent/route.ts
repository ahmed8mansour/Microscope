import 'server-only';

import { createIntentRequestSchema } from '@/features/checkout/schemas/checkout.schema';
import { getUserByEmail, consumeFreshVerification } from '@/features/checkout/data/user.repository';
import { createOrder, attachPaymentReference, ConflictError } from '@/features/orders';
import { createSnapshot } from '@/features/shipping/data/shipping-address.repository';
import { normalizeAddress } from '@/features/shipping';
import { isShippableCountry, isValidPostalCode } from '@/lib/config/shipping';
import { createPaymentIntent } from '@/lib/payments';
import { PRODUCT } from '@/lib/config/product';
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
  const { email, shippingAddress } = parsed.data;

  // Ships-to allow-list + per-country postal format (422 — distinct from a 400
  // malformed body). No user/verification needed for this check.
  if (
    !isShippableCountry(shippingAddress.country) ||
    !isValidPostalCode(shippingAddress.country, shippingAddress.postalCode)
  ) {
    return errorResponse(422, 'address_invalid', 'We can’t ship to this address.');
  }

  const user = await getUserByEmail(email);
  if (!user) {
    return errorResponse(403, 'not_verified', 'Email must be verified before payment');
  }

  // Zod-only validation (structural + allow-list + postal, checked above) plus
  // deterministic normalization — no external validation provider. The supplier
  // order is placed manually from the copy-ready panel, so the stored snapshot
  // just needs to be clean and AliExpress-field-shaped (FR-006/FR-007).
  const normalized = normalizeAddress(shippingAddress);

  // Per-checkout verification (spec 002/003): authorize this payment only if
  // the email was verified fresh this checkout, and consume it so a later
  // purchase must re-verify. Server-side only; never a client flag.
  const authorized = await consumeFreshVerification(user.id);
  if (!authorized) {
    return errorResponse(403, 'not_verified', 'Email must be verified before payment');
  }

  try {
    // Server-authoritative price (FR-002). Order starts at quantity 1; the
    // customer adjusts it on the payment step (re-price via /update-quantity).
    const order = await createOrder({
      userId: user.id,
      amount: PRODUCT.unitAmount,
      currency: PRODUCT.currency,
      quantity: 1,
    });

    // Per-order address snapshot (FR-006/FR-007) — normalized values; the
    // recipient phone is the customer's WhatsApp number.
    await createSnapshot(order.id, normalized, user.whatsapp ?? null);

    const intent = await createPaymentIntent({
      orderId: order.id,
      amount: PRODUCT.unitAmount,
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
