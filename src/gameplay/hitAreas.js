/**
 * Tap hit areas on a floor (GDD 4, BUG-036). Pure, no Phaser.
 * Objects take taps only on their sprite band, padded sideways to the minimum target width; everything else on the
 * floor (the gaps between objects, the wall area, the slab under the floor line) is a walk tap.
 */

/** Height of the walk zone under the floor line, px (the slab is 30 px; the rest is the next floor's ceiling). */
export const WALK_SLAB_PX = 60;
/** Floor-standing objects lose this much of their top (the head of a tall sprite is not worth a menu), px. */
export const FLOOR_TRIM_PX = 16;
/** A floor object's band is never shorter than this, px. */
export const MIN_BAND_PX = 48;

/**
 * Tap box of a target.
 * @param {{x:number, w:number, h:number, wall?:boolean}} t sprite centre x, sprite size in px, wall layer or not
 * @param {number} line y of the floor line
 * @param {{minWidth:number, wallLift:number}} cfg minimum target width (balance controls.minHitAreaPx), wall lift
 * @returns {{x0:number, x1:number, y0:number, y1:number}}
 */
export function hitBox(t, line, cfg) {
  const w = Math.max(t.w, cfg.minWidth);
  if (t.wall) {
    const y1 = line - cfg.wallLift;
    return { x0: t.x - w / 2, x1: t.x + w / 2, y0: y1 - t.h, y1 };
  }
  return { x0: t.x - w / 2, x1: t.x + w / 2, y0: line - Math.max(t.h - FLOOR_TRIM_PX, MIN_BAND_PX), y1: line };
}

/**
 * The target under a tap, or null (= a walk tap). With overlapping boxes the nearest centre (in x) wins.
 * @param {{x:number, w:number, h:number, wall?:boolean}[]} targets of one floor
 */
export function pickTarget(targets, wx, wy, line, cfg) {
  let best = null;
  let bestD = Infinity;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const b = hitBox(t, line, cfg);
    if (wx < b.x0 || wx > b.x1 || wy < b.y0 || wy > b.y1) continue;
    const d = Math.abs(wx - t.x);
    if (d < bestD) { bestD = d; best = t; }
  }
  return best;
}
