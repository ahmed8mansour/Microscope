"use client";

import { useEffect, useRef } from "react";

/**
 * A soft mauve "eyepiece" that eases toward the pointer, plus a faint static
 * edge vignette — so the whole landing feels like looking through the scope.
 * Additive (screen blend) over the dark ground. Off on touch / reduced motion.
 */
export default function CursorLens() {
  const spotRef = useRef<HTMLDivElement>(null);

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
        spotRef.current.style.background = `radial-gradient(280px circle at ${pos.x}px ${pos.y}px, rgba(203,166,247,0.12), rgba(203,166,247,0.05) 32%, transparent 62%)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <>
      <div
        ref={spotRef}
        aria-hidden
        className="fixed inset-0 z-40 pointer-events-none mix-blend-screen"
      />
      {/* faint eyepiece edge darkening */}
      <div
        aria-hidden
        className="fixed inset-0 z-40 pointer-events-none"
        style={{ boxShadow: "inset 0 0 260px 80px rgba(0,0,0,0.45)" }}
      />
    </>
  );
}
