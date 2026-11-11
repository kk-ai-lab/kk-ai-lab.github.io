/**
 * KK.AI LAB — instrument.
 *
 * Nothing is sampled; the whole bed is synthesised after the first gesture.
 *
 * This is deliberately *not* a soundtrack. It is the sound of a machine
 * running in the next room: a sub octave you feel more than hear, an additive
 * chord that retunes itself as you move through the five states, one narrow
 * band of air (never broadband hiss), an irregular telemetry tick, and the
 * occasional FM ping decaying into a dark room. A compressor sits across the
 * output so repeated pulses can never stack into a wall of noise.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * One harmonic set per state. Index 0 is the sub foundation, the rest stack
 * upward. The sets are chosen so that scrolling reads as slow modulation
 * rather than a chord change: open fifths → stacked fourths → minor colour →
 * chromatic tension → back down to the widest, lowest fifths.
 */
export const CHORDS = [
  /* ORIGIN          */ [26, 38, 45, 50, 57, 62, 69, 74], // D1 D2 A2 D3 A3 D4 A4 D5
  /* CONNECTION      */ [26, 38, 45, 52, 57, 64, 71, 76], // … E3 A3 E4 B4 E5
  /* EMERGENCE       */ [26, 38, 45, 53, 60, 65, 72, 77], // … F3 C4 F4 C5 F5
  /* EXPERIMENTATION */ [26, 37, 44, 51, 58, 63, 70, 75], // … C#2 G#2 D#3 A#3 D#4
  /* INFINITY        */ [24, 36, 43, 48, 55, 60, 67, 72], // C1 C2 G2 C3 G3 C4 G4 C5
];

const VOICE_GAIN = [0.1, 0.074, 0.055, 0.044, 0.031, 0.023, 0.017, 0.012];
const VOICE_DETUNE = [-4, 3, -2, 5, -6, 2, -3, 4]; // cents — width, not beating
const VOICE_PAN = [-0.26, 0.22, -0.54, 0.5, -0.76, 0.7, -0.34, 0.36];
const PING_NOTES = [587.33, 783.99, 880.0, 1174.66, 1396.91];

export class Drone {
  constructor(injectedContext) {
    this.ctx = null;
    this.injected = injectedContext || null;
    this.on = false;
    this.depth = 0;
    this.vel = 0;
    this.chordIndex = 0;
    this.primed = false;
    this.tickCount = 0;
    this.tickPeriod = 1.5;
    this.nextTick = 0;
    this.nextPing = 0;
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

  _noiseBuffer(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      // brown-ish: integration rolls off the top so noise never reads as hiss
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.08) * 0.995;
        d[i] = last;
      }
    }
    return buf;
  }

  /** dark, decorrelated room tail */
  _impulse(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += ((Math.random() * 2 - 1) - lp) * 0.24; // one-pole LP → dark tail
        d[i] = lp * Math.pow(1 - t, 3.1);
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

    /* master: everything is summed before the fade, so mute is absolute */
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200; // kills digital fizz above the useful band
    tone.Q.value = 0.4;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    this.master = master;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 27; // no sub-rumble turned into speaker excursion
    hp.Q.value = 0.6;

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -26;
    glue.knee.value = 26;
    glue.ratio.value = 3.2;
    glue.attack.value = 0.012;
    glue.release.value = 0.34;

    const out = ctx.createGain();
    out.gain.value = 0.9;

    tone.connect(master).connect(hp).connect(glue).connect(out).connect(ctx.destination);

    /* dark room, fed post-filter so the tail stays soft */
    const verb = ctx.createConvolver();
    verb.buffer = this._impulse(ctx, 4.6);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.46;
    verb.connect(verbOut).connect(tone);

    const dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(tone);

    const fxSend = ctx.createGain();
    fxSend.gain.value = 0.5;
    fxSend.connect(verb);

    this.tone = tone;
    this.dry = dry;
    this.verb = verb;
    this.fxSend = fxSend;

    /* ── additive chord ──
       eight voices retuned across the states; each breathes on its own very
       slow LFO so the harmony never sits still and never phase-locks */
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 760;
    padFilter.Q.value = 0.7;
    padFilter.connect(dry);

    const padSend = ctx.createGain();
    padSend.gain.value = 0.32;
    padFilter.connect(padSend).connect(verb);
    this.padFilter = padFilter;

    this.voices = [];
    for (let i = 0; i < 8; i++) {
      const o = ctx.createOscillator();
      o.type = i >= 5 ? 'sine' : i >= 1 ? 'triangle' : 'sine';
      o.frequency.value = mtof(CHORDS[0][i]);
      o.detune.value = VOICE_DETUNE[i];

      const g = ctx.createGain();
      const base = VOICE_GAIN[i];
      g.gain.value = base * 0.72;

      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.019 + i * 0.0113;
      const lfoG = ctx.createGain();
      lfoG.gain.value = base * 0.28;
      lfo.connect(lfoG).connect(g.gain);
      lfo.start();

      const pan = this._pan(ctx, VOICE_PAN[i]);
      o.connect(g).connect(pan).connect(padFilter);
      o.start();

      this.voices.push({ o, g, lfoG });
    }

    /* ── machine air ── one narrow band, swept slowly; deliberately quiet */
    const air = ctx.createBufferSource();
    air.buffer = this._noiseBuffer(ctx, 5);
    air.loop = true;

    const airBP = ctx.createBiquadFilter();
    airBP.type = 'bandpass';
    airBP.frequency.value = 1340;
    airBP.Q.value = 9;

    const airG = ctx.createGain();
    airG.gain.value = 0.022;

    air.connect(airBP).connect(airG).connect(dry);

    const air2G = ctx.createGain();
    air2G.gain.value = 0.007;
    const airBP2 = ctx.createBiquadFilter();
    airBP2.type = 'bandpass';
    airBP2.frequency.value = 3150;
    airBP2.Q.value = 12;
    air.connect(airBP2).connect(air2G).connect(dry);

    const airLfo = ctx.createOscillator();
    airLfo.type = 'sine';
    airLfo.frequency.value = 0.017;
    const airLfoG = ctx.createGain();
    airLfoG.gain.value = 110;
    airLfo.connect(airLfoG).connect(airBP.frequency);
    airLfo.start();
    air.start();

    this.airBP = airBP;
    this.airG = airG;
    this.noiseBuffer = air.buffer;

    this.nextTick = ctx.currentTime + 0.6;
    this.nextPing = ctx.currentTime + 5;
  }

  /* ── events ───────────────────────────────────────────────── */

  /** telemetry tick — the machine counting */
  _tick(t) {
    const ctx = this.ctx;
    const i = this.tickCount++;
    const f = 1560 + Math.random() * 280;

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.72, t + 0.06);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.022, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);

    const p = this._pan(ctx, (i % 2 ? 1 : -1) * (0.16 + Math.random() * 0.22));
    o.connect(g).connect(p).connect(this.dry);
    p.connect(this.fxSend);
    o.start(t);
    o.stop(t + 0.12);

    /* every fourth tick: a soft reactor thump underneath */
    if (i % 4 === 0) {
      const s = ctx.createOscillator();
      s.type = 'sine';
      s.frequency.setValueAtTime(76, t);
      s.frequency.exponentialRampToValueAtTime(47, t + 0.4);
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(0.0001, t);
      sg.gain.exponentialRampToValueAtTime(0.042, t + 0.014);
      sg.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      s.connect(sg).connect(this._pan(ctx, 0)).connect(this.dry);
      s.start(t);
      s.stop(t + 0.9);
    }

    /* every eighth: a lower frame tick, half an octave down */
    if (i % 8 === 4) {
      const l = ctx.createOscillator();
      l.type = 'sine';
      l.frequency.setValueAtTime(784, t);
      const lg = ctx.createGain();
      lg.gain.setValueAtTime(0.0001, t);
      lg.gain.exponentialRampToValueAtTime(0.017, t + 0.004);
      lg.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      l.connect(lg).connect(this._pan(ctx, 0.1)).connect(this.dry);
      l.start(t);
      l.stop(t + 0.2);
    }
  }

  /** FM instrument ping — inharmonic, glassy, long dark tail */
  _ping(t) {
    const ctx = this.ctx;
    const base = PING_NOTES[(Math.random() * PING_NOTES.length) | 0];
    const f = Math.random() < 0.24 ? base * 0.5 : base;
    const ratio = Math.random() < 0.5 ? 3.5 : 2.76;

    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;

    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * ratio;

    const modG = ctx.createGain();
    modG.gain.setValueAtTime(f * 1.15, t);
    modG.gain.exponentialRampToValueAtTime(f * 0.008, t + 1.7);
    mod.connect(modG).connect(car.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);

    const p = this._pan(ctx, Math.random() * 1.5 - 0.75);
    car.connect(g).connect(p).connect(this.dry);
    p.connect(this.fxSend);

    car.start(t);
    car.stop(t + 2.3);
    mod.start(t);
    mod.stop(t + 2.3);
  }

  /** state change — a narrow band sweeping up, like a system re-indexing */
  _scan(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 14;
    bp.frequency.setValueAtTime(420, t);
    bp.frequency.exponentialRampToValueAtTime(3400, t + 0.28);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.032, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);

    src.connect(bp).connect(g).connect(this.dry);
    g.connect(this.fxSend);
    src.start(t);
    src.stop(t + 0.38);
  }

  /* ── scheduler ────────────────────────────────────────────── */

  _schedule() {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    const horizon = now + 0.45;

    if (this.nextTick < now) this.nextTick = now + 0.05;
    while (this.nextTick < horizon) {
      this._tick(this.nextTick);
      this.nextTick += this.tickPeriod * (0.93 + Math.random() * 0.14);
    }

    if (this.nextPing < now) this.nextPing = now + 3;
    while (this.nextPing < horizon) {
      this._ping(this.nextPing);
      this.nextPing += 9 + Math.random() * 10;
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
      // linear bloom — an exponential ramp from silence is inaudible for a
      // second and then arrives all at once
      g.linearRampToValueAtTime(0.42, now + 2.4);
      if (this.nextTick < now) this.nextTick = now + 0.7;
      if (this.nextPing < now) this.nextPing = now + 6;
      if (!this._timer) this._timer = setInterval(() => this._schedule(), 180);
    } else {
      g.exponentialRampToValueAtTime(0.0001, now + 1.0);
    }
    return this.on;
  }

  /** chord + timbre follow the five states */
  setState(s) {
    this.depth = clamp(s / 4, 0, 1);
    this.tickPeriod = 1.5 - this.depth * 0.34;
    if (!this.ctx) return;

    const idx = clamp(Math.round(s), 0, 4);
    if (idx === this.chordIndex && this.primed) return;
    this.chordIndex = idx;

    const now = this.ctx.currentTime;
    const notes = CHORDS[idx];
    const lift = 0.86 + this.depth * 0.26;

    this.voices.forEach((v, k) => {
      v.o.frequency.setTargetAtTime(mtof(notes[k]), now, 1.15);
      v.g.gain.setTargetAtTime(VOICE_GAIN[k] * 0.72 * lift, now, 1.35);
      v.lfoG.gain.setTargetAtTime(VOICE_GAIN[k] * 0.28 * lift, now, 1.35);
    });

    this.padFilter.frequency.setTargetAtTime(700 + this.depth * 560, now, 1.6);
    this.tone.frequency.setTargetAtTime(4600 + this.depth * 2400, now, 2.0);

    if (this.primed && this.on) this._scan(now + 0.02);
    this.primed = true;
  }

  /** fast orbiting opens the air band — motion you can hear, not noise */
  setVelocity(v) {
    if (!this.ctx || !this.airG) return;
    if (Math.abs(v - this.vel) < 0.02) return;
    this.vel = v;
    const now = this.ctx.currentTime;
    this.airG.gain.setTargetAtTime(0.02 + v * 0.026, now, 0.4);
    this.airBP.frequency.setTargetAtTime(1300 + v * 820, now, 0.5);
  }

  /** a pulse leaving the field — routed through master, never around it */
  burst(pan = 0) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this._lastBurst < 0.06) return;
    this._lastBurst = now;

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1320, now);
    o.frequency.exponentialRampToValueAtTime(330, now + 0.15);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.075, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

    const p = this._pan(ctx, clamp(pan, -1, 1) * 0.7);
    o.connect(g).connect(p).connect(this.dry);
    p.connect(this.fxSend);
    o.start(now);
    o.stop(now + 0.26);

    /* 20 ms transient so the pulse has an edge rather than a whoosh */
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.02, now + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    n.connect(hp).connect(ng).connect(p);
    n.start(now, Math.random() * 2);
    n.stop(now + 0.05);
  }
}
