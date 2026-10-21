/*
 * vision.js - the hero's field of view, shadows and tile memory (GDD 5.17).
 * Pure, no Phaser.
 *
 * Method: for every tile inside the hero's bounding square (radius = view
 * cap) a cheap distance/angle test runs first; only candidates run the exact
 * integer line-of-sight walk (Grid.hasLOS: centre to centre, walls, windows,
 * closed and jammed doors block, corners block per GDD). That is the GDD's
 * definition verbatim, and costs at most ~19x19 short walks per recompute,
 * far below a millisecond or two on a phone (budget: 10 Hz).
 *
 * Facing is a GRID angle in degrees (see projection.js).
 * Tile vision states: VIS.NONE (not visible), VIS.FULL, VIS.EDGE (visible but
 * drawn with the soft "edge" overlay). "Remembered" = seen before, not visible
 * now; "unknown" = never seen.
 */
import { angleDiff } from './projection.js';

const DEFAULT_LIGHT = () => LIGHT.LIT;
const NOISE_RANK = { quiet: 0, noisy: 1, loud: 2 };

export const VIS = Object.freeze({ NONE: 0, FULL: 1, EDGE: 2 });
export const LIGHT = Object.freeze({ LIT: 'lit', GREY: 'grey', DIM: 'dim', DARK: 'dark' });

/**
 * Pull the vision numbers out of balance.
 * @param {object} balance full balance object
 */
export function visionConfig(balance) {
  const v = balance.vision;
  return {
    cone: v.coneDegrees,
    minCone: v.minConeDegrees,
    range: v.rangeTiles,
    closeRadius: v.closeRadiusTiles,
    maxRange: v.maxRangeTiles,
    tiredPenalty: v.tiredRangePenaltyTiles,
    edgeTiles: v.edgeFadeTiles,
    edgeDegrees: v.edgeFadeDegrees,
    recomputeTurn: v.recomputeTurnDegrees,
    recomputeMinMs: 1000 / v.recomputeMaxHz,
    panicConePenalty: balance.moodles.panic.coneDegreesPenalty,
    soundRipple: v.soundRipple ?? {},
  };
}

/**
 * Cone angle (degrees) for the hero's own light and Panic level, floored at minCone.
 * @param {ReturnType<typeof visionConfig>} cfg
 * @param {string} heroLight 'lit'|'grey'|'dim'|'dark'
 * @param {number} [panicLevel=0] 0..3
 */
export function coneAngle(cfg, heroLight, panicLevel = 0) {
  const pen = cfg.panicConePenalty[Math.min(panicLevel, cfg.panicConePenalty.length - 1)] ?? 0;
  return Math.max(cfg.minCone, cfg.cone[heroLight] - pen);
}

/**
 * View range (tiles) for a target tile's light, minus Tired L3+, capped.
 * @param {ReturnType<typeof visionConfig>} cfg
 * @param {string} targetLight @param {number} [tiredLevel=0]
 */
export function viewRange(cfg, targetLight, tiredLevel = 0) {
  const r = cfg.range[targetLight] - (tiredLevel >= 3 ? cfg.tiredPenalty : 0);
  return Math.min(cfg.maxRange, r);
}

const RAD = 180 / Math.PI;

/** Per-floor vision result and memory. */
export class VisionMap {
  /** @param {number} width @param {number} height */
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.visible = new Uint8Array(width * height);
    this.seen = new Uint8Array(width * height);
    this.lastX = -1;
    this.lastY = -1;
    this.lastFacing = 0;
    this.lastVersion = -1;
    this.lastAt = -Infinity;
    this.lastLightVersion = 0;
    this.lastPanic = 0;
    this.lastTired = 0;
    /** Bumped on every recompute (renderers compare to know when to redraw). */
    this.revision = 0;
  }

  /** VIS.* for tile (x,y); NONE outside the map. */
  visAt(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height ? this.visible[y * this.width + x] : 0;
  }

  /** @returns {'visible'|'remembered'|'unknown'} (visible includes edge tiles) */
  stateOf(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 'unknown';
    const i = y * this.width + x;
    return this.visible[i] ? 'visible' : this.seen[i] ? 'remembered' : 'unknown';
  }

  /** Visible right now? Entities (zombies, decals, fire) are drawn only if so. Floors tile coordinates. */
  isVisible(x, y) {
    return this.visAt(Math.floor(x), Math.floor(y)) !== VIS.NONE;
  }

  /** Visible or remembered (taps on objects/doors allowed). */
  isKnown(x, y) {
    return this.stateOf(x, y) !== 'unknown';
  }

  /** Mark a rectangle of tiles as remembered (start flat at New game, claiming a unit). */
  markSeenRect(x, y, w, h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i >= 0 && j >= 0 && i < this.width && j < this.height) this.seen[j * this.width + i] = 1;
    }
  }

  /**
   * Recompute the visible set now (and add it to memory).
   * @param {import('./grid.js').Grid} grid
   * @param {ReturnType<typeof visionConfig>} cfg
   * @param {{x:number,y:number,facing:number,lightAt?:(x:number,y:number)=>string,
   *   lightVersion?:number,panicLevel?:number,tiredLevel?:number}} view hero tile (floored here;
   *   an out-of-bounds hero tile is ignored), grid-angle facing, light lookup
   * @returns {VisionMap} this
   */
  update(grid, cfg, view) {
    const W = this.width;
    const lightAt = view.lightAt ?? DEFAULT_LIGHT;
    const hx = Math.floor(view.x);
    const hy = Math.floor(view.y);
    if (hx < 0 || hy < 0 || hx >= W || hy >= this.height) return this;
    this.visible.fill(0);
    const heroLight = lightAt(hx, hy);
    const cone = coneAngle(cfg, heroLight, view.panicLevel ?? 0);
    const half = cone / 2;
    const R = Math.ceil(cfg.maxRange);
    const closeSq = cfg.closeRadius * cfg.closeRadius;
    const facing = view.facing;
    const x0 = Math.max(0, hx - R);
    const x1 = Math.min(W - 1, hx + R);
    const y0 = Math.max(0, hy - R);
    const y1 = Math.min(this.height - 1, hy + R);
    this.visible[hy * W + hx] = VIS.FULL;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (x === hx && y === hy) continue;
        if (!grid.isFloor(x, y)) continue;
        const dx = x - hx;
        const dy = y - hy;
        const d2 = dx * dx + dy * dy;
        if (d2 > cfg.maxRange * cfg.maxRange) continue;
        let flag = 0;
        if (d2 <= closeSq) {
          flag = VIS.FULL;
        } else {
          const diff = Math.abs(angleDiff(facing, Math.atan2(dy, dx) * RAD));
          if (diff > half) continue;
          const dist = Math.sqrt(d2);
          const range = viewRange(cfg, lightAt(x, y), view.tiredLevel ?? 0);
          if (dist > range) continue;
          flag = dist > range - cfg.edgeTiles || diff > half - cfg.edgeDegrees ? VIS.EDGE : VIS.FULL;
        }
        if (!grid.hasLOS(hx, hy, x, y)) continue;
        this.visible[y * W + x] = flag;
      }
    }
    for (let i = 0; i < this.visible.length; i++) if (this.visible[i]) this.seen[i] = 1;
    this.lastX = hx;
    this.lastY = hy;
    this.lastFacing = facing;
    this.lastVersion = grid.version;
    this.lastLightVersion = view.lightVersion ?? 0;
    this.lastPanic = view.panicLevel ?? 0;
    this.lastTired = view.tiredLevel ?? 0;
    this.revision++;
    return this;
  }

  /**
   * Throttled recompute following GDD 5.17: recompute when the hero changes
   * tile, his facing changed >= recomputeTurnDegrees, the grid changed
   * (door/barricade state), or view.lightVersion / panicLevel / tiredLevel
   * changed, but at most recomputeMaxHz times per second. Call every frame.
   * @param {number} nowMs monotonic ms  @param {boolean} [force]
   * @returns {boolean} true if a recompute ran
   */
  maybeUpdate(grid, cfg, view, nowMs, force = false) {
    const moved = Math.floor(view.x) !== this.lastX || Math.floor(view.y) !== this.lastY;
    const stateChanged = (view.lightVersion ?? 0) !== this.lastLightVersion ||
      (view.panicLevel ?? 0) !== this.lastPanic || (view.tiredLevel ?? 0) !== this.lastTired;
    const turned = Math.abs(angleDiff(this.lastFacing, view.facing)) >= cfg.recomputeTurn;
    const changed = grid.version !== this.lastVersion;
    if (!force && !(moved || turned || changed || stateChanged)) return false;
    if (!force && nowMs - this.lastAt < cfg.recomputeMinMs) return false;
    this.lastAt = nowMs;
    this.update(grid, cfg, view);
    return true;
  }

  // ---- save format -------------------------------------------------------

  /** Seen-tiles bitset as 'WxH:base64' (saved per floor). */
  serialize() {
    const bytes = new Uint8Array(Math.ceil(this.seen.length / 8));
    for (let i = 0; i < this.seen.length; i++) if (this.seen[i]) bytes[i >> 3] |= 1 << (i & 7);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return `${this.width}x${this.height}:${btoa(s)}`;
  }

  /** Load memory saved by serialize(). Bad input or a size mismatch leaves memory empty. */
  deserialize(b64) {
    this.seen.fill(0);
    if (!b64) return;
    const cut = b64.indexOf(':');
    if (cut < 0 || b64.slice(0, cut) !== `${this.width}x${this.height}`) return;
    let s;
    try { s = atob(b64.slice(cut + 1)); } catch { return; }
    for (let i = 0; i < this.seen.length && (i >> 3) < s.length; i++) {
      if (s.charCodeAt(i >> 3) & (1 << (i & 7))) this.seen[i] = 1;
    }
  }
}

/**
 * Sound ripple (GDD 5.17, always on, no setting): where and how strongly to
 * draw the faint arc for a loud unseen sound. Returns null unless the noise is
 * at least vision.soundRipple.minNoise, the source is within `hearRange`, is
 * not Visible, and is not on the hero's tile. The hero's own sounds must not
 * be passed in. Cooldown/maxActive limits are the caller's job.
 * @param {ReturnType<typeof visionConfig>} cfg
 * @param {{x:number,y:number,facing:number,coneAngle:number,range?:number}} hero tile, grid facing,
 *   current cone angle (coneAngle()) and view range for the hero's light (viewRange(); default maxRange)
 * @param {{x:number,y:number}} source tile of the noise
 * @param {{hearRange:number, noise:'quiet'|'noisy'|'loud', visionMap?:VisionMap, sourceVisible?:boolean}} o
 *   hearRange: 15 for door bangs, 12 otherwise (audio.*)
 * @returns {{angle:number, relative:number, distance:number, behind:boolean, radiusTiles:number,
 *   alpha:number, arcDegrees:number, noise:string}|null}
 *   angle = grid angle hero -> source; relative = angle - facing (-180..180);
 *   behind = outside the cone (|relative| > coneAngle/2): arc sits on the close
 *   circle (radiusTiles = closeRadius), else at the cone's range edge.
 */
export function soundRipple(cfg, hero, source, o) {
  const sr = cfg.soundRipple;
  const minRank = NOISE_RANK[sr.minNoise ?? 'noisy'];
  if ((NOISE_RANK[o.noise] ?? 0) < minRank) return null;
  const dx = source.x - hero.x;
  const dy = source.y - hero.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0 || distance > o.hearRange) return null;
  const visible = o.visionMap ? o.visionMap.isVisible(source.x, source.y) : !!o.sourceVisible;
  if (visible) return null;
  const angle = ((Math.atan2(dy, dx) * RAD) + 360) % 360;
  const relative = angleDiff(hero.facing, angle);
  const behind = Math.abs(relative) > hero.coneAngle / 2;
  const base = sr.alpha?.[o.noise] ?? 0.25;
  return {
    angle, relative, distance, behind, noise: o.noise,
    radiusTiles: behind ? cfg.closeRadius : (hero.range ?? cfg.maxRange),
    alpha: distance > (sr.farTiles ?? Infinity) ? base * (sr.farAlphaMult ?? 1) : base,
    arcDegrees: sr.arcDegrees ?? 40,
  };
}
