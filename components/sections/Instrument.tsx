"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import Eyebrow from "@/components/ui/Eyebrow";
import { useReveal } from "@/lib/useReveal";

const InstrumentViewer = dynamic(
  () => import("@/components/scene/InstrumentViewer"),
  { ssr: false }
);

// Web nodes in ring order around the model (percentages of the stage box).
// Connecting consecutive nodes draws the outer web; hub→node draws the spokes.
const nodes = [
  { x: 24, y: 20, label: '2" HD screen', sub: "see what the lens sees" },
  { x: 78, y: 23, label: "USB-C charge", sub: "4 hours per charge" },
  { x: 90, y: 60, label: "Wrist strap", sub: "it will get dropped" },
  { x: 25, y: 84, label: "60–120× lens", sub: "cells, not finicky" },
  { x: 10, y: 52, label: "Focus wheel", sub: "ribbed for muddy fingers" },
];

const specs = [
  { heading: "DIMENSIONS", items: ["9 × 6 × 4 cm", "185 g", "Ages 5–12"] },
  { heading: "BATTERY", items: ["Rechargeable", "4 hr runtime", "USB-C charge"] },
  { heading: "IN THE BOX", items: ["Microscope", "USB-C cable", "Wrist strap", "Cleaning cloth", "Field guide card"] },
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
      <div className="web-model absolute inset-0">
        <InstrumentViewer />
      </div>

      {/* soft mauve floor glow behind the model */}
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[70%] h-[60%] pointer-events-none"
        style={{ background: "var(--glow-mauve)", opacity: 0.5 }}
      />

      {/* Desktop: the animated web overlay */}
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
              stroke="var(--mauve-400)"
              strokeOpacity={0.22}
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
              stroke="var(--mauve-400)"
              strokeOpacity={0.5}
              strokeWidth={1}
              style={{ strokeDasharray: 1 }}
            />
          ))}
        </svg>

        {/* hub over the model centre */}
        <span
          className="web-hub absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: "50%", top: "50%", background: "var(--mauve-300)", boxShadow: "var(--glow-accent)" }}
        />

        {/* dots + labels at each node */}
        {nodes.map((n, i) => {
          const leftSide = n.x < 50;
          return (
            <div key={`n${i}`}>
              <span
                className="web-dot absolute w-2.5 h-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mauve-400"
                style={{ left: `${n.x}%`, top: `${n.y}%`, boxShadow: "var(--glow-accent)" }}
              />
              <div
                className={`web-label absolute ${leftSide ? "text-right pr-4" : "text-left pl-4"}`}
                style={{
                  left: `${n.x}%`,
                  top: `${n.y}%`,
                  transform: leftSide ? "translate(-100%, -50%)" : "translate(0, -50%)",
                  maxWidth: "12rem",
                }}
              >
                <span className="block font-utility text-sm text-white leading-tight">{n.label}</span>
                <span className="block font-utility text-xs text-white/45 leading-tight">{n.sub}</span>
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
  return (
    <section id="instrument" className="relative bg-paper-bone py-[var(--space-9)] md:py-[var(--space-10)]">
      <div ref={ref} className="w-full max-w-7xl mx-auto px-6 md:px-12 lg:px-16">
        <Eyebrow data-reveal className="mb-6">02 · THE INSTRUMENT</Eyebrow>
        <h2 data-reveal className="text-h2 text-ink mb-4 max-w-3xl">
          The tool you&rsquo;ve been looking through.
        </h2>
        <p data-reveal className="font-body text-base md:text-lg text-ink/70 max-w-md mb-14 md:mb-20">
          Built like an instrument, sized for a seven-year-old&rsquo;s hand.
        </p>

        <InstrumentWeb />

        {/* Mobile / tablet: the same features as a plain list (no web overlay) */}
        <ul className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-5 mb-16">
          {nodes.map((n) => (
            <li key={n.label} className="flex items-start gap-3">
              <span className="mt-2 w-2 h-2 rounded-full bg-mauve-400 flex-shrink-0" />
              <span>
                <span className="block font-utility text-sm text-ink">{n.label}</span>
                <span className="block font-utility text-xs text-ink/50">{n.sub}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* Spec sheet */}
        <div className="border-t border-ink/15 pt-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 md:gap-12">
            {specs.map((col) => (
              <div key={col.heading}>
                <h4 className="text-caption text-ink/50 mb-4">{col.heading}</h4>
                <ul className="space-y-2">
                  {col.items.map((item) => (
                    <li key={item} className="font-utility text-sm md:text-base text-ink/70">{item}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
