import 'server-only';

import { verifyOtpSchema } from '@/features/checkout/schemas/checkout.schema';
import {
  AttemptsExceededError,
  InvalidCodeError,
  getUserByEmail,
  verifyOtp,
} from '@/features/checkout/data/user.repository';
import { errorResponse, parseJsonBody } from '../_lib/respond';

export const runtime = 'nodejs';

// POST /api/checkout/verify-otp — see specs/002-storefront-checkout-payments/contracts/checkout-api.md
export async function POST(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = verifyOtpSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_input', parsed.error.issues.map((i) => i.message).join('; '));
  }

  // Unknown email: respond the same as "no active code" rather than
  // revealing whether the address has ever been used (enumeration-resistant).
  const user = await getUserByEmail(parsed.data.email);
  if (!user) {
    return errorResponse(401, 'invalid_code', 'No active verification code; request a new one');
  }

  try {
    await verifyOtp(user.id, parsed.data.code);
    return Response.json({ verified: true });
  } catch (err) {
    if (err instanceof AttemptsExceededError) {
      return errorResponse(429, 'attempts_exceeded', err.message);
    }
    if (err instanceof InvalidCodeError) {
      return errorResponse(401, 'invalid_code', err.message);
    }
    throw err;
  }
}
