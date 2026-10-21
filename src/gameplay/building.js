/**
 * Build spots, placed objects and the Secure floor action (GDD 5.6). Pure, no Phaser.
 * State: state.build = { spots: { [key]: record }, barricade: { level, hp } }, key = `${floor}:${spotId}`.
 * Spots come from floors.json (home apartment buildSpots); counts are capped by balance.home.
 */
import { addItem, countItem, removeItem, fitCount } from './inventory.js';
import { addPile } from './gameState.js';
import { mergeItems } from './rng.js';
import { isProducerRecipe, newProducer } from './producers.js';
import { homeSpots } from './buildSpots.js';
import { countAlive } from './zombies.js';

export { spotKey, homeSpots } from './buildSpots.js';

/** Spots of a kind that are still free. */
export const freeSpots = (state, tower, balance, kind) =>
  homeSpots(tower, balance, state).filter((s) => s.kind === kind && !state.build?.spots?.[s.key]);

/** Placed records of a recipe id (or all). */
export const builtOf = (state, recipeId = null) =>
  Object.values(state.build?.spots || {}).filter((p) => !recipeId || p.id === recipeId);

/** How many survivor beds stand (piece 3b: Mara needs a free one). */
export const survivorBeds = (state, balance) =>
  builtOf(state, 'survivor_bed').length * (balance.recipes.survivor_bed.effect.beds || 1);

/** Floors in state Cleared (candidates for Secure floor). */
export const clearedFloors = (state) =>
  Object.keys(state.floorStates || {}).filter((n) => state.floorStates[n] === 'Cleared').map(Number).sort((a, b) => a - b);

/** Cleared floors that can be Secured now (no living wanderer), and the blocked ones with a reason. */
export function secureCandidates(state) {
  return clearedFloors(state).map((n) => {
    const alive = countAlive(state, n);
    return { floor: n, ok: alive === 0, reason: alive ? `Wanderers on floor ${n}` : undefined };
  });
}

/**
 * Place a crafted object on a free spot of the right kind. Does not pay.
 * @returns {object|null} the record, or null if the spot is invalid/taken
 */
export function placeObject(state, tower, balance, recipeId, key) {
  const recipe = balance.recipes[recipeId];
  const spot = homeSpots(tower, balance, state).find((s) => s.key === key);
  if (!recipe || !spot || spot.kind !== recipe.buildSpot || state.build.spots[key]) return null;
  const p = newProducer(recipeId, spot.floor, spot.spot);
  state.build.spots[key] = p;
  return p;
}

/** Items back from dismantling a placed object: 50% of the cost rounded down, plus what it holds. */
export function dismantleRefund(p, balance) {
  const recipe = balance.recipes[p.id];
  const out = Object.entries(recipe.cost).map(([id, qty]) => ({ id, qty: Math.floor(qty * balance.salvage.refundRatio) }));
  if (isProducerRecipe(recipe)) {
    out.push({ id: recipe.effect.produces, qty: p.stored || 0 });
    if (recipe.effect.type === 'converter') out.push({ id: recipe.effect.input, qty: p.queue || 0 });
  }
  return mergeItems(out);
}

/**
 * Hand items to the hero: bag first, then (at home) the stockpile, then a pile on the floor.
 * @param {{floor:number,x:number}} loc where a pile would appear
 * @returns {{bag:{id:string,qty:number}[], stock:{id:string,qty:number}[], piled:{id:string,qty:number}[]}}
 */
export function deliver(state, balance, items, loc) {
  const res = { bag: [], stock: [], piled: [] };
  for (const e of mergeItems(items)) {
    const toBag = e.qty - addItem(state.inventory, e.id, e.qty, balance);
    if (toBag > 0) res.bag.push({ id: e.id, qty: toBag });
    let left = e.qty - toBag;
    if (left > 0) {
      const toStock = left - addItem(state.stockpile, e.id, left, balance);
      if (toStock > 0) res.stock.push({ id: e.id, qty: toStock });
      left -= toStock;
    }
    if (left > 0) res.piled.push({ id: e.id, qty: left });
  }
  if (res.piled.length) addPile(state, loc.floor, loc.x, res.piled, loc.y);
  return res;
}

/** Remove a placed object. @returns {object|null} the removed record */
export function removeObject(state, key) {
  const p = state.build.spots[key];
  if (!p) return null;
  delete state.build.spots[key];
  return p;
}

/**
 * Take the stored output of a producer: bag first, then the stockpile; what does not fit stays inside.
 * @returns {{id:string, qty:number, left:number}|null}
 */
export function takeStored(state, balance, p, loc) {
  const effect = balance.recipes[p.id].effect;
  if (!(p.stored > 0)) return null;
  const id = effect.produces;
  const qty = Math.min(p.stored, fitCount(state.inventory, id, p.stored, balance) + fitCount(state.stockpile, id, p.stored, balance));
  if (qty <= 0) return { id, qty: 0, left: p.stored };
  deliver(state, balance, [{ id, qty }], loc);
  p.stored -= qty;
  return { id, qty, left: p.stored };
}

/** Load dirty water from the bag, then the stockpile, into a converter's queue. @returns {number} loaded */
export function loadConverter(state, balance, p) {
  const effect = balance.recipes[p.id].effect;
  if (effect.type !== 'converter') return 0;
  let room = effect.queueMax - p.queue;
  let loaded = 0;
  for (const slots of [state.inventory, state.stockpile]) {
    if (room <= 0) break;
    const take = Math.min(room, countItem(slots, effect.input));
    if (take > 0) { removeItem(slots, effect.input, take); room -= take; loaded += take; }
  }
  p.queue += loaded;
  return loaded;
}

/**
 * Buttons for a placed object (max 2): Use/Collect and Dismantle.
 * @returns {{kind:'use'|'dismantle', label:string, enabled:boolean, reason?:string}[]}
 */
export function builtActions(state, balance, p) {
  const recipe = balance.recipes[p.id];
  const out = [];
  if (isProducerRecipe(recipe)) {
    const e = recipe.effect;
    const canLoad = e.type === 'converter' && p.queue < e.queueMax && (countItem(state.inventory, e.input) + countItem(state.stockpile, e.input)) > 0;
    const enabled = p.stored > 0 || canLoad;
    let reason;
    if (!enabled) reason = e.type === 'converter' ? 'Needs dirty water' : p.waiting ? 'Needs water' : 'Nothing yet';
    out.push({ kind: 'use', label: p.stored > 0 || e.type !== 'converter' ? 'Collect' : 'Load', enabled, reason });
  }
  out.push({ kind: 'dismantle', label: 'Dismantle', enabled: true });
  return out;
}

/**
 * Use a placed producer: collect what it holds and (water filter) load dirty water.
 * @returns {{collected:{id:string,qty:number,left:number}|null, loaded:number, firstHarvest:boolean, full:boolean}}
 */
export function useBuilt(state, balance, p, loc) {
  const got = takeStored(state, balance, p, loc);
  const collected = got && got.qty > 0 ? got : null;
  const loaded = loadConverter(state, balance, p);
  const firstHarvest = !!collected && p.id === 'planter' && !state.flags.firstPlanterHarvest;
  if (firstHarvest) state.flags.firstPlanterHarvest = true; // +5 morale once per game, not per planter
  return { collected, loaded, firstHarvest, full: !!got && got.left > 0 };
}

/**
 * Secure a Cleared floor. Does not pay. Stops its wanderers (timer removed).
 * @returns {boolean} done
 */
export function secureFloor(state, floor) {
  if (state.floorStates[floor] !== 'Cleared' || countAlive(state, floor) > 0) return false;
  state.floorStates[floor] = 'Secured';
  if (state.wanderAt) delete state.wanderAt[floor];
  return true;
}
