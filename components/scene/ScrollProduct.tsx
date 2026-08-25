"use client";

import { useRef, useMemo, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useScrollStore } from "@/lib/store";

const { lerp, smoothstep, clamp } = THREE.MathUtils;

// The microscope is the hero centrepiece: it floats + slowly spins with a mauve
// rim light and responds to the pointer. It docks in the premise, then scales
// away for good once you scroll past it — it does NOT reappear in the later
// sections (testimonials / offer). One calm, motivated presence — no zig-zag.
export default function ScrollProduct({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const parallax = useRef({ x: 0, y: 0 });
  const { scene } = useGLTF("/models/microscope.glb");

  // Pointer parallax (desktop only; disabled on touch / reduced motion).
  useEffect(() => {
    if (reducedMotion) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reducedMotion]);

  // Clone + auto-center + normalise so the model always fits the frame.
  const prepared = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const f = 2.0 / maxDim;
    clone.position.set(-center.x * f, -center.y * f, -center.z * f);
    clone.scale.setScalar(f);
    return clone;
  }, [scene]);

  const euler = useMemo(() => new THREE.Euler(), []);

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const vh = window.innerHeight || 1;
    const isPhone = window.innerWidth < 640;
    const s = useScrollStore.getState().scrollProgress;

    // Present while the premise section overlaps the viewport; gone once it has
    // scrolled fully above it (so the model never lingers into the zoom).
    const premiseEl = document.getElementById("premise");
    const premiseRect = premiseEl ? premiseEl.getBoundingClientRect() : null;
    const presence = premiseRect
      ? clamp(premiseRect.bottom / (vh * 0.1), 0, 1)
      : 1 - smoothstep(s, 1.75, 2.05);
    const heroPremise = presence;

    g.visible = presence > 0.02;
    if (!g.visible) return;

    // k drives the synced glide: 0 = hero pose, 1 = docked premise pose. It
    // reaches the docked pose as the premise arrives, then HOLDS there.
    const k = smoothstep(s, 0.5, 1.1);

    // Idle spin in the hero; winds down to a full stop as it docks (k→1) so the
    // model just holds still once it reaches the premise.
    if (!reducedMotion) spin.current += delta * 0.3 * heroPremise * (1 - k);

    // Pointer parallax eases in, scaled by presence.
    const pAmt = reducedMotion ? 0 : 0.16 * presence;
    parallax.current.x = lerp(parallax.current.x, pointer.current.y * pAmt, 0.06);
    parallax.current.y = lerp(parallax.current.y, pointer.current.x * pAmt, 0.06);

    euler.set(-0.08 + parallax.current.x, spin.current + parallax.current.y, 0);
    g.quaternion.setFromEuler(euler);

    // Poses. Hero: centre, above the headline. Premise: glides right and anchors
    // to the section. Mobile keeps it centred (text stacks below/around).
    let px: number, py: number, sc: number;
    if (isPhone) {
      // Phone: centred in the hero, then docks at the TOP of the premise section
      // and ANCHORS to it — it rides up with the section as you scroll, so it
      // stops there and never floats over the next (zoom) section.
      px = 0;
      let anchoredY = 0;
      if (premiseRect) {
        // Fixed 20vh below the section top, so the copy (pushed to ~44vh on
        // mobile) always clears it with a gap.
        const anchorPx = premiseRect.top + vh * 0.2;
        anchoredY = ((vh / 2 - anchorPx) / vh) * state.viewport.height;
      }
      py = lerp(0.35, anchoredY, k);
      sc = lerp(0.55, 0.5, k);
    } else {
      // Hero: dead-centre, rotating, marquee sliding behind it. Premise: glides
      // to px = 2 and is ANCHORED to the premise section's centre — it rides up
      // WITH the section as you scroll (fixed relative to the content), staying
      // full size, so it leaves with the section instead of floating over the
      // next one.
      px = lerp(0, 2, k);
      let anchoredY = 0;
      if (premiseRect) {
        const centerPx = premiseRect.top + premiseRect.height / 2;
        anchoredY = ((vh / 2 - centerPx) / vh) * state.viewport.height;
      }
      py = lerp(0, anchoredY, k);
      sc = lerp(0.85, 0.75, k);
    }

    g.position.set(px, py, 0);
    g.scale.setScalar(sc * presence); // scale carries the fade in/out
  });

  return (
    <group ref={groupRef}>
      <primitive object={prepared} />
    </group>
  );
}

useGLTF.preload("/models/microscope.glb");
