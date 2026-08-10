import 'server-only';

import { contactSchema } from '@/features/checkout/schemas/checkout.schema';
import {
  createOrFindUser,
  issueOtp,
  RateLimitError,
  ValidationError,
} from '@/features/checkout/data/user.repository';
import { EmailSendError, sendOtpEmail } from '@/lib/email/sendgrid';
import { errorResponse, parseJsonBody } from '../_lib/respond';

export const runtime = 'nodejs';

// POST /api/checkout/send-otp — see specs/002-storefront-checkout-payments/contracts/checkout-api.md
export async function POST(request: Request): Promise<Response> {
  const body = await parseJsonBody(request);
  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, 'invalid_input', parsed.error.issues.map((i) => i.message).join('; '));
  }

  try {
    const user = await createOrFindUser(parsed.data.email, parsed.data.whatsapp);
    const { code } = await issueOtp(user.id);
    await sendOtpEmail(parsed.data.email, code);
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof RateLimitError) {
      return errorResponse(429, 'rate_limited', err.message);
    }
    if (err instanceof EmailSendError) {
      return errorResponse(502, 'email_send_failed', err.message);
    }
    if (err instanceof ValidationError) {
      return errorResponse(400, 'invalid_input', err.message);
    }
    throw err;
  }
}
