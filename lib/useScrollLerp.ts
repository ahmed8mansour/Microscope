import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { keyframes, type Keyframe } from "./keyframes";
import { useScrollStore } from "./store";

function findBracketingKeyframes(progress: number): [Keyframe, Keyframe, number] {
  let lower = keyframes[0];
  let upper = keyframes[keyframes.length - 1];

  for (let i = 0; i < keyframes.length - 1; i++) {
    if (progress >= keyframes[i].scroll && progress <= keyframes[i + 1].scroll) {
      lower = keyframes[i];
      upper = keyframes[i + 1];
      break;
    }
  }

  const range = upper.scroll - lower.scroll;
  const t = range === 0 ? 0 : (progress - lower.scroll) / range;
  return [lower, upper, t];
}

export function useScrollLerp(
  groupRef: React.RefObject<THREE.Group | null>,
  cameraRef?: React.MutableRefObject<THREE.PerspectiveCamera | null>
) {
  const smoothProgress = useRef(0);
  const smoothPosition = useRef(new THREE.Vector3(1.5, 0, 0));
  const smoothRotation = useRef(new THREE.Euler(-10 * Math.PI / 180, -25 * Math.PI / 180, 0));
  const smoothScale = useRef(1);
  const smoothCamera = useRef(new THREE.Vector3(0, 0, 5));

  useFrame((_state, delta) => {
    const progress = useScrollStore.getState().scrollProgress;
    const lerpFactor = 1 - Math.pow(0.001, delta);
    const factor = Math.min(lerpFactor, 0.12);

    smoothProgress.current = THREE.MathUtils.lerp(smoothProgress.current, progress, factor);

    const [lower, upper, t] = findBracketingKeyframes(smoothProgress.current);

    const targetPos = new THREE.Vector3().lerpVectors(
      new THREE.Vector3(...lower.position),
      new THREE.Vector3(...upper.position),
      t
    );

    const targetRot = new THREE.Euler(
      THREE.MathUtils.lerp(lower.rotation[0], upper.rotation[0], t),
      THREE.MathUtils.lerp(lower.rotation[1], upper.rotation[1], t),
      THREE.MathUtils.lerp(lower.rotation[2], upper.rotation[2], t)
    );

    const targetScale = THREE.MathUtils.lerp(lower.scale, upper.scale, t);

    const targetCam = new THREE.Vector3().lerpVectors(
      new THREE.Vector3(...lower.camera),
      new THREE.Vector3(...upper.camera),
      t
    );

    const visible = t < 0.5 ? lower.visible : upper.visible;

    smoothPosition.current.lerp(targetPos, factor);
    smoothRotation.current.x = THREE.MathUtils.lerp(smoothRotation.current.x, targetRot.x, factor);
    smoothRotation.current.y = THREE.MathUtils.lerp(smoothRotation.current.y, targetRot.y, factor);
    smoothRotation.current.z = THREE.MathUtils.lerp(smoothRotation.current.z, targetRot.z, factor);
    smoothScale.current = THREE.MathUtils.lerp(smoothScale.current, targetScale, factor);
    smoothCamera.current.lerp(targetCam, factor);

    if (groupRef.current) {
      groupRef.current.position.copy(smoothPosition.current);
      groupRef.current.rotation.set(
        smoothRotation.current.x,
        smoothRotation.current.y,
        smoothRotation.current.z
      );
      const s = smoothScale.current;
      groupRef.current.scale.set(s, s, s);
      groupRef.current.visible = visible;
    }

    if (cameraRef?.current) {
      cameraRef.current.position.copy(smoothCamera.current);
    }
  });
}
