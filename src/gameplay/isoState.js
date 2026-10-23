/**
 * Game state of the isometric world (Stage A: one floor). Pure data + helpers, no Phaser.
 *
 * Same shape as the side-view state where the shared systems read it (needs, inventory, stockpile,
 * objects, piles, build.barricade, notes, stats, times, equipped, floorStates, zombies) so needs,
 * loot, salvage, crafting and combat rules keep working. Differences:
 *   world      ISO_WORLD marker: a save without it is a side-view save ("The building has changed.")
 *   hero       { floor, x, y, facing }   continuous tile units, grid-angle facing
 *   zombies    { id, type, floor, x, y, homeX, homeY, hp, dead, facing }
 *   doors      { [doorId]: { state, hp, hits, barricade } }
 *   seen       { [floor]: 'WxH:base64' } vision memory
 *   edges      { [floor]: { 'x.y.N|W': override } } built / demolished edges (isoStructures)
 *   hq         { claimed, claimedAt } (isoHq)
 *   heart      { bedId } the bed last slept in inside the HQ (isoHeart)
 *   stashes    [{ id, unit, tile, slots, offset }] the sections of stockpile, one pool (isoStash)
 *   attacks    { scriptedDone, nextAt, kind, current } (attacks.js): the first attack comes 10 min after New game
 *   piles      { id, floor, x, y, items } on a tile
 */
import { createSlots, normalizeSlots } from './inventory.js';
import { initNeeds, NEED_KEYS } from './needs.js';
import { makeZombie } from './zombies.js';
import { normalizeStashes } from './isoStash.js';
import { attackState, startAttackClock } from './attacks.js';

/** Marker for the isometric world. Bump when the iso save shape changes. */
export const ISO_WORLD = 'iso-1';
export const ISO_STATE_VERSION = 3; // 3: C2 edges / hq / heart / stashes / attacks (missing keys default, old v2 saves load)
/** The one line shown when an older save is dropped. */
export const STALE_SAVE_LINE = 'The building has changed.';

/** Is this saved game from another world (side view or an older iso shape)? Empty saves are not stale. */
export function isStaleSave(game) {
  return !!game && game.started === true && game.world !== ISO_WORLD;
}

/**
 * The slice of the old "tower" API that crafting, building and floor-state helpers read.
 * Apartments stay empty in Stage A: placeables find no spot (their build UI is not part of Stage A).
 * @param {object} floor model from loadIsoFloor
 */
export function buildIsoTower(floor) {
  const objects = new Map();
  for (const o of floor.objects) objects.set(o.id, { placement: o, floor: floor.number, apt: floor.units.find((u) => u.id === o.unit) ?? null });
  return {
    floors: new Map([[floor.number, { number: floor.number, apartments: [], scriptedSpawns: [] }]]),
    apartments: new Map(), objects, home: null, homeFloor: floor.number,
    stairwell: { entryX: floor.home.heroStart.x }, floorMin: floor.number, floorMax: floor.number,
  };
}

/** Tile-centre record of a zombie authored in the data. */
function zombieRecord(z, floor, balance) {
  return makeZombie(z.id, z.type, floor.number, z.x + 0.5, balance, { y: z.y + 0.5, homeX: z.x + 0.5, homeY: z.y + 0.5, facing: z.facing });
}

/**
 * Fresh state for a New game: hero in the start flat's bedroom, the start flat remembered.
 * @param {object} balance @param {object} floor from loadIsoFloor @param {number} nowMs
 */
export function createIsoState(balance, floor, nowMs) {
  const h = floor.home.heroStart;
  const state = {
    v: ISO_STATE_VERSION,
    world: ISO_WORLD,
    started: true,
    hero: { floor: floor.number, x: h.x + 0.5, y: h.y + 0.5, facing: h.facing },
    inventory: createSlots(balance.inventory.carrySlots),
    stockpile: createSlots(floor.home.stash?.slots ?? balance.inventory.stockpileSlots), stashes: [],
    needs: initNeeds(balance),
    lastNapAt: null, objects: {}, doors: {}, floorStates: { [floor.number]: 'Infested' }, zombies: {}, wanderAt: {},
    equipped: null, quickUse: { id: null, chosen: false }, piles: [], build: { spots: {}, barricade: { level: 0, hp: 0 }, breachLatched: false },
    rooms: {}, notes: [], survivors: {}, activeId: 'hero', bodies: [],
    story: { tutorial: 'skipped', walked: true, doorOpened: true }, // Stage A: no tutorial (GDD 11.3)
    attacks: { scriptedDone: false, nextAt: null, kind: 'scripted', current: null }, // the scripted first attack is set below
    flags: {}, stats: { objectsSalvaged: 0, zombiesKilled: 0 }, counters: { pile: 0, wander: 0 },
    seen: {}, edges: {}, hq: { claimed: false, claimedAt: null }, thoughts: { darkInHere: false },
    times: { startedAt: nowMs, lastTickAt: nowMs },
  };
  startAttackClock(state, balance, nowMs); // the first attack arrives firstAttackDelayMinutes after a New game (GDD 11.3)
  return normalizeIsoState(state, balance, floor, nowMs);
}

/**
 * Complete a (possibly partial) iso state. Returns null for a stale (non-iso) save: callers show
 * STALE_SAVE_LINE and start a New game.
 * @returns {object|null}
 */
export function normalizeIsoState(raw, balance, floor, nowMs) {
  if (!raw || typeof raw !== 'object' || raw.world !== ISO_WORLD) return null;
  const s = raw;
  s.v = ISO_STATE_VERSION;
  s.started = true;
  const hs = floor.home.heroStart;
  const okHero = s.hero && Number.isFinite(s.hero.x) && Number.isFinite(s.hero.y) && floor.grid.isFloor(Math.floor(s.hero.x), Math.floor(s.hero.y));
  s.hero = okHero ? { floor: floor.number, x: s.hero.x, y: s.hero.y, facing: Number.isFinite(s.hero.facing) ? s.hero.facing : hs.facing } : { floor: floor.number, x: hs.x + 0.5, y: hs.y + 0.5, facing: hs.facing };
  s.inventory = normalizeSlots(s.inventory, balance.inventory.carrySlots, balance.items);
  normalizeStashes(s, floor, balance); // the stockpile is the pool of all stashes
  const def = initNeeds(balance);
  s.needs = { ...def, ...(s.needs || {}) };
  for (const k of NEED_KEYS) if (!Number.isFinite(s.needs[k])) s.needs[k] = def[k];
  s.objects = s.objects || {};
  for (const o of floor.objects) if (o.empty && !s.objects[o.id]) s.objects[o.id] = { searched: true };
  s.doors = s.doors || {};
  s.floorStates = s.floorStates || { [floor.number]: 'Infested' };
  s.piles = (Array.isArray(s.piles) ? s.piles : []).filter((p) => p && Array.isArray(p.items) && Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.items.every((e) => e && balance.items[e.id] && e.qty > 0));
  s.counters = { pile: 0, wander: 0, ...(s.counters || {}) };
  s.rooms = s.rooms || {};
  s.notes = Array.isArray(s.notes) ? s.notes : [];
  s.survivors = s.survivors || {};
  s.activeId = 'hero';
  s.bodies = [];
  s.story = { tutorial: 'skipped', walked: true, doorOpened: true };
  normalizeAttacks(s, balance, nowMs);
  s.heart = typeof s.heart?.bedId === 'string' ? { bedId: s.heart.bedId } : null;
  s.flags = s.flags || {};
  s.lastNapAt = Number.isFinite(s.lastNapAt) ? s.lastNapAt : null;
  s.stats = { objectsSalvaged: 0, zombiesKilled: 0, ...(s.stats || {}) };
  s.equipped = s.equipped && Number.isInteger(s.equipped.slot) && typeof s.equipped.id === 'string' ? s.equipped : null;
  const qu = s.quickUse && typeof s.quickUse === 'object' ? s.quickUse : {};
  s.quickUse = { id: typeof qu.id === 'string' && balance.items[qu.id] ? qu.id : null, chosen: !!qu.chosen };
  s.times = { startedAt: nowMs, lastTickAt: nowMs, ...(s.times || {}) };
  s.seen = s.seen && typeof s.seen === 'object' ? s.seen : {};
  s.thoughts = s.thoughts || {};
  const b = s.build && typeof s.build === 'object' ? s.build : {};
  const bc = b.barricade || {};
  const lv = balance.barricade.levels.find((l) => l.level === bc.level);
  s.edges = s.edges && typeof s.edges === 'object' ? s.edges : {};
  s.hq = { claimed: !!s.hq?.claimed, claimedAt: s.hq?.claimed && Number.isFinite(s.hq.claimedAt) ? s.hq.claimedAt : null };
  const piece = balance.build?.pieces?.includes(b.selectedPiece) ? b.selectedPiece : balance.build?.defaultPiece ?? 'wall';
  s.build = { ...b, selectedPiece: piece, spots: b.spots || {}, barricade: lv ? { level: lv.level, hp: Math.max(0, Math.min(lv.hp, Number.isFinite(bc.hp) ? bc.hp : 0)) } : { level: 0, hp: 0 }, breachLatched: !!b.breachLatched };
  // zombies: authored ones keep their record, new ones are created, removed ones are dropped
  const zs = s.zombies && typeof s.zombies === 'object' ? s.zombies : {};
  const wanted = new Set();
  for (const z of floor.zombies) {
    wanted.add(z.id);
    const old = zs[z.id];
    if (!balance.zombies.types[z.type]) continue;
    if (!old || !Number.isFinite(old.x) || !Number.isFinite(old.y) || !Number.isFinite(old.hp)) zs[z.id] = zombieRecord(z, floor, balance);
  }
  for (const id of Object.keys(zs)) if (!wanted.has(id) || zs[id].siege) delete zs[id]; // attackers of a fight cut short are settled offline, never restored
  s.zombies = zs;
  return s;
}

/**
 * The attack record: a Stage A save (placeholder "no attacks": scriptedDone with no time set) starts the scripted first attack
 * firstAttackDelayMinutes from now; anything else is kept as saved (sanitised).
 */
export function normalizeAttacks(s, balance, nowMs) {
  const raw = s.attacks && typeof s.attacks === 'object' ? s.attacks : null;
  const legacy = !raw || (raw.scriptedDone === true && raw.nextAt == null && !raw.current);
  const a = { scriptedDone: !legacy && !!raw.scriptedDone, nextAt: !legacy && Number.isFinite(raw.nextAt) ? raw.nextAt : null, kind: raw?.kind === 'scheduled' ? 'scheduled' : 'scripted', current: null };
  const c = raw?.current;
  if (!legacy && c && typeof c === 'object' && Number.isFinite(c.total) && Number.isFinite(c.killed)) {
    a.current = { kind: c.kind === 'scheduled' ? 'scheduled' : 'scripted', strength: Number.isFinite(c.strength) ? c.strength : 0, total: c.total, killed: c.killed, ...(c.broke ? { broke: true } : {}) };
  }
  s.attacks = a;
  if (legacy) { a.scriptedDone = false; startAttackClock(s, balance, nowMs); }
  return attackState(s);
}

/** Copy saved door states onto the grid's doors (load). */
export function applyDoorsToGrid(state, floor) {
  const g = floor.grid;
  for (const d of floor.doors) {
    const rec = state.doors[d.id];
    if (!rec) continue;
    if (['open', 'closed', 'jammed', 'broken'].includes(rec.state)) g.setDoorState(d, rec.state);
    if (Number.isFinite(rec.hp)) d.hp = Math.max(0, Math.min(d.maxHp, rec.hp));
    d.hits = rec.hits || 0;
    if (rec.barricade) {
      g.setBarricade(d, rec.barricade);
      if (Number.isFinite(rec.barricade.level)) d.barricade.level = rec.barricade.level; // per-door barricade level (HQ doors)
    }
  }
}

/** Write the grid's door states into the state (before every save). */
export function snapshotDoors(state, floor) {
  for (const d of floor.doors) {
    state.doors[d.id] = { state: d.state, hp: d.hp, hits: d.hits || 0, barricade: d.barricade ? { own: d.barricade.own, hp: d.barricade.hp, ...(d.barricade.level ? { level: d.barricade.level } : {}) } : null };
  }
}

/** The home front door (barricade spot) of the floor. */
export const homeFrontDoor = (floor) => floor.doors.find((d) => d.id === floor.home.frontDoor) ?? null;

/** Living zombies are gone: the floor becomes Cleared (never back). @returns {boolean} just cleared */
export function updateIsoFloorState(state, floorNumber) {
  if (state.floorStates[floorNumber] !== 'Infested') return false;
  for (const id in state.zombies) if (!state.zombies[id].dead) return false;
  state.floorStates[floorNumber] = 'Cleared';
  return true;
}
