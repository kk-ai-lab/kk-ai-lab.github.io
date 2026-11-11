/**
 * KK.AI LAB — instrument.
 *
 * Everything is synthesised after the first gesture; there are no audio files.
 *
 * Design notes, for whoever touches this next:
 *
 * 1. The first version put almost all of its energy below 300 Hz. On a laptop
 *    speaker that range simply does not reproduce, so the bed disappeared and
 *    only the tick survived — which reads as "a hum with a beep".
 *    The pad therefore sits in the D3–A4 register, where its harmonics land in
 *    the 300–1200 Hz band that every speaker can render.
 *
 * 2. A fixed-interval tick is a metronome. Metronomes are annoying. Data now
 *    arrives in irregular *packets* — a few chirps clustered together, then
 *    silence — which reads as transmission rather than a clock.
 *
 * 3. Nothing holds still. Every layer has its own slow drift: detune on the
 *    saws, formants on the breath, filter cutoff on the pad. The bed is a
 *    slowly reconfiguring machine, not a chord that is being held down.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

/* ── harmonic material ──────────────────────────────────────────
   Three chord tones per state, deliberately in the mid register.
   Scrolling reads as modulation: open fifths → added sixth → minor
   colour → chromatic tension → the widest, lowest fifths.        */
export const TONES = [
  [50, 57, 62], // ORIGIN          D3 A3 D4
  [50, 57, 64], // CONNECTION      D3 A3 E4
  [50, 53, 60], // EMERGENCE       D3 F3 C4
  [50, 56, 63], // EXPERIMENTATION D3 G#3 D#4
  [48, 55, 60], // INFINITY        C3 G3 C4
];

/* Formants are integer multiples of the chord root. Inharmonic resonances
   are the usual reason a pad feels "wrong" without anyone being able to name
   it — tuning them to the harmony makes the noise read as a resonant body. */
const FORMANT_MULT = [2, 3, 4, 6];
const FORMANT_GAIN = [0.5, 0.34, 0.22, 0.12];

const DENSITY = {
  sparse: { pad: 0.8, breath: 0.75, air: 0.7, packet: [11, 20], ping: [16, 30] },
  studio: { pad: 1.0, breath: 1.0, air: 1.0, packet: [7, 14], ping: [12, 22] },
  dense: { pad: 1.1, breath: 1.25, air: 1.3, packet: [3.5, 8], ping: [7, 13] },
};

export class Drone {
  constructor(opts) {
    const o = opts && typeof opts.createGain === 'function' ? { context: opts } : opts || {};
    this.injected = o.context || null;
    this.density = DENSITY[o.density] ? o.density : 'studio';
    this.mix = DENSITY[this.density];

    this.ctx = null;
    this.on = false;
    this.depth = 0;
    this.vel = 0;
    this.stateIndex = 0;
    this.primed = false;
    this.nextPacket = 0;
    this.nextPing = 0;
    this.nextSub = 0;
    this._lastBurst = -1;

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx || !this.on) return;
        if (document.hidden) this.ctx.suspend();
        else this.ctx.resume();
      });
    }
  }

  /* ── material ─────────────────────────────────────────────── */

  _white(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /** dark, decorrelated tail */
  _impulse(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += (Math.random() * 2 - 1 - lp) * 0.26;
        d[i] = lp * Math.pow(1 - t, 2.8);
      }
    }
    return buf;
  }

  _pan(ctx, v) {
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = clamp(v, -1, 1);
      return p;
    }
    const g = ctx.createGain();
    g.gain.value = 1;
    return g;
  }

  /* ── graph ────────────────────────────────────────────────── */

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = this.injected || new Ctx();
    this.ctx = ctx;

    /* master: everything sums before the fade, so mute is absolute */
    const bus = ctx.createGain();
    bus.gain.value = 0.86;

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 7200;
    tone.Q.value = 0.5;

    const master = ctx.createGain();
    master.gain.value = 0.0001;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 24;
    hp.Q.value = 0.6;

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -24;
    glue.knee.value = 30;
    glue.ratio.value = 3;
    glue.attack.value = 0.015;
    glue.release.value = 0.38;

    const out = ctx.createGain();
    out.gain.value = 0.9;

    bus.connect(tone).connect(master).connect(hp).connect(glue).connect(out).connect(ctx.destination);

    /* very slow swell so the whole bed breathes over ~50 s */
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.019;
    const swellG = ctx.createGain();
    swellG.gain.value = 0.13;
    swell.connect(swellG).connect(bus.gain);
    swell.start();

    /* room */
    const verb = ctx.createConvolver();
    verb.buffer = this._impulse(ctx, 4.2);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.5;
    verb.connect(verbOut).connect(tone);

    const dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(bus);

    const fxSend = ctx.createGain();
    fxSend.gain.value = 0.55;
    fxSend.connect(verb);

    this.bus = bus;
    this.tone = tone;
    this.master = master;
    this.dry = dry;
    this.verb = verb;
    this.fxSend = fxSend;

    /* ── DRIFT — nine detuned saws, two poles of filtration ──
       A saw through a resonant low-pass is the cheapest way to sound
       expensive: the harmonics give the ear a pitch to hold on to, the
       resonance gives it a vowel. Three detuned copies per note produce
       the slow chorusing drift that a single oscillator can't. */
    const sawBus = ctx.createGain();
    sawBus.gain.value = 0.115 * this.mix.pad; // pre-compensated for the 5 dB sat gain

    /* tape-style saturation: a tanh curve rounds the saws and adds the
       harmonics that make an analog stack sound like it has mass */
    const sat = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      curve[i] = Math.tanh(x * 1.7) / Math.tanh(1.7);
    }
    sat.curve = curve;
    sat.oversample = '2x';

    const lp1 = ctx.createBiquadFilter();
    lp1.type = 'lowpass';
    lp1.frequency.value = 640;
    lp1.Q.value = 3.4;

    const lp2 = ctx.createBiquadFilter();
    lp2.type = 'lowpass';
    lp2.frequency.value = 2700;
    lp2.Q.value = 0.8;

    sawBus.connect(sat).connect(lp1).connect(lp2).connect(dry);
    const sawSend = ctx.createGain();
    sawSend.gain.value = 0.18;
    lp2.connect(sawSend).connect(verb);

    const cutLfo = ctx.createOscillator();
    cutLfo.frequency.value = 0.033;
    const cutLfoG = ctx.createGain();
    cutLfoG.gain.value = 165;
    cutLfo.connect(cutLfoG).connect(lp1.frequency);
    cutLfo.start();

    const cutLfo2 = ctx.createOscillator();
    cutLfo2.frequency.value = 0.0092;
    const cutLfo2G = ctx.createGain();
    cutLfo2G.gain.value = 90;
    cutLfo2.connect(cutLfo2G).connect(lp1.frequency);
    cutLfo2.start();

    const DETUNE = [-7, 0, 6];
    this.saws = [];
    for (let n = 0; n < 3; n++) {
      for (let d = 0; d < 3; d++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(TONES[0][n]);
        o.detune.value = DETUNE[d] + n * 1.5;

        const g = ctx.createGain();
        g.gain.value = 0.34;

        /* each saw drifts on its own phase, so nothing ever locks */
        const dl = ctx.createOscillator();
        dl.type = 'sine';
        dl.frequency.value = 0.011 + Math.random() * 0.026;
        const dg = ctx.createGain();
        dg.gain.value = 3.5 + Math.random() * 2;
        dl.connect(dg).connect(o.detune);
        dl.start();

        const p = this._pan(ctx, (n - 1) * 0.35 + (d - 1) * 0.28);
        o.connect(g).connect(p).connect(sawBus);
        o.start();
        this.saws.push({ o, n });
      }
    }
    this.lp1 = lp1;

    /* ── BREATH — noise through a formant bank ──
       Four high-Q resonances trace a vowel. Sweeping them slowly turns
       filtered noise into something closer to a voice than to wind. */
    const src = ctx.createBufferSource();
    src.buffer = this._white(ctx, 5);
    src.loop = true;

    const breathBus = ctx.createGain();
    breathBus.gain.value = 0.075 * this.mix.breath;
    breathBus.connect(dry);
    const breathSend = ctx.createGain();
    breathSend.gain.value = 0.5;
    breathBus.connect(breathSend).connect(verb);

    this.formants = [];
    FORMANT_MULT.forEach((mult, i) => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = mtof(TONES[0][0]) * mult;
      bp.Q.value = 11;

      const g = ctx.createGain();
      g.gain.value = FORMANT_GAIN[i];

      const fl = ctx.createOscillator();
      fl.type = 'sine';
      fl.frequency.value = 0.014 + i * 0.0073;
      const fg = ctx.createGain();
      fg.gain.value = (12 + i * 4) * 2;
      fl.connect(fg).connect(bp.frequency);
      fl.start();

      src.connect(bp).connect(g).connect(breathBus);
      this.formants.push({ bp, mult });
    });
    src.start();

    /* ── AIR — one narrow band, velocity-driven, never broadband ── */
    const airBP = ctx.createBiquadFilter();
    airBP.type = 'bandpass';
    airBP.frequency.value = 2600;
    airBP.Q.value = 7;
    const airG = ctx.createGain();
    airG.gain.value = 0.014 * this.mix.air;
    src.connect(airBP).connect(airG).connect(dry);
    this.airBP = airBP;
    this.airG = airG;

    this.noiseBuffer = src.buffer;
    this.nextPacket = ctx.currentTime + 1.2;
    this.nextPing = ctx.currentTime + 4;
    this.nextSub = ctx.currentTime + 2;
  }

  /* ── events ───────────────────────────────────────────────── */

  /** a packet of chirps — data arriving, not a clock ticking */
  _packet(t) {
    const ctx = this.ctx;
    const n = 3 + ((Math.random() * 4) | 0);
    let at = t;

    for (let i = 0; i < n; i++) {
      const f = rnd(1500, 3400);
      const o = ctx.createOscillator();
      o.type = i % 3 === 2 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f, at);
      o.frequency.exponentialRampToValueAtTime(f * rnd(0.55, 0.72), at + 0.045);

      const g = ctx.createGain();
      const amp = 0.023 * this.mix.air * (1 - i / (n + 2));
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(amp, at + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);

      const p = this._pan(ctx, i % 2 ? 0.55 : -0.55);
      o.connect(g).connect(p).connect(this.dry);
      p.connect(this.fxSend);

      o.start(at);
      o.stop(at + 0.09);
      at += rnd(0.048, 0.115);
    }
  }

  /** an irregular sub impact — weight without a beat */
  _sub(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = rnd(58, 74);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.7);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.085, t + 0.045);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);

    o.connect(g).connect(this.dry);
    o.start(t);
    o.stop(t + 2);
  }

  /** FM instrument ping — inharmonic, glassy, long tail */
  _ping(t) {
    const ctx = this.ctx;
    const notes = TONES[this.stateIndex];
    const base = mtof(notes[(Math.random() * 3) | 0] + 24);
    const ratio = Math.random() < 0.5 ? 3.5 : 2.76;

    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = base;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = base * ratio;

    const modG = ctx.createGain();
    modG.gain.setValueAtTime(base * 1.2, t);
    modG.gain.exponentialRampToValueAtTime(base * 0.006, t + 1.9);
    mod.connect(modG).connect(car.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.042 * this.mix.breath, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);

    const p = this._pan(ctx, rnd(-0.8, 0.8));
    car.connect(g).connect(p).connect(this.dry);
    p.connect(this.fxSend);

    car.start(t);
    car.stop(t + 2.7);
    mod.start(t);
    mod.stop(t + 2.7);
  }

  /** state change — a band sweeping up, like a system re-indexing */
  _scan(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 11;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(4200, t + 0.34);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);

    src.connect(bp).connect(g).connect(this.dry);
    g.connect(this.fxSend);
    src.start(t);
    src.stop(t + 0.44);
  }

  /* ── scheduler ────────────────────────────────────────────── */

  _schedule() {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    const horizon = now + 0.5;

    if (this.nextPacket < now) this.nextPacket = now + 0.4;
    while (this.nextPacket < horizon) {
      this._packet(this.nextPacket);
      this.nextPacket += rnd(this.mix.packet[0], this.mix.packet[1]);
    }

    if (this.nextPing < now) this.nextPing = now + 3;
    while (this.nextPing < horizon) {
      this._ping(this.nextPing);
      this.nextPing += rnd(this.mix.ping[0], this.mix.ping[1]);
    }

    if (this.nextSub < now) this.nextSub = now + 2;
    while (this.nextSub < horizon) {
      this._sub(this.nextSub);
      this.nextSub += rnd(3.4, 6.8);
    }
  }

  /* ── public ───────────────────────────────────────────────── */

  async toggle() {
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended' && this.ctx.resume) await this.ctx.resume();

    this.on = !this.on;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);

    if (this.on) {
      // linear bloom — an exponential ramp from silence is silent for a
      // second and then arrives all at once
      g.linearRampToValueAtTime(0.46, now + 2.4);
      if (this.nextPacket < now) this.nextPacket = now + 1.4;
      if (this.nextPing < now) this.nextPing = now + 5;
      if (this.nextSub < now) this.nextSub = now + 2.4;
      if (!this._timer) this._timer = setInterval(() => this._schedule(), 200);
    } else {
      g.exponentialRampToValueAtTime(0.0001, now + 1.1);
    }
    return this.on;
  }

  /** harmony + timbre follow the five states */
  setState(s) {
    this.depth = clamp(s / 4, 0, 1);
    if (!this.ctx) return;

    const idx = clamp(Math.round(s), 0, 4);
    if (idx === this.stateIndex && this.primed) return;

    const now = this.ctx.currentTime;
    const prev = this.stateIndex;
    this.stateIndex = idx;

    const notes = TONES[idx];
    for (const { o, n } of this.saws) {
      o.frequency.setTargetAtTime(mtof(notes[n]), now, 0.9);
    }

    const root = mtof(TONES[idx][0]);
    this.formants.forEach(({ bp, mult }) => {
      bp.frequency.setTargetAtTime(root * mult, now, 1.3);
    });

    this.lp1.frequency.setTargetAtTime(620 + this.depth * 420, now, 1.5);
    this.tone.frequency.setTargetAtTime(7000 + this.depth * 2200, now, 2.0);

    if (this.primed && this.on) this._scan(now + 0.02);
    this.primed = true;
  }

  /** fast orbiting opens the air band — motion you can hear, not noise */
  setVelocity(v) {
    if (!this.ctx || !this.airG) return;
    if (Math.abs(v - this.vel) < 0.02) return;
    this.vel = v;
    const now = this.ctx.currentTime;
    this.airG.gain.setTargetAtTime((0.012 + v * 0.02) * this.mix.air, now, 0.4);
    this.airBP.frequency.setTargetAtTime(2600 + v * 1400, now, 0.5);
  }

  /** a pulse leaving the field — impact + breath, never a beep */
  burst(pan = 0) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this._lastBurst < 0.06) return;
    this._lastBurst = now;

    const p = this._pan(ctx, clamp(pan, -1, 1) * 0.65);

    /* body: a low sine collapsing fast */
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(220, now);
    o.frequency.exponentialRampToValueAtTime(48, now + 0.28);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.085, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    o.connect(g).connect(p);
    o.start(now);
    o.stop(now + 0.6);

    /* edge: a narrow band collapsing downward — air being displaced */
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 4;
    bp.frequency.setValueAtTime(3800, now);
    bp.frequency.exponentialRampToValueAtTime(700, now + 0.3);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.05, now + 0.012);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
    n.connect(bp).connect(ng).connect(p);
    n.start(now, Math.random() * 2);
    n.stop(now + 0.36);

    p.connect(this.dry);
    p.connect(this.fxSend);
  }
}
