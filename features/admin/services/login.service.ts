import 'server-only';

import { issueSession, verifyPassword } from '@/lib/auth';
import { clearAttempts, isIpLocked, recordFailedAttempt } from '../data/auth-attempts.repository';

export type LoginOutcome =
  | { outcome: 'locked' }
  | { outcome: 'invalid_credentials' }
  | { outcome: 'ok'; token: string };

// FR-001–FR-005. Lockout gate first (no password comparison happens while
// locked), then constant-time password check, then session issuance.
export async function login(password: string, ip: string): Promise<LoginOutcome> {
  if (await isIpLocked(ip)) {
    return { outcome: 'locked' };
  }

  if (!verifyPassword(password)) {
    await recordFailedAttempt(ip);
    return { outcome: 'invalid_credentials' };
  }

  await clearAttempts(ip);
  const token = await issueSession();
  return { outcome: 'ok', token };
}
