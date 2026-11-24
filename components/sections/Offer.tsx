"use client";

import Eyebrow from "@/components/ui/Eyebrow";
import CTAButton from "@/components/ui/CTAButton";
import { useReveal } from "@/lib/useReveal";
import { formatPrice, formatPriceShort } from "@/lib/config/product";

// Preview burst: small cell shapes drifting out from behind the button on a
// loop. Colours come from the Leaf Lab tokens; each cell has its own travel
// (dx/dy), spin and start delay.
const CELLS = [
  { s: 24, r: "6px", c: "var(--leaf-warm)", x: 174, y: 0, rot: -57, d: 0 },
  { s: 24, r: "50%", c: "var(--leaf-pollen)", x: 173, y: 57, rot: 31, d: 0.35 },
  { s: 14, r: "50%", c: "#7CD9B8", x: 150, y: 120, rot: 65, d: 0.7 },
  { s: 18, r: "6px", c: "var(--leaf-sky)", x: 58, y: 112, rot: -24, d: 1.05 },
  { s: 14, r: "50%", c: "var(--leaf-pink)", x: 0, y: 164, rot: 30, d: 1.4 },
  { s: 24, r: "50%", c: "var(--leaf-lime)", x: -78, y: 151, rot: 31, d: 1.75 },
  { s: 14, r: "6px", c: "var(--leaf-warm)", x: -134, y: 107, rot: -31, d: 2.1 },
  { s: 24, r: "50%", c: "var(--leaf-pollen)", x: -197, y: 65, rot: 9, d: 2.45 },
  { s: 24, r: "50%", c: "#7CD9B8", x: -224, y: 0, rot: -74, d: 0 },
  { s: 24, r: "6px", c: "var(--leaf-sky)", x: -153, y: -51, rot: -80, d: 0.35 },
  { s: 14, r: "50%", c: "var(--leaf-pink)", x: -127, y: -102, rot: -22, d: 0.7 },
  { s: 24, r: "50%", c: "var(--leaf-lime)", x: -75, y: -146, rot: 9, d: 1.05 },
  { s: 18, r: "6px", c: "var(--leaf-warm)", x: 0, y: -177, rot: 11, d: 1.4 },
  { s: 24, r: "50%", c: "var(--leaf-pollen)", x: 85, y: -165, rot: 23, d: 1.75 },
  { s: 14, r: "50%", c: "#7CD9B8", x: 174, y: -139, rot: 3, d: 2.1 },
  { s: 14, r: "6px", c: "var(--leaf-sky)", x: 148, y: -49, rot: 36, d: 2.45 },
];

const ICON = {
  viewBox: "0 0 24 24",
  width: 16,
  height: 16,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

// Same wording as the spec sheet.
const CHIPS = [
  {
    label: "Ages 5–12",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M8 14s1.5 2 4 2 4-2 4-2" />
        <path d="M9 9h.01M15 9h.01" />
      </>
    ),
  },
  {
    label: "4 hr runtime",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </>
    ),
  },
  { label: "USB-C charge", icon: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" /> },
];

export default function Offer() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section
      id="offer"
      className="leaf-scope leaf-tint-lime relative overflow-hidden py-[var(--space-9)] md:py-[var(--space-10)]"
    >
      <div ref={ref} className="w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16 text-center">
        <Eyebrow data-reveal className="mb-6">03 &middot; TAKE ONE HOME</Eyebrow>

        <h2 data-reveal className="text-h2 text-ink mb-4">Take the lens home.</h2>

        <p data-reveal className="font-body text-base md:text-lg text-leaf-muted max-w-md mx-auto mb-10">
          One microscope. A whole world your kid hasn&rsquo;t met yet.
        </p>

        <div data-reveal className="font-utility text-base md:text-lg text-leaf-muted space-y-2 mb-10">
          <p className="text-ink text-2xl md:text-3xl font-semibold">
            {formatPrice()}
          </p>
          {/* <p>Free shipping &mdash; Australia-wide</p>
          <p>3&ndash;5 day delivery</p>
          <p>30-day return, no questions</p> */}
        </div>

        {/* Viewfinder brackets + cell burst are decorative and sit behind /
            around the button (cells z-0, button z-10), so they never cover the
            button text or block the click. */}
        <div data-reveal className="relative mb-4 block w-full sm:inline-block sm:w-auto">
          <span aria-hidden className="leaf-bracket left-[-16px] top-[-14px] border-r-0 border-b-0" />
          <span aria-hidden className="leaf-bracket right-[-16px] top-[-14px] border-l-0 border-b-0" />
          <span aria-hidden className="leaf-bracket bottom-[-14px] left-[-16px] border-r-0 border-t-0" />
          <span aria-hidden className="leaf-bracket bottom-[-14px] right-[-16px] border-l-0 border-t-0" />
          <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
            {CELLS.map((c, i) => (
              <span
                key={i}
                className="leaf-cell absolute left-1/2 top-1/2"
                style={{
                  width: c.s,
                  height: c.s,
                  marginLeft: -c.s / 2,
                  marginTop: -c.s / 2,
                  borderRadius: c.r,
                  background: c.c,
                  ["--dx" as string]: `${c.x}px`,
                  ["--dy" as string]: `${c.y}px`,
                  ["--rot" as string]: `${c.rot}deg`,
                  ["--del" as string]: `${c.d}s`,
                }}
              />
            ))}
          </div>
          <CTAButton href="/checkout" className="leaf-buy relative z-10">
            Buy now &mdash; {formatPriceShort()}
          </CTAButton>
        </div>

        <ul data-reveal className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {CHIPS.map((c) => (
            <li
              key={c.label}
              className="inline-flex items-center gap-2 rounded-full border border-[color:var(--leaf-card-border)] bg-white px-4 py-2 font-utility text-sm text-ink"
            >
              <span className="text-leaf-accent">
                <svg {...ICON}>{c.icon}</svg>
              </span>
              {c.label}
            </li>
          ))}
        </ul>

        {/* <p className="font-body text-sm text-ink/50 mt-4">
          Or gift it &mdash; we&rsquo;ll include a hand-numbered field card
        </p> */}
      </div>
    </section>
  );
}
