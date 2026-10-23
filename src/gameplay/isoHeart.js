/**
 * The heart of the HQ (GDD 5.19 "Beds and the heart", 5.20): the bed last slept or napped in inside the claimed HQ is
 * where attackers are headed and where the seal-in check measures from. Before the claim the start flat's bed is the home.
 * Pure, no Phaser. Save: state.heart = { bedId } (written when the hero sleeps or naps in an HQ bed).
 */
import { standCandidates } from './isoHero.js';
import { FACING_STEP } from '../iso/loader.js';
import { isHqClaimed, isHqTile } from './isoHq.js';

/** Is this object a bed or mattress the hero can sleep in (balance objects[].sleepable)? */
export const isBedObject = (o, balance) => !!o && !!balance.objects?.[o.objectId]?.sleepable;

/** Can the hero sleep or nap in this bed now? The start flat's bed always; after the claim any intact bed or mattress in the HQ. */
export function canSleepIn(floor, state, balance, o) {
  if (!isBedObject(o, balance) || state.objects?.[o.id]?.dismantled) return false;
  if (o.id === floor.home?.bed) return true;
  const st = floor.structures;
  return isHqClaimed(state) && !!st && o.tiles.some((t) => isHqTile(st, t.x, t.y));
}

/** The bed object that is the heart: the bed last slept in (in the HQ), else the start flat's bed; null when there is none left. */
export function heartBed(floor, state, balance) {
  const home = floor.objectById.get(floor.home?.bed) ?? null;
  const live = (o) => !!o && !state.objects?.[o.id]?.dismantled;
  if (isHqClaimed(state) && state.heart?.bedId) {
    const o = floor.objectById.get(state.heart.bedId);
    if (live(o) && canSleepIn(floor, state, balance, o)) return o;
  }
  return live(home) ? home : null;
}

/** Remember the bed just slept or napped in as the heart. @returns {boolean} the heart moved to a different bed */
export function setHeart(floor, state, balance, o) {
  if (!canSleepIn(floor, state, balance, o) || !isHqClaimed(state)) return false;
  const changed = heartBed(floor, state, balance)?.id !== o.id;
  state.heart = { bedId: o.id };
  return changed;
}

/**
 * The tile attackers go to for the heart: a free tile beside the bed (the front of the bed first). null when there is no
 * bed (callers use the hero's tile then).
 * @returns {{x:number,y:number}|null}
 */
export function heartStandTile(floor, state, balance) {
  const bed = heartBed(floor, state, balance);
  if (!bed) return null;
  const step = FACING_STEP[bed.facing] ?? [0, 1];
  const cands = standCandidates(floor.grid, bed.tiles, step);
  for (const c of cands) if (floor.grid.isWalkable(c.x, c.y)) return { x: c.x, y: c.y };
  return null;
}

/** Where an attack is headed: the heart's stand tile, or the hero's tile when there is no bed. */
export function attackGoal(floor, state, balance) {
  return heartStandTile(floor, state, balance) ?? { x: Math.floor(state.hero.x), y: Math.floor(state.hero.y) };
}

