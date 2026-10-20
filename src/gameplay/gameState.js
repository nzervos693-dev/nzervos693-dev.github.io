/**
 * Persistent game state (lives in getSave().game). Pure data + helpers, no Phaser.
 */
import { initNeeds, NEED_KEYS } from './needs.js';
import { createSlots, normalizeSlots, addAll, addItem } from './inventory.js';
import { homeSpot, roomKey } from './layout.js';
import { mergeItems } from './rng.js';

export const STATE_VERSION = 1;
/**
 * STATE_MIGRATIONS[n] upgrades a version-n game state to n+1 (same pattern as core/save.js).
 * Add a step and bump STATE_VERSION when the shape changes.
 */
export const STATE_MIGRATIONS = {
  // 1: (s) => ({ ...s, v: 2, newField: 0 }),
};

/** Stockpile slots: base plus storage shelves built (+20 each, from M2). */
export function stockpileCapacity(state, balance) {
  const extra = balance.inventory.shelfSlots ?? 20;
  return balance.inventory.stockpileSlots + (state?.shelves || 0) * extra;
}

/** Apply migrations from the state's version up to STATE_VERSION. Unknown/newer: unchanged. */
export function migrateState(raw) {
  let s = raw;
  while (s && Number.isInteger(s.v) && s.v < STATE_VERSION) {
    const step = STATE_MIGRATIONS[s.v];
    if (!step) break;
    const next = step(s);
    if (!next || !(next.v > s.v)) break;
    s = next;
  }
  return s;
}
/** Piles on the same floor within this many px are merged into one. */
export const PILE_MERGE_PX = 40;

/**
 * Fresh state for a new game: hero in the home apartment, home rooms entered.
 * @param {object} balance
 * @param {object} tower from buildTower
 * @param {number} nowMs
 */
export function createGameState(balance, tower, nowMs) {
  const spot = homeSpot(tower);
  const state = {
    v: STATE_VERSION,
    started: true,
    hero: { floor: spot.floor, x: spot.x },
    inventory: createSlots(balance.inventory.carrySlots),
    stockpile: createSlots(balance.inventory.stockpileSlots),
    needs: initNeeds(balance),
    objects: {},
    doors: {},
    floorStates: {},
    piles: [],
    rooms: {},
    notes: [],
    survivors: {},
    flags: {},
    stats: { objectsSalvaged: 0 },
    times: { startedAt: nowMs, lastTickAt: nowMs },
  };
  return normalizeGameState(state, balance, tower, nowMs);
}

/**
 * Fill any missing fields (old/partial saves) without losing existing data.
 * @returns {object} the same object, completed
 */
export function normalizeGameState(raw, balance, tower, nowMs) {
  const s = migrateState(raw && typeof raw === 'object' ? raw : {});
  const spot = homeSpot(tower);
  s.v = STATE_VERSION;
  s.started = true;
  s.hero = s.hero && Number.isFinite(s.hero.x) && tower.floors.has(s.hero.floor) ? s.hero : { floor: spot.floor, x: spot.x };
  s.inventory = normalizeSlots(s.inventory, balance.inventory.carrySlots, balance.items);
  s.stockpile = normalizeSlots(s.stockpile, stockpileCapacity(s, balance), balance.items);
  const def = initNeeds(balance);
  s.needs = { ...def, ...(s.needs || {}) };
  for (const k of NEED_KEYS) if (!Number.isFinite(s.needs[k])) s.needs[k] = def[k];
  s.objects = s.objects || {};
  s.doors = s.doors || {};
  s.floorStates = s.floorStates || {};
  s.piles = (Array.isArray(s.piles) ? s.piles : []).filter((p) => p && Array.isArray(p.items))
    .map((p) => ({ ...p, items: p.items.filter((e) => {
      const ok = e && balance.items[e.id] && e.qty > 0;
      if (!ok) console.warn('Dropping unknown pile item from save', e?.id);
      return ok;
    }) })).filter((p) => p.items.length);
  s.counters = { pile: 0, ...(s.counters || {}) };
  s.rooms = s.rooms || {};
  s.notes = Array.isArray(s.notes) ? s.notes : [];
  s.survivors = s.survivors || {};
  s.flags = s.flags || {};
  s.stats = { objectsSalvaged: 0, ...(s.stats || {}) };
  s.times = { startedAt: nowMs, lastTickAt: nowMs, ...(s.times || {}) };
  for (const apt of tower.apartments.values()) {
    if (!s.doors[apt.id]) s.doors[apt.id] = { state: apt.doorState || 'open', hits: 0 };
  }
  for (const [n, f] of tower.floors) if (!s.floorStates[n]) s.floorStates[n] = f.startState || 'Infested';
  if (tower.home) for (const r of tower.home.rooms) s.rooms[roomKey(tower.home, r)] = true;
  return s;
}

/** Per-object state (searched, drained, dismantled, leftover loot), created lazily. */
export function objState(state, id) {
  return (state.objects[id] ||= {});
}

/** Mark the room under x as entered. @returns {boolean} true if newly entered */
export function enterRoom(state, apt, room) {
  const k = roomKey(apt, room);
  if (state.rooms[k]) return false;
  state.rooms[k] = true;
  return true;
}

/** Context for item effects (Mara's Steady hands: bandages x1.5 while recruited and alive). */
export function heroCtx(state, balance) {
  const mara = state.survivors?.mara;
  const mult = mara?.recruited && !mara?.dead ? balance.survivors.roster.mara.trait.bandageHealMult : 1;
  return { bandageMult: mult };
}

/**
 * Drop items on the floor as a pile (merges with a nearby pile on the same floor).
 * @returns {object} the pile
 */
export function addPile(state, floor, x, items) {
  const list = mergeItems(items);
  let pile = state.piles.find((p) => p.floor === floor && Math.abs(p.x - x) <= PILE_MERGE_PX);
  if (!pile) {
    state.counters = state.counters || { pile: 0 };
    pile = { id: `pile_${++state.counters.pile}`, floor, x, items: [] };
    state.piles.push(pile);
  }
  pile.items = mergeItems([...pile.items, ...list]);
  return pile;
}

/**
 * Pick up what fits from a pile into the inventory; empty piles are removed.
 * @returns {{id:string, qty:number}[]} items actually taken
 */
export function takeFromPile(state, pile, balance) {
  const before = mergeItems(pile.items);
  const left = addAll(state.inventory, before, balance);
  const taken = before
    .map((e) => ({ id: e.id, qty: e.qty - (left.find((l) => l.id === e.id)?.qty || 0) }))
    .filter((e) => e.qty > 0);
  pile.items = left;
  if (!left.length) state.piles.splice(state.piles.indexOf(pile), 1);
  return taken;
}

/** Add a single quest item (e.g. medical bag) to the inventory. Returns true if it fit. */
export const giveItem = (state, id, qty, balance) => addItem(state.inventory, id, qty, balance) === 0;
