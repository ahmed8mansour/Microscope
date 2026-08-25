/**
 * Tiny shared mutable state for the specimen journey — read every frame by the
 * FocusHUD (magnification) and the docked 3D model (screen mirror) WITHOUT
 * triggering React re-renders. The journey's WebGL loop is the sole writer.
 */
export const specimenState = {
  /** smoothed global progress g ∈ [0, stageCount-1] */
  g: 0,
  /** number of stages */
  count: 0,
  /** nearest settled stage index */
  index: 0,
  /** how "in focus" the current settle is (1 at a stage, ~0 mid-crossover) */
  focus: 1,
  /** true while the journey's sticky viewport fills the screen — drives the HUD */
  active: false,
};
