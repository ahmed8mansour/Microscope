"use client";

import { useRef } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import Eyebrow from "@/components/ui/Eyebrow";
import CTAButton from "@/components/ui/CTAButton";
import Marquee from "@/components/ui/Marquee";

export default function Hero() {
  const rootRef = useRef<HTMLElement>(null);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  // Creative on-load: the big lines rise + sharpen from a blur, staggered, then
  // the CTA settles in. The horizontal drift (CSS marquee) runs underneath.
  useGSAP(
    () => {
      const rows = rootRef.current?.querySelectorAll("[data-hero-row]");
      const cta = rootRef.current?.querySelectorAll("[data-hero-cta]");
      const all = [...(rows ? Array.from(rows) : []), ...(cta ? Array.from(cta) : [])];
      if (!all.length) return;

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(all, { opacity: 1, y: 0, filter: "none" });
        return;
      }

      const tl = gsap.timeline({ onComplete: () => gsap.set(all, { clearProps: "filter" }) });
      if (rows?.length) {
        tl.from(rows, {
          opacity: 0,
          yPercent: 45,
          filter: "blur(18px)",
          duration: 1.1,
          ease: "power3.out",
          stagger: 0.14,
        }, 0);
      }
      if (cta?.length) {
        tl.from(cta, {
          opacity: 0,
          y: 20,
          filter: "blur(8px)",
          duration: 0.8,
          ease: "power3.out",
          stagger: 0.1,
        }, 0.55);
      }
    },
    { scope: rootRef }
  );

  return (
    <section
      id="hero"
      ref={rootRef}
      className="relative min-h-dvh overflow-hidden bg-paper-bone"
    >
      {/* Kinetic type — slides horizontally BEHIND the centred product (which is
          the fixed 3D canvas above this layer). */}
      <div className="absolute inset-0 z-0 flex flex-col justify-center gap-[4vh] md:gap-[5vh]">
        <div data-hero-row>
          <Marquee text="LOOK CLOSER" dur={42} dir="right" className="hero-line hero-line--outline" />
        </div>
        <div data-hero-row>
          <Marquee text="THE UNSEEN WORLD" dur={30} dir="right" className="hero-line hero-line--solid" />
        </div>
        <div data-hero-row>
          <Marquee text="A TINY WORLD" dur={50} dir="right" className="hero-line hero-line--outline" />
        </div>
      </div>

      {/* Action layer — above the product. */}
      <div className="absolute inset-x-0 bottom-[7vh] z-40 flex flex-col items-center gap-6 px-6 text-center">
        <Eyebrow data-hero-cta>A MICROSCOPE FOR CURIOUS KIDS</Eyebrow>
        <div data-hero-cta className="flex flex-wrap items-center justify-center gap-6">
          <CTAButton onClick={() => scrollTo("discovery")}>
            Start focusing &darr;
          </CTAButton>
          <Link
            href="/checkout"
            className="font-body text-ink underline decoration-mauve-400 decoration-2 underline-offset-4 transition-opacity hover:opacity-70 cursor-pointer"
          >
            Or shop now
          </Link>
        </div>
      </div>

      <nav className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 md:px-12 lg:px-16 py-6 z-40">
        <span className="font-display text-xl md:text-2xl text-ink tracking-tight">
          Field Notes
        </span>
        <button aria-label="Cart" className="text-ink hover:opacity-70 transition-opacity">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 01-8 0" />
          </svg>
        </button>
      </nav>
    </section>
  );
}
