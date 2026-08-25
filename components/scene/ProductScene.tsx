"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import ScrollProduct from "./ScrollProduct";
import { useScrollStore } from "@/lib/store";

// On-demand render driver. With frameloop="demand" the scene only renders when
// invalidate() is called — so we invalidate while the page is actively
// scrolling (plus a short settle tail for the pose lerp) and while the hero
// idle-spin is running. Once past the hero and idle, rendering stops entirely.
function InvalidateDriver({ reducedMotion }: { reducedMotion: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const st = useScrollStore.getState();
      const scrolledRecently = performance.now() - st.lastInputAt < 400;
      const vh = window.innerHeight || 1;
      const totalVh = (document.documentElement.scrollHeight || vh) / vh;
      // Model is animated in the hero and again near the offer (bottom).
      const active = !reducedMotion && (st.scrollProgress < 1.25 || st.scrollProgress > totalVh - 2.1);
      if (scrolledRecently || active) invalidate();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [invalidate, reducedMotion]);
  return null;
}

type R3FState = {
  gl: { domElement: HTMLCanvasElement };
  setSize: (w: number, h: number) => void;
};

export default function ProductScene() {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<R3FState | null>(null);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Keep the canvas matched to its wrapper size.
  useEffect(() => {
    if (!mounted) return;
    const el = wrapperRef.current;
    if (!el) return;
    const sync = () => {
      const rect = el.getBoundingClientRect();
      if (stateRef.current && rect.width > 0 && rect.height > 0) {
        stateRef.current.setSize(rect.width, rect.height);
      }
    };
    sync();
    // R3F sizes the canvas from its own measurement, which can miss the first
    // paint here (the canvas is left at its 300×150 default until something
    // triggers a remeasure). Nudge with a synthetic resize until the canvas
    // matches the wrapper, then stop — self-terminating, no ongoing cost.
    let kick = 0;
    const start = performance.now();
    const ensureSized = () => {
      const canvas = el.querySelector("canvas");
      const rect = el.getBoundingClientRect();
      const sized = canvas && canvas.clientWidth >= rect.width - 2;
      if (!sized && rect.width > 0) window.dispatchEvent(new Event("resize"));
      if (!sized && performance.now() - start < 2000) {
        kick = window.setTimeout(ensureSized, 120);
      }
    };
    kick = window.setTimeout(ensureSized, 60);
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      clearTimeout(kick);
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [mounted]);

  const onCreated = useCallback((state: R3FState) => {
    stateRef.current = state;
    const el = wrapperRef.current;
    const apply = () => {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        state.setSize(rect.width, rect.height);
      }
    };
    apply();
    // In frameloop="demand" the size only commits on a render frame; force one
    // on the next frame so the canvas isn't left at its 300×150 default at load.
    requestAnimationFrame(apply);
  }, []);

  if (!mounted) return null;

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 30,
        pointerEvents: "none",
      }}
    >
      <Canvas
        frameloop="demand"
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 1.5]}
        onCreated={onCreated}
        style={{
          width: "100%",
          height: "100%",
          background: "transparent",
          pointerEvents: "none",
        }}
      >
        {/* Dark, moody key + a mauve rim from behind = premium edge glow. */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.2} color="#ffffff" />
        <directionalLight position={[-5, 1, -3]} intensity={2.4} color="#CBA6F7" />
        <directionalLight position={[0, -2, 2]} intensity={0.4} color="#E0AFFF" />
        <InvalidateDriver reducedMotion={reducedMotion} />
        <Suspense fallback={null}>
          <ScrollProduct reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}
