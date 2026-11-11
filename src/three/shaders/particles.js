export const particleVertex = /* glsl */ `
precision highp float;

attribute vec3 aPos0;
attribute vec3 aPos1;
attribute vec3 aPos2;
attribute vec3 aPos3;
attribute vec3 aPos4;
attribute float aSeed;
attribute float aSize;
attribute vec3 aRnd;

uniform float uW0;
uniform float uW1;
uniform float uW2;
uniform float uW3;
uniform float uW4;
uniform float uTime;
uniform float uSizePx;
uniform float uDrift;
uniform float uSwirl;
uniform float uDisperse;
uniform vec3  uMouseView;
uniform float uMouseForce;
uniform float uPulse;
uniform float uPulseRadius;
uniform vec3  uPulseOrigin;
uniform float uFade;

varying vec3  vColor;
varying float vAlpha;

void main() {
  vec3 p = aPos0 * uW0 + aPos1 * uW1 + aPos2 * uW2 + aPos3 * uW3 + aPos4 * uW4;

  // ── scroll velocity stretches the field outward from its own centre
  p *= 1.0 + uDisperse * (0.05 + aRnd.y * 0.22);

  // ── during a morph the matter twists around the vertical axis,
  //    so formations dissolve into one another instead of sliding
  if (abs(uSwirl) > 0.0005) {
    float ang = uSwirl * (0.35 + aRnd.z * 0.85);
    float ca = cos(ang);
    float sa = sin(ang);
    p.xz = mat2(ca, -sa, sa, ca) * p.xz;
  }

  // ── organic drift: each particle carries its own phase
  float t = uTime;
  vec3 drift = vec3(
    sin(t * 0.43 + aSeed * 6.2831),
    sin(t * 0.37 + aSeed * 12.566 + 1.7),
    cos(t * 0.39 + aSeed * 9.4248 + 3.1)
  );
  p += drift * (0.025 + aRnd.x * 0.075) * uDrift;

  // ── the field breathes
  p *= 1.0 + 0.009 * sin(t * 0.55 + aSeed * 0.4) * uDrift;

  // ── experimental volume: standing wave interference
  if (uW3 > 0.001) {
    float rip = sin(p.x * 2.05 + t * 1.25) * cos(p.z * 2.15 + t * 1.05);
    p.y += rip * 0.13 * uW3;
  }

  vec4 mv = modelViewMatrix * vec4(p, 1.0);

  // ── cursor gravity (view space)
  vec2 dm = mv.xy - uMouseView.xy;
  float dist = length(dm) + 0.0001;
  float infl = exp(-dist * dist * 0.2) * uMouseForce;
  float hot = exp(-dist * dist * 0.55) * uMouseForce;
  mv.xy += (dm / dist) * infl * (0.7 + aRnd.y * 0.9);
  mv.z  += infl * 0.5 * (aRnd.z - 0.5) * 2.0;

  // ── emitted shockwave
  if (uPulse > 0.001) {
    vec3 d3 = mv.xyz - uPulseOrigin;
    float pd = length(d3) + 0.0001;
    float ring = exp(-pow((pd - uPulseRadius) * 2.7, 2.0));
    mv.xyz += (d3 / pd) * ring * uPulse * 0.85;
  }

  gl_Position = projectionMatrix * mv;

  float depth = max(1.0, -mv.z);
  float sz = aSize * uSizePx / depth * (1.0 + uW4 * 0.85);
  gl_PointSize = clamp(sz, 0.7, 30.0);

  // ── palette: cold intelligence, warm ignition
  vec3 ice  = vec3(0.80, 0.90, 1.00);
  vec3 cyan = vec3(0.32, 0.63, 0.98);
  vec3 vio  = vec3(0.53, 0.42, 0.96);
  vec3 warm = vec3(1.00, 0.56, 0.26);

  vec3 col = mix(cyan, ice, smoothstep(0.12, 0.86, aSeed));
  col = mix(col, vio, smoothstep(0.52, 1.0, aRnd.z) * 0.55);

  float coreProx = exp(-length(p) * 0.42);
  col = mix(col, warm, coreProx * 0.62 * (uW0 + uW1 * 0.28));

  float spark = step(0.935, aRnd.x);
  col = mix(col, warm, spark * 0.85 * (uW0 * 0.6 + uW1));

  // the cursor is an energy probe: heat and brighten what it passes through
  col = mix(col, vec3(1.0, 0.9, 0.78), hot * 0.6);
  col *= 1.0 + hot * 0.35;

  // depth desaturation — aerial perspective
  float fog = smoothstep(9.0, 46.0, depth);
  col = mix(col, vec3(0.10, 0.14, 0.22), fog * 0.62);

  float twinkle = 0.86 + 0.14 * sin(t * 1.6 + aSeed * 44.0);
  float density = 0.18 + 0.86 * pow(aRnd.y, 1.25);

  float coreFade = mix(1.0, 0.42, exp(-length(p) * 1.5) * uW0);
  vAlpha = density * twinkle * uFade * (1.0 - fog * 0.55) * coreFade * (1.0 + hot * 1.15);
  vColor = col;
}
`;

export const particleFragment = /* glsl */ `
precision highp float;

varying vec3  vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a = smoothstep(1.0, 0.0, d);
  a = pow(a, 2.1);
  float alpha = a * vAlpha;
  gl_FragColor = vec4(vColor * alpha, alpha);
}
`;
