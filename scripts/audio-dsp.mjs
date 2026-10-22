// DSP toolbox for scripts/make-audio.mjs (Floor 15). Pure JS, deterministic (seeded PRNG only).
// Everything here is built around "excite a physical-ish resonator with noise/impacts" rather than oscillators.
export const SR = 22050;
export const TAU = Math.PI * 2;

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const buf = (sec) => new Float32Array(Math.max(1, Math.round(sec * SR)));
export const noise = (n, seed) => { const r = rng(seed), o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = r() * 2 - 1; return o; };
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const peak = (x) => { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; };
export const rms = (x) => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / (x.length || 1)); };
export function gen(sec, fn) { const o = buf(sec); for (let i = 0; i < o.length; i++) o[i] = fn(i / SR, i); return o; }
export function mix(dst, src, at = 0, g = 1) {
  const s = Math.round(at * SR);
  for (let i = 0; i < src.length && s + i < dst.length; i++) if (s + i >= 0) dst[s + i] += src[i] * g;
  return dst;
}
/** Sum buffers into a new buffer of `sec` seconds: parts = [[buf, atSec, gain], ...] */
export function layer(sec, parts) { const o = buf(sec); for (const [b, at = 0, g = 1] of parts) mix(o, b, at, g); return o; }
export const scale = (x, g) => { const o = new Float32Array(x.length); for (let i = 0; i < x.length; i++) o[i] = x[i] * g; return o; };
export function fitTo(x, sec) { const o = buf(sec); o.set(x.subarray(0, Math.min(o.length, x.length))); return o; }

// ---------- filters ----------
export function biquad(x, type, fc, q = 0.7) {
  const w = TAU * Math.min(fc, SR * 0.45) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2; const a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const o = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y;
  }
  return o;
}
export const lp = (x, f, q) => biquad(x, 'lp', f, q);
export const hp = (x, f, q) => biquad(x, 'hp', f, q);
export const bp = (x, f, q) => biquad(x, 'bp', f, q);

/** Time-varying state-variable filter. fcFn(i) -> Hz (capped ~2.6 kHz for stability). mode lp|bp|hp */
export function svf(x, fcFn, q = 1, mode = 'lp') {
  const o = new Float32Array(x.length), qi = 1 / q; let lo = 0, bd = 0;
  for (let i = 0; i < x.length; i++) {
    const f = 2 * Math.sin(Math.PI * Math.min(fcFn(i), SR * 0.12) / SR);
    lo += f * bd; const hi = x[i] - lo - qi * bd; bd += f * hi;
    o[i] = mode === 'lp' ? lo : mode === 'bp' ? bd * qi : hi;
  }
  return o;
}
/** Two-pole resonator: impulse response = g * damped sine at f, time constant tau (s). */
export function resonate(x, f, tau, g = 1) {
  const w = TAU * f / SR, r = Math.exp(-1 / (tau * SR)), a1 = 2 * r * Math.cos(w), a2 = -r * r, k = g * Math.sin(w);
  const o = new Float32Array(x.length); let y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = k * x[i] + a1 * y1 + a2 * y2; y2 = y1; y1 = y; o[i] = y; }
  return o;
}
/** Parallel resonator bank. modes: [[f, tau, gain], ...] */
export function modal(exc, modes) {
  const o = new Float32Array(exc.length);
  for (const [f, tau, g = 1] of modes) { if (f >= SR * 0.45) continue; const y = resonate(exc, f, tau, g); for (let i = 0; i < o.length; i++) o[i] += y[i]; }
  return o;
}

// ---------- exciters ----------
/** Short noise burst (an impact's contact noise), zero-padded to `total` seconds. */
export function click(seed, ms, cut, total = 0.3, g = 1) {
  const n = buf(total), r = rng(seed), tau = Math.max(0.0002, ms / 1000), len = Math.min(n.length, Math.round(tau * SR * 8));
  for (let i = 0; i < len; i++) n[i] = (r() * 2 - 1) * Math.exp(-i / SR / tau) * g;
  return cut ? lp(n, cut, 0.6) : n;
}
/** Impact on a resonant body: contact noise exciting modes (+ some raw contact noise). */
export function knock(seed, total, ms, cut, modes, direct = 0.3) {
  const e = click(seed, ms, cut, total), m = modal(e, modes);
  for (let i = 0; i < m.length; i++) m[i] += e[i] * direct;
  return m;
}
/** Granular rustle (cloth/paper/leaves/crumbs): Poisson noise grains. rate(t) grains per second, env(t) 0..1 */
export function rustle(sec, seed, { rate = 400, env = () => 1, lo = 800, hi = 6000, grain = 0.003, skew = 2 } = {}) {
  const r = rng(seed), o = buf(sec), tab = noise(4096, seed + 99);
  for (let i = 0; i < o.length; i++) {
    const t = i / SR, e = env(t);
    if (e > 0 && r() < rate * e / SR) {
      const a = Math.pow(r(), skew) * e, tau = grain * (0.3 + 1.4 * r()) * SR, off = Math.floor(r() * 4000);
      for (let j = 0, m = Math.min(o.length - i, Math.round(tau * 6)); j < m; j++) o[i + j] += tab[(off + j) & 4095] * a * Math.exp(-j / tau);
    }
  }
  return hi ? lp(hp(o, lo, 0.6), hi, 0.6) : hp(o, lo, 0.6);
}
/** Minnaert-style water bubble: a small pitch-rising damped resonance. */
export function bubble(f0, d, g = 1, rise = 0.6) {
  const n = Math.round(d * 6 * SR), o = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const t = i / SR; ph += f0 * (1 + rise * Math.min(1, t / (d * 1.5))) / SR; o[i] = Math.sin(TAU * ph) * Math.exp(-t / d) * Math.min(1, t / 0.0015) * g; }
  return o;
}

// ---------- slow random modulators ----------
/** Periodic zero-mean unit-std lowpass noise over L seconds (loops seamlessly). */
export function periodicSlow(L, seed, hz) {
  const N = Math.round(L * SR), n = noise(N, seed), t3 = new Float32Array(N * 3);
  t3.set(n, 0); t3.set(n, N); t3.set(n, 2 * N);
  const f = lp(lp(t3, hz, 0.7), hz, 0.7), o = f.slice(N, 2 * N);
  let s = 0; for (const v of o) s += v * v; const sd = Math.sqrt(s / N) || 1;
  for (let i = 0; i < N; i++) o[i] /= sd;
  return o;
}
/** Non-periodic version, length sec. */
export function slowNoise(sec, seed, hz) {
  const o = lp(lp(noise(Math.round(sec * SR), seed), hz, 0.7), hz, 0.7);
  let s = 0; for (const v of o) s += v * v; const sd = Math.sqrt(s / o.length) || 1;
  for (let i = 0; i < o.length; i++) o[i] /= sd;
  return o;
}
export const tile3 = (x) => { const N = x.length, o = new Float32Array(N * 3); o.set(x, 0); o.set(x, N); o.set(x, 2 * N); return o; };
export const mid3 = (x) => { const N = x.length / 3; return x.slice(N, 2 * N); };
/** Fold everything past L seconds back onto the start (for loops with a tail). */
export function wrapFold(x, L) { const n = Math.round(L * SR), o = new Float32Array(n); for (let i = 0; i < x.length; i++) o[i % n] += x[i]; return o; }

// ---------- FFT convolution + room reverb ----------
function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? -TAU : TAU) / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
export function convolve(x, h) {
  const n = x.length + h.length - 1; let N = 1; while (N < n) N <<= 1;
  const ar = new Float64Array(N), ai = new Float64Array(N), br = new Float64Array(N), bi = new Float64Array(N);
  ar.set(x); br.set(h); fft(ar, ai, false); fft(br, bi, false);
  for (let i = 0; i < N; i++) { const r = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; }
  fft(ar, ai, true);
  const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = ar[i];
  return o;
}
const irCache = new Map();
/** Synthetic room impulse response: early reflections + exponentially decaying, darkening noise tail. Unit energy. */
export function roomIR(rt, bright = 0.5, seed = 7) {
  const key = `${rt}|${bright}|${seed}`; if (irCache.has(key)) return irCache.get(key);
  const n = Math.round(rt * SR * 1.1), r = rng(seed);
  const low = lp(noise(n, seed), 2200, 0.7), high = hp(noise(n, seed + 1), 1800, 0.7), ir = new Float32Array(n);
  const pre = Math.round(0.004 * SR);
  for (let i = pre; i < n; i++) { const t = i / SR; ir[i] = low[i] * Math.exp(-6.9 * t / rt) + bright * high[i] * Math.exp(-6.9 * t / (rt * 0.35)); }
  for (let k = 0; k < 7; k++) { const at = Math.round((0.006 + r() * 0.04) * SR); if (at < n) ir[at] += (r() < 0.5 ? -1 : 1) * (6 + r() * 10) * Math.max(0.15, 1 - rt * 0.2) * 0.3; }
  let e = 0; for (const v of ir) e += v * v; const s = 1 / Math.sqrt(e || 1);
  for (let i = 0; i < n; i++) ir[i] *= s;
  irCache.set(key, ir); return ir;
}
/** Dry + wet room. wet = energy ratio of the reverb to the dry signal (0.3 ~ small room, 1 ~ hall). */
export function room(x, rt, wet = 0.3, bright = 0.5, seed = 7) {
  const ir = roomIR(rt, bright, seed), w = convolve(x, ir), o = new Float32Array(w.length);
  for (let i = 0; i < o.length; i++) o[i] = (i < x.length ? x[i] : 0) + w[i] * wet;
  return o;
}

// ---------- voice (noise-driven vocal tract) ----------
export const VOWELS = {
  uh: [600, 1100, 2400], aw: [570, 840, 2410], oh: [420, 800, 2400], ah: [730, 1090, 2440],
  oo: [330, 800, 2300], eh: [530, 1840, 2480], mm: [280, 1000, 2200], ee: [300, 2200, 2900],
};
/**
 * Organic voice: irregular glottal pulses (jitter, shimmer, vocal fry dropouts) + aspiration noise,
 * both pushed through moving formant filters. voiced=0 gives pure breath. No oscillators.
 */
export function voice(sec, { f0 = () => 100, amp = () => 1, v0 = 'uh', v1 = 'aw', breath = 0.4, voiced = 1, jitter = 0.1, fry = 0.15, gurgle = 0, q = 5, seed = 1, tilt = 700 } = {}) {
  const r = rng(seed), N = Math.round(sec * SR), src = new Float32Array(N);
  let ph = 0, cyc = 1;
  for (let i = 0; i < N; i++) {
    ph += f0(i / SR) * cyc / SR;
    if (ph >= 1) { ph -= 1; cyc = 1 + jitter * (r() * 2 - 1); if (r() > fry) src[i] = 0.5 + 0.5 * r(); }
  }
  const A = VOWELS[v0] || v0, B = VOWELS[v1] || v1, fc = (k) => (i) => lerp(A[k], B[k], i / N);
  const gains = [1, 0.7, 0.35], qs = [q, q, q * 0.8];
  const bank = (x) => { const o = new Float32Array(N); for (let k = 0; k < 3; k++) { const y = svf(x, fc(k), qs[k], 'bp'); for (let i = 0; i < N; i++) o[i] += y[i] * gains[k]; } return o; };
  const vo = bank(lp(src, tilt, 0.7)), no = bank(noise(N, seed + 5));
  const rv = rms(vo) || 1, rn = rms(no) || 1, mod = gurgle ? slowNoise(sec, seed + 9, 22) : null, o = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR, m = mod ? Math.max(0.05, 1 + gurgle * mod[i]) : 1;
    o[i] = ((vo[i] / rv) * voiced + (no[i] / rn) * breath) * amp(t) * m;
  }
  return o;
}
