// In-house audio for Floor 15: ONLY the keys that have no suitable real recording yet (see "stillSynthesised" in
// scripts/audio-sources.json: the music pieces and moodle_stomach). Every other key is a processed CC0 recording built
// by scripts/fetch-audio.mjs (npm run audio:fetch). Run: npm run audio. Deterministic (seeded). Writes mono 22.05 kHz OGG to public/assets/audio/, plus
// manifest.json and the generated table in CREDITS.md. Requires ffmpeg with libvorbis.
//
// Direction (GDD 10): natural sounds only, no continuous tonal bed, nothing arcade-like. Everything here is
// noise / impact-excited resonators, stick-slip friction, grains, bubbles and noise-driven vocal tract.
// Keys that audio-sources.json marks "fetched" (real recordings) are NOT regenerated.
import { writeFileSync, readFileSync, mkdirSync, rmSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SR, TAU, rng, buf, noise, lerp, clamp, peak, gen, mix, layer, scale, fitTo, lp, hp, bp, svf, resonate, modal,
  click, knock, rustle, bubble, periodicSlow, slowNoise, tile3, mid3, wrapFold, room, voice,
} from './audio-dsp.mjs';
import { musicPiece } from './audio-music.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'audio');
mkdirSync(OUT, { recursive: true });

const exp = (t, d) => Math.exp(-t / d);
const bell = (k, p = 1) => Math.pow(Math.sin(Math.PI * clamp(k, 0, 1)), p);
const att = (t, a) => Math.min(1, t / a);
const sig = (v) => 1 / (1 + Math.exp(-v));

// ---------- legacy primitives (kept for the weapon hit sounds, which the CD kept as they are) ----------
const osc = (sec, f, shape, amp) => { let ph = 0; return gen(sec, (t) => { ph += f(t) / SR; return shape(ph) * amp(t); }); };
const sine = (ph) => Math.sin(TAU * ph);
const thud = (sec, f0, f1, d, g = 1) => osc(sec, (t) => lerp(f0, f1, Math.min(1, t / d)), sine, (t) => g * exp(t, d) * att(t, 0.002));
const nburst = (sec, seed, d, g = 1) => { const n = noise(Math.round(sec * SR), seed); return gen(sec, (t, i) => n[i] * exp(t, d) * g * att(t, 0.001)); };
function squelch(seed, dur, f0, f1, flutter, g = 1) {
  const r = rng(seed), n = noise(Math.round(dur * SR), seed + 7), o = buf(dur);
  let y1 = 0, y2 = 0, ph = 0;
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, k = t / dur; ph += (flutter * (1 + 0.4 * (r() - 0.5))) / SR;
    const fc = lerp(f0, f1, k), w = TAU * fc / SR, c = Math.cos(w), al = Math.sin(w) / (2 * 3);
    const y = (al * n[i] - (-2 * c) * y1 - (1 - al) * y2) / (1 + al); y2 = y1; y1 = y;
    o[i] = y * (0.35 + 0.65 * Math.max(0, Math.sin(TAU * ph)) ** 2) * exp(t, dur * 0.4) * att(t, 0.004) * g;
  }
  return o;
}

// ---------- physical-ish building blocks ----------
/** Stick-slip friction (creaks, squeaks, drawers): irregular pops ringing a resonant body. bodies: [[f, tau, g]] */
function stickSlip(seed, dur, { r0, r1, bodies, jit = 0.55, drop = 0.15, fric = 0.05, total, shape = 1.2 }) {
  const r = rng(seed), o = buf(total || dur + 0.3), exc = new Float32Array(o.length), wob = slowNoise(dur + 0.2, seed + 3, 2.5);
  let t = 0;
  while (t < dur) {
    const k = t / dur, rate = lerp(r0, r1, k) * clamp(1 + 0.22 * wob[Math.floor(t * SR)], 0.5, 1.6), e = bell(k, shape), i = Math.floor(t * SR);
    if (r() > drop && i + 1 < exc.length) { const a = (0.3 + 0.7 * r()) * e; exc[i] += a; exc[i + 1] -= a * 0.6; }
    t += (1 / rate) * (1 + jit * (r() * 2 - 1));
  }
  const fr = noise(exc.length, seed + 4);
  for (let i = 0; i < exc.length; i++) exc[i] += fr[i] * fric * bell(i / SR / dur, shape) * (i / SR < dur ? 1 : 0);
  return modal(exc, bodies);
}
const HINGE = [[620, 0.03, 1], [1250, 0.02, 0.7], [2100, 0.012, 0.45], [330, 0.04, 0.5]];
const BOARD = [[140, 0.05, 1], [310, 0.03, 0.8], [720, 0.02, 0.5], [1500, 0.012, 0.25]];
const jit = (r, v, s = 0.1) => v * (1 + (r() * 2 - 1) * s);

const latch = (seed, g = 1) => knock(seed, 0.2, 0.3, 6000, [[2400, 0.012, 0.5], [3700, 0.008, 0.35], [900, 0.02, 0.4], [5200, 0.005, 0.2]], 0.8).map((v) => v * g);
const woodHit = (seed, f0 = 150, total = 0.6, hard = 1) => { const r = rng(seed); return knock(seed, total, 0.6 + 0.8 / hard, 2600 * hard, [[jit(r, f0), 0.07, 1], [jit(r, f0 * 2.1), 0.04, 0.55], [jit(r, f0 * 3.7), 0.025, 0.3], [f0 * 0.55, 0.09, 0.6]], 0.3); };
const pipeHit = (seed, f0, total = 1.0, g = 1) => { const r = rng(seed); return knock(seed, total, 0.5, 5500, [[jit(r, f0), 0.4, 1], [jit(r, f0 * 2.76), 0.22, 0.5], [jit(r, f0 * 5.4), 0.12, 0.3], [jit(r, f0 * 8.9), 0.06, 0.15], [f0 * 0.5, 0.08, 0.4]], 0.15).map((v) => v * g); };

// footsteps by surface: soft heel strike then toe, each a gentle impact on a floor.
// Phone speakers cannot reproduce < ~120 Hz; the old version put 70-100% of the energy below 250 Hz at near full
// scale, which rattled/buzzed ("distorted") on a phone. Now: body modes sit at 140-600 Hz with short (0.01 s) decays so they thud instead of ringing, contact noise is
// low-passed and quiet, everything is high-passed at 110 Hz, and files peak at -6 dBFS.
function footstepDry(surface, seed) {
  const r = rng(seed), j = (v, s = 0.08) => jit(r, v, s), T = 0.35;
  let heel, toe, tail = 0.1;
  if (surface === 'wood') {
    heel = knock(seed, T, 1.5, 2000, [[j(190, 0.15), 0.012, 1], [j(330, 0.15), 0.01, 0.6], [j(560, 0.15), 0.008, 0.35], [j(900, 0.15), 0.006, 0.15]], 0.15);
    toe = knock(seed + 1, T, 1.2, 2200, [[j(260, 0.15), 0.012, 0.7], [j(480, 0.15), 0.008, 0.4], [j(800, 0.15), 0.006, 0.2]], 0.15);
  } else if (surface === 'tile') {
    heel = knock(seed, T, 0.8, 4500, [[j(230, 0.3), 0.008, 0.15], [j(1500, 0.15), 0.006, 0.35], [j(2600, 0.15), 0.004, 0.2], [j(3800, 0.15), 0.003, 0.1]], 0.2);
    toe = knock(seed + 1, T, 0.6, 4500, [[j(1400, 0.15), 0.005, 0.3], [j(2400, 0.15), 0.004, 0.2], [j(200, 0.3), 0.008, 0.1]], 0.2); tail = 0.085;
  } else if (surface === 'carpet') {
    heel = knock(seed, T, 3.0, 900, [[j(150, 0.25), 0.01, 1], [j(260, 0.25), 0.008, 0.4]], 0.25);
    mix(heel, rustle(0.1, seed + 2, { rate: 600, env: (t) => exp(t, 0.04), lo: 400, hi: 2200, grain: 0.003 }), 0.0, 0.15);
    toe = knock(seed + 1, T, 2.5, 800, [[j(170, 0.15), 0.012, 0.8]], 0.25); tail = 0.12;
  } else { // concrete
    heel = knock(seed, T, 1.2, 3500, [[j(170, 0.15), 0.012, 0.6], [j(320, 0.15), 0.01, 0.4], [j(1800, 0.3), 0.003, 0.1]], 0.25);
    mix(heel, rustle(0.08, seed + 2, { rate: 700, env: (t) => exp(t, 0.03), lo: 1200, hi: 4500, grain: 0.0015 }), 0.012, 0.15);
    toe = knock(seed + 1, T, 1.2, 3200, [[j(190, 0.15), 0.012, 0.5], [j(2000, 0.3), 0.003, 0.08]], 0.25);
    mix(toe, rustle(0.05, seed + 3, { rate: 600, env: (t) => exp(t, 0.025), lo: 1500, hi: 4500, grain: 0.0015 }), 0.0, 0.1);
  }
  // heel is the loud part, toe a softer follow-up; no raw white-noise spikes, then a 110 Hz high-pass
  return hp(layer(T, [[heel, 0, 1], [toe, tail + r() * 0.02, 0.45]]), 110, 0.7);
}
// short, mostly dry rooms: long tails made consecutive steps overlap and smear
const ROOMS = { wood: [0.25, 0.15, 0.3], tile: [0.4, 0.25, 0.6], carpet: [0.12, 0.05, 0.1], concrete: [0.5, 0.25, 0.4] };
const footstep = (surface, seed) => room(footstepDry(surface, seed), ...ROOMS[surface], seed);

// glass: contact crack plus a shower of tiny ringing shards (decaying density)
function glassShards(seed, dur, count, fLo, fHi, tauLo, tauHi, g = 1) {
  const r = rng(seed), o = buf(dur + 0.2);
  for (let k = 0; k < count; k++) {
    const at = -Math.log(1 - r() * 0.98) * dur * 0.3, f = fLo + (fHi - fLo) * r(), tau = tauLo + (tauHi - tauLo) * r(), a = Math.pow(r(), 1.8) * g;
    const n = Math.round(Math.min(0.3, tau * 5) * SR), s0 = Math.round(at * SR); let ph = r() * TAU;
    for (let i = 0; i < n && s0 + i < o.length; i++) { ph += TAU * f * (1 + 0.003 * Math.sin(i * 0.01)) / SR; o[s0 + i] += Math.sin(ph) * a * Math.exp(-i / SR / tau) * Math.min(1, i / 20); }
  }
  return o;
}

// breath / sigh helper (no pitch)
const swallow = (seed, g = 1) => {
  const N = Math.round(0.2 * SR), n = noise(N, seed);
  return layer(0.25, [[svf(n, (i) => lerp(750, 170, i / N), 2.2, 'lp').map((v, i) => v * bell(i / N, 0.9) * 1.5), 0, g], [bubble(280, 0.03, 0.18, 0.8), 0.05, g]]);
};

// ---------- sound registry ----------
const S = {};
const def = (key, event, volume, fn, opts = {}) => { S[key] = { event, volume, loop: false, fn, ...opts }; };

// ---- UI ----
def('ui_tap', 'Panel open / button tap: a faint paper rustle (GDD 10: very quiet, uiVolume 0.2)', 0.14, () =>
  rustle(0.12, 1, { rate: 1100, env: (t) => bell(t / 0.12, 1.4), lo: 1400, hi: 7000, grain: 0.002 }), { norm: 0.5 });

// Per-file volumes: files are peak-normalised at 0.5, but a phone only plays ~300 Hz-6 kHz, so volume is set per file
// so that the loudness in that band matches the pre-fix recordings (carpet quietest, tile ~ wood, concrete in between).
// Re-measure with: python3 scripts/check-audio.py <keys>  (band column) after changing any footstep recipe.
const FOOT_VOL = {"footstep_wood_1": 0.804, "footstep_wood_2": 0.511, "footstep_wood_3": 0.365, "footstep_tile_1": 0.549, "footstep_tile_2": 0.6, "footstep_tile_3": 0.611, "footstep_carpet_1": 0.129, "footstep_carpet_2": 0.107, "footstep_carpet_3": 0.107, "footstep_concrete_1": 0.457, "footstep_concrete_2": 0.362, "footstep_concrete_3": 0.31, "step_1": 0.408, "step_2": 0.83, "stairs": 0.409};
// ---- footsteps: footstep_<surface>_1..3 (GDD footstepSurfaceByRoom); step_1/step_2 = legacy wood keys ----
for (const [surface, seed0] of [['wood', 1100], ['tile', 1200], ['carpet', 1300], ['concrete', 1400]])
  for (let v = 1; v <= 3; v++)
    def(`footstep_${surface}_${v}`, `Hero footstep on ${surface} (3 variations, pick at random, pitch x0.95-1.05)`, FOOT_VOL[`footstep_${surface}_${v}`], () => footstep(surface, seed0 + v * 7), { norm: 0.5, surface });
def('step_1', 'Legacy hero step (wood); use footstep_<surface>_N', FOOT_VOL.step_1, () => footstep('wood', 11), { norm: 0.5 });
def('step_2', 'Legacy hero step (wood); use footstep_<surface>_N', FOOT_VOL.step_2, () => footstep('wood', 12), { norm: 0.5 });

def('stairs', 'Hero changes floor via stairs (five steps, concrete stairwell)', FOOT_VOL.stairs, () => {
  const o = buf(1.0);
  for (let k = 0; k < 5; k++) mix(o, footstepDry('concrete', 20 + k), 0.04 + k * 0.19 + (k % 2) * 0.012, 0.9 - k * 0.03);
  return room(o, 0.6, 0.3, 0.4, 21);
}, { norm: 0.5 });

// ---- doors ----
def('door_open', 'Door opens (floor door or apartment): latch, hinge creak, soft stop', 0.5, () =>
  room(layer(1.5, [[latch(101, 0.7), 0, 1], [stickSlip(102, 0.85, { r0: 65, r1: 150, bodies: HINGE, total: 1.0 }), 0.08, 0.9], [woodHit(103, 120, 0.5, 0.5), 1.0, 0.35]]), 0.5, 0.25, 0.4, 5), { norm: 0.7 });
def('door_close', 'Door closes: short hinge creak, wooden clack and latch', 0.5, () =>
  room(layer(1.4, [[stickSlip(111, 0.55, { r0: 140, r1: 75, bodies: HINGE, total: 0.7 }), 0, 0.8], [woodHit(112, 130, 0.6, 0.9), 0.55, 0.9], [latch(113, 0.8), 0.585, 1]]), 0.5, 0.3, 0.4, 6), { norm: 0.75 });
def('door_creak', 'Door hinge creaking on its own or while held ajar (slow, long)', 0.4, () =>
  room(stickSlip(121, 1.7, { r0: 38, r1: 95, bodies: [[540, 0.04, 1], [1100, 0.025, 0.7], [1900, 0.015, 0.4], [300, 0.05, 0.5]], jit: 0.6, drop: 0.2, total: 2.0 }), 0.9, 0.3, 0.3, 7), { norm: 0.6 });
def('door_hit', 'Jammed or locked door hit / zombie pounds a door', 0.7, () =>
  room(layer(0.8, [[woodHit(131, 85, 0.8, 0.5), 0, 1], [knock(132, 0.6, 1.5, 1800, [[900, 0.02, 0.4], [1700, 0.012, 0.25]], 0), 0.02, 0.35]]), 0.7, 0.4, 0.3, 8), { norm: 0.8 });
def('door_bang', 'Zombie bangs on a door from outside: heavy wood hit, frame rattle, small bounce', 0.7, () =>
  room(layer(1.4, [[woodHit(141, 70, 1.0, 0.45), 0, 1], [knock(142, 0.9, 1.2, 3000, [[1100, 0.02, 0.3], [1900, 0.015, 0.2], [2700, 0.01, 0.1]], 0), 0.01, 0.4],
    [woodHit(143, 90, 0.5, 0.4), 0.17, 0.35], [stickSlip(144, 0.2, { r0: 160, r1: 120, bodies: BOARD, total: 0.4 }), 0.05, 0.2]]), 1.2, 0.5, 0.35, 9), { norm: 0.8 });

// ---- searching ----
def('search_cupboard', 'Search a cupboard/cabinet: door scrape, wood knock, things shifted', 0.5, () =>
  room(layer(1.3, [[stickSlip(151, 0.3, { r0: 110, r1: 170, bodies: HINGE, total: 0.4 }), 0, 0.5], [woodHit(152, 170, 0.4, 0.4), 0.33, 0.5],
    [rustle(0.55, 153, { rate: 160, env: (t) => bell(t / 0.55, 0.8), lo: 500, hi: 5000, grain: 0.004 }), 0.4, 0.8], [woodHit(154, 220, 0.3, 0.3), 0.95, 0.3]]), 0.35, 0.2, 0.3, 10), { norm: 0.6 });
def('search_drawer', 'Search a drawer: wood slide, contents rattle and shift', 0.5, () =>
  room(layer(1.3, [[stickSlip(161, 0.4, { r0: 30, r1: 48, bodies: [[180, 0.03, 1], [420, 0.02, 0.6], [900, 0.015, 0.3]], jit: 0.8, drop: 0.1, fric: 0.25, total: 0.45 }), 0, 0.9],
    [woodHit(162, 200, 0.4, 0.3), 0.42, 0.5], [rustle(0.55, 163, { rate: 220, env: (t) => bell(t / 0.55, 0.7), lo: 700, hi: 7000, grain: 0.002, skew: 3 }), 0.5, 0.7],
    [knock(164, 0.3, 0.4, 7000, [[3000, 0.04, 0.5], [4400, 0.03, 0.3]], 0.3), 0.7, 0.35]]), 0.3, 0.2, 0.4, 11), { norm: 0.6 });
def('search_cloth', 'Search clothes / bedding: cloth rummage', 0.5, () =>
  room(rustle(1.0, 171, { rate: 260, env: (t) => 0.25 + bell(t / 1.0, 0.8) * (0.6 + 0.4 * Math.sin(t * 17) * Math.sin(t * 7.3)), lo: 250, hi: 4200, grain: 0.006, skew: 2.2 }), 0.2, 0.1, 0.1, 12), { norm: 0.6 });
def('search', 'Search / scavenge rummage (generic, start of search): shifting cloth, small objects', 0.5, () =>
  room(layer(1.0, [[rustle(0.85, 31, { rate: 240, env: (t) => 0.3 + bell(t / 0.85) * (0.6 + 0.4 * Math.sin(t * 13)), lo: 300, hi: 5000, grain: 0.005, skew: 2 }), 0, 1],
    [knock(33, 0.2, 0.4, 6500, [[2800, 0.03, 0.4], [4100, 0.02, 0.25]], 0.3), 0.34, 0.3], [woodHit(34, 240, 0.3, 0.2), 0.62, 0.3]]), 0.25, 0.15, 0.2, 13), { norm: 0.6 });

def('dismantle_wood', 'Dismantle a wooden object: nail squeal, wood crack, drop', 0.8, () =>
  room(layer(1.0, [[stickSlip(181, 0.4, { r0: 180, r1: 320, bodies: [[1500, 0.02, 1], [2600, 0.012, 0.6], [800, 0.03, 0.4]], total: 0.5 }), 0, 0.7],
    [knock(182, 0.4, 0.5, 4500, [[420, 0.03, 0.8], [900, 0.025, 0.6], [1700, 0.015, 0.4]], 0.6), 0.42, 1], [rustle(0.2, 183, { rate: 500, env: (t) => exp(t, 0.06), lo: 800, hi: 6000, grain: 0.002 }), 0.45, 0.6],
    [woodHit(184, 120, 0.4, 0.6), 0.62, 0.7]]), 0.4, 0.2, 0.3, 14));
def('dismantle_metal', 'Dismantle a metal object: scrape of bent metal, two dull clanks', 0.5, () => {
  const sc = slowNoise(0.4, 191, 14), N = Math.round(0.4 * SR);
  const scrape = svf(noise(N, 192), (i) => 1500 + 900 * sc[i] + 600 * i / N, 4, 'bp').map((v, i) => v * bell(i / N, 0.8) * (0.4 + 0.6 * Math.max(0, sig(sc[i] * 2))));
  return room(layer(1.0, [[scrape, 0, 0.7], [pipeHit(193, 330, 0.7, 0.9), 0.4, 1], [pipeHit(194, 390, 0.6, 0.7), 0.66, 0.8]]), 0.5, 0.2, 0.5, 15);
}, { norm: 0.7 });

// ---- items, body ----
def('drain', 'Drain / collect water: pouring and glugging bubbles', 0.5, () => {
  const r = rng(61), o = buf(0.9), N = o.length, sl = slowNoise(0.9, 62, 20);
  const pour = svf(noise(N, 63), (i) => 700 + 250 * sl[i], 0.9, 'bp').map((v, i) => v * 0.5 * bell(i / N, 0.5) * (0.7 + 0.2 * sl[i]));
  mix(o, pour, 0, 1);
  for (let k = 0; k < 14; k++) mix(o, bubble(250 + 600 * r() * r(), 0.012 + 0.03 * r(), 0.5 + 0.5 * r(), 0.5 + r()), 0.03 + (k / 14) * 0.7 + r() * 0.04);
  return room(o, 0.25, 0.1, 0.5, 16);
}, { norm: 0.6 });
def('pickup', 'Item added to inventory: soft cloth/handling, no chime', 0.3, () =>
  layer(0.3, [[rustle(0.2, 3, { rate: 420, env: (t) => bell(t / 0.2, 0.7), lo: 400, hi: 4500, grain: 0.004 }), 0, 1], [knock(4, 0.15, 0.6, 3500, [[900, 0.02, 0.5], [2100, 0.012, 0.3]], 0.3), 0.15, 0.3]]), { norm: 0.6 });
def('eat', 'Use food item (eat): crunchy bites and chewing', 0.75, () => {
  const o = buf(0.8);
  [0.03, 0.22, 0.4, 0.58].forEach((at, k) => {
    mix(o, rustle(0.1, 70 + k, { rate: 1600, env: (t) => exp(t, 0.03), lo: 700, hi: 5500, grain: 0.0015, skew: 1.5 }), at, 1);
    mix(o, knock(75 + k, 0.1, 2, 900, [[130 + 10 * k, 0.03, 1]], 0.3), at, 0.4);
  });
  return o;
}, { norm: 0.65 });
def('drink', 'Use drink item (drink): lip slosh and three swallows', 0.5, () => {
  const o = buf(0.9);
  mix(o, rustle(0.8, 81, { rate: 400, env: (t) => 0.3 * bell(t / 0.8), lo: 300, hi: 2500, grain: 0.005 }), 0, 0.6);
  [0.08, 0.34, 0.6].forEach((at, k) => mix(o, swallow(82 + k, 1 - k * 0.1), at));
  return o;
}, { norm: 0.6 });
def('craft', 'Craft / build completes: cloth/tape rustle then two wooden taps', 0.4, () =>
  room(layer(1.0, [[rustle(0.45, 191, { rate: 300, env: (t) => bell(t / 0.45, 0.7), lo: 500, hi: 5500, grain: 0.004 }), 0, 0.7], [woodHit(192, 210, 0.4, 0.8), 0.5, 0.9], [woodHit(193, 190, 0.4, 0.8), 0.72, 0.8]]), 0.3, 0.2, 0.3, 17), { norm: 0.65 });

def('swing', 'Melee swing starts: air moving past a held object', 0.4, () => {
  const N = Math.round(0.3 * SR), n = noise(N, 111);
  return svf(n, (i) => lerp(450, 2400, Math.min(1, i / (0.22 * SR))), 0.8, 'bp').map((v, i) => v * bell(i / N, 1.8));
}, { norm: 0.6 });

// ---- hits (kept as they were) ----
def('hit_flesh', 'Player melee or thrown hit lands on a zombie', 0.65, () => {
  const o = buf(0.3);
  mix(o, lp(nburst(0.25, 121, 0.05, 1.3), 1200), 0); mix(o, thud(0.25, 130, 55, 0.07, 1), 0); mix(o, bp(nburst(0.2, 122, 0.06, 0.8), 1300, 1.5), 0.02);
  return o;
});
const stab = (seed, sq0, sq1, flut, thudF) => {
  const o = buf(0.32);
  mix(o, hp(nburst(0.02, seed, 0.003, 1.3), 1800), 0); mix(o, bp(nburst(0.05, seed + 1, 0.01, 1.0), 1100, 1.2), 0, 0.8);
  mix(o, thud(0.15, thudF, thudF * 0.6, 0.035, 0.6), 0.004); mix(o, squelch(seed + 2, 0.24, sq0, sq1, flut, 3.2), 0.025);
  return lp(o, 4500);
};
def('hit_stab_1', 'Stab weapon hits a zombie: puncture + wet squelch (1..3)', 0.55, () => stab(701, 380, 900, 38, 150), { norm: 0.7 });
def('hit_stab_2', 'Stab weapon hit (variation, deeper squelch)', 0.55, () => stab(711, 300, 750, 30, 125), { norm: 0.7 });
def('hit_stab_3', 'Stab weapon hit (variation, shorter and brighter)', 0.55, () => stab(721, 500, 1200, 46, 170), { norm: 0.7 });
const blunt = (seed, f0, crackF, wetF) => {
  const o = buf(0.4);
  mix(o, thud(0.4, f0, f0 * 0.42, 0.09, 1.2), 0); mix(o, lp(nburst(0.2, seed, 0.04, 1.2), 700), 0);
  mix(o, bp(nburst(0.07, seed + 1, 0.012, 1.1), crackF, 2.2), 0.004, 0.7); mix(o, squelch(seed + 2, 0.18, wetF, wetF * 1.8, 28, 1.6), 0.03);
  return lp(o, 3500);
};
def('hit_blunt_1', 'Blunt weapon hits a zombie: heavy wet thud + dull crack (1..3)', 0.6, () => blunt(731, 105, 1500, 350), { norm: 0.75 });
def('hit_blunt_2', 'Blunt weapon hit (variation, deeper)', 0.6, () => blunt(741, 85, 1100, 300), { norm: 0.75 });
def('hit_blunt_3', 'Blunt weapon hit (variation, sharper crack)', 0.6, () => blunt(751, 120, 1900, 420), { norm: 0.75 });
const punch = (seed, f0) => {
  const o = buf(0.2);
  mix(o, thud(0.2, f0, f0 * 0.5, 0.04, 1), 0); mix(o, lp(nburst(0.12, seed, 0.025, 1.2), 900), 0); mix(o, squelch(seed + 2, 0.08, 400, 700, 40, 0.6), 0.01);
  return lp(o, 2200);
};
def('hit_punch_1', 'Fists hit a zombie: dull fleshy punch (1..2)', 0.55, () => punch(761, 130), { norm: 0.7 });
def('hit_punch_2', 'Fists hit (variation)', 0.55, () => punch(771, 110), { norm: 0.7 });

def('weapon_break', 'Weapon durability hits zero: snap, splinters, pieces dropping', 0.65, () =>
  room(layer(0.9, [[knock(301, 0.5, 0.4, 5500, [[520, 0.03, 0.9], [1300, 0.02, 0.6], [2400, 0.012, 0.4]], 0.8), 0, 1],
    [rustle(0.25, 302, { rate: 700, env: (t) => exp(t, 0.07), lo: 900, hi: 7000, grain: 0.002 }), 0.01, 0.6], [woodHit(303, 260, 0.3, 0.6), 0.22, 0.5], [woodHit(304, 330, 0.3, 0.5), 0.34, 0.35]]), 0.4, 0.2, 0.4, 18), { norm: 0.75 });

def('glass_shatter', 'Glass breaks (molotov lands, window smash): crack + shower of shards', 0.55, () => {
  const o = glassShards(311, 0.8, 150, 2200, 9500, 0.006, 0.04, 1);
  mix(o, glassShards(312, 0.3, 14, 900, 2600, 0.03, 0.08, 1.3), 0);
  mix(o, hp(click(313, 0.6, 0, 0.1, 2), 1500), 0, 0.8);
  mix(o, rustle(0.7, 314, { rate: 900, env: (t) => exp(t, 0.2), lo: 3000, hi: 9000, grain: 0.001, skew: 3 }), 0.02, 0.35);
  return room(o, 0.6, 0.25, 0.8, 19);
}, { norm: 0.7 });
def('glass_tinkle', 'Ambient one-shot: small glass pieces settling somewhere', 0.25, () =>
  room(glassShards(561, 0.9, 9, 2600, 8000, 0.02, 0.1, 0.7), 1.1, 0.7, 0.8, 20), { norm: 0.5 });

def('fire_whoosh', 'Molotov ignites / fire bursts: gas catching with a roar and crackle', 0.6, () => {
  const N = Math.round(1.4 * SR), n = noise(N, 321), sl = slowNoise(1.4, 322, 12), env = (t) => att(t, 0.1) * exp(Math.max(0, t - 0.1), 0.5);
  const roar = svf(n, (i) => 300 + 1500 * env(i / SR), 0.7, 'lp').map((v, i) => v * env(i / SR) * (0.8 + 0.25 * sl[i]));
  return layer(1.4, [[roar, 0, 1], [rustle(1.3, 323, { rate: 60, env: (t) => 0.3 + exp(t, 0.5), lo: 1500, hi: 8000, grain: 0.0012, skew: 3 }), 0.1, 0.5]]);
}, { norm: 0.7 });

// ---- creatures: noise-driven vocal tract ----
const drift = (sec, seed) => slowNoise(sec, seed, 3);
function groan(seed, f0, dur, v0, v1, breath = 0.9) {
  const d = drift(dur, seed + 2);
  return voice(dur, { f0: (t) => f0 * (1 + 0.2 * Math.sin(Math.PI * t / dur) - 0.2 * t / dur) * (1 + 0.07 * d[Math.min(d.length - 1, Math.floor(t * SR))]),
    amp: (t) => bell(t / dur, 0.7) * att(t, 0.1), v0, v1, breath, jitter: 0.2, fry: 0.28, gurgle: 0.5, q: 5, seed });
}
def('zombie_groan_1', 'Zombie idle / spotted you (groan)', 0.55, () => room(groan(131, 95, 1.4, 'uh', 'aw'), 0.4, 0.15, 0.2, 21));
def('zombie_groan_2', 'Zombie idle / aggro (lower, longer groan)', 0.55, () => room(groan(132, 70, 1.7, 'aw', 'oh'), 0.4, 0.15, 0.2, 22));
def('zombie_hit', 'Zombie attacks / bites the hero: rasping lunge', 0.65, () => {
  const v = voice(0.4, { f0: (t) => lerp(150, 85, t / 0.4), amp: (t) => att(t, 0.01) * exp(t, 0.2), v0: 'ah', v1: 'uh', breath: 1.3, jitter: 0.3, fry: 0.3, gurgle: 0.7, seed: 141 });
  return layer(0.45, [[v, 0, 1], [rustle(0.2, 142, { rate: 500, env: (t) => exp(t, 0.06), lo: 300, hi: 3500, grain: 0.004 }), 0, 0.5]]);
});
def('zombie_death', 'Zombie killed: a last rattling breath, then the body slumps', 0.65, () => {
  const v = voice(0.9, { f0: (t) => lerp(115, 45, Math.min(1, t / 0.8)), amp: (t) => att(t, 0.02) * exp(t, 0.35), v0: 'aw', v1: 'oh', breath: 1.0, jitter: 0.3, fry: 0.4, gurgle: 0.8, seed: 151 });
  return room(layer(1.4, [[v, 0, 1], [knock(152, 0.6, 3, 900, [[62, 0.12, 1], [120, 0.07, 0.6]], 0.4), 0.7, 1.4], [rustle(0.35, 153, { rate: 300, env: (t) => exp(t, 0.1), lo: 200, hi: 3000, grain: 0.006 }), 0.68, 0.7]]), 0.8, 0.3, 0.2, 23);
});
def('hero_hurt', 'Hero takes damage: a short pained grunt', 0.65, () =>
  voice(0.35, { f0: (t) => lerp(220, 150, t / 0.35), amp: (t) => att(t, 0.01) * exp(t, 0.15), v0: 'ah', v1: 'eh', breath: 0.6, jitter: 0.07, fry: 0.04, seed: 161, q: 6 }));

const breathPhase = (seed, dur, v0, v1, g = 1) => voice(dur, { voiced: 0, breath: 1, amp: (t) => bell(t / dur, 1.4) * g, v0, v1, gurgle: 0.9, q: 3, seed });
def('zombie_breath_1', 'Near zombie: wet exhale through a damaged throat', 0.3, () => room(breathPhase(631, 1.3, 'uh', 'aw'), 0.4, 0.2, 0.2, 24), { norm: 0.65 });
def('zombie_breath_2', 'Near zombie: slower rattling breath in, then out', 0.3, () =>
  room(layer(2.4, [[breathPhase(632, 0.85, 'eh', 'uh', 0.6), 0, 1], [breathPhase(633, 1.2, 'uh', 'aw'), 1.1, 1]]), 0.4, 0.2, 0.2, 25), { norm: 0.65 });
def('zombie_shuffle', 'Near zombie: dragging shuffle, 2 steps', 0.3, () => {
  const o = buf(1.5);
  [0.05, 0.75].forEach((at, k) => {
    mix(o, rustle(0.5, 641 + k, { rate: 420, env: (t) => bell(t / 0.5, 0.7), lo: 150, hi: 2400, grain: 0.005 }), at, 1);
    mix(o, knock(645 + k, 0.3, 2, 900, [[80, 0.05, 1], [160, 0.03, 0.4]], 0.3), at + 0.34, 0.6);
  });
  return room(o, 0.5, 0.25, 0.3, 26);
}, { norm: 0.6 });

// distant groans: the same voice, far away (low-passed into a big hall)
const distantGroan = (seed, f0, dur, v0, v1, cut) => {
  const g = lp(lp(groan(seed, f0, dur, v0, v1, 0.8), cut), cut);
  const o = room(g, 2.4, 1.3, 0.1, seed);
  return gen(o.length / SR, (t, i) => o[i] * att(t, 0.15));
};
def('distant_groan_1', 'Far-away groan, 45-120 s apart; hides the attack cue. Pick randomly of 1..4', 0.3, () => distantGroan(501, 85, 1.9, 'uh', 'aw', 600), { norm: 0.7 });
def('distant_groan_2', 'Far-away groan (lower, long)', 0.3, () => distantGroan(502, 62, 2.4, 'aw', 'oh', 520), { norm: 0.7 });
def('distant_groan_3', 'Far-away groan (higher, shorter)', 0.28, () => distantGroan(503, 110, 1.5, 'ah', 'uh', 650), { norm: 0.7 });
def('distant_groan_4', 'Far-away groan (two-part moan)', 0.3, () => {
  const a = distantGroan(504, 90, 1.2, 'uh', 'aw', 560), b = distantGroan(505, 72, 1.8, 'aw', 'oh', 520), o = buf(5.2);
  mix(o, a, 0); mix(o, b, 1.3, 0.9); return o;
}, { norm: 0.7 });

// ---- barricades ----
def('barricade_hit', 'Zombies hit a barricade: boards thump and shift', 0.7, () =>
  room(layer(1.0, [[woodHit(181, 80, 0.8, 0.5), 0, 1], [knock(182, 0.5, 1.0, 1500, [[300, 0.1, 0.5], [700, 0.07, 0.4]], 0.2), 0.02, 0.6],
    [stickSlip(183, 0.25, { r0: 120, r1: 70, bodies: BOARD, total: 0.4 }), 0.12, 0.35], [woodHit(184, 260, 0.3, 0.4), 0.28, 0.3]]), 0.7, 0.3, 0.3, 27), { norm: 0.8 });
def('barricade_break', 'A barricade is destroyed: planks crack, splinter and fall', 0.75, () => {
  const parts = [[woodHit(331, 75, 1.0, 0.5), 0, 1.1]];
  [0, 0.07, 0.15, 0.26].forEach((at, k) => parts.push([knock(335 + k, 0.4, 0.5, 4500, [[430 + 90 * k, 0.03, 0.8], [980 + 100 * k, 0.02, 0.5], [1800, 0.012, 0.3]], 0.7), at, 0.9]));
  parts.push([rustle(0.8, 340, { rate: 500, env: (t) => exp(t, 0.25), lo: 300, hi: 5500, grain: 0.004 }), 0.02, 0.9]);
  parts.push([woodHit(341, 200, 0.4, 0.5), 0.38, 0.6], [woodHit(342, 160, 0.4, 0.5), 0.5, 0.7], [woodHit(343, 110, 0.5, 0.5), 0.62, 0.8]);
  return room(layer(1.3, parts), 0.8, 0.35, 0.3, 28);
}, { norm: 0.8 });

// ---- ambience beds (loops, exactly periodic, broadband noise; src modulates their volume as gusts) ----
def('amb_wind', 'Wind gusting past the building: broadband filtered noise, irregular non-periodic swells. Loop; quiet', 0.22, () => {
  const L = 26, N = Math.round(L * SR), g1 = periodicSlow(L, 401, 0.11), g2 = periodicSlow(L, 402, 0.45), g3 = periodicSlow(L, 403, 2.2), g4 = periodicSlow(L, 404, 6);
  const gust = new Float32Array(N); for (let i = 0; i < N; i++) gust[i] = sig(1.5 * (0.62 * g1[i] + 0.35 * g2[i] + 0.12 * g3[i]) - 0.15);
  const G = tile3(gust), T = tile3(g4), car = tile3(noise(N, 405)), car2 = tile3(noise(N, 406));
  const low = svf(car, (i) => 110 + 900 * G[i] * G[i], 0.55, 'lp'), mid = svf(car2, (i) => 500 + 2000 * G[i], 0.7, 'bp');
  const o = new Float32Array(N * 3);
  for (let i = 0; i < o.length; i++) o[i] = (low[i] * (0.1 + 0.9 * Math.pow(G[i], 1.2)) * 5 + mid[i] * Math.pow(G[i], 3) * 0.6) * (1 + 0.12 * T[i]);
  return hp(mid3(o), 35, 0.7);
}, { loop: true, noFade: true, norm: 0.7 });

def('amb_rain', 'Rain on a window: dense droplets + soft roof patter. Loop; louder near windows', 0.18, () => {
  const L = 18, N = Math.round(L * SR), r = rng(603), m1 = periodicSlow(L, 604, 0.3), m2 = periodicSlow(L, 605, 0.06);
  const hiss = mid3(lp(hp(tile3(noise(N, 601)), 1600, 0.6), 8500, 0.6)), pat = mid3(lp(tile3(noise(N, 602)), 650, 0.6));
  const drops = new Float32Array(N), tab = noise(8192, 606);
  const addDrop = (at, tau, alpha, a) => {
    const off = Math.floor(r() * 8000), n = Math.round(tau * SR * 6); let y = 0;
    for (let j = 0; j < n; j++) { y += alpha * (tab[(off + j) & 8191] - y); drops[(at + j) % N] += y * a * Math.exp(-j / SR / tau); }
  };
  for (let k = 0; k < 85 * L; k++) addDrop(Math.floor(r() * N), 0.0006 + 0.0025 * r(), 0.25 + 0.7 * r(), 0.25 * Math.min(5, -Math.log(1 - r())));
  for (let k = 0; k < 7 * L; k++) addDrop(Math.floor(r() * N), 0.006 + 0.01 * r(), 0.12 + 0.2 * r(), 0.9 + 0.8 * r());
  const o = new Float32Array(N);
  for (let i = 0; i < N; i++) o[i] = hiss[i] * 0.5 * clamp(1 + 0.2 * m1[i] + 0.15 * m2[i], 0.4, 1.8) + pat[i] * 1.7 * clamp(1 + 0.25 * m2[i], 0.4, 1.8) + drops[i] * (0.9 + 0.2 * m2[i]);
  return o;
}, { loop: true, noFade: true, norm: 0.6 });

// ---- stairwell attack cue ----
const stairHit = (seed, g = 1) => {
  const r = rng(seed);
  return lp(layer(0.9, [[knock(seed, 0.9, 2, 1800, [[jit(r, 58), 0.18, 1], [jit(r, 115), 0.12, 0.6], [jit(r, 190), 0.09, 0.4], [jit(r, 420), 0.07, 0.2]], 0.3), 0, g],
    [knock(seed + 1, 0.9, 1, 3500, [[1200, 0.025, 0.15], [2100, 0.015, 0.1]], 0), 0.01, 0.3 * g]]), 800);
};
const stairBang = (hits, total) => room(layer(total, hits.map(([at, seed, g]) => [stairHit(seed, g), at, 1])), 2.2, 0.8, 0.15, 29);
def('stair_bang_1', 'Attack cue (T-8 s): single heavy muffled bang from the stairwell below', 0.5, () => stairBang([[0, 511, 1]], 4), { norm: 0.75 });
def('stair_bang_2', 'Attack cue: two bangs, slightly uneven', 0.5, () => stairBang([[0, 512, 1], [0.82, 513, 0.8]], 4.5), { norm: 0.75 });
def('stair_bang_3', 'Attack cue: three bangs, building', 0.5, () => stairBang([[0, 514, 0.7], [0.64, 515, 0.9], [1.35, 516, 1.1]], 5), { norm: 0.75 });

def('stair_shuffle', 'Loop: many feet shuffling in the stairwell, muffled. Fade in with the attack cue, out when it ends', 0.3, () => {
  const L = 6, r = rng(521), o = buf(L + 1.5);
  for (let k = 0; k < 15; k++) {
    const at = k * (L / 15) + r() * 0.2;
    mix(o, rustle(0.25 + r() * 0.2, 530 + k, { rate: 600, env: (t) => bell(t / 0.3, 0.7), lo: 200, hi: 2000, grain: 0.003 }), at, 0.5 + r() * 0.5);
    if (r() < 0.5) mix(o, knock(560 + k, 0.2, 2, 900, [[jit(r, 85), 0.04, 1], [jit(r, 170), 0.03, 0.4]], 0.3), at + 0.15, 0.5);
  }
  return wrapFold(room(lp(o, 1500), 1.2, 0.8, 0.1, 30), L);
}, { loop: true, noFade: true, norm: 0.6 });

// ---- building one-shots ----
def('creak_1', 'Ambient one-shot: floorboard creak (long gaps)', 0.3, () =>
  room(stickSlip(541, 0.9, { r0: 28, r1: 60, bodies: BOARD, jit: 0.7, drop: 0.2, total: 1.1 }), 0.6, 0.35, 0.2, 31), { norm: 0.6 });
def('creak_2', 'Ambient one-shot: slow door hinge creak somewhere', 0.3, () =>
  room(stickSlip(542, 1.5, { r0: 40, r1: 110, bodies: [[520, 0.04, 1], [1050, 0.025, 0.7], [1800, 0.015, 0.4], [300, 0.05, 0.5]], jit: 0.65, drop: 0.2, total: 1.7 }), 1.0, 0.5, 0.3, 32), { norm: 0.6 });
def('creak_3', 'Ambient one-shot: short wood settling', 0.3, () =>
  room(stickSlip(543, 0.45, { r0: 45, r1: 85, bodies: [[110, 0.06, 1], [260, 0.04, 0.8], [600, 0.02, 0.4]], jit: 0.8, drop: 0.25, total: 0.6 }), 0.5, 0.3, 0.2, 33), { norm: 0.6 });
def('muffled_thud_1', 'Ambient one-shot: distant thud from another floor', 0.4, () =>
  room(lp(knock(551, 0.8, 3, 600, [[52, 0.16, 1], [95, 0.12, 0.6], [160, 0.08, 0.3]], 0.2), 300), 1.5, 0.8, 0.1, 34), { norm: 0.7 });
def('muffled_thud_2', 'Ambient one-shot: double thump far off', 0.4, () =>
  room(lp(layer(1.4, [[knock(552, 0.8, 3, 600, [[58, 0.14, 1], [105, 0.1, 0.6]], 0.2), 0, 1], [knock(553, 0.8, 3, 600, [[50, 0.15, 1], [90, 0.1, 0.5]], 0.2), 0.45, 0.7]]), 280), 1.5, 0.8, 0.1, 35), { norm: 0.7 });
def('pipe_knock_1', 'Ambient one-shot: pipe knocks twice', 0.3, () =>
  room(layer(1.6, [[pipeHit(611, 410, 1.2, 1), 0, 1], [pipeHit(612, 380, 1.2, 0.8), 0.27, 1]]), 1.0, 0.45, 0.5, 36), { norm: 0.6 });
def('pipe_knock_2', 'Ambient one-shot: pipe tick-tick-knock (cooling metal)', 0.3, () =>
  room(layer(1.8, [[pipeHit(621, 560, 0.5, 0.5), 0, 1], [pipeHit(622, 590, 0.5, 0.4), 0.13, 1], [pipeHit(623, 340, 1.2, 0.9), 0.7, 1]]), 1.0, 0.45, 0.5, 37), { norm: 0.6 });

def('heartbeat_soft', 'Low-health loop: soft heartbeat felt more than heard', 0.3, () => {
  const o = layer(1.6, [[knock(1, 0.6, 3, 220, [[46, 0.09, 1], [74, 0.06, 0.6], [118, 0.04, 0.3]], 0.15), 0, 1], [knock(2, 0.6, 3, 220, [[52, 0.08, 0.8], [88, 0.05, 0.4]], 0.15), 0.27, 0.6]]);
  return wrapFold(lp(o, 170), 1.1);
}, { loop: true, noFade: true, norm: 0.6 });

// ---- moodle cues: body sounds ----
def('moodle_stomach', 'Hungry moodle: stomach growl (gurgling, no pitch)', 0.25, () =>
  voice(1.1, { voiced: 0, breath: 1, amp: (t) => bell(t / 1.1, 0.9), v0: [260, 480, 900], v1: [190, 360, 700], gurgle: 1.2, q: 2.5, seed: 651 }), { norm: 0.6 });
def('moodle_swallow', 'Thirsty moodle: dry swallow', 0.25, () => swallow(652), { norm: 0.5 });
def('moodle_yawn', 'Tired moodle: a yawn', 0.25, () =>
  voice(1.5, { f0: (t) => 160 - 55 * t / 1.5, amp: (t) => bell(t / 1.5, 1.1), v0: 'ah', v1: 'oh', voiced: 0.55, breath: 0.9, jitter: 0.1, fry: 0.12, seed: 653 }), { norm: 0.6 });
def('moodle_pain', 'Injured moodle: pained breath in through the teeth', 0.25, () => {
  const N = Math.round(0.6 * SR);
  return bp(noise(N, 654), 4300, 0.9).map((v, i) => v * bell(i / N, 1.3) * (0.6 + 0.4 * Math.sin(i / SR * 40)));
}, { norm: 0.5 });
def('moodle_sigh', 'Low-spirits moodle: a long sigh', 0.25, () =>
  voice(1.3, { f0: (t) => 125 - 25 * t, amp: (t) => att(t, 0.25) * exp(Math.max(0, t - 0.3), 0.45), v0: 'ah', v1: 'uh', voiced: 0.2, breath: 1, seed: 655, q: 3 }), { norm: 0.55 });
def('moodle_panic', 'Panic moodle: quiet fast heartbeat, ~2 s one-shot', 0.25, () => {
  const o = buf(2.4);
  for (let k = 0; k < 5; k++) { const at = 0.05 + k * 0.4; mix(o, knock(10 + k, 0.5, 3, 220, [[48, 0.08, 1], [78, 0.05, 0.5]], 0.15), at); mix(o, knock(20 + k, 0.5, 3, 220, [[54, 0.07, 0.8]], 0.15), at + 0.17, 0.6); }
  return lp(o, 170);
}, { norm: 0.6 });

def('blood_drip', 'Quiet one-shot: a few drips on the floor after a hit/kill', 0.3, () => {
  const o = buf(1.5), r = rng(781);
  [[0, 1], [0.4, 0.6], [1.0, 0.35]].forEach(([at, g], k) => {
    mix(o, bubble(850 + r() * 300, 0.012, g * 0.8, 1.2), at); mix(o, knock(790 + k, 0.1, 0.6, 3500, [[2600, 0.01, 0.3]], 0.6), at, g * 0.5);
  });
  return room(o, 0.6, 0.4, 0.5, 38);
}, { norm: 0.5 });

// ---- music: acoustic models ----
const MUSIC_EVT = 'Sparse sad piece, one-shot (not looped); on quiet moments only (first claim, after attack ends, survivor joins). Never in danger';
def('music_sad_1', MUSIC_EVT + '. Piano model, A minor, ~55 s', 0.22, () => musicPiece(571, 52, 12, 'piano',
  [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 55, 59], [41, 48, 53, 57], [45, 52, 57, 60]],
  [[0, 2, 76], [1, 1, 72], [2, 2, 69], [3, 0, 72], [4, 2, 71], [5, 1, 67], [6, 2, 72], [7, 1, 71], [8, 2, 69], [9, 1, 65], [10, 2, 72], [11, 1.5, 69, 0.6]],
  [[1.5, 2, 0.35], [2.5, 3, 0.3]]), { norm: 0.7, music: true });
def('music_sad_2', MUSIC_EVT + '. Low plucked strings (harp/kantele-like Karplus-Strong), D minor, ~42 s', 0.2, () => musicPiece(581, 46, 8, 'harp',
  [[38, 45, 50, 53], [34, 41, 46, 50], [43, 50, 55, 58], [33, 40, 45, 49]],
  [[0, 0.5, 62, 0.8], [1, 2, 65, 0.8], [2, 0.5, 62, 0.8], [3, 2, 58, 0.8], [4, 0.5, 67, 0.8], [5, 2, 65, 0.8], [6, 0.5, 64, 0.8], [7, 2, 61, 0.7]],
  [[1, 2, 0.4], [2.5, 3, 0.35]]), { norm: 0.7, music: true });
def('music_sad_3', MUSIC_EVT + '. Fingerpicked nylon guitar model (Karplus-Strong + body), E minor, ~32 s', 0.2, () => musicPiece(591, 60, 8, 'guitar',
  [[40, 47, 52, 55], [36, 43, 48, 52], [43, 50, 55, 59], [38, 45, 50, 54]],
  [[0, 3, 71, 0.5], [2, 3, 72, 0.5], [4, 3, 74, 0.5], [6, 3, 69, 0.5], [7, 2, 66, 0.5]],
  [[1, 2, 0.4], [2, 3, 0.4], [3, 2, 0.4], [4, 1, 0.35], [5, 2, 0.4], [6, 3, 0.4], [7, 2, 0.35]]), { norm: 0.7, music: true });


// ---------- encode ----------
const REMOVED = ['amb_room_tone', 'lamp_hiss', 'amb_tower', 'heartbeat', 'siren', 'alert_sting', 'survivor_blip', 'error', 'music_sad'];
const wavBytes = (x) => {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(clamp(x[i], -1, 1) * 32767), 44 + i * 2);
  return b;
};
/** Drop near-silent tail (keeps 40 ms), then fade out. */
function trimTail(x) {
  const thr = peak(x) * 0.0012; let end = x.length;
  while (end > 1 && Math.abs(x[end - 1]) < thr) end--;
  end = Math.min(x.length, end + Math.round(0.04 * SR));
  const y = x.slice(0, end), f = Math.min(y.length, Math.round(0.03 * SR));
  for (let i = 0; i < f; i++) y[y.length - 1 - i] *= i / f;
  return y;
}

try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { console.error('make-audio: ffmpeg (libvorbis) is required.'); process.exit(1); }
const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
let fetched = new Set(), prevManifest = {};
const srcFile = join(dirname(fileURLToPath(import.meta.url)), 'audio-sources.json');
if (existsSync(srcFile)) { try { for (const e of JSON.parse(readFileSync(srcFile, 'utf8')).entries || []) if (e.fetched) fetched.add(e.key); } catch { /* ignore */ } }
if (existsSync(join(OUT, 'manifest.json'))) { try { prevManifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')).sounds || {}; } catch { /* ignore */ } }

for (const k of REMOVED) rmSync(join(OUT, k + '.ogg'), { force: true });
const tmp = mkdtempSync(join(tmpdir(), 'f15audio-'));
const manifest = { _doc: 'key -> files (ogg only, Android target), volume (0..1 for scene.sound.play), loop, event. footstep_<surface>_N: surface from audio.footstepSurfaceByRoom', sounds: {} };
const generated = [];

for (const [key, d] of Object.entries(S)) {
  if (fetched.has(key) && prevManifest[key]) { manifest.sounds[key] = prevManifest[key]; continue; } // real recording wins
  if (only.length && !only.includes(key) && prevManifest[key]) { manifest.sounds[key] = prevManifest[key]; generated.push(key); continue; }
  let x = d.fn();
  if (!d.noFade) {
    x = trimTail(x);
    const f = Math.round(0.002 * SR); for (let i = 0; i < f && i < x.length; i++) x[i] *= i / f;
  }
  const g = (d.norm || 0.79) / (peak(x) || 1);
  for (let i = 0; i < x.length; i++) x[i] *= g;
  const wav = join(tmp, key + '.wav'); writeFileSync(wav, wavBytes(x));
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', wav, '-fflags', '+bitexact', '-flags:a', '+bitexact', '-ac', '1', '-ar', String(SR),
    '-c:a', 'libvorbis', '-q:a', d.music || d.loop ? '1' : '2', join(OUT, key + '.ogg')]);
  manifest.sounds[key] = { files: [key + '.ogg'], volume: d.volume, loop: d.loop, duration: +(x.length / SR).toFixed(2), event: d.event, ...(d.surface ? { surface: d.surface } : {}) };
  generated.push(key);
}
rmSync(tmp, { recursive: true, force: true });
// no stray ogg that is not in the manifest
for (const f of readdirSync(OUT)) if (f.endsWith('.ogg') && !manifest.sounds[f.slice(0, -4)]) rmSync(join(OUT, f), { force: true });
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// CREDITS.md: generated table (this script) + recorded section (fetch-audio.mjs owns it)
const credits = join(OUT, 'CREDITS.md');
const G0 = '<!-- GENERATED:START -->', G1 = '<!-- GENERATED:END -->', R0 = '<!-- RECORDED:START -->', R1 = '<!-- RECORDED:END -->';
let old = existsSync(credits) ? readFileSync(credits, 'utf8') : '';
const recorded = old.includes(R0) ? old.slice(old.indexOf(R0), old.indexOf(R1) + R1.length) : `${R0}\n| File | What | Source URL | Author | License | Edits |\n|---|---|---|---|---|---|\n| (none yet) | | | | | |\n${R1}`;
const genRows = Object.keys(manifest.sounds).filter((k) => !fetched.has(k)).map((k) => `| ${k}.ogg | ${manifest.sounds[k].event.replace(/\|/g, '/')} | generated in-house by scripts/make-audio.mjs (CC0) | in-house | CC0 1.0 | synthesized, mono ${SR} Hz, peak-normalized, OGG Vorbis |`);
writeFileSync(credits, `# Audio credits

GDD section 10: every audio file shipped in the game is listed here. A file without a line does not ship.
Only CC0 / public-domain sources are allowed (no CC-BY, no "free for games" licences).

Status: almost every file is a real CC0 recording, processed by \`npm run audio:fetch\` (scripts/fetch-audio.mjs, sources and exact processing in scripts/audio-sources.json).
The first table lists the files that are still generated in code (no suitable real recording found yet); they are replaced as soon as a source is added.

## Still generated in-house

${G0}
| File | What | Source | Author | License | Edits |
|---|---|---|---|---|---|
${genRows.join('\n')}
${G1}

## Recorded CC0 / public domain

${recorded}
`);
const total = readdirSync(OUT).filter((f) => f.endsWith('.ogg')).reduce((n, f) => n + readFileSync(join(OUT, f)).length, 0);
console.log(`audio: ${Object.keys(manifest.sounds).length} sounds (${generated.length} generated, ${fetched.size} recorded) -> ${OUT}, ${(total / 1048576).toFixed(2)} MB`);
