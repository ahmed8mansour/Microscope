"use client";

import type { CSSProperties } from "react";

/**
 * Seamless horizontal marquee. Renders two identical copies of the phrase and
 * translates by one copy width, so the loop never visibly resets. Direction and
 * speed are per-row. Decorative (aria-hidden) — the accessible headline lives
 * elsewhere in the hero.
 */
export default function Marquee({
  text,
  dur = 30,
  dir = "right",
  repeats = 5,
  className = "",
}: {
  text: string;
  dur?: number;
  dir?: "left" | "right";
  repeats?: number;
  className?: string;
}) {
  const from = dir === "right" ? "-50%" : "0%";
  const to = dir === "right" ? "0%" : "-50%";
  const sep = " · "; // em-space · em-space
  const copy = Array.from({ length: repeats }, () => text).join(sep) + sep;

  const style = {
    "--mq-dur": `${dur}s`,
    "--mq-from": from,
    "--mq-to": to,
  } as CSSProperties;

  return (
    <div className="w-full overflow-hidden" aria-hidden>
      <div className="marquee-row inline-flex whitespace-nowrap will-change-transform" style={style}>
        <span className={className}>{copy}</span>
        <span className={className}>{copy}</span>
      </div>
    </div>
  );
}
