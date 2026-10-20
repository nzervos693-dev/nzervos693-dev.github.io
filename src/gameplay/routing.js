/**
 * Hero routing: stairs, jammed doors. Pure, no Phaser.
 */

/** Distance short of a jammed door where the hero stops. */
export const DOOR_STOP_MARGIN = 42;

/**
 * Clamp a horizontal walk so it does not pass a jammed door (walking right only).
 * Only walks that reach the door itself are blocked; targets inside the flat before the door are fine.
 * @param {object} tower from buildTower
 * @param {Object<string,{state:string}>} doors state.doors
 * @returns {{x:number, blockedApt:object|null}}
 */
export function limitWalk(tower, doors, floor, fromX, toX) {
  const f = tower.floors.get(floor);
  if (!f || toX <= fromX) return { x: toX, blockedApt: null };
  const jammed = f.apartments
    .filter((a) => doors[a.id]?.state === 'jammed')
    .sort((a, b) => a.doorX - b.doorX);
  for (const a of jammed) {
    const stop = a.doorX - DOOR_STOP_MARGIN;
    if (fromX <= stop + 0.5 && toX >= a.doorX) return { x: stop, blockedApt: a };
  }
  return { x: toX, blockedApt: null };
}

/** Stop position in front of an apartment's door. */
export const doorStopX = (apt) => apt.doorX - DOOR_STOP_MARGIN;

/**
 * Plan a route as steps. Walk steps are limited by doors when executed.
 * @param {{floor:number,x:number}} from
 * @param {{floor:number,x:number}} to
 * @returns {({type:'walk',floor:number,x:number}|{type:'stairs',from:number,to:number})[]}
 */
export function planRoute(tower, from, to) {
  const steps = [];
  if (from.floor === to.floor) {
    steps.push({ type: 'walk', floor: to.floor, x: to.x });
    return steps;
  }
  const sx = tower.stairwell.entryX;
  steps.push({ type: 'walk', floor: from.floor, x: sx });
  steps.push({ type: 'stairs', from: from.floor, to: to.floor });
  steps.push({ type: 'walk', floor: to.floor, x: to.x });
  return steps;
}

/** Seconds for a stair trip. */
export const stairSeconds = (from, to, balance) =>
  Math.abs(to - from) * balance.hero.stairSecondsPerFloor;

/**
 * Move x toward target by speed*dt. Returns new x (no overshoot).
 */
export function stepToward(x, target, speed, dt) {
  const d = target - x;
  const step = speed * dt;
  return Math.abs(d) <= step ? target : x + Math.sign(d) * step;
}

/**
 * Register a hit on a jammed door (mutates the door state).
 * @param {{state:string, hits:number}} door state.doors[aptId]
 * @returns {{opened:boolean, hits:number, needed:number}}
 */
export function hitJammedDoor(door, balance) {
  const needed = balance.world.jammedDoorHits;
  if (door.state !== 'jammed') return { opened: true, hits: door.hits || 0, needed };
  door.hits = (door.hits || 0) + 1;
  if (door.hits >= needed) {
    door.state = 'open';
    return { opened: true, hits: door.hits, needed };
  }
  return { opened: false, hits: door.hits, needed };
}
