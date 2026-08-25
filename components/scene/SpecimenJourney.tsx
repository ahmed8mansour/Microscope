"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { specimenVertexShader, specimenFragmentShader } from "./specimenShader";
import { specimenJourney, JOURNEY, type SpecimenStage } from "@/lib/config/specimens";
import { specimenState } from "@/lib/specimenState";

const { clamp, lerp, smoothstep } = THREE.MathUtils;

// ---------------------------------------------------------------------------
// Labelled placeholder texture — shown until the real image is dropped in, so
// the journey renders (and is testable) before assets arrive.
// ---------------------------------------------------------------------------
function makeFallbackTexture(stage: SpecimenStage, i: number) {
  const w = 1280;
  const h = 800;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7);
  grad.addColorStop(0, "#231A33");
  grad.addColorStop(1, "#0E0C14");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // faint grid so the zoom is legible on placeholders
  ctx.strokeStyle = "rgba(203,166,247,0.10)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += 64) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y <= h; y += 64) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.fillStyle = "#CBA6F7";
  ctx.font = "600 40px 'Instrument Sans', sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(stage.magnification ?? `stage ${i + 1}`, w / 2, h / 2 - 20);
  ctx.fillStyle = "#B9B1CC";
  ctx.font = "400 24px 'JetBrains Mono', monospace";
  ctx.fillText(`add image → ${stage.src}`, w / 2, h / 2 + 30);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return { texture: tex, size: new THREE.Vector2(w, h) };
}

function configureTexture(tex: THREE.Texture, maxAniso: number) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = Math.min(8, maxAniso);
  tex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// The full-screen zoom plane. Owns the shader, drives it from scroll, and
// publishes progress to specimenState + the settle-label overlay.
// ---------------------------------------------------------------------------
function ZoomPlane({
  sectionRef,
  overlayRef,
  labelRef,
  magRef,
  captionRef,
  stages,
}: {
  sectionRef: React.RefObject<HTMLElement | null>;
  overlayRef: React.RefObject<HTMLDivElement | null>;
  labelRef: React.RefObject<HTMLSpanElement | null>;
  magRef: React.RefObject<HTMLSpanElement | null>;
  captionRef: React.RefObject<HTMLSpanElement | null>;
  stages: SpecimenStage[];
}) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const N = stages.length;

  const texRef = useRef<(THREE.Texture | null)[]>(new Array(N).fill(null));
  const sizeRef = useRef<THREE.Vector2[]>(stages.map(() => new THREE.Vector2(1, 1)));
  const gRef = useRef(0);
  const lastIdx = useRef(-1);

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: specimenVertexShader,
      fragmentShader: specimenFragmentShader,
      uniforms: {
        uTexA: { value: null },
        uTexB: { value: null },
        uImgA: { value: new THREE.Vector2(1, 1) },
        uImgB: { value: new THREE.Vector2(1, 1) },
        uViewport: { value: new THREE.Vector2(1, 1) },
        uFocalA: { value: new THREE.Vector2(0.5, 0.5) },
        uFocalB: { value: new THREE.Vector2(0.5, 0.5) },
        uZoomA: { value: 1 },
        uZoomB: { value: 1 },
        uBlurA: { value: 0 },
        uBlurB: { value: 0 },
        uMix: { value: 0 },
        uMaxLod: { value: JOURNEY.maxLod },
        uChroma: { value: JOURNEY.chroma },
        uVignette: { value: 0 },
      },
    });
  }, []);

  // Load textures (fallback first, real image swaps in on load).
  useEffect(() => {
    const maxAniso = gl.capabilities.getMaxAnisotropy();
    const loader = new THREE.TextureLoader();
    stages.forEach((stage, i) => {
      const fb = makeFallbackTexture(stage, i);
      texRef.current[i] = fb.texture;
      sizeRef.current[i] = fb.size;
      loader.load(
        stage.src,
        (tex) => {
          configureTexture(tex, maxAniso);
          texRef.current[i]?.dispose();
          texRef.current[i] = tex;
          sizeRef.current[i] = new THREE.Vector2(tex.image.width, tex.image.height);
        },
        undefined,
        () => {
          /* keep the labelled fallback */
        }
      );
    });
    return () => {
      texRef.current.forEach((t) => t?.dispose());
    };
  }, [stages, gl]);

  specimenState.count = N;

  useFrame(() => {
    const section = sectionRef.current;
    if (!section) return;
    const vh = window.innerHeight || 1;
    const rect = section.getBoundingClientRect();
    // Sticky inner pins while the outer section scrolls; -rect.top / (vh*step)
    // maps that travel to g ∈ [0, N-1].
    const raw = clamp(-rect.top / (JOURNEY.vhPerStage * vh), 0, N - 1);
    gRef.current = lerp(gRef.current, raw, JOURNEY.smoothing);
    const g = gRef.current;

    const i = Math.min(Math.floor(g), N - 2 < 0 ? 0 : N - 2);
    const t = N === 1 ? 0 : clamp(g - i, 0, 1);
    const a = i;
    const b = Math.min(i + 1, N - 1);

    const u = material.uniforms;
    u.uTexA.value = texRef.current[a];
    u.uTexB.value = texRef.current[b];
    u.uImgA.value.copy(sizeRef.current[a]);
    u.uImgB.value.copy(sizeRef.current[b]);
    u.uViewport.value.set(size.width, size.height);
    u.uFocalA.value.set(stages[a].focal?.[0] ?? 0.5, stages[a].focal?.[1] ?? 0.5);
    u.uFocalB.value.set(stages[b].focal?.[0] ?? 0.5, stages[b].focal?.[1] ?? 0.5);
    const zA = stages[a].zoomIn ?? JOURNEY.zoomIn;
    const zB = stages[b].zoomIn ?? JOURNEY.zoomIn;
    u.uZoomA.value = lerp(1.0, zA, t);
    u.uZoomB.value = lerp(zB, 1.0, t);
    u.uBlurA.value = smoothstep(t, 0.15, 1.0);
    u.uBlurB.value = 1.0 - smoothstep(t, 0.0, 0.85);
    u.uMix.value = smoothstep(t, 0.35, 0.65);
    const hump = Math.sin(Math.PI * t);
    u.uVignette.value = JOURNEY.vignette * hump;

    // publish for the HUD + docked model
    specimenState.g = g;
    specimenState.index = clamp(Math.round(g), 0, N - 1);
    specimenState.focus = 1 - hump;
    // active while the sticky viewport is pinned (fills the screen).
    specimenState.active = rect.top <= 1 && rect.bottom >= vh - 1;

    // settle-label overlay (sharp at a stage, hidden mid-crossover)
    if (overlayRef.current) overlayRef.current.style.opacity = (1 - hump).toFixed(3);
    if (specimenState.index !== lastIdx.current) {
      lastIdx.current = specimenState.index;
      const s = stages[specimenState.index];
      if (labelRef.current) labelRef.current.textContent = s.label ?? "";
      if (magRef.current) magRef.current.textContent = s.magnification ?? "";
      if (captionRef.current) captionRef.current.textContent = s.caption ?? "";
    }
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
export default function SpecimenJourney() {
  const stages = specimenJourney;
  const N = Math.max(stages.length, 1);
  const sectionRef = useRef<HTMLElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const magRef = useRef<HTMLSpanElement>(null);
  const captionRef = useRef<HTMLSpanElement>(null);

  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const h = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);

  // Reduced motion / no-JS friendly: a plain, sharp, labelled stack.
  if (reduced) {
    return (
      <section id="discovery" className="relative bg-paper-bone py-[var(--space-9)]">
        <div className="max-w-3xl mx-auto px-6 md:px-12">
          <p className="text-caption text-mauve-300 mb-10">LOOK CLOSER</p>
          <ul className="space-y-16">
            {stages.map((s, i) => (
              <li key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.src} alt={s.label ?? ""} loading="lazy"
                  className="w-full rounded-[var(--radius-md)] ring-1 ring-white/10 bg-white/5" />
                <p className="mt-4 text-caption text-champagne">{s.magnification} · {s.label}</p>
                {s.caption && <p className="mt-1 font-body text-ink/70">{s.caption}</p>}
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  const sectionVh = 100 + (N - 1) * JOURNEY.vhPerStage * 100;

  return (
    <section
      id="discovery"
      ref={sectionRef}
      className="relative bg-paper-bone"
      style={{ height: `${sectionVh}vh` }}
      aria-label="A continuous zoom into a specimen, from a leaf to microscopic detail"
    >
      <div className="sticky top-0 h-screen w-full overflow-hidden">
        <Canvas
          frameloop="always"
          dpr={[1, 1.5]}
          gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }}
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          <ZoomPlane
            sectionRef={sectionRef}
            overlayRef={overlayRef}
            labelRef={labelRef}
            magRef={magRef}
            captionRef={captionRef}
            stages={stages}
          />
        </Canvas>

        {/* Framing HUD — eyepiece feel */}
        <div className="pointer-events-none absolute inset-0">
          <span className="absolute top-8 left-6 md:left-12 text-caption text-mauve-300/80">
            LOOK CLOSER
          </span>

          {/* Settle label — sharp when you arrive at a magnification */}
          <div
            ref={overlayRef}
            className="absolute bottom-10 left-6 md:left-12 max-w-md"
            style={{ opacity: 1 }}
          >
            <span ref={magRef} className="font-utility text-champagne text-sm tracking-widest" />
            <span
              ref={labelRef}
              className="block font-display text-3xl md:text-5xl text-white mt-1"
            />
            <span ref={captionRef} className="block font-body text-white/70 mt-2" />
          </div>

          {/* Corner ticks — a viewfinder frame */}
          <div className="absolute inset-6 md:inset-10 border border-white/10" />
        </div>
      </div>
    </section>
  );
}
