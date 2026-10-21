/**
 * Hero movement on the tile grid (GDD 4, 5.3, 5.18). Pure, no Phaser.
 *
 * A walk is a smoothed A* path (core path.js, hero mode). stepWalk advances the hero along it by dt
 * seconds and reports what the scene must do: open a closed door at the waypoint before it, stop at a
 * locked (jammed or foreign barricade) door, squeeze through his own barricade, or stop at a zombie.
 * Facing is a GRID angle; turning is rate limited.
 */
import { findPath, pathConfig } from '../iso/path.js';
import { MOVE } from '../iso/grid.js';
import { angleDiff, normalizeAngle } from '../iso/projection.js';

const RAD = 180 / Math.PI;

/** Result codes of stepWalk. */
export const WALK = Object.freeze({ MOVING: 0, ARRIVED: 1, OPEN_DOOR: 2, LOCKED: 3, SQUEEZE: 4, BLOCKED: 5 });

/**
 * Plan a walk.
 * @param {import('../iso/grid.js').Grid} grid
 * @param {{x:number,y:number}} from hero position (continuous tile units)
 * @param {{x:number,y:number}} goal goal tile (integers, walkable)
 * @param {{run?:boolean, balance:object, isBlocked?:(x:number,y:number)=>boolean}} o
 * @returns {object|null} walk plan, or null when no path exists
 */
export function planWalk(grid, from, goal, o) {
  const cfg = pathConfig(o.balance);
  const start = { x: Math.floor(from.x), y: Math.floor(from.y) };
  const r = findPath(grid, start, goal, {
    mode: 'hero', doorCost: cfg.heroDoorCost, squeezeCost: cfg.squeezeCost, maxExpansions: cfg.maxExpansions,
    throughLocked: true, smooth: true, isBlocked: o.isBlocked,
  });
  if (!r.found) return null;
  let k = 0;
  const wps = r.waypoints;
  if (wps.length > 1 && !r.doors.some((d) => d.index === 0)) k = 1;
  return { waypoints: wps, k, doors: r.doors, handled: new Set(), run: !!o.run, goal: { x: goal.x, y: goal.y }, path: r.path };
}

/** Shortest-turn step of `facing` toward `target` by at most rate*dt degrees. @returns {number} new facing */
export function turnToward(facing, target, rate, dt) {
  const d = angleDiff(facing, target);
  const step = rate * dt;
  if (Math.abs(d) <= step) return normalizeAngle(target);
  return normalizeAngle(facing + Math.sign(d) * step);
}

/**
 * Advance the hero along a walk. Mutates hero (x, y, facing) and walk (k, handled).
 * @param {{x:number,y:number,facing:number}} hero
 * @param {object} walk from planWalk
 * @param {number} dt seconds
 * @param {{grid:object, speed:number, turnRate:number, isBlocked?:(x:number,y:number)=>boolean}} env speed in tiles/s
 * @returns {{code:number, door:object|null}} scratch object valid until the next call
 */
export function stepWalk(hero, walk, dt, env) {
  const out = STEP_OUT;
  out.door = null;
  out.code = WALK.MOVING;
  const wps = walk.waypoints;
  let budget = env.speed * dt;
  while (walk.k < wps.length) {
    const wp = wps[walk.k];
    // a door sits between this waypoint and the next one once we stand on the waypoint
    const dIdx = doorAfter(walk, wp.i);
    const cx = wp.x + 0.5;
    const cy = wp.y + 0.5;
    const dx = cx - hero.x;
    const dy = cy - hero.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1e-4) hero.facing = turnToward(hero.facing, Math.atan2(dy, dx) * RAD, env.turnRate, dt);
    if (d > budget) {
      const nx = hero.x + (dx / d) * budget;
      const ny = hero.y + (dy / d) * budget;
      if (env.isBlocked && (Math.floor(nx) !== Math.floor(hero.x) || Math.floor(ny) !== Math.floor(hero.y)) && env.isBlocked(Math.floor(nx), Math.floor(ny))) {
        out.code = WALK.BLOCKED;
        return out;
      }
      hero.x = nx;
      hero.y = ny;
      return out;
    }
    if (env.isBlocked && (wp.x !== Math.floor(hero.x) || wp.y !== Math.floor(hero.y)) && env.isBlocked(wp.x, wp.y)) {
      out.code = WALK.BLOCKED;
      return out;
    }
    hero.x = cx;
    hero.y = cy;
    budget -= d;
    if (dIdx >= 0 && !walk.handled.has(dIdx)) {
      const pd = walk.doors[dIdx];
      const door = env.grid.doors.get(pd.edge);
      const cls = env.grid.moveClass(pd.edge);
      if (cls === MOVE.CLOSED) { out.code = WALK.OPEN_DOOR; out.door = door; return out; }
      if (cls === MOVE.LOCKED) { out.code = WALK.LOCKED; out.door = door; return out; }
      if (cls === MOVE.SQUEEZE) { walk.handled.add(dIdx); out.code = WALK.SQUEEZE; out.door = door; walk.k++; return out; }
      walk.handled.add(dIdx);
    }
    walk.k++;
  }
  out.code = WALK.ARRIVED;
  return out;
}
const STEP_OUT = { code: 0, door: null };

/** Index into walk.doors of the door crossed right after the waypoint with path index `i`, or -1. */
function doorAfter(walk, i) {
  for (let j = 0; j < walk.doors.length; j++) if (walk.doors[j].index === i) return j;
  return -1;
}

/** Mark the door handled after the scene opened it (the walk continues through it). */
export function doorHandled(walk, door) {
  for (let j = 0; j < walk.doors.length; j++) if (walk.doors[j].id === door.id) walk.handled.add(j);
}

/**
 * Tile to stand on to act on something at `target` tiles: the best of `candidates` (walkable, with an
 * open step to a target tile) by path length from the hero. Candidate tiles are the orthogonal
 * neighbours of the footprint, the tile in front first.
 * @param {import('../iso/grid.js').Grid} grid
 * @param {{x:number,y:number}} from hero tile
 * @param {Array<{x:number,y:number}>} candidates
 * @param {object} balance
 * @param {(x:number,y:number)=>boolean} [isBlocked]
 * @returns {{x:number,y:number,cost:number}|null}
 */
export function bestStandTile(grid, from, candidates, balance, isBlocked) {
  const cfg = pathConfig(balance);
  let best = null;
  for (const c of candidates) {
    if (!grid.isWalkable(c.x, c.y)) continue;
    if (c.x === from.x && c.y === from.y) return { x: c.x, y: c.y, cost: 0 };
    const r = findPath(grid, from, c, { mode: 'hero', doorCost: cfg.heroDoorCost, squeezeCost: cfg.squeezeCost, throughLocked: true, isBlocked });
    if (!r.found) continue;
    if (!best || r.cost < best.cost - 1e-6) best = { x: c.x, y: c.y, cost: r.cost };
  }
  return best;
}

/**
 * Orthogonal stand tiles around a rectangle footprint with no wall between the stand tile and the
 * footprint tile; `front` (a grid step [dx,dy]) goes first.
 * @param {import('../iso/grid.js').Grid} grid
 * @param {Array<{x:number,y:number}>} tiles footprint
 * @param {number[]|null} front preferred step, e.g. [0, 1]
 */
export function standCandidates(grid, tiles, front = null) {
  const out = [];
  const seen = new Set();
  const own = new Set(tiles.map((t) => t.y * grid.width + t.x));
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  if (front) dirs.sort((a, b) => (b[0] === front[0] && b[1] === front[1] ? 1 : 0) - (a[0] === front[0] && a[1] === front[1] ? 1 : 0));
  for (const t of tiles) {
    for (const [dx, dy] of dirs) {
      const x = t.x + dx;
      const y = t.y + dy;
      const key = y * grid.width + x;
      if (own.has(key) || seen.has(key) || !grid.inBounds(x, y)) continue;
      if (grid.moveClass(grid.edgeBetween(t.x, t.y, x, y)) !== MOVE.OPEN) continue;
      seen.add(key);
      out.push({ x, y });
    }
  }
  return out;
}

/** Grid angle from a point to another (degrees). */
export const angleTo = (ax, ay, bx, by) => normalizeAngle(Math.atan2(by - ay, bx - ax) * RAD);
