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
