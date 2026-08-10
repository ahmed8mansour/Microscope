import { z } from 'zod';
import { PAYMENT_STATUSES } from '@/features/orders';

export const ordersQuerySchema = z.object({
  cursor: z.string().optional(),
  status: z.enum(PAYMENT_STATUSES).optional(),
  fulfilled: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  limit: z.coerce.number().int().min(1).max(50).optional().default(50),
});
export type OrdersQueryInput = z.infer<typeof ordersQuerySchema>;
