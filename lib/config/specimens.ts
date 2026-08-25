/**
 * SPECIMEN JOURNEY — the one file you edit to plug in your own images.
 *
 * The landing's "look closer" section renders these stages as ONE continuous
 * optical zoom (leaf → detail → deeper → insect → …). Scroll drives a smooth
 * push-in; between stages the image blurs, swaps under the blur, and sharpens
 * again, so it reads as a microscope refocusing at higher magnification — never
 * a slideshow.
 *
 * To add / reorder a stage:
 *   1. Drop your image in  public/images/specimens/
 *   2. Add / move an entry below. ORDER = array order. That's it — no code.
 *
 * A missing file falls back to a labelled placeholder tile, so layout never
 * breaks before your assets arrive.
 */
export interface SpecimenStage {
  /** Public path to your image, e.g. "/images/specimens/leaf-full.jpg". */
  src: string;
  /** 0..1 point the zoom pushes toward (default centre). Aim it at the detail
   *  that becomes the next stage, so the push-in feels continuous. */
  focal?: [number, number];
  /** How far this stage magnifies before handing off (default 1.9). Bigger =
   *  a deeper push before the refocus. */
  zoomIn?: number;
  /** Shown at the settle point, e.g. "60×". */
  magnification?: string;
  /** Short name shown at the settle point, e.g. "Yellow Box leaf". */
  label?: string;
  /** Optional one-line fact shown under the label. */
  caption?: string;
}

export const specimenJourney: SpecimenStage[] = [
  {
    src: "/images/specimens/stage-1.jpeg",
    focal: [0.52, 0.48],
    magnification: "20×",
    label: "A leaf",
    caption: "Start with something you'd walk past.",
  },
  {
    src: "/images/specimens/stage-1.jpeg",
    focal: [0.5, 0.5],
    magnification: "60×",
    label: "The surface",
    caption: "Closer. The flat green isn't flat at all.",
  },
  {
    src: "/images/specimens/stage-1.jpeg",
    focal: [0.45, 0.55],
    magnification: "120×",
    label: "Cells & veins",
    caption: "Closer still. The plumbing of a living thing.",
  },
  {
    src: "/images/specimens/stage-1.jpeg",
    focal: [0.4, 0.55],
    magnification: "200×",
    label: "A visitor",
    caption: "And you're not the only one looking.",
  },
];

/** Tunable feel — safe defaults; adjust to taste. */
export const JOURNEY = {
  /** default push-in per stage if a stage omits zoomIn */
  zoomIn: 1.9,
  /** how blurry the crossover gets (max mip LOD sampled) */
  maxLod: 6.0,
  /** chromatic aberration at peak blur (0 = off) */
  chroma: 0.018,
  /** edge vignette at peak blur */
  vignette: 0.38,
  /** scroll length per stage, in viewport heights (bigger = slower zoom) */
  vhPerStage: 1.1,
  /** progress smoothing (0..1 per frame; lower = smoother/heavier) */
  smoothing: 0.12,
} as const;
