/**
 * Workbench rules: which recipes can be crafted now and why not, paying costs, crafting.
 * Pure, no Phaser. Costs are paid from the bag first, then the stockpile (the workbench is at home).
 * GDD 5.6: recipes are instant; placeables, barricades and Secure floor need a target (see performCraft).
 */
import { countItem, removeItem } from './inventory.js';
import { freeSpots, secureCandidates, placeObject, deliver, secureFloor } from './building.js';
import { barricadeBlock, repairBlock, buildBarricade, repairBarricade, barricadeLevel } from './barricade.js';
import { isProducerRecipe } from './producers.js';

/** Order of the `use` groups in the Craft panel; unknown groups follow. */
export const USE_ORDER = ['weapon', 'throwable', 'tool', 'medicine', 'water', 'food', 'defense', 'home'];
export const USE_NAMES = {
  weapon: 'Weapons', throwable: 'Throwables', tool: 'Tools', medicine: 'Medicine',
  water: 'Water', food: 'Food', defense: 'Defense', home: 'Home',
};

/** Current workbench level (Workbench Lv2 arrives in M2). */
export const workbenchLevel = (state) => state.workbenchLevel || 1;

/**
 * What crafting a recipe asks of the player.
 * @returns {'item'|'place'|'barricade'|'repair'|'secure'}
 */
export function recipeKind(recipe) {
  const t = recipe.effect?.type;
  if (t === 'barricade') return 'barricade';
  if (t === 'repair_barricade') return 'repair';
  if (t === 'secure_floor') return 'secure';
  if (recipe.buildSpot === 'window' || recipe.buildSpot === 'floor') return 'place';
  return 'item';
}

/** Recipe ids grouped by `use` in panel order: [{use, ids}]. */
export function recipeGroups(balance) {
  const by = new Map();
  for (const [id, r] of Object.entries(balance.recipes)) {
    if (!by.has(r.use)) by.set(r.use, []);
    by.get(r.use).push(id);
  }
  const uses = [...by.keys()].sort((a, b) => {
    const ia = USE_ORDER.indexOf(a) < 0 ? 99 : USE_ORDER.indexOf(a);
    const ib = USE_ORDER.indexOf(b) < 0 ? 99 : USE_ORDER.indexOf(b);
    return ia - ib;
  });
  return uses.map((use) => ({ use, ids: by.get(use) }));
}

/** Flat list for paging: [{type:'group', use}, {type:'recipe', id}, ...]. */
export function recipeRows(balance) {
  return recipeGroups(balance).flatMap((g) => [{ type: 'group', use: g.use }, ...g.ids.map((id) => ({ type: 'recipe', id }))]);
}

/**
 * Split rows into pages that fit `maxH` px. A group header is never the last row of a page.
 * @param {{type:string}[]} rows
 * @param {{group:number, recipe:number, gap:number}} h row heights
 * @returns {object[][]}
 */
export function paginateRows(rows, maxH, h) {
  const pages = [];
  let cur = [];
  let used = 0;
  const height = (r) => (r.type === 'group' ? h.group : h.recipe) + h.gap;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // a header needs room for itself and the recipe after it
    const need = height(r) + (r.type === 'group' && rows[i + 1] ? height(rows[i + 1]) : 0);
    if (cur.length && used + need > maxH) { pages.push(cur); cur = []; used = 0; }
    cur.push(r);
    used += height(r);
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/** Quantity of an item in the bag plus the stockpile. */
export const haveCount = (state, id) => countItem(state.inventory, id) + countItem(state.stockpile, id);

/** Cost with what the hero has: [{id, need, have, ok}]. */
export function costLines(state, cost) {
  return Object.entries(cost).map(([id, need]) => {
    const have = haveCount(state, id);
    return { id, need, have, ok: have >= need };
  });
}

/** Pay a cost (bag first, then stockpile). Call only after checking; returns false and pays nothing if short. */
export function payCost(state, cost) {
  if (!costLines(state, cost).every((l) => l.ok)) return false;
  for (const [id, qty] of Object.entries(cost)) {
    const fromBag = removeItem(state.inventory, id, qty);
    if (fromBag < qty) removeItem(state.stockpile, id, qty - fromBag);
  }
  return true;
}

/**
 * Can this recipe be crafted now? Structural reasons come first, missing materials last.
 * @returns {{ok:boolean, reason?:string, kind:string}}
 */
export function craftCheck(state, tower, balance, id) {
  const r = balance.recipes[id];
  if (!r) return { ok: false, reason: 'Unknown recipe', kind: 'item' };
  const kind = recipeKind(r);
  const no = (reason) => ({ ok: false, reason, kind });
  if (r.workbenchLevel > workbenchLevel(state)) return no(`Needs workbench Lv${r.workbenchLevel}`);
  if (kind === 'barricade') {
    const why = barricadeBlock(state, balance, r.effect.level);
    if (why) return no(why);
  } else if (kind === 'repair') {
    const why = repairBlock(state, balance);
    if (why) return no(why);
  } else if (kind === 'secure') {
    const cands = secureCandidates(state);
    if (!cands.length) return no('No Cleared floor');
    if (!cands.some((f) => f.ok)) return no(cands[0].reason);
  } else if (kind === 'place' && !freeSpots(state, tower, balance, r.buildSpot).length) {
    return no('No free spot');
  }
  const missing = costLines(state, r.cost).filter((l) => !l.ok);
  if (missing.length) {
    return no(`Missing: ${missing.map((l) => `${l.need - l.have} ${(balance.items[l.id]?.name || l.id).toLowerCase()}`).join(', ')}`);
  }
  return { ok: true, kind };
}

const hours = (h) => (h === 1 ? 'hour' : `${h} h`);

/** One-line description of what a recipe gives. */
export function effectText(balance, id) {
  const r = balance.recipes[id];
  const e = r.effect;
  const item = (i) => (balance.items[i]?.name || i).toLowerCase();
  if (!e) {
    const out = Object.entries(r.output || {}).map(([i, q]) => `${q} ${item(i)}`).join(', ');
    return `Makes ${out}. Goes to your bag.`;
  }
  if (isProducerRecipe(r) && e.type === 'producer') {
    return `+${e.qty} ${item(e.produces)} every ${hours(e.intervalHours)}, holds ${e.maxStored}.${e.waterPerUnit ? ' Uses water.' : ''} ${r.buildSpot === 'window' ? 'Window' : 'Floor'} spot.`;
  }
  if (e.type === 'converter') return `1 ${item(e.input)} to ${e.qty} ${item(e.produces)} per ${hours(e.intervalHours)}. Queue of ${e.queueMax}. Floor spot.`;
  if (e.type === 'barricade') {
    const lv = barricadeLevel(balance, e.level);
    return `Stairwell. HP ${lv.hp}, defense +${lv.defense}.${lv.requiresLevel ? ' Replaces Lv1.' : ''}`;
  }
  if (e.type === 'repair_barricade') return `Restores ${balance.barricade.repairHpPerWood} barricade HP.`;
  if (e.type === 'secure_floor') return `Cleared floor becomes Secured, defense +${balance.attacks.securedFloorDefense}.`;
  if (e.type === 'survivor_bed') return 'A bed for a survivor to move in. Floor spot.';
  return '';
}

/**
 * Craft. Validates, pays and applies in one go.
 * @param {object} state
 * @param {object} tower
 * @param {object} balance
 * @param {string} id recipe id
 * @param {{spot?:string, floor?:number, loc?:{floor:number,x:number}}} [target] spot key for placeables,
 *   floor number for Secure floor, loc for where overflow piles appear
 * @returns {{ok:boolean, reason?:string, kind:string, gained?:object, placed?:object}}
 */
export function performCraft(state, tower, balance, id, target = {}) {
  const check = craftCheck(state, tower, balance, id);
  if (!check.ok) return check;
  const r = balance.recipes[id];
  const { kind } = check;
  const fail = (reason) => ({ ok: false, reason, kind });
  if (kind === 'place') {
    const free = freeSpots(state, tower, balance, r.buildSpot);
    if (!free.some((s) => s.key === target.spot)) return fail('Pick a free spot');
  } else if (kind === 'secure') {
    const f = secureCandidates(state).find((x) => x.floor === target.floor);
    if (!f) return fail('Pick a Cleared floor');
    if (!f.ok) return fail(f.reason);
  }
  payCost(state, r.cost);
  const out = { ok: true, kind };
  if (kind === 'item') {
    const items = Object.entries(r.output).map(([i, qty]) => ({ id: i, qty }));
    out.gained = deliver(state, balance, items, target.loc || { floor: tower.homeFloor, x: tower.stairwell.entryX });
    out.items = items;
  } else if (kind === 'place') out.placed = placeObject(state, tower, balance, id, target.spot);
  else if (kind === 'barricade') out.placed = buildBarricade(state, balance, r.effect.level);
  else if (kind === 'repair') out.restored = repairBarricade(state, balance);
  else if (kind === 'secure') secureFloor(state, target.floor);
  return out;
}
