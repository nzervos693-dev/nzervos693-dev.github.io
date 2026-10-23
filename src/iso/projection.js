/*
 * projection.js - isometric tile <-> screen math (pure, no Phaser).
 *
 * CONVENTIONS (resolves a GDD ambiguity, see section 2):
 *  - World coordinates are continuous, in TILE units. Tile (i, j) covers the
 *    square [i, i+1) x [j, j+1). Its centre is world (i + 0.5, j + 0.5).
 *  - screen sx = (wx - wy) * halfW, sy = (wx + wy) * halfH  (halfW=48, halfH=24).
 *    So the centre of tile (i, j) is at sx = (i - j) * 48, sy = (i + j + 1) * 24,
 *    and the tile's top corner is tileOrigin = (i - j) * 48, (i + j) * 24.
 *    screenToTile floors the inverse, so round trips are exact.
 *  - +x runs to the lower right of the screen, +y to the lower left.
 *  - FACING ANGLES are in GRID space, degrees, 0 = +x, 90 = +y (clockwise on
 *    screen). Screen compass names are mapped to them in FACINGS: screen
 *    "up" (N) is grid (-1,-1) = 225 deg, E is 315, S is 45, W is 135.
 *    The eight sprite directions therefore alternate between grid axes
 *    (NE/SE/SW/NW) and grid diagonals (N/E/S/W).
 */

/** Draw layers inside one tile, GDD section 2 order; CHARACTER sorts after OBJECT so characters win ties against footprint objects. */
export const LAYER = Object.freeze({ FLOOR: 0, DECAL: 1, WALL_NW: 2, OBJECT: 3, CHARACTER: 4, WALL_SE: 5 });

/** Screen compass name -> grid angle in degrees. */
export const FACINGS = Object.freeze({ N: 225, NE: 270, E: 315, SE: 0, S: 45, SW: 90, W: 135, NW: 180 });
const FACING_NAMES = Object.keys(FACINGS);

/**
 * Extract the projection config from balance.json.
 * @param {object} balance full balance object
 * @returns {{tileW:number,tileH:number,halfW:number,halfH:number,bodyRaise:number,
 *   tapSnapRadius:number,tapSnapWalkTiles:number,minHit:number}}
 */
export function isoConfig(balance) {
  const iso = balance.iso;
  const c = balance.controls;
  return {
    tileW: iso.tileWidthPx,
    tileH: iso.tileHeightPx,
    halfW: iso.tileWidthPx / 2,
    halfH: iso.tileHeightPx / 2,
    bodyRaise: iso.bodyRaisePx,
    tapSnapRadius: c.tapSnapRadiusPx,
    tapSnapWalkTiles: c.tapSnapWalkTiles,
    minHit: c.minHitAreaPx,
  };
}

/** World (tile units, continuous) to screen/world-pixel position. @returns {{x:number,y:number}} */
export function worldToScreen(cfg, wx, wy, out = { x: 0, y: 0 }) {
  out.x = (wx - wy) * cfg.halfW;
  out.y = (wx + wy) * cfg.halfH;
  return out;
}

/** Screen position of the CENTRE of tile (tx, ty). */
export function tileCenterToScreen(cfg, tx, ty, out = { x: 0, y: 0 }) {
  return worldToScreen(cfg, tx + 0.5, ty + 0.5, out);
}

/** Screen position of the sprite body point (tile centre raised by bodyRaise). */
export function bodyAnchor(cfg, tx, ty, out = { x: 0, y: 0 }) {
  tileCenterToScreen(cfg, tx, ty, out);
  out.y -= cfg.bodyRaise;
  return out;
}

/** Screen position to continuous world (tile units). */
export function screenToWorld(cfg, sx, sy, out = { x: 0, y: 0 }) {
  const a = sx / cfg.halfW;
  const b = sy / cfg.halfH;
  out.x = (a + b) / 2;
  out.y = (b - a) / 2;
  return out;
}

/** Screen position to the tile underneath (floored; may be outside any grid). */
export function screenToTile(cfg, sx, sy, out = { x: 0, y: 0 }) {
  screenToWorld(cfg, sx, sy, out);
  out.x = Math.floor(out.x);
  out.y = Math.floor(out.y);
  return out;
}

/**
 * Sort key for draw order: larger = drawn later (in front). Per GDD section 2:
 * by (x + y), then layer, then height (elevation tie-break, clamped to 0..999).
 * Use as sprite depth directly (a safe integer).
 * @param {number} tx tile x  @param {number} ty tile y
 * @param {number} layer one of LAYER  @param {number} [height] px tie-break
 */
export function depthKey(tx, ty, layer, height = 0) {
  const h = height < 0 ? 0 : height > 999 ? 999 : Math.round(height);
  return (tx + ty) * 10000 + layer * 1000 + h;
}

/**
 * Depth of a wall on a tile edge. N and W edges are the tile's far (NW) walls,
 * S and E edges its camera-facing (SE) walls.
 * @param {number} tx @param {number} ty @param {'N'|'W'|'S'|'E'} side
 */
export function wallDepthKey(tx, ty, side, height = 0) {
  return depthKey(tx, ty, side === 'N' || side === 'W' ? LAYER.WALL_NW : LAYER.WALL_SE, height);
}

/** Depth of a multi-tile footprint: sorts by its front-most tile (x+w-1, y+h-1). */
export function footprintDepthKey(tx, ty, w, h, layer, height = 0) {
  return depthKey(tx + w - 1, ty + h - 1, layer, height);
}

/** Normalise an angle to [0, 360). */
export function normalizeAngle(a) {
  return ((a % 360) + 360) % 360;
}

/** Signed shortest difference b - a in (-180, 180]. */
export function angleDiff(a, b) {
  let d = normalizeAngle(b - a);
  if (d > 180) d -= 360;
  return d;
}

/** Nearest screen-compass facing name for a grid angle. */
export function angleToFacing(angleDeg) {
  let best = 'N';
  let bd = 999;
  for (const n of FACING_NAMES) {
    const d = Math.abs(angleDiff(FACINGS[n], angleDeg));
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/**
 * 8-way SPRITE facing (compass name) chosen by the SCREEN-space direction in
 * 45-degree sectors (so a sprite pointing "up" really points up the screen).
 * Keep the grid angle itself for the vision cone.
 */
export function angleToSpriteFacing(cfg, angleDeg) {
  const v = angleToScreenVec(cfg, angleDeg, SCRATCH);
  const fromUp = (Math.atan2(v.x, -v.y) * 180) / Math.PI; // clockwise from screen up
  return COMPASS[(Math.round(fromUp / 45) + 8) % 8];
}
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const SCRATCH = { x: 0, y: 0 };

/** Grid angle for a facing name (or number passes through). */
export function facingToAngle(f) {
  return typeof f === 'number' ? f : FACINGS[f];
}

/** Unit vector in grid space for a grid angle. */
export function angleToGridVec(angleDeg, out = { x: 0, y: 0 }) {
  const r = (angleDeg * Math.PI) / 180;
  out.x = Math.cos(r);
  out.y = Math.sin(r);
  return out;
}

/** Unit vector on screen (sx, sy) for a grid facing angle (used by camera look-ahead). */
export function angleToScreenVec(cfg, angleDeg, out = { x: 0, y: 0 }) {
  const r = (angleDeg * Math.PI) / 180;
  const gx = Math.cos(r);
  const gy = Math.sin(r);
  const sx = (gx - gy) * cfg.halfW;
  const sy = (gx + gy) * cfg.halfH;
  const len = Math.hypot(sx, sy) || 1;
  out.x = sx / len;
  out.y = sy / len;
  return out;
}

/** Grid angle whose projection points along a screen delta (hold-to-look, finger direction). */
export function screenDeltaToAngle(cfg, dsx, dsy) {
  const gx = (dsx / cfg.halfW + dsy / cfg.halfH) / 2;
  const gy = (dsy / cfg.halfH - dsx / cfg.halfW) / 2;
  return normalizeAngle((Math.atan2(gy, gx) * 180) / Math.PI);
}

/** Does a rect centred at (cx, cy) of size w x h contain the point? Size is raised to cfg.minHit. */
export function hitRectContains(cfg, cx, cy, w, h, px, py) {
  const hw = Math.max(w, cfg.minHit) / 2;
  const hh = Math.max(h, cfg.minHit) / 2;
  return Math.abs(px - cx) <= hw && Math.abs(py - cy) <= hh;
}

/**
 * Rect picking (GDD section 4 steps 2-4): of candidates {id, x, y, w, h, depth}
 * (centre in screen px, w/h sprite bounds, padded to minHit) whose rect holds
 * the point, return the front-most (highest depth). Null if none.
 * @returns {object|null} the winning candidate
 */
export function pickByRect(cfg, candidates, px, py) {
  let best = null;
  for (const c of candidates) {
    if (!hitRectContains(cfg, c.x, c.y, c.w ?? 0, c.h ?? 0, px, py)) continue;
    if (!best || (c.depth ?? 0) > (best.depth ?? 0)) best = c;
  }
  return best;
}

/**
 * Tap forgiveness (GDD section 4 step 7): the interactable whose anchor
 * {id, x, y} (screen px) is nearest the tap within `radius`
 * (default controls.tapSnapRadiusPx = 96). Ties go to the higher depth.
 * @returns {object|null}
 */
export function nearestInteractable(cfg, candidates, px, py, radius = cfg.tapSnapRadius) {
  let best = null;
  let bd = Infinity;
  const r2 = radius * radius;
  for (const c of candidates) {
    const d = (c.x - px) ** 2 + (c.y - py) ** 2;
    if (d > r2) continue;
    if (d < bd || (d === bd && (c.depth ?? 0) > (best.depth ?? 0))) {
      best = c;
      bd = d;
    }
  }
  return best;
}

/**
 * Does the screen point fall in the diamond of tile (tx, ty)? (stair flight test)
 */
export function pointInTileDiamond(cfg, tx, ty, px, py) {
  const cx = (tx - ty) * cfg.halfW;
  const cy = (tx + ty + 1) * cfg.halfH;
  return Math.abs(px - cx) / cfg.halfW + Math.abs(py - cy) / cfg.halfH <= 1;
}
