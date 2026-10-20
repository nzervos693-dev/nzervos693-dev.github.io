/**
 * Tiny seedable RNG helpers so game rules can be unit tested.
 * An "rng" is any function returning a float in [0, 1), like Math.random.
 */

/**
 * Create a deterministic RNG (mulberry32).
 * @param {number} seed
 * @returns {() => number}
 */
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Inclusive integer in [min, max].
 * @param {() => number} rng
 * @param {number} min
 * @param {number} max
 */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Merge a list of {id, qty} entries by id (drops qty <= 0).
 * @param {{id:string, qty:number}[]} list
 * @returns {{id:string, qty:number}[]}
 */
export function mergeItems(list) {
  const map = new Map();
  for (const e of list) {
    if (!e || e.qty <= 0) continue;
    map.set(e.id, (map.get(e.id) || 0) + e.qty);
  }
  return [...map].map(([id, qty]) => ({ id, qty }));
}
