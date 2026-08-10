import 'server-only';

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAuthAttempts } from '@/lib/db/schema';
import { isLocked, recordFailure, type AttemptState } from '../domain/lockout';

function toState(
  row: { attemptCount: number; windowStart: Date; lockedUntil: Date | null } | undefined
): AttemptState | null {
  if (!row) return null;
  return {
    attemptCount: row.attemptCount,
    windowStart: row.windowStart.getTime(),
    lockedUntil: row.lockedUntil ? row.lockedUntil.getTime() : null,
  };
}

// FR-005. Checked BEFORE the password is examined — the gate must not
// reveal how close a submitted password was.
export async function isIpLocked(ip: string): Promise<boolean> {
  const [row] = await db
    .select()
    .from(adminAuthAttempts)
    .where(eq(adminAuthAttempts.ip, ip))
    .limit(1);
  return isLocked(toState(row), Date.now());
}

// Upserts the per-IP attempt state after a failed login (research R2).
export async function recordFailedAttempt(ip: string): Promise<void> {
  const [row] = await db
    .select()
    .from(adminAuthAttempts)
    .where(eq(adminAuthAttempts.ip, ip))
    .limit(1);
  const next = recordFailure(toState(row), Date.now());

  await db
    .insert(adminAuthAttempts)
    .values({
      ip,
      attemptCount: next.attemptCount,
      windowStart: new Date(next.windowStart),
      lockedUntil: next.lockedUntil ? new Date(next.lockedUntil) : null,
    })
    .onConflictDoUpdate({
      target: adminAuthAttempts.ip,
      set: {
        attemptCount: next.attemptCount,
        windowStart: new Date(next.windowStart),
        lockedUntil: next.lockedUntil ? new Date(next.lockedUntil) : null,
      },
    });
}

// A successful login clears the row — clean slate (research R2).
export async function clearAttempts(ip: string): Promise<void> {
  await db.delete(adminAuthAttempts).where(eq(adminAuthAttempts.ip, ip));
}
