"use client";

import { useEffect, useRef } from "react";
import Marquee from "@/components/ui/Marquee";
import HiddenWorld from "./HiddenWorld";
import { LENS_RADIUS, LENS_ZOOM } from "./config";

// Hero lens. Rendered inside <section id="hero"> (absolute, inset-0), so its
// coordinates are the hero's own. Everything here is decorative:
// aria-hidden and pointer-events none, so the buttons stay clickable.
//
// Inside the lens (clipped with a radial mask that follows the pointer):
//   1. a "hidden world" (cells, pollen, crystals),
//   2. a 1.8x copy of the three text rows, the pill and the microscope.
// The two buttons are NOT in the copy, and the lens fades out completely while
// the pointer is inside a box around them.
//
// How the copy stays in sync
//  - Text rows: the copy renders the same <Marquee> rows; every frame the copy's
//    CSS animation `currentTime` is set to the original's (Web Animations API).
//  - Microscope: the 3D canvas is drawn into a 2D canvas each frame (only the
//    small square under the lens), which the 1.8x scale then magnifies.
//    Needs `preserveDrawingBuffer` on the 3D canvas (ProductScene.tsx).
//  - Safety net: if the 3D buffer ever reads back blank (or preserveDrawingBuffer
//    is not in effect), a console warning is logged once and a static, magnified
//    snapshot of the microscope (public/images/microscope-lens.png) is shown in
//    the lens instead.

const R = LENS_RADIUS;
const COPY_VARS = {
  "--ink": "#FFFFFF",
  "--leaf-stroke": "#A6EBD6",
  "--leaf-accent": "#B6F5E0",
} as React.CSSProperties;

export default function HeroLens() {
  const rootRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const zoom = zoomRef.current;
    const cv = canvasRef.current;
    const pill = pillRef.current;
    const ring = ringRef.current;
    const fallback = fallbackRef.current;
    const hero = root?.closest("section") as HTMLElement | null;
    if (!root || !zoom || !cv || !pill || !ring || !fallback || !hero) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const last = { x: 0, y: 0 }; // last pointer position, viewport coords
    let on = false; // pointer is inside the hero (lens may still be faded out)
    let raf = 0;
    let glCanvas: HTMLCanvasElement | null = null;

    // The hero's 3D canvas: a full-viewport canvas inside a position:fixed ancestor
    // (ProductScene), not our own copy canvas and not the sticky leaf-journey one.
    const findGl = () => {
      if (glCanvas && glCanvas.isConnected) return glCanvas;
      glCanvas = null;
      for (const c of document.querySelectorAll("canvas")) {
        if (root.contains(c)) continue;
        // R3F wraps the canvas in its own div, so look a few ancestors up.
        let fixed = false;
        for (let el = c.parentElement, i = 0; el && i < 4; el = el.parentElement, i++) {
          if (getComputedStyle(el).position === "fixed") {
            fixed = true;
            break;
          }
        }
        if (!fixed) continue;
        if (c.clientHeight >= window.innerHeight * 0.9) {
          glCanvas = c;
          break;
        }
      }
      return glCanvas;
    };

    // --- self-check -------------------------------------------------------
    // Every 30 frames: is the 3D buffer readable? (tiny downscaled copy of the
    // whole canvas). Blank 3 checks in a row while the microscope should be on
    // screen => warn once and fall back to the static snapshot.
    const probe = document.createElement("canvas");
    probe.width = 48;
    probe.height = 27;
    const pctx = probe.getContext("2d");
    let frames = 0;
    let blankRuns = 0;
    let logged = false;
    let usingFallback = false;
    const selfCheck = () => {
      const gl = findGl();
      if (!gl || !pctx || usingFallback) return;
      if (window.scrollY > window.innerHeight * 0.5) return; // microscope may be off-screen
      pctx.clearRect(0, 0, 48, 27);
      try {
        pctx.drawImage(gl, 0, 0, 48, 27);
      } catch {
        return;
      }
      const d = pctx.getImageData(0, 0, 48, 27).data;
      let opaque = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) opaque++;
      const ctxGl = (gl.getContext("webgl2") || gl.getContext("webgl")) as WebGLRenderingContext | null;
      const attrs = ctxGl?.getContextAttributes();
      if (!logged) {
        logged = true;
        console.info("[HeroLens] 3D canvas copy check", {
          preserveDrawingBuffer: attrs?.preserveDrawingBuffer,
          canvas: `${gl.width}x${gl.height} (css ${gl.clientWidth}x${gl.clientHeight})`,
          dpr: window.devicePixelRatio,
          nonTransparentSamples: `${opaque}/${48 * 27}`,
        });
      }
      // Compare the square under the lens: pixels in the 3D canvas vs. what actually
      // landed in the lens canvas. Source has pixels but the copy is empty => the
      // copy path is broken on this browser/GPU.
      let copyBroken = false;
      if (lastCopy.ok) {
        pctx.clearRect(0, 0, 48, 27);
        try {
          pctx.drawImage(gl, lastCopy.sx, lastCopy.sy, lastCopy.sw, lastCopy.sw, 0, 0, 27, 27);
          const sd = pctx.getImageData(0, 0, 27, 27).data;
          let src = 0;
          for (let i = 3; i < sd.length; i += 4) if (sd[i] > 0) src++;
          const dx = Math.max(0, Math.round(lastCopy.dx));
          const dy = Math.max(0, Math.round(lastCopy.dy));
          const dd = ctx.getImageData(dx, dy, Math.max(1, Math.min(Math.round(lastCopy.dw), cv.width - dx)), Math.max(1, Math.min(Math.round(lastCopy.dw), cv.height - dy))).data;
          let dst = 0;
          for (let i = 3; i < dd.length; i += 4) if (dd[i] > 0) dst++;
          copyBroken = src > 30 && dst === 0;
        } catch {
          /* ignore */
        }
      }
      blankRuns = opaque === 0 || attrs?.preserveDrawingBuffer === false || copyBroken ? blankRuns + 1 : 0;
      if (blankRuns >= 3) {
        usingFallback = true;
        console.warn(
          "[HeroLens] 3D canvas copy is blank (preserveDrawingBuffer=%s, nonTransparentSamples=%d); using the static microscope image.",
          attrs?.preserveDrawingBuffer,
          opaque
        );
        fallback.src = "/images/microscope-lens.png";
        fallback.style.display = "block";
        ctx.clearRect(0, 0, cv.width, cv.height);
      }
    };

    // The lens switches off near anything marked data-lens-exclude (the two hero
    // buttons and the cart). Rectangles are measured live, so it keeps working
    // when the layout changes; PAD px of slack on every side.
    const PAD = 90;
    const nearExcluded = () => {
      for (const el of document.querySelectorAll("[data-lens-exclude]")) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        if (
          last.x >= b.left - PAD && last.x <= b.right + PAD &&
          last.y >= b.top - PAD && last.y <= b.bottom + PAD
        ) return true;
      }
      return false;
    };

    const placePill = (rect: DOMRect) => {
      const src = hero.querySelector("[data-hero-cta]") as HTMLElement | null;
      if (!src) return;
      const b = src.getBoundingClientRect();
      pill.style.left = `${b.left - rect.left}px`;
      pill.style.top = `${b.top - rect.top}px`;
      pill.style.width = `${b.width}px`;
    };

    const sizeCanvas = (rect: DOMRect) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      return dpr;
    };

    const syncRows = () => {
      const copies = root.querySelectorAll<HTMLElement>(".marquee-row");
      const origs = Array.from(hero.querySelectorAll<HTMLElement>(".marquee-row")).filter((e) => !root.contains(e));
      copies.forEach((c, i) => {
        const a = origs[i]?.getAnimations()[0];
        const b = c.getAnimations()[0];
        if (!a || !b) return;
        if (b.playState !== "paused") b.pause();
        b.currentTime = a.currentTime;
      });
    };

    // Last copy geometry, so selfCheck can compare source and destination.
    const lastCopy = { sx: 0, sy: 0, sw: 0, dx: 0, dy: 0, dw: 0, ok: false };
    const drawMicroscope = (rect: DOMRect, mx: number, my: number) => {
      if (usingFallback) return;
      const gl = findGl();
      const dpr = sizeCanvas(rect);
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!gl) return;
      const g = gl.getBoundingClientRect();
      const gs = gl.width / (g.width || 1); // 3D-canvas pixels per CSS pixel
      const r = R / LENS_ZOOM + 12; // only the square under the lens is copied
      lastCopy.sx = (last.x - g.left - r) * gs;
      lastCopy.sy = (last.y - g.top - r) * gs;
      lastCopy.sw = 2 * r * gs;
      lastCopy.dx = (mx - r) * dpr;
      lastCopy.dy = (my - r) * dpr;
      lastCopy.dw = 2 * r * dpr;
      lastCopy.ok = true;
      try {
        ctx.drawImage(
          gl,
          (last.x - g.left - r) * gs, (last.y - g.top - r) * gs, 2 * r * gs, 2 * r * gs,
          (mx - r) * dpr, (my - r) * dpr, 2 * r * dpr, 2 * r * dpr
        );
      } catch {
        /* a tainted/lost context just shows no microscope copy */
      }
    };

    const frame = () => {
      raf = 0;
      if (!on) return;
      const rect = hero.getBoundingClientRect();
      const inside =
        last.x >= rect.left && last.x <= rect.right && last.y >= rect.top && last.y <= rect.bottom;
      if (!inside) {
        root.style.opacity = "0";
        return;
      }
      const mx = last.x - rect.left;
      const my = last.y - rect.top;
      const near = nearExcluded();
      root.style.opacity = near ? "0" : "1";
      if (!near) {
        root.style.setProperty("--mx", `${mx}px`);
        root.style.setProperty("--my", `${my}px`);
        ring.style.transform = `translate3d(${mx - R}px, ${my - R}px, 0)`;
        placePill(rect);
        syncRows();
        drawMicroscope(rect, mx, my);
        if (++frames % 30 === 0) selfCheck();
        // The live model is fixed to the viewport (it does not scroll with the hero),
        // so place the static snapshot in viewport terms, not hero terms.
        if (usingFallback) {
          fallback.style.left = `${rect.width * 0.497}px`;
          fallback.style.top = `${window.innerHeight * 0.492 - rect.top}px`;
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const setPos = (e: PointerEvent) => {
      last.x = e.clientX;
      last.y = e.clientY;
    };
    // Mouse / pen: pointer events. Touch uses touch events instead: Chrome sends
    // pointercancel as soon as a finger-drag turns into a page scroll, which would
    // switch the lens off, whereas touchmove keeps firing during the scroll.
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      setPos(e);
      on = true;
      start();
    };
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      last.x = t.clientX;
      last.y = t.clientY;
      on = true;
      start();
    };
    const off = () => {
      on = false;
      root.style.opacity = "0";
    };
    const onScroll = () => {
      if (on) start();
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("touchend", off, { passive: true });
    window.addEventListener("touchcancel", off, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.documentElement.addEventListener("pointerleave", off);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("touchstart", onTouch);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("touchend", off);
      window.removeEventListener("touchcancel", off);
      window.removeEventListener("scroll", onScroll);
      document.documentElement.removeEventListener("pointerleave", off);
    };
  }, []);

  const mask = `radial-gradient(circle ${R}px at var(--mx, -999px) var(--my, -999px), #000 97%, transparent 100%)`;

  return (
    <div
      ref={rootRef}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[35] overflow-hidden"
      style={{ opacity: 0, transition: "opacity 0.2s" }}
    >
      <div className="absolute inset-0" style={{ WebkitMaskImage: mask, maskImage: mask }}>
        <HiddenWorld />
        <div className="absolute inset-0" style={{ background: "rgba(6,43,40,0.5)" }} />

        {/* 1.8x copy, scaled about the pointer */}
        <div
          ref={zoomRef}
          className="absolute inset-0"
          style={{ ...COPY_VARS, transform: `scale(${LENS_ZOOM})`, transformOrigin: "var(--mx, 0px) var(--my, 0px)" }}
        >
          <div className="absolute inset-0 z-0 flex flex-col justify-center gap-[4vh] md:gap-[5vh]">
            <div>
              <Marquee text="LOOK CLOSER" dur={42} dir="right" className="hero-line hero-line--outline" />
            </div>
            <div>
              <Marquee text="THE UNSEEN WORLD" dur={30} dir="right" className="hero-line hero-line--solid" />
            </div>
            <div>
              <Marquee text="A TINY WORLD" dur={50} dir="right" className="hero-line hero-line--outline" />
            </div>
          </div>
          <canvas ref={canvasRef} className="absolute left-0 top-0 h-full w-full" />
          {/* Static fallback (only shown if the live copy fails; see selfCheck). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={fallbackRef}
            alt=""
            aria-hidden
            className="absolute"
            style={{ display: "none", height: "46vh", width: "auto", transform: "translate(-50%, -50%)" }}
          />
          <span
            ref={pillRef}
            className="text-caption absolute inline-block rounded-full border border-white/35 bg-[rgba(6,43,40,0.7)] px-[18px] py-2 text-center text-[#B6F5E0]"
          >
            A MICROSCOPE FOR CURIOUS KIDS
          </span>
        </div>
      </div>

      {/* ring + handle (decorative) */}
      <div
        ref={ringRef}
        className="absolute left-0 top-0"
        style={{ width: 2 * R, height: 2 * R, transform: "translate3d(-999px,-999px,0)" }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{ border: "4px solid rgba(255,255,255,0.9)", boxShadow: "0 0 0 2px rgba(11,122,108,0.55), 0 18px 40px -12px rgba(6,43,40,0.55)" }}
        />
        <div
          className="absolute left-1/2 top-1/2 h-[16px] w-[96px] rounded-full"
          style={{ transformOrigin: "0 50%", transform: `rotate(45deg) translateX(${R - 2}px)`, background: "linear-gradient(#FFFFFF, #CDEFE0)", boxShadow: "0 0 0 2px rgba(11,122,108,0.55)" }}
        />
      </div>
    </div>
  );
}
