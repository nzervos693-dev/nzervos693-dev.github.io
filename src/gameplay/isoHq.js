/**
 * HQ state of floor 15 (GDD 5.19 "Claiming the HQ", 11.3 C2). Pure, no Phaser.
 *
 * Save shape written here: state.hq = { claimed, claimedAt }, state.edges[floor] = override map
 * (Structures.exportOverrides), state.thoughts.wholeFloor (the "could be mine" thought fired once).
 */
import { TILE } from '../iso/grid.js';
import { createStructures, edgeTiles, normEdge } from './isoStructures.js';

/** Result codes of the claim action. */
export const CLAIM_CODE = Object.freeze({
  OK: 'ok', ALREADY: 'already_claimed', NOT_FLOOR15: 'not_floor15', NOT_CLEARED: 'not_cleared',
});

const CLAIM_MESSAGE = { not_cleared: 'Something is still moving here.', already_claimed: 'Already mine.', not_floor15: 'Not here.' };

/** Thought when floor 15 is first Cleared, and when claimed. */
export const THOUGHT_CLEARED = 'This whole floor could be mine.';
export const THOUGHT_CLAIMED = 'Floor 15. Mine.';

/** Has the HQ been claimed? */
export const isHqClaimed = (state) => !!state.hq?.claimed;

/** Which home attacks target: the HQ once claimed, else the start flat. (Heart = the bed last slept in; Stage C wires beds.) */
export const mainHome = (state) => (isHqClaimed(state) ? 'hq' : 'start_flat');

/** Floor 15 counts as Secured (+5 defense) without the recipe once it is the HQ. */
export const countsAsSecured = (state, balance, floorNumber) =>
  isHqClaimed(state) && floorNumber === balance.hq.floor && !!balance.hq.countsAsSecured;

/** Number of living zombies on a floor (units, corridor, landing; wanderers count). */
export function livingZombies(state, floorNumber) {
  let n = 0;
  for (const id in state.zombies ?? {}) {
    const z = state.zombies[id];
    if (!z.dead && (z.floor === undefined || z.floor === floorNumber)) n++;
  }
  return n;
}

/** Is floor `floorNumber` Cleared right now (no living zombie)? */
export const isFloorCleared = (state, floorNumber) => livingZombies(state, floorNumber) === 0;

/**
 * HQ tile = every floor tile except the stairwell core (landing, flights, shaft).
 * @param {import('./isoStructures.js').Structures} st
 */
export function isHqTile(st, x, y) {
  const g = st.grid;
  if (!g.isFloor(x, y) || g.kindAt(x, y) === TILE.STAIRS) return false;
  const f = st.floor;
  if (f.roomAt && f.rooms) {
    const ri = f.roomAt(x, y);
    if (ri < 0 || f.rooms[ri].type === 'stairwell') return false;
  }
  return true;
}

/** Does the edge touch at least one HQ tile (so it is "inside HQ")? */
export function edgeTouchesHq(st, edge) {
  const e = normEdge(edge.x, edge.y, edge.side);
  return edgeTiles(e).some((t) => isHqTile(st, t.x, t.y));
}

/** All HQ tiles (to mark Remembered on claim). @returns {{x:number,y:number}[]} */
export function hqTiles(st) {
  const out = [];
  for (let y = 0; y < st.grid.height; y++) for (let x = 0; x < st.grid.width; x++) if (isHqTile(st, x, y)) out.push({ x, y });
  return out;
}

/**
 * Fire the "this whole floor could be mine" thought once, the first time floor 15 is Cleared.
 * @returns {string|null} the thought to show, or null
 */
export function clearedThought(state, balance, floorNumber) {
  if (floorNumber !== balance.hq.floor || isHqClaimed(state)) return null;
  state.thoughts = state.thoughts || {};
  if (state.thoughts.wholeFloor || !isFloorCleared(state, floorNumber)) return null;
  state.thoughts.wholeFloor = true;
  return THOUGHT_CLEARED;
}

/**
 * Can the hero claim the floor now (Main "Claim the floor" on the stairwell fire door)?
 * @returns {{ok:boolean, code:string, message:string|null, seconds:number}}
 */
export function canClaimFloor(state, balance, floorNumber) {
  const seconds = balance.hq.claimSeconds;
  const out = (code) => ({ ok: code === 'ok', code, message: CLAIM_MESSAGE[code] ?? null, seconds });
  if (floorNumber !== balance.hq.floor) return out(CLAIM_CODE.NOT_FLOOR15);
  if (isHqClaimed(state)) return out(CLAIM_CODE.ALREADY);
  if (!isFloorCleared(state, floorNumber)) return out(CLAIM_CODE.NOT_CLEARED);
  return out(CLAIM_CODE.OK);
}

/**
 * Claim floor 15: the HQ becomes the main home. Permanent (hq.canUnclaim false).
 * Call at the END of the 5 s timed action. Stash placement for merged units is the caller's job (5.3).
 * @returns {{ok:boolean, code:string, message:string|null, thought:string|null, mainHome:string}}
 */
export function claimFloor(state, balance, floorNumber, nowMs = Date.now()) {
  const c = canClaimFloor(state, balance, floorNumber);
  if (!c.ok) return { ...c, thought: null, mainHome: mainHome(state) };
  state.hq = { claimed: true, claimedAt: nowMs };
  return { ...c, thought: THOUGHT_CLAIMED, mainHome: 'hq' };
}

// ---- save glue (existing path: the state object is what getSave().game holds) -----------------

/** Write the floor's edge overrides into the state (call before every save, next to snapshotDoors). */
export function snapshotStructures(state, floor) {
  if (!floor.structures) return;
  state.edges = state.edges || {};
  state.edges[floor.number] = floor.structures.exportOverrides();
}

/**
 * Read the state's edge overrides onto a freshly loaded floor (call BEFORE applyDoorsToGrid).
 * Creates floor.structures when missing.
 * @param {object} state @param {object} floor from loadIsoFloor @param {object} balance
 * @returns {import('./isoStructures.js').Structures}
 */
export function restoreStructures(state, floor, balance) {
  const st = floor.structures ?? createStructures(floor, balance);
  st.applyOverrides(state.edges?.[floor.number]);
  return st;
}
