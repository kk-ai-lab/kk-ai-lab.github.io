import './style.css';
import { Universe } from './three/universe.js';
import { Drone } from './audio.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const FINE = window.matchMedia('(pointer: fine)').matches;
const STATE_NAMES = ['ORIGIN', 'CONNECTION', 'EMERGENCE', 'EXPERIMENTATION', 'INFINITY'];

if (FINE) document.body.classList.add('is-fine-pointer');

/* ────────────────────────────────────────────────────────────
   chapter model
   ──────────────────────────────────────────────────────────── */

const CHAPTER_FADE = [
  { in: [0, 0], out: [0.26, 0.4] },        // cover
  { in: [0.05, 0.16], out: [0.64, 0.8] },
  { in: [0.05, 0.16], out: [0.64, 0.8] },
  { in: [0.05, 0.16], out: [0.64, 0.8] },
  { in: [0.05, 0.16], out: [0.64, 0.8] },
  { in: [0.05, 0.16], out: [0.4, 0.52] },  // infinity hands off to the colophon
];

const sections = $$('.chapter');

/* every visible group is a block: it owns a fade window and its own reveals */
const allBlocks = $$('[data-block]').map((el) => ({
  el,
  chapter: el.closest('.chapter'),
  win: el.dataset.window ? el.dataset.window.split(',').map(Number) : null,
  reveals: $$('[data-reveal]', el),
}));

const chapters = sections.map((el, i) => {
  const own = allBlocks.filter((b) => b.chapter === el);
  const claimed = new Set();
  own.forEach((b) => b.reveals.forEach((r) => claimed.add(r)));
  const orphans = $$('[data-reveal]', el).filter((r) => !claimed.has(r));
  return { el, i, top: 0, height: 0, p: 0, op: 0, blocks: own, orphans };
});

const revealEls = $$('[data-reveal]');
const globalReveals = [];
revealEls.forEach((el, i) => {
  el.__delay = Math.min(i * 55, 900);
  const tr = getComputedStyle(el).transform;
  el.__staticTransform = tr !== 'none';
  if (!el.closest('.chapter')) globalReveals.push(el);
});

/* state keyframes — recomputed on resize */
let stateKeys = [];

function measure() {
  const vh = window.innerHeight;
  chapters.forEach((c) => {
    c.top = c.el.offsetTop;
    c.height = c.el.offsetHeight;
  });

  const keyAt = (ci, q) => {
    const c = chapters[ci];
    return c.top + q * Math.max(1, c.height);
  };

  // each formation holds while its chapter is being read, then travels
  stateKeys = [
    { pos: 0, s: 0 },
    { pos: keyAt(1, 0.45), s: 0 },
  ];
  for (let i = 2; i <= 5; i++) {
    stateKeys.push({ pos: keyAt(i, 0.1), s: i - 1 });
    stateKeys.push({ pos: keyAt(i, 0.6), s: i - 1 });
  }
}

function stateAt(scroll) {
  const k = stateKeys;
  if (!k.length) return 0;
  if (scroll <= k[0].pos) return k[0].s;
  const last = k[k.length - 1];
  if (scroll >= last.pos) return last.s;
  for (let i = 0; i < k.length - 1; i++) {
    if (scroll >= k[i].pos && scroll <= k[i + 1].pos) {
      const t = (scroll - k[i].pos) / Math.max(1, k[i + 1].pos - k[i].pos);
      return k[i].s + (k[i + 1].s - k[i].s) * smoothstep(0, 1, t);
    }
  }
  return last.s;
}

/* ────────────────────────────────────────────────────────────
   boot
   ──────────────────────────────────────────────────────────── */

const boot = $('#boot');
const bootBar = $('#boot-bar');
const bootPct = $('#boot-pct');
const bootStatus = $('#boot-status');
const bootLog = $('#boot-log');
const bootList = $('#boot-list');

const BOOT_STEPS = [
  [0.0, 'Initialising substrate', 'SEED 0x4B4B2E41'],
  [0.18, 'Seeding neural lattice', 'BUFFER 130,000 VERTICES'],
  [0.44, 'Calibrating optics', 'SHADER · MORPH CHAIN / 5 STATES'],
  [0.68, 'Compiling light field', 'BLOOM + CHROMATIC PASS'],
  [0.88, 'Signal acquired', 'HANDSHAKE OK'],
];

let revealStart = Infinity;
let started = false;

async function runBoot() {
  document.documentElement.style.overflow = 'hidden';

  // fonts load in parallel; the meter never waits on the network
  const fontsReady = Promise.race([document.fonts.ready, sleep(1000)]).catch(() => {});

  const t0 = performance.now();
  const DUR = REDUCED ? 300 : 1750;

  await new Promise((resolve) => {
    const tick = () => {
      const t = clamp((performance.now() - t0) / DUR, 0, 1);
      const eased = easeOut(t);
      bootBar.style.width = (eased * 100).toFixed(1) + '%';
      bootPct.textContent = String(Math.round(eased * 100)).padStart(3, '0');
      const list = bootList ? bootList.children : null;
      if (list) {
        for (let i = 0; i < list.length; i++) {
          list[i].classList.toggle('is-on', t > 0.16 + i * 0.2);
        }
      }
      let step = BOOT_STEPS[0];
      for (const s of BOOT_STEPS) if (t >= s[0]) step = s;
      if (bootStatus.textContent !== step[1]) bootStatus.textContent = step[1];
      if (bootLog.textContent !== step[2]) bootLog.textContent = step[2];
      if (t < 1) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });

  await fontsReady;
  await sleep(REDUCED ? 20 : 220);

  boot.classList.add('is-done');
  boot.style.pointerEvents = 'none';
  document.documentElement.style.overflow = '';

  revealStart = performance.now();
  started = true;

  /* the title card pulls into focus, one line after the other */
  $$('.hero__line').forEach((el, i) => setTimeout(() => settle(el), 420 + i * 320));

  setTimeout(() => boot.remove(), 1250);
}

/* ────────────────────────────────────────────────────────────
   scene
   ──────────────────────────────────────────────────────────── */

const canvas = $('#scene');
let universe = null;

function pickCount() {
  const w = window.innerWidth;
  const mem = navigator.deviceMemory || 8;
  if (w < 700) return mem <= 4 ? 34000 : 46000;
  if (w < 1200) return 88000;
  return mem <= 4 ? 72000 : 132000;
}

try {
  universe = new Universe(canvas, { count: pickCount(), reduced: REDUCED });
} catch (err) {
  console.error('WebGL init failed', err);
  canvas.style.display = 'none';
  document.body.insertAdjacentHTML(
    'beforeend',
    '<div class="noscript">WebGL is unavailable — the neural field cannot be rendered on this device.</div>'
  );
}

/* ────────────────────────────────────────────────────────────
   pointer
   ──────────────────────────────────────────────────────────── */

const cursor = $('#cursor');
const cursorLabel = $('#cursor-label');
const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2, nx: 0, ny: 0, seen: false };
let hovering = false;

function setPointerFromEvent(e) {
  pointer.x = e.clientX;
  pointer.y = e.clientY;
  pointer.nx = (e.clientX / window.innerWidth) * 2 - 1;
  pointer.ny = -((e.clientY / window.innerHeight) * 2 - 1);
  if (!pointer.seen) {
    pointer.seen = true;
    if (FINE) cursor.classList.add('is-visible');
  }
}

let pointerDown = false;
let dragging = false;
let downAt = 0;
let downX = 0;
let downY = 0;
let lastX = 0;
let emitTimer = null;
let holdTimer = null;

window.addEventListener(
  'pointermove',
  (e) => {
    setPointerFromEvent(e);
    if (universe) universe.setPointer(pointer.nx, pointer.ny, true);

    if (pointerDown) {
      if (!dragging) {
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 7) {
          dragging = true;
          cursor.classList.remove('is-down');
          cursor.classList.add('is-drag');
          clearTimeout(holdTimer);
          clearInterval(emitTimer);
        }
      }
      if (dragging && universe) universe.drag(e.clientX - lastX);
      lastX = e.clientX;
    }

    const hit = e.target.closest && e.target.closest('[data-cursor]');
    if (hit) {
      const label = hit.getAttribute('data-cursor');
      cursorLabel.textContent =
        label === 'travel' ? 'Travel'
        : label === 'audio' ? (audio.on ? 'Mute' : 'Listen')
        : label === 'return' ? 'Return'
        : label;
      if (!hovering) {
        hovering = true;
        cursor.classList.add('is-hover');
      }
    } else if (hovering) {
      hovering = false;
      cursor.classList.remove('is-hover');
      cursorLabel.textContent = '';
    }
  },
  { passive: true }
);

window.addEventListener('pointerleave', () => {
  if (universe) universe.setPointer(0, 0, false);
  cursor.classList.remove('is-visible');
});

function firePulse() {
  if (!universe) return;
  universe.emit();
  audio.burst(((downX || window.innerWidth * 0.5) / window.innerWidth) * 2 - 1);
}

function endGesture() {
  clearTimeout(holdTimer);
  clearInterval(emitTimer);
  holdTimer = null;
  cursor.classList.remove('is-down', 'is-drag');
  pointerDown = false;
  dragging = false;
}

window.addEventListener('pointerdown', (e) => {
  if (!started) return;
  if (e.button !== undefined && e.button !== 0) return;
  pointerDown = true;
  dragging = false;
  downAt = performance.now();
  downX = e.clientX;
  downY = e.clientY;
  lastX = e.clientX;
  cursor.classList.add('is-down');

  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    if (!dragging) {
      firePulse();
      emitTimer = setInterval(firePulse, 620);
    }
  }, 210);
});

window.addEventListener('pointerup', () => {
  if (pointerDown && !dragging && started && performance.now() - downAt < 210) firePulse();
  endGesture();
});
window.addEventListener('pointercancel', endGesture);

/* ── entrance: type arrives over-tracked and out of focus, then pulls in ── */
function settle(el) {
  if (!el) return;
  el.classList.remove('is-settled');
  void el.offsetWidth; // restart the animation
  el.classList.add('is-settled');
}

/* ────────────────────────────────────────────────────────────
   audio
   ──────────────────────────────────────────────────────────── */

const audio = new Drone();
const soundBtn = $('#sound');

soundBtn.addEventListener('click', async () => {
  try {
    const on = await audio.toggle();
    soundBtn.classList.toggle('is-on', on);
    soundBtn.setAttribute('aria-pressed', String(on));
    $('.sound__label', soundBtn).textContent = on ? 'Sound on' : 'Audio';
  } catch (err) {
    console.warn('Audio unavailable', err);
  }
});

/* ────────────────────────────────────────────────────────────
   navigation
   ──────────────────────────────────────────────────────────── */

/* custom eased scroll — native smooth scrolling is too slow across 900vh */
let scrollTween = null;

function tweenScroll(targetY, dur) {
  const start = window.scrollY;
  const delta = targetY - start;
  if (Math.abs(delta) < 2) return;
  const duration = dur || Math.min(1900, 520 + Math.abs(delta) * 0.28);
  const t0 = performance.now();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  cancelAnimationFrame(scrollTween);
  const step = (now) => {
    const t = clamp((now - t0) / duration, 0, 1);
    window.scrollTo(0, start + delta * ease(t));
    if (t < 1) scrollTween = requestAnimationFrame(step);
  };
  scrollTween = requestAnimationFrame(step);
}

function cancelTween() {
  cancelAnimationFrame(scrollTween);
}

window.addEventListener('wheel', cancelTween, { passive: true });
window.addEventListener('touchstart', cancelTween, { passive: true });

$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href').slice(1);
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const ch = chapters.find((c) => c.el === el);
    const extra = ch && ch.i > 0 ? (ch.height - window.innerHeight) * 0.16 : 0;
    tweenScroll(el.offsetTop + extra);
  });
});

$('#return').addEventListener('click', () => {
  if (REDUCED) window.scrollTo(0, 0);
  else tweenScroll(0, 1500);
});

/* ────────────────────────────────────────────────────────────
   hud
   ──────────────────────────────────────────────────────────── */

const roState = $('#ro-state');
const roCount = $('#ro-count');
const roEnt = $('#ro-ent');
const roPos = $('#ro-pos');
const roSec = $('#ro-sec');
const clockEl = $('#clock');
const scrollcue = $('#scrollcue');
const railLinks = $$('.rail__list a');

roCount.textContent = universe ? universe.data.count.toLocaleString('en-US') : '—';

function tickClock() {
  if (!clockEl) return;
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  clockEl.textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
tickClock();
setInterval(tickClock, 1000);

let lastHud = 0;
let lastActive = -1;

function updateHud(now, scroll, state, activeChapter) {
  if (now - lastHud < 130) return;
  lastHud = now;

  const active = clamp(activeChapter, 0, 4);
  if (active !== lastActive) {
    lastActive = active;
    roState.textContent = 'SYS / ' + STATE_NAMES[active];
    railLinks.forEach((a, i) => a.classList.toggle('is-active', i === active));
  }

  const t = now * 0.001;
  const entropy = 0.008 + state * 0.241 + Math.sin(t * 0.7) * 0.0035;
  roEnt.textContent = entropy.toFixed(4);
  if (roSec) roSec.textContent = String(active + 1).padStart(2, '0') + '/05';
  const roVel = document.getElementById('ro-vel');
  if (roVel) roVel.textContent = scrollVel.toFixed(2);

  if (universe) {
    const p = universe.camera.position;
    const f = (v) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);
    roPos.textContent = `X ${f(p.x)}   Y ${f(p.y)}   Z ${f(p.z)}`;
    audio.setState(state);
  }

  if (scroll > 40) scrollcue.classList.add('is-gone');
  else scrollcue.classList.remove('is-gone');
}

/* ────────────────────────────────────────────────────────────
   render loop
   ──────────────────────────────────────────────────────────── */

let vh = window.innerHeight;
let smoothScroll = window.scrollY;
let lastScrollPos = window.scrollY;
let scrollVel = 0;
let lastNow = performance.now();
let frameAcc = 0;
let frameN = 0;
let degraded = false;

function frame(now) {
  const dtRaw = (now - lastNow) / 1000;
  lastNow = now;
  const dt = clamp(dtRaw, 0.001, 0.05);
  const time = now * 0.001;

  const scroll = window.scrollY;
  smoothScroll += (scroll - smoothScroll) * (1 - Math.exp(-dt * 7.5));

  const dv = (scroll - lastScrollPos) / Math.max(dt, 0.008);
  lastScrollPos = scroll;
  scrollVel = clamp(Math.abs(dv) / 3200, 0, 1);
  if (universe) universe.setVelocity(scrollVel);
  audio.setVelocity(scrollVel);

  const state = universe && universe.frozen != null ? universe.frozen : stateAt(smoothScroll);
  if (universe) {
    universe.setState(state);
    universe.update(dt, time);
    universe.render();
  }

  /* text choreography uses the real scroll position */
  const elapsed = now - revealStart;

  let activeChapter = 0;

  for (const c of chapters) {
    const p = c.height > vh ? clamp((scroll - c.top) / (c.height - vh), 0, 1) : 0;
    c.p = p;
    // copy is choreographed across the full section; the final scene
    // normalises to its pinned range so the colophon can land
    const pt = c.i === chapters.length - 1
      ? p
      : c.height > 0 ? clamp((scroll - c.top) / c.height, 0, 1) : 0;
    const cfg = CHAPTER_FADE[c.i];
    if (scroll >= c.top && scroll < c.top + c.height) activeChapter = c.i;

    const paint = (reveals, w, blockEl) => {
      const inE = w[0] === w[1] ? 1 : smoothstep(w[0], w[1], pt);
      const outE = smoothstep(w[2], w[3], pt);
      const op = inE * (1 - outE);
      if (blockEl) {
        if (op > 0.55 && !blockEl.__shown) {
          blockEl.__shown = true;
          const t = blockEl.querySelector('.title, .manifest__title, .end__mark');
          if (t) settle(t);
        } else if (op < 0.08) {
          blockEl.__shown = false;
        }
        blockEl.style.setProperty('--scrim', op.toFixed(3));
        const hit = op > 0.06 ? 'auto' : 'none';
        if (blockEl.__hit !== hit) {
          blockEl.style.pointerEvents = hit;
          blockEl.__hit = hit;
        }
      }
      for (const el of reveals) {
        const rp = elapsed <= 0 ? 0 : easeOut(clamp((elapsed - el.__delay) / 1150, 0, 1));
        const alpha = op * rp;

        if (el.__lastA === undefined || Math.abs(el.__lastA - alpha) > 0.002) {
          el.style.opacity = alpha.toFixed(3);
          el.__lastA = alpha;
        }
        const vis = alpha < 0.012 ? 'hidden' : 'visible';
        if (el.__vis !== vis) {
          el.style.visibility = vis;
          el.__vis = vis;
        }
        if (!el.__staticTransform) {
          const ty = (1 - rp) * 22 + (1 - inE) * 26 - outE * 12;
          if (el.__lastY === undefined || Math.abs(el.__lastY - ty) > 0.08) {
            el.style.transform = `translate3d(0,${ty.toFixed(2)}px,0)`;
            el.__lastY = ty;
          }
        }
      }
    };

    const base = [cfg.in[0], cfg.in[1], cfg.out[0], cfg.out[1]];
    for (const b of c.blocks) paint(b.reveals, b.win || base, b.el);
    if (c.orphans.length) paint(c.orphans, base, null);
    c.op = 0;
  }

  /* chrome outside the chapters reveals once, independent of scroll */
  for (const el of globalReveals) {
    const rp = elapsed <= 0 ? 0 : easeOut(clamp((elapsed - el.__delay) / 1150, 0, 1));
    const alpha = rp;
    if (el.__lastA === undefined || Math.abs(el.__lastA - alpha) > 0.002) {
      el.style.opacity = alpha.toFixed(3);
      el.__lastA = alpha;
    }
    const vis = alpha < 0.012 ? 'hidden' : 'visible';
    if (el.__vis !== vis) {
      el.style.visibility = vis;
      el.__vis = vis;
    }
    if (!el.__staticTransform) {
      const ty = (1 - rp) * 14;
      if (el.__lastY === undefined || Math.abs(el.__lastY - ty) > 0.08) {
        el.style.transform = `translate3d(0,${ty.toFixed(2)}px,0)`;
        el.__lastY = ty;
      }
    }
  }

  /* cursor */
  if (FINE && pointer.seen) {
    cursor.style.transform = `translate3d(${pointer.x}px,${pointer.y}px,0)`;
  }

  updateHud(now, scroll, state, Math.max(0, activeChapter - 1));

  /* adaptive resolution — one-way, quiet */
  if (!degraded && dtRaw > 0.001) {
    frameAcc += dtRaw;
    frameN++;
    if (frameN >= 100) {
      const avg = frameAcc / frameN;
      if (avg > 0.031 && universe) {
        universe.dprCap = 1.25;
        universe.resize();
        degraded = true;
      }
      frameAcc = 0;
      frameN = 0;
    }
  }

  requestAnimationFrame(frame);
}

/* ────────────────────────────────────────────────────────────
   lifecycle
   ──────────────────────────────────────────────────────────── */

function onResize() {
  vh = window.innerHeight;
  measure();
  if (universe) universe.resize();
}

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(onResize, 120);
});
window.addEventListener('orientationchange', () => setTimeout(onResize, 220));

document.addEventListener('visibilitychange', () => {
  lastNow = performance.now();
});

measure();
onResize();
runBoot();

/* dev inspection hooks (harmless in production) */
window.__nu = {
  get universe() { return universe; },
  chapters,
  setState(n) {
    if (!universe) return;
    universe.frozen = n;
    universe.targetState = n;
    universe.state = n;
    smoothScroll = window.scrollY;
  },
  unfreeze() {
    if (universe) universe.frozen = null;
  },
  stats() {
    return universe
      ? { particles: universe.data.count, calls: universe.renderer.info.render.calls, dpr: universe.renderer.getPixelRatio() }
      : null;
  },
};
requestAnimationFrame((t) => {
  lastNow = t;
  frame(t);
});

/* keep the layout honest once fonts settle */
document.fonts.ready.then(() => {
  measure();
  onResize();
});
