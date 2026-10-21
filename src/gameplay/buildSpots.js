/**
 * Home build spots and the "home" extent (GDD 5.3, 5.6). Pure, no Phaser.
 * Stage 2 home rule: the start flat (floor 15, left) is home from the start; the other unit of floor 15
 * counts as home once it is Cleared (latched). Spots are free slots:
 *   - a unit with an authored `buildSpots` block (the start flat) lists them there,
 *   - any other home unit derives them: every floor slot is a floor spot, every wall slot of a room with a
 *     window is a window spot; a spot is usable only once the object standing in the slot is gone.
 * `requiresEmptySlot` spots are hidden while a non-dismantled object or fixture stands at their x on their layer.
 */
import { apartmentCleared } from './floorState.js';

export const spotKey = (floor, spotId) => `${floor}:${spotId}`;
const LAYER = { window: 'wall', floor: 'floor' };

/** Units of the home floor that can hold home build spots / count as home. */
const candidateCache = new WeakMap();
export function homeCandidates(tower) {
  let list = candidateCache.get(tower);
  if (!list) {
    list = [...tower.apartments.values()].filter((a) => a.floor === tower.homeFloor && (a.isHome || a.countsAsHome));
    candidateCache.set(tower, list); // static level data: built once, never per frame
  }
  return list;
}

/** Has this unit been Cleared (latched in state.flags.aptCleared, permanent once true)? */
export function aptIsCleared(state, tower, balance, apt) {
  if (state.flags?.aptCleared?.[apt.id]) return true;
  if (!apartmentCleared(tower, state, balance, apt)) return false;
  if (state.flags) (state.flags.aptCleared ||= {})[apt.id] = true;
  return true;
}

/** Units that count as home now: the start flat, plus countsAsHome ones once Cleared. */
export function homeApartments(tower, state, balance) {
  return homeCandidates(tower).filter((a) => a.isHome || !state || aptIsCleared(state, tower, balance, a));
}

/** Is x on a floor inside a home unit (stockpile access, Store all)? */
export function atHome(tower, state, balance, floor, x) {
  if (floor !== tower.homeFloor) return false;
  const list = homeCandidates(tower); // cached; no allocation (called every frame by the Store all button)
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (x >= a.xMin && x <= a.xMax && (a.isHome || !state || aptIsCleared(state, tower, balance, a))) return true;
  }
  return false;
}

function occupied(state, apt, kind, x) {
  const layer = LAYER[kind];
  for (const o of apt.objects || []) {
    if (o.layer === layer && o.x === x && !state.objects?.[o.id]?.dismantled) return true;
  }
  // fixtures (the workbench) stand on the floor, so they take the floor slot as well as their own
  return (apt.fixtures || []).some((f) => f.x === x && (f.layer === layer || layer === 'floor'));
}

/** Spot definitions of a unit: [{kind, id, x, requiresEmptySlot}]. */
export function unitSpots(apt) {
  const out = [];
  const bs = apt.buildSpots;
  if (bs && (bs.floor || bs.window)) {
    for (const kind of ['window', 'floor']) {
      for (const s of bs[kind] || []) out.push({ kind, id: s.id, x: s.x, requiresEmptySlot: s.requiresEmptySlot !== false });
    }
    return out;
  }
  for (const sl of apt.slots || []) {
    if (sl.layer === 'floor') out.push({ kind: 'floor', id: sl.id, x: sl.x, requiresEmptySlot: true });
    else if (sl.window) out.push({ kind: 'window', id: sl.id, x: sl.x, requiresEmptySlot: true });
  }
  return out;
}

/**
 * Build spots of the home floor.
 * @param {object|null} [state] with a state only spots usable right now are returned; without, every spot
 * @returns {{key:string, kind:'window'|'floor', spot:string, floor:number, x:number, apt:string}[]}
 */
export function homeSpots(tower, balance, state = null) {
  const out = [];
  for (const apt of homeCandidates(tower)) {
    if (state && !apt.isHome && !aptIsCleared(state, tower, balance, apt)) continue;
    for (const s of unitSpots(apt)) {
      if (state && s.requiresEmptySlot && occupied(state, apt, s.kind, s.x)) continue;
      out.push({ key: spotKey(tower.homeFloor, s.id), kind: s.kind, spot: s.id, floor: tower.homeFloor, x: s.x, apt: apt.id });
    }
  }
  return out;
}
