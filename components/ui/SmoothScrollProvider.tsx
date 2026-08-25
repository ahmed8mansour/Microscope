"use client";

import { useEffect } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useScrollStore } from "@/lib/store";

gsap.registerPlugin(ScrollTrigger);

export default function SmoothScrollProvider({ children }: { children: React.ReactNode }) {
  const reducedMotion = useScrollStore((s) => s.reducedMotion);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    useScrollStore.getState().setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) =>
      useScrollStore.getState().setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const setScroll = useScrollStore.getState().setScrollProgress;
    // Publish scroll in "section space" (offset ÷ viewport height) — the unit
    // the 3D choreography is authored in.
    const toSectionSpace = (px: number) => setScroll(px / (window.innerHeight || 1));

    // Reduced motion: no Lenis. Feed the store (and ScrollTrigger) from native
    // scroll so the product and reveals still resolve to their rest states.
    if (reducedMotion) {
      const onScroll = () => {
        toSectionSpace(window.scrollY);
        ScrollTrigger.update();
      };
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }

    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      touchMultiplier: 2,
    });

    // One clock: Lenis drives ScrollTrigger and the store off its smoothed
    // scroll value, so the 3D, the DOM, and ScrollTrigger never drift apart.
    lenis.on("scroll", () => {
      toSectionSpace(lenis.scroll);
      ScrollTrigger.update();
    });

    const ticker = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(ticker);
    gsap.ticker.lagSmoothing(0);
    toSectionSpace(window.scrollY); // prime before first paint

    return () => {
      gsap.ticker.remove(ticker);
      lenis.destroy();
    };
  }, [reducedMotion]);

  return <>{children}</>;
}
