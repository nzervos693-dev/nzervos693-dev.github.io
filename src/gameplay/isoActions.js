/**
 * Small iso-specific action rules (tiles instead of px, light time multipliers, jammed door hits).
 * Pure, no Phaser.
 */

/** Noise radius in TILES: 0 quiet, salvage.noiseRadiusTiles noisy, Infinity loud (the whole floor). */
export function noiseTiles(noise, balance) {
  if (noise === 'loud') return Infinity;
  if (noise === 'noisy') return balance.salvage.noiseRadiusTiles;
  return 0;
}

/** Search / dismantle / drain time multiplier for the light of the hero's tile (GDD 5.3). */
export function lightTimeMult(light, balance) {
  if (light === 'dim') return balance.light.dimTimeMult;
  if (light === 'dark') return balance.light.darkTimeMult;
  return 1;
}

/**
 * Register one hit on a jammed door (mutates door.hits). The caller changes the door state on `opened`.
 * @param {{hits?:number}} door @param {number} needed world.jammedDoorHits
 * @returns {{opened:boolean, hits:number}}
 */
export function jamHit(door, needed) {
  door.hits = (door.hits || 0) + 1;
  if (door.hits >= needed) { door.hits = 0; return { opened: true, hits: needed }; }
  return { opened: false, hits: door.hits };
}
