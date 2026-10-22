// Acoustic-instrument models for the sad pieces: physical-model-ish piano (inharmonic, two detuned strings,
// two-stage decay, hammer thump, soundboard) and Karplus-Strong plucked strings (harp-like / nylon guitar)
// with a body resonance, then a room. Performance is humanised (timing, velocity, chord roll).
import { SR, TAU, rng, buf, noise, lp, hp, mix, modal, convolve, room, peak, lerp } from './audio-dsp.mjs';

const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** Karplus-Strong string with fractional-delay allpass tuning and a 2-tap damping loop filter. */
function pluck(f, dur, { tau = 1.6, damp = 0.35, pos = 0.14, bright = 0.55, seed = 1 }) {
  const n = Math.round(dur * SR), o = new Float32Array(n), r = rng(seed);
  const D = SR / f - damp, N = Math.floor(D), frac = D - N, c = (1 - frac) / (1 + frac);
  const ring = new Float32Array(N), rho = Math.exp(-1 / (f * tau));
  for (let i = 0; i < N; i++) ring[i] = r() * 2 - 1;
  // pick brightness (one-pole lowpass over the burst) and pick position (comb)
  let y = 0; for (let i = 0; i < N; i++) { y += bright * (ring[i] - y); ring[i] = y; }
  const p = Math.max(1, Math.round(pos * N)); for (let i = N - 1; i >= p; i--) ring[i] -= ring[i - p];
  let m = 0; for (let i = 0; i < N; i++) m += ring[i] * ring[i]; const g = 1 / Math.sqrt(m / N || 1);
  for (let i = 0; i < N; i++) ring[i] *= g;
  let idx = 0, prev = 0, ax = 0, ay = 0;
  for (let i = 0; i < n; i++) {
    const s = ring[idx], filt = rho * ((1 - damp) * s + damp * prev); prev = s;
    const a = c * filt + ax - c * ay; ax = filt; ay = a;
    ring[idx] = a; idx = (idx + 1) % N; o[i] = s;
  }
  return o;
}

/** Inharmonic additive piano string pair with prompt + after-sound decay and a hammer thump. */
function pianoNote(f, vel, seed) {
  const r = rng(seed), tau0 = Math.min(9, Math.max(1.2, 7 * Math.pow(110 / f, 0.6))), dur = Math.min(8.5, tau0 * 3.6);
  const n = Math.round(dur * SR), o = new Float32Array(n), B = 0.00012 * Math.pow(f / 110, 1.6) + 0.00006;
  const bright = 1500 + 3500 * vel;
  for (const det of [-1, 1]) {
    const cents = det * (0.8 + r() * 1.0), fs = f * Math.pow(2, cents / 1200);
    for (let k = 1; k < 40; k++) {
      const fk = fs * k * Math.sqrt(1 + B * k * k); if (fk > 6500) break;
      const a = (Math.abs(Math.sin(Math.PI * k * 0.125)) + 0.08) / Math.pow(k, 0.75) / (1 + Math.pow(fk / bright, 2)) * 0.5 * (0.85 + 0.3 * r());
      const tk = tau0 / (1 + 0.55 * Math.pow(k - 1, 0.95)), w = TAU * fk / SR, cr = Math.cos(w), sr = Math.sin(w);
      let c = 1, s = 0, e1 = 1, e2 = 1; const d1 = Math.exp(-1 / (tk * 0.16 * SR)), d2 = Math.exp(-1 / (tk * SR));
      const ph0 = r() * 0.5; c = Math.cos(ph0); s = Math.sin(ph0);
      const m = Math.min(n, Math.round(Math.min(dur, tk * 5) * SR));
      for (let i = 0; i < m; i++) {
        const att = i < 60 ? i / 60 : 1;
        o[i] += s * (0.4 * e1 + 0.6 * e2) * a * att;
        const nc = c * cr - s * sr; s = s * cr + c * sr; c = nc; e1 *= d1; e2 *= d2;
      }
    }
  }
  // hammer: soft felt thump + a little noise
  const th = lp(noise(Math.round(0.03 * SR), seed + 3), 500 + 900 * vel, 0.7);
  for (let i = 0; i < th.length; i++) o[i] += th[i] * Math.exp(-i / (0.006 * SR)) * 0.5 * vel;
  const fade = Math.round(0.4 * SR); for (let i = 0; i < fade && i < n; i++) o[n - 1 - i] *= i / fade;
  return o;
}

let boardIR, bodyIR;
const soundboard = () => boardIR || (boardIR = (() => {
  const e = buf(0.5); e[0] = 1; const r = rng(77); for (let i = 1; i < 60; i++) e[i] = (r() * 2 - 1) * 0.15;
  const m = modal(e, [[95, 0.12, 0.6], [190, 0.1, 0.5], [310, 0.08, 0.4], [520, 0.06, 0.3], [880, 0.04, 0.2], [1500, 0.03, 0.15]]);
  m[0] += 1; return m;
})());
const guitarBody = () => bodyIR || (bodyIR = (() => {
  const e = buf(0.35); e[0] = 1;
  const m = modal(e, [[98, 0.07, 0.7], [205, 0.06, 0.8], [390, 0.04, 0.5], [700, 0.03, 0.3], [1200, 0.02, 0.2]]);
  m[0] += 1; return m;
})());

/**
 * timbre: 'piano' | 'harp' | 'guitar'. chords: [[bass, bass2, a, b], ...] (each chord spans 2 bars),
 * melody: [[bar, beat, midi, vel?]], arp: [[beat, chordIndex, vel]].
 */
export function musicPiece(seed, bpm, bars, timbre, chords, melody, arp) {
  const beat = 60 / bpm, r = rng(seed), L = bars * 4 * beat, o = buf(L + 6);
  const hum = (s) => (r() - 0.5) * 2 * s; // humanisation
  const note = (m, at, vel, long = 1) => {
    at = Math.max(0, at + hum(timbre === 'piano' ? 0.028 : 0.022)); vel = Math.min(1, Math.max(0.15, vel * (1 + hum(0.18))));
    const f = hz(m), sd = Math.round(m * 31 + at * 100);
    let n;
    if (timbre === 'piano') n = pianoNote(f, vel, sd);
    else if (timbre === 'harp') n = pluck(f, Math.min(7, 3 + 4 * long), { tau: 2.6 * long * Math.pow(220 / f, 0.2), damp: 0.28, pos: 0.12, bright: 0.45, seed: sd });
    else n = pluck(f, 3.2, { tau: 0.95 * long, damp: 0.42, pos: 0.16 + 0.04 * r(), bright: 0.6, seed: sd });
    const gain = vel * (timbre === 'piano' ? 0.5 : 0.18);
    const fade = Math.round(0.15 * SR); for (let i = 0; i < fade && i < n.length; i++) n[n.length - 1 - i] *= i / fade;
    mix(o, n, at, gain);
  };
  chords.forEach((c, ci) => {
    const t0 = ci * 2 * 4 * beat;
    note(c[0], t0, 0.7, 1.5);
    note(c[1], t0 + 4 * beat, 0.5, 1.5);
    for (const [bt, idx, g] of arp) note(c[idx], t0 + bt * beat + 0.012 * (idx % 3), g * 1.2, 1);
  });
  melody.forEach(([b, bt, m, g = 0.75]) => note(m, (b * 4 + bt) * beat, g, 1.3));
  let w = timbre === 'piano' ? convolve(o, soundboard()) : convolve(o, guitarBody());
  w = w.subarray(0, o.length + 2000);
  let x = new Float32Array(w.length); for (let i = 0; i < x.length; i++) x[i] = w[i];
  x = lp(x, timbre === 'piano' ? 5200 : 4200, 0.6);
  x = room(x, timbre === 'piano' ? 2.2 : 1.8, 0.45, 0.2, seed);
  const e = Math.round(0.8 * SR); for (let i = 0; i < e; i++) x[x.length - 1 - i] *= i / e;
  return x;
}
