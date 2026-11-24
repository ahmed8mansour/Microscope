"use client";

import { useEffect, useRef } from "react";

/**
 * A soft mauve "eyepiece" that eases toward the pointer, plus a faint static
 * edge vignette — so the whole landing feels like looking through the scope.
 * Additive (screen blend) over the dark ground. Off on touch / reduced motion.
 */
export default function CursorLens() {
  const spotRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  // True while the pointer is over a light ("leaf-scope") section: the dark
  // vignette + mauve glow are swapped for a warm soft spotlight (colours only).
  const lightRef = useRef(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (reduce || coarse) return;

    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = { ...target };
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      target.x = e.clientX;
      target.y = e.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const loop = () => {
      pos.x += (target.x - pos.x) * 0.12;
      pos.y += (target.y - pos.y) * 0.12;
      if (spotRef.current) {
        spotRef.current.style.background = lightRef.current
          ? `radial-gradient(340px circle at ${pos.x}px ${pos.y}px, rgba(255,200,120,0.35), rgba(255,200,120,0.14) 42%, transparent 72%)`
          : `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, rgba(203,166,247,0.12), rgba(203,166,247,0.05) 32%, transparent 62%)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  // Which kind of section is under the pointer? Runs on touch / reduced motion
  // too, so the dark vignette never sits over a light section. Re-checked on
  // move and scroll (hit-testing sees through the pointer-events:none overlays).
  useEffect(() => {
    const pt = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const syncTheme = () => {
      const el = document.elementFromPoint(pt.x, pt.y);
      const light = Boolean(el?.closest(".leaf-scope"));
      lightRef.current = light;
      const v = light ? "true" : "false";
      spotRef.current?.setAttribute("data-light", v);
      vignetteRef.current?.setAttribute("data-light", v);
    };
    const onMove = (e: PointerEvent) => {
      pt.x = e.clientX;
      pt.y = e.clientY;
      syncTheme();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("scroll", syncTheme, { passive: true });
    syncTheme();
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("scroll", syncTheme);
    };
  }, []);

  return (
    <>
      <div
        ref={spotRef}
        aria-hidden
        className="cursor-spot fixed inset-0 z-40 pointer-events-none mix-blend-screen"
      />
      {/* faint eyepiece edge darkening */}
      <div
        ref={vignetteRef}
        aria-hidden
        className="cursor-vignette fixed inset-0 z-40 pointer-events-none"
        style={{ boxShadow: "inset 0 0 260px 80px rgba(0,0,0,0.45)" }}
      />
    </>
  );
}
