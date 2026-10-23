/**
 * The diegetic attack cue (GDD 5.8). Pure, no Phaser.
 * No banner, siren or countdown: T-15 s distant groans, T-8 s stairwell banging and a flickering
 * landing light, T-0 the first attacker arrives. The cue is easy to miss on purpose.
 */

/** Cue numbers with code-side fallbacks for the keys the GDD gives (balance.attacks.cue.*). */
export function cueConfig(balance) {
  const a = balance.attacks || {};
  const c = a.cue || {};
  return {
    cueSeconds: a.cueSeconds ?? 15,
    groanAt: c.groanAtSeconds ?? 15,
    stairwellAt: c.stairwellAtSeconds ?? 8,
    flickerFrom: c.flickerFromSeconds ?? 8,
    audibleFloors: c.stairwellAudibleFloors ?? 2,
    flickerSeconds: a.tuning?.flickerSeconds ?? 0.09,
    secondGroanAt: c.secondGroanAtSeconds ?? 12,
    bangBeats: c.bangBeatsSeconds ?? [8, 5, 2.5],
    fightBangGap: c.fightBangGapSeconds ?? [2, 3],
  };
}

/** Epoch ms when the cue starts for an attack arriving at `nextAt`, or null. */
export const cueStartAt = (nextAt, balance) => (nextAt == null ? null : nextAt - cueConfig(balance).cueSeconds * 1000);

/**
 * The cue beats that are due as the time left drops from prevLeft to left, as a list in firing order:
 * [{kind:'groan'|'bang', at, index?}]. A late start (the app was busy) can cross several; callers fire only
 * the LAST one so there is no burst of sounds.
 */
export function dueBeats(prevLeft, left, balance) {
  const c = cueConfig(balance);
  const all = [{ kind: 'groan', at: c.groanAt }, { kind: 'groan', at: c.secondGroanAt }];
  c.bangBeats.forEach((at, index) => all.push({ kind: 'bang', at, index }));
  return all.filter((b) => crossed(prevLeft, left, b.at)).sort((a, b) => b.at - a.at);
}

/** Is the landing light flickering with `left` seconds to go? */
export const isFlickering = (left, balance) => left <= cueConfig(balance).flickerFrom;

/**
 * Volume factor 0..1 for the stairwell banging as heard from the camera's floor: full on the
 * attacked floor, fading linearly to silence beyond `audibleFloors` floors.
 */
export function stairVolume(cameraFloor, attackFloor, balance) {
  const n = cueConfig(balance).audibleFloors;
  const d = Math.abs(cameraFloor - attackFloor);
  if (d > n) return 0;
  return 1 - d / (n + 1);
}

/** Landing light dip alpha: mostly steady, with dips. Deterministic for a step counter. */
export function landingDip(step, max = 0.6) {
  const h = Math.sin(step * 12.9898) * 43758.5453;
  const r = h - Math.floor(h);
  return r > 0.55 ? max : r * max * 0.3;
}

/** Did the time left drop through `t` seconds between two frames? */
export const crossed = (prevLeft, left, t) => prevLeft > t && left <= t;

/**
 * Volume multiplier for a bang by its straight-line distance in tiles from the hero (GDD 5.8 bang falloff,
 * attacks.cue.bangFalloff): 1 up to nearTiles, linear down to minVolume at farTiles, minVolume beyond. Never silent on the floor.
 */
export function bangFalloff(distTiles, balance) {
  const f = balance.attacks?.cue?.bangFalloff ?? {};
  const near = f.nearTiles ?? 10;
  const far = f.farTiles ?? 30;
  const min = f.minVolume ?? 0.3;
  if (distTiles <= near) return 1;
  if (distTiles >= far) return min;
  return 1 - (1 - min) * ((distTiles - near) / (far - near));
}
