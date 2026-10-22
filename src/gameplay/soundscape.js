/**
 * Scheduling rules for the quiet soundscape (GDD 10). Pure, no Phaser.
 */

/** Random value in [lo, hi]. */
export const randBetween = (rng, [lo, hi]) => lo + rng() * (hi - lo);

/** Seconds until the next distant groan (audio.distantGroanGapSeconds, default 45-120). */
export const nextGroanGap = (rng, balance) => randBetween(rng, balance.audio?.distantGroanGapSeconds ?? [45, 120]);

/** Seconds until the next ambient one-shot (audio.ambientGapSeconds, default 20-60). */
export const nextAmbientGap = (rng, balance) => randBetween(rng, balance.audio?.ambientGapSeconds ?? [20, 60]);

/**
 * Pick an index in [0, n) that differs from `last` when n > 1.
 */
export function pickNoRepeat(rng, n, last) {
  if (n <= 1) return 0;
  let i = Math.floor(rng() * n);
  if (i === last) i = (i + 1 + Math.floor(rng() * (n - 1))) % n;
  return i;
}

/**
 * May the sad music play now? Cooldown of audio.musicCooldownMinutes (a value drawn once per
 * play, `cooldownMs`), never during danger.
 */
export function musicAllowed(nowMs, lastAt, cooldownMs, danger) {
  if (danger) return false;
  return lastAt == null || nowMs - lastAt >= cooldownMs;
}

/** Cooldown in ms drawn from audio.musicCooldownMinutes (default 8-12). */
export const musicCooldownMs = (rng, balance) => randBetween(rng, balance.audio?.musicCooldownMinutes ?? [8, 12]) * 60000;

/**
 * Intermittent weather beds (wind, rain): silence for a random gap, then a gust that swells and fades
 * on a smooth bell. Defaults can be overridden by balance.audio.gusts[name].
 */
export const GUST_DEFAULTS = Object.freeze({
  wind: { gapSeconds: [25, 70], lengthSeconds: [6, 12], peak: 0.35 },
  rain: { gapSeconds: [40, 110], lengthSeconds: [10, 20], peak: 0.3 },
});

/** @returns {{gap:number, t:number, len:number, peak:number, level:number}} a gust state, starting in a gap */
export function createGust(rng, cfg) {
  return { gap: randBetween(rng, cfg.gapSeconds), t: 0, len: 0, peak: cfg.peak, level: 0 };
}

/**
 * Advance a gust by dt seconds (mutates `g`).
 * @returns {number} current level, 0 between gusts, up to cfg.peak at the middle of one
 */
export function stepGust(g, dt, rng, cfg) {
  if (g.gap > 0) {
    g.gap -= dt;
    if (g.gap > 0) { g.level = 0; return 0; }
    g.len = randBetween(rng, cfg.lengthSeconds);
    g.peak = cfg.peak * (0.6 + rng() * 0.4);
    g.t = 0;
  }
  g.t += dt;
  if (g.t >= g.len) {
    g.gap = randBetween(rng, cfg.gapSeconds);
    g.level = 0;
    return 0;
  }
  const s = Math.sin((Math.PI * g.t) / g.len);
  g.level = g.peak * s * s;
  return g.level;
}
