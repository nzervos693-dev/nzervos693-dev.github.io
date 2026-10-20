// Procedural audio for Floor 15 (Milestone 1). Run: npm run audio
// Writes mono 22.05 kHz WAVs to a temp dir, then encodes OGG with ffmpeg
// (required; fails loudly if missing). Also writes public/assets/audio/manifest.json.
import { writeFileSync, mkdirSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 22050;
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');
mkdirSync(OUT, { recursive: true });

// ---------- helpers ----------
const TAU = Math.PI * 2;
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const buf = (sec) => new Float32Array(Math.round(sec * SR));
const noise = (n, seed) => { const r = rng(seed), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = r() * 2 - 1; return o; };
const exp = (t, d) => Math.exp(-t / d);
const att = (t, a) => Math.min(1, t / a);

function biquad(x, type, fc, q = 0.7) {
  const w = TAU * Math.min(fc, SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; } // bandpass (constant peak gain)
  const o = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y;
  }
  return o;
}
const lp = (x, f, q) => biquad(x, 'lp', f, q);
const hp = (x, f, q) => biquad(x, 'hp', f, q);
const bp = (x, f, q) => biquad(x, 'bp', f, q);

/** Render fn(t, i) into a new buffer of `sec` seconds. */
function gen(sec, fn) { const o = buf(sec); for (let i = 0; i < o.length; i++) o[i] = fn(i / SR, i); return o; }
/** Add src into dst starting at `at` seconds, scaled by g. */
function mix(dst, src, at = 0, g = 1) {
  const s = Math.round(at * SR);
  for (let i = 0; i < src.length && s + i < dst.length; i++) if (s + i >= 0) dst[s + i] += src[i] * g;
  return dst;
}
const saw = (ph) => 2 * (ph - Math.floor(ph)) - 1;
const sq = (ph) => (ph - Math.floor(ph) < 0.5 ? 1 : -1);
/** Oscillator with frequency function f(t); shape(phase) -> sample; amp(t). */
function osc(sec, f, shape, amp) {
  let ph = 0; return gen(sec, (t) => { ph += f(t) / SR; return shape(ph) * amp(t); });
}
const sine = (ph) => Math.sin(TAU * ph);
const lerp = (a, b, k) => a + (b - a) * k;
const drive = (x, g) => { for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * g); return x; };

// ---------- building blocks ----------
function thud(sec, f0, f1, d, g = 1) { return osc(sec, (t) => lerp(f0, f1, Math.min(1, t / d)), sine, (t) => g * exp(t, d) * att(t, 0.002)); }
function nburst(sec, seed, d, g = 1) { const n = noise(Math.round(sec * SR), seed); return gen(sec, (t, i) => n[i] * exp(t, d) * g * att(t, 0.001)); }
function footstep(seed, cut, f0) {
  const o = buf(0.2);
  mix(o, lp(nburst(0.2, seed, 0.035, 1.2), cut), 0);
  mix(o, thud(0.2, f0, f0 * 0.55, 0.06, 0.9), 0);
  return o;
}
/** Vocal-ish source through two formants. pitch(t), amp(t) functions. */
function voice(sec, pitch, amp, f1, f2, seed, breath = 0.25, rough = 0.0) {
  const r = rng(seed); let ph = 0;
  const src = gen(sec, (t) => {
    const vib = 1 + 0.03 * Math.sin(TAU * 5.5 * t) + rough * (r() - 0.5);
    ph += (pitch(t) * vib) / SR;
    return saw(ph) * 0.8 + (r() * 2 - 1) * breath;
  });
  const a = bp(src, f1, 4), b = bp(src, f2, 5), o = new Float32Array(src.length);
  for (let i = 0; i < o.length; i++) o[i] = (a[i] * 1.3 + b[i] * 0.8) * amp(i / SR);
  return o;
}
function peak(x) { let m = 0; for (const v of x) m = Math.max(m, Math.abs(v)); return m; }

/** Make a looping buffer seamless by crossfading the tail into the head. */
function seamless(x, fadeSec) {
  const f = Math.round(fadeSec * SR), n = x.length - f, o = new Float32Array(n);
  for (let i = 0; i < n; i++) o[i] = x[i];
  for (let i = 0; i < f; i++) { const k = i / f; o[i] = x[i] * Math.sin(k * Math.PI / 2) + x[n + i] * Math.cos(k * Math.PI / 2); }
  return o;
}

// ---------- sound definitions ----------
// Each: { gen: () => Float32Array, volume, loop, event, [fade]=false for loops }
const S = {};
const def = (key, event, volume, fn, opts = {}) => { S[key] = { event, volume, loop: false, fn, ...opts }; };

def('ui_tap', 'Any button or menu tap', 0.5, () =>
  mix(osc(0.09, (t) => lerp(1000, 650, t / 0.09), sq, (t) => 0.35 * exp(t, 0.025)), nburst(0.02, 1, 0.005, 0.4)));

def('step_1', 'Hero walking tap-move (alternate with step_2)', 0.45, () => footstep(11, 700, 95));
def('step_2', 'Hero walking tap-move (alternate with step_1)', 0.45, () => footstep(12, 520, 80));

def('stairs', 'Hero changes floor via stairs', 0.5, () => {
  const o = buf(1.0);
  for (let k = 0; k < 5; k++) mix(o, footstep(20 + k, 800 - k * 40, 110 - k * 4), 0.05 + k * 0.19, 0.9 - k * 0.04);
  return o;
});

def('search', 'Search / scavenge rummage (start of search)', 0.5, () => {
  const n = bp(noise(Math.round(0.8 * SR), 31), 2800, 0.8), r = rng(32);
  const knots = Array.from({ length: 12 }, () => r());
  return gen(0.8, (t, i) => {
    const p = t / 0.8 * 11, k = Math.floor(p), e = knots[k] + (knots[Math.min(11, k + 1)] - knots[k]) * (p - k);
    return n[i] * (0.15 + e * e * 0.9) * att(t, 0.02) * Math.min(1, (0.8 - t) / 0.08);
  });
}, { norm: 0.6 });

def('dismantle_wood', 'Dismantle a wooden object (creak then crack)', 0.8, () => {
  const o = buf(0.75);
  const creak = osc(0.4, (t) => lerp(110, 190, t / 0.4) + 12 * Math.sin(TAU * 31 * t), saw, (t) => 0.5 * Math.sin(Math.PI * t / 0.4));
  mix(o, bp(creak, 700, 3), 0, 1.6);
  mix(o, hp(nburst(0.15, 41, 0.02, 1.4), 1200), 0.42);
  mix(o, thud(0.3, 140, 60, 0.08, 0.8), 0.42);
  mix(o, hp(nburst(0.1, 42, 0.015, 1), 1500), 0.55, 0.7);
  return o;
});

def('dismantle_metal', 'Dismantle a metal object (clank, clank)', 0.5, () => {
  const o = buf(0.7);
  const clank = (g, s) => {
    const c = buf(0.4);
    for (const [f, d, a] of [[520, 0.14, 1], [1370, 0.1, 0.7], [2210, 0.07, 0.5], [3340, 0.04, 0.35]])
      mix(c, osc(0.4, () => f * s, sine, (t) => a * exp(t, d)), 0);
    mix(c, hp(nburst(0.05, 51, 0.008, 1.2), 2000), 0);
    return c.map((v) => v * g);
  };
  mix(o, clank(0.7, 1), 0); mix(o, clank(0.6, 1.12), 0.28);
  return o;
});

def('drain', 'Drain / collect water (glug)', 0.5, () => {
  const o = buf(0.8), r = rng(61);
  for (let k = 0; k < 6; k++) {
    const f = 260 + r() * 200;
    mix(o, osc(0.15, (t) => f * (1 + 1.2 * t / 0.15 * 0.6), sine, (t) => 0.7 * exp(t, 0.045) * att(t, 0.005)), 0.03 + k * 0.12 + r() * 0.03);
  }
  mix(o, lp(gen(0.8, (t, i) => (r() * 2 - 1) * 0.15 * att(t, 0.1)), 900), 0);
  return o;
});

def('pickup', 'Item added to inventory', 0.5, () => {
  const o = buf(0.25);
  const nt = (f, at) => mix(o, osc(0.15, () => f, sq, (t) => 0.3 * exp(t, 0.05)), at);
  nt(660, 0); nt(990, 0.07);
  return lp(o, 4000);
});

def('eat', 'Use food item (eat)', 0.75, () => {
  const o = buf(0.6);
  [0.02, 0.17, 0.32, 0.45].forEach((at, k) => {
    mix(o, bp(nburst(0.1, 70 + k, 0.03, 2), 1400 + k * 150, 1.2), at);
    mix(o, thud(0.1, 160, 90, 0.03, 0.5), at);
  });
  return o;
});

def('drink', 'Use drink item (drink / gulps)', 0.5, () => {
  const o = buf(0.7);
  [0.05, 0.28, 0.5].forEach((at, k) => {
    mix(o, osc(0.18, (t) => lerp(280, 140, t / 0.18) - k * 10, sine, (t) => 0.8 * exp(t, 0.06) * att(t, 0.01)), at);
    mix(o, bp(nburst(0.15, 80 + k, 0.05, 0.5), 700, 1), at);
  });
  return o;
});

def('door_hit', 'Jammed or locked door hit / zombie pounds a door', 0.7, () => {
  const o = buf(0.45);
  mix(o, thud(0.45, 90, 38, 0.1, 1.2), 0);
  mix(o, lp(nburst(0.3, 91, 0.05, 1), 500), 0);
  mix(o, bp(nburst(0.2, 92, 0.04, 1), 900, 2), 0, 0.6);
  return o;
});

def('door_open', 'Door opens (floor door or apartment)', 0.5, () => {
  const o = buf(0.9);
  const creak = osc(0.7, (t) => lerp(120, 260, t / 0.7) + 25 * Math.sin(TAU * 17 * t), saw, (t) => 0.5 * Math.sin(Math.PI * t / 0.7));
  mix(o, bp(creak, 900, 3.5), 0, 1.6);
  mix(o, hp(nburst(0.03, 101, 0.006, 1.5), 1800), 0.0);
  mix(o, thud(0.15, 100, 60, 0.04, 0.6), 0.75);
  return o;
});

def('swing', 'Melee swing starts (before hit/miss)', 0.4, () => {
  const n = noise(Math.round(0.3 * SR), 111), o = buf(0.3);
  let ph = 0, y = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR; const fc = lerp(500, 3200, Math.min(1, t / 0.22));
    const a = 2 * Math.sin(Math.PI * Math.min(1, fc / SR) * 0.5); // simple state-variable-ish lowpass
    y += a * (n[i] - y); ph = y;
    o[i] = (n[i] - y) * Math.sin(Math.PI * t / 0.3) ** 2 * 1.5 + ph * 0.1;
  }
  return o;
}, { norm: 0.6 });

def('hit_flesh', 'Player melee or thrown hit lands on a zombie', 0.65, () => {
  const o = buf(0.3);
  mix(o, lp(nburst(0.25, 121, 0.05, 1.3), 1200), 0);
  mix(o, thud(0.25, 130, 55, 0.07, 1), 0);
  mix(o, bp(nburst(0.2, 122, 0.06, 0.8), 1300, 1.5), 0.02);
  return o;
});

const groan = (seed, f0, f1, f2, dur, wob) => voice(dur,
  (t) => f0 * (1 + 0.25 * Math.sin(Math.PI * t / dur) - 0.2 * t / dur) + wob * Math.sin(TAU * 3 * t),
  (t) => Math.sin(Math.PI * Math.min(1, t / dur)) ** 0.7 * att(t, 0.08) * 0.9, f1, f2, seed, 0.35, 0.5);

def('zombie_groan_1', 'Zombie idle / spotted you (ambient groan)', 0.55, () => drive(groan(131, 95, 520, 880, 1.3, 4), 1.5));
def('zombie_groan_2', 'Zombie idle / aggro (lower, longer groan)', 0.55, () => drive(groan(132, 70, 420, 750, 1.6, 6), 1.6));

def('zombie_hit', 'Zombie attacks / bites the hero', 0.65, () => {
  const o = drive(voice(0.4, (t) => lerp(140, 85, t / 0.4), (t) => att(t, 0.01) * exp(t, 0.18), 600, 1000, 141, 0.5, 0.9), 1.8);
  mix(o, hp(nburst(0.08, 142, 0.02, 1), 800), 0, 0.5);
  return o;
});

def('zombie_death', 'Zombie killed (falls)', 0.65, () => {
  const o = buf(1.1);
  mix(o, drive(voice(0.8, (t) => lerp(120, 38, Math.min(1, t / 0.8)), (t) => att(t, 0.02) * exp(t, 0.4), 450, 800, 151, 0.4, 0.7), 1.5), 0);
  mix(o, thud(0.4, 80, 35, 0.12, 1.2), 0.7);
  mix(o, lp(nburst(0.3, 152, 0.08, 0.8), 600), 0.7);
  return o;
});

def('hero_hurt', 'Hero takes damage', 0.65, () => {
  const o = voice(0.35, (t) => lerp(230, 150, t / 0.35), (t) => att(t, 0.01) * exp(t, 0.15), 700, 1150, 161, 0.3, 0.2);
  mix(o, thud(0.2, 100, 50, 0.05, 0.8), 0);
  return o;
});

def('heartbeat', 'Low health loop: play looped while health is low, stop on recovery', 0.6, () => {
  const o = buf(1.0);
  mix(o, thud(0.3, 62, 40, 0.07, 1), 0);
  mix(o, thud(0.3, 54, 36, 0.08, 0.75), 0.27);
  return lp(o, 250);
}, { loop: true, noFade: true });

def('siren', 'Attack warning (scheduled/scripted attack incoming); play once per warning', 0.22, () =>
  lp(osc(2.4, (t) => 620 + 220 * Math.sin(TAU * t / 1.2 - Math.PI / 2), (p) => sq(p) * 0.6 + saw(p) * 0.4,
    (t) => 0.6 * att(t, 0.1) * Math.min(1, (2.4 - t) / 0.2)), 2200, 0.9));

def('barricade_hit', 'Zombies hit a barricade', 0.7, () => {
  const o = buf(0.55);
  mix(o, thud(0.5, 85, 40, 0.12, 1.2), 0);
  mix(o, bp(nburst(0.4, 181, 0.1, 1.5), 350, 1.2), 0.02);
  mix(o, hp(nburst(0.1, 182, 0.02, 0.8), 1000), 0.08);
  mix(o, bp(nburst(0.2, 183, 0.06, 0.6), 600, 3), 0.2); // rattle
  return o;
});

def('craft', 'Craft / build completes (hammer taps)', 0.55, () => {
  const o = buf(0.8);
  [0.02, 0.22, 0.42].forEach((at, k) => {
    mix(o, thud(0.1, 180, 110, 0.03, 0.9), at);
    mix(o, hp(nburst(0.06, 191 + k, 0.01, 1.2), 1800), at);
    mix(o, osc(0.3, () => 1500 + k * 120, sine, (t) => 0.4 * exp(t, 0.06)), at);
  });
  mix(o, osc(0.3, () => 880, sine, (t) => 0.25 * exp(t, 0.12)), 0.6);
  mix(o, osc(0.3, () => 1320, sine, (t) => 0.2 * exp(t, 0.12)), 0.65);
  return o;
});

def('survivor_blip', 'Survivor dialogue line text tick (play per word/line, vary playbackRate)', 0.4, () => {
  const o = buf(0.3), r = rng(201);
  for (let k = 0; k < 3; k++) {
    const f = 300 + r() * 220;
    mix(o, osc(0.07, () => f, sq, (t) => 0.3 * exp(t, 0.03)), k * 0.075);
  }
  return lp(o, 2500);
});

def('error', 'Denied: action impossible, inventory full, locked', 0.35, () => {
  const o = buf(0.3);
  mix(o, osc(0.12, () => 220, sq, (t) => 0.35 * exp(t, 0.08)), 0);
  mix(o, osc(0.16, () => 165, sq, (t) => 0.35 * exp(t, 0.1)), 0.11);
  return lp(o, 1800);
});

def('amb_tower', 'Tower ambience bed: loop quietly from first tap on the game scene', 0.3, () => {
  const L = 16, fade = 2, total = L + fade;
  // all tonal frequencies are multiples of 1/L Hz => perfectly periodic
  const comps = [[55, 0.5, 1], [82.5, 0.25, 2], [110.0625, 0.15, 3], [41.25, 0.4, 1]];
  const tone = gen(L, (t) => {
    let s = 0;
    for (const [f, a, lfo] of comps) s += Math.sin(TAU * f * t + Math.sin(TAU * lfo * t / L)) * a * (0.7 + 0.3 * Math.sin(TAU * lfo * t / L + f));
    return s;
  });
  const wind = lp(noise(Math.round(total * SR), 211), 260, 0.8);
  const wl = seamless(wind, fade);
  const o = buf(L);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] = tone[i] * 0.55 + wl[i] * 5 * (0.6 + 0.4 * Math.sin(TAU * 2 * t / L));
  }
  return o;
}, { loop: true, noFade: true });

def('weapon_break', 'Weapon durability hits zero and it breaks', 0.65, () => {
  const o = buf(0.5);
  mix(o, hp(nburst(0.12, 301, 0.015, 1.4), 1500), 0);
  mix(o, thud(0.3, 150, 60, 0.07, 1), 0);
  for (const [f, at] of [[1800, 0.06], [2600, 0.12], [1300, 0.2]]) mix(o, osc(0.2, () => f, sine, (t) => 0.4 * exp(t, 0.04)), at);
  mix(o, bp(nburst(0.3, 302, 0.08, 0.7), 500, 2), 0.18);
  return o;
});

def('glass_shatter', 'Glass breaks (molotov lands, window smash)', 0.55, () => {
  const o = buf(0.9), r = rng(311);
  mix(o, hp(nburst(0.25, 312, 0.05, 1.5), 3000), 0);
  for (let k = 0; k < 14; k++) {
    const f = 2500 + r() * 4000;
    mix(o, osc(0.12, () => f, sine, (t) => 0.35 * exp(t, 0.02)), 0.03 + r() * 0.6 * (k / 14) + k * 0.02);
  }
  return o;
}, { norm: 0.6 });

def('fire_whoosh', 'Molotov ignites / fire bursts', 0.6, () => {
  const o = buf(1.2), n = noise(Math.round(1.2 * SR), 321);
  const w = lp(n, 1200, 0.7), c = bp(n, 300, 0.8);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, e = att(t, 0.12) * exp(Math.max(0, t - 0.12), 0.45);
    o[i] = (w[i] * 1.2 + c[i] * 0.6) * e;
  }
  return o;
});

def('alert_sting', 'Zombie notices the hero (aggro sting)', 0.5, () => {
  const o = buf(0.7);
  mix(o, osc(0.7, () => 233, (p) => saw(p) * 0.5 + sq(p * 1.01) * 0.3, (t) => att(t, 0.01) * exp(t, 0.25)), 0);
  mix(o, osc(0.7, () => 247, saw, (t) => 0.5 * att(t, 0.01) * exp(t, 0.25)), 0); // minor second, tense
  mix(o, thud(0.4, 70, 45, 0.1, 0.9), 0);
  return lp(o, 2200);
});

def('barricade_break', 'A barricade is destroyed', 0.75, () => {
  const o = buf(0.9);
  mix(o, thud(0.6, 90, 35, 0.15, 1.2), 0);
  for (const at of [0, 0.07, 0.15, 0.26]) mix(o, hp(nburst(0.12, 331 + at * 100, 0.02, 1.2), 900), at);
  mix(o, bp(nburst(0.7, 340, 0.2, 1.2), 400, 1), 0.02);
  mix(o, bp(nburst(0.3, 341, 0.08, 0.7), 650, 3), 0.35); // falling planks
  mix(o, thud(0.3, 70, 40, 0.08, 0.8), 0.5);
  return o;
});

// ---------- encode ----------
function wavBytes(x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return b;
}
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch {
  console.error('make-audio: ffmpeg is required (with libvorbis) but was not found on PATH.');
  process.exit(1);
}
const tmp = mkdtempSync(join(tmpdir(), 'f15audio-'));
const manifest = { _doc: 'key -> files (ogg only, Android target), volume (0..1 for scene.sound.play), loop, event', sounds: {} };

for (const [key, d] of Object.entries(S)) {
  const x = d.fn();
  if (!d.noFade) { // click-free edges (before normalising so peaks are real)
    const f = Math.round(0.004 * SR), e = Math.round(0.01 * SR);
    for (let i = 0; i < f && i < x.length; i++) x[i] *= i / f;
    for (let i = 0; i < e && i < x.length; i++) x[x.length - 1 - i] *= i / e;
  }
  const g = (d.norm || 0.79) / (peak(x) || 1); // ~-2 dBFS; per-sound `volume` does the balancing
  for (let i = 0; i < x.length; i++) x[i] *= g;
  const wav = join(tmp, key + '.wav'); writeFileSync(wav, wavBytes(x));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-fflags', '+bitexact', '-flags:a', '+bitexact',
    '-ac', '1', '-ar', String(SR), '-c:a', 'libvorbis', '-q:a', '2', join(OUT, key + '.ogg')]);
  manifest.sounds[key] = { files: [key + '.ogg'], volume: d.volume, loop: d.loop, duration: +(x.length / SR).toFixed(2), event: d.event };
}
rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`audio: ${Object.keys(S).length} sounds -> ${OUT} (ogg)`);
