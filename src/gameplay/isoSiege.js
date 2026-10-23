/**
 * Siege pathing for HQ attacks (GDD 5.20 "How zombies attack structures", "HQ attacks"). Pure, no Phaser.
 *
 * COST. Attackers walk the floor with structure-aware costs, in tiles: crossing an edge costs
 * (piece HP + overlay HP) / hq.attacks.pathHpPerTile (time to break, scaled), a closed door at least
 * doors.zombiePathDoorCost, a broken window hq.attacks.brokenWindowExtraCostTiles (the climb) plus its cover;
 * gaps and open doors cost 0; exterior, shaft and void edges are impassable (exterior windows are never
 * attacked before M4). So the cheapest route probes the weakest wall, door or window, and damage left by earlier
 * attacks makes a spot cheaper.
 *
 * FIELD. One Dijkstra from the goal (the heart) fills a cost-to-goal value for every tile; an attacker just steps
 * to the neighbour that lowers it ("gradient"), so a wave shares one search instead of one A* each. A field is
 * rebuilt when structures change (throttled, instantly for a piece that appeared or went).
 *
 * ENTRIES. Entry 1 is the first structure the cheapest route from the landing crosses. Its cost is raised by
 * hq.attacks.entryExclusionCost and the search repeats for entry 2, then 3 (count by day, entriesByDay). Attacker k
 * (dealt in turn) follows the field with entries before k excluded, so a wave probes several weak spots. When any
 * entry breaks, every attacker follows the plain field (usually through the breach).
 *
 * SLOTS. At most hq.attacks.slotsPerEdge attackers hit one edge: from the tile across it and the two tiles beside
 * that one, if walkable and no wall stands between them (no hitting round corners). Others queue behind; an edge
 * whose slots are full costs hq.attacks.tuning.slotFullPenaltyTiles more, so the rest seek another edge.
 *
 * Keys: hq.attacks.* (pathHpPerTile, brokenWindowExtraCostTiles, slotsPerEdge, entriesByDay, entryExclusionCost,
 * maxAttackersOnFloor, tuning.slotFullPenaltyTiles, tuning.replanSeconds), doors.zombiePathDoorCost,
 * structures.damageMult, structures.brokenWindowClimbExtraSeconds.zombie.
 */
import { EDGE, MOVE, TILE } from '../iso/grid.js';
import { EDGE_KIND } from './isoStructures.js';

const SQRT2 = Math.SQRT2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Tunables the GDD gives no numbers for (balance.hq.attacks.tuning.<key> overrides them). */
export const SIEGE_TUNE_DEFAULTS = Object.freeze({
  slotFullPenaltyTiles: 6, // extra cost of an edge whose attack slots are all taken (the 4th attacker looks elsewhere)
  replanSeconds: 0.5, // field rebuilds at most this often for HP changes (a piece appearing or going rebuilds at once)
});

/** Result codes of Siege.decide. */
export const DECIDE = Object.freeze({ WAIT: 0, MOVE: 1, HIT: 2, ARRIVED: 3 });

/** Siege numbers from balance. @param {object} balance */
export function siegeConfig(balance) {
  const a = balance.hq?.attacks ?? {};
  const tune = { ...SIEGE_TUNE_DEFAULTS, ...(a.tuning ?? {}) };
  return {
    hpPerTile: a.pathHpPerTile ?? 10,
    doorCost: balance.doors?.zombiePathDoorCost ?? 10,
    climbExtra: a.brokenWindowExtraCostTiles ?? 3,
    slots: a.slotsPerEdge ?? 3,
    exclusion: a.entryExclusionCost ?? 1000,
    entriesByDay: a.entriesByDay ?? [{ fromDay: 0, entries: 1 }],
    maxOnFloor: a.maxAttackersOnFloor ?? 12,
    damageMult: balance.structures?.damageMult ?? 0.4,
    climbExtraSeconds: balance.structures?.brokenWindowClimbExtraSeconds?.zombie ?? 1.5,
    slotFullPenalty: tune.slotFullPenaltyTiles,
    replanSeconds: tune.replanSeconds,
  };
}

/** How many entries a wave probes on day `day` (hq.attacks.entriesByDay: 1 / 2 / 3). */
export function entryCountForDay(cfg, day) {
  let n = 1;
  for (const e of cfg.entriesByDay) if (day >= e.fromDay) n = e.entries;
  return n;
}

/** Can an attacker stand here? Floor without furniture; the stair flights count (that is where they arrive). */
export function siegeWalkable(g, x, y) {
  if (!g.isFloor(x, y)) return false;
  const i = y * g.width + x;
  return g.obstacle[i] === 0 || g.kind[i] === TILE.STAIRS;
}

/**
 * Cost in tiles of crossing one edge: 0 = free (gap, open or broken door), Infinity = impassable (exterior, shaft, void).
 * @param {import('./isoStructures.js').Structures} st @param {ReturnType<typeof siegeConfig>} cfg @param {number} eid
 */
export function edgeCrossCost(st, cfg, eid) {
  const g = st.grid;
  const type = g.edges[eid];
  if (type === EDGE.NONE) return 0;
  const kind = st.kindOfEid(eid);
  if (kind === EDGE_KIND.EXTERIOR || kind === EDGE_KIND.SHAFT || kind === EDGE_KIND.VOID || kind === EDGE_KIND.NONE) return Infinity;
  const rec = st.recs.get(eid);
  if (!rec) return Infinity;
  const per = cfg.hpPerTile;
  const cover = rec.overlay ? rec.overlay.hp : 0;
  if (type === EDGE.DOOR) {
    if (g.moveClass(eid) === MOVE.OPEN) return 0;
    const bar = rec.door.barricade && rec.door.barricade.hp > 0 ? rec.door.barricade.hp : 0;
    return Math.max(cfg.doorCost, (rec.door.hp + bar + cover) / per);
  }
  if (type === EDGE.WINDOW) return rec.broken ? cover / per + cfg.climbExtra : (rec.hp + cover) / per;
  return Math.max(0.1, (rec.hp + cover) / per);
}

/** Does crossing this edge mean breaking something (not free, and not just a climb through a broken pane)? */
export function mustBreak(g, cost, eid) {
  return cost[eid] > 0 && g.moveClass(eid) !== MOVE.CLIMB;
}

/** A cost-to-goal field over the tiles of one floor, with its own copy of the edge costs. Reused between rebuilds. */
export class CostField {
  /** @param {import('../iso/grid.js').Grid} grid */
  constructor(grid) {
    this.grid = grid;
    const n = grid.width * grid.height;
    this.dist = new Float64Array(n);
    this.cost = new Float64Array(grid.hCount + grid.vCount);
    this.heapP = new Float64Array(n * 9 + 16);
    this.heapI = new Int32Array(n * 9 + 16);
    this.size = 0;
    this.popP = 0;
    this.out = { dx: 0, dy: 0, eid: -1, cost: 0 };
  }

  /** Cost of moving from (x, y) by (dx, dy); Infinity when that step is not possible. */
  stepCost(x, y, dx, dy) {
    const g = this.grid;
    const nx = x + dx;
    const ny = y + dy;
    if (!siegeWalkable(g, nx, ny)) return Infinity;
    const c = this.cost;
    if (dx === 0 || dy === 0) {
      const e = c[g.edgeBetween(x, y, nx, ny)];
      return e === Infinity ? Infinity : 1 + e;
    }
    if (!siegeWalkable(g, nx, y) || !siegeWalkable(g, x, ny)) return Infinity;
    if (c[g.edgeBetween(x, y, nx, y)] !== 0 || c[g.edgeBetween(nx, y, nx, ny)] !== 0 || c[g.edgeBetween(x, y, x, ny)] !== 0 || c[g.edgeBetween(x, ny, nx, ny)] !== 0) return Infinity;
    return SQRT2;
  }

  /** Dijkstra outward from the goal tile; fills `dist` (Infinity where unreachable). Edge costs must be set in `cost`. */
  compute(goalX, goalY) {
    const g = this.grid;
    const W = g.width;
    const dist = this.dist;
    dist.fill(Infinity);
    this.size = 0;
    if (!siegeWalkable(g, goalX, goalY)) return;
    const gi = goalY * W + goalX;
    dist[gi] = 0;
    this.push(0, gi);
    while (this.size > 0) {
      const top = this.pop();
      const d = this.popP;
      if (d > dist[top]) continue;
      const cx = top % W;
      const cy = (top - cx) / W;
      for (let k = 0; k < 8; k++) {
        const dx = DIRS[k][0];
        const dy = DIRS[k][1];
        const sc = this.stepCost(cx, cy, dx, dy);
        if (sc === Infinity) continue;
        const ni = (cy + dy) * W + cx + dx;
        const nd = d + sc;
        if (nd < dist[ni]) { dist[ni] = nd; this.push(nd, ni); }
      }
    }
  }

  /**
   * The best step from (x, y) toward the goal: writes dx, dy, the crossed edge id (orthogonal steps, else -1) and the step
   * cost into `out` (a scratch object valid until the next call). @returns {boolean} false when there is no way on
   */
  best(x, y) {
    const W = this.grid.width;
    const here = this.dist[y * W + x];
    let bd = Infinity;
    let bk = -1;
    for (let k = 0; k < 8; k++) {
      const sc = this.stepCost(x, y, DIRS[k][0], DIRS[k][1]);
      if (sc === Infinity) continue;
      const d = sc + this.dist[(y + DIRS[k][1]) * W + x + DIRS[k][0]];
      if (d < bd - 1e-6) { bd = d; bk = k; }
    }
    if (bk < 0 || !(bd < here + 1e-4) || bd === Infinity) return false;
    const o = this.out;
    o.dx = DIRS[bk][0];
    o.dy = DIRS[bk][1];
    o.eid = o.dx === 0 || o.dy === 0 ? this.grid.edgeBetween(x, y, x + o.dx, y + o.dy) : -1;
    o.cost = this.stepCost(x, y, o.dx, o.dy);
    return true;
  }

  /**
   * Like best(), but only free tiles (not in `occ`) that are strictly closer to the goal and need no hit to enter: the way round
   * another attacker standing in the best tile. @returns {boolean}
   */
  bestFree(x, y, occ) {
    const g = this.grid;
    const W = g.width;
    const here = this.dist[y * W + x];
    let bd = Infinity;
    let bk = -1;
    for (let k = 0; k < 8; k++) {
      const dx = DIRS[k][0];
      const dy = DIRS[k][1];
      const ni = (y + dy) * W + x + dx;
      if (occ[ni]) continue;
      const sc = this.stepCost(x, y, dx, dy);
      if (sc === Infinity) continue;
      if ((dx === 0 || dy === 0) && this.cost[g.edgeBetween(x, y, x + dx, y + dy)] > 0) continue; // a wall to break, or a climb: not a sidestep
      const nd = this.dist[ni];
      if (!(nd < here - 1e-6)) continue;
      const d = sc + nd;
      if (d < bd - 1e-6) { bd = d; bk = k; }
    }
    if (bk < 0) return false;
    const o = this.out;
    o.dx = DIRS[bk][0];
    o.dy = DIRS[bk][1];
    o.eid = -1;
    o.cost = this.stepCost(x, y, o.dx, o.dy);
    return true;
  }

  push(p, i) {
    const hp = this.heapP;
    const hi = this.heapI;
    let c = this.size++;
    while (c > 0) {
      const par = (c - 1) >> 1;
      if (hp[par] <= p) break;
      hp[c] = hp[par]; hi[c] = hi[par];
      c = par;
    }
    hp[c] = p; hi[c] = i;
  }

  pop() {
    const hp = this.heapP;
    const hi = this.heapI;
    const top = hi[0];
    this.popP = hp[0];
    const n = --this.size;
    if (n > 0) {
      const p = hp[n];
      const i = hi[n];
      let c = 0;
      for (;;) {
        let ch = 2 * c + 1;
        if (ch >= n) break;
        if (ch + 1 < n && hp[ch + 1] < hp[ch]) ch++;
        if (hp[ch] >= p) break;
        hp[c] = hp[ch]; hi[c] = hi[ch];
        c = ch;
      }
      hp[c] = p; hi[c] = i;
    }
    return top;
  }
}

/**
 * Follow a field from (x, y) to its goal and list what is crossed. Crossings are edges that cost something (a structure to
 * break, or a broken pane to climb); free steps are not listed. Allocates (used when a plan is made and for the offline
 * resolve, never per frame).
 * @param {CostField} field @returns {{found:boolean, steps:number, crossings:{eid:number, x:number, y:number, cost:number, climb:boolean}[]}}
 */
export function traceRoute(field, x, y, maxSteps = 4000) {
  const g = field.grid;
  const res = { found: false, steps: 0, crossings: [] };
  if (!(field.dist[y * g.width + x] < Infinity)) return res;
  let cx = x;
  let cy = y;
  while (res.steps < maxSteps) {
    if (field.dist[cy * g.width + cx] === 0) { res.found = true; return res; }
    if (!field.best(cx, cy)) return res;
    const o = field.out;
    if (o.eid >= 0 && field.cost[o.eid] > 0) res.crossings.push({ eid: o.eid, x: cx, y: cy, cost: field.cost[o.eid], climb: g.moveClass(o.eid) === MOVE.CLIMB });
    cx += o.dx;
    cy += o.dy;
    res.steps++;
  }
  return res;
}

/**
 * The (up to 3) tiles an attacker can hit an edge from when crossing it from (ax, ay) to (bx, by): the tile across it
 * and the two beside that one, if walkable and with no wall between them (no hitting round a corner).
 * @param {Float64Array} cost edge costs @param {{n:number, x:number[], y:number[]}} [out] reused result
 * @returns {{n:number, x:number[], y:number[]}} tiles 0..n-1 (the one across first)
 */
export function slotTiles(g, cost, ax, ay, bx, by, out = { n: 0, x: [0, 0, 0], y: [0, 0, 0] }) {
  out.x[0] = ax; out.y[0] = ay; out.n = 1;
  const px = Math.abs(by - ay); // perpendicular to the crossing direction
  const py = Math.abs(bx - ax);
  for (let s = 1; s >= -1; s -= 2) {
    const sx = ax + px * s;
    const sy = ay + py * s;
    if (!siegeWalkable(g, sx, sy)) continue;
    if (cost[g.edgeBetween(ax, ay, sx, sy)] !== 0) continue;
    out.x[out.n] = sx; out.y[out.n] = sy; out.n++;
  }
  return out;
}

/** Per-attacker siege fields live in the zombie AI (made by Siege.assign): entry, tgt, tgtA, tgtB, tgtStamp, holdEid. */
export class Siege {
  /**
   * @param {import('./isoStructures.js').Structures} st @param {object} balance
   */
  constructor(st, balance) {
    this.st = st;
    this.grid = st.grid;
    this.balance = balance;
    this.cfg = siegeConfig(balance);
    this.base = new Float64Array(this.grid.hCount + this.grid.vCount);
    this.fields = [new CostField(this.grid)];
    this.entries = []; // edge ids of the entries of this wave
    this.wantEntries = 1;
    this.goal = { x: 0, y: 0 };
    this.spawn = { x: 0, y: 0 };
    this.active = false;
    this.plain = false; // an entry broke: everyone follows the plain field
    this.epoch = 0; // bumps when the entry plan ends: attackers still holding a slot of the old plan let go
    this._rev = 0;
    this.stamp = 0; // bumps on every rebuild; attackers without a slot re-derive their target when it changes
    this.dirty = false;
    this.dirtyT = 0;
    this.holders = new Map(); // eid -> number of attackers hitting it
    this.dealt = 0;
    this.out = { kind: DECIDE.WAIT, dx: 0, dy: 0, climb: false, eid: -1, bx: 0, by: 0 };
    this.slotScratch = { n: 0, x: [0, 0, 0], y: [0, 0, 0] };
    this.slotFree = { x: 0, y: 0 };
  }

  /** Start a wave: attackers arrive at `spawn` and head for `goal` (the heart's stand tile), probing `entries` weak spots. */
  begin(spawn, goal, entries = 1) {
    this.spawn.x = spawn.x; this.spawn.y = spawn.y;
    this.goal.x = goal.x; this.goal.y = goal.y;
    this.wantEntries = Math.max(1, entries);
    this.active = true;
    this.plain = false;
    this.epoch++;
    this.dealt = 0;
    this.holders.clear();
    this.rebuild();
  }

  end() {
    this.active = false;
    this.holders.clear();
    this.entries.length = 0;
  }

  /** The heart moved (a new bed, or the hero when there is none). */
  setGoal(x, y) {
    if (x === this.goal.x && y === this.goal.y) return;
    this.goal.x = x; this.goal.y = y;
    this.dirty = true;
    this.dirtyT = 1e9;
  }

  /**
   * Structures changed (Structures.onChange). A piece that appeared or went ends the entry plan when an entry edge no longer
   * holds a piece, and rebuilds the field at once; an HP, tier or overlay change rebuilds it within replanSeconds.
   */
  onStructures(structural) {
    if (!this.active) return;
    this.dirty = true;
    if (structural) { this.dirtyT = 1e9; this._rev++; }
  }

  /** Per frame: rebuild a dirty field, at most every replanSeconds (at once after a structural change). */
  update(dt) {
    if (!this.active || !this.dirty) return;
    this.dirtyT += dt;
    if (this.dirtyT >= this.cfg.replanSeconds) this.rebuild();
  }

  /** Recompute the edge costs, the entries and every field. */
  rebuild() {
    const { st, cfg, base } = this;
    for (let eid = 0; eid < base.length; eid++) base[eid] = edgeCrossCost(st, cfg, eid);
    for (const [eid, n] of this.holders) if (n >= cfg.slots && base[eid] > 0) base[eid] += cfg.slotFullPenalty;
    // an entry that broke (it is free now) ends the entry plan: everyone re-paths normally
    if (!this.plain && this.entries.length) {
      for (let i = 0; i < this.entries.length; i++) { // an entry that is broken (gone, or a broken pane that can be climbed) ends the plan
        const eid = this.entries[i];
        if (!(base[eid] > 0) || !this.pieceThere(eid) || this.grid.moveClass(eid) === MOVE.CLIMB) { this.plain = true; this.epoch++; break; }
      }
    }
    const want = this.plain ? 1 : this.wantEntries;
    this.entries.length = 0;
    this.fill(0, null);
    for (let k = 0; k < want; k++) {
      if (k > 0) this.fill(k, this.entries);
      const r = traceRoute(this.fields[k], this.spawn.x, this.spawn.y);
      const first = r.crossings[0]; // the first structure crossed
      if (!first || this.entries.includes(first.eid)) break; // no structure on the route, or no new weak spot left
      this.entries.push(first.eid);
    }
    this.stamp++;
    this.dirty = false;
    this.dirtyT = 0;
  }

  pieceThere(eid) { return this.grid.edges[eid] !== EDGE.NONE; }

  /** Fill field `k` from the base costs with `excluded` edges raised by the exclusion cost. */
  fill(k, excluded) {
    while (this.fields.length <= k) this.fields.push(new CostField(this.grid));
    const f = this.fields[k];
    f.cost.set(this.base);
    if (excluded) for (const eid of excluded) if (f.cost[eid] > 0 && f.cost[eid] !== Infinity) f.cost[eid] += this.cfg.exclusion;
    f.compute(this.goal.x, this.goal.y);
  }

  /** The field an attacker follows. */
  fieldOf(ai) {
    const k = this.plain || !this.entries.length ? 0 : Math.min(ai.entry | 0, this.entries.length - 1);
    return this.fields[k];
  }

  /** A new attacker: dealt to the entries in turn. */
  assign(ai) {
    ai.entry = this.entries.length ? this.dealt++ % this.entries.length : 0;
    ai.tgt = -1; ai.tgtStamp = -1; ai.holdEid = -1; ai.epoch = this.epoch;
  }

  /** Bumps on a structural change or a window's cover changing: a leg in progress checks its step is still legal. */
  get structRev() { return this._rev + this.st.passRev; }

  /** Is the step an attacker is walking (from tile (fx, fy) to (tx, ty)) still legal after a structural change? */
  stepOk(ai, fx, fy, tx, ty) {
    const dx = tx - fx;
    const dy = ty - fy;
    if ((dx === 0 && dy === 0) || Math.abs(dx) > 1 || Math.abs(dy) > 1) return true;
    const f = this.fieldOf(ai);
    if (f.stepCost(fx, fy, dx, dy) === Infinity) return false;
    return dx !== 0 && dy !== 0 ? true : !mustBreak(this.grid, f.cost, this.grid.edgeBetween(fx, fy, tx, ty));
  }

  /** The attacker left the siege (died, gave way to a chase): free its attack slot. */
  release(ai) {
    if (ai.holdEid >= 0) {
      const n = (this.holders.get(ai.holdEid) ?? 1) - 1;
      if (n <= 0) this.holders.delete(ai.holdEid); else this.holders.set(ai.holdEid, n);
      if (n + 1 === this.cfg.slots) { this.dirty = true; } // the edge is no longer full
      ai.holdEid = -1;
    }
    ai.tgt = -1;
  }

  /** Attackers currently hitting edge `eid`. */
  holdersOf(eid) { return this.holders.get(eid) ?? 0; }

  claim(ai, eid) {
    if (ai.holdEid === eid) return true;
    const n = this.holders.get(eid) ?? 0;
    if (n >= this.cfg.slots) return false;
    this.release(ai);
    this.holders.set(eid, n + 1);
    ai.holdEid = eid;
    ai.tgt = eid;
    if (n + 1 >= this.cfg.slots) this.dirty = true; // now full: the rest should seek another edge
    return true;
  }

  /**
   * What should this attacker do next? Writes into the returned scratch object:
   *   MOVE (dx, dy, climb)  step to the neighbouring tile (a broken window: slowly);
   *   HIT (eid, bx, by)     hit the edge toward tile (bx, by) from where it stands;
   *   WAIT                  queue (tile busy, edge full, no way on);   ARRIVED  standing on the goal tile.
   * @param {{x:number,y:number}} z record @param {object} ai AI (siege fields) @param {Uint8Array} occ occupied tiles
   */
  decide(z, ai, occ) {
    const g = this.grid;
    const W = g.width;
    const o = this.out;
    o.kind = DECIDE.WAIT; o.climb = false; o.eid = -1;
    const cx = Math.floor(z.x);
    const cy = Math.floor(z.y);
    if (ai.epoch !== this.epoch) { this.release(ai); ai.epoch = this.epoch; } // the plan changed under it: start over
    const field = this.fieldOf(ai);
    if (field.dist[cy * W + cx] === 0) { o.kind = DECIDE.ARRIVED; return o; }
    // a target edge is kept while it still has to be broken; without a slot it is re-derived after every rebuild
    if (ai.tgt >= 0 && !mustBreak(g, field.cost, ai.tgt)) { this.release(ai); }
    if (ai.holdEid < 0 && (ai.tgt < 0 || ai.tgtStamp !== this.stamp)) this.pickTarget(field, ai, cx, cy);
    if (ai.tgt >= 0) {
      const t = this.slotAt(field, ai, cx, cy);
      if (t === 1) { // standing on a slot tile of the target: hit it
        if (this.claim(ai, ai.tgt)) { o.kind = DECIDE.HIT; o.eid = ai.tgt; o.bx = ai.tgtB % W; o.by = (ai.tgtB - o.bx) / W; return o; }
        return o; // all slots taken: wait here
      }
      if (ai.holdEid >= 0) this.release(ai); // pushed off its slot: start over
      const s = this.freeSlot(field, ai, cx, cy, occ);
      if (s && this.stepTo(field, cx, cy, s.x - cx, s.y - cy, occ, o)) return o;
    }
    if (!field.best(cx, cy)) return o;
    const b = field.out;
    if (b.eid >= 0 && mustBreak(g, field.cost, b.eid)) { // the next step needs a hit: this tile is the one across the edge
      this.setTarget(field, ai, b.eid, cx, cy, b.dx, b.dy);
      if (this.claim(ai, b.eid)) { o.kind = DECIDE.HIT; o.eid = b.eid; o.bx = cx + b.dx; o.by = cy + b.dy; return o; }
      return o;
    }
    if (this.stepTo(field, cx, cy, b.dx, b.dy, occ, o)) return o;
    // another attacker stands in the best tile: go round it when a free tile also gets closer
    if (field.bestFree(cx, cy, occ)) this.stepTo(field, cx, cy, field.out.dx, field.out.dy, occ, o);
    return o;
  }

  /** Walk-ahead from a tile to find the first edge on its route that has to be broken. */
  pickTarget(field, ai, cx, cy) {
    ai.tgtStamp = this.stamp;
    ai.tgt = -1;
    const g = this.grid;
    let x = cx;
    let y = cy;
    for (let n = 0; n < 400; n++) {
      if (field.dist[y * g.width + x] === 0 || !field.best(x, y)) return;
      const b = field.out;
      if (b.eid >= 0 && mustBreak(g, field.cost, b.eid)) { this.setTarget(field, ai, b.eid, x, y, b.dx, b.dy); return; }
      x += b.dx;
      y += b.dy;
    }
  }

  setTarget(field, ai, eid, ax, ay, dx, dy) {
    const W = this.grid.width;
    ai.tgt = eid;
    ai.tgtA = ay * W + ax;
    ai.tgtB = (ay + dy) * W + ax + dx;
    ai.tgtStamp = this.stamp;
  }

  /** Is (cx, cy) one of the hitting tiles of the target? 1 yes, 0 no. */
  slotAt(field, ai, cx, cy) {
    const W = this.grid.width;
    const ax = ai.tgtA % W;
    const ay = (ai.tgtA - ax) / W;
    const bx = ai.tgtB % W;
    const by = (ai.tgtB - bx) / W;
    const tiles = slotTiles(this.grid, field.cost, ax, ay, bx, by, this.slotScratch);
    for (let i = 0; i < tiles.n; i++) if (tiles.x[i] === cx && tiles.y[i] === cy) return 1;
    return 0;
  }

  /** The nearest free hitting tile of the target (across it first), or null. */
  freeSlot(field, ai, cx, cy, occ) {
    const W = this.grid.width;
    const ax = ai.tgtA % W;
    const ay = (ai.tgtA - ax) / W;
    const bx = ai.tgtB % W;
    const by = (ai.tgtB - bx) / W;
    const tiles = slotTiles(this.grid, field.cost, ax, ay, bx, by, this.slotScratch);
    let bi = -1;
    let bd = Infinity;
    for (let i = 0; i < tiles.n; i++) {
      if (occ[tiles.y[i] * W + tiles.x[i]]) continue;
      const d = Math.max(Math.abs(tiles.x[i] - cx), Math.abs(tiles.y[i] - cy)) * 2 + i * 0.1;
      if (d < bd) { bd = d; bi = i; }
    }
    // only a tile one step away is taken directly; farther ones are reached by walking the route
    if (bi < 0 || Math.max(Math.abs(tiles.x[bi] - cx), Math.abs(tiles.y[bi] - cy)) !== 1) return null;
    this.slotFree.x = tiles.x[bi]; this.slotFree.y = tiles.y[bi];
    return this.slotFree;
  }

  /** Try to step by (dx, dy): MOVE when the tile is free and the step legal. */
  stepTo(field, cx, cy, dx, dy, occ, o) {
    const g = this.grid;
    const sc = field.stepCost(cx, cy, dx, dy);
    if (sc === Infinity) return false;
    let climb = false;
    if (dx === 0 || dy === 0) {
      const eid = g.edgeBetween(cx, cy, cx + dx, cy + dy);
      if (field.cost[eid] > 0) {
        if (g.moveClass(eid) !== MOVE.CLIMB) return false;
        climb = true;
      }
    }
    if (occ[(cy + dy) * g.width + cx + dx]) return false;
    o.kind = DECIDE.MOVE; o.dx = dx; o.dy = dy; o.climb = climb;
    return true;
  }
}
