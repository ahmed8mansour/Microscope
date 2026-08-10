import 'server-only';

import { desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orderNotes } from '@/lib/db/schema';

export interface OrderNote {
  id: string;
  orderId: string;
  body: string;
  createdAt: string;
}

function toNote(row: {
  id: string;
  orderId: string;
  body: string;
  createdAt: Date;
}): OrderNote {
  return {
    id: row.id,
    orderId: row.orderId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

// FR-017. Append-only — admin notes are additive, distinct from
// `orders.notes` which order-sync owns for anomaly flags. Allowed on an
// order of any payment status; the caller is responsible for validating
// the order exists (FK constraint also enforces this at the DB level).
export async function addNote(orderId: string, body: string): Promise<OrderNote> {
  const [row] = await db.insert(orderNotes).values({ orderId, body }).returning();
  return toNote(row);
}

// FR-013. Newest-first, so the most recent annotation is immediately
// visible on the order detail view.
export async function listNotes(orderId: string): Promise<OrderNote[]> {
  const rows = await db
    .select()
    .from(orderNotes)
    .where(eq(orderNotes.orderId, orderId))
    .orderBy(desc(orderNotes.createdAt));
  return rows.map(toNote);
}
