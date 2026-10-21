/**
 * Floor states (GDD 5.3): Infested -> Cleared -> Secured. Pure, no Phaser.
 * M2: Cleared = no living zombies on the floor (the M1 "all containers searched" condition is gone, the wings are
 * too big). A floor never goes back from Cleared to Infested here: wandering walkers (see wanderers.js) do not
 * change the state. Secured is set by the Secure floor recipe.
 */
import { countAlive, zombieId } from './zombies.js';
import { scheduleWander } from './wanderers.js';

/** Is one unit Cleared: all of its authored zombies are dead? (Wanderers roam the floor and do not count.) */
export function apartmentCleared(tower, state, balance, apt) {
  const n = (apt.zombies || []).length;
  for (let i = 0; i < n; i++) {
    const z = state.zombies[zombieId(apt, i)];
    if (z && !z.dead) return false;
  }
  return true;
}

/**
 * What is left before a floor counts as Cleared.
 * @returns {{zombies:number, clear:boolean}}
 */
export function floorProgress(tower, state, balance, floor) {
  const zombies = countAlive(state, floor);
  return { zombies, clear: zombies === 0 };
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
