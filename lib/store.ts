import { create } from "zustand";

interface ScrollStore {
  /**
   * Smooth-scroll position expressed in **section space** (scroll offset ÷
   * viewport height). 0 = top of the hero, ~1 = one viewport scrolled, etc.
   * Written by SmoothScrollProvider (from Lenis, or native scroll under
   * reduced motion) and consumed by the 3D scene's useFrame. This is the
   * single bridge between DOM scroll and the R3F product choreography.
   */
  scrollProgress: number;
  /** performance.now() of the last scroll write — drives on-demand rendering. */
  lastInputAt: number;
  activeSubSection: 0 | 1 | 2;
  reducedMotion: boolean;
  gpuTier: number;
  setScrollProgress: (progress: number) => void;
  setActiveSubSection: (sub: 0 | 1 | 2) => void;
  setReducedMotion: (val: boolean) => void;
  setGpuTier: (tier: number) => void;
}

export const useScrollStore = create<ScrollStore>((set) => ({
  scrollProgress: 0,
  lastInputAt: 0,
  activeSubSection: 0,
  reducedMotion: false,
  gpuTier: 3,
  setScrollProgress: (progress) =>
    set({ scrollProgress: progress, lastInputAt: performance.now() }),
  setActiveSubSection: (sub) => set({ activeSubSection: sub }),
  setReducedMotion: (val) => set({ reducedMotion: val }),
  setGpuTier: (tier) => set({ gpuTier: tier }),
}));
