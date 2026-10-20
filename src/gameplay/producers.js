/**
 * Producers and converters (rain collector, planter, water filter), GDD 5.6. Pure, no Phaser.
 * A placed record is { id: recipeId, floor, spot, stored, progress (s), queue, waiting?, harvested? }.
 * Output stays in the record (up to effect.maxStored) until collected; when full, production pauses.
 * Works online (called each clock tick) and offline (a catchUp stepHook) with any step length.
 */
import { removeItem, countItem } from './inventory.js';

/** Is this recipe a producer or converter? */
export const isProducerRecipe = (recipe) => recipe?.effect?.type === 'producer' || recipe?.effect?.type === 'converter';

/**
 * Output speed multiplier from survivors with the Tender job (balance.survivors.tenderOutputMult).
 * Assumes state.survivors[id] = { recruited, dead, job } (piece 3b writes it); 1 when nobody tends.
 */
export function tenderMult(state, balance) {
  const tending = Object.values(state.survivors || {}).some((s) => s && s.recruited && !s.dead && s.job === 'tender');
  return tending ? balance.survivors.tenderOutputMult : 1;
}

/** Seconds per unit at a speed multiplier (intervalHours divided by the multiplier). */
export const intervalSeconds = (effect, mult = 1) => (effect.intervalHours * 3600) / Math.max(mult, 0.01);

/** Fresh record for a placed producer. */
export const newProducer = (recipeId, floor, spot) => ({ id: recipeId, floor, spot, stored: 0, progress: 0, queue: 0 });

/** Take effect.waterPerUnit water from the stockpile (effect.waterItems order, dirty first). @returns {boolean} */
export function takeWater(stockpile, effect) {
  const need = effect.waterPerUnit || 0;
  if (need <= 0) return true;
  for (const id of effect.waterItems || []) {
    if (countItem(stockpile, id) >= need) { removeItem(stockpile, id, need); return true; }
  }
  return false;
}

/**
 * Advance one producer by `seconds`. Mutates the record (and the stockpile for planter water).
 * @param {object} p record
 * @param {object} effect recipe.effect
 * @param {number} seconds
 * @param {{mult?:number, stockpile?:Array}} [ctx]
 * @returns {{made:number, full:boolean, waiting:boolean}}
 */
export function advanceProducer(p, effect, seconds, ctx = {}) {
  const interval = intervalSeconds(effect, ctx.mult);
  const converter = effect.type === 'converter';
  let left = Math.max(0, seconds);
  let made = 0;
  p.waiting = false;
  for (let guard = 0; guard < 1000; guard++) {
    if (p.stored >= effect.maxStored) break;
    if (converter && p.queue <= 0) break;
    const need = Math.max(0, interval - p.progress);
    if (left < need) { p.progress += left; break; }
    left -= need;
    p.progress = interval;
    if (!converter && !takeWater(ctx.stockpile || [], effect)) { p.waiting = true; break; }
    if (converter) p.queue -= 1;
    p.stored += 1;
    made += 1;
    p.progress = 0;
  }
  return { made, full: p.stored >= effect.maxStored, waiting: p.waiting };
}

/**
 * Advance every placed producer.
 * @param {object} state game state (state.build.spots, state.stockpile)
 * @param {object} balance
 * @param {number} seconds
 * @param {{production?:object}} [report] a catchUp report; per recipe id adds { made, full (all full), waiting (any), count (placed) }
 * @returns {number} units made
 */
export function tickProducers(state, balance, seconds, report = null) {
  const spots = state.build?.spots;
  if (!spots || seconds <= 0) return 0;
  const mult = tenderMult(state, balance);
  let total = 0;
  for (const key in spots) {
    const p = spots[key];
    const recipe = balance.recipes[p.id];
    if (!isProducerRecipe(recipe)) continue;
    const r = advanceProducer(p, recipe.effect, seconds, { mult, stockpile: state.stockpile });
    total += r.made;
    if (report) {
      const agg = ((report.production ||= {})[p.id] ||= { made: 0, full: false, waiting: false, count: 0, _full: new Set(), _wait: new Set() });
      agg.made += r.made;
      (agg._seen ||= new Set()).add(key);
      agg.count = agg._seen.size;
      if (r.full) agg._full.add(key); else agg._full.delete(key);
      if (r.waiting) agg._wait.add(key); else agg._wait.delete(key);
      agg.full = agg._full.size === agg._seen.size; // every one of this type is full
      agg.waiting = agg._wait.size > 0;
    }
  }
  return total;
}

/** Lines for the "While you were away" report: one per producer type that made something or stalled. */
export function productionLines(production, balance) {
  const out = [];
  for (const [id, a] of Object.entries(production || {})) {
    const recipe = balance.recipes[id];
    if (!recipe) continue;
    const item = balance.items[recipe.effect.produces]?.name || recipe.effect.produces;
    const s = [];
    if (a.made > 0) s.push(`+${a.made} ${item.toLowerCase()}`);
    if (a.waiting) s.push('needs water');
    else if (a.full) s.push('full');
    if (s.length) out.push(`${recipe.name}: ${s.join(', ')}`);
  }
  return out;
}
