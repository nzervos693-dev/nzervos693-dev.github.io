/**
 * Target selection (GDD 4, "The target", keys controls.target.*). Pure, no Phaser.
 *
 * The hero has at most one target: the zombie or thing he would act on. Candidates are re-checked every
 * frame against a reach and a cone around his facing; the best one is chosen by 15-degree angle buckets,
 * then distance; the current target is kept with loosened limits (hysteresis) and replaced by a different
 * best candidate only after it stayed best for switchHoldSeconds. Zombies always beat things.
 *
 * Entries (built by the scene, reused between frames):
 *   zombie: { id, kind:'zombie', x, y }                     centre in tile units
 *   thing:  { id, kind:'thing', x0, y0, x1, y1, tiles }     footprint rect in grid units (an edge thing is a
 *           degenerate rect = its wall-edge segment); `tiles` = [{x,y}] footprint tiles (edge things: the two
 *           tiles beside the edge); optional `spot:true` (placement spot: uses placeReachTiles)
 */

/** Used when balance.controls.target lacks a key. */
export const TARGET_DEFAULTS = Object.freeze({
  objectReachTiles: 1.2,
  objectConeDegrees: 120,
  zombieConeDegrees: 180,
  keepReachExtraTiles: 0.3,
  keepConeExtraDegrees: 30,
  angleBucketDegrees: 15,
  switchHoldSeconds: 0.15,
  placeReachTiles: 1.5,
  ghostAlpha: 0.5,
  outline: Object.freeze({ color: '#0b0c0e', alpha: 0.6, widthPx: 3, zombieAlpha: 0.75, zombieWidthPx: 4, fadeSeconds: 0.1 }),
});

/** Target numbers from balance (with defaults). */
export function targetConfig(balance) {
  const t = balance.controls?.target ?? {};
  return { ...TARGET_DEFAULTS, ...t, outline: { ...TARGET_DEFAULTS.outline, ...(t.outline ?? {}) } };
}

const RAD = 180 / Math.PI;

/** Absolute difference between two angles in degrees (0..180). */
export function absAngleDiff(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return Math.abs(d);
}

/** Nearest point of the rect [x0,x1] x [y0,y1] to (px, py) into `out`. */
export function nearestOnRect(e, px, py, out) {
  out.x = px < e.x0 ? e.x0 : px > e.x1 ? e.x1 : px;
  out.y = py < e.y0 ? e.y0 : py > e.y1 ? e.y1 : py;
  return out;
}

const NEAR = { x: 0, y: 0 };

/**
 * Is the entry a candidate now, and how good? Writes { dist, angle } into `out`.
 * @param {{x:number,y:number,facing:number}} hero
 * @param {ReturnType<typeof targetConfig>} cfg
 * @param {{weaponRange:number, visible:(x:number,y:number)=>boolean, los:(ax:number,ay:number,bx:number,by:number)=>boolean}} ctx
 *   visible/los take tile coordinates
 * @param {boolean} loose use the keep limits (reach + keepReachExtraTiles, cone + keepConeExtraDegrees per side)
 * @returns {boolean} valid
 */
export function evaluate(hero, e, cfg, ctx, loose, out) {
  const reachExtra = loose ? cfg.keepReachExtraTiles : 0;
  const coneExtra = loose ? cfg.keepConeExtraDegrees / 2 : 0;
  const htx = Math.floor(hero.x);
  const hty = Math.floor(hero.y);
  if (e.kind === 'zombie') {
    const dx = e.x - hero.x;
    const dy = e.y - hero.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > ctx.weaponRange + reachExtra) return false;
    const angle = dist < 1e-6 ? 0 : absAngleDiff(hero.facing, Math.atan2(dy, dx) * RAD);
    if (angle > cfg.zombieConeDegrees / 2 + coneExtra) return false;
    const tx = Math.floor(e.x);
    const ty = Math.floor(e.y);
    if (!ctx.visible(tx, ty) || !ctx.los(htx, hty, tx, ty)) return false;
    out.dist = dist;
    out.angle = angle;
    return true;
  }
  const near = nearestOnRect(e, hero.x, hero.y, NEAR);
  const dx = near.x - hero.x;
  const dy = near.y - hero.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const reach = e.spot ? cfg.placeReachTiles : cfg.objectReachTiles;
  if (dist > reach + reachExtra) return false;
  const cx = (e.x0 + e.x1) / 2 - hero.x;
  const cy = (e.y0 + e.y1) / 2 - hero.y;
  const angle = Math.hypot(cx, cy) < 1e-6 ? 0 : absAngleDiff(hero.facing, Math.atan2(cy, cx) * RAD);
  if (angle > cfg.objectConeDegrees / 2 + coneExtra) return false;
  // at least one footprint tile Visible
  let seen = false;
  for (let i = 0; i < e.tiles.length; i++) if (ctx.visible(e.tiles[i].x, e.tiles[i].y)) { seen = true; break; }
  if (!seen) return false;
  // nothing but the thing itself between the hero and the nearest point: sight from the hero's tile to the
  // footprint tile nearest to that point (no check when he stands on a footprint tile: a door's own edge is
  // the thing itself)
  let tx = e.tiles[0].x;
  let ty = e.tiles[0].y;
  let best = Infinity;
  for (let i = 0; i < e.tiles.length; i++) {
    const t = e.tiles[i];
    if (t.x === htx && t.y === hty) { best = -1; tx = htx; ty = hty; break; }
    const d = (t.x + 0.5 - near.x) ** 2 + (t.y + 0.5 - near.y) ** 2;
    if (d < best) { best = d; tx = t.x; ty = t.y; }
  }
  if ((tx !== htx || ty !== hty) && !ctx.los(htx, hty, tx, ty)) return false;
  out.dist = dist;
  out.angle = angle;
  return true;
}

const SCORE = { dist: 0, angle: 0 };

/** Ordering key: bucket, then distance. */
const better = (bucketA, distA, bucketB, distB) => bucketA < bucketB || (bucketA === bucketB && distA < distB);

/**
 * Holds the current target and applies the hysteresis rules.
 */
export class TargetTracker {
  /** @param {ReturnType<typeof targetConfig>} cfg */
  constructor(cfg) {
    this.cfg = cfg;
    /** @type {object|null} the current target entry */
    this.current = null;
    this.pending = null; // entry that has been best since pendingT
    this.pendingT = 0;
  }

  /** Forget the target (panel opened, sleeping, floor change). */
  reset() { this.current = null; this.pending = null; this.pendingT = 0; }

  /**
   * One frame.
   * @param {number} dt seconds
   * @param {{x:number,y:number,facing:number}} hero
   * @param {object[]} entries every possible target (zombies and things)
   * @param {object} ctx see evaluate()
   * @param {{held:boolean, locked:boolean}} flags held = the stick is held (a standing hero keeps his target
   *   unless a zombie appears or the target becomes invalid); locked = a timed action runs (target frozen)
   * @returns {object|null} the target entry
   */
  update(dt, hero, entries, ctx, flags) {
    const cfg = this.cfg;
    const cur = this.current;
    if (flags.locked && cur) return cur;
    // best candidate: zombies compete first, things only when no zombie is a candidate
    let best = null;
    let bBucket = 0;
    let bDist = 0;
    let anyZombie = false;
    for (let pass = 0; pass < 2 && !best; pass++) {
      const wantZombie = pass === 0;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if ((e.kind === 'zombie') !== wantZombie) continue;
        if (!evaluate(hero, e, cfg, ctx, false, SCORE)) continue;
        const bucket = Math.floor(SCORE.angle / cfg.angleBucketDegrees);
        if (!best || better(bucket, SCORE.dist, bBucket, bDist)) { best = e; bBucket = bucket; bDist = SCORE.dist; }
      }
      anyZombie = wantZombie && !!best;
    }
    let keepOk = false;
    if (cur) keepOk = entries.includes(cur) && evaluate(hero, cur, cfg, ctx, true, SCORE);
    if (!cur || !keepOk) return this.take(best);
    if (anyZombie && cur.kind !== 'zombie') return this.take(best);
    if (best === cur || !best || !flags.held) { this.pending = null; this.pendingT = 0; return cur; }
    if (this.pending !== best) { this.pending = best; this.pendingT = 0; }
    this.pendingT += dt;
    if (this.pendingT >= cfg.switchHoldSeconds) return this.take(best);
    return cur;
  }

  take(e) {
    this.current = e;
    this.pending = null;
    this.pendingT = 0;
    return e;
  }
}

/**
 * Best zombie candidate by the same rules (used by Attack while an action locks the target).
 * @returns {object|null}
 */
export function bestZombie(hero, entries, cfg, ctx) {
  let best = null;
  let bBucket = 0;
  let bDist = 0;
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.kind !== 'zombie' || !evaluate(hero, e, cfg, ctx, false, SCORE)) continue;
    const bucket = Math.floor(SCORE.angle / cfg.angleBucketDegrees);
    if (!best || better(bucket, SCORE.dist, bBucket, bDist)) { best = e; bBucket = bucket; bDist = SCORE.dist; }
  }
  return best;
}

/**
 * Wall-edge segment of a mounted object (it hangs on the edge opposite its facing; its tile stays free).
 * Returns the degenerate rect of the segment in grid units.
 * @param {number[]} tile [x, y] @param {number} facingAngle grid angle of the way it faces (0 E, 90 S, 180 W, 270 N)
 */
export function mountedEdgeRect(tile, facingAngle) {
  const [x, y] = tile;
  const f = ((Math.round(facingAngle / 90) % 4) + 4) % 4; // 0 E, 1 S, 2 W, 3 N
  if (f === 1) return { x0: x, y0: y, x1: x + 1, y1: y }; // faces S: wall on its N edge
  if (f === 3) return { x0: x, y0: y + 1, x1: x + 1, y1: y + 1 };
  if (f === 0) return { x0: x, y0: y, x1: x, y1: y + 1 }; // faces E: wall on its W edge
  return { x0: x + 1, y0: y, x1: x + 1, y1: y + 1 };
}

/** Segment rect of a door's edge (door.x/y/side as in the Grid: side 'N' or 'W'). */
export function doorEdgeRect(door) {
  return door.side === 'N'
    ? { x0: door.x, y0: door.y, x1: door.x + 1, y1: door.y }
    : { x0: door.x, y0: door.y, x1: door.x, y1: door.y + 1 };
}
