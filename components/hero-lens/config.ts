// Single switch for the hero lens. Set to false to turn it off completely:
//  - <HeroLens /> is not rendered (Hero.tsx),
//  - the 3D canvas stops keeping its drawing buffer (ProductScene.tsx),
// leaving the hero exactly as the calm layout.
// To remove the feature, delete this folder and the two one-line uses above.
export const ENABLE_HERO_LENS = true;

export const LENS_RADIUS = 165; // px
export const LENS_ZOOM = 1.8;
