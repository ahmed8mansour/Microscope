import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shippingAddresses } from '@/lib/db/schema';
import type { NormalizedAddress, StoredShippingAddress } from '../types';

// Insert the per-order address snapshot (feature 005). 1:1 with the order
// (unique order_id). Stores the provider-NORMALIZED values; `phone` is the
// customer's WhatsApp number captured at purchase.
export async function createSnapshot(
  orderId: string,
  normalized: NormalizedAddress,
  phone: string | null
): Promise<void> {
  await db.insert(shippingAddresses).values({
    orderId,
    recipientName: normalized.recipientName,
    phone,
    country: normalized.country,
    state: normalized.state,
    city: normalized.city,
    line1: normalized.line1,
    line2: normalized.line2,
    postalCode: normalized.postalCode,
  });
}

// Returns the snapshot for an order, or null when none exists (pre-005 or
// anonymized-away) — the admin panel shows "address unavailable" in that case
// rather than blank fields (FR-016).
export async function getByOrderId(orderId: string): Promise<StoredShippingAddress | null> {
  const [row] = await db
    .select()
    .from(shippingAddresses)
    .where(eq(shippingAddresses.orderId, orderId))
    .limit(1);
  if (!row) return null;
  return {
    recipientName: row.recipientName ?? '',
    phone: row.phone ?? '',
    country: row.country ?? '',
    state: row.state ?? '',
    city: row.city ?? '',
    line1: row.line1 ?? '',
    line2: row.line2,
    postalCode: row.postalCode ?? '',
  };
}
