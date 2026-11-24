"use client";

import Eyebrow from "@/components/ui/Eyebrow";
import { useReveal } from "@/lib/useReveal";
import { HandCircle } from "@/components/ui/NotebookDecor";
import Creature from "@/components/ui/Creature";

const BADGE =
  "leaf-drift absolute flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-full border border-[color:var(--leaf-card-border)] bg-[color:var(--leaf-chip)] text-leaf-accent shadow-[var(--leaf-card-shadow)]";
const ICON = {
  width: 28,
  height: 28,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export default function Premise() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section
      id="premise"
      className="leaf-scope leaf-tint-pollen relative min-h-dvh flex items-start md:items-center overflow-hidden pt-[44vh] md:pt-0"
    >
      <Creature kind="waterbear" className="right-[2%] top-[5%] hidden w-[100px] md:block" dur={7} />
      <Creature kind="pollen" className="bottom-[3%] left-[50%] hidden w-[70px] md:block" dur={5.5} delay={2} />

      {/* Pastel disc + rings behind the 3D microscope (which glides into the
          right half — see ScrollProduct) with three floating icon badges. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[24vh] h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 md:left-[78%] md:top-1/2 md:h-[400px] md:w-[400px]"
      >
        <div className="absolute inset-0 rounded-full bg-[#CDEFE0]" />
        <span className="nb-tape left-1/2 -top-3 hidden -translate-x-1/2 -rotate-3 md:block" />
        <span className="nb-tag -left-16 bottom-16 rotate-[-5deg]">Ages 5–12</span>
        <div className="absolute -inset-[72px] hidden rounded-full border-2 border-leaf-accent/35 md:block" />
        <div className="absolute -inset-[144px] hidden rounded-full border-2 border-leaf-accent/20 md:block" />
        <span className={`${BADGE} -left-4 top-2`} style={{ ["--dur" as string]: "6s" }}>
          <svg {...ICON}>
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
        <span className={`${BADGE} -right-6 top-14`} style={{ ["--dur" as string]: "7s", ["--del" as string]: "-2s" }}>
          <svg {...ICON}>
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </svg>
        </span>
        <span className={`${BADGE} -right-2 bottom-2`} style={{ ["--dur" as string]: "5s", ["--del" as string]: "-1s" }}>
          <svg {...ICON}>
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
            <path d="M19 17v4M17 19h4" />
          </svg>
        </span>
      </div>

      <div className="relative w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16">
        {/* Text owns the left; the 3D microscope glides into the right half
            (see ScrollProduct) — the composition and the model move together. */}
        <div ref={ref} className="relative max-w-xl lg:max-w-[660px]">
          {/* Oversized ghost index — editorial anchor. */}
          <span
            aria-hidden
            className="pointer-events-none absolute -z-0 -top-14 -left-3 md:-top-24 md:-left-6 font-display leading-none text-leaf-ink/[0.08] text-[120px] md:text-[220px] select-none"
          >
            01
          </span>

          <div className="relative">
            <Eyebrow data-reveal className="mb-8 flex items-center gap-3">
              <span className="inline-block h-0.5 w-10 bg-leaf-accent align-middle" />
              THE PREMISE
            </Eyebrow>

            <h2 data-reveal className="text-h1 text-ink mb-8 leading-[0.98]">
              Your kid can{" "}
              <span className="relative inline-block">
                name
                <HandCircle className="-inset-x-3 -inset-y-2 h-[calc(100%+16px)] w-[calc(100%+24px)]" />
              </span>{" "}
              forty logos and zero leaves.
            </h2>

            <p data-reveal className="font-body text-base md:text-lg text-leaf-muted leading-relaxed max-w-md">
              That&rsquo;s not their fault. The most interesting parts of the
              world are simply too small to notice. A microscope isn&rsquo;t a
              science tool &mdash; it&rsquo;s permission to look closer.
            </p>
            <p aria-hidden className="nb-hand mt-6 hidden -rotate-[5deg] text-[34px] lg:block">Look closer</p>
          </div>
        </div>
      </div>
    </section>
  );
}
