import { z } from 'zod';

// `conversion` is deliberately NOT in this enum — it is server-emitted only
// (tied to verified payment success), never accepted from the client. A
// client attempt to send `step: "conversion"` fails validation (400).
export const funnelEventSchema = z.object({
  step: z.enum(['entry', 'payment']),
  source: z.string().max(100).optional(),
  referrer: z.string().max(255).optional(),
  campaign: z.string().max(100).optional(),
  orderId: z.uuid().optional(),
});
export type FunnelEventInput = z.infer<typeof funnelEventSchema>;
