export interface Keyframe {
  scroll: number;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: number;
  camera: [number, number, number];
  visible: boolean;
}

const deg = (d: number) => (d * Math.PI) / 180;

export const keyframes: Keyframe[] = [
  {
    scroll: 0.0,
    position: [1.5, 0, 0],
    rotation: [deg(-10), deg(-25), 0],
    scale: 1.0,
    camera: [0, 0, 5],
    visible: true,
  },
  {
    scroll: 0.1,
    position: [5, -2, -3],
    rotation: [deg(-10), deg(60), 0],
    scale: 0.7,
    camera: [0, 0, 5],
    visible: true,
  },
  {
    scroll: 0.15,
    position: [8, -2, -5],
    rotation: [deg(-10), deg(60), 0],
    scale: 0.5,
    camera: [0, 0, 5],
    visible: false,
  },
  {
    scroll: 0.22,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 0.8,
    camera: [0, 0, 4],
    visible: false,
  },
  {
    scroll: 0.25,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: 1.2,
    camera: [0, 0, 4],
    visible: true,
  },
  {
    scroll: 0.35,
    position: [0, 0, 0],
    rotation: [0, deg(10), 0],
    scale: 1.2,
    camera: [0, 0, 4],
    visible: true,
  },
  {
    scroll: 0.45,
    position: [0, 0, 0],
    rotation: [0, deg(-10), 0],
    scale: 1.2,
    camera: [0, 0, 4],
    visible: true,
  },
  {
    scroll: 0.52,
    position: [0, -0.5, 0],
    rotation: [0, deg(0), 0],
    scale: 1.0,
    camera: [0, 0, 6],
    visible: true,
  },
  {
    scroll: 0.7,
    position: [0, -0.5, 0],
    rotation: [0, deg(360), 0],
    scale: 1.0,
    camera: [0, 0, 6],
    visible: true,
  },
  {
    scroll: 0.8,
    position: [-4, 0, -2],
    rotation: [0, deg(180), 0],
    scale: 0.5,
    camera: [0, 0, 5],
    visible: true,
  },
  {
    scroll: 0.9,
    position: [0, 0, 0],
    rotation: [deg(-5), deg(20), 0],
    scale: 1.1,
    camera: [0, 0, 4.5],
    visible: true,
  },
  {
    scroll: 1.0,
    position: [0, 0, 0],
    rotation: [deg(-5), deg(20), 0],
    scale: 1.1,
    camera: [0, 0, 4.5],
    visible: true,
  },
];

export function getSubSection(progress: number): 0 | 1 | 2 {
  if (progress < 0.3) return 0;
  if (progress < 0.4) return 1;
  return 2;
}
