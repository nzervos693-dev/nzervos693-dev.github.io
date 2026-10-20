/**
 * Zombie records, aggro and the per-frame AI step. Pure, no Phaser.
 *
 * A zombie record (persisted in state.zombies[id]) is
 *   { id, type, floor, x, homeX, hp, dead, roam? }
 * The AI keeps its transient fields in a separate `ai` object (never saved):
 *   { mode, cd, stun, pause, wanderTo, facing, moving }
 * modes: idle | wander | return | chase | attack
 *
 * Rules (GDD 5.3 and 5.4):
 *  - aggro on sight: the hero is on the same floor and within balance.zombies.aggroRadius,
 *    or standing in the zombie's room; a jammed door between them blocks sight.
 *  - aggro on noise: same floor within the noise radius (Infinity = whole floor); never other floors.
 *  - zombies never use stairs; when the hero leaves the floor they walk back home.
 *  - a jammed apartment door is a wall for zombies in both directions.
 */

/** Tunables the GDD does not give numbers for. Override via balance.zombies.tuning.<key>. */
export const TUNE_DEFAULTS = {
  attackWindupSeconds: 0.6, // delay before the first bite after aggro / arriving
  wanderSpeedMult: 0.4,
  wanderRadiusPx: 60,
  wanderPauseSeconds: [1, 3],
  hitStunSeconds: 0.25,
  corpseSeconds: 1.5,
  maxWanderersPerFloor: 3,
  wanderSpawnMinHeroDistancePx: 200,
};

/** @returns {typeof TUNE_DEFAULTS} */
export const zombieTuning = (balance) => ({ ...TUNE_DEFAULTS, ...(balance.zombies?.tuning || {}) });

export const STEP_ATTACK = 1;
export const STEP_AGGRO = 2;

/** Side margin kept from the walls and jammed doors, px. */
const EDGE_PAD = 16;
const DOOR_PAD = 12;

/** Id of the n-th zombie authored in an apartment. */
export const zombieId = (apt, i) => `${apt.id}#${i}`;
export const isWanderer = (id) => id.startsWith('wander:');
export const isScripted = (id) => id.startsWith('scripted:');

/** Fresh zombie record. */
export function makeZombie(id, type, floor, x, balance, extra = {}) {
  return { id, type, floor, x, homeX: x, hp: balance.zombies.types[type].hp, dead: false, ...extra };
}

/**
 * Create records for every authored zombie that has none yet and drop records of authored zombies
 * that no longer exist in the level data. Wanderers and scripted spawns are kept.
 * Mutates state.zombies.
 */
export function initZombies(state, tower, balance) {
  const zs = (state.zombies && typeof state.zombies === 'object') ? state.zombies : {};
  const wanted = new Set();
  for (const apt of tower.apartments.values()) {
    (apt.zombies || []).forEach((z, i) => {
      const id = zombieId(apt, i);
      wanted.add(id);
      if (!balance.zombies.types[z.type]) return;
      const old = zs[id];
      if (!old || !Number.isFinite(old.x) || !Number.isFinite(old.hp) || !Number.isFinite(old.homeX)) {
        zs[id] = makeZombie(id, z.type, apt.floor, z.x, balance);
      }
    });
  }
  for (const id of Object.keys(zs)) {
    const z = zs[id];
    const keep = (isWanderer(id) && !z?.dead) || isScripted(id) || wanted.has(id);
    if (!keep || !z || !balance.zombies.types[z.type] || !tower.floors.has(z.floor) || !Number.isFinite(z.x) || !Number.isFinite(z.hp)) delete zs[id];
    else if (!Number.isFinite(z.homeX)) z.homeX = z.x;
  }
  state.zombies = zs;
  return zs;
}

/** Zombies still alive on a floor (not for per-frame use). */
export function aliveOnFloor(state, floor) {
  const out = [];
  for (const id in state.zombies) {
    const z = state.zombies[id];
    if (z.floor === floor && !z.dead) out.push(z);
  }
  return out;
}

/** Number of living zombies on a floor. */
export function countAlive(state, floor) {
  let n = 0;
  for (const id in state.zombies) {
    const z = state.zombies[id];
    if (z.floor === floor && !z.dead) n++;
  }
  return n;
}

/** Fresh transient AI state. */
export const makeAi = () => ({ mode: 'idle', cd: 0, stun: 0, pause: 0, wanderTo: null, facing: 1, moving: false });

/** Room object containing x on a floor (no allocation), or null. */
export function roomRefAt(tower, floor, x) {
  const f = tower.floors.get(floor);
  if (!f) return null;
  for (const a of f.apartments) {
    if (x < a.xMin || x > a.xMax) continue;
    for (const r of a.rooms) if (x >= r.xMin && x <= r.xMax) return r;
  }
  return null;
}

/** Is a jammed door between x1 and x2 on this floor? */
export function barrierBetween(tower, doors, floor, x1, x2) {
  const f = tower.floors.get(floor);
  if (!f) return false;
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  for (const a of f.apartments) {
    if (doors[a.id]?.state === 'jammed' && a.doorX > lo && a.doorX < hi) return true;
  }
  return false;
}

/**
 * Walkable x range for something standing at x (jammed doors are walls). Writes into `out`.
 * @returns {{min:number,max:number}} out
 */
export function movementBounds(tower, doors, floor, x, out) {
  out.min = EDGE_PAD;
  out.max = tower.floorWidth - EDGE_PAD;
  const f = tower.floors.get(floor);
  if (!f) return out;
  for (const a of f.apartments) {
    if (doors[a.id]?.state !== 'jammed') continue;
    if (x >= a.doorX) out.min = Math.max(out.min, a.doorX + DOOR_PAD);
    else out.max = Math.min(out.max, a.doorX - DOOR_PAD);
  }
  return out;
}

/** Start chasing (windup before the first bite). */
export function startChase(ai, tune) {
  ai.mode = 'chase';
  ai.wanderTo = null;
  ai.cd = Math.max(ai.cd, tune.attackWindupSeconds);
}

/**
 * Noise reaches this zombie? Aggros it. No effect on zombies already fighting.
 * @param {{floor:number,x:number,radius:number}} noise
 * @returns {boolean} newly aggroed
 */
export function hearNoise(z, ai, noise, tune) {
  if (z.dead || z.floor !== noise.floor) return false;
  if (ai.mode === 'chase' || ai.mode === 'attack') return false;
  if (Math.abs(z.x - noise.x) > noise.radius) return false;
  startChase(ai, tune);
  return true;
}

/** Can this zombie see the hero? (same floor assumed) */
function sees(z, env) {
  if (barrierBetween(env.tower, env.doors, z.floor, z.x, env.heroX)) return false;
  if (Math.abs(env.heroX - z.x) <= env.aggroRadius) return true;
  return env.heroRoom != null && roomRefAt(env.tower, z.floor, z.x) === env.heroRoom;
}

function moveTo(z, target, speed, dt, bounds) {
  const d = target - z.x;
  const step = speed * dt;
  let nx = Math.abs(d) <= step ? target : z.x + Math.sign(d) * step;
  nx = Math.min(bounds.max, Math.max(bounds.min, nx));
  const moved = Math.abs(nx - z.x) > 1e-6;
  z.x = nx;
  return moved;
}

/**
 * Advance one living zombie by dt seconds (mutates z and ai).
 * @param {object} env shared per-frame context: { tower, doors, heroFloor (null = untouchable),
 *   heroX, heroRoom, types, aggroRadius, attackRange, tune, rng, bounds:{min,max} }
 * @returns {number} bit flags: STEP_ATTACK (a bite lands now, apply damage), STEP_AGGRO (just noticed the hero)
 */
export function stepZombie(z, ai, env, dt) {
  let out = 0;
  if (ai.cd > 0) ai.cd -= dt;
  if (ai.stun > 0) { ai.stun -= dt; ai.moving = false; return 0; }
  const spec = env.types[z.type];
  const here = env.heroFloor === z.floor;
  const fighting = ai.mode === 'chase' || ai.mode === 'attack';
  if (fighting && !here) { ai.mode = 'return'; ai.wanderTo = null; }
  else if (!fighting && here && sees(z, env)) { startChase(ai, env.tune); out |= STEP_AGGRO; }

  const b = movementBounds(env.tower, env.doors, z.floor, z.x, env.bounds);
  ai.moving = false;

  if (ai.mode === 'chase' || ai.mode === 'attack') {
    const dx = env.heroX - z.x;
    const dist = Math.abs(dx);
    if (dist > 1) ai.facing = dx < 0 ? -1 : 1;
    const holding = ai.mode === 'attack' && dist <= env.attackRange;
    if (!holding && dist > env.attackRange * 0.8) {
      ai.mode = 'chase';
      ai.moving = moveTo(z, env.heroX, spec.speed, dt, b);
    } else {
      ai.mode = 'attack';
      if (dist <= env.attackRange && ai.cd <= 0) {
        ai.cd = spec.attackIntervalSeconds;
        out |= STEP_ATTACK;
      }
    }
    return out;
  }

  const slow = spec.speed * env.tune.wanderSpeedMult;
  if (ai.mode === 'return') {
    const target = Math.min(b.max, Math.max(b.min, z.homeX));
    ai.moving = moveTo(z, target, slow, dt, b);
    if (Math.abs(z.x - target) < 0.5 || !ai.moving) ai.mode = 'idle';
    if (ai.moving) ai.facing = target < z.x ? -1 : 1;
    return out;
  }

  // idle / wander
  if (ai.pause > 0) { ai.pause -= dt; ai.mode = 'idle'; return out; }
  if (ai.wanderTo == null) {
    const r = env.rng();
    const raw = z.roam ? b.min + r * (b.max - b.min) : z.homeX + (r * 2 - 1) * env.tune.wanderRadiusPx;
    ai.wanderTo = Math.min(b.max, Math.max(b.min, raw));
  }
  ai.mode = 'wander';
  const before = z.x;
  ai.moving = moveTo(z, ai.wanderTo, slow, dt, b);
  if (z.x !== before) ai.facing = z.x < before ? -1 : 1;
  if (!ai.moving || Math.abs(z.x - ai.wanderTo) < 0.5) {
    ai.wanderTo = null;
    const [lo, hi] = env.tune.wanderPauseSeconds;
    ai.pause = lo + env.rng() * (hi - lo);
    ai.mode = 'idle';
  }
  return out;
}

/** Send a zombie back to its spawn point at rest (app hidden). Keeps hp. */
export function resetZombie(z, ai) {
  z.x = z.homeX;
  ai.mode = 'idle';
  ai.cd = 0;
  ai.stun = 0;
  ai.pause = 0;
  ai.wanderTo = null;
  ai.moving = false;
}
