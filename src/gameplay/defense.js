/**
 * Home defense D (GDD 5.8), used by offline attack resolution (piece 3b). Pure, no Phaser.
 * D = barricade defense + guards x guardDefense + Secured floors x securedFloorDefense + characterDefense.
 * Traps and the dog arrive in later milestones.
 */
import { barricadeDefense } from './barricade.js';

/** Floors whose state is Secured. */
export const securedFloors = (state) => Object.keys(state.floorStates || {}).filter((n) => state.floorStates[n] === 'Secured').map(Number);

/** Recruited, living survivors with the Guard job. */
export function guardCount(state) {
  return Object.entries(state.survivors || {}).filter(([id, s]) => s && s.recruited && !s.dead && s.job === 'guard' && id !== (state.activeId || 'hero')).length;
}

/**
 * Total defense with its parts.
 * @param {object} state game state
 * @param {object} balance
 * @returns {{total:number, barricade:number, secured:number, guards:number, character:number}}
 */
export function getDefense(state, balance) {
  const barricade = barricadeDefense(state, balance);
  const secured = securedFloors(state).length * balance.attacks.securedFloorDefense;
  const guards = guardCount(state) * balance.survivors.guardDefense;
  const character = balance.attacks.characterDefense;
  return { total: barricade + secured + guards + character, barricade, secured, guards, character };
}
