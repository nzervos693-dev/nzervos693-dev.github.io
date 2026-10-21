/**
 * Run on double tap (GDD 4, 5.4). Pure, no Phaser.
 * A second tap on empty ground within 0.3 s and 48 px of the first makes the hero run: faster,
 * noisy (a noise of 250 px once per second), and it costs energy. A single tap is a quiet walk.
 */

/** Run numbers. runEnergyPerSecond / runMinEnergy default to the game-designer's values until balance.hero has them. */
export function runConfig(balance) {
  const h = balance.hero || {};
  const c = balance.controls || {};
  return {
    speed: h.runSpeed ?? 170,
    noiseRadius: h.runNoiseRadiusPx ?? 250,
    energyPerSecond: h.runEnergyPerSecond ?? 0.2,
    minEnergy: h.runMinEnergy ?? 5,
    tapSeconds: c.runDoubleTapSeconds ?? 0.3,
    tapMaxDistance: c.runDoubleTapMaxDistancePx ?? 48,
    noiseEverySeconds: 1,
  };
}

/**
 * Is `cur` the second tap of a run double tap?
 * @param {{t:number,x:number,y:number}|null} prev previous ground tap (t in ms, x/y in screen px)
 * @param {{t:number,x:number,y:number}} cur
 */
export function isRunTap(prev, cur, balance) {
  if (!prev) return false;
  const c = runConfig(balance);
  return cur.t - prev.t <= c.tapSeconds * 1000 && Math.hypot(cur.x - prev.x, cur.y - prev.y) <= c.tapMaxDistance;
}

/** Enough energy to start / keep running? Below runMinEnergy a double tap falls back to walking. */
export const canRun = (energy, balance) => energy >= runConfig(balance).minEnergy;

/**
 * Advance a running hero by dt seconds. Mutates `run` ({noiseT}) and `needs.energy`.
 * @returns {{noise:boolean, stopped:boolean}} noise: emit a run noise now; stopped: too tired, walk on
 */
export function stepRun(run, needs, dt, balance) {
  const c = runConfig(balance);
  needs.energy = Math.max(0, needs.energy - c.energyPerSecond * dt);
  run.noiseT = (run.noiseT ?? c.noiseEverySeconds) + dt; // the first noise fires at once
  let noise = false;
  if (run.noiseT >= c.noiseEverySeconds) { run.noiseT -= c.noiseEverySeconds; noise = true; }
  return { noise, stopped: needs.energy < c.minEnergy };
}
