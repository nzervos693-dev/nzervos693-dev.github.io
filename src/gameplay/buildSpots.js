/**
 * Home build spots and the "home" extent (GDD 5.3, 5.6). Pure, no Phaser.
 * Spots come from floors.json `buildSpots` of every apartment on the home floor that is the home
 * apartment or has `buildSpots.countsAsHome`. Per apartment:
 *   availableWhen "apartment_cleared": its zombies are dead and its containers done (latched, permanent)
 *   requiresEmptySlot: a spot is hidden while a non-dismantled object/fixture stands at its x on its layer
 */
import { apartmentCleared } from './floorState.js';

export const spotKey = (floor, spotId) => `${floor}:${spotId}`;
const LAYER = { window: 'wall', floor: 'floor' };

/** Apartments of the home floor that can hold home build spots / count as home. */
export const homeCandidates = (tower) =>
  [...tower.apartments.values()].filter((a) => a.floor === tower.homeFloor && (a.isHome || a.buildSpots?.countsAsHome));

/** Has this apartment been Cleared (latched in state.flags.aptCleared, permanent once true)? */
export function aptIsCleared(state, tower, balance, apt) {
  if (state.flags?.aptCleared?.[apt.id]) return true;
  if (!apartmentCleared(tower, state, balance, apt)) return false;
  if (state.flags) (state.flags.aptCleared ||= {})[apt.id] = true;
  return true;
}

/** Apartments that count as home now: the hero's, plus countsAsHome ones once Cleared. */
export function homeApartments(tower, state, balance) {
  return homeCandidates(tower).filter((a) => a.isHome || !state || aptIsCleared(state, tower, balance, a));
}

/** Is x on a floor inside a home apartment (stockpile access, Store all)? */
export function atHome(tower, state, balance, floor, x) {
  return floor === tower.homeFloor && homeApartments(tower, state, balance).some((a) => x >= a.xMin && x <= a.xMax);
}

function occupied(tower, state, apt, kind, x) {
  const layer = LAYER[kind];
  for (const o of apt.objects || []) {
    if (o.layer === layer && o.x === x && !state.objects?.[o.id]?.dismantled) return true;
  }
  return (apt.fixtures || []).some((f) => f.layer === layer && f.x === x);
}

/**
 * Build spots of the home floor (M1 layout: every spot listed in floors.json; balance.home no longer caps them).
 * @param {object|null} [state] with a state only spots usable right now are returned; without, every spot
 * @returns {{key:string, kind:'window'|'floor', spot:string, floor:number, x:number, apt:string}[]}
 */
export function homeSpots(tower, balance, state = null) {
  const out = [];
  for (const apt of homeCandidates(tower)) {
    const bs = apt.buildSpots;
    if (!bs) continue;
    if (state && bs.availableWhen === 'apartment_cleared' && !aptIsCleared(state, tower, balance, apt)) continue;
    for (const kind of ['window', 'floor']) {
      for (const s of bs[kind] || []) {
        if (state && bs.requiresEmptySlot && occupied(tower, state, apt, kind, s.x)) continue;
        out.push({ key: spotKey(tower.homeFloor, s.id), kind, spot: s.id, floor: tower.homeFloor, x: s.x, apt: apt.id });
      }
    }
  }
  return out;
}
