import { create } from "zustand";

interface ScrollStore {
  scrollProgress: number;
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
  activeSubSection: 0,
  reducedMotion: false,
  gpuTier: 3,
  setScrollProgress: (progress) => set({ scrollProgress: progress }),
  setActiveSubSection: (sub) => set({ activeSubSection: sub }),
  setReducedMotion: (val) => set({ reducedMotion: val }),
  setGpuTier: (tier) => set({ gpuTier: tier }),
}));
