"use client";

import { useEffect, useRef } from "react";

// Tiny flat "specimen" sprites that drift gently in the margins. Decorative
// only: aria-hidden, pointer-events none. The drift is a transform-only CSS
// animation (.leaf-drift), paused while the sprite is off-screen and switched
// off entirely under prefers-reduced-motion (see globals.css).
export type CreatureKind = "waterbear" | "pollen" | "diatom" | "cell";

const INK = "#0C3B33";
const STROKE = { stroke: INK, strokeWidth: 2, strokeLinejoin: "round", strokeLinecap: "round" } as const;

function Sprite({ kind }: { kind: CreatureKind }) {
  switch (kind) {
    case "waterbear":
      return (
        <svg viewBox="0 0 100 64" className="h-auto w-full" {...STROKE} fill="none">
          {[24, 38, 58, 72].map((x) => (
            <rect key={x} x={x} y={44} width={9} height={15} rx={4} fill="#9FE0C8" />
          ))}
          <ellipse cx={54} cy={32} rx={36} ry={23} fill="#9FE0C8" />
          <path d="M42 11 Q40 32 42 53" />
          <path d="M56 9 Q54 32 56 55" />
          <path d="M70 12 Q68 32 70 52" />
          <circle cx={24} cy={30} r={14} fill="#B7ECD9" />
          <circle cx={19} cy={26} r={2.4} fill={INK} stroke="none" />
          <circle cx={29} cy={26} r={2.4} fill={INK} stroke="none" />
          <path d="M18 34 Q24 40 30 34" />
          <circle cx={52} cy={24} r={3} fill="#FF7A3D" stroke="none" />
          <circle cx={66} cy={38} r={2.6} fill="#FF7A3D" stroke="none" />
        </svg>
      );
    case "pollen":
      return (
        <svg viewBox="0 0 90 90" className="h-auto w-full" {...STROKE} fill="none">
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <circle key={i} cx={45 + Math.cos(a) * 32} cy={45 + Math.sin(a) * 32} r={8} fill="#FFD166" />;
          })}
          <circle cx={45} cy={45} r={29} fill="#FFD166" />
          <circle cx={38} cy={36} r={8} fill="#fff" fillOpacity={0.45} stroke="none" />
          <circle cx={52} cy={40} r={4} fill="#FF7A3D" stroke="none" />
          <circle cx={40} cy={55} r={3.5} fill="#FF7A3D" stroke="none" />
          <circle cx={56} cy={56} r={3} fill="#FF7A3D" stroke="none" />
        </svg>
      );
    case "diatom":
      return (
        <svg viewBox="0 0 110 54" className="h-auto w-full" {...STROKE} fill="none">
          <ellipse cx={55} cy={27} rx={50} ry={22} fill="#C9EBDD" />
          <path d="M9 27 H101" />
          {[-30, -20, -10, 10, 20, 30].map((d) => (
            <g key={d}>
              <path d={`M${55 + d} ${27 - 15 + Math.abs(d) * 0.2} V${27 - 5}`} />
              <path d={`M${55 + d} ${27 + 5} V${27 + 15 - Math.abs(d) * 0.2}`} />
            </g>
          ))}
          <circle cx={55} cy={27} r={6.5} fill="#FFD166" />
        </svg>
      );
    case "cell":
      return (
        <svg viewBox="0 0 80 80" className="h-auto w-full" {...STROKE} fill="none">
          <circle cx={40} cy={40} r={36} fill="#FF8FB3" />
          <circle cx={36} cy={38} r={13} fill="#FFE3EE" />
          <circle cx={36} cy={38} r={5} fill={INK} stroke="none" />
          <circle cx={58} cy={26} r={3.5} fill={INK} fillOpacity={0.6} stroke="none" />
          <circle cx={56} cy={54} r={4.5} fill={INK} fillOpacity={0.6} stroke="none" />
        </svg>
      );
  }
}

export default function Creature({
  kind,
  className = "",
  dur = 6,
  delay = 0,
}: {
  kind: CreatureKind;
  /** Position + size (e.g. "right-[3%] top-[8%] w-[90px]"). */
  className?: string;
  dur?: number;
  delay?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  // Pause the drift while the sprite is off-screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      el.dataset.paused = e.isIntersecting ? "false" : "true";
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <span
      ref={ref}
      aria-hidden
      data-paused="true"
      className={`nb-creature leaf-drift pointer-events-none absolute ${className}`}
      style={{ ["--dur" as string]: `${dur}s`, ["--del" as string]: `${-delay}s` }}
    >
      <Sprite kind={kind} />
    </span>
  );
}
