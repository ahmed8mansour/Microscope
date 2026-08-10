import { z } from 'zod';

// Body for POST /api/checkout/update-quantity (feature 005, FR-002a).
// `.strict()` — a client-supplied `amount` (or any unexpected field) is
// rejected outright; the total is recomputed server-side from `quantity`.
export const repriceRequestSchema = z
  .object({
    paymentIntentId: z.string().min(1),
    clientSecret: z.string().min(1),
    quantity: z.number().int().min(1),
  })
  .strict();

export type RepriceRequestInput = z.infer<typeof repriceRequestSchema>;
