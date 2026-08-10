import { z } from 'zod';

export const confirmRequestSchema = z.object({
  paymentIntentId: z.string().min(1),
  clientSecret: z.string().min(1),
});
export type ConfirmRequestInput = z.infer<typeof confirmRequestSchema>;
