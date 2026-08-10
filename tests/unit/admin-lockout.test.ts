import { describe, expect, it } from 'vitest';
import { isLocked, recordFailure, MAX_ATTEMPTS } from '@/features/admin/domain/lockout';

const T0 = new Date('2026-01-01T00:00:00Z').getTime();

describe('admin lockout — window math (FR-005)', () => {
  it('is not locked with no prior attempts', () => {
    expect(isLocked(null, T0)).toBe(false);
  });

  it('locks after reaching MAX_ATTEMPTS failures within the window', () => {
    let state = null as ReturnType<typeof recordFailure> | null;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      state = recordFailure(state, T0 + i * 1000);
    }
    expect(state!.attemptCount).toBe(MAX_ATTEMPTS);
    expect(isLocked(state, T0 + MAX_ATTEMPTS * 1000)).toBe(true);
  });

  it('does not lock before reaching MAX_ATTEMPTS', () => {
    let state = null as ReturnType<typeof recordFailure> | null;
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
      state = recordFailure(state, T0 + i * 1000);
    }
    expect(isLocked(state, T0 + MAX_ATTEMPTS * 1000)).toBe(false);
  });

  it('unlocks after the 15-minute lock duration elapses', () => {
    let state = null as ReturnType<typeof recordFailure> | null;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      state = recordFailure(state, T0);
    }
    expect(isLocked(state, T0 + 15 * 60_000 - 1)).toBe(true);
    expect(isLocked(state, T0 + 15 * 60_000 + 1)).toBe(false);
  });

  it('resets the attempt count when the 15-minute rolling window has expired', () => {
    let state = recordFailure(null, T0);
    expect(state.attemptCount).toBe(1);
    // A failure long after the window expired starts a fresh window/count.
    state = recordFailure(state, T0 + 16 * 60_000);
    expect(state.attemptCount).toBe(1);
    expect(state.windowStart).toBe(T0 + 16 * 60_000);
  });

  it('does not reset the count for failures within the rolling window', () => {
    let state = recordFailure(null, T0);
    state = recordFailure(state, T0 + 5 * 60_000);
    expect(state.attemptCount).toBe(2);
    expect(state.windowStart).toBe(T0);
  });
});
