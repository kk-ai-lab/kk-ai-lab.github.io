import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

import { buildUniverse } from './formations.js';
import * as P from './shaders/particles.js';
import * as M from './shaders/misc.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

/* camera keyframes — one per state */
const KEYS = [
  { pos: V(0.0, 1.32, 10.6), look: V(-0.82, 0.02, 0), fov: 43, roll: 0.0 },
  { pos: V(2.35, 1.15, 9.3), look: V(0.88, 0.0, 0), fov: 43, roll: -0.018 },
  { pos: V(-0.2, 0.9, 9.3), look: V(-0.64, 0.0, 0), fov: 43, roll: 0.024 },
  { pos: V(-3.45, 2.15, 8.55), look: V(-0.42, -0.04, 0), fov: 43, roll: -0.018 },
  { pos: V(-0.75, 0.92, 10.9), look: V(0.72, -0.16, -14), fov: 46, roll: 0.0 },
];

export class Universe {
  constructor(canvas, { count, reduced }) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.time = 0;
    this.state = 0;
    this.targetState = 0;
    this.fade = 0;
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerTarget = new THREE.Vector2(0, 0);
    this.force = 0;
    this.forceTarget = 0;
    this.pulseT = 999;
    this.pulseActive = false;
    this.pulseOrigin = new THREE.Vector3();
    this.mouseView = new THREE.Vector3();
    this.dprCap = 1.75;
    this.orbit = 0;
    this.orbitTarget = 0;
    this.vel = 0;
    this.velTarget = 0;
    this.impulse = 0;

    this._initRenderer();
    this._initScene();
    this._initParticles(count);
    this._initGraph();
    this._initCage();
    this._initHalo();
    this._initStars();
    this._initPost();

    this.resize();
    this._tmp = {
      ndc: new THREE.Vector3(),
      world: new THREE.Vector3(),
      pos: new THREE.Vector3(),
      look: new THREE.Vector3(),
      size: new THREE.Vector2(),
      w: [0, 0, 0, 0, 0],
    };
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setClearColor(0x050609, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  _initScene() {
    this.scene = new THREE.Scene();
    // everything that belong to the field rotates together when dragged
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.camera = new THREE.PerspectiveCamera(43, 1, 0.1, 260);
    this.camera.position.copy(KEYS[0].pos);
    this.camera.lookAt(KEYS[0].look);
  }

  _initParticles(count) {
    const data = buildUniverse(count, window.innerWidth < 760);
    this.data = data;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(data.positions[0], 3));
    g.setAttribute('aPos0', new THREE.BufferAttribute(data.positions[0], 3));
    g.setAttribute('aPos1', new THREE.BufferAttribute(data.positions[1], 3));
    g.setAttribute('aPos2', new THREE.BufferAttribute(data.positions[2], 3));
    g.setAttribute('aPos3', new THREE.BufferAttribute(data.positions[3], 3));
    g.setAttribute('aPos4', new THREE.BufferAttribute(data.positions[4], 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(data.seeds, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1));
    g.setAttribute('aRnd', new THREE.BufferAttribute(data.rands, 3));

    this.pUniforms = {
      uW0: { value: 1 },
      uW1: { value: 0 },
      uW2: { value: 0 },
      uW3: { value: 0 },
      uW4: { value: 0 },
      uTime: { value: 0 },
      uSizePx: { value: 40 },
      uDrift: { value: 1 },
      uSwirl: { value: 0 },
      uDisperse: { value: 0 },
      uMouseView: { value: new THREE.Vector3() },
      uMouseForce: { value: 0 },
      uPulse: { value: 0 },
      uPulseRadius: { value: 0 },
      uPulseOrigin: { value: new THREE.Vector3() },
      uFade: { value: 0 },
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.pUniforms,
      vertexShader: P.particleVertex,
      fragmentShader: P.particleFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    this.world.add(this.points);
  }

  _initGraph() {
    const { nodes, edges } = this.data;
    const n = edges.length;
    const pos = new Float32Array(n * 2 * 3);
    const aT = new Float32Array(n * 2);
    const aSeed = new Float32Array(n * 2);

    for (let i = 0; i < n; i++) {
      const [ai, bi] = edges[i];
      const a = nodes[ai];
      const b = nodes[bi];
      pos[i * 6 + 0] = a.x;
      pos[i * 6 + 1] = a.y;
      pos[i * 6 + 2] = a.z;
      pos[i * 6 + 3] = b.x;
      pos[i * 6 + 4] = b.y;
      pos[i * 6 + 5] = b.z;
      aT[i * 2] = 0;
      aT[i * 2 + 1] = 1;
      const s = Math.random();
      aSeed[i * 2] = s;
      aSeed[i * 2 + 1] = s;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));

    this.lineUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSpeed: { value: 0.16 },
    };
    const lm = new THREE.ShaderMaterial({
      uniforms: this.lineUniforms,
      vertexShader: M.lineVertex,
      fragmentShader: M.lineFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lines = new THREE.LineSegments(g, lm);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 1;
    this.world.add(this.lines);

    // node beacons
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(this.data.nodePoints, 3));
    const seeds = new Float32Array(nodes.length);
    for (let i = 0; i < nodes.length; i++) seeds[i] = Math.random();
    ng.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.nodeUniforms = {
      uSizePx: { value: 14 },
      uOpacity: { value: 0 },
      uTime: { value: 0 },
    };
    const nm = new THREE.ShaderMaterial({
      uniforms: this.nodeUniforms,
      vertexShader: M.spriteVertex,
      fragmentShader: M.spriteFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.nodes = new THREE.Points(ng, nm);
    this.nodes.frustumCulled = false;
    this.nodes.renderOrder = 3;
    this.world.add(this.nodes);

    const el = document.getElementById('as-nodes');
    const ee = document.getElementById('as-edges');
    if (el) el.textContent = String(nodes.length);
    if (ee) ee.textContent = String(edges.length);
  }

  _initCage() {
    const h = 1.81;
    const c = [];
    for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) c.push([x, y, z]);
    const pairs = [];
    for (let i = 0; i < 8; i++) {
      for (let j = i + 1; j < 8; j++) {
        let diff = 0;
        for (let k = 0; k < 3; k++) if (c[i][k] !== c[j][k]) diff++;
        if (diff === 1) pairs.push([c[i], c[j]]);
      }
    }
    const n = pairs.length;
    const pos = new Float32Array(n * 6);
    const aT = new Float32Array(n * 2);
    const aSeed = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const [a, b] = pairs[i];
      pos.set([a[0], a[1], a[2], b[0], b[1], b[2]], i * 6);
      aT[i * 2] = 0;
      aT[i * 2 + 1] = 1;
      const sd = i / n;
      aSeed[i * 2] = sd;
      aSeed[i * 2 + 1] = sd;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
    this.cageUniforms = {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSpeed: { value: 0.34 },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.cageUniforms,
      vertexShader: M.lineVertex,
      fragmentShader: M.lineFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.cage = new THREE.LineSegments(g, m);
    this.cage.frustumCulled = false;
    this.cage.renderOrder = 1;
    this.world.add(this.cage);
  }

  _initHalo() {
    const g = new THREE.PlaneGeometry(1, 1);
    this.haloUniforms = {
      uSize: { value: 5.2 },
      uTime: { value: 0 },
      uOpacity: { value: 0 },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.haloUniforms,
      vertexShader: M.glowVertex,
      fragmentShader: M.glowFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.halo = new THREE.Mesh(g, m);
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 0;
    this.halo.position.set(0, 0, -0.4);
    this.scene.add(this.halo);

    // instrument rings
    const makeRing = (radius, tiltX, tiltY, color, order) => {
      const pts = [];
      const seg = 220;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const ring = new THREE.Line(geo, mat);
      ring.rotation.x = tiltX;
      ring.rotation.y = tiltY;
      ring.renderOrder = order;
      this.world.add(ring);
      return ring;
    };
    this.ringA = makeRing(4.15, 1.36, 0.15, 0x6fa8ff, 0);
    this.ringB = makeRing(5.05, -1.12, 0.5, 0xffa066, 0);
    this.ringB.visible = false;
  }

  _initStars() {
    const N = 1500;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const z = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - z * z);
      const R = 38 + Math.pow(Math.random(), 0.6) * 62;
      pos[i * 3] = Math.cos(th) * r * R;
      pos[i * 3 + 1] = z * R * 0.8;
      pos[i * 3 + 2] = Math.sin(th) * r * R;
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.starUniforms = { uSizePx: { value: 3 }, uTime: { value: 0 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: M.starVertex,
      fragmentShader: M.starFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.stars = new THREE.Points(g, m);
    this.stars.frustumCulled = false;
    this.scene.add(this.stars);
  }

  _initPost() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.68, 0.85, 0.4);
    this.composer.addPass(this.bloom);

    this.output = new OutputPass();
    this.composer.addPass(this.output);

    this.gradeUniforms = {
      tDiffuse: { value: null },
      uTime: { value: 0 },
      uAberration: { value: 1 },
      uGrain: { value: 0.018 },
      uVignette: { value: 0.28 },
    };
    this.grade = new ShaderPass({
      uniforms: this.gradeUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: M.postFragment,
    });
    this.composer.addPass(this.grade);
  }

  setQuality(cap) {
    if (cap >= this.dprCap) return false;
    this.dprCap = cap;
    this.resize(true);
    return true;
  }

  resize(force = false) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!force && w === this._lastW && h === this._lastH && this.renderer) return;
    this._lastW = w;
    this._lastH = h;
    const pr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();

    const buf = this.renderer.getDrawingBufferSize(this._tmp ? this._tmp.size : new THREE.Vector2());
    this.pUniforms.uSizePx.value = (buf.y / 900) * 26;
    this.nodeUniforms.uSizePx.value = Math.max(8, (buf.y / 900) * 15);
    this.starUniforms.uSizePx.value = Math.max(1.6, (buf.y / 900) * 2.6);
  }

  setPointer(nx, ny, active) {
    this.pointerTarget.set(nx, ny);
    this.forceTarget = active ? 1 : 0;
  }

  drag(dx) {
    this.orbitTarget = THREE.MathUtils.clamp(this.orbitTarget + dx * 0.003, -1.35, 1.35);
  }

  setVelocity(v) {
    this.velTarget = v;
  }

  emit() {
    this.pulseT = 0;
    this.pulseActive = true;
    this.impulse = 1;
    this.pulseOrigin.copy(this.mouseView);
  }

  setState(s, immediate = false) {
    this.targetState = s;
    // Scroll progress is already eased by the shader's state interpolation;
    // a second temporal lag here would detach copy from the formation.
    if (immediate || this.reduced) this.state = s;
  }

  reveal() {
    this.revealing = true;
  }

  update(dt, time) {
    // Reduced motion freezes the ambient clock, but direct pointer response stays live.
    const t = this.reduced ? 0 : time;
    this.time = t;

    // Only the dev inspection path uses temporal easing now.
    const k = this.reduced ? 1 : 1 - Math.exp(-dt * 10.5);
    this.state += (this.targetState - this.state) * k;

    const s = this.state;
    const i0 = Math.min(3, Math.floor(s));
    const f = THREE.MathUtils.clamp(s - i0, 0, 1);
    const fs = f * f * (3 - 2 * f);
    const w = this._tmp.w;
    w.fill(0);
    w[i0] = 1 - fs;
    w[Math.min(i0 + 1, 4)] += fs;

    this.pUniforms.uW0.value = w[0];
    this.pUniforms.uW1.value = w[1];
    this.pUniforms.uW2.value = w[2];
    this.pUniforms.uW3.value = w[3];
    this.pUniforms.uW4.value = w[4];

    // pointer smoothing
    this.pointer.lerp(this.pointerTarget, 1 - Math.exp(-dt * 6.5));
    const fk = 1 - Math.exp(-dt * 3.2);
    this.force += (this.forceTarget - this.force) * fk;

    // fade in
    this.fade += (1 - this.fade) * (1 - Math.exp(-dt * 2.2));
    this.pUniforms.uFade.value = this.fade;

    // camera
    const pos = this._tmp.pos.set(0, 0, 0);
    const look = this._tmp.look.set(0, 0, 0);
    let fov = 0;
    let roll = 0;
    for (let i = 0; i < 5; i++) {
      const ww = w[i];
      if (ww <= 0) continue;
      pos.addScaledVector(KEYS[i].pos, ww);
      look.addScaledVector(KEYS[i].look, ww);
      fov += KEYS[i].fov * ww;
      roll += KEYS[i].roll * ww;
    }

    const ambient = this.reduced ? 0 : 1;
    const mx = this.pointer.x;
    const my = this.pointer.y;
    pos.x += mx * 0.5 + Math.sin(t * 0.13) * 0.13 * ambient;
    pos.y += my * 0.3 + Math.cos(t * 0.11) * 0.1 * ambient;
    pos.z += Math.sin(t * 0.17) * 0.16 * ambient - w[4] * (0.55 + Math.sin(t * 0.35) * 0.45) * ambient;
    look.x += mx * 0.72;
    look.y += my * 0.46;

    // portrait viewports have a very narrow horizontal FOV — widen and pull back
    const asp = this.camera.aspect;
    const portrait = Math.max(0, 1.05 - asp);
    if (portrait > 0) {
      fov += portrait * 22;
      look.y -= portrait * 1.15;
      pos.sub(look).multiplyScalar(1 + portrait * 0.42).add(look);
    }

    this.camera.position.copy(pos);
    this.camera.lookAt(look);
    if (roll !== 0) this.camera.rotateZ(roll);
    if (Math.abs(this.camera.fov - fov) > 0.02) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();

    // mouse position projected into view space
    const ndc = this._tmp.ndc.set(mx, my, 0.5).unproject(this.camera);
    ndc.sub(this.camera.position).normalize();
    const dist = this.camera.position.distanceTo(look);
    const world = this._tmp.world.copy(this.camera.position).addScaledVector(ndc, dist);
    world.applyMatrix4(this.camera.matrixWorldInverse);
    this.mouseView.copy(world);

    this.pUniforms.uMouseView.value.copy(world);
    this.pUniforms.uMouseForce.value = this.force * 0.6;
    // Each state has its own kinetic temperature: quiet singularity,
    // flowing graph, growing helix, restless lattice, fast open tunnel.
    const stateDrift = 0.38 + w[1] * 0.16 + w[2] * 0.32 + w[3] * 0.52 + w[4] * 0.14;
    this.pUniforms.uTime.value = t;
    this.pUniforms.uDrift.value = (stateDrift + Math.abs(f - 0.5) * 1.1) * ambient;
    const off = this.state - Math.round(this.state);
    this.pUniforms.uSwirl.value = ambient * off * (2.0 + w[2] * 0.7 + w[4] * 0.45);

    this.vel += (this.velTarget - this.vel) * (1 - Math.exp(-dt * 6));
    this.pUniforms.uDisperse.value = ambient * this.vel * 0.9;

    // drag orbit + a slow idle rotation; the tunnel is directional, so the
    // spin is unwound as the field becomes INFINITY
    this.orbit += (this.orbitTarget - this.orbit) * (1 - Math.exp(-dt * 4.5));
    const spin = this.orbit + t * 0.012;
    this.world.rotation.y = spin * (1 - w[4]);

    // pulse
    if (this.pulseActive) {
      this.pulseT += dt;
      const life = this.pulseT / 1.45;
      if (life >= 1) {
        this.pulseActive = false;
        this.pUniforms.uPulse.value = 0;
      } else {
        this.pUniforms.uPulse.value = Math.pow(1 - life, 1.7);
        this.pUniforms.uPulseRadius.value = life * 8.2;
        this.pUniforms.uPulseOrigin.value.copy(this.pulseOrigin);
      }
    }

    // graph
    this.lineUniforms.uTime.value = t;
    this.lineUniforms.uOpacity.value = w[1] * 1.0 + w[0] * 0.08;
    this.nodeUniforms.uTime.value = t;
    this.nodeUniforms.uOpacity.value = w[1] * 0.9 + w[2] * 0.12;

    this.cageUniforms.uTime.value = t;
    this.cageUniforms.uOpacity.value = w[3] * 1.35 * this.fade;

    // halo follows the first two states
    this.haloUniforms.uTime.value = t;
    this.haloUniforms.uOpacity.value = (w[0] * 0.62 + w[1] * 0.22 + w[2] * 0.05 + w[4] * 0.26) * this.fade;
    this.haloUniforms.uSize.value = 6.6 + Math.sin(t * 0.5) * 0.25;

    const ringOp = (w[0] * 0.035 + w[1] * 0.02) * this.fade;
    this.ringA.material.opacity = ringOp;
    this.ringB.material.opacity = ringOp * 0.6;
    this.ringB.visible = ringOp > 0.001;
    this.ringA.rotation.z = t * 0.045;
    this.ringB.rotation.z = -t * 0.03;

    this.starUniforms.uTime.value = t;
    this.stars.rotation.y = t * 0.004;

    // a pulse lands as a short optical kick: bloom flash + camera recoil
    this.impulse *= Math.exp(-dt * 5.5);
    if (!this.reduced && this.impulse > 0.001) {
      const kick = this.impulse * 0.05;
      this.camera.position.x += (Math.random() - 0.5) * kick;
      this.camera.position.y += (Math.random() - 0.5) * kick;
      this.camera.updateMatrixWorld();
    }
    this.bloom.strength = 0.68 + w[0] * 0.08 + w[4] * 0.16 + this.impulse * 0.45;

    this.gradeUniforms.uTime.value = t;
    this.gradeUniforms.uAberration.value = 0.5 + w[1] * 0.12 + w[4] * 1.25 + this.force * 0.3;
  }

  render() {
    this.composer.render();
  }
}
