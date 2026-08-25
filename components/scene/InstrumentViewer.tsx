"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

const { lerp } = THREE.MathUtils;

// Static 3/4 presentation of the microscope for the annotated "instrument"
// beat. It holds a fixed pose (so the callout markers stay aligned), breathes
// gently, and tilts a few degrees toward the pointer. Lit dark with a mauve rim.
function Model({ reduced }: { reduced: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { scene } = useGLTF("/models/microscope.glb");
  const pointer = useRef({ x: 0, y: 0 });
  const parallax = useRef({ x: 0, y: 0 });
  const euler = useMemo(() => new THREE.Euler(), []);
  const t = useRef(0);

  const prepared = useMemo(() => {
    const clone = scene.clone(true);
    const box = new THREE.Box3().setFromObject(clone);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const f = 2.0 / Math.max(size.x, size.y, size.z);
    clone.position.set(-center.x * f, -center.y * f, -center.z * f);
    clone.scale.setScalar(f);
    return clone;
  }, [scene]);

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      pointer.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced]);

  useFrame((_s, delta) => {
    const g = ref.current;
    if (!g) return;
    t.current += delta;
    const pAmt = reduced ? 0 : 0.14;
    parallax.current.x = lerp(parallax.current.x, pointer.current.y * pAmt, 0.05);
    parallax.current.y = lerp(parallax.current.y, pointer.current.x * pAmt, 0.05);
    const breathe = reduced ? 0 : Math.sin(t.current * 0.6) * 0.05;
    euler.set(-0.12 + parallax.current.x, -0.6 + parallax.current.y + breathe, 0);
    g.quaternion.setFromEuler(euler);
    g.position.y = reduced ? 0 : Math.sin(t.current * 0.7) * 0.04;
  });

  return (
    <group ref={ref} scale={1.02}>
      <primitive object={prepared} />
    </group>
  );
}

/**
 * Contained product viewer for the Instrument section. Mounts its own canvas
 * only when scrolled near view (GPU idles otherwise), and reuses the cached
 * GLB. Framed with the hero's proven camera/scale so the model always fits.
 */
export default function InstrumentViewer() {
  const holderRef = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = holderRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(e.isIntersecting), {
      rootMargin: "250px 0px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={holderRef} className="absolute inset-0">
      {show && (
        <Canvas
          frameloop="always"
          dpr={[1, 1.5]}
          camera={{ position: [0, 0, 5], fov: 42 }}
          gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
          style={{ width: "100%", height: "100%" }}
        >
          <ambientLight intensity={0.55} />
          <directionalLight position={[3, 4, 5]} intensity={1.15} />
          <directionalLight position={[-4, 1, 2]} intensity={0.9} color="#CBA6F7" />
          <directionalLight position={[0, -3, -4]} intensity={0.3} color="#CBA6F7" />
          <Suspense fallback={null}>
            <Model reduced={reduced} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}

useGLTF.preload("/models/microscope.glb");
