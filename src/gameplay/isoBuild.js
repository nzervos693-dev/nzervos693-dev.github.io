/**
 * Build, upgrade, fit, cover, repair and demolish rules for the HQ (GDD 5.19 / 5.20, Stage C2).
 * Pure, no Phaser. UI (piece 2) calls the can* functions to enable / grey buttons and to start the timed
 * action, then the do-function when the action completes (materials are taken at completion).
 *
 *   const ctx = { balance, structures, state };   // structures = floor.structures (createStructures)
 *   const r = canBuild(ctx, { x, y, side });       // no mutation
 *   const r = build(ctx, { x, y, side });          // checks again, then changes the world
 *
 * Every function returns a RESULT (see makeResult):
 *   { ok, code, message, action, edge, kind, piece, tier, toTier, target, seconds, energy, noise, noiseTiles,
 *     cost, missing, needTool, tool, salvage, dropped, consumed, toolBroke }
 * `salvage` is what the action gives (demolish yield, fit refund); in a do-function items that did not fit
 * the bag are in `dropped` and have been put in a pile on the hero's tile. `consumed` = materials taken.
 *
 * Rules (checked in this order): no_edge, not_floor15, exterior_wall / shaft_wall, landing_wall_reinforce_only,
 * not_hq (building outside the HQ), target-state codes, occupied, needs_tool, no_materials.
 * All numbers come from balance.json (build.*, structures.*, hq.*).
 */
import { EDGE_KIND, PIECE, damageStage, normEdge, edgeTiles, oppositeSide, pieceDef } from './isoStructures.js';
import { edgeTouchesHq, isHqClaimed } from './isoHq.js';
import { addAll, countItem, removeItem } from './inventory.js';
import { addPile } from './gameState.js';
import { noiseTiles } from './isoActions.js';

/** Result codes. Everything but OK is a refusal: nothing changed. */
export const BUILD_CODE = Object.freeze({
  OK: 'ok',
  NO_EDGE: 'no_edge', // not an edge of the floor (void on both sides, outside the grid)
  NOT_FLOOR15: 'not_floor15',
  NOT_HQ: 'not_hq', // building outside the claimed HQ (demolishing is allowed there)
  EXTERIOR_WALL: 'exterior_wall',
  SHAFT_WALL: 'shaft_wall',
  LANDING_WALL: 'landing_wall_reinforce_only', // "Load-bearing. Leave it."
  OCCUPIED: 'occupied', // "Something's in the way."
  NEEDS_TOOL: 'needs_tool',
  NO_MATERIALS: 'no_materials',
  NOTHING_HERE: 'nothing_here',
  WRONG_TARGET: 'wrong_target', // "That won't go there."
  NEEDS_WALL: 'needs_wall', // door / window selected on a gap
  NOTHING_TO_COVER: 'nothing_to_cover',
  ALREADY_COVERED: 'already_covered',
  MAX_TIER: 'max_tier', // "Can't go higher."
  FULL_HP: 'full_hp',
  CANNOT_REPAIR: 'cannot_repair', // glass
  BROKEN: 'broken', // a broken door: demolish it, don't repair / upgrade
  UNSUPPORTED: 'unsupported',
});

const MESSAGES = {
  no_edge: 'Nothing here.', not_floor15: 'Not here.', not_hq: 'Only inside the HQ.',
  exterior_wall: "Can't touch the outer wall.", shaft_wall: "Can't touch the stairwell.",
  landing_wall_reinforce_only: 'Load-bearing. Leave it.', occupied: "Something's in the way.",
  nothing_here: 'Nothing here.', wrong_target: "That won't go there.", needs_wall: 'Needs a wall first.',
  nothing_to_cover: 'Nothing to cover.', already_covered: 'Already covered.', max_tier: "Can't go higher.",
  full_hp: 'Nothing to repair.', cannot_repair: "Can't be repaired.", broken: "It's broken. Take it out.",
  unsupported: "That won't go there.",
};

const FIRE_AXE_KEY = { partitionWall: 'partition', woodWall: 'wood_wall', door: 'door', window: 'window', boards: 'boards' };

const itemName = (balance, id) => (balance.items?.[id]?.name ?? balance.materials?.[id]?.name ?? id).toLowerCase();
const toList = (obj) => Object.entries(obj ?? {}).map(([id, qty]) => ({ id, qty })).filter((e) => e.qty > 0);

// ---- shared helpers ---------------------------------------------------------------------------

/** Carried slots first, then the stockpile (the HQ stash pool). */
const poolOf = (state) => [state.inventory, state.stockpile].filter(Boolean);
const countAll = (pool, id) => pool.reduce((n, s) => n + countItem(s, id), 0);

/** First material of `cost` that the pool cannot cover: {id, qty (needed), have} or null. */
function missingMaterial(state, cost) {
  const pool = poolOf(state);
  for (const c of cost) {
    const have = countAll(pool, c.id);
    if (have < c.qty) return { id: c.id, qty: c.qty, have };
  }
  return null;
}

function takeMaterials(state, cost) {
  const pool = poolOf(state);
  for (const c of cost) {
    let left = c.qty;
    for (const slots of pool) left -= removeItem(slots, c.id, left);
  }
}

const hasTool = (state, id) => countItem(state.inventory, id) > 0;

/** Wear a carried tool; breaks (removed) at 0. @returns {boolean} true if it broke */
function wearTool(state, id, amount, fallbackUses) {
  const slots = state.inventory;
  const i = slots.findIndex((s) => s && s.id === id);
  if (i < 0) return false;
  const s = slots[i];
  s.uses = (s.uses ?? fallbackUses) - amount;
  if (s.uses <= 0) { slots[i] = null; return true; }
  return false;
}

/** Living characters whose centre blocks an edge: the hero and living zombies on the floor. */
function charactersOf(ctx) {
  if (ctx.characters) return ctx.characters;
  const out = [];
  const s = ctx.state;
  if (s.hero) out.push(s.hero);
  for (const id in s.zombies ?? {}) {
    const z = s.zombies[id];
    if (!z.dead && (z.floor === undefined || z.floor === ctx.structures.floor.number)) out.push(z);
  }
  return out;
}

function distToEdge(px, py, e) {
  const [x0, y0, x1, y1] = e.side === 'N' ? [e.x, e.y, e.x + 1, e.y] : [e.x, e.y, e.x, e.y + 1];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (x0 + t * dx), py - (y0 + t * dy));
}

/**
 * A character is standing IN the gap: its centre is closer to the edge than its own collision radius
 * (hero.collisionRadiusTiles; zombies use the same radius). Only building a wall on a gap checks this: fitting,
 * upgrading and covering work on a wall, which is a line, so a hero pressed against it never blocks himself.
 */
function bodyInGap(ctx, e) {
  const r = ctx.balance.hero.collisionRadiusTiles;
  for (const c of charactersOf(ctx)) if (distToEdge(c.x, c.y, e) < r) return true;
  return false;
}

/** A multi-tile object (bed, table ...) has its footprint on both sides of the edge. */
function blockedByFootprint(ctx, e) {
  const [a, b] = edgeTiles(e);
  for (const o of ctx.structures.floor.objects ?? []) {
    if (!o.blocks || !o.tiles || o.tiles.length < 2) continue;
    const inA = o.tiles.some((t) => t.x === a.x && t.y === a.y);
    const inB = o.tiles.some((t) => t.x === b.x && t.y === b.y);
    if (inA && inB) return true;
  }
  return false;
}

/** A wall-mounted object (not yet dismantled) hangs on the edge: it is on the wall behind its facing. */
function blockedByMounted(ctx, e) {
  for (const o of ctx.structures.floor.objects ?? []) {
    if (!o.mounted || !o.tile || ctx.state.objects?.[o.id]?.dismantled) continue;
    const side = oppositeSide(o.facing);
    if (!side) continue;
    const m = normEdge(o.tile[0], o.tile[1], side);
    if (m.x === e.x && m.y === e.y && m.side === e.side) return true;
  }
  return false;
}

function makeResult(ctx, action, d, code, extra = {}) {
  const r = {
    ok: code === BUILD_CODE.OK, code, message: MESSAGES[code] ?? null, action,
    edge: { x: d.x, y: d.y, side: d.side }, kind: d.kind, piece: d.piece, tier: d.tier, toTier: null, target: null,
    seconds: 0, energy: 0, noise: null, noiseTiles: 0, cost: [], missing: null, needTool: null, tool: null,
    salvage: [], dropped: [], consumed: [], toolBroke: null, ...extra,
  };
  if (r.noise) r.noiseTiles = noiseTiles(r.noise, ctx.balance);
  return r;
}

const refuse = (ctx, action, d, code, extra) => makeResult(ctx, action, d, code, extra);

/** Floor / edge checks shared by every action. @returns {string|null} a refusal code */
function baseRefusal(ctx, d) {
  if (d.kind === EDGE_KIND.NONE) return BUILD_CODE.NO_EDGE;
  if (ctx.structures.floor.number !== ctx.balance.hq.floor) return BUILD_CODE.NOT_FLOOR15;
  return null;
}

/** Building (not demolishing) needs a claimed HQ and an edge touching HQ tiles. */
function hqRefusal(ctx, d) {
  return isHqClaimed(ctx.state) && edgeTouchesHq(ctx.structures, d) ? null : BUILD_CODE.NOT_HQ;
}

const immutableCode = (d) => (d.kind === EDGE_KIND.EXTERIOR ? BUILD_CODE.EXTERIOR_WALL : BUILD_CODE.SHAFT_WALL);

/** Tool check for build / upgrade / repair / fit: all listed tools. @returns {string[]|null} missing tools */
function missingTools(ctx, action) {
  const need = ctx.balance.build.requiresTool[action] ?? [];
  const miss = need.filter((t) => !hasTool(ctx.state, t));
  return miss.length ? miss : null;
}

/** Common tail: tool, materials, then OK with timing. */
function finish(ctx, action, d, cost, base, extra = {}) {
  const b = ctx.balance.build;
  const tools = missingTools(ctx, action);
  const res = { cost, energy: b.buildEnergy, noise: b.buildNoise, ...extra };
  if (tools) return refuse(ctx, action, d, BUILD_CODE.NEEDS_TOOL, { ...res, needTool: tools, message: `Needs ${tools.map((t) => itemName(ctx.balance, t)).join(' and ')}` });
  const miss = missingMaterial(ctx.state, cost);
  if (miss) return refuse(ctx, action, d, BUILD_CODE.NO_MATERIALS, { ...res, missing: miss, message: `Needs ${miss.qty} ${itemName(ctx.balance, miss.id)}` });
  return makeResult(ctx, action, d, BUILD_CODE.OK, { ...res, ...base });
}

/** Give items to the bag; what does not fit goes to a pile on the hero's tile. @returns {{id,qty}[]} dropped */
function give(ctx, items) {
  if (!items.length) return [];
  const left = addAll(ctx.state.inventory, items, ctx.balance);
  if (left.length) {
    const h = ctx.state.hero ?? { x: 0, y: 0 };
    addPile(ctx.state, ctx.structures.floor.number, Math.floor(h.x) + 0.5, left, Math.floor(h.y) + 0.5);
  }
  return left;
}

/** Wrap a planner: `plan` is the pure check; the do-function re-runs it then commits. */
function run(ctx, plan, commit) {
  const r = plan();
  if (r.ok) commit(r);
  return r;
}

// ---- build: gap -> wood wall -----------------------------------------------------------------------

/** Can a wood wall be built on this gap? A broken perimeter wall (gap) may be rebuilt as wood, then upgraded. (no mutation) @returns {object} result */
export function canBuild(ctx, edge) {
  const d = ctx.structures.describe(edge.x, edge.y, edge.side);
  const bad = baseRefusal(ctx, d);
  if (bad) return refuse(ctx, 'build', d, bad);
  if (ctx.structures.isImmutableKind(d.kind)) return refuse(ctx, 'build', d, immutableCode(d));
  const hq = hqRefusal(ctx, d);
  if (hq) return refuse(ctx, 'build', d, hq);
  if (d.piece !== PIECE.GAP) return refuse(ctx, 'build', d, BUILD_CODE.WRONG_TARGET);
  if (bodyInGap(ctx, d) || blockedByFootprint(ctx, d) || blockedByMounted(ctx, d)) return refuse(ctx, 'build', d, BUILD_CODE.OCCUPIED);
  const def = ctx.balance.structures.walls.wood;
  return finish(ctx, 'build', d, toList(def.cost), { toTier: 'wood', seconds: def.buildSeconds });
}

/** Build a wood wall on a gap: takes materials, sets the wall, updates rooms / vision / paths. */
export function build(ctx, edge) {
  return run(ctx, () => canBuild(ctx, edge), (r) => {
    takeMaterials(ctx.state, r.cost);
    r.consumed = r.cost;
    ctx.structures.place(r.edge, { piece: PIECE.WALL, tier: 'wood' });
  });
}

// ---- upgrade -------------------------------------------------------------------------------------

/** Can the wall / door on this edge go up one tier? (no mutation) */
export function canUpgrade(ctx, edge) {
  const d = ctx.structures.describe(edge.x, edge.y, edge.side);
  const bad = baseRefusal(ctx, d);
  if (bad) return refuse(ctx, 'upgrade', d, bad);
  if (ctx.structures.isImmutableKind(d.kind)) return refuse(ctx, 'upgrade', d, immutableCode(d));
  const hq = hqRefusal(ctx, d);
  if (hq) return refuse(ctx, 'upgrade', d, hq);
  if (d.piece !== PIECE.WALL && d.piece !== PIECE.DOOR) return refuse(ctx, 'upgrade', d, BUILD_CODE.WRONG_TARGET);
  if (d.broken) return refuse(ctx, 'upgrade', d, BUILD_CODE.BROKEN);
  const s = ctx.balance.structures;
  const next = (d.piece === PIECE.WALL ? s.walls : s.doors)[d.tier].upgradeTo;
  if (!next) return refuse(ctx, 'upgrade', d, BUILD_CODE.MAX_TIER);
  const nd = (d.piece === PIECE.WALL ? s.walls : s.doors)[next];
  return finish(ctx, 'upgrade', d, toList(nd.cost), { toTier: next, seconds: nd.buildSeconds });
}

/** Upgrade one tier (never refunds, HP becomes the new tier's full HP). */
export function upgrade(ctx, edge) {
  return run(ctx, () => canUpgrade(ctx, edge), (r) => {
    takeMaterials(ctx.state, r.cost);
    r.consumed = r.cost;
    ctx.structures.retier(ctx.structures.rec(r.edge.x, r.edge.y, r.edge.side), r.toTier);
  });
}

// ---- fit a door or window into a wall ----------------------------------------------------------------

/** Refund of replacing a wall: build.fitRefundRatio of its build cost rounded down; block has an explicit list. */
function fitRefund(ctx, wallTier) {
  const def = ctx.balance.structures.walls[wallTier];
  if (def.fitRefund) return toList(def.fitRefund);
  const ratio = ctx.balance.build.fitRefundRatio;
  return toList(Object.fromEntries(Object.entries(def.cost ?? {}).map(([id, q]) => [id, Math.floor(q * ratio)])));
}

/**
 * Can a door or window be fitted into the wall on this edge? (no mutation)
 * @param {'door'|'window'} piece
 */
export function canFit(ctx, edge, piece) {
  const action = 'fit';
  const d = ctx.structures.describe(edge.x, edge.y, edge.side);
  const bad = baseRefusal(ctx, d);
  if (bad) return refuse(ctx, action, d, bad);
  if (piece !== PIECE.DOOR && piece !== PIECE.WINDOW) return refuse(ctx, action, d, BUILD_CODE.WRONG_TARGET);
  if (ctx.structures.isImmutableKind(d.kind)) return refuse(ctx, action, d, immutableCode(d));
  if (d.kind === EDGE_KIND.PERIMETER) return refuse(ctx, action, d, BUILD_CODE.LANDING_WALL);
  const hq = hqRefusal(ctx, d);
  if (hq) return refuse(ctx, action, d, hq);
  if (d.piece === PIECE.GAP) return refuse(ctx, action, d, BUILD_CODE.NEEDS_WALL);
  if (d.piece !== PIECE.WALL) return refuse(ctx, action, d, BUILD_CODE.WRONG_TARGET);
  if (blockedByFootprint(ctx, d) || blockedByMounted(ctx, d)) return refuse(ctx, action, d, BUILD_CODE.OCCUPIED);
  const def = piece === PIECE.DOOR ? ctx.balance.structures.doors.wood : ctx.balance.structures.windows.glass;
  return finish(ctx, action, d, toList(def.cost), { toTier: piece === PIECE.DOOR ? 'wood' : 'glass', seconds: def.buildSeconds, salvage: fitRefund(ctx, d.tier) });
}

/** Fit a wood door or glass window into a wall; gives the wall refund. An overlay (plating) stays on. */
export function fit(ctx, edge, piece) {
  return run(ctx, () => canFit(ctx, edge, piece), (r) => {
    takeMaterials(ctx.state, r.cost);
    r.consumed = r.cost;
    const old = ctx.structures.rec(r.edge.x, r.edge.y, r.edge.side);
    ctx.structures.place(r.edge, { piece, tier: r.toTier, overlay: old?.overlay ?? null });
    if (wearTool(ctx.state, 'sledgehammer', ctx.balance.build.sledgehammerUsesPerFit, ctx.balance.build.sledgehammerUses)) r.toolBroke = 'sledgehammer';
    r.dropped = give(ctx, r.salvage);
  });
}

// ---- overlays: boards on windows, plating on walls / doors / windows -----------------------------------

/** Keep the workbench front-door barricade record (state.build.barricade) in step with the barricade on that door. */
function syncFrontBarricade(ctx, door) {
  if (door.id !== ctx.structures.floor.home?.frontDoor || !ctx.state.build) return;
  const b = door.barricade;
  ctx.state.build.barricade = b && b.hp >= 0 ? { level: b.level ?? 1, hp: b.hp } : { level: 0, hp: 0 };
}

/** Barricade Lv1 / Lv2 on a door (GDD 5.20): the recipe's cost, buildSeconds[level - 1], the level's HP. Lv1 -> Lv2 is an upgrade. */
function canBarricade(ctx, d, def) {
  if (d.piece !== PIECE.DOOR) return refuse(ctx, 'overlay', d, BUILD_CODE.WRONG_TARGET);
  if (d.broken) return refuse(ctx, 'overlay', d, BUILD_CODE.BROKEN);
  const door = d.rec.door;
  if (d.rec.overlay) return refuse(ctx, 'overlay', d, BUILD_CODE.ALREADY_COVERED);
  const cur = door.barricade ? (door.barricade.level ?? 1) : 0;
  const level = cur + 1;
  const lv = ctx.balance.barricade.levels.find((l) => l.level === level);
  if (!lv) return refuse(ctx, 'overlay', d, cur > 0 ? BUILD_CODE.MAX_TIER : BUILD_CODE.WRONG_TARGET);
  const cost = toList(ctx.balance.recipes[`barricade_lv${level}`]?.cost);
  return finish(ctx, 'overlay', d, cost, { toTier: 'barricade', level, seconds: def.buildSeconds[level - 1], action: cur > 0 ? 'upgrade' : 'overlay' });
}

/**
 * Can an overlay be added? `kind` is 'boards' or 'plating' or 'barricade' (doors; Lv1, then Lv2 as an upgrade).
 * @param {'boards'|'plating'|'barricade'} kind
 */
export function canAddOverlay(ctx, edge, kind) {
  const action = 'overlay';
  const d = ctx.structures.describe(edge.x, edge.y, edge.side);
  const bad = baseRefusal(ctx, d);
  if (bad) return refuse(ctx, action, d, bad);
  const def = ctx.balance.structures.overlays[kind];
  if (!def) return refuse(ctx, action, d, BUILD_CODE.WRONG_TARGET);
  if (d.kind === EDGE_KIND.SHAFT || d.kind === EDGE_KIND.VOID) return refuse(ctx, action, d, BUILD_CODE.SHAFT_WALL);
  if (d.kind === EDGE_KIND.EXTERIOR && d.piece !== PIECE.WINDOW) return refuse(ctx, action, d, BUILD_CODE.EXTERIOR_WALL);
  const hq = hqRefusal(ctx, d);
  if (hq) return refuse(ctx, action, d, hq);
  if (d.piece === PIECE.GAP) return refuse(ctx, action, d, BUILD_CODE.NOTHING_TO_COVER);
  if (kind === 'barricade') return canBarricade(ctx, d, def);
  if (!def.on.includes(d.piece)) return refuse(ctx, action, d, BUILD_CODE.WRONG_TARGET);
  if (d.overlay) return refuse(ctx, action, d, BUILD_CODE.ALREADY_COVERED);
  return finish(ctx, action, d, toList(def.cost), { toTier: kind, seconds: def.buildSeconds });
}

/** Add boards or plating (full HP overlay). */
export function addOverlay(ctx, edge, kind) {
  return run(ctx, () => canAddOverlay(ctx, edge, kind), (r) => {
    takeMaterials(ctx.state, r.cost);
    r.consumed = r.cost;
    if (kind === 'barricade') {
      const rec = ctx.structures.rec(r.edge.x, r.edge.y, r.edge.side);
      ctx.structures.grid.setBarricade(rec.door, { own: true, hp: ctx.balance.barricade.levels.find((l) => l.level === r.level).hp });
      rec.door.barricade.level = r.level;
      if (ctx.state.build) ctx.state.build.breachLatched = false;
      syncFrontBarricade(ctx, rec.door);
      ctx.structures.touch(rec.eid);
      return;
    }
    const hp = ctx.balance.structures.overlays[kind].hp;
    ctx.structures.setOverlay(ctx.structures.rec(r.edge.x, r.edge.y, r.edge.side), { kind, hp, maxHp: hp });
  });
}

// ---- repair ----------------------------------------------------------------------------------------

/** Can the damaged overlay (first) or piece be repaired by one unit of its repair material? (no mutation) */
export function canRepair(ctx, edge) {
  const action = 'repair';
  const d = ctx.structures.describe(edge.x, edge.y, edge.side);
  const bad = baseRefusal(ctx, d);
  if (bad) return refuse(ctx, action, d, bad);
  if (d.kind === EDGE_KIND.SHAFT || d.kind === EDGE_KIND.VOID) return refuse(ctx, action, d, BUILD_CODE.SHAFT_WALL);
  const hq = hqRefusal(ctx, d);
  if (hq) return refuse(ctx, action, d, hq);
  if (d.piece === PIECE.GAP) return refuse(ctx, action, d, BUILD_CODE.NOTHING_HERE);
  const ov = d.overlay;
  let target = null;
  let def = null;
  if (ov && ov.hp < ov.maxHp) { target = 'overlay'; def = ctx.balance.structures.overlays[ov.kind]; }
  else if (!ctx.structures.isImmutableKind(d.kind) && d.hp < d.maxHp) { target = 'piece'; def = pieceDef(ctx.balance, d); }
  if (!target) return refuse(ctx, action, d, BUILD_CODE.FULL_HP);
  if (target === 'piece' && d.broken) return refuse(ctx, action, d, d.piece === PIECE.DOOR ? BUILD_CODE.BROKEN : BUILD_CODE.CANNOT_REPAIR);
  if (!def.repair) return refuse(ctx, action, d, BUILD_CODE.CANNOT_REPAIR, { target });
  const b = ctx.balance.build;
  const cost = [{ id: def.repair.material, qty: 1 }];
  const tools = missingTools(ctx, action);
  const res = { target, cost, seconds: b.repairSeconds, energy: b.buildEnergy, noise: b.repairNoise };
  if (tools) return refuse(ctx, action, d, BUILD_CODE.NEEDS_TOOL, { ...res, needTool: tools, message: `Needs ${tools.map((t) => itemName(ctx.balance, t)).join(' and ')}` });
  const miss = missingMaterial(ctx.state, cost);
  if (miss) return refuse(ctx, action, d, BUILD_CODE.NO_MATERIALS, { ...res, missing: miss, message: `Needs ${miss.qty} ${itemName(ctx.balance, miss.id)}` });
  return makeResult(ctx, action, d, BUILD_CODE.OK, { ...res, toTier: def.repair.material });
}

/** One repair tap: one unit of material restores hpPerUnit HP, up to full. */
export function repair(ctx, edge) {
  return run(ctx, () => canRepair(ctx, edge), (r) => {
    takeMaterials(ctx.state, r.cost);
    r.consumed = r.cost;
    const rec = ctx.structures.rec(r.edge.x, r.edge.y, r.edge.side);
    if (r.target === 'overlay' && !rec.overlay) { // the barricade on a door
      const bar = rec.door.barricade;
      const view = ctx.structures.barricadeView(rec);
      bar.hp = Math.min(view.maxHp, bar.hp + ctx.balance.structures.overlays.barricade.repair.hpPerUnit);
      syncFrontBarricade(ctx, rec.door);
      ctx.structures.grid.version++;
      ctx.structures.touch(rec.eid);
    } else if (r.target === 'overlay') {
      const hpu = ctx.balance.structures.overlays[rec.overlay.kind].repair.hpPerUnit;
      rec.overlay.hp = Math.min(rec.overlay.maxHp, rec.overlay.hp + hpu);
      ctx.structures.setOverlay(rec, rec.overlay);
    } else {
      const hpu = pieceDef(ctx.balance, rec).repair.hpPerUnit;
      ctx.structures.setHp(rec, Math.min(ctx.structures.maxHpOf(rec), ctx.structures.hpOf(rec) + hpu));
    }
  });
}

// ---- demolish ----------------------------------------------------------------------------------------

/** Name used by build.fireAxeDemolishable for a target. */
function axeKey(d, target, overlayKind) {
  if (target === 'overlay') return overlayKind === 'boards' ? FIRE_AXE_KEY.boards : null;
  if (d.piece === PIECE.DOOR) return FIRE_AXE_KEY.door;
  if (d.piece === PIECE.WINDOW) return FIRE_AXE_KEY.window;
  if (d.tier === 'partition') return FIRE_AXE_KEY.partitionWall;
  if (d.tier === 'wood') return FIRE_AXE_KEY.woodWall;
  return null;
}

/**
 * Can the overlay (first) or piece on this edge be demolished? (no mutation)
 * Works anywhere on floor 15 (claimed or not). Perimeter walls and exterior / shaft walls never; their
 * overlays can come off (exterior windows included).
 * @param {{tool?:'sledgehammer'|'fire_axe'}} [opts] force a tool (default: sledgehammer, else fire axe if allowed)
 */
export function canDemolish(ctx, edge, opts = {}) {
  const action = 'demolish';
  const d = ctx.structures.describe(edge.x, edge.y, edge.side);
  const bad = baseRefusal(ctx, d);
  if (bad) return refuse(ctx, action, d, bad);
  const s = ctx.balance.structures;
  const b = ctx.balance.build;
  const door = d.rec?.door ?? null;
  const bar = door?.barricade && door.barricade.hp > 0 ? door.barricade : null;
  const cover = d.overlay?.kind === 'barricade' ? null : d.overlay; // a broken (0 HP) barricade is not cover any more
  const target = bar || cover ? 'overlay' : 'piece';
  const overlayKind = bar ? 'barricade' : cover?.kind;
  if (d.kind === EDGE_KIND.SHAFT || d.kind === EDGE_KIND.VOID) return refuse(ctx, action, d, BUILD_CODE.SHAFT_WALL);
  if (d.piece === PIECE.GAP) return refuse(ctx, action, d, BUILD_CODE.NOTHING_HERE);
  if (target === 'piece') {
    if (d.kind === EDGE_KIND.EXTERIOR) return refuse(ctx, action, d, BUILD_CODE.EXTERIOR_WALL);
    if (d.kind === EDGE_KIND.PERIMETER) return refuse(ctx, action, d, BUILD_CODE.LANDING_WALL);
    if (blockedByMounted(ctx, d)) return refuse(ctx, action, d, BUILD_CODE.OCCUPIED);
  }
  const def = target === 'overlay' ? s.overlays[overlayKind] : pieceDef(ctx.balance, d);
  // tools: sledgehammer, or the fire axe on what it can break (x1.5 time)
  const axeOk = b.fireAxeDemolishable.includes(axeKey(d, target, overlayKind));
  let tool = null;
  const wants = opts.tool ? [opts.tool] : ['sledgehammer', 'fire_axe'];
  for (const t of wants) {
    if (!b.requiresTool.demolish.includes(t) || !hasTool(ctx.state, t)) continue;
    if (t === 'fire_axe' && !axeOk) continue;
    tool = t;
    break;
  }
  const base = { target, tool, noise: b.demolishNoise, ...(bar ? { overlayKind: 'barricade' } : {}) };
  const heavy = target === 'piece' && d.piece === PIECE.WALL && d.tier === 'block';
  const energy = heavy ? b.blockDemolishEnergy : b.demolishEnergy;
  if (!tool) {
    return refuse(ctx, action, d, BUILD_CODE.NEEDS_TOOL, { ...base, needTool: ['sledgehammer'], energy, message: `Needs ${itemName(ctx.balance, 'sledgehammer')}` });
  }
  const yieldObj = target === 'piece' && d.piece === PIECE.DOOR && d.broken ? ctx.balance.doors.brokenYield : def.yield;
  const seconds = def.demolishSeconds * (tool === 'fire_axe' ? b.fireAxeDemolishTimeMult : 1);
  return makeResult(ctx, action, d, BUILD_CODE.OK, { ...base, energy, seconds, salvage: toList(yieldObj) });
}

/**
 * Demolish the overlay (first) or piece: the edge becomes a gap at once, wear goes on the tool (sledgehammer build.sledgehammerUsesPerDemolish of
 * build.sledgehammerUses, fire axe build.fireAxeDurabilityPerDemolish), yield goes to the bag, overflow to a pile.
 */
export function demolish(ctx, edge, opts) {
  return run(ctx, () => canDemolish(ctx, edge, opts), (r) => {
    const b = ctx.balance.build;
    const wear = r.tool === 'fire_axe' ? b.fireAxeDurabilityPerDemolish : b.sledgehammerUsesPerDemolish;
    const fallback = r.tool === 'fire_axe' ? ctx.balance.combat?.weapons?.fire_axe?.durability : b.sledgehammerUses;
    if (wearTool(ctx.state, r.tool, wear, fallback)) r.toolBroke = r.tool;
    const rec = ctx.structures.rec(r.edge.x, r.edge.y, r.edge.side);
    if (r.overlayKind === 'barricade') {
      ctx.structures.grid.setBarricade(rec.door, null);
      syncFrontBarricade(ctx, rec.door);
      ctx.structures.touch(rec.eid);
    } else if (r.target === 'overlay') ctx.structures.setOverlay(rec, null);
    else ctx.structures.place(r.edge, { piece: PIECE.GAP });
    r.dropped = give(ctx, r.salvage);
  });
}

// ---- Main / Secondary button logic (GDD 5.19 "Main" rules 1-7) --------------------------------------------

const OVERLAY_PIECES = ['boards', 'plating', 'barricade'];

/**
 * What Main would do on this edge with the selected piece (GDD 5.19 rules 1-7). Wire the Main button to
 * `.result` (enabled when ok, greyed with result.message otherwise) and call `perform()` at completion.
 * @param {string} selected one of balance.build.pieces
 * @returns {{action:'repair'|'build'|'upgrade'|'fit'|'overlay'|'none', result:object, perform:()=>object}}
 */
export function mainAction(ctx, edge, selected) {
  const d = ctx.structures.describe(edge.x, edge.y, edge.side);
  const pick = (action, result, fn) => ({ action, result, perform: fn });
  const none = (code) => pick('none', refuse(ctx, 'none', d, code), () => refuse(ctx, 'none', d, code));
  if (d.kind === EDGE_KIND.NONE || ctx.structures.floor.number !== ctx.balance.hq.floor) return none(d.kind === EDGE_KIND.NONE ? BUILD_CODE.NO_EDGE : BUILD_CODE.NOT_FLOOR15);
  // 1 repair (overlay first); glass can't be repaired so it falls through to the other rules
  const damagedOverlay = d.overlay && d.overlay.hp < d.overlay.maxHp;
  const damagedPiece = d.piece !== PIECE.GAP && !ctx.structures.isImmutableKind(d.kind) && d.hp < d.maxHp && !!pieceDef(ctx.balance, d)?.repair;
  if (damagedOverlay || damagedPiece) return pick('repair', canRepair(ctx, edge), () => repair(ctx, edge));
  if (d.piece === PIECE.GAP) {
    if (selected === 'wall') return pick('build', canBuild(ctx, edge), () => build(ctx, edge));
    if (selected === 'door' || selected === 'window') return none(BUILD_CODE.NEEDS_WALL);
    if (OVERLAY_PIECES.includes(selected)) return none(BUILD_CODE.NOTHING_TO_COVER);
    return none(BUILD_CODE.WRONG_TARGET);
  }
  if (selected === 'wall' && d.piece === PIECE.WALL) return pick('upgrade', canUpgrade(ctx, edge), () => upgrade(ctx, edge));
  if ((selected === 'door' || selected === 'window') && d.piece === PIECE.WALL) return pick('fit', canFit(ctx, edge, selected), () => fit(ctx, edge, selected));
  if (selected === 'door' && d.piece === PIECE.DOOR) return pick('upgrade', canUpgrade(ctx, edge), () => upgrade(ctx, edge));
  if (OVERLAY_PIECES.includes(selected)) {
    const r = canAddOverlay(ctx, edge, selected);
    return pick(r.action === 'upgrade' ? 'upgrade' : 'overlay', r, () => addOverlay(ctx, edge, selected)); // Barricade Lv1 -> Lv2 counts as Upgrade
  }
  return none(BUILD_CODE.WRONG_TARGET);
}

/** Secondary button: Demolish (overlay first, then the piece). Same shape as mainAction. */
export function secondaryAction(ctx, edge) {
  return { action: 'demolish', result: canDemolish(ctx, edge), perform: () => demolish(ctx, edge) };
}

/** Damage stage 0..3 of a piece or its overlay, for sprites. @returns {{piece:number, overlay:number}} */
export function stagesAt(ctx, edge) {
  const d = ctx.structures.describe(edge.x, edge.y, edge.side);
  return { piece: d.stage, overlay: d.overlayStage };
}

export { damageStage };
