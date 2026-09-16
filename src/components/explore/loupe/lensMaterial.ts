import * as THREE from "three";

/**
 * The glass of the loupe. It shows the magnified picture rendered for this frame, looked up by screen
 * position, so the picture stays right however the lens is turned; around it the glass does what glass does:
 * squeezes the picture towards the rim and parts its colours there, darkens under the frame, and catches the
 * light on its smudges, its curve and a soft reflection of a window.
 */

export interface LensUniforms {
  /** The magnified picture: the square around the lens, `power` times closer. */
  uView: { value: THREE.Texture | null };
  /** The model's AO / roughness / metal map; its roughness shows where the glass is smudged and scratched. */
  uSurface: { value: THREE.Texture | null };
  /** Centre of the lens on the target being drawn into, in pixels from its bottom left corner. */
  uCenter: { value: THREE.Vector2 };
  /** Radius of the lens on that target, in pixels. */
  uRadius: { value: number };
  /** Where the lens is in the model and how large, so the rim can be found on the glass itself. */
  uLensCenter: { value: THREE.Vector2 };
  uLensRadius: { value: number };
  uBarrel: { value: number };
  uAberration: { value: number };
  uTint: { value: THREE.Color };
  uSheen: { value: THREE.Color };
}

const vertexShader = /* glsl */ `
uniform vec2 uLensCenter;
uniform float uLensRadius;
varying vec2 vLocal;
varying vec2 vUv;
varying vec3 vViewPosition;
varying vec3 vViewNormal;

void main() {
  vUv = uv;
  vLocal = (position.xy - uLensCenter) / uLensRadius;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = mvPosition.xyz;
  vViewNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uView;
uniform sampler2D uSurface;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uBarrel;
uniform float uAberration;
uniform vec3 uTint;
uniform vec3 uSheen;
varying vec2 vLocal;
varying vec2 vUv;
varying vec3 vViewPosition;
varying vec3 vViewNormal;

void main() {
  // Where this fragment is within the lens on the screen (the unit circle), and how far from the centre of the glass.
  vec2 q = (gl_FragCoord.xy - uCenter) / uRadius;
  float r = clamp(length(vLocal), 0.0, 1.0);
  float r2 = r * r;

  // A bulging lens squeezes what lies near its rim, and the colours part a little there.
  vec2 at = q * (1.0 - uBarrel * r2 * r2);
  float split = uAberration * r2 * r2;
  vec3 color = vec3(
    texture2D(uView, 0.5 + 0.5 * at * (1.0 + split)).r,
    texture2D(uView, 0.5 + 0.5 * at).g,
    texture2D(uView, 0.5 + 0.5 * at * (1.0 - split)).b
  );

  // Tinted glass, shaded where the frame holds it.
  color *= mix(vec3(1.0), uTint, 0.3);
  color *= 1.0 - 0.5 * smoothstep(0.8, 1.0, r);

  vec3 n = normalize(vViewNormal);
  vec3 v = normalize(-vViewPosition);
  float fresnel = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 4.0);
  float smudge = smoothstep(0.12, 0.55, texture2D(uSurface, vUv).g);
  // A soft window of light in the upper left of the glass, and a thin bright arc along that side of the rim.
  float window = smoothstep(0.5, 0.0, length((vLocal - vec2(-0.36, 0.42)) * vec2(1.0, 1.6)));
  vec2 towards = normalize(vLocal + vec2(1e-5));
  float arc = smoothstep(0.84, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r)) * smoothstep(0.1, 0.9, dot(towards, normalize(vec2(-0.6, 0.8))));

  color += uSheen * (0.015 + 0.35 * fresnel + 0.07 * smudge + 0.16 * window * window + 0.3 * arc);

  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export type LensMaterial = THREE.ShaderMaterial & { uniforms: LensUniforms };

export function createLensMaterial(lens: { center: { x: number; y: number }; radius: number }, surface: THREE.Texture | null): LensMaterial {
  const uniforms: LensUniforms = {
    uView: { value: null },
    uSurface: { value: surface },
    uCenter: { value: new THREE.Vector2() },
    uRadius: { value: 1 },
    uLensCenter: { value: new THREE.Vector2(lens.center.x, lens.center.y) },
    uLensRadius: { value: lens.radius },
    uBarrel: { value: 0.22 },
    uAberration: { value: 0.03 },
    uTint: { value: new THREE.Color(0.72, 0.8, 0.79) },
    uSheen: { value: new THREE.Color("#ffe2b8") },
  };
  return new THREE.ShaderMaterial({ uniforms: uniforms as unknown as Record<string, THREE.IUniform>, vertexShader, fragmentShader }) as LensMaterial;
}
