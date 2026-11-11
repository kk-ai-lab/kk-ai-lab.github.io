/**
 * KK.AI LAB — score.
 *
 * Reference: Hans Zimmer's Interstellar. What defines that sound is not a
 * texture, it is a set of structural decisions:
 *
 *   · a pipe organ, sustained, in a cathedral — not a synth pad
 *   · a pedal tone that never moves while the harmony above it shifts
 *   · a clock. A literal ticking clock, quiet enough to be subliminal.
 *   · two chords, not five. Harmony moves once or twice per piece.
 *   · enormous reverb (8 s). Distance is the instrument.
 *   · long swells measured in tens of seconds, not beats.
 *
 * Everything is synthesised; there are no audio files.
 */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * A pedal D sounds through the whole piece. Above it the harmony moves once
 * into Bb major and back — the i → VI move that carries the film. The last
 * state opens into Bbmaj7 over the pedal and never resolves.
 *
 *   state          upper voices              resulting chord
 *   0 ORIGIN       D3  F3  A3                Dm
 *   1 CONNECTION   D3  F3  A3  E4            Dm(add9)
 *   2 EMERGENCE    Bb2 D3  F3                Bb/D
 *   3 EXPERIMENT   D3  Eb3 F3  A3            Dm(b9)  — the only dissonance
 *   4 INFINITY     Bb2 D3  F3  A3            Bbmaj7/D
 */
export const VOICINGS = [
  { pedal: 38, notes: [50, 53, 57] },
  { pedal: 38, notes: [50, 53, 57, 64] },
  { pedal: 38, notes: [46, 50, 53] },
  { pedal: 38, notes: [50, 51, 53, 57] },
  { pedal: 38, notes: [46, 50, 53, 57] },
];

/* the arpeggio figure — three notes rising, one falling. Cornfield Chase. */
const ARP = [62, 65, 69, 65];

export class Drone {
  constructor(opts) {
    const o = opts && typeof opts.createGain === 'function' ? { context: opts } : opts || {};
    this.injected = o.context || null;
    this.ctx = null;
    this.on = false;
    this.depth = 0;
    this.vel = 0;
    this.stateIndex = 0;
    this.primed = false;
    this.nextTick = 0;
    this.nextArp = 0;
    this.tickGain = 0;
    this._tickCount = 0;
    this._arpStep = 0;
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

  /**
   * Drawbar-style pipe organ: integer harmonics at falling weights. This is
   * the difference between "a synth playing a chord" and "a room full of air
   * columns" — a sawtooth has every harmonic at equal strength, an organ has
   * a specific, uneven registration.
   */
  _organWave(ctx) {
    const real = new Float32Array(10);
    const imag = new Float32Array(10);
    const reg = [0, 1, 0.66, 0.28, 0.42, 0.1, 0.2, 0.07, 0.17, 0.05];
    for (let i = 1; i < reg.length; i++) imag[i] = reg[i];
    return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  }

  _white(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  /** cathedral tail — long, dark, decorrelated */
  _impulse(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += (Math.random() * 2 - 1 - lp) * 0.2;
        /* slow build over the first ~120 ms — a hall, not a plate */
        const build = Math.min(1, t * 22);
        d[i] = lp * Math.pow(1 - t, 2.3) * build;
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

    const bus = ctx.createGain();
    bus.gain.value = 0.9;

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 6200;
    tone.Q.value = 0.4;

    const master = ctx.createGain();
    master.gain.value = 0.0001;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 26;
    hp.Q.value = 0.6;

    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -22;
    glue.knee.value = 26;
    glue.ratio.value = 2.6;
    glue.attack.value = 0.02;
    glue.release.value = 0.5;

    const out = ctx.createGain();
    out.gain.value = 0.92;

    bus.connect(tone).connect(master).connect(hp).connect(glue).connect(out).connect(ctx.destination);

    /* 8.4 s hall. This is most of the sound. */
    const verb = ctx.createConvolver();
    verb.buffer = this._impulse(ctx, 8.4);
    const verbOut = ctx.createGain();
    verbOut.gain.value = 0.62;
    verb.connect(verbOut).connect(tone);

    const dry = ctx.createGain();
    dry.gain.value = 1;
    dry.connect(bus);

    const fxSend = ctx.createGain();
    fxSend.gain.value = 0.7;
    fxSend.connect(verb);

    /* a very slow swell — the piece breathes over about a minute */
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.016;
    const swellG = ctx.createGain();
    swellG.gain.value = 0.11;
    swell.connect(swellG).connect(bus.gain);
    swell.start();

    this.bus = bus;
    this.tone = tone;
    this.master = master;
    this.dry = dry;
    this.verb = verb;
    this.fxSend = fxSend;

    /* ── ORGAN ──
       Two detuned instances per note (organs carry a celeste stop for
       exactly this reason), panned apart, behind a fixed low-pass so the
       mixtures never turn into a buzz. */
    const wave = this._organWave(ctx);

    const organBus = ctx.createGain();
    organBus.gain.value = 0.28;

    const organLp = ctx.createBiquadFilter();
    organLp.type = 'lowpass';
    organLp.frequency.value = 1900;
    organLp.Q.value = 0.6;

    organBus.connect(organLp).connect(dry);
    const organSend = ctx.createGain();
    organSend.gain.value = 0.55;
    organLp.connect(organSend).connect(verb);

    this.organ = [];
    for (let n = 0; n < 4; n++) {
      for (let d = 0; d < 2; d++) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(wave);
        o.frequency.value = mtof(VOICINGS[0].notes[Math.min(n, VOICINGS[0].notes.length - 1)]);
        o.detune.value = d ? 4.5 : -4.5;

        const g = ctx.createGain();
        g.gain.value = 0;

        const p = this._pan(ctx, d ? 0.42 : -0.42);
        o.connect(g).connect(p).connect(organBus);
        o.start();
        this.organ.push({ o, g, n });
      }
    }
    this.organBus = organBus;
    this.organLp = organLp;

    /* ── PEDAL ── constant D, two octaves down. Felt, not heard. */
    const pedalBus = ctx.createGain();
    pedalBus.gain.value = 0.042;
    pedalBus.connect(dry);
    const pedalSend = ctx.createGain();
    pedalSend.gain.value = 0.15;
    pedalBus.connect(pedalSend).connect(verb);

    this.pedal = [];
    [0, -12].forEach((off, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = mtof(VOICINGS[0].pedal + off);
      o.__oct = off;
      const g = ctx.createGain();
      g.gain.value = i ? 0.32 : 1;
      const breathe = ctx.createOscillator();
      breathe.frequency.value = 0.021 + i * 0.008;
      const bg = ctx.createGain();
      bg.gain.value = i ? 0.12 : 0.22;
      breathe.connect(bg).connect(g.gain);
      breathe.start();
      o.connect(g).connect(pedalBus);
      o.start();
      this.pedal.push({ o, g });
    });

    /* ── AIR ── one narrow band, very far away */
    const air = ctx.createBufferSource();
    air.buffer = this._white(ctx, 6);
    air.loop = true;
    const airBP = ctx.createBiquadFilter();
    airBP.type = 'bandpass';
    airBP.frequency.value = 1800;
    airBP.Q.value = 2.4;
    const airG = ctx.createGain();
    airG.gain.value = 0.01;
    air.connect(airBP).connect(airG).connect(dry);
    airG.connect(fxSend);
    air.start();

    this.airBP = airBP;
    this.airG = airG;
    this.noiseBuffer = air.buffer;

    const now = ctx.currentTime;
    this.nextTick = now + 1.0;
    this.nextArp = now + 2.2;
    this._applyVoicing(0, now, true);
  }

  /* ── events ───────────────────────────────────────────────── */

  /** a clock. wood, close, quiet. not a beep. */
  _tick(t) {
    const ctx = this.ctx;
    const gain = this.tickGain;
    if (gain < 0.02) {
      this._tickCount++;
      return;
    }
    const high = this._tickCount++ % 2 === 0;
    const f = high ? 318 : 286;

    /* body: a damped resonance around 300 Hz */
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.86, t + 0.05);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05 * gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);

    const p = this._pan(ctx, high ? -0.22 : 0.22);
    o.connect(g).connect(p).connect(this.dry);
    p.connect(this.fxSend);
    o.start(t);
    o.stop(t + 0.13);

    /* transient: 4 ms of filtered noise gives it an edge */
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.016 * gain, t + 0.002);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.02);
    n.connect(lp).connect(ng).connect(p);
    n.start(t, Math.random() * 3);
    n.stop(t + 0.03);
  }

  /** the arpeggio — a human figure against the machine */
  _arp(t) {
    const ctx = this.ctx;
    const note = ARP[this._arpStep++ % ARP.length];
    const f = mtof(note);

    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.value = f;

    /* a touch of FM gives it the struck, wooden quality of a mallet */
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * 2;
    const modG = ctx.createGain();
    modG.gain.setValueAtTime(f * 0.5, t);
    modG.gain.exponentialRampToValueAtTime(f * 0.004, t + 0.5);
    mod.connect(modG).connect(car.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);

    const p = this._pan(ctx, (this._arpStep % 2 ? 1 : -1) * 0.3);
    car.connect(g).connect(p).connect(this.dry);
    const send = ctx.createGain();
    send.gain.value = 1.1;
    p.connect(send).connect(this.verb);

    car.start(t);
    car.stop(t + 2.7);
    mod.start(t);
    mod.stop(t + 2.7);
  }

  /**
   * The rise. A band of noise climbing for three seconds under a swelling
   * low sine — the docking-sequence gesture. Fires only on state change, so
   * it punctuates rather than loops.
   */
  _riser(t) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(180, t);
    bp.frequency.exponentialRampToValueAtTime(3400, t + 3.0);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 2.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.1);

    src.connect(bp).connect(g).connect(this.dry);
    g.connect(this.fxSend);
    src.start(t);
    src.stop(t + 3.2);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(mtof(VOICINGS[this.stateIndex].pedal) * 0.5, t);
    o.frequency.exponentialRampToValueAtTime(mtof(VOICINGS[this.stateIndex].pedal), t + 3.0);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.055, t + 2.5);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(og).connect(this.dry);
    o.start(t);
    o.stop(t + 3.3);
  }

  /* ── scheduler ────────────────────────────────────────────── */

  _schedule() {
    if (!this.ctx || !this.on) return;
    const now = this.ctx.currentTime;
    const horizon = now + 0.6;

    if (this.nextTick < now) this.nextTick = now + 0.2;
    while (this.nextTick < horizon) {
      this._tick(this.nextTick);
      this.nextTick += this.tickPeriod * (0.985 + Math.random() * 0.03);
    }

    if (this.nextArp < now) this.nextArp = now + 1.4;
    while (this.nextArp < horizon) {
      this._arp(this.nextArp);
      this.nextArp += 1.46 + Math.random() * 0.14;
    }
  }

  /* ── voicing ──────────────────────────────────────────────── */

  _applyVoicing(idx, now, immediate) {
    const v = VOICINGS[idx];
    const tc = immediate ? 0.01 : 1.6;

    this.organ.forEach(({ o, g, n }) => {
      const note = v.notes[Math.min(n, v.notes.length - 1)];
      o.frequency.setTargetAtTime(mtof(note), now, immediate ? 0.01 : 1.1);
      /* upper voices thin out; a real organ is bottom-heavy */
      const level = (0.2 / (1 + n * 0.55)) * (n < v.notes.length ? 1 : 0);
      g.gain.setTargetAtTime(level, now, tc);
    });

    this.pedal.forEach(({ o }) => {
      o.frequency.setTargetAtTime(mtof(v.pedal + (o.__oct || 0)), now, immediate ? 0.01 : 1.4);
    });

    this.organLp.frequency.setTargetAtTime(1350 + this.depth * 800, now, 1.6);
  }

  /* ── public ───────────────────────────────────────────────── */

  get tickPeriod() {
    /* the clock runs faster under tension — state 3 is the perturbation */
    const base = 1.12;
    return this.stateIndex === 3 ? base * 0.68 : this.stateIndex === 4 ? base * 0.9 : base;
  }

  async toggle() {
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended' && this.ctx.resume) await this.ctx.resume();

    this.on = !this.on;
    const now = this.ctx.currentTime;
    const g = this.master.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, g.value), now);

    if (this.on) {
      /* a very long bloom. the piece should arrive without being noticed. */
      g.linearRampToValueAtTime(0.44, now + 4.2);
      if (this.nextTick < now) this.nextTick = now + 1.2;
      if (this.nextArp < now) this.nextArp = now + 2.6;
      if (!this._timer) this._timer = setInterval(() => this._schedule(), 220);
    } else {
      g.exponentialRampToValueAtTime(0.0001, now + 1.6);
    }
    return this.on;
  }

  /** harmony + clock speed follow the five states */
  setState(s) {
    this.depth = clamp(s / 4, 0, 1);
    /* the clock fades in once you are inside the system. at ORIGIN there is
       no clock at all — the opening of the piece is empty. */
    this.tickGain = this.depth < 0.12 ? 0 : Math.min(1, (this.depth - 0.1) / 0.5);

    if (!this.ctx) return;

    const idx = clamp(Math.round(s), 0, 4);
    if (idx === this.stateIndex && this.primed) return;

    const now = this.ctx.currentTime;
    this.stateIndex = idx;
    this._applyVoicing(idx, now, false);

    if (this.primed && this.on) this._riser(now + 0.02);
    this.primed = true;
  }

  setVelocity(v) {
    if (!this.ctx || !this.airG) return;
    if (Math.abs(v - this.vel) < 0.02) return;
    this.vel = v;
    const now = this.ctx.currentTime;
    this.airG.gain.setTargetAtTime(0.008 + v * 0.016, now, 0.5);
    this.airBP.frequency.setTargetAtTime(1800 + v * 1100, now, 0.6);
  }

  /** a pulse leaving the field — a deep swell, not a beep */
  burst(pan = 0) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (now - this._lastBurst < 0.09) return;
    this._lastBurst = now;

    const p = this._pan(ctx, clamp(pan, -1, 1) * 0.6);
    const rootHz = mtof(VOICINGS[this.stateIndex].pedal);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(rootHz * 1.5, now);
    o.frequency.exponentialRampToValueAtTime(rootHz * 0.5, now + 0.9);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.075, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
    o.connect(g).connect(p);
    o.start(now);
    o.stop(now + 1.5);

    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(2600, now);
    bp.frequency.exponentialRampToValueAtTime(560, now + 0.55);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, now);
    ng.gain.exponentialRampToValueAtTime(0.03, now + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    n.connect(bp).connect(ng).connect(p);
    n.start(now, Math.random() * 2);
    n.stop(now + 0.75);

    p.connect(this.dry);
    p.connect(this.fxSend);
  }
}
