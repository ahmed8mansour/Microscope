"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import Eyebrow from "@/components/ui/Eyebrow";
import { useReveal } from "@/lib/useReveal";
import { HandArrow, HandCircle } from "@/components/ui/NotebookDecor";
import Creature from "@/components/ui/Creature";

const InstrumentViewer = dynamic(
  () => import("@/components/scene/InstrumentViewer"),
  { ssr: false }
);

type IconName = "monitor" | "zap" | "watch" | "lens" | "wheel";

const ICON_PATHS: Record<IconName | "ruler" | "battery" | "package" | "check", React.ReactNode> = {
  monitor: (<><rect width="20" height="14" x="2" y="3" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" /></>),
  zap: <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />,
  wheel: (<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3" /></>),
  watch: (<><circle cx="12" cy="12" r="6" /><path d="M12 10v2l1 1" /><path d="m16.13 7.66-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05" /><path d="m7.88 16.36.8 4a2 2 0 0 0 2 1.64h2.72a2 2 0 0 0 2-1.64l.8-4" /></>),
  lens: (<><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></>),
  ruler: (<><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" /><path d="m14.5 12.5 2-2" /><path d="m11.5 9.5 2-2" /><path d="m8.5 6.5 2-2" /><path d="m17.5 15.5 2-2" /></>),
  battery: (<><path d="m11 7-3 5h4l-3 5" /><path d="M14.856 6H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.935" /><path d="M22 14v-4" /><path d="M5.14 18H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2.936" /></>),
  package: (<><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></>),
  check: <path d="M20 6 9 17l-5-5" />,
};

function Icon({ name, size = 20 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="flex-none">
      {ICON_PATHS[name]}
    </svg>
  );
}

function Chip({ name, size = 18 }: { name: keyof typeof ICON_PATHS; size?: number }) {
  return (
    <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-leaf-chip text-leaf-accent">
      <Icon name={name} size={size} />
    </span>
  );
}

// Web nodes in ring order around the model (percentages of the stage box).
// Connecting consecutive nodes draws the outer web; hub→node draws the spokes.
const nodes = [
  { x: 24, y: 20, icon: "monitor" as IconName, label: '2" HD screen', sub: "see what the lens sees" },
  { x: 78, y: 23, icon: "zap" as IconName, label: "USB-C charge", sub: "4 hours per charge" },
  { x: 90, y: 60, icon: "watch" as IconName, label: "Wrist strap", sub: "it will get dropped" },
  { x: 25, y: 84, icon: "lens" as IconName, label: "60–120× lens", sub: "cells, not finicky" },
  { x: 18, y: 52, icon: "wheel" as IconName, label: "Focus wheel", sub: "ribbed for muddy fingers" },
];

const specs = [
  { heading: "DIMENSIONS", icon: "ruler" as const, items: ["9 × 6 × 4 cm", "185 g", "Ages 5–12"] },
  { heading: "BATTERY", icon: "battery" as const, items: ["Rechargeable", "4 hr runtime", "USB-C charge"] },
  { heading: "IN THE BOX", icon: "package" as const, items: ["Microscope", "USB-C cable", "Wrist strap", "Cleaning cloth", "Field guide card"] },
];

function InstrumentWeb() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;

    const threads = root.querySelectorAll<SVGLineElement>(".web-thread");
    const dots = root.querySelectorAll<HTMLElement>(".web-dot");
    const labels = root.querySelectorAll<HTMLElement>(".web-label");
    const hub = root.querySelectorAll<HTMLElement>(".web-hub");

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      gsap.set(root, { opacity: 1, y: 0 });
      gsap.set(threads, { strokeDashoffset: 0 });
      gsap.set([...dots, ...hub], { opacity: 1, scale: 1 });
      gsap.set(labels, { opacity: 1, y: 0 });
      return;
    }

    // Hidden start: the whole stage (model + web) fades up as one group, then
    // the web is spun out on top.
    gsap.set(root, { opacity: 0, y: 44 });
    gsap.set(threads, { strokeDashoffset: 1 });
    gsap.set(hub, { opacity: 0, scale: 0, transformOrigin: "50% 50%" });
    gsap.set(dots, { opacity: 0, scale: 0, transformOrigin: "50% 50%" });
    gsap.set(labels, { opacity: 0, y: 8 });

    const radials = root.querySelectorAll(".web-thread.radial");
    const rings = root.querySelectorAll(".web-thread.ring");

    let played = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (played || !entries.some((e) => e.isIntersecting)) return;
        played = true;
        io.disconnect();
        const tl = gsap.timeline({ delay: 0.2 });
        // 1) the whole stage fades up
        tl.to(root, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" }, 0);
        // 2) then the web spins out from the model
        tl.to(hub, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" }, 0.5);
        tl.to(radials, { strokeDashoffset: 0, duration: 0.6, ease: "power2.out", stagger: 0.08 }, 0.6);
        tl.to(rings, { strokeDashoffset: 0, duration: 0.5, ease: "power2.out", stagger: 0.06 }, "-=0.25");
        tl.to(dots, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(3)", stagger: 0.06 }, "-=0.35");
        tl.to(labels, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: 0.07 }, "-=0.2");
      },
      { threshold: 0.25 }
    );
    io.observe(root);
    return () => io.disconnect();
  }, []);

  const ringPairs = nodes.map((_, i) => [i, (i + 1) % nodes.length]);

  return (
    <div ref={stageRef} className="relative h-[62vh] min-h-[460px] mb-16">
      {/* pastel disc + rings behind the model */}
      <div aria-hidden className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="absolute left-1/2 top-1/2 h-[260px] w-[260px] md:h-[330px] md:w-[330px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#CDEFE0]" />
        <div className="absolute left-1/2 top-1/2 hidden md:block h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-leaf-accent/30" />
        <div className="absolute left-1/2 top-1/2 hidden md:block h-[690px] w-[690px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-leaf-accent/15" />
      </div>

      {/* Spokes + ring threads sit BEHIND the (transparent) model canvas so the
          lines no longer cross the microscope. */}
      <div className="absolute inset-0 hidden lg:block pointer-events-none">
        <svg className="absolute inset-0 w-full h-full overflow-visible">
          {/* outer ring threads (node → next node) */}
          {ringPairs.map(([a, b]) => (
            <line
              key={`r${a}-${b}`}
              className="web-thread ring"
              x1={`${nodes[a].x}%`}
              y1={`${nodes[a].y}%`}
              x2={`${nodes[b].x}%`}
              y2={`${nodes[b].y}%`}
              pathLength={1}
              stroke="var(--leaf-accent)"
              strokeOpacity={0.25}
              strokeWidth={1}
              style={{ strokeDasharray: 1 }}
            />
          ))}
          {/* radial spokes (hub → node) */}
          {nodes.map((n, i) => (
            <line
              key={`s${i}`}
              className="web-thread radial"
              x1="50%"
              y1="50%"
              x2={`${n.x}%`}
              y2={`${n.y}%`}
              pathLength={1}
              stroke="var(--leaf-accent)"
              strokeOpacity={0.55}
              strokeWidth={1}
              style={{ strokeDasharray: 1 }}
            />
          ))}
        </svg>
      </div>

      <div className="web-model absolute inset-0">
        <InstrumentViewer />
      </div>

      {/* Desktop: the animated web overlay */}
      <div className="absolute inset-0 hidden lg:block pointer-events-none">
        {/* hand-drawn circle round the first callout dot */}
        <HandCircle className="h-11 w-16" style={{ left: `${nodes[0].x}%`, top: `${nodes[0].y}%`, transform: "translate(-50%, -50%)" }} />

        {/* hub over the model centre */}
        <span
          className="web-hub absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: "50%", top: "50%", background: "var(--leaf-accent)", boxShadow: "0 0 0 4px #fff" }}
        />

        {/* dots + labels at each node */}
        {nodes.map((n, i) => {
          const leftSide = n.x < 50;
          return (
            <div key={`n${i}`}>
              <span
                className="web-dot absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-leaf-accent"
                style={{ left: `${n.x}%`, top: `${n.y}%`, boxShadow: "0 0 0 3px #fff" }}
              />
              <div
                className={`web-label absolute flex items-center gap-2 ${leftSide ? "flex-row-reverse text-right pr-4" : "text-left pl-4"}`}
                style={{
                  left: `${n.x}%`,
                  top: `${n.y}%`,
                  transform: leftSide ? "translate(-100%, -50%)" : "translate(0, -50%)",
                  maxWidth: "16rem",
                }}
              >
                <Chip name={n.icon} />
                <span>
                  <span className="block whitespace-nowrap font-utility text-sm text-ink leading-tight">{n.label}</span>
                  <span className="block whitespace-nowrap font-utility text-xs text-leaf-muted leading-tight">{n.sub}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Instrument() {
  const ref = useReveal<HTMLDivElement>();
  const specsRef = useReveal<HTMLDivElement>();
  return (
    <>
      <section id="instrument" className="leaf-scope leaf-tint-water relative pt-[var(--space-9)] md:pt-[var(--space-10)] pb-[var(--space-8)]">
        <Creature kind="diatom" className="right-6 top-10 w-[70px] md:right-[3%] md:top-[130px] md:w-[100px]" dur={6.5} />
        <Creature kind="pollen" className="bottom-[7%] left-[8%] hidden w-[78px] md:block" dur={5} delay={1.5} />
        <div ref={ref} className="relative w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16">
          <span className="nb-tag nb-tag--lg right-[8%] top-[18px] rotate-[4deg]">THE INSTRUMENT</span>
          <Eyebrow data-reveal className="mb-6">02 · THE INSTRUMENT</Eyebrow>
          <h2 data-reveal className="text-h2 text-ink mb-4 max-w-3xl">
            The tool you&rsquo;ve been looking through.
          </h2>
          <p data-reveal className="font-body text-base md:text-lg text-leaf-muted max-w-md mb-14 md:mb-20">
            Built like an instrument, sized for a seven-year-old&rsquo;s hand.
          </p>

          <InstrumentWeb />

          {/* Mobile / tablet: the same features as a plain list (no web overlay) */}
          <ul className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5">
            {nodes.map((n) => (
              <li key={n.label} className="flex items-center gap-3">
                <Chip name={n.icon} />
                <span>
                  <span className="block font-utility text-sm text-ink">{n.label}</span>
                  <span className="block font-utility text-xs text-leaf-muted">{n.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Spec sheet — three cards on the mint tint */}
      <section id="specs" className="leaf-scope leaf-tint-mint relative py-[var(--space-8)] md:py-[var(--space-9)]">
        <Creature kind="cell" className="bottom-[10%] left-[9%] hidden w-[70px] md:block" dur={6} />
        <Creature kind="diatom" className="bottom-[10%] right-[3%] hidden w-[100px] md:block" dur={7.5} delay={2} />
        <div ref={specsRef} className="relative w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16">
          <p aria-hidden className="nb-hand absolute -top-12 right-[6%] hidden -rotate-[6deg] text-[38px] lg:block">It will get dropped</p>
          <HandArrow className="absolute -top-6 right-[calc(6%+345px)] hidden lg:block" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8">
            {specs.map((col) => (
              <div
                key={col.heading}
                data-reveal
                className="rounded-[34px] border border-[color:var(--leaf-card-border)] bg-[color:var(--leaf-card)] p-8 shadow-[var(--leaf-card-shadow)]"
              >
                <div className="mb-6 flex items-center gap-4">
                  <span className="inline-flex h-12 w-12 flex-none items-center justify-center rounded-full bg-leaf-chip text-leaf-accent">
                    <Icon name={col.icon} size={24} />
                  </span>
                  <h4 className="text-caption text-leaf-muted tracking-[0.2em]">{col.heading}</h4>
                </div>
                <ul className="space-y-3">
                  {col.items.map((item) => (
                    <li key={item} className="flex items-center gap-3 font-utility text-base text-ink">
                      <span className="text-leaf-accent"><Icon name="check" size={16} /></span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
