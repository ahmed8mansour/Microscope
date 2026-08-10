"use client";

import { useRef, useMemo, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerp = THREE.MathUtils.lerp;
const easeInOut = (t: number) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

const X_RIGHT = 1.6;
const X_LEFT = -1.6;

// --- Compact layouts (below 1024px) -------------------------------------
// Below the desktop breakpoint the product is a lightweight HERO-ONLY element:
// it just spins in the hero (no flip, no scroll-driven travel — for perf) and
// is hidden once you scroll past the hero. The discovery specimens use static
// circular images instead (see DiscoveryReel). One pose per phase:
//
//   Phase A · Tablet (640–1023px)
//   Phase B · Phone  (<640px)
//
// `Y` is world units — higher value = higher on screen. Tune against the hero's
// `pt-[..vh]` band, and `*_SCALE` if the product is too big/small.
const TABLET_SCALE = 0.7;
const TABLET_Y = 0.9;

const PHONE_SCALE = 0.5;
const PHONE_Y = 1.1;

// --- Exit ---------------------------------------------------------------
// The model finishes its journey at the last specimen (s = 4, where it reaches
// its final left-hand pose). Hide it from that point on so it doesn't linger
// into the instrument section.
const MODEL_HIDE_AT = 4.5;

// --- Screen image overlay ------------------------------------------------
// Images shown on the product's screen, one per discovery specimen.
const SCREEN_URLS = [
  "https://picsum.photos/500/500?grayscale",
  "https://picsum.photos/400/400?grayscale",
  "https://picsum.photos/300/300?grayscale",
];
// Placement on the model's +Y (top / screen) face, in normalised model units.
// Model normalised size ≈ 0.98 (X) × 2.0 (Y) × 1.53 (Z); top face at y ≈ +1.0.
const SCREEN_POS: [number, number, number] = [0, 1.02, 0];
const SCREEN_ROT: [number, number, number] = [-Math.PI / 2, 0, 0]; // lie flat, normal +Y
const SCREEN_SIZE: [number, number] = [0.68, 0.97]; // [X extent, Z extent]
// Corner radius of the on-screen image, in model units. Small ≈ a couple px on
// screen. Tune to taste (px can't map exactly to a 3D world size).
const SCREEN_RADIUS = 0.04;

// Zigzag path in "section space" (s = scrollY / viewportHeight):
//   s<=1  hero + premise ..... right
//   1->2  premise -> spec 01 .. right -> left   (text right)
//   2->3  spec 01 -> spec 02 .. left -> right   (text left)
//   3->4  spec 02 -> spec 03 .. right -> left   (text right)
//   s>=4  spec 03 ............. left
function xForSection(s: number): number {
  if (s <= 1) return X_RIGHT;
  if (s <= 2) return lerp(X_RIGHT, X_LEFT, easeInOut(s - 1));
  if (s <= 3) return lerp(X_LEFT, X_RIGHT, easeInOut(s - 2));
  if (s <= 4) return lerp(X_RIGHT, X_LEFT, easeInOut(s - 3));
  return X_LEFT;
}

// Which specimen image is active for a given section position.
function imageForSection(s: number): number {
  if (s < 2.5) return 0; // premise + spec 01
  if (s < 3.5) return 1; // spec 02
  return 2; // spec 03
}

export default function ScrollProduct({
  reducedMotion,
}: {
  reducedMotion: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const screenRef = useRef<THREE.Mesh>(null);
  const spin = useRef(0);
  const { scene } = useGLTF("/models/microscope.glb");

  // Screen textures, loaded imperatively so a failed request never crashes
  // (or suspends) the whole product.
  const texturesRef = useRef<(THREE.Texture | null)[]>([null, null, null]);
  const activeIdxRef = useRef(-1);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const textures: (THREE.Texture | null)[] = [null, null, null];
    texturesRef.current = textures;
    SCREEN_URLS.forEach((url, i) => {
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          textures[i] = tex;
          activeIdxRef.current = -1; // force re-apply on next frame
        },
        undefined,
        () => console.warn("[ScrollProduct] screen image failed:", url)
      );
    });
    return () => textures.forEach((t) => t?.dispose());
  }, []);

  // Reusable quaternions. qTarget = the exact premise pose: screen face flat to
  // the camera (Rx 90°) then rolled 90° so it reads landscape, buttons L/R.
  const qHero = useMemo(() => new THREE.Quaternion(), []);
  const eHero = useMemo(() => new THREE.Euler(), []);
  const qTarget = useMemo(() => {
    const qx = new THREE.Quaternion().setFromAxisAngle(AXIS_X, Math.PI / 2);
    const qz = new THREE.Quaternion().setFromAxisAngle(AXIS_Z, Math.PI / 2);
    return qz.multiply(qx); // apply Rx first, then Rz (world space)
  }, []);

  // Screen material: MeshBasicMaterial (correct colour pipeline + easy map
  // swap) with a rounded-rectangle alpha mask injected so image corners are
  // rounded; the clipped corners reveal the model's bezel behind.
  const screenMaterial = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({
      color: 0x111111,
      toneMapped: false,
      transparent: true,
    });
    m.defines = { USE_UV: "" };
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uRadius = { value: SCREEN_RADIUS };
      shader.uniforms.uSize = {
        value: new THREE.Vector2(SCREEN_SIZE[0], SCREEN_SIZE[1]),
      };
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform float uRadius;
uniform vec2 uSize;`
        )
        .replace(
          "#include <dithering_fragment>",
          `#include <dithering_fragment>
{
  vec2 p = (vUv - 0.5) * uSize;
  vec2 halfS = uSize * 0.5;
  vec2 q = abs(p) - (halfS - uRadius);
  float d = length(max(q, 0.0)) - uRadius;
  float aa = fwidth(d) + 1e-4;
  gl_FragColor.a *= 1.0 - smoothstep(-aa, aa, d);
}`
        );
    };
    return m;
  }, []);

  // Clone + auto-center + normalise size so the model always fits the frame.
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

  useFrame((state, delta) => {
    const g = groupRef.current;
    if (!g) return;

    const vh = window.innerHeight || 1;
    const w = window.innerWidth;
    const isPhone = w < 640;
    const isCompact = w < 1024;
    const s = window.scrollY / vh;

    // --- Compact (< 1024px): lightweight hero-only product ----------------
    // For performance we skip the flip and the scroll-driven travel: the
    // product only spins. It is anchored to the hero — we add the scrolled
    // distance (in world units) so it scrolls up and away with the hero copy
    // rather than staying pinned to the viewport and drifting over the text.
    // The discovery specimens use static circular images instead.
    if (isCompact) {
      if (s < 1 && !reducedMotion) spin.current += delta * 0.5;
      const baseY = isPhone ? PHONE_Y : TABLET_Y;
      g.position.set(0, baseY + s * state.viewport.height, 0);
      eHero.set(0, spin.current, 0);
      g.quaternion.setFromEuler(eHero);
      g.scale.setScalar(isPhone ? PHONE_SCALE : TABLET_SCALE);
      g.visible = s < 1; // hero only
      if (screenRef.current) screenRef.current.visible = false;
      return;
    }

    // --- Desktop (>= 1024px): full scroll choreography --------------------
    // Scroll progress across the hero -> premise transition (first viewport).
    const raw = clamp(window.scrollY / (vh * 0.9), 0, 1);
    const p = easeInOut(raw);

    // Idle Y-spin in the hero; fades out as the flip takes over.
    spin.current += delta * 0.5 * (1 - raw) * (reducedMotion ? 0 : 1);

    // Position: hero/premise on the right, then a horizontal zigzag through the
    // three discovery specimens. Height holds steady once the flip completes.
    g.position.x = xForSection(s);
    g.position.y = lerp(-0.05, -0.35, p);
    g.position.z = 0;

    // Rotation: hero = idle Y-spin, premise = the flat landscape screen pose.
    // Slerp between them so the flip stays clean with no compound tilt.
    eHero.set(0, spin.current, 0);
    qHero.setFromEuler(eHero);
    g.quaternion.slerpQuaternions(qHero, qTarget, p);

    g.scale.setScalar(1);

    // Visible through the hero, premise and the discovery specimens; hidden once
    // the model has reached the last specimen so it stops there.
    g.visible = s < MODEL_HIDE_AT;

    // Screen image: shown once the screen faces the viewer (premise onward),
    // swapping to match the active specimen.
    const screen = screenRef.current;
    if (screen) {
      const show = s > 0.98 && s < MODEL_HIDE_AT;
      screen.visible = show;
      if (show) {
        const idx = imageForSection(s);
        if (idx !== activeIdxRef.current) {
          const tex = texturesRef.current[idx];
          if (tex) {
            screenMaterial.map = tex;
            screenMaterial.color.set("#ffffff");
            screenMaterial.needsUpdate = true;
            activeIdxRef.current = idx;
          }
        }
      }
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={prepared} />
      {/* Image plane glued to the screen face; inherits the flip + zigzag. */}
      <mesh
        ref={screenRef}
        position={SCREEN_POS}
        rotation={SCREEN_ROT}
        material={screenMaterial}
        visible={false}
      >
        <planeGeometry args={SCREEN_SIZE} />
      </mesh>
    </group>
  );
}

useGLTF.preload("/models/microscope.glb");
