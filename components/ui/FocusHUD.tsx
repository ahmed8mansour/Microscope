"use client";

import { useEffect, useRef, useState } from "react";
import { specimenState } from "@/lib/specimenState";
import { specimenJourney } from "@/lib/config/specimens";

// Numeric magnification per stage (null if a stage omits one).
const MAGS = specimenJourney.map((s) => {
  const n = parseFloat(s.magnification ?? "");
  return Number.isFinite(n) ? n : null;
});

/**
 * The focus-wheel HUD. A small fixed dial that rotates in proportion to the
 * specimen-journey progress (like turning a microscope's focus wheel) with a
 * live magnification readout that ticks 20×→…→200×. Reads the shared
 * `specimenState` every frame (no React re-renders) and only shows while the
 * journey is pinned on screen. Off under reduced motion.
 */
export default function FocusHUD() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<SVGSVGElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setEnabled(true);

    let raf = 0;
    let shown = 0; // eased 0→1 visibility
    const loop = () => {
      const st = specimenState;
      shown += ((st.active ? 1 : 0) - shown) * 0.1;

      if (wrapRef.current) {
        wrapRef.current.style.opacity = shown.toFixed(3);
        wrapRef.current.style.transform = `translateY(${((1 - shown) * 12).toFixed(1)}px)`;
      }
      if (wheelRef.current) {
        wheelRef.current.style.transform = `rotate(${(st.g * 90).toFixed(2)}deg)`;
      }
      if (numRef.current) {
        const g = st.g;
        const i = Math.max(0, Math.min(Math.floor(g), MAGS.length - 1));
        const j = Math.min(i + 1, MAGS.length - 1);
        const a = MAGS[i];
        const b = MAGS[j];
        let val: number | null = null;
        if (a != null && b != null) val = Math.round(a + (b - a) * (g - i));
        else if (a != null) val = a;
        numRef.current.textContent = val != null ? String(val) : String(st.index + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!enabled) return null;

  const ticks = Array.from({ length: 24 }, (_, k) => k);

  return (
    <div
      ref={wrapRef}
      aria-hidden
      className="fixed z-40 pointer-events-none bottom-5 right-5 md:bottom-8 md:right-8"
      style={{ opacity: 0 }}
    >
      <div
        className="relative grid place-items-center scale-[0.82] md:scale-100 origin-bottom-right"
        style={{ width: 92, height: 92 }}
      >
        <svg
          ref={wheelRef}
          width="92"
          height="92"
          viewBox="0 0 92 92"
          className="absolute inset-0"
        >
          {ticks.map((k) => {
            const ang = (k / 24) * Math.PI * 2;
            const major = k % 6 === 0;
            const r1 = 43;
            const r2 = major ? 34 : 39;
            return (
              <line
                key={k}
                x1={46 + Math.cos(ang) * r1}
                y1={46 + Math.sin(ang) * r1}
                x2={46 + Math.cos(ang) * r2}
                y2={46 + Math.sin(ang) * r2}
                stroke="var(--mauve-400)"
                strokeOpacity={major ? 0.9 : 0.32}
                strokeWidth={major ? 1.6 : 1}
                strokeLinecap="round"
              />
            );
          })}
          <circle cx="46" cy="46" r="29" fill="none" stroke="var(--mauve-400)" strokeOpacity="0.16" />
        </svg>

        <div className="relative text-center leading-none">
          <span className="font-utility text-white text-lg font-semibold tabular-nums">
            <span ref={numRef}>{MAGS[0] ?? 1}</span>
            <span className="text-mauve-300">×</span>
          </span>
          <span className="block font-utility text-[9px] tracking-[0.22em] text-white/45 mt-1">
            FOCUS
          </span>
        </div>
      </div>
    </div>
  );
}
