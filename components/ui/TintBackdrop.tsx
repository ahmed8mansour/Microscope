"use client";

import { useEffect, useRef } from "react";

// Section colour shifts. Four static, full-viewport tint layers sit behind the
// (transparent) light sections; when the section under the middle of the
// viewport changes, the matching layer fades in and the rest fade out. Only
// `opacity` is animated (a CSS transition, compositor-only) — nothing is
// re-painted per frame and no large gradient is animated.
//
// Sections opt in with data-tint="mint|pollen|water|lime". Dark sections keep
// their own opaque background and simply cover the layers.
const TINTS = ["mint", "pollen", "water", "lime"] as const;

export default function TintBackdrop() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>("main section[data-tint]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) root.dataset.tint = (e.target as HTMLElement).dataset.tint ?? "mint";
        }
      },
      { rootMargin: "-50% 0px -50% 0px" }
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-tint="mint"
      className="tint-backdrop pointer-events-none fixed inset-0 -z-10"
    >
      {TINTS.map((t) => (
        <div key={t} data-layer={t} className="tint-layer absolute inset-0" />
      ))}
    </div>
  );
}
