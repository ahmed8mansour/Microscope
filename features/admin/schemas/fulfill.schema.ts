import { z } from 'zod';

// Body for POST /api/admin/orders/{id}/fulfill (feature 005). All fields
// optional: record supplier refs, mark fulfilled, or both. `.strict()` rejects
// unexpected fields. A bodyless POST (legacy 004 behaviour) still marks the
// order fulfilled — handled in the route, not here.
const refField = z.string().trim().max(200).optional();

export const fulfillRequestSchema = z
  .object({
    supplierOrderRef: refField,
    supplierTrackingRef: refField,
    fulfilled: z.boolean().optional(),
  })
  .strict();

export type FulfillRequestInput = z.infer<typeof fulfillRequestSchema>;
