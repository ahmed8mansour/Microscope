import type { InferSelectModel } from 'drizzle-orm';
import type { users } from '@/lib/db/schema';

export type UserRow = InferSelectModel<typeof users>;

// Public-facing user shape — internal OTP bookkeeping (hash, expiry, attempt
// and send counters) is deliberately not exposed outside the DAL.
export interface User {
  id: string;
  email: string | null;
  whatsapp: string | null;
  verified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
