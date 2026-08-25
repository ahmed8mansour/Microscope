/**
 * Specimen-journey shader (GLSL ES 3.0, for a full-screen quad).
 *
 * Renders a continuous optical zoom between two stage images:
 *  - focal-point "cover" zoom (fills the viewport, pushes toward a focal point),
 *  - defocus via mipmap LOD (textureLod) — cheap, and reads like a real lens,
 *  - a blur-masked cross-dissolve so the image SWAP is hidden inside the blur,
 *  - faint chromatic aberration + vignette that grow with blur for a lens feel.
 *
 * All of it is driven by uniforms the JS sets from one smoothed scroll value.
 */

export const specimenVertexShader = /* glsl */ `
out vec2 vUv;
void main() {
  vUv = uv;
  // Full-screen quad: emit clip-space directly, ignore the camera.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const specimenFragmentShader = /* glsl */ `
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform vec2  uImgA;      // image px size (for cover fit)
uniform vec2  uImgB;
uniform vec2  uViewport;  // canvas px size
uniform vec2  uFocalA;
uniform vec2  uFocalB;
uniform float uZoomA;
uniform float uZoomB;
uniform float uBlurA;     // 0..1
uniform float uBlurB;     // 0..1
uniform float uMix;       // 0..1  (weight of B)
uniform float uMaxLod;
uniform float uChroma;
uniform float uVignette;

// Map screen uv -> image uv with cover fit, focal offset and zoom.
vec2 coverUV(vec2 uv, vec2 img, vec2 view, vec2 focal, float zoom) {
  vec2 s = uv - 0.5;
  float va = view.x / view.y;
  float ia = img.x / img.y;
  vec2 scale = (va > ia) ? vec2(1.0, ia / va) : vec2(va / ia, 1.0);
  return focal + (s * scale) / zoom;
}

// Sample with LOD-based defocus + chromatic aberration that grows with blur.
vec3 sampleTex(sampler2D tex, vec2 uv, float lod, float chroma) {
  vec2 dir = uv - 0.5;
  float ca = chroma * lod;
  float r = textureLod(tex, clamp(uv + dir * ca, 0.0, 1.0), lod).r;
  float g = textureLod(tex, clamp(uv,            0.0, 1.0), lod).g;
  float b = textureLod(tex, clamp(uv - dir * ca, 0.0, 1.0), lod).b;
  return vec3(r, g, b);
}

void main() {
  vec2 uvA = coverUV(vUv, uImgA, uViewport, uFocalA, uZoomA);
  vec2 uvB = coverUV(vUv, uImgB, uViewport, uFocalB, uZoomB);

  vec3 colA = sampleTex(uTexA, uvA, uBlurA * uMaxLod, uChroma);
  vec3 colB = sampleTex(uTexB, uvB, uBlurB * uMaxLod, uChroma);

  vec3 col = mix(colA, colB, uMix);

  // Vignette deepens at the blurred crossover (uVignette is fed the blur hump).
  float d = distance(vUv, vec2(0.5));
  col *= 1.0 - uVignette * smoothstep(0.28, 0.85, d);

  fragColor = vec4(col, 1.0);
}
`;
