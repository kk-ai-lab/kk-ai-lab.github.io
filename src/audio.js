/**
 * Generative ambient bed — no audio assets, everything synthesised.
 * Off by default; all nodes are created on the first user gesture.
 */
export class Drone {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.depth = 0;
  }

  _noiseBuffer(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  _impulse(ctx, seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.6);
      }
    }
    return buf;
  }

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);
    this.master = master;

    const verb = ctx.createConvolver();
    verb.buffer = this._impulse(ctx, 3.4);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.55;
    verb.connect(verbGain).connect(master);

    // ── low pad
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 340;
    padFilter.Q.value = 0.8;
    padFilter.connect(master);
    padFilter.connect(verb);
    this.padFilter = padFilter;

    [55, 55.6, 82.41, 110.2].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = i < 2 ? 'sine' : 'triangle';
      o.frequency.value = f;
      o.detune.value = (i - 1.5) * 6;
      const g = ctx.createGain();
      g.gain.value = i < 2 ? 0.3 : 0.12;
      o.connect(g).connect(padFilter);
      o.start();
    });

    // slow filter drift
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.045;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140;
    lfo.connect(lfoGain).connect(padFilter.frequency);
    lfo.start();

    // ── high shimmer
    const shimmer = ctx.createGain();
    shimmer.gain.value = 0.012;
    shimmer.connect(verb);
    shimmer.connect(master);
    [659.25, 987.77].forEach((f) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      const trem = ctx.createOscillator();
      trem.frequency.value = 0.07 + Math.random() * 0.06;
      const tremG = ctx.createGain();
      tremG.gain.value = 0.45;
      trem.connect(tremG).connect(g.gain);
      trem.start();
      o.connect(g).connect(shimmer);
      o.start();
    });

    // ── cosmic wind
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(ctx, 4);
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 480;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.value = 0.05;
    noise.connect(bp).connect(ng).connect(master);
    ng.connect(verb);
    noise.start();
    this.windFilter = bp;

    this.noiseBuffer = noise.buffer;
  }

  async toggle() {
    if (!this.ctx) this._build();
    if (this.ctx.state === 'suspended') await this.ctx.resume();

    this.on = !this.on;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(this.on ? 0.2 : 0.0001, now + (this.on ? 2.2 : 0.7));
    return this.on;
  }

  setDepth(v) {
    if (!this.ctx) return;
    this.depth = v;
    const now = this.ctx.currentTime;
    if (this.padFilter) {
      this.padFilter.frequency.setTargetAtTime(300 + v * 420, now, 1.4);
    }
    if (this.windFilter) {
      this.windFilter.frequency.setTargetAtTime(420 + v * 700, now, 1.8);
    }
  }

  /** short filtered burst — the sound of a pulse leaving the field */
  burst() {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(240, now);
    bp.frequency.exponentialRampToValueAtTime(2400, now + 0.45);
    bp.Q.value = 1.1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    src.connect(bp).connect(g).connect(this.master);
    g.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.6);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(96, now);
    o.frequency.exponentialRampToValueAtTime(38, now + 0.5);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(0.09, now + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    o.connect(og).connect(this.master);
    o.start(now);
    o.stop(now + 0.65);
  }
}
