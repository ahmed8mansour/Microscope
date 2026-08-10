"use client";

import Link from "next/link";
import Eyebrow from "@/components/ui/Eyebrow";
import CTAButton from "@/components/ui/CTAButton";

export default function Hero() {
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section id="hero" className="relative min-h-dvh flex items-start lg:items-center bg-paper-bone overflow-hidden">
      <div className="w-full max-w-7xl mx-auto px-5 sm:px-8 md:px-12 lg:px-16 pt-[40vh] sm:pt-[48vh] pb-[var(--space-9)] md:pb-[var(--space-10)] lg:pt-[var(--space-10)]">
        {/* Phone: full-width, left-aligned. Tablet: centered gallery column. Desktop: left column beside the product. */}
        <div className="max-w-xl sm:max-w-2xl sm:mx-auto sm:text-center lg:max-w-lg lg:mx-0 lg:text-left">
          <Eyebrow className="mb-6">A FIELD MICROSCOPE FOR CURIOUS KIDS</Eyebrow>

          <h1 className="text-h1 text-ink mb-6">
            The world your kid isn&rsquo;t looking at yet.
          </h1>

          <p className="text-lead text-ink/80 mb-10 max-w-md sm:mx-auto lg:mx-0">
            A real digital microscope, built to survive a backyard. Screen on
            top. Wonder inside.
          </p>

          <div className="flex flex-wrap items-center gap-6 justify-start sm:justify-center lg:justify-start">
            <CTAButton onClick={() => scrollTo("discovery")}>
              See what it sees &rarr;
            </CTAButton>

            <Link
              href="/checkout"
              className="font-body text-ink underline decoration-wattle decoration-2 underline-offset-4 transition-opacity hover:opacity-70 cursor-pointer"
            >
              Or shop now
            </Link>
          </div>
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
