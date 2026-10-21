/**
 * Wandering walkers on Cleared-but-not-Secured floors (GDD 5.3):
 * 1-2 every 12 h (balance.world.wanderersPerInterval / wandererIntervalHours).
 * Pure, no Phaser. Timers live in state.wanderAt[floor] (epoch ms of the next arrival).
 */
import { makeZombie, countAlive, zombieTuning } from './zombies.js';

const MAX_CATCHUP_ROUNDS = 50;

export const wanderIntervalMs = (balance) => balance.world.wandererIntervalHours * 3600 * 1000;

/** (Re)start a floor's wander timer from `atMs`. */
export function scheduleWander(state, floor, atMs, balance) {
  state.wanderAt = state.wanderAt || {};
  state.wanderAt[floor] = atMs + wanderIntervalMs(balance);
}

/** Random integer in [lo, hi] from rng(). */
const randInt = (rng, lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

/**
 * Pick a spawn x away from the hero (when he is on that floor).
 * @param {{floor:number, x:number}|null} hero
 */
export function pickSpawnX(rng, tower, floor, hero, minHeroDistance, state = null) {
  const segs = spawnSegments(tower, floor, state);
  if (!segs.length) return null;
  const total = segs.reduce((n, [a, b]) => n + (b - a), 0);
  const pick = () => {
    let r = rng() * total;
    for (const [a, b] of segs) {
      if (r <= b - a) return a + r;
      r -= b - a;
    }
    return segs[segs.length - 1][1];
  };
  let x = pick();
  if (hero && hero.floor === floor) {
    for (let i = 0; i < 6 && Math.abs(x - hero.x) < minHeroDistance; i++) x = pick();
    if (Math.abs(x - hero.x) < minHeroDistance) {
      // fall back to the segment end farthest from the hero
      const ends = segs.flat();
      x = ends.reduce((best, e) => (Math.abs(e - hero.x) > Math.abs(best - hero.x) ? e : best), ends[0]);
    }
  }
  return Math.round(x);
}

/** Margin kept from the home apartment walls, px. */
const HOME_MARGIN = 20;

/** Home apartments on a floor that wanderers keep out of: the hero's, plus countsAsHome ones once cleared (latched). */
function homeRanges(tower, floor, state) {
  if (floor !== tower.homeFloor) return [];
  return [...tower.apartments.values()].filter((a) => a.floor === floor
    && (a.isHome || (a.buildSpots?.countsAsHome && state?.flags?.aptCleared?.[a.id])));
}

/**
 * x ranges where a wanderer may appear: the floor minus the stairwell and the home apartment(s).
 * Empty when nothing is left (every apartment of the floor counts as home).
 */
export function spawnSegments(tower, floor, state = null) {
  const lo = tower.stairwell.xMax + 60;
  const hi = tower.floorWidth - 40;
  let segs = [[lo, hi]];
  for (const a of homeRanges(tower, floor, state)) {
    const from = a.xMin - HOME_MARGIN;
    const to = a.xMax + HOME_MARGIN;
    segs = segs.flatMap(([x0, x1]) => {
      const out = [];
      if (from > x0) out.push([x0, Math.min(x1, from)]);
      if (x1 > to) out.push([Math.max(x0, to), x1]);
      return out;
    }).filter(([x0, x1]) => x1 > x0);
  }
  return segs;
}

/**
 * Time beyond the offline cap is lost: after a capped catch-up, due times that are still in the past
 * move to one interval from `nowMs`.
 */
export function dropLostWanderTime(state, nowMs, balance) {
  for (const n of Object.keys(state.wanderAt || {})) {
    if (state.wanderAt[n] < nowMs) state.wanderAt[n] = nowMs + wanderIntervalMs(balance);
  }
}

/**
 * Spawn every wanderer that is due at `atMs`. Works for online ticks and offline catch-up
 * steps (call it from a catchUp stepHook with the step's timestamp). Mutates state.zombies,
 * state.wanderAt, state.counters.wander.
 * @param {object} state game state
 * @param {object} tower from buildTower
 * @param {object} balance
 * @param {number} atMs simulated "now"
 * @param {() => number} rng
 * @param {{hero?:{floor:number,x:number}}} [opts] hero position (online only) to avoid spawning on top of him
 * @returns {object[]} newly created zombie records
 */
export function spawnDueWanderers(state, tower, balance, atMs, rng, opts = {}) {
  const made = [];
  const tune = zombieTuning(balance);
  state.wanderAt = state.wanderAt || {};
  state.counters = state.counters || {};
  const [lo, hi] = balance.world.wanderersPerInterval;
  const interval = wanderIntervalMs(balance);
  for (const n of tower.floors.keys()) {
    if (state.floorStates[n] !== 'Cleared') continue;
    if (state.wanderAt[n] == null) { scheduleWander(state, n, atMs, balance); continue; }
    let rounds = 0;
    while (atMs >= state.wanderAt[n] && rounds++ < MAX_CATCHUP_ROUNDS) {
      state.wanderAt[n] += interval;
      const want = randInt(rng, lo, hi);
      for (let k = 0; k < want; k++) {
        if (countAlive(state, n) >= tune.maxWanderersPerFloor) break;
        state.counters.wander = (state.counters.wander || 0) + 1;
        const id = `wander:${state.counters.wander}`;
        const x = pickSpawnX(rng, tower, n, opts.hero || null, tune.wanderSpawnMinHeroDistancePx, state);
        if (x == null) break; // nowhere outside the home apartments
        const z = makeZombie(id, 'walker', n, x, balance, { roam: true, facing: rng() < 0.5 ? -1 : 1 });
        state.zombies[id] = z;
        made.push(z);
      }
    }
  }
  return made;
}
