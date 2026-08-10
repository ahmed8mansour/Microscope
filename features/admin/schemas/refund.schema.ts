import { z } from 'zod';

export const refundSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type RefundInput = z.infer<typeof refundSchema>;
