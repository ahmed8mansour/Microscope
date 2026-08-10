'use client';

import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

// Animates a number from 0 → target with an ease-out curve (a Financial
// Dashboard signature: count-up on key figures). Respects reduced-motion by
// jumping straight to the target. Re-runs when `target` changes.
export function useCountUp(target: number, durationMs = 750): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      // Legitimate effect: syncing to the animation clock / motion prefs, an
      // external system. Jump straight to the target when motion is reduced.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValue(target);
      return;
    }
    const start = performance.now();
    const from = 0;

    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / durationMs, 1);
      // easeOutQuart — matches the store's --ease-out-quart curve feel.
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(from + (target - from) * eased);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
      }
    }

    frameRef.current = requestAnimationFrame(tick);

    // Safety net: rAF is throttled/suspended when the tab is backgrounded or
    // the surface isn't compositing, which would otherwise leave the figure
    // frozen at 0. This guarantees it lands on the true value regardless.
    const settleTimer = setTimeout(() => setValue(target), durationMs + 100);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      clearTimeout(settleTimer);
    };
  }, [target, durationMs]);

  return value;
}
