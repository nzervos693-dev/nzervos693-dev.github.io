// Procedural audio for Floor 15 (M1 + M2 stage 1 quiet/diegetic set). Run: npm run audio
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


/** Schroeder-style reverb: returns dry+wet, lengthened by tail seconds. */
function reverb(x, tail, wet = 0.4, fb = 0.84, size = 1) {
  const n = x.length + Math.round(tail * SR), o = new Float32Array(n), acc = new Float32Array(n);
  for (const d0 of [1116, 1188, 1277, 1356, 1422]) {
    const d = Math.round(d0 / 2 * size), ring = new Float32Array(d); let idx = 0, filt = 0;
    for (let i = 0; i < n; i++) {
      const y = ring[idx]; filt = filt * 0.45 + y * 0.55;
      ring[idx] = (i < x.length ? x[i] : 0) + filt * fb; idx = (idx + 1) % d; acc[i] += y;
    }
  }
  let cur = acc;
  for (const [d0, g] of [[225, 0.5], [556, 0.5]]) {
    const d = Math.round(d0 / 2 * size), ring = new Float32Array(d), out = new Float32Array(n); let idx = 0;
    for (let i = 0; i < n; i++) { const z = ring[idx]; const v = cur[i] - g * z; ring[idx] = v; out[i] = z + g * v; idx = (idx + 1) % d; }
    cur = out;
  }
  for (let i = 0; i < n; i++) o[i] = (i < x.length ? x[i] : 0) + cur[i] * wet * 0.35;
  return o;
}
/** Fold everything past L seconds back onto the start (for seamless loops with tails). */
function wrapFold(x, L) {
  const n = Math.round(L * SR), o = new Float32Array(n);
  for (let i = 0; i < x.length; i++) o[i % n] += x[i];
  return o;
}
/** Stick-slip creak: sawtooth pulsed at a rough rate, band-passed. */
function creakSound(seed, dur, f0, f1, pulse, bpf) {
  const r = rng(seed); let ph = 0, pp = 0;
  const src = gen(dur, (t) => {
    ph += (lerp(f0, f1, t / dur) * (1 + 0.08 * (r() - 0.5))) / SR; pp += pulse * (1 + 0.5 * (r() - 0.5)) / SR;
    const gate = Math.max(0, Math.sin(TAU * pp)) ** 2;
    return (saw(ph) * 0.7 + (r() * 2 - 1) * 0.3) * gate * Math.sin(Math.PI * t / dur) ** 1.5;
  });
  return bp(src, bpf, 2.5);
}
function cloth(seed, dur, lo, hi, g = 1) {
  const n = bp(noise(Math.round(dur * SR), seed), (lo + hi) / 2, 0.7);
  const r = rng(seed + 1), k = Array.from({ length: 8 }, () => 0.3 + r() * 0.7);
  return gen(dur, (t, i) => { const p = t / dur * 7, a = Math.floor(p); return n[i] * lerp(k[a], k[Math.min(7, a + 1)], p - a) * Math.sin(Math.PI * t / dur) * g; });
}

// ---------- sound definitions ----------
// Each: { gen: () => Float32Array, volume, loop, event, [fade]=false for loops }
const S = {};
const def = (key, event, volume, fn, opts = {}) => { S[key] = { event, volume, loop: false, fn, ...opts }; };

def('ui_tap', 'Any button or menu tap (near inaudible soft cloth/paper touch)', 0.14, () =>
  mix(lp(cloth(1, 0.07, 700, 2200, 1), 3000), thud(0.05, 160, 110, 0.012, 0.25), 0.005), { norm: 0.5 });

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

def('pickup', 'Item added to inventory (soft cloth handling, no chime)', 0.3, () => {
  const o = buf(0.3);
  mix(o, lp(cloth(3, 0.22, 500, 1800, 1), 2500), 0);
  mix(o, thud(0.1, 130, 85, 0.03, 0.45), 0.15);
  mix(o, lp(nburst(0.06, 4, 0.012, 0.3), 900), 0.15);
  return o;
}, { norm: 0.6 });

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
}, { loop: true, noFade: true, deprecated: 'replaced by heartbeat_soft' });

def('siren', 'Attack warning (scheduled/scripted attack incoming); play once per warning', 0.22, () =>
  lp(osc(2.4, (t) => 620 + 220 * Math.sin(TAU * t / 1.2 - Math.PI / 2), (p) => sq(p) * 0.6 + saw(p) * 0.4,
    (t) => 0.6 * att(t, 0.1) * Math.min(1, (2.4 - t) / 0.2)), 2200, 0.9), { deprecated: 'siren removed (GDD 10); attack cue is diegetic: distant_groan + stair_bang + flicker' });

def('barricade_hit', 'Zombies hit a barricade', 0.7, () => {
  const o = buf(0.55);
  mix(o, thud(0.5, 85, 40, 0.12, 1.2), 0);
  mix(o, bp(nburst(0.4, 181, 0.1, 1.5), 350, 1.2), 0.02);
  mix(o, hp(nburst(0.1, 182, 0.02, 0.8), 1000), 0.08);
  mix(o, bp(nburst(0.2, 183, 0.06, 0.6), 600, 3), 0.2); // rattle
  return o;
});

def('craft', 'Craft / build completes (cloth rustle then two wood knocks)', 0.4, () => {
  const o = buf(0.9);
  mix(o, lp(cloth(191, 0.45, 600, 2500, 0.7), 3000), 0);
  [0.5, 0.72].forEach((at, k) => {
    mix(o, thud(0.15, 210 - k * 25, 120, 0.035, 0.9), at);
    mix(o, bp(nburst(0.08, 195 + k, 0.012, 1), 1100, 1.5), at, 0.6);
  });
  return o;
}, { norm: 0.65 });

def('survivor_blip', 'Survivor dialogue line text tick (play per word/line, vary playbackRate)', 0.4, () => {
  const o = buf(0.3), r = rng(201);
  for (let k = 0; k < 3; k++) {
    const f = 300 + r() * 220;
    mix(o, osc(0.07, () => f, sq, (t) => 0.3 * exp(t, 0.03)), k * 0.075);
  }
  return lp(o, 2500);
}, { deprecated: 'UI/text blips removed (GDD 10)' });

def('error', 'Denied: action impossible, inventory full, locked', 0.35, () => {
  const o = buf(0.3);
  mix(o, osc(0.12, () => 220, sq, (t) => 0.35 * exp(t, 0.08)), 0);
  mix(o, osc(0.16, () => 165, sq, (t) => 0.35 * exp(t, 0.1)), 0.11);
  return lp(o, 1800);
}, { deprecated: 'gamey square blip (GDD 10); use creak/muffled_thud or silence' });

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
}, { loop: true, noFade: true, deprecated: 'replaced by amb_wind + amb_room_tone' });

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
}, { deprecated: 'noise alert sting removed (GDD 10)' });

def('barricade_break', 'A barricade is destroyed', 0.75, () => {
  const o = buf(0.9);
  mix(o, thud(0.6, 90, 35, 0.15, 1.2), 0);
  for (const at of [0, 0.07, 0.15, 0.26]) mix(o, hp(nburst(0.12, 331 + at * 100, 0.02, 1.2), 900), at);
  mix(o, bp(nburst(0.7, 340, 0.2, 1.2), 400, 1), 0.02);
  mix(o, bp(nburst(0.3, 341, 0.08, 0.7), 650, 3), 0.35); // falling planks
  mix(o, thud(0.3, 70, 40, 0.08, 0.8), 0.5);
  return o;
});

// ================= M2 stage 1: quiet, creepy, diegetic =================
def('amb_wind', 'Ambience bed A: wind through broken windows + building creaks. Loop from first tap on the game scene; quiet', 0.22, () => {
  const L = 30, fade = 3, total = L + fade;
  const low = seamless(lp(noise(Math.round(total * SR), 401), 320, 0.7), fade);
  const whA = seamless(bp(noise(Math.round(total * SR), 402), 540, 9), fade);
  const whB = seamless(bp(noise(Math.round(total * SR), 403), 910, 9), fade);
  const o = buf(L);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, u = TAU * t / L;
    const gust = 0.45 + 0.3 * Math.sin(3 * u + 1) + 0.25 * Math.sin(5 * u + 2);
    const ga = Math.max(0, Math.sin(4 * u + 0.5)) ** 2, gb = Math.max(0, Math.sin(7 * u + 2.2)) ** 2;
    o[i] = low[i] * 5 * gust * gust + (whA[i] * ga + whB[i] * gb) * 0.9;
  }
  [[4.5, 401, 1.2, 70, 95, 6], [12, 402, 0.9, 120, 150, 9], [18.5, 403, 1.4, 60, 85, 5], [25, 404, 1.0, 95, 70, 8]]
    .forEach(([at, sd, d, f0, f1, pu]) => mix(o, creakSound(sd, d, f0, f1, pu, 380), at, 0.5));
  return o;
}, { loop: true, noFade: true, norm: 0.7 });

def('amb_room_tone', 'Ambience bed B: very quiet room tone (hum + air). Loop under everything, even quieter indoors', 0.1, () => {
  const L = 10, fade = 2;
  const air = seamless(lp(noise(Math.round((L + fade) * SR), 411), 220, 0.7), fade);
  const hiss = seamless(hp(lp(noise(Math.round((L + fade) * SR), 412), 3000), 1200), fade);
  const o = buf(L);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR;
    o[i] = air[i] * 4 * (0.7 + 0.3 * Math.sin(TAU * t / L)) + hiss[i] * 0.5 + Math.sin(TAU * 50 * t) * 0.05 + Math.sin(TAU * 100 * t) * 0.02;
  }
  return o;
}, { loop: true, noFade: true, norm: 0.5 });

const distantGroan = (seed, f0, dur, f1, f2, cut) => {
  const g = drive(groan(seed, f0, f1, f2, dur, 3), 1.2);
  const o = reverb(lp(lp(g, cut), cut), 2.2, 1.6, 0.88, 1.4);
  return gen(o.length / SR, (t, i) => o[i] * att(t, 0.15));
};
def('distant_groan_1', 'Random far-away groan, 45-120 s apart; also the cue hiding place. Pick randomly of 1..4', 0.3, () => distantGroan(501, 85, 1.9, 420, 720, 600), { norm: 0.7 });
def('distant_groan_2', 'Random far-away groan (lower, long)', 0.3, () => distantGroan(502, 62, 2.4, 380, 650, 520), { norm: 0.7 });
def('distant_groan_3', 'Random far-away groan (higher, shorter)', 0.28, () => distantGroan(503, 110, 1.5, 480, 800, 650), { norm: 0.7 });
def('distant_groan_4', 'Random far-away groan (two-part moan)', 0.3, () => {
  const a = distantGroan(504, 90, 1.2, 440, 760, 560), b = distantGroan(505, 72, 1.8, 400, 700, 520), o = buf(4.8);
  mix(o, a, 0); mix(o, b, 1.3, 0.9); return o;
}, { norm: 0.7 });

const stairHit = (seed, g = 1) => {
  const o = buf(0.5);
  mix(o, thud(0.5, 70, 36, 0.09, 1.2 * g), 0);
  mix(o, lp(nburst(0.3, seed, 0.06, 1.2 * g), 380), 0);
  mix(o, bp(nburst(0.15, seed + 1, 0.04, 0.5 * g), 260, 2), 0.02); // door/barricade rattle
  return lp(o, 450);
};
def('stair_bang_1', 'Attack cue (T-8 s): single heavy muffled bang from the stairwell below', 0.5, () => {
  const o = buf(2.4); mix(o, stairHit(511), 0); return reverb(o, 0.8, 1.0, 0.8, 1.0);
}, { norm: 0.75 });
def('stair_bang_2', 'Attack cue: two bangs, slightly uneven', 0.5, () => {
  const o = buf(2.4); mix(o, stairHit(512), 0); mix(o, stairHit(513, 0.8), 0.78); return reverb(o, 0.8, 1.0, 0.8, 1.0);
}, { norm: 0.75 });
def('stair_bang_3', 'Attack cue: three bangs, building', 0.5, () => {
  const o = buf(3.2); mix(o, stairHit(514, 0.7), 0); mix(o, stairHit(515, 0.9), 0.62); mix(o, stairHit(516, 1.1), 1.3);
  return reverb(o, 0.8, 1.0, 0.8, 1.0);
}, { norm: 0.75 });

def('stair_shuffle', 'Loop: shuffling feet in the stairwell, muffled. Fade in with the attack cue, fade out when it ends', 0.3, () => {
  const L = 6, r = rng(521), o = buf(L + 1);
  for (let k = 0; k < 14; k++) {
    const at = k * (L / 14) + r() * 0.15;
    const sc = lp(cloth(530 + k, 0.2 + r() * 0.15, 300, 1000, 1), 900);
    mix(o, sc, at, 0.6 + r() * 0.4);
    if (r() < 0.4) mix(o, thud(0.12, 80, 55, 0.04, 0.4), at + 0.1);
  }
  return wrapFold(lp(o, 1200), L);
}, { loop: true, noFade: true, norm: 0.6 });

def('creak_1', 'Random ambient one-shot: floorboard creak (20-60 s gaps)', 0.3, () => creakSound(541, 1.0, 130, 175, 26, 700), { norm: 0.6 });
def('creak_2', 'Random ambient one-shot: slow door hinge creak', 0.3, () => reverb(creakSound(542, 1.6, 240, 520, 18, 1100), 0.8, 0.8), { norm: 0.6 });
def('creak_3', 'Random ambient one-shot: short wood settling', 0.3, () => creakSound(543, 0.55, 90, 140, 34, 500), { norm: 0.6 });

def('muffled_thud_1', 'Random ambient one-shot: distant thud from another floor', 0.4, () => reverb(lp(mix(thud(0.5, 75, 38, 0.1, 1.2), nburst(0.3, 551, 0.05, 0.8), 0), 300), 1.2, 1.0, 0.82), { norm: 0.7 });
def('muffled_thud_2', 'Random ambient one-shot: double thump far off', 0.4, () => {
  const o = buf(1.2); mix(o, thud(0.4, 90, 40, 0.08, 1), 0); mix(o, thud(0.4, 70, 36, 0.09, 0.7), 0.42);
  return reverb(lp(o, 280), 1.2, 1.0, 0.82);
}, { norm: 0.7 });

def('glass_tinkle', 'Random ambient one-shot: small glass pieces falling somewhere', 0.25, () => {
  const o = buf(1.4), r = rng(561);
  for (let k = 0; k < 7; k++) {
    const f = 3000 + r() * 3500, at = r() * 0.5 * (k / 7 + 0.3) + k * 0.05;
    mix(o, osc(0.3, () => f, sine, (t) => 0.4 * exp(t, 0.05) * att(t, 0.002)), at, 0.4 + r() * 0.6);
  }
  return reverb(lp(o, 6000), 1.0, 0.9);
}, { norm: 0.5 });

def('heartbeat_soft', 'Low-health loop: soft heartbeat felt more than heard (replaces heartbeat)', 0.3, () => {
  const o = buf(1.1);
  mix(o, thud(0.3, 55, 38, 0.07, 1), 0); mix(o, thud(0.3, 48, 34, 0.08, 0.6), 0.26);
  return lp(o, 140);
}, { loop: true, noFade: true, norm: 0.6 });

// Three short sparse melancholic pieces (one-shot, not looped). Timbres: piano, cello-ish, guitar-ish.
const hzOf = (m) => 440 * Math.pow(2, (m - 69) / 12);
function musicPiece(seed, bpm, bars, timbre, chords, melody, arp) {
  const beat = 60 / bpm, r = rng(seed), L = bars * 4 * beat, o = buf(L + 5);
  const note = (m, at, g, dec = 1) => {
    const f = hzOf(m), s0 = Math.round(at * SR);
    if (timbre === 'cello') {
      const dur = 3.2 * dec; let ph = 0;
      for (let i = 0; i < dur * SR && s0 + i < o.length; i++) {
        const t = i / SR; ph += f * (1 + 0.004 * Math.sin(TAU * 5 * t) * Math.min(1, t / 0.6)) / SR;
        o[s0 + i] += (saw(ph) * 0.6 + Math.sin(TAU * ph) * 0.4) * g * 0.5 * Math.min(1, t / 0.35) * Math.exp(-Math.max(0, t - 0.5) / (1.2 * dec));
      }
      return;
    }
    const guitar = timbre === 'guitar', d = (guitar ? 0.7 : 1.8) * dec * Math.pow(220 / f, 0.35);
    for (const det of guitar ? [1] : [1, 1.003]) for (let k = 1; k <= (guitar ? 8 : 6); k++) {
      const fk = f * k * Math.sqrt(1 + 0.0004 * k * k) * det;
      if (fk > 5000) break;
      const dk = d / (1 + (guitar ? 0.9 : 0.6) * (k - 1)), amp = g / Math.pow(k, guitar ? 1.0 : 1.25) * 0.5;
      const n = Math.round(Math.min(6, dk * 6) * SR);
      for (let i = 0; i < n && s0 + i < o.length; i++) { const t = i / SR; o[s0 + i] += Math.sin(TAU * fk * t) * amp * Math.exp(-t / dk) * Math.min(1, t / (guitar ? 0.002 : 0.006)); }
    }
    mix(o, lp(nburst(0.03, Math.round(m * 7), 0.006, 0.05 * g), 1500), at);
  };
  chords.forEach((c, ci) => {
    const t0 = ci * 2 * 4 * beat;
    note(c[0], t0 + (r() - 0.5) * 0.04, 0.9, 1.5);
    note(c[1], t0 + 4 * beat, 0.6, 1.5);
    for (const [bt, idx, g] of arp) note(c[idx], t0 + bt * beat + r() * 0.05, g);
  });
  melody.forEach(([b, bt, m, g = 0.75]) => note(m, (b * 4 + bt) * beat + (r() - 0.5) * 0.06, g, 1.3));
  const w = reverb(lp(o, timbre === 'guitar' ? 3000 : 3500), 3, 1.3, 0.86, 1.3);
  const e = Math.round(0.4 * SR); for (let i = 0; i < e; i++) w[w.length - 1 - i] *= i / e;
  return w;
}
const MUSIC_EVT = 'Sparse sad piece, one-shot; at most once per 8-12 min on moments (first claim, after attack ends, survivor joins). Never in danger';
def('music_sad_1', MUSIC_EVT + '. Piano, A minor, ~55 s', 0.22, () => musicPiece(571, 52, 12, 'piano',
  [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59], [41, 48, 53, 57], [45, 52, 57, 60]],
  [[0, 2, 76], [1, 1, 72], [2, 2, 69], [3, 0, 72], [4, 2, 71], [5, 1, 67], [6, 2, 72], [7, 1, 71], [8, 2, 69], [9, 1, 65], [10, 2, 72], [11, 1.5, 69, 0.6]],
  [[1.5, 2, 0.35], [2.5, 3, 0.3]]), { norm: 0.7 });
def('music_sad_2', MUSIC_EVT + '. Cello-like, D minor, ~42 s', 0.2, () => musicPiece(581, 46, 8, 'cello',
  [[38, 45, 50, 53], [34, 41, 46, 50], [43, 50, 55, 58], [33, 40, 45, 49]],
  [[0, 0.5, 62, 0.8], [1, 2, 65, 0.8], [2, 0.5, 62, 0.8], [3, 2, 58, 0.8], [4, 0.5, 67, 0.8], [5, 2, 65, 0.8], [6, 0.5, 64, 0.8], [7, 2, 61, 0.7]],
  []), { norm: 0.7 });
def('music_sad_3', MUSIC_EVT + '. Soft fingerpicked guitar-like, E minor, ~32 s', 0.2, () => musicPiece(591, 60, 8, 'guitar',
  [[40, 47, 52, 55], [36, 43, 48, 52], [43, 50, 55, 59], [38, 45, 50, 54]],
  [[0, 3, 71, 0.5], [2, 3, 72, 0.5], [4, 3, 74, 0.5], [6, 3, 69, 0.5], [7, 2, 66, 0.5]],
  [[1, 2, 0.4], [2, 3, 0.4], [3, 2, 0.4], [4, 1, 0.35], [5, 2, 0.4], [6, 3, 0.4], [7, 2, 0.35]]), { norm: 0.7 });

// ================= M2 stage 1b: remaining GDD 10 sounds =================
def('amb_rain', 'Ambience bed C: soft rain on windows. Loop; louder near windows, off/very low in sealed rooms', 0.18, () => {
  const L = 20, fade = 2, N = Math.round((L + fade) * SR);
  const a = seamless(hp(lp(noise(N, 601), 4500), 700), fade), b = seamless(lp(noise(N, 602), 900, 0.7), fade);
  const r = rng(603), o = buf(L);
  for (let i = 0; i < o.length; i++) o[i] = a[i] * (0.8 + 0.2 * Math.sin(TAU * 3 * i / SR / L)) + b[i] * 0.8;
  for (let k = 0; k < 110; k++) mix(o, osc(0.02, () => 2500 + r() * 2500, sine, (t) => 0.05 * exp(t, 0.004)), r() * (L - 0.05)); // pane ticks
  return o;
}, { loop: true, noFade: true, norm: 0.6 });

def('pipe_knock_1', 'Random ambient one-shot: pipe knocks twice', 0.3, () => {
  const o = buf(1.2);
  [0, 0.26].forEach((at, k) => { mix(o, osc(0.4, () => 410 - k * 30, sine, (t) => 0.8 * exp(t, 0.09)), at); mix(o, osc(0.3, () => 1130, sine, (t) => 0.3 * exp(t, 0.05)), at); mix(o, hp(nburst(0.03, 611 + k, 0.005, 0.8), 1500), at); });
  return reverb(o, 0.8, 0.7);
}, { norm: 0.6 });
def('pipe_knock_2', 'Random ambient one-shot: pipe tick-tick-knock (cooling metal)', 0.3, () => {
  const o = buf(1.4);
  [[0, 0.5, 520], [0.13, 0.4, 560], [0.7, 0.9, 340]].forEach(([at, g, f], k) => { mix(o, osc(0.5, () => f, sine, (t) => g * exp(t, 0.1)), at); mix(o, osc(0.3, () => f * 2.76, sine, (t) => g * 0.3 * exp(t, 0.04)), at); });
  return reverb(o, 0.8, 0.7);
}, { norm: 0.6 });

def('lamp_hiss', 'Oil lamp lit: quiet loop of wick hiss + faint flame flutter; stop when lamp out', 0.1, () => {
  const L = 6, fade = 1, N = Math.round((L + fade) * SR);
  const h = seamless(hp(lp(noise(N, 621), 6000), 2500), fade), f = seamless(lp(noise(N, 622), 500, 0.7), fade), o = buf(L);
  for (let i = 0; i < o.length; i++) o[i] = h[i] * (0.7 + 0.3 * Math.sin(TAU * 4 * i / SR / L * 1)) + f[i] * 1.5 * (0.5 + 0.5 * Math.sin(TAU * 3 * i / SR / L));
  return o;
}, { loop: true, noFade: true, norm: 0.5 });

const breathy = (seed, dur, pitch) => lp(voice(dur, (t) => pitch * (1 - 0.15 * t / dur), (t) => Math.sin(Math.PI * t / dur) ** 1.5 * 0.9, 500, 900, seed, 1.2, 0.6), 1400);
def('zombie_breath_1', 'Near zombie (within ~600 px, same floor): wet low exhale. Pan by position, volume by distance', 0.3, () => reverb(breathy(631, 1.3, 70), 0.5, 0.4), { norm: 0.65 });
def('zombie_breath_2', 'Near zombie: slower rattling breath in then out', 0.3, () => {
  const o = buf(2.4); mix(o, breathy(632, 0.9, 60), 0, 0.7); mix(o, breathy(633, 1.2, 75), 1.1); return reverb(o, 0.5, 0.4);
}, { norm: 0.65 });
def('zombie_shuffle', 'Near zombie: dragging shuffle, 2 steps. Play while it moves; pan by position', 0.3, () => {
  const o = buf(1.4);
  [0.05, 0.7].forEach((at, k) => { mix(o, lp(cloth(641 + k, 0.45, 200, 900, 1), 900), at); mix(o, thud(0.15, 75, 50, 0.05, 0.5), at + 0.3); });
  return o;
}, { norm: 0.6 });

// Moodle cues (GDD 5.2): one soft physical sound per moodle appearing
def('moodle_stomach', 'Hungry moodle appears: stomach growl', 0.25, () => lp(voice(1.0, (t) => 55 + 25 * Math.sin(TAU * 2.2 * t), (t) => Math.sin(Math.PI * t) * (0.6 + 0.4 * Math.sin(TAU * 6 * t)), 300, 520, 651, 0.8, 0.9), 700), { norm: 0.6 });
def('moodle_swallow', 'Thirsty moodle appears: dry swallow', 0.25, () => lp(cloth(652, 0.12, 400, 1200, 0.8), 1500), { norm: 0.5 });
def('moodle_yawn', 'Tired moodle appears: yawn', 0.25, () => lp(voice(1.4, (t) => 150 * (1 + 0.2 * Math.sin(Math.PI * t / 1.4)) - 40 * t, (t) => Math.sin(Math.PI * t / 1.4) ** 1.2, 600, 1000, 653, 0.7, 0.2), 1800), { norm: 0.6 });
def('moodle_pain', 'Injured moodle appears: pained breath through teeth', 0.25, () => hp(lp(cloth(654, 0.5, 1500, 4000, 1.2), 4500), 900), { norm: 0.5 });
def('moodle_sigh', 'Low-spirits moodle appears: sigh', 0.25, () => lp(voice(1.2, (t) => 130 - 30 * t, (t) => att(t, 0.25) * exp(Math.max(0, t - 0.3), 0.4), 500, 900, 655, 1.0, 0.1), 1500), { norm: 0.55 });
// fast-heartbeat cue: reuse heartbeat_soft with playbackRate ~1.5 for a few seconds.

def('moodle_panic', 'Panic moodle appears: quiet fast heartbeat, ~2 s one-shot', 0.25, () => {
  const o = buf(2.2);
  for (let k = 0; k < 5; k++) { const at = 0.05 + k * 0.4; mix(o, thud(0.25, 58, 40, 0.06, 1), at); mix(o, thud(0.25, 50, 36, 0.07, 0.6), at + 0.17); }
  return lp(o, 150);
}, { norm: 0.6 });

// ================= Weapon-specific hit sounds (realistic, wet, physical) =================
/** Wet squelch: band-passed noise with a moving centre and bubbly amplitude flutter. */
function squelch(seed, dur, f0, f1, flutter, g = 1) {
  const r = rng(seed), n = noise(Math.round(dur * SR), seed + 7), o = buf(dur);
  let y1 = 0, y2 = 0, ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, k = t / dur;
    ph += (flutter * (1 + 0.4 * (r() - 0.5))) / SR;
    const fc = lerp(f0, f1, k), w = TAU * fc / SR, c = Math.cos(w), al = Math.sin(w) / (2 * 3);
    const y = (al * n[i] - (-2 * c) * y1 - (1 - al) * y2) / (1 + al); // bandpass, q=3
    y2 = y1; y1 = y;
    o[i] = y * (0.35 + 0.65 * Math.max(0, Math.sin(TAU * ph)) ** 2) * exp(t, dur * 0.4) * att(t, 0.004) * g;
  }
  return o;
}
const stab = (seed, sq0, sq1, flut, thudF) => {
  const o = buf(0.32);
  mix(o, hp(nburst(0.02, seed, 0.003, 1.3), 1800), 0);            // sharp puncture tick
  mix(o, bp(nburst(0.05, seed + 1, 0.01, 1.0), 1100, 1.2), 0, 0.8); // skin/cloth tear
  mix(o, thud(0.15, thudF, thudF * 0.6, 0.035, 0.6), 0.004);      // body mass
  mix(o, squelch(seed + 2, 0.24, sq0, sq1, flut, 3.2), 0.025);    // wet squelch
  return lp(o, 4500);
};
def('hit_stab_1', 'Stab weapon (kitchen knife, pipe spear) hits a zombie: puncture + wet squelch. Pick randomly of 1..3', 0.55, () => stab(701, 380, 900, 38, 150), { norm: 0.7 });
def('hit_stab_2', 'Stab weapon hit (variation, deeper squelch)', 0.55, () => stab(711, 300, 750, 30, 125), { norm: 0.7 });
def('hit_stab_3', 'Stab weapon hit (variation, shorter and brighter)', 0.55, () => stab(721, 500, 1200, 46, 170), { norm: 0.7 });

const blunt = (seed, f0, crackF, wetF) => {
  const o = buf(0.4);
  mix(o, thud(0.4, f0, f0 * 0.42, 0.09, 1.2), 0);                      // heavy thud
  mix(o, lp(nburst(0.2, seed, 0.04, 1.2), 700), 0);                    // flesh slap
  mix(o, bp(nburst(0.07, seed + 1, 0.012, 1.1), crackF, 2.2), 0.004, 0.7); // dull crack (bone/wood)
  mix(o, squelch(seed + 2, 0.18, wetF, wetF * 1.8, 28, 1.6), 0.03);   // wet aftermath
  return lp(o, 3500);
};
def('hit_blunt_1', 'Blunt weapon (spiked bat, lead pipe, crowbar) hits a zombie: heavy wet thud + dull crack. Pick randomly of 1..3', 0.6, () => blunt(731, 105, 1500, 350), { norm: 0.75 });
def('hit_blunt_2', 'Blunt weapon hit (variation, deeper)', 0.6, () => blunt(741, 85, 1100, 300), { norm: 0.75 });
def('hit_blunt_3', 'Blunt weapon hit (variation, sharper crack)', 0.6, () => blunt(751, 120, 1900, 420), { norm: 0.75 });

const punch = (seed, f0) => {
  const o = buf(0.2);
  mix(o, thud(0.2, f0, f0 * 0.5, 0.04, 1), 0);
  mix(o, lp(nburst(0.12, seed, 0.025, 1.2), 900), 0);
  mix(o, squelch(seed + 2, 0.08, 400, 700, 40, 0.6), 0.01);
  return lp(o, 2200);
};
def('hit_punch_1', 'Fists hit a zombie: dull fleshy punch. Pick randomly of 1..2', 0.55, () => punch(761, 130), { norm: 0.7 });
def('hit_punch_2', 'Fists hit (variation)', 0.55, () => punch(771, 110), { norm: 0.7 });

def('blood_drip', 'Quiet one-shot: a few blood drips on the floor after a hit/kill; very subtle', 0.3, () => {
  const o = buf(1.3), r = rng(781);
  [[0, 1], [0.38, 0.6], [0.95, 0.35]].forEach(([at, g], k) => {
    const f = 700 + r() * 250;
    mix(o, osc(0.12, (t) => f * (1 + 1.8 * Math.min(1, t / 0.03)), sine, (t) => exp(t, 0.025) * att(t, 0.002)), at, g);
    mix(o, lp(nburst(0.03, 790 + k, 0.006, 0.4), 2500), at, g);
  });
  return reverb(lp(o, 3500), 0.6, 0.8, 0.8, 0.8);
}, { norm: 0.5 });

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
  if (d.deprecated) { rmSync(join(OUT, key + '.ogg'), { force: true }); continue; } // deprecated sounds are not shipped
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
  manifest.sounds[key] = { files: [key + '.ogg'], volume: d.volume, loop: d.loop, duration: +(x.length / SR).toFixed(2), event: d.event, ...(d.deprecated ? { deprecated: true, deprecatedReason: d.deprecated } : {}) };
}
rmSync(join(OUT, 'music_sad.ogg'), { force: true });
rmSync(tmp, { recursive: true, force: true });
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`audio: ${Object.keys(manifest.sounds).length} sounds -> ${OUT} (ogg)`);
