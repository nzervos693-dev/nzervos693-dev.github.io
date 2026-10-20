/**
 * Throw button rules and fire patches (GDD 5.11). Pure, no Phaser.
 */

/** Distinct throwable item ids in the bag, in slot order. */
export function throwableIds(slots, balance) {
  const out = [];
  for (const s of slots) {
    if (s && balance.items?.[s.id]?.type === 'throwable' && !out.includes(s.id)) out.push(s.id);
  }
  return out;
}

/**
 * Throw button tap: disarmed -> first type -> next type -> ... -> past the last = disarmed.
 * @param {string|null} current armed item id
 * @param {string[]} ids carried throwable ids
 * @returns {string|null}
 */
export function cycleArm(current, ids) {
  if (!ids.length) return null;
  if (current == null) return ids[0];
  const i = ids.indexOf(current);
  return i < 0 ? ids[0] : (ids[i + 1] ?? null);
}

/**
 * Is a tap a valid throw? Same floor as the hero and within range.
 * @returns {{ok:boolean, x:number}} x = landing x (tap x)
 */
export function checkThrow(hero, tap, rangePx, floorWidth) {
  const ok = tap.floor === hero.floor && Math.abs(tap.x - hero.x) <= rangePx;
  return { ok, x: Math.min(floorWidth, Math.max(0, tap.x)) };
}

/**
 * A burning patch. `left` counts down in seconds. Numbers come from balance[itemId] (M1: molotov).
 * @param {string} [itemId]
 */
export function createFire(floor, x, balance, itemId = 'molotov') {
  const c = balance[itemId]?.widthPx ? balance[itemId] : balance.molotov;
  return { floor, x, w: c.widthPx, left: c.seconds, zdps: c.zombieDps, hdps: c.heroDps };
}

/** Advance a fire. @returns {boolean} still burning */
export function stepFire(fire, dt) {
  fire.left -= dt;
  return fire.left > 0;
}

/** Does the patch cover x (on its floor)? */
export const fireCovers = (fire, x) => Math.abs(x - fire.x) <= fire.w / 2;
