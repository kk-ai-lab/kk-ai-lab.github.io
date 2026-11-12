export const lineVertex = /* glsl */ `
precision highp float;
attribute float aT;
attribute float aSeed;
uniform float uTime;
varying float vT;
varying float vSeed;
varying float vFade;

void main() {
  vT = aT;
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFade = 1.0 / (1.0 + max(0.0, -mv.z) * 0.05);
  gl_Position = projectionMatrix * mv;
}
`;

export const lineFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uOpacity;
uniform float uSpeed;
varying float vT;
varying float vSeed;
varying float vFade;

void main() {
  float head = fract(uTime * uSpeed + vSeed * 4.13);
  float d = abs(vT - head);
  d = min(d, 1.0 - d);
  float pulse = exp(-pow(d * 10.0, 2.0));
  float base = 0.09 * uOpacity * vFade;
  float a = base + pulse * 0.9 * uOpacity * vFade;
  vec3 cold = vec3(0.42, 0.68, 1.0);
  vec3 warm = vec3(1.0, 0.68, 0.4);
  vec3 col = mix(cold, warm, pulse);
  gl_FragColor = vec4(col * a, a);
}
`;

export const glowVertex = /* glsl */ `
precision highp float;
uniform float uSize;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  gl_Position = projectionMatrix * mv;
}
`;

export const glowFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float core = exp(-r * r * 5.2) * 0.42 + exp(-r * r * 26.0) * 0.16;
  float halo = pow(1.0 - r, 2.2) * 0.34;
  // anamorphic streak
  float streak = exp(-pow(p.y * 15.0, 2.0)) * exp(-abs(p.x) * 2.6) * 0.22;
  float flick = 0.9 + 0.1 * sin(uTime * 1.15);
  vec3 col = mix(vec3(1.0, 0.6, 0.31), vec3(0.4, 0.7, 1.0), smoothstep(0.0, 0.55, r));
  float a = (core * 0.75 + halo + streak) * uOpacity * flick;
  gl_FragColor = vec4(col * a, a);
}
`;

export const spriteVertex = /* glsl */ `
precision highp float;
attribute float aSeed;
uniform float uSizePx;
uniform float uTime;
varying float vA;
varying float vSeed;

void main() {
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float pulse = 0.78 + 0.22 * sin(uTime * 1.4 + aSeed * 30.0);
  gl_PointSize = uSizePx * (0.72 + aSeed * 0.8) * pulse;
  vA = (0.5 + aSeed * 0.5) * (1.0 / (1.0 + max(0.0, -mv.z) * 0.045));
  gl_Position = projectionMatrix * mv;
}
`;

export const spriteFragment = /* glsl */ `
precision highp float;
uniform float uOpacity;
varying float vA;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float core = pow(smoothstep(1.0, 0.0, d), 2.4);
  float a = core * vA * uOpacity;
  vec3 col = mix(vec3(0.62, 0.82, 1.0), vec3(1.0, 0.7, 0.42), step(0.86, vSeed));
  gl_FragColor = vec4(col * a, a);
}
`;

export const starVertex = /* glsl */ `
precision highp float;
attribute float aSeed;
uniform float uSizePx;
uniform float uTime;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSizePx * (0.5 + aSeed * 1.4);
  vA = 0.22 + 0.5 * aSeed * (0.72 + 0.28 * sin(uTime * 0.7 + aSeed * 55.0));
  gl_Position = projectionMatrix * mv;
}
`;

export const starFragment = /* glsl */ `
precision highp float;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a = pow(smoothstep(1.0, 0.0, d), 1.8) * vA;
  gl_FragColor = vec4(vec3(0.72, 0.82, 1.0) * a, a);
}
`;

export const postFragment = /* glsl */ `
precision highp float;
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uAberration;
uniform float uGrain;
uniform float uVignette;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  vec2 c = uv - 0.5;
  float r2 = dot(c, c);

  vec2 off = c * r2 * 0.018 * uAberration;
  vec3 col;
  col.r = texture2D(tDiffuse, uv + off).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - off).b;

  float v = smoothstep(1.02, 0.24, length(c) * 1.32);
  col *= mix(1.0, v, uVignette);

  float n = hash(uv * vec2(1440.0, 900.0) + fract(uTime * 0.37) * 97.3);
  col += (n - 0.5) * uGrain;

  gl_FragColor = vec4(col, 1.0);
}
`;
