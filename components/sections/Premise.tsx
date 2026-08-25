"use client";

import Eyebrow from "@/components/ui/Eyebrow";
import { useReveal } from "@/lib/useReveal";

export default function Premise() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section
      id="premise"
      className="relative min-h-dvh flex items-start md:items-center overflow-hidden bg-paper-bone pt-[44vh] md:pt-0"
    >
      <div className="w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16">
        {/* Text owns the left; the 3D microscope glides into the right half
            (see ScrollProduct) — the composition and the model move together. */}
        <div ref={ref} className="relative max-w-xl lg:max-w-2xl">
          {/* Oversized ghost index — editorial anchor. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -z-0 -top-14 -left-3 md:-top-24 md:-left-6 font-display leading-none text-mauve-500/[0.08] text-[120px] md:text-[220px] select-none"
          >
            01
          </span>

          <div className="relative">
            <Eyebrow data-reveal className="mb-8 flex items-center gap-3">
              <span className="inline-block h-px w-8 bg-mauve-400/50 align-middle" />
              THE PREMISE
            </Eyebrow>

            <h2 data-reveal className="text-h1 text-ink mb-8 leading-[0.98]">
              Your kid can name forty logos and zero leaves.
            </h2>

            <p data-reveal className="font-body text-base md:text-lg text-ink/70 leading-relaxed max-w-md">
              That&rsquo;s not their fault. The most interesting parts of the
              world are simply too small to notice. A microscope isn&rsquo;t a
              science tool &mdash; it&rsquo;s permission to look closer.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
