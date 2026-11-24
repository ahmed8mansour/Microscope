"use client";

import { useReveal } from "@/lib/useReveal";
import Creature from "@/components/ui/Creature";

const testimonials = [
  {
    date: "09.MAR.2026",
    location: "Melbourne, VIC",
    quote:
      "“My seven-year-old took it into the garden and didn’t come back inside for four hours. That’s the review.”",
    name: "Sarah T.",
  },
  {
    date: "22.FEB.2026",
    location: "Brisbane, QLD",
    quote:
      "“Bought this for my grandson thinking it was a toy. It’s a real microscope. He’s shown me things about my own backyard I didn’t know were there.”",
    name: "Peter M.",
  },
  {
    date: "14.APR.2026",
    location: "Perth, WA",
    quote:
      "“Solid build. Survived a full week of camping, including being dropped on granite. Screen is sharper than I expected at this price.”",
    name: "Amelia K.",
  },
];

// Card tilt, tape tilt and a different crop of the leaf photo for each card.
const looks = [
  { tilt: "-2deg", tape: "-3deg", photoTilt: "5deg", crop: { size: "320%", pos: "18% 82%" } },
  { tilt: "1.4deg", tape: "2deg", photoTilt: "-4deg", crop: { size: "240%", pos: "78% 35%" } },
  { tilt: "-1.2deg", tape: "-2deg", photoTilt: "3deg", crop: { size: "280%", pos: "45% 10%" } },
];

const ICON = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export default function FieldReports() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section
      id="field-reports"
      data-tint="pollen"
      className="leaf-scope leaf-tint-pollen leaf-on-backdrop relative overflow-hidden py-[var(--space-9)] md:py-[var(--space-10)]"
    >
      <Creature kind="pollen" className="left-[5%] top-[6%] hidden w-[84px] md:block" dur={6} />
      <Creature kind="waterbear" className="bottom-[5%] right-[2%] hidden w-[100px] md:block" dur={7} delay={3} />
      <div className="w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16">
        <div ref={ref} className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-10">
          {testimonials.map((t, i) => {
            const look = looks[i % looks.length];
            return (
              <div key={i} data-reveal>
                {/* `rotate` is its own CSS property, so it can't clash with the
                    reveal animation's transform. */}
                <article
                  className="relative rounded-[34px] border border-[color:var(--leaf-card-border)] bg-[color:var(--leaf-card)] p-6 pb-28 md:p-8 md:pb-28 shadow-[var(--leaf-card-shadow)]"
                  style={{ rotate: look.tilt }}
                >
                  {/* tape */}
                  <span
                    aria-hidden
                    className="absolute -top-4 left-1/2 h-8 w-28 -translate-x-1/2 bg-leaf-pollen/85 shadow-[0_2px_4px_rgba(12,59,51,0.12)]"
                    style={{ rotate: look.tape }}
                  />

                  <div className="mb-5 flex items-start justify-between gap-3">
                    <span className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full bg-leaf-chip text-leaf-accent">
                      <svg {...ICON} width={22} height={22}>
                        <path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
                        <path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z" />
                      </svg>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf-chip px-3 py-1.5 text-caption !text-xs text-leaf-accent-ink">
                      <svg {...ICON} width={14} height={14}>
                        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                        <path d="m9 12 2 2 4-4" />
                      </svg>
                      Verified purchase
                    </span>
                  </div>

                  <div className="text-caption text-leaf-muted mb-1">
                    FIELD REPORT &middot; {t.date}
                  </div>
                  <div className="text-caption text-leaf-muted mb-6">{t.location}</div>

                  <blockquote className="font-body text-base md:text-lg text-ink leading-relaxed mb-6">
                    {t.quote}
                  </blockquote>

                  <p className="flex items-center gap-3 font-body text-sm text-leaf-muted">
                    <span
                      aria-hidden
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-leaf-chip font-utility text-leaf-accent"
                    >
                      {t.name[0]}
                    </span>
                    &mdash; {t.name}
                  </p>

                  {/* polaroid: the site's leaf photo, cropped differently per card */}
                  <div
                    aria-hidden
                    className="absolute -bottom-6 -right-1 h-[120px] w-[108px] bg-white p-[7px] pb-[26px] shadow-[0_10px_22px_-10px_rgba(12,59,51,0.55)] md:-right-5"
                    style={{ rotate: look.photoTilt }}
                  >
                    <div
                      className="h-full w-full"
                      style={{
                        backgroundImage: "url(/images/specimens/stage-1.jpeg)",
                        backgroundSize: look.crop.size,
                        backgroundPosition: look.crop.pos,
                      }}
                    />
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
