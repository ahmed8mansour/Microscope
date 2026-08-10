import { z } from 'zod';

// FR-018: length-bounded, matches the `order_notes.body` DB check.
export const noteSchema = z.object({
  body: z.string().min(1).max(2000),
});
export type NoteInput = z.infer<typeof noteSchema>;
