"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import ScrollProduct from "./ScrollProduct";

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
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [mounted]);

  const onCreated = useCallback((state: R3FState) => {
    stateRef.current = state;
    const el = wrapperRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        state.setSize(rect.width, rect.height);
      }
    }
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
        <ambientLight intensity={0.8} />
        <hemisphereLight args={["#ffffff", "#b0a58c", 0.6]} />
        <directionalLight position={[5, 6, 5]} intensity={1.4} />
        <directionalLight position={[-5, 2, 3]} intensity={0.6} />
        <directionalLight position={[0, -3, -5]} intensity={0.3} />
        <Suspense fallback={null}>
          <ScrollProduct reducedMotion={reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}
