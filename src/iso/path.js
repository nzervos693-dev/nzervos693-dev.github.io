/*
 * path.js - 8-direction A* on a Grid (pure, no Phaser).
 *
 * Rules (GDD 4, 5.18):
 *  - No corner cutting: a diagonal step needs both orthogonal neighbour tiles
 *    walkable and all four edges of its 2x2 block fully open (Grid.stepClass).
 *  - mode 'hero': closed, unjammed doors are passable at an extra cost (he
 *    opens them on the way, 0.4 s each). His OWN barricade (hp > 0) is passed
 *    at a squeeze cost (0.5 s animation). Jammed doors and other barricades
 *    are impassable unless opts.throughLocked (then they cost like closed
 *    doors; the walker stops there: "It's stuck.").
 *  - mode 'zombie': closed, locked and barricaded doors (own barricades too, hp > 0) are passable in the search at
 *    +doors.zombiePathDoorCost tiles, so a zombie may route around, but if the
 *    door is the best way the path goes through it and the zombie stops at the
 *    first entry of result.doors and bangs. Walls never pass.
 *  - A broken window (MOVE.CLIMB, GDD 5.20) is passable only when opts.climbCost is given (its cost in tiles).
 *  - Search budget: opts.maxExpansions (default 4000 nodes, ~6x a 30x22 floor).
 *    Hitting it returns {found:false, truncated:true}.
 */
import { MOVE } from './grid.js';

/** Defaults used when balance has no matching key (named, tunable in one place). */
export const PATH_DEFAULTS = Object.freeze({
  heroDoorCost: 1, // tiles-equivalent of opening a closed door (0.4 s at walk speed ~ 0.8)
  squeezeSeconds: 0.5, // GDD 5.8: own-barricade squeeze-through animation
  zombieDoorCost: 10, // overridden by doors.zombiePathDoorCost
  maxExpansions: 4000, // ~6x the 660 tiles of a 30x22 floor
});

const SQRT2 = Math.SQRT2;
const DIRS = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** @type {WeakMap<object, object>} per-grid scratch buffers (no per-search allocation of big arrays). */
const scratch = new WeakMap();

function getScratch(grid) {
  let s = scratch.get(grid);
  if (!s) {
    const n = grid.width * grid.height;
    s = { g: new Float64Array(n), parent: new Int32Array(n), stamp: new Uint32Array(n), closed: new Uint32Array(n), run: 0, heap: [] };
    scratch.set(grid, s);
  }
  return s;
}

/**
 * Path cost settings from balance (keys that are missing fall back to PATH_DEFAULTS):
 * doors.heroPathDoorCost, doors.barricadeSqueezeSeconds (x hero.walkTilesPerSecond), path.maxExpansions,
 * doors.zombiePathDoorCost.
 * @param {object} balance full balance object
 * @returns {{heroDoorCost:number, squeezeCost:number, zombieDoorCost:number, maxExpansions:number}}
 */
export function pathConfig(balance) {
  const d = balance.doors ?? {};
  const tps = balance.hero?.walkTilesPerSecond ?? 2;
  return {
    heroDoorCost: d.heroPathDoorCost ?? PATH_DEFAULTS.heroDoorCost,
    squeezeCost: (d.barricadeSqueezeSeconds ?? PATH_DEFAULTS.squeezeSeconds) * tps,
    zombieDoorCost: d.zombiePathDoorCost ?? PATH_DEFAULTS.zombieDoorCost,
    maxExpansions: balance.path?.maxExpansions ?? PATH_DEFAULTS.maxExpansions,
  };
}

/**
 * Find a path.
 * @param {import('./grid.js').Grid} grid
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} goal must be a walkable tile
 * @param {object} [opts]
 * @param {'hero'|'zombie'} [opts.mode='hero']
 * @param {number} [opts.doorCost] extra cost per closed/locked door (defaults PATH_DEFAULTS.heroDoorCost / zombieDoorCost); use pathConfig(balance)
 * @param {number} [opts.climbCost] cost of climbing through a broken window (tiles); without it broken windows are walls
 * @param {number} [opts.squeezeCost] hero cost of squeezing through his own barricade (default PATH_DEFAULTS.squeezeSeconds * 2 tiles/s)
 * @param {boolean} [opts.throughLocked=false] hero: path through jammed/barricaded doors
 * @param {(x:number,y:number)=>boolean} [opts.isBlocked] extra occupancy test (tile unusable, except start/goal)
 * @param {number} [opts.maxExpansions] default PATH_DEFAULTS.maxExpansions
 * @param {boolean} [opts.smooth=false] also run smoothPath and return waypoints
 * @returns {{found:boolean, path:Array<{x:number,y:number}>, cost:number,
 *   doors:Array<{id:string, edge:number, index:number, locked:boolean, squeeze:boolean}>,
 *   expanded:number, truncated:boolean, waypoints?:Array<{x:number,y:number,i:number}>}}
 *   `doors[i].index` is the index in `path` of the tile just BEFORE the door.
 *   Each waypoint carries `i`, its index in `path`; a door is crossed between
 *   the waypoint with i === doors[k].index and the next waypoint (smoothing
 *   always keeps both, so the walker can open/bang the door at that waypoint).
 */
export function findPath(grid, start, goal, opts = {}) {
  const mode = opts.mode ?? 'hero';
  const zombie = mode === 'zombie';
  const doorCost = opts.doorCost ?? (zombie ? PATH_DEFAULTS.zombieDoorCost : PATH_DEFAULTS.heroDoorCost);
  const squeezeCost = opts.squeezeCost ?? PATH_DEFAULTS.squeezeSeconds * 2;
  const maxExp = opts.maxExpansions ?? PATH_DEFAULTS.maxExpansions;
  const isBlocked = opts.isBlocked;
  const fail = (extra) => ({ found: false, path: [], cost: 0, doors: [], expanded: 0, truncated: false, ...extra });

  if (!grid.isFloor(start.x, start.y) || !grid.isWalkable(goal.x, goal.y)) return fail();
  const W = grid.width;
  const sIdx = start.y * W + start.x;
  const gIdx = goal.y * W + goal.x;
  if (sIdx === gIdx) {
    const r = { found: true, path: [{ x: start.x, y: start.y }], cost: 0, doors: [], expanded: 0, truncated: false };
    if (opts.smooth) r.waypoints = [{ x: start.x, y: start.y, i: 0 }];
    return r;
  }

  const s = getScratch(grid);
  const run = ++s.run;
  const heap = s.heap;
  heap.length = 0;

  const hCost = (x, y) => {
    const ddx = Math.abs(x - goal.x);
    const ddy = Math.abs(y - goal.y);
    return ddx + ddy + (SQRT2 - 2) * Math.min(ddx, ddy);
  };

  s.g[sIdx] = 0;
  s.stamp[sIdx] = run;
  s.parent[sIdx] = -1;
  heapPush(heap, hCost(start.x, start.y), sIdx);
  let expanded = 0;

  while (heap.length) {
    const cur = heapPop(heap);
    if (s.closed[cur] === run) continue;
    s.closed[cur] = run;
    if (cur === gIdx) return buildResult(grid, s, gIdx, expanded, opts);
    if (++expanded > maxExp) return fail({ expanded, truncated: true });
    const cx = cur % W;
    const cy = (cur - cx) / W;
    const gc = s.g[cur];
    for (let k = 0; k < 8; k++) {
      const dx = DIRS[k][0];
      const dy = DIRS[k][1];
      const nx = cx + dx;
      const ny = cy + dy;
      const cls = grid.stepClass(cx, cy, dx, dy);
      if (cls === MOVE.BLOCK) continue;
      let extra = 0;
      if (cls === MOVE.CLOSED) {
        extra = doorCost;
      } else if (cls === MOVE.SQUEEZE) {
        extra = zombie ? doorCost : squeezeCost;
      } else if (cls === MOVE.LOCKED) {
        if (zombie) extra = doorCost;
        else if (opts.throughLocked) extra = doorCost;
        else continue;
      } else if (cls === MOVE.CLIMB) { // a broken window: only searches that ask for it (opts.climbCost) climb
        if (opts.climbCost == null) continue;
        extra = opts.climbCost;
      }
      const ni = ny * W + nx;
      if (s.closed[ni] === run) continue;
      if (isBlocked && ni !== gIdx && isBlocked(nx, ny)) continue;
      const ng = gc + (dx !== 0 && dy !== 0 ? SQRT2 : 1) + extra;
      if (s.stamp[ni] !== run || ng < s.g[ni]) {
        s.stamp[ni] = run;
        s.g[ni] = ng;
        s.parent[ni] = cur;
        const h = hCost(nx, ny);
        heapPush(heap, ng + h + h * 1e-6, ni); // tie-break toward lower h
      }
    }
  }
  return fail({ expanded });
}

function buildResult(grid, s, gIdx, expanded, opts) {
  const W = grid.width;
  const rev = [];
  for (let i = gIdx; i !== -1; i = s.parent[i]) rev.push(i);
  rev.reverse();
  const path = rev.map((i) => ({ x: i % W, y: (i - (i % W)) / W }));
  const doors = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (a.x !== b.x && a.y !== b.y) continue;
    const e = grid.edgeBetween(a.x, a.y, b.x, b.y);
    const cls = grid.moveClass(e);
    if (cls === MOVE.CLOSED || cls === MOVE.LOCKED || cls === MOVE.SQUEEZE) {
      doors.push({ id: grid.doors.get(e).id, edge: e, index: i, locked: cls === MOVE.LOCKED, squeeze: cls === MOVE.SQUEEZE });
    }
  }
  const r = { found: true, path, cost: s.g[gIdx], doors, expanded, truncated: false };
  if (opts.smooth) r.waypoints = smoothPath(grid, path, opts.isBlocked);
  return r;
}

/**
 * Path smoothing (string pulling): drop tiles whose neighbours can be joined
 * by a straight centre-to-centre segment that stays on walkable tiles and
 * never crosses a closed/locked door or wall. Doors on the path are therefore
 * always kept as separate waypoints.
 * @param {import('./grid.js').Grid} grid
 * @param {Array<{x:number,y:number}>} path
 * @param {(x:number,y:number)=>boolean} [isBlocked] occupancy test, same as findPath
 * @returns {Array<{x:number,y:number,i:number}>} waypoints (first and last preserved);
 *   `i` is the index into `path`
 */
export function smoothPath(grid, path, isBlocked = null) {
  const wp = (k) => ({ x: path[k].x, y: path[k].y, i: k });
  if (path.length <= 2) return path.map((_, k) => wp(k));
  const out = [wp(0)];
  let anchor = 0;
  while (anchor < path.length - 1) {
    let next = anchor + 1;
    for (let j = path.length - 1; j > anchor + 1; j--) {
      if (grid.lineClear(path[anchor].x, path[anchor].y, path[j].x, path[j].y, true, isBlocked)) { next = j; break; }
    }
    out.push(wp(next));
    anchor = next;
  }
  return out;
}

// ---- binary min-heap of [priority, index] stored flat -----------------------

function heapPush(h, pri, idx) {
  let i = h.length / 2;
  h.push(pri, idx);
  while (i > 0) {
    const p = (i - 1) >> 1;
    if (h[p * 2] <= pri) break;
    h[i * 2] = h[p * 2];
    h[i * 2 + 1] = h[p * 2 + 1];
    i = p;
  }
  h[i * 2] = pri;
  h[i * 2 + 1] = idx;
}

function heapPop(h) {
  const top = h[1];
  const pri = h[h.length - 2];
  const idx = h[h.length - 1];
  h.length -= 2;
  const n = h.length / 2;
  if (n > 0) {
    let i = 0;
    for (;;) {
      let c = i * 2 + 1;
      if (c >= n) break;
      if (c + 1 < n && h[(c + 1) * 2] < h[c * 2]) c++;
      if (h[c * 2] >= pri) break;
      h[i * 2] = h[c * 2];
      h[i * 2 + 1] = h[c * 2 + 1];
      i = c;
    }
    h[i * 2] = pri;
    h[i * 2 + 1] = idx;
  }
  return top;
}
