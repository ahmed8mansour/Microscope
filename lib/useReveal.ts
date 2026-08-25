"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

/**
 * Scroll reveal. Attach the returned ref to a container; any descendant marked
 * `data-reveal` starts dim, lowered, and slightly soft, then clearly rises +
 * sharpens into place (staggered) the first time it scrolls into view. Plain
 * useEffect + IntersectionObserver so it fires reliably on every scroll (no
 * dependence on the smooth-scroll driver or GSAP context). Respects
 * prefers-reduced-motion.
 *
 *   const ref = useReveal<HTMLDivElement>();
 *   <div ref={ref}><h2 data-reveal>…</h2><p data-reveal>…</p></div>
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (!els.length) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      gsap.set(els, { opacity: 1, y: 0, filter: "none" });
      return;
    }

    gsap.set(els, { opacity: 0, y: 34, filter: "blur(10px)" });

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            gsap.to(els, {
              opacity: 1,
              y: 0,
              filter: "blur(0px)",
              duration: 0.85,
              ease: "power3.out",
              stagger: 0.1,
              onComplete: () => gsap.set(els, { clearProps: "filter" }),
            });
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    io.observe(root);

    return () => io.disconnect();
  }, []);

  return ref;
}
