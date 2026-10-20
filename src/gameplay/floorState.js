/**
 * Floor states (GDD 5.3): Infested -> Cleared -> Secured. Pure, no Phaser.
 * Cleared = no living zombies and every container searched (or dismantled).
 * A floor never goes back from Cleared to Infested: wandering walkers (see wanderers.js)
 * do not change the state. Secured is set by the Secure floor recipe (piece 3).
 */
import { countAlive, zombieId } from './zombies.js';
import { scheduleWander } from './wanderers.js';

/** Containers (objects with a Search primary) on a floor that were not searched or dismantled yet. */
export function unsearchedCount(tower, state, balance, floor) {
  let n = 0;
  for (const [id, e] of tower.objects) {
    if (e.floor !== floor || e.quest) continue;
    const def = balance.objects[e.placement.objectId];
    if (def?.primary?.type !== 'search') continue;
    const os = state.objects[id];
    if (!os?.searched && !os?.dismantled) n++;
  }
  return n;
}

/**
 * Is one apartment Cleared: its authored zombies dead and its containers searched or dismantled?
 * (Wanderers roam the floor and do not count.)
 */
export function apartmentCleared(tower, state, balance, apt) {
  const n = (apt.zombies || []).length;
  for (let i = 0; i < n; i++) {
    const z = state.zombies[zombieId(apt, i)];
    if (z && !z.dead) return false;
  }
  for (const [id, e] of tower.objects) {
    if (e.apt !== apt || e.quest) continue;
    if (balance.objects[e.placement.objectId]?.primary?.type !== 'search') continue;
    const os = state.objects[id];
    if (!os?.searched && !os?.dismantled) return false;
  }
  return true;
}

/**
 * What is left before a floor counts as Cleared.
 * @returns {{zombies:number, unsearched:number, clear:boolean}}
 */
export function floorProgress(tower, state, balance, floor) {
  const zombies = countAlive(state, floor);
  const unsearched = unsearchedCount(tower, state, balance, floor);
  return { zombies, unsearched, clear: zombies === 0 && unsearched === 0 };
}

/**
 * Promote Infested floors that are clear. Starts the wanderer timer of newly Cleared floors.
 * Mutates state.floorStates.
 * @returns {number[]} floors that just became Cleared
 */
export function updateFloorStates(tower, state, balance, atMs) {
  const out = [];
  for (const apt of tower.apartments.values()) {
    if (apt.buildSpots?.countsAsHome && !state.flags?.aptCleared?.[apt.id] && apartmentCleared(tower, state, balance, apt)) {
      (state.flags.aptCleared ||= {})[apt.id] = true;
    }
  }
  for (const n of tower.floors.keys()) {
    if (state.floorStates[n] !== 'Infested') continue;
    if (!floorProgress(tower, state, balance, n).clear) continue;
    state.floorStates[n] = 'Cleared';
    scheduleWander(state, n, atMs, balance);
    out.push(n);
  }
  return out;
}
