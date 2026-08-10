// Pure brute-force lockout decision logic (FR-005). Kept independent of the
// DB so it's directly unit-testable; `data/auth-attempts.repository.ts`
// reads/writes `admin_auth_attempts` and delegates the decision here. See
// specs/004-admin-dashboard-analytics/research.md R2.

const WINDOW_MS = 15 * 60_000; // rolling window for counting failures
const LOCK_MS = 15 * 60_000; // how long a lock lasts once triggered
export const MAX_ATTEMPTS = 5;

export interface AttemptState {
  attemptCount: number;
  windowStart: number; // ms epoch
  lockedUntil: number | null; // ms epoch
}

// True if a source is currently locked out (checked BEFORE the password is
// examined — the gate must not reveal how close a submitted password was).
export function isLocked(state: AttemptState | null, now: number): boolean {
  return Boolean(state?.lockedUntil && now < state.lockedUntil);
}

// Computes the next state after a FAILED attempt. A stale window (older
// than 15 minutes) resets the count; reaching MAX_ATTEMPTS sets a new lock.
export function recordFailure(state: AttemptState | null, now: number): AttemptState {
  const windowExpired = !state || now - state.windowStart > WINDOW_MS;
  const attemptCount = windowExpired ? 1 : state.attemptCount + 1;
  const windowStart = windowExpired ? now : state.windowStart;
  return {
    attemptCount,
    windowStart,
    lockedUntil: attemptCount >= MAX_ATTEMPTS ? now + LOCK_MS : null,
  };
}
