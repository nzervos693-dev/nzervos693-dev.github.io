/**
 * Zombie AI on the tile grid (GDD 5.4, 5.17, 5.18). Pure, no Phaser.
 *
 * A zombie record (saved) is { id, type, floor, x, y, homeX, homeY, hp, dead, facing } with x/y in
 * continuous tile units (a zombie "is on" the tile containing its centre) and facing a GRID angle.
 * The transient AI (never saved) is made by makeIsoAi. Modes: idle | wander | chase | attack | return.
 *   chase + noticed=false  = it heard a noise and walks to that tile (not aware yet: first hit is x3)
 *   chase + noticed=true   = it has seen the hero (aware)
 * Movement follows A* paths (core path.js, zombie mode, closed doors cost +10). When the next step of
 * the path crosses a closed, jammed or barricaded door it stops and bangs: the scene applies the damage
 * (env.doorHit). Zombies cannot open doors.
 */
import { findPath } from '../iso/path.js';
import { MOVE } from '../iso/grid.js';
import { angleDiff } from '../iso/projection.js';
import { isAware } from './zombies.js';

export { isAware };

export const STEP_ATTACK = 1;
export const STEP_AGGRO = 2;
export const STEP_DOORHIT = 4;
/** Zombie gave up the chase and turns for home. */
export const STEP_LOST = 8;

const RAD = 180 / Math.PI;

/** Defaults when balance.zombies.* lacks a key. */
export const ISO_TUNE_DEFAULTS = {
  attackWindupSeconds: 0.9, wanderSpeedMult: 0.4, wanderPauseSeconds: [2, 5], hitStunSeconds: 0.35, loseTrackSeconds: 8,
  loseTrackDistanceTiles: 8, wanderRadiusTiles: 2, repathSeconds: 0.5, idleTurnSeconds: [4, 8], turnSeconds: 0.4,
};

/**
 * Tuning and sight numbers in one object from balance.
 * @param {object} balance
 */
export function isoZombieConfig(balance) {
  const z = balance.zombies;
  const sight = z.sight ?? {};
  return {
    tune: { ...ISO_TUNE_DEFAULTS, ...(z.tuning ?? {}), idleTurnSeconds: sight.idleTurnSeconds ?? ISO_TUNE_DEFAULTS.idleTurnSeconds, turnSeconds: sight.turnSeconds ?? ISO_TUNE_DEFAULTS.turnSeconds },
    cone: sight.coneDegrees ?? 120,
    front: sight.frontTiles ?? { lit: 5, grey: 4, dim: 2.5, dark: 1.5 },
    behindWalk: sight.behindWalkTiles ?? 0.9,
    behindRun: sight.behindRunTiles ?? 1.5,
    turnChances: sight.idleTurnChances ?? { left90: 0.4, right90: 0.4, turn180: 0.2 },
    attackRange: z.attackRangeTiles ?? 1.5,
    types: z.types,
    barricadeMult: z.barricadeDamageMult ?? 0.4,
    doorMult: balance.doors?.zombieDamageMult ?? 0.4,
    doorCost: balance.doors?.zombiePathDoorCost ?? 10,
    noiseBangSeconds: balance.doors?.noiseBangSeconds ?? 10,
    maxExpansions: balance.path?.maxExpansions ?? 4000,
  };
}

/**
 * Per-frame shared context. Fill `hero*` before stepping zombies.
 * @param {import('../iso/grid.js').Grid} grid @param {ReturnType<typeof isoZombieConfig>} cfg @param {()=>number} rng
 */
export function makeIsoEnv(grid, cfg, rng = Math.random) {
  const env = {
    grid, cfg, rng, occ: new Uint8Array(grid.width * grid.height),
    heroX: 0, heroY: 0, heroLight: 'dim', heroRunning: false, heroActive: false,
    doorHit: { door: null, damage: 0, jammed: false },
    blockedFn: null,
  };
  env.blockedFn = (x, y) => env.occ[y * grid.width + x] !== 0;
  return env;
}

/** Fresh transient AI for a record. */
export function makeIsoAi(rec, rng = Math.random, cfg = null) {
  const rep = cfg?.tune.repathSeconds ?? 0.5;
  return {
    mode: 'idle', cd: 0, stun: 0, pause: 1 + rng() * 3, facing: rec.facing ?? 90, moving: false, noticed: false,
    unseen: 0, last: null, path: null, pathI: 0, leg: false, repathT: rng() * rep, stagger: rng() * rep, wanderGoal: null,
    turnT: -1, turning: 0, windup: 0, noiseBang: 0, blocked: null, waitT: 0, sndT: rng() * 6,
  };
}

/** Rebuild the occupancy grid from living zombie records (once per frame). */
export function fillOccupancy(env, records) {
  env.occ.fill(0);
  const W = env.grid.width;
  for (let i = 0; i < records.length; i++) {
    const z = records[i];
    if (z.dead) continue;
    env.occ[Math.floor(z.y) * W + Math.floor(z.x)] = 1;
  }
}

/**
 * Can this zombie see the hero? Needs a line of sight (walls, closed and jammed doors block) and then
 * either the front cone within the light range of the HERO's tile, or the short range beside/behind.
 */
export function canSee(z, ai, env) {
  const cfg = env.cfg;
  const dx = env.heroX - z.x;
  const dy = env.heroY - z.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const front = cfg.front[env.heroLight] ?? cfg.front.dim;
  const maxR = Math.max(front, cfg.behindRun);
  if (dist > maxR) return false;
  let range;
  if (dist < 0.05) range = Infinity;
  else {
    const diff = Math.abs(angleDiff(ai.facing, Math.atan2(dy, dx) * RAD));
    range = diff <= cfg.cone / 2 ? front : env.heroRunning ? cfg.behindRun : cfg.behindWalk;
  }
  if (dist > range) return false;
  return env.grid.hasLOS(Math.floor(z.x), Math.floor(z.y), Math.floor(env.heroX), Math.floor(env.heroY));
}

/** Remember a tile as the trail's end without allocating. */
function setLast(ai, x, y) {
  if (ai.last) { ai.last.x = x; ai.last.y = y; } else ai.last = { x, y };
}

/** Start chasing (wind-up before the first bite). */
export function startIsoChase(ai, tune) {
  ai.mode = 'chase';
  ai.wanderGoal = null;
  ai.unseen = 0;
  ai.noticed = false;
  ai.windup = 0;
  ai.noiseBang = 0;
  ai.path = null;
  ai.repathT = ai.stagger ?? 0; // zombies woken together do not all path in the same frame
  ai.cd = Math.max(ai.cd, tune.attackWindupSeconds);
}

/**
 * Noise reaches this zombie (through walls)? Straight-line tiles on the floor. It walks to the noise
 * tile and is NOT aware yet. @param {{x:number,y:number,radius:number}} noise tile coordinates (continuous)
 * @returns {boolean} newly alerted
 */
export function hearIsoNoise(z, ai, noise, tune) {
  if (z.dead || ai.mode === 'chase' || ai.mode === 'attack') return false;
  if (Math.hypot(z.x - noise.x, z.y - noise.y) > noise.radius) return false;
  startIsoChase(ai, tune);
  setLast(ai, Math.floor(noise.x), Math.floor(noise.y));
  return true;
}

/**
 * A hero hit: damage, short stun; the zombie turns to him at once and knows where he is.
 * @param {number} [fromX] [fromY] hero position (tile units)
 * @returns {boolean} killed
 */
export function hitIsoZombie(z, ai, damage, tune, fromX, fromY) {
  z.hp = Math.max(0, z.hp - damage);
  if (z.hp <= 0) { z.dead = true; return true; }
  ai.stun = tune.hitStunSeconds;
  ai.windup = 0;
  if (ai.mode !== 'chase' && ai.mode !== 'attack') startIsoChase(ai, tune);
  ai.noticed = true;
  if (fromX !== undefined) {
    ai.facing = Math.atan2(fromY - z.y, fromX - z.x) * RAD;
    setLast(ai, Math.floor(fromX), Math.floor(fromY));
    ai.unseen = 0;
  }
  return false;
}

/** Back to the spawn tile at rest (app hidden). Keeps hp. */
export function resetIsoZombie(z, ai) {
  z.x = z.homeX;
  z.y = z.homeY;
  ai.mode = 'idle';
  ai.noticed = false;
  ai.cd = 0; ai.stun = 0; ai.pause = 1; ai.windup = 0; ai.path = null; ai.moving = false; ai.blocked = null;
}

function repath(z, ai, env, gx, gy, mode) {
  const g = env.grid;
  // mid-step: finish the step to the tile it is heading for, then continue from there
  const mid = ai.leg && ai.path && ai.pathI < ai.path.length ? ai.path[ai.pathI] : null;
  const start = mid ? { x: mid.x, y: mid.y } : { x: Math.floor(z.x), y: Math.floor(z.y) };
  ai.blocked = null;
  ai.leg = !!mid;
  ai.pathI = 0;
  const keep = mid ? ai.path : null;
  ai.path = null;
  if (!g.isWalkable(gx, gy)) return false;
  const r = findPath(g, start, { x: gx, y: gy }, {
    mode: 'zombie', doorCost: env.cfg.doorCost, isBlocked: env.blockedFn, maxExpansions: env.cfg.maxExpansions,
  });
  if (!r.found || (mode === 'wander' && r.doors.length)) { if (keep) { ai.path = keep; } ai.leg = false; return false; }
  ai.path = r.path;
  return true;
}

/** Follow ai.path at `speed` tiles/s; stops at doors it cannot pass (ai.blocked) and at occupied tiles. @returns {boolean} moved */
function walkPath(z, ai, env, speed, dt) {
  const p = ai.path;
  if (!p) return false;
  ai.blocked = null;
  const g = env.grid;
  const W = g.width;
  let budget = speed * dt;
  let moved = false;
  const ox = Math.floor(z.x);
  const oy = Math.floor(z.y);
  while (budget > 1e-6 && ai.pathI < p.length) {
    const t = p[ai.pathI];
    if (!ai.leg) {
      if (ai.pathI > 0) {
        const a = p[ai.pathI - 1];
        if (a.x === t.x || a.y === t.y) {
          const e = g.edgeBetween(a.x, a.y, t.x, t.y);
          if (g.moveClass(e) !== MOVE.OPEN) { ai.blocked = g.doors.get(e) ?? null; if (ai.blocked) break; }
        }
        // a stale path may have a diagonal that a door or wall change made illegal: stop and re-path
        if (a.x !== t.x && a.y !== t.y && g.stepClass(a.x, a.y, t.x - a.x, t.y - a.y) !== MOVE.OPEN) { ai.path = null; ai.repathT = 0; break; }
        const tx0 = Math.floor(z.x);
        const ty0 = Math.floor(z.y);
        if ((t.x !== tx0 || t.y !== ty0) && (env.occ[t.y * W + t.x] || (env.heroActive && Math.floor(env.heroX) === t.x && Math.floor(env.heroY) === t.y))) {
          ai.waitT += 0.05;
          ai.repathT = Math.min(ai.repathT, 0.15);
          break;
        }
      }
      ai.leg = true;
    }
    const cx = t.x + 0.5;
    const cy = t.y + 0.5;
    const dx = cx - z.x;
    const dy = cy - z.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 1e-4) ai.facing = Math.atan2(dy, dx) * RAD;
    if (d <= budget) { z.x = cx; z.y = cy; budget -= d; ai.leg = false; ai.pathI++; moved = true; ai.waitT = 0; } else { z.x += (dx / d) * budget; z.y += (dy / d) * budget; budget = 0; moved = true; }
  }
  const nx = Math.floor(z.x);
  const ny = Math.floor(z.y);
  if (nx !== ox || ny !== oy) { env.occ[oy * W + ox] = 0; env.occ[ny * W + nx] = 1; }
  return moved;
}

function bangDoor(z, ai, env, dt, spec) {
  const door = ai.blocked;
  const out = env.doorHit;
  // face the door
  const a = ai.path[ai.pathI - 1];
  const b = ai.path[ai.pathI];
  ai.facing = Math.atan2(b.y - a.y, b.x - a.x) * RAD;
  if (ai.cd > 0) return 0;
  ai.cd = spec.attackIntervalSeconds;
  out.door = door;
  out.jammed = door.state === 'jammed';
  const barricaded = door.barricade && door.barricade.hp > 0;
  out.damage = out.jammed ? 0 : spec.damage * (barricaded ? env.cfg.barricadeMult : env.cfg.doorMult);
  return STEP_DOORHIT;
}

function idleTurn(ai, env, dt) {
  const [lo, hi] = env.cfg.tune.idleTurnSeconds;
  if (ai.turning > 0) {
    ai.turning -= dt;
    if (ai.turning <= 0) {
      const c = env.cfg.turnChances;
      const r = env.rng();
      ai.facing = (ai.facing + (r < c.left90 ? -90 : r < c.left90 + c.right90 ? 90 : 180) + 360) % 360;
      ai.turnT = lo + env.rng() * (hi - lo);
    }
    return;
  }
  if (ai.turnT < 0) ai.turnT = lo + env.rng() * (hi - lo);
  ai.turnT -= dt;
  if (ai.turnT <= 0) ai.turning = env.cfg.tune.turnSeconds; // sight keeps the old facing meanwhile
}

function pickWanderGoal(z, ai, env) {
  const g = env.grid;
  const R = env.cfg.tune.wanderRadiusTiles;
  const hx = Math.floor(z.homeX);
  const hy = Math.floor(z.homeY);
  const room = g.roomOf ? g.roomOf(hx, hy) : null;
  for (let k = 0; k < 6; k++) {
    const x = hx + Math.round((env.rng() * 2 - 1) * R);
    const y = hy + Math.round((env.rng() * 2 - 1) * R);
    if (!g.isWalkable(x, y) || (x === Math.floor(z.x) && y === Math.floor(z.y))) continue;
    if (env.occ[y * g.width + x]) continue;
    if (room !== null && g.roomOf(x, y) !== room) continue;
    if (repath(z, ai, env, x, y, 'wander')) return true;
  }
  return false;
}

/**
 * Advance one living zombie by dt seconds (mutates z and ai).
 * @returns {number} flags: STEP_ATTACK (a bite lands now), STEP_AGGRO (just saw the hero),
 *   STEP_DOORHIT (env.doorHit holds the door and damage), STEP_LOST
 */
export function stepIsoZombie(z, ai, env, dt) {
  const cfg = env.cfg;
  const tune = cfg.tune;
  const spec = cfg.types[z.type];
  let out = 0;
  if (ai.cd > 0) ai.cd -= dt;
  ai.repathT -= dt;
  if (ai.stun > 0) { ai.stun -= dt; ai.moving = false; return 0; }

  const seen = env.heroActive && canSee(z, ai, env);
  const fighting = ai.mode === 'chase' || ai.mode === 'attack';
  const dist = env.heroActive ? Math.hypot(env.heroX - z.x, env.heroY - z.y) : Infinity;
  if (!fighting && seen) {
    startIsoChase(ai, tune);
    ai.noticed = true;
    out |= STEP_AGGRO;
  } else if (fighting && seen && !ai.noticed) {
    ai.noticed = true;
    out |= STEP_AGGRO;
  }
  if (seen && (ai.mode === 'chase' || ai.mode === 'attack')) {
    setLast(ai, Math.floor(env.heroX), Math.floor(env.heroY));
    ai.unseen = 0;
  } else if (ai.mode === 'chase' || ai.mode === 'attack') {
    // a noise-alerted zombie walks to the noise first; its patience only runs once it got there
    const atNoise = !!ai.last && Math.floor(z.x) === ai.last.x && Math.floor(z.y) === ai.last.y;
    if (ai.noticed || atNoise) ai.unseen += dt;
  }
  ai.moving = false;

  if (ai.mode === 'chase' || ai.mode === 'attack') {
    const arrived = !!ai.last && Math.floor(z.x) === ai.last.x && Math.floor(z.y) === ai.last.y;
    if (ai.unseen >= tune.loseTrackSeconds && (dist > tune.loseTrackDistanceTiles || arrived)) {
      ai.mode = 'return'; ai.noticed = false; ai.last = null; ai.path = null; ai.repathT = 0; ai.windup = 0;
      return out | STEP_LOST;
    }
    if (seen) {
      ai.facing = Math.atan2(env.heroY - z.y, env.heroX - z.x) * RAD;
      const clear = env.grid.hasLOS(Math.floor(z.x), Math.floor(z.y), Math.floor(env.heroX), Math.floor(env.heroY));
      const holding = ai.mode === 'attack';
      if (clear && dist <= cfg.attackRange * (holding ? 1.15 : 1)) {
        ai.mode = 'attack';
        ai.path = null;
        if (ai.windup > 0) {
          ai.windup -= dt;
          if (ai.windup <= 0) {
            ai.cd = spec.attackIntervalSeconds;
            if (dist <= cfg.attackRange) out |= STEP_ATTACK;
          }
        } else if (ai.cd <= 0) ai.windup = tune.attackWindupSeconds;
        return out;
      }
      if (ai.mode === 'attack') { ai.mode = 'chase'; ai.windup = 0; }
    } else if (ai.mode === 'attack') { ai.mode = 'chase'; ai.windup = 0; }

    // walk to where the hero is (seen) or was (noise / last seen)
    const goal = ai.last; // while seen it is the hero's tile (set above)
    if (!goal) { ai.unseen += dt; return out; }
    if (!seen && arrived) { // looking around where the trail ends
      if (ai.noiseBang > 0) ai.noiseBang = 0;
      idleTurn(ai, env, dt);
      return out;
    }
    if (ai.repathT <= 0 || !ai.path) {
      ai.repathT = tune.repathSeconds;
      repath(z, ai, env, goal.x, goal.y, 'chase');
    }
    if (ai.path) {
      ai.moving = walkPath(z, ai, env, spec.speedTilesPerSecond, dt);
      if (ai.blocked) {
        const mayBang = ai.noticed || ai.noiseBang < cfg.noiseBangSeconds;
        if (mayBang) {
          if (!ai.noticed) ai.noiseBang += dt;
          out |= bangDoor(z, ai, env, dt, spec);
        } else { ai.mode = 'return'; ai.noticed = false; ai.last = null; ai.path = null; ai.blocked = null; ai.repathT = 0; out |= STEP_LOST; }
      }
    }
    return out;
  }

  if (ai.mode === 'return') {
    const hx = Math.floor(z.homeX);
    const hy = Math.floor(z.homeY);
    if (Math.floor(z.x) === hx && Math.floor(z.y) === hy) { ai.mode = 'idle'; ai.pause = 1; ai.path = null; return out; }
    if (ai.repathT <= 0 || !ai.path) { ai.repathT = tune.repathSeconds * 2; if (!repath(z, ai, env, hx, hy, 'return')) { ai.mode = 'idle'; return out; } }
    ai.moving = walkPath(z, ai, env, spec.speedTilesPerSecond * tune.wanderSpeedMult, dt);
    if (ai.blocked) { ai.mode = 'idle'; ai.path = null; ai.blocked = null; }
    return out;
  }

  // idle / wander
  if (ai.mode === 'wander') {
    ai.moving = walkPath(z, ai, env, spec.speedTilesPerSecond * tune.wanderSpeedMult, dt);
    if (!ai.moving || !ai.path || ai.pathI >= ai.path.length) {
      ai.mode = 'idle';
      ai.path = null;
      ai.blocked = null;
      const [lo, hi] = tune.wanderPauseSeconds;
      ai.pause = lo + env.rng() * (hi - lo);
    }
    return out;
  }
  if (ai.pause > 0) { ai.pause -= dt; idleTurn(ai, env, dt); return out; }
  if (pickWanderGoal(z, ai, env)) ai.mode = 'wander';
  else ai.pause = 1 + env.rng() * 2;
  return out;
}
