import { z } from 'zod';
import { PAYMENT_STATUSES } from '../domain/payment-status';

// Integer minor units (e.g. cents), no rounding drift (FR-011, D5).
export const moneySchema = z.number().int().nonnegative();

export const currencySchema = z
  .string()
  .regex(/^[A-Za-z]{3}$/, 'currency must be a 3-letter ISO-4217 code')
  .transform((v) => v.toUpperCase());

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

// Units of the single product (feature 005): positive integer, no upper cap.
// Rejects zero, negative, and non-integer values — the only client-supplied
// pricing input, so it is validated hard and the amount is recomputed
// server-side from it.
export const quantitySchema = z.number().int().min(1);

export const createOrderSchema = z.object({
  userId: z.uuid(),
  amount: moneySchema,
  currency: currencySchema,
  quantity: quantitySchema.default(1),
});

export type CreateOrderSchemaInput = z.infer<typeof createOrderSchema>;

export const statusUpdateSchema = z.object({
  status: paymentStatusSchema,
  receiptUrl: z.url().optional(),
  customerId: z.string().min(1).optional(),
});

export type StatusUpdateSchemaInput = z.infer<typeof statusUpdateSchema>;
