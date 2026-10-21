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
 *  - aggro on sight: the hero is on the same floor and within the sight radius of his light
 *    (Grey/Lit room 180, Dim room or landing 110, Dark room 70; balance.zombies.*SightRadiusPx);
 *    entering a room no longer wakes anyone; a jammed door between them blocks sight.
 *  - Stage 1 rule (GDD 11.3): every room counts as Grey, the landing as Dim.
 *  - lose track: an aggroed zombie that has not seen the hero for loseTrackSeconds while he is
 *    more than loseTrackDistancePx away (or on another floor, or it reached the noise it chased
 *    and found nothing) gives up and shambles home.
 *  - aggro on noise: same floor within the noise radius (Infinity = whole floor); never other floors.
 *  - zombies never use stairs; when the hero leaves the floor they walk back home.
 *  - a jammed apartment door is a wall for zombies in both directions.
 */

/** Tunables the GDD does not give numbers for. Override via balance.zombies.tuning.<key>. */
export const TUNE_DEFAULTS = {
  attackWindupSeconds: 0.9, // delay before the first bite after aggro / arriving
  wanderSpeedMult: 0.4,
  wanderRadiusPx: 60,
  wanderPauseSeconds: [2, 5],
  hitStunSeconds: 0.35,
  corpseSeconds: 1.5,
  loseTrackSeconds: 8,
  loseTrackDistancePx: 400,
  groupSpacingPx: [24, 48],
  maxWanderersPerFloor: 3,
  wanderSpawnMinHeroDistancePx: 200,
  // facing (balance.zombies.sight.*): the zombie sees far in front, barely behind
  behindWalkPx: 24,
  behindRunPx: 60,
  idleTurnSeconds: [4, 8],
  turnSeconds: 0.4,
  spawnFacingAwayChance: 0.7,
};

/** Tuning from balance.zombies.tuning plus the facing numbers of balance.zombies.sight. */
export const zombieTuning = (balance) => {
  const sight = balance.zombies?.sight || {};
  const facing = {};
  for (const k of ['behindWalkPx', 'behindRunPx', 'idleTurnSeconds', 'turnSeconds', 'spawnFacingAwayChance']) if (sight[k] != null) facing[k] = sight[k];
  return { ...TUNE_DEFAULTS, ...(balance.zombies?.tuning || {}), ...facing };
};

export const STEP_ATTACK = 1;
export const STEP_AGGRO = 2;
/** A bite lands on the home barricade (apply damage to it, not to the hero). */
export const STEP_BARRICADE = 4;

/** Gap a blocked zombie keeps from the home barricade, px. */
export const BARRICADE_PAD = 12;

/** Side margin kept from the walls and jammed doors, px. */
const EDGE_PAD = 16;
const DOOR_PAD = 12;

/** Id of the n-th zombie authored in an apartment. */
export const zombieId = (apt, i) => `${apt.id}#${i}`;
export const isWanderer = (id) => id.startsWith('wander:');
export const isScripted = (id) => id.startsWith('scripted:');
/** Attack zombies (piece 3b) live in state.zombies only while the attack is fought; they are never saved. */
export const isAttacker = (id) => id.startsWith('attack:');

/** Fresh zombie record. */
export function makeZombie(id, type, floor, x, balance, extra = {}) {
  return { id, type, floor, x, homeX: x, hp: balance.zombies.types[type].hp, dead: false, ...extra };
}

/**
 * Create records for every authored zombie that has none yet and drop records of authored zombies
 * that no longer exist in the level data. Wanderers and scripted spawns are kept.
 * Mutates state.zombies.
 */
export function initZombies(state, tower, balance, rng = Math.random) {
  const tune = zombieTuning(balance);
  const zs = (state.zombies && typeof state.zombies === 'object') ? state.zombies : {};
  const wanted = new Set();
  for (const apt of tower.apartments.values()) {
    (apt.zombies || []).forEach((z, i) => {
      const id = zombieId(apt, i);
      wanted.add(id);
      if (!balance.zombies.types[z.type]) return;
      const old = zs[id];
      if (!old || !Number.isFinite(old.x) || !Number.isFinite(old.hp) || !Number.isFinite(old.homeX)) {
        zs[id] = makeZombie(id, z.type, apt.floor, z.x, balance, { facing: spawnFacing(z, apt, z.x, rng, tune) });
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
export const makeAi = (facing = 1) => ({
  mode: 'idle', cd: 0, stun: 0, pause: 0, wanderTo: null, facing, moving: false,
  unseen: 0, lastKnownX: null, noticed: false,
  turnT: -1, turning: 0, // idle head-turn timers (turnT < 0: not scheduled yet)
});

/** Facing (+1 right, -1 left) from a floors.json `facing` field: -1/1, 'left'/'right', or null. */
export function parseFacing(f) {
  if (f === 'left' || f === -1) return -1;
  if (f === 'right' || f === 1) return 1;
  return null;
}

/**
 * Spawn facing: the authored `facing` if given, else 70% (spawnFacingAwayChance) looking away from the unit's
 * front door and 30% toward it.
 */
export function spawnFacing(def, apt, x, rng, tune) {
  const set = parseFacing(def?.facing);
  if (set != null) return set;
  const away = x >= apt.doorX ? 1 : -1;
  return rng() < tune.spawnFacingAwayChance ? away : -away;
}

/**
 * Has this zombie noticed the hero (seen him, or been hit by him)? A zombie that only heard a noise and
 * walks toward it is not aware yet, so a first hit on it still counts as unaware (x3, GDD 5.4).
 */
export const isAware = (ai) => (ai.mode === 'chase' || ai.mode === 'attack') && ai.noticed;

/**
 * Front sight radius for a hero standing at x on a floor (zombies.sight.*): Grey/Lit room (frontPx 180),
 * Dim room or the landing (dimFrontPx 110). Behind a zombie it only sees 24 px (walking) or 60 px (running).
 * Stage 1: every apartment room counts as Grey, the stairwell landing as Dim. Dark (70) arrives with stage 4.
 */
export function sightRadius(tower, floor, x, balance) {
  const z = balance.zombies.sight || {};
  const inRoom = roomRefAt(tower, floor, x) != null;
  return inRoom ? (z.frontPx ?? 180) : (z.dimFrontPx ?? 110);
}

/** Positions of a group of n zombies around x, spaced 24-48 px apart (zombies.tuning.groupSpacingPx). */
export function groupOffsets(n, rng, tune) {
  const [lo, hi] = tune.groupSpacingPx;
  const out = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    out.push(at);
    at += lo + rng() * (hi - lo);
  }
  return out;
}

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
 * Walkable x range for something standing at x (jammed doors and a standing barricade are walls
 * for zombies). Writes into `out`.
 * @param {{up:boolean, floor:number, x:number}|null} [barricade] home barricade (up = built and above 0 HP)
 * @returns {{min:number,max:number}} out
 */
export function movementBounds(tower, doors, floor, x, out, barricade = null) {
  out.min = EDGE_PAD;
  out.max = tower.floorWidth - EDGE_PAD;
  const f = tower.floors.get(floor);
  if (!f) return out;
  for (const a of f.apartments) {
    if (doors[a.id]?.state !== 'jammed') continue;
    if (x >= a.doorX) out.min = Math.max(out.min, a.doorX + DOOR_PAD);
    else out.max = Math.min(out.max, a.doorX - DOOR_PAD);
  }
  if (barricade && barricade.up && barricade.floor === floor) {
    if (x >= barricade.x) out.min = Math.max(out.min, barricade.x + BARRICADE_PAD);
    else out.max = Math.min(out.max, barricade.x - BARRICADE_PAD);
  }
  return out;
}

/** Start chasing (windup before the first bite). */
export function startChase(ai, tune) {
  ai.mode = 'chase';
  ai.wanderTo = null;
  ai.unseen = 0;
  ai.lastKnownX = null;
  ai.noticed = false;
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
  ai.lastKnownX = noise.x; // it shambles toward the sound, not toward the hero
  return true;
}

/** Can this zombie see the hero? (same floor assumed; env.sightRadius is set per frame from his light) */
function sees(z, ai, env) {
  if (barrierBetween(env.tower, env.doors, z.floor, z.x, env.heroX)) return false;
  const bar = env.barricade;
  // an intact barricade blocks sight both ways
  if (bar && bar.up && bar.floor === z.floor && (z.x >= bar.x) !== (env.heroX >= bar.x)) return false;
  const dx = env.heroX - z.x;
  const front = Math.abs(dx) < 1 || (dx < 0 ? -1 : 1) === ai.facing;
  const radius = front ? env.sightRadius : (env.heroRunning ? env.tune.behindRunPx : env.tune.behindWalkPx);
  return Math.abs(dx) <= radius;
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
 *   heroX, heroRoom, types, sightRadius, attackRange, tune, rng, bounds:{min,max} }
 * @returns {number} bit flags: STEP_ATTACK (a bite lands now, apply damage), STEP_AGGRO (just noticed the hero)
 */
export function stepZombie(z, ai, env, dt) {
  let out = 0;
  if (ai.cd > 0) ai.cd -= dt;
  if (ai.stun > 0) { ai.stun -= dt; ai.moving = false; return 0; }
  const spec = env.types[z.type];
  const here = env.heroFloor === z.floor;
  const fighting = ai.mode === 'chase' || ai.mode === 'attack';
  const seen = here && sees(z, ai, env);
  if (fighting) {
    if (seen || z.siege) ai.unseen = 0; else ai.unseen += dt;
    const far = !here || Math.abs(env.heroX - z.x) > env.tune.loseTrackDistancePx;
    const arrived = ai.lastKnownX != null && Math.abs(ai.lastKnownX - z.x) <= 4;
    if (!z.siege && ai.unseen >= env.tune.loseTrackSeconds && (far || arrived)) { ai.mode = 'return'; ai.wanderTo = null; ai.lastKnownX = null; ai.noticed = false; }
  } else if (seen) { startChase(ai, env.tune); ai.lastKnownX = env.heroX; ai.noticed = true; out |= STEP_AGGRO; }
  if (ai.mode === 'chase' && seen) {
    ai.lastKnownX = env.heroX;
    if (!ai.noticed) { ai.noticed = true; out |= STEP_AGGRO; } // a noise-alerted zombie that now sees him
  }

  const b = movementBounds(env.tower, env.doors, z.floor, z.x, env.bounds, env.barricade);
  ai.moving = false;

  if (ai.mode === 'chase' || ai.mode === 'attack') {
    if (!here) { // the hero left the floor: stand where the trail ends until it goes cold
      ai.mode = 'chase';
      if (ai.lastKnownX != null) ai.moving = moveTo(z, ai.lastKnownX, spec.speed, dt, b);
      return out;
    }
    // follow the hero while he is in sight (or the trail is unknown), else go to where the noise was
    const aim = seen || ai.lastKnownX == null ? env.heroX : ai.lastKnownX;
    if (!seen && ai.lastKnownX != null && Math.abs(aim - z.x) <= 4) { ai.mode = 'chase'; return out; }
    const dx = aim - z.x;
    const dist = Math.abs(env.heroX - z.x);
    if (Math.abs(dx) > 1) ai.facing = dx < 0 ? -1 : 1;
    const bar = env.barricade;
    if (bar && bar.up && bar.floor === z.floor) {
      const zIn = z.x >= bar.x;
      const hIn = env.heroX >= bar.x; // the hero standing exactly on the barricade counts as inside
      if (zIn !== hIn) {
        // the barricade is between us and the hero: walk up to it; only a zombie outside hits it
        ai.moving = moveTo(z, aim, spec.speed, dt, b);
        if (zIn) { ai.mode = 'chase'; return out; }
        if (Math.abs(z.x - bar.x) <= env.attackRange) {
          ai.mode = 'attack';
          if (ai.cd <= 0) {
            ai.cd = spec.attackIntervalSeconds;
            out |= STEP_BARRICADE;
          }
        } else ai.mode = 'chase';
        return out;
      }
    }
    const holding = ai.mode === 'attack' && dist <= env.attackRange;
    if (!holding && dist > env.attackRange * 0.8) {
      ai.mode = 'chase';
      ai.moving = moveTo(z, aim, spec.speed, dt, b);
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
  if (ai.pause > 0) {
    ai.pause -= dt;
    ai.mode = 'idle';
    idleTurn(ai, env, dt);
    return out;
  }
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

/** An idle zombie turns its head every 4-8 s (0.4 s turn), then faces the other way. */
function idleTurn(ai, env, dt) {
  const [lo, hi] = env.tune.idleTurnSeconds;
  if (ai.turning > 0) {
    ai.turning -= dt;
    if (ai.turning <= 0) { ai.facing = -ai.facing; ai.turnT = lo + env.rng() * (hi - lo); }
    return;
  }
  if (ai.turnT < 0) ai.turnT = lo + env.rng() * (hi - lo);
  ai.turnT -= dt;
  if (ai.turnT <= 0) ai.turning = env.tune.turnSeconds;
}

/** Send a zombie back to its spawn point at rest (app hidden). Keeps hp. */
export function resetZombie(z, ai) {
  z.x = z.homeX;
  ai.mode = 'idle';
  ai.noticed = false;
  ai.cd = 0;
  ai.stun = 0;
  ai.pause = 0;
  ai.wanderTo = null;
  ai.moving = false;
}
