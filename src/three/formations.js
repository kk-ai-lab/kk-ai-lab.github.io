/**
 * formations.js
 * Builds five co-resident point formations for the same particle set.
 * Every particle holds all five positions as vertex attributes; the vertex
 * shader cross-fades between them. No geometry is ever rebuilt at runtime.
 */

const TAU = Math.PI * 2;

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(rnd) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

/* ── state 0 · ORIGIN ─────────────────────────────────────────
   A singularity with an accretion disc: a two-armed logarithmic
   spiral, a compact bulge, polar jets, and a filamentary halo.   */
function originPoint(rnd, i, out) {
  const gross = rnd();

  // bulge
  if (gross < 0.045) {
    const z = rnd() * 2 - 1;
    const th = rnd() * TAU;
    const r = Math.sqrt(1 - z * z);
    const rad = Math.pow(rnd(), 2.4) * 0.34;
    out[0] = Math.cos(th) * r * rad;
    out[1] = z * rad;
    out[2] = Math.sin(th) * r * rad;
    return;
  }

  // polar jets — narrow cones along the rotation axis
  if (gross < 0.075) {
    const sign = rnd() < 0.5 ? -1 : 1;
    const t = Math.pow(rnd(), 0.75);
    const h = 0.35 + t * 2.5;
    const rad = Math.pow(rnd(), 1.7) * 0.19 * (1 - t * 0.6);
    const th = rnd() * TAU;
    out[0] = Math.cos(th) * rad;
    out[1] = sign * h;
    out[2] = Math.sin(th) * rad;
    return;
  }

  // spiral disc
  if (gross < 0.79) {
    const arm = i % 2;
    const u = rnd();
    const r = 0.92 + Math.pow(u, 0.6) * 2.5;
    const spread = 0.24 + 0.52 * (r / 3.4);
    const theta = arm * Math.PI + r * 1.52 + gauss(rnd) * spread * 0.6;
    const rr = r + gauss(rnd) * 0.055 * (0.6 + r * 0.5);
    const x = Math.cos(theta) * rr;
    const z = Math.sin(theta) * rr;
    const y = gauss(rnd) * (0.024 + 0.12 * Math.max(0, 1 - r / 4.1));
    const tilt = 0.24;
    out[0] = x;
    out[1] = y * Math.cos(tilt) - z * Math.sin(tilt);
    out[2] = y * Math.sin(tilt) + z * Math.cos(tilt);
    return;
  }

  // filamentary halo
  const z = rnd() * 2 - 1;
  const th = rnd() * TAU;
  const r = Math.sqrt(1 - z * z);
  const dx = Math.cos(th) * r;
  const dy = z;
  const dz = Math.sin(th) * r;
  let rad = 2.15 + Math.pow(rnd(), 0.55) * 1.35;
  const filament =
    Math.sin(th * 2 + 1.4) * 0.55 + Math.sin(th * 5 - 2.1) * 0.45;
  rad *= 1 + filament * 0.12;
  out[0] = dx * rad;
  out[1] = dy * rad * 0.7;
  out[2] = dz * rad;
}


/* ── state 1 · CONNECTION ─────────────────────────────────────
   Node clusters on a spherical shell, particles strung along
   the wiring between them.                                     */
function buildGraph(rnd, mobile) {
  const count = mobile ? 34 : 56;
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const th = i * 2.399963 * 1.71 + rnd() * 0.5;
    const inner = i % 5 < 2;
    const R = inner
      ? 0.85 + Math.pow(rnd(), 0.7) * 1.45
      : 2.62 + (rnd() - 0.5) * 0.58;
    nodes.push({
      x: Math.cos(th) * r * R,
      y: y * R * 0.94,
      z: Math.sin(th) * r * R,
      r: 0.1 + rnd() * 0.09,
    });
  }

  const seen = new Set();
  const edges = [];
  const addEdge = (a, b) => {
    const k = a < b ? a + ':' + b : b + ':' + a;
    if (seen.has(k)) return;
    seen.add(k);
    edges.push([a, b]);
  };

  for (let i = 0; i < nodes.length; i++) {
    const near = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const dx = nodes[i].x - nodes[j].x;
      const dy = nodes[i].y - nodes[j].y;
      const dz = nodes[i].z - nodes[j].z;
      near.push([j, dx * dx + dy * dy + dz * dz]);
    }
    near.sort((a, b) => a[1] - b[1]);
    const links = 2 + (i % 2);
    for (let n = 0; n < links; n++) {
      const j = near[n][0];
      if (Math.sqrt(near[n][1]) > 3.1) continue;
      addEdge(i, j);
    }
  }

  // a few long chords for depth
  for (let i = 0; i < 9; i++) {
    const a = Math.floor(rnd() * nodes.length);
    const b = Math.floor(rnd() * nodes.length);
    if (a !== b) addEdge(a, b);
  }

  return { nodes, edges };
}

/* ── state 2 · EMERGENCE ──────────────────────────────────────
   Three intertwined strands tapering at both ends — order that
   appears to have grown rather than been placed.               */
function emergencePoint(rnd, i, out) {
  const strand = i % 3;
  const u = rnd();
  const ang = u * TAU * 1.92 + (strand * TAU) / 3;
  const taper = Math.pow(Math.sin(Math.PI * u), 0.78);
  const R = 0.28 + 1.62 * taper;
  const scatter = 0.032 + 0.075 * taper;
  out[0] = Math.cos(ang) * R + gauss(rnd) * scatter;
  out[1] = (u - 0.5) * 5.25 + gauss(rnd) * 0.032;
  out[2] = Math.sin(ang) * R + gauss(rnd) * scatter;
}

/* ── state 3 · EXPERIMENTATION ────────────────────────────────
   A bounded instrument volume: a dotted shell with lit edges, a
   coarse internal lattice, and a distant field of free particles. */
const HALF = 1.82;
let FACE = 56;
let FACE_N = FACE * FACE;
let EDGE_N = 0;
let LATTICE = 0;

function latticeSetup(count) {
  FACE = Math.max(28, Math.min(54, Math.round(Math.sqrt((count * 0.082) / 6))));
  FACE_N = FACE * FACE;
  EDGE_N = 12 * 260;
  LATTICE = Math.min(count, 6 * FACE_N + EDGE_N + 1000);
}

function latticePoint(i, out, rnd) {
  if (i < 6 * FACE_N) {
    const face = Math.floor(i / FACE_N);
    const rem = i % FACE_N;
    const u = (rem % FACE) / (FACE - 1);
    const v = Math.floor(rem / FACE) / (FACE - 1);
    const a = (u - 0.5) * 2 * HALF;
    const b = (v - 0.5) * 2 * HALF;
    const j = 0.004;
    if (face === 0) { out[0] = -HALF; out[1] = b; out[2] = a; }
    else if (face === 1) { out[0] = HALF; out[1] = b; out[2] = a; }
    else if (face === 2) { out[0] = a; out[1] = -HALF; out[2] = b; }
    else if (face === 3) { out[0] = a; out[1] = HALF; out[2] = b; }
    else if (face === 4) { out[0] = a; out[1] = b; out[2] = -HALF; }
    else { out[0] = a; out[1] = b; out[2] = HALF; }
    out[0] += gauss(rnd) * j;
    out[1] += gauss(rnd) * j;
    out[2] += gauss(rnd) * j;
    return;
  }

  if (i < 6 * FACE_N + EDGE_N) {
    const k = i - 6 * FACE_N;
    const e = Math.floor(k / 260);
    const t = ((k % 260) / 259 - 0.5) * 2 * HALF;
    const s1 = e < 6 ? -1 : 1;
    const axis = Math.floor((e % 6) / 2);
    const s2 = (e % 2) * 2 - 1;
    if (axis === 0) { out[0] = t; out[1] = s1 * HALF; out[2] = s2 * HALF; }
    else if (axis === 1) { out[0] = s1 * HALF; out[1] = t; out[2] = s2 * HALF; }
    else { out[0] = s1 * HALF; out[1] = s2 * HALF; out[2] = t; }
    return;
  }

  const k = i - 6 * FACE_N - EDGE_N;
  const G = 10;
  const s2 = (G - 1) / 2;
  out[0] = ((k % G) - s2) / s2 * HALF * 0.8;
  out[1] = ((Math.floor(k / G) % G) - s2) / s2 * HALF * 0.8;
  out[2] = ((Math.floor(k / (G * G)) % G) - s2) / s2 * HALF * 0.8;
}

function dustCloudPoint(rnd, out) {
  const z = rnd() * 2 - 1;
  const th = rnd() * TAU;
  const r = Math.sqrt(1 - z * z);
  const R = 11 + Math.pow(rnd(), 0.5) * 38;
  out[0] = Math.cos(th) * r * R;
  out[1] = z * R * 0.9;
  out[2] = Math.sin(th) * r * R;
}

/* ── state 4 · INFINITY ───────────────────────────────────────
   A three-ribbon logarithmic tunnel receding past the camera's
   ability to resolve it.                                       */
function infinityPoint(rnd, i, out) {
  const K = 22;
  const k = Math.floor(Math.pow(rnd(), 0.9) * K);
  const t = rnd() * TAU + k * 0.42;
  const rad = 0.55 + k * 0.88;
  const j = 0.01 + k * 0.006;
  out[0] = Math.cos(t) * rad + gauss(rnd) * j;
  out[1] = Math.sin(t) * rad * 0.95 + gauss(rnd) * j;
  out[2] = 3.4 - k * 1.18 - rnd() * 0.18;
}

/**
 * @returns {{positions: Float32Array[], seeds, sizes, rands, nodes, edges, count}}
 */
export function buildUniverse(count, mobile) {
  const rnd = mulberry32(0x4b4b2e41);
  const N = count;
  const positions = Array.from({ length: 5 }, () => new Float32Array(N * 3));
  const seeds = new Float32Array(N);
  const sizes = new Float32Array(N);
  const rands = new Float32Array(N * 3);
  const graph = buildGraph(rnd, mobile);

  latticeSetup(N);
  const gridCount = LATTICE;

  const tmp = [0, 0, 0];
  const nodePoints = [];

  for (let i = 0; i < N; i++) {
    const s = rnd();
    seeds[i] = s;
    rands[i * 3] = rnd();
    rands[i * 3 + 1] = rnd();
    rands[i * 3 + 2] = rnd();

    // 0 origin
    originPoint(rnd, i, tmp);
    positions[0][i * 3] = tmp[0];
    positions[0][i * 3 + 1] = tmp[1];
    positions[0][i * 3 + 2] = tmp[2];

    // 1 connection
    const pick = rnd();
    let px;
    let py;
    let pz;
    if (pick < 0.42) {
      const n = graph.nodes[Math.floor(rnd() * graph.nodes.length)];
      const sig = n.r;
      px = n.x + gauss(rnd) * sig;
      py = n.y + gauss(rnd) * sig;
      pz = n.z + gauss(rnd) * sig;
    } else if (pick < 0.9) {
      const e = graph.edges[Math.floor(rnd() * graph.edges.length)];
      const a = graph.nodes[e[0]];
      const b = graph.nodes[e[1]];
      const t = rnd();
      const j = 0.032 + Math.sin(t * Math.PI) * 0.028;
      px = a.x + (b.x - a.x) * t + gauss(rnd) * j;
      py = a.y + (b.y - a.y) * t + gauss(rnd) * j;
      pz = a.z + (b.z - a.z) * t + gauss(rnd) * j;
    } else {
      const z = rnd() * 2 - 1;
      const th = rnd() * TAU;
      const r = Math.sqrt(1 - z * z);
      const R = 3.3 + gauss(rnd) * 0.24;
      px = Math.cos(th) * r * R;
      py = z * R;
      pz = Math.sin(th) * r * R;
    }
    positions[1][i * 3] = px;
    positions[1][i * 3 + 1] = py;
    positions[1][i * 3 + 2] = pz;

    // 2 emergence
    emergencePoint(rnd, i, tmp);
    positions[2][i * 3] = tmp[0];
    positions[2][i * 3 + 1] = tmp[1];
    positions[2][i * 3 + 2] = tmp[2];

    // 3 experimentation
    const isLattice = i < gridCount;
    if (isLattice) {
      latticePoint(i, tmp, rnd);
    } else {
      dustCloudPoint(rnd, tmp);
    }
    positions[3][i * 3] = tmp[0];
    positions[3][i * 3 + 1] = tmp[1];
    positions[3][i * 3 + 2] = tmp[2];

    // 4 infinity
    infinityPoint(rnd, i, tmp);
    positions[4][i * 3] = tmp[0];
    positions[4][i * 3 + 1] = tmp[1];
    positions[4][i * 3 + 2] = tmp[2];

    sizes[i] = isLattice ? 1.25 + rnd() * 0.45 : 0.32 + rnd() * 0.38;
  }

  for (const n of graph.nodes) nodePoints.push(n.x, n.y, n.z);

  return {
    positions,
    seeds,
    sizes,
    rands,
    nodes: graph.nodes,
    edges: graph.edges,
    nodePoints: new Float32Array(nodePoints),
    count: N,
  };
}
