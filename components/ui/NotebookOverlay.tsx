"use client";

import { useEffect, useRef } from "react";

// Field-notebook furniture drawn over the landing page: four crop marks in the
// viewport corners and a thin magnification ruler on the left edge. Purely
// decorative — aria-hidden, pointer-events none, kept in the margins.
//
// Performance: one passive scroll listener that only schedules a single
// requestAnimationFrame (no layout reads beyond scrollHeight) and writes the
// marker with a transform; an IntersectionObserver tracks the section under the
// middle of the viewport (for the 186× leaf reading, the hero's simplified ruler
// and the light/dark ink).
const MAJOR = [
  { at: 0, label: "1×" },
  { at: 0.25, label: "50×" },
  { at: 0.5, label: "100×" },
  { at: 0.75, label: "150×" },
  { at: 1, label: "200×" },
];

export default function NotebookOverlay() {
  const rootRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const marker = markerRef.current;
    const value = valueRef.current;
    if (!root || !marker || !value) return;

    const sections = Array.from(document.querySelectorAll<HTMLElement>("main section[id]"));
    let active: HTMLElement | null = null;
    let frame = 0;

    const update = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      // The leaf (discovery) section matches the 186× dial.
      const v = active?.id === "discovery" ? 186 : Math.round(1 + p * 199);
      const pos = (v - 1) / 199;
      marker.style.transform = `translateY(${pos * 100}%)`;
      value.textContent = `${v}×`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          active = e.target as HTMLElement;
          root.dataset.tone = active.classList.contains("leaf-scope") ? "light" : "dark";
          root.dataset.simple = active.id === "hero" ? "true" : "false";
          schedule();
        }
      },
      { rootMargin: "-50% 0px -50% 0px" }
    );
    sections.forEach((s) => io.observe(s));

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    schedule();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      aria-hidden
      data-tone="dark"
      data-simple="true"
      className="nb-overlay pointer-events-none fixed inset-0 z-[39]"
    >
      {/* crop marks */}
      <span className="nb-crop left-[30px] top-[30px] border-r-0 border-b-0" />
      <span className="nb-crop right-[30px] top-[30px] border-l-0 border-b-0" />
      <span className="nb-crop bottom-[30px] left-[30px] border-r-0 border-t-0" />
      <span className="nb-crop bottom-[30px] right-[30px] border-l-0 border-t-0" />

      {/* magnification ruler (wide screens only) */}
      <div className="nb-ruler absolute left-8 top-[18vh] hidden h-[56vh] min-[1400px]:block">
        <div className="absolute inset-y-0 left-0 w-0.5 bg-[color:var(--nb-ink)] opacity-25" />
        {Array.from({ length: 21 }, (_, i) => {
          const major = i % 5 === 0;
          return (
            <span
              key={i}
              data-minor={!major}
              className="nb-tick absolute left-0.5 h-0.5 bg-[color:var(--nb-ink)]"
              style={{ top: `${(i / 20) * 100}%`, width: major ? 18 : 9, opacity: major ? 0.7 : 0.35 }}
            />
          );
        })}
        {MAJOR.map((m) => (
          <span
            key={m.label}
            data-mid={m.at > 0 && m.at < 1}
            className="nb-label absolute left-[26px] -translate-y-1/2 font-utility text-[11px] leading-none text-[color:var(--nb-ink)] opacity-70"
            style={{ top: `${m.at * 100}%` }}
          >
            {m.label}
          </span>
        ))}
        {/* marker rides the full height of the ruler */}
        <div className="absolute inset-0">
          <div ref={markerRef} className="nb-marker absolute left-0 top-0 h-full w-0">
            <span
              ref={valueRef}
              className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-leaf-accent px-2.5 py-1 font-utility text-[11px] font-semibold leading-none text-white shadow-[0_0_0_6px_rgba(11,122,108,0.14)]"
            >
              1×
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
