import { z } from 'zod';

// FR-022: bounded, `from <= to`. Defaults to the last 30 days when omitted
// (route-level concern — this schema just validates whatever is provided).
export const analyticsRangeSchema = z
  .object({
    from: z.iso.datetime({ offset: true }).or(z.iso.date()),
    to: z.iso.datetime({ offset: true }).or(z.iso.date()),
  })
  .refine((v) => new Date(v.from).getTime() <= new Date(v.to).getTime(), {
    message: 'from must be on or before to',
    path: ['from'],
  });
export type AnalyticsRangeInput = z.infer<typeof analyticsRangeSchema>;
