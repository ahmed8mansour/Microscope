import { z } from 'zod';
import { OTP_POLICY } from '../domain/otp';
import { shippingAddressSchema } from '@/features/shipping';

export const emailSchema = z.email();
export const whatsappSchema = z.string().trim().min(1, 'whatsapp number is required');

export const contactSchema = z.object({
  email: emailSchema,
  whatsapp: whatsappSchema,
});
export type ContactInput = z.infer<typeof contactSchema>;

export const otpCodeSchema = z
  .string()
  .regex(
    new RegExp(`^\\d{${OTP_POLICY.codeLength}}$`),
    `code must be ${OTP_POLICY.codeLength} digits`
  );

export const verifyOtpSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;

// Strict: a client-supplied amount (or any other unexpected field) fails
// validation rather than being silently accepted or stripped — the payable
// amount is server-authoritative (FR-015) and never read from this request.
// The order is created at quantity 1; the customer adjusts quantity on the
// payment step, which re-prices via /update-quantity (feature 005). The
// shipping address is validated + normalized server-side and stored as a
// per-order snapshot (feature 005, FR-006/FR-007).
export const createIntentRequestSchema = z
  .object({
    email: emailSchema,
    shippingAddress: shippingAddressSchema,
  })
  .strict();
export type CreateIntentRequestInput = z.infer<typeof createIntentRequestSchema>;
