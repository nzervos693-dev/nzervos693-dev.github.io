/**
 * Stashes of the HQ (GDD 5.3 placement, 5.19 "Stashes"). Pure, no Phaser.
 *
 * ONE POOL. state.stockpile is a single slots array; state.stashes lists the stashes that make it up, each a section of
 * it { id, unit, tile:[x,y], slots, offset }. Every system that reads state.stockpile (crafting, building, Store / Take,
 * auto-eat, producers) therefore treats all HQ stashes as one pool, carried items first (as before), then the stashes in
 * array order: the start flat's stash, then the merged units' stashes nearest first (fixed when the HQ is claimed).
 * The Bag shows the pool as one "HQ" tab with a section per stash.
 *
 * Claiming the HQ gives every merged unit without a stash a hq.newUnitStashSlots-slot stash on the free tile nearest its
 * front door that keeps every doorway and access tile reachable (placeStashTile).
 */
import { EDGE, TILE } from '../iso/grid.js';
import { FACING_STEP, gridFacing } from '../iso/loader.js';
import { createSlots, normalizeSlots } from './inventory.js';

/** Id of the start flat's stash (the fixture authored in floors_iso.json home.stash). */
export const START_STASH = 'stash';

/** The start flat's stash entry from the floor data. */
function startEntry(floor) {
  const st = floor.home?.stash;
  return { id: START_STASH, unit: floor.home?.unit ?? null, tile: st ? [st.tile[0], st.tile[1]] : [0, 0], slots: st?.slots ?? 40, offset: 0 };
}

/** Sanitise state.stashes against the floor (start stash first, known units only, offsets recomputed) and size the pool. */
export function normalizeStashes(state, floor, balance) {
  const list = [startEntry(floor)];
  const seen = new Set([START_STASH]);
  for (const e of Array.isArray(state.stashes) ? state.stashes : []) {
    if (!e || typeof e.id !== 'string' || seen.has(e.id) || !Array.isArray(e.tile) || !floor.units.some((u) => u.id === e.unit)) continue;
    seen.add(e.id);
    list.push({ id: e.id, unit: e.unit, tile: [e.tile[0] | 0, e.tile[1] | 0], slots: Math.max(1, e.slots | 0 || balance.hq.newUnitStashSlots), offset: 0 });
  }
  let off = 0;
  for (const e of list) { e.offset = off; off += e.slots; }
  state.stashes = list;
  state.stockpile = normalizeSlots(state.stockpile, off, balance.items);
  return list;
}

/**
 * A save from before merged stashes existed (claimed HQ, only the start flat's stash): give the merged units theirs now.
 * Call after applyStashesToFloor and before the views are built. @returns {{entry:object, object:object}[]} stashes created
 */
export function ensureMergedStashes(state, floor, balance) {
  normalizeStashes(state, floor, balance);
  return state.hq?.claimed && state.stashes.length === 1 ? createMergedStashes(state, floor, balance) : [];
}

/** The stash object (a fixture on a free tile) for an entry. */
export function stashObject(entry, floor) {
  const [x, y] = entry.tile;
  return {
    id: entry.id, objectId: 'toolbox', tile: [x, y], span: [1, 1], facing: 'S', unit: entry.unit, tiles: [{ x, y }],
    facingAngle: gridFacing('S'), mounted: false, blocks: true, fixture: true, stash: true, slots: entry.slots, roomIndex: floor.roomAt(x, y),
  };
}

/** Put the stash of an entry into the floor model (object list and a furniture obstacle). @returns {object|null} the new object, null if it already exists */
export function addStashToFloor(floor, entry) {
  if (floor.objectById.has(entry.id)) return null;
  const o = stashObject(entry, floor);
  floor.objects.push(o);
  floor.objectById.set(o.id, o);
  floor.grid.setObstacle(entry.tile[0], entry.tile[1], true);
  return o;
}

/** Add the saved merged stashes to a freshly loaded floor (before the views are built). */
export function applyStashesToFloor(state, floor) {
  for (const e of state.stashes ?? []) if (e.id !== START_STASH) addStashToFloor(floor, e);
}

// ---- placement (5.3 rule) -------------------------------------------------------------------------

const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Tiles of a unit that must stay free: both sides of every door and doorway of the unit, and the tiles in front of its objects. */
function protectedTiles(floor, unit, inside) {
  const g = floor.grid;
  const set = new Set();
  const add = (x, y) => { if (inside(x, y)) set.add(y * g.width + x); };
  for (const d of floor.doors) for (const t of g.doorTiles(d)) add(t.x, t.y);
  for (const dw of floor.doorways ?? []) {
    const e = dw.edge;
    const a = e.side === 'N' ? [e.x, e.y - 1, e.x, e.y] : [e.x - 1, e.y, e.x, e.y];
    add(a[0], a[1]); add(a[2], a[3]);
  }
  for (const o of floor.objects) {
    if (o.mounted || o.unit !== unit.id || o.stash) continue;
    const step = FACING_STEP[o.facing] ?? [0, 1];
    const own = new Set(o.tiles.map((t) => t.y * g.width + t.x));
    for (const t of o.tiles) {
      const fx = t.x + step[0];
      const fy = t.y + step[1];
      if (!own.has(fy * g.width + fx)) add(fx, fy);
    }
  }
  return set;
}

/** Tiles reachable from `start` over free tiles of the unit (doors and gaps pass, walls and windows do not), skipping `blocked`. */
function reachable(g, start, inside, blockedIdx) {
  const W = g.width;
  const seen = new Set([start]);
  const queue = [start];
  const order = [start];
  while (queue.length) {
    const c = queue.shift();
    const cx = c % W;
    const cy = (c / W) | 0;
    for (const [dx, dy] of NEIGH) {
      const nx = cx + dx;
      const ny = cy + dy;
      const ni = ny * W + nx;
      if (seen.has(ni) || ni === blockedIdx || !inside(nx, ny) || !g.isWalkable(nx, ny) || g.kindAt(nx, ny) === TILE.STAIRS) continue;
      const t = g.edges[g.edgeBetween(cx, cy, nx, ny)];
      if (t !== EDGE.NONE && t !== EDGE.DOOR) continue;
      seen.add(ni);
      queue.push(ni);
      order.push(ni);
    }
  }
  return { seen, order };
}

/**
 * The tile for a unit's new stash: the free tile nearest its front door (by walking) inside the unit that keeps every doorway,
 * object access tile and other free tile of the unit reachable. null when the unit has no room.
 * @param {object} floor from loadIsoFloor (with the current obstacles) @param {{id:string, rect:number[]}} unit
 * @param {Set<number>} [avoid] tile indices that are taken (the hero stands there, a pile lies there)
 * @returns {{x:number,y:number}|null}
 */
export function placeStashTile(floor, unit, avoid = null) {
  const g = floor.grid;
  const [rx, ry, rw, rh] = unit.rect;
  const inside = (x, y) => x >= rx && y >= ry && x < rx + rw && y < ry + rh && g.isFloor(x, y);
  const front = floor.doors.find((d) => d.kind === 'front' && d.unit === unit.id);
  let startTile = null;
  if (front) startTile = g.doorTiles(front).find((t) => inside(t.x, t.y)) ?? null;
  if (!startTile) {
    for (let y = ry; y < ry + rh && !startTile; y++) for (let x = rx; x < rx + rw; x++) if (inside(x, y) && g.isWalkable(x, y)) { startTile = { x, y }; break; }
  }
  if (!startTile) return null;
  const start = startTile.y * g.width + startTile.x;
  const base = reachable(g, start, inside, -1);
  const keep = protectedTiles(floor, unit, inside);
  for (const idx of base.order) {
    if (keep.has(idx) || avoid?.has(idx)) continue;
    const r = reachable(g, start, inside, idx);
    let ok = true;
    for (const t of base.seen) if (t !== idx && !r.seen.has(t)) { ok = false; break; }
    if (ok) return { x: idx % g.width, y: (idx / g.width) | 0 };
  }
  return null;
}

/**
 * Claiming the HQ: give every merged unit without a stash its own (hq.newUnitStashSlots slots), nearest to the start flat's
 * stash first, and grow the pool. Mutates state.stashes, state.stockpile and the floor's objects / obstacles.
 * @returns {{entry:object, object:object}[]} the stashes created
 */
export function createMergedStashes(state, floor, balance) {
  normalizeStashes(state, floor, balance);
  const origin = state.stashes[0].tile;
  const have = new Set(state.stashes.map((e) => e.unit));
  const units = floor.units.filter((u) => !have.has(u.id)).map((u) => ({ u, d: Math.hypot(u.rect[0] + u.rect[2] / 2 - origin[0], u.rect[1] + u.rect[3] / 2 - origin[1]) }));
  units.sort((a, b) => a.d - b.d);
  const avoid = new Set();
  const W = floor.grid.width;
  if (state.hero) avoid.add(Math.floor(state.hero.y) * W + Math.floor(state.hero.x));
  for (const p of state.piles ?? []) if (p.floor === undefined || p.floor === floor.number) avoid.add(Math.floor(p.y ?? 0) * W + Math.floor(p.x));
  const made = [];
  for (const { u } of units) {
    const t = placeStashTile(floor, u, avoid);
    if (!t) continue;
    const last = state.stashes[state.stashes.length - 1];
    const entry = { id: `stash:${u.id}`, unit: u.id, tile: [t.x, t.y], slots: balance.hq.newUnitStashSlots, offset: last.offset + last.slots };
    state.stashes.push(entry);
    state.stockpile.push(...createSlots(entry.slots));
    made.push({ entry, object: addStashToFloor(floor, entry) });
  }
  return made;
}

// ---- reading the pool ---------------------------------------------------------------------------------

/** Sections of the pool for the Bag's HQ tab: [{ id, unit, tile, slots, offset }]. */
export const stashSections = (state) => state.stashes ?? [];

/** Slots of one stash (a view into the pool array). */
export const sectionSlots = (state, entry) => state.stockpile.slice(entry.offset, entry.offset + entry.slots);

/**
 * Lose random stacks from the stash nearest the heart (GDD 5.20 online breach): the nearest stash with something in it, one
 * random stack each time. @param {{x:number,y:number}} heart @returns {{id:string,qty:number}|null} the stack lost
 */
export function loseHeartStack(state, heart, rng) {
  const list = [...(state.stashes ?? [])].sort((a, b) => Math.hypot(a.tile[0] - heart.x, a.tile[1] - heart.y) - Math.hypot(b.tile[0] - heart.x, b.tile[1] - heart.y));
  for (const e of list) {
    const idx = [];
    for (let i = e.offset; i < e.offset + e.slots; i++) if (state.stockpile[i]) idx.push(i);
    if (!idx.length) continue;
    const pick = idx[Math.floor(rng() * idx.length)];
    const lost = { id: state.stockpile[pick].id, qty: state.stockpile[pick].qty };
    state.stockpile[pick] = null;
    return lost;
  }
  return null;
}
