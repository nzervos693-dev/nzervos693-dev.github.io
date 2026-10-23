/**
 * Rules of an online attack on floor 15 that do not need Phaser (GDD 5.8, 5.20). The schedule, strength and cue
 * live in attacks.js and cue.js; the path and slot rules in isoSiege.js. Here: where attackers arrive, when one counts
 * as inside, and how the heart room eats the stash.
 */
import { siegeWalkable } from './isoSiege.js';
import { isHqClaimed, isHqTile } from './isoHq.js';
import { arrivalTile } from './isoOffline.js';

/**
 * The tile the next attacker arrives on (GDD 5.8): the landing end of the down flight, or the nearest free tile of the
 * stairwell when that one is taken. null when the stairwell is full (the attacker waits).
 * @param {object} floor from loadIsoFloor @param {(x:number,y:number)=>boolean} occupied
 * @returns {{x:number,y:number}|null}
 */
export function nextArrivalTile(floor, occupied) {
  const g = floor.grid;
  const start = arrivalTile(floor);
  const ends = (floor.stairwell?.downFlight?.landingEnd ?? [[start.x, start.y]]).map((t) => ({ x: t[0], y: t[1] }));
  for (const t of ends) if (!occupied(t.x, t.y)) return t;
  const isStair = (x, y) => { const r = floor.roomAt(x, y); return r >= 0 && floor.rooms[r].type === 'stairwell' && siegeWalkable(g, x, y); };
  const seen = new Set(ends.map((t) => t.y * g.width + t.x));
  const queue = [...ends];
  while (queue.length) {
    const c = queue.shift();
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) {
      const x = c.x + dx;
      const y = c.y + dy;
      const k = y * g.width + x;
      if (seen.has(k) || !isStair(x, y)) continue;
      seen.add(k);
      if (!occupied(x, y)) return { x, y };
      queue.push({ x, y });
    }
  }
  return null;
}

/** Is this tile inside the home that is attacked: the claimed HQ, or the start flat before the claim? */
export function isInsideHome(floor, state, x, y) {
  if (isHqClaimed(state)) return !!floor.structures && isHqTile(floor.structures, x, y);
  const r = floor.home.unitRect;
  return x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];
}

/**
 * The heart room eats the stash (GDD 5.20): each attacker standing in the heart room takes one random stack from the stash
 * nearest the heart every `secondsPerStack`, at most `maxStacks` per attack.
 */
export class HeartLoot {
  /** @param {{heartLootSecondsPerStack:number, heartMaxStacksLost:number}} cfg hq.attacks */
  constructor(cfg) {
    this.cfg = cfg;
    this.acc = 0;
    this.lost = 0;
  }

  reset() { this.acc = 0; this.lost = 0; }

  /** @param {number} dt seconds @param {number} inRoom attackers in the heart room @returns {number} stacks to lose now */
  step(dt, inRoom) {
    if (inRoom <= 0 || this.lost >= this.cfg.heartMaxStacksLost) return 0;
    this.acc += dt * inRoom;
    let n = 0;
    while (this.acc >= this.cfg.heartLootSecondsPerStack && this.lost + n < this.cfg.heartMaxStacksLost) { this.acc -= this.cfg.heartLootSecondsPerStack; n++; }
    this.lost += n;
    return n;
  }
}
