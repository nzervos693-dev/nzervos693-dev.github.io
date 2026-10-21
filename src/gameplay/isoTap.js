/**
 * Tap resolution for the iso world (GDD 4 "Tap resolution", steps 2-7; step 1, the UI, is the scene's
 * job). Pure, no Phaser. Candidates are screen-space rects/anchors in WORLD pixels (the same space as
 * projection.js), so the scene only converts the finger position once.
 */
import { pickByRect, nearestInteractable, screenToTile, pointInTileDiamond, hitRectContains } from '../iso/projection.js';

/**
 * @typedef {{id:string, x:number, y:number, w?:number, h?:number, depth?:number, [k:string]:any}} Candidate
 */

/**
 * Doors and objects under the point (GDD 4 step 4): the padded rects that contain it; of those, the
 * front-most one whose artwork really is under the finger (ctx.pixelHit, if given) wins, so a chair beside
 * a bed, or furniture behind a door, does not steal taps just because its padded rect overlaps. With no solid hit the
 * nearest anchor wins (forgiveness for taps in the padding).
 * @returns {Candidate|null}
 */
export function pickInteractable(cfg, ctx, px, py) {
  const hits = [];
  for (const c of ctx.interactables) if (hitRectContains(cfg, c.x, c.y, c.w ?? 0, c.h ?? 0, px, py)) hits.push(c);
  if (!hits.length) return null;
  if (hits.length === 1) return hits[0];
  if (ctx.pixelHit) {
    // the front-most candidate whose art is under the finger wins (a door beats furniture drawn behind it,
    // furniture drawn in front of a door beats the door)
    let best = null;
    for (const c of hits) if (ctx.pixelHit(c, px, py) && (!best || (c.depth ?? 0) > (best.depth ?? 0))) best = c;
    if (best) return best;
  }
  let near = null;
  let bd = Infinity;
  for (const c of hits) {
    const d = (( c.ax ?? c.x) - px) ** 2 + ((c.ay ?? c.y) - py) ** 2;
    if (d < bd || (d === bd && (c.depth ?? 0) > (near.depth ?? 0))) { near = c; bd = d; }
  }
  return near;
}

/**
 * Resolve one tap.
 * @param {object} cfg isoConfig(balance)
 * @param {{zombies:Candidate[], hero:Candidate|null, interactables:Candidate[], stairTiles?:Array<{x:number,y:number}>,
 *   grid:import('../iso/grid.js').Grid}} ctx
 *   zombies: visible zombies, rect centred on the body; hero: his body rect; interactables: doors, objects,
 *   piles, fixtures that are Visible or Remembered (rect = sprite bounds, anchor x/y = same centre unless ax/ay given)
 * @param {number} px @param {number} py world pixels
 * @returns {{type:'zombie'|'hero'|'interact'|'stairs'|'floor'|'none', target?:Candidate, x?:number, y?:number, snapped?:boolean}}
 */
export function resolveTap(cfg, ctx, px, py) {
  const z = pickByRect(cfg, ctx.zombies, px, py);
  if (z) return { type: 'zombie', target: z };
  if (ctx.hero && pickByRect(cfg, [ctx.hero], px, py)) return { type: 'hero', target: ctx.hero };
  const it = pickInteractable(cfg, ctx, px, py);
  if (it) return { type: 'interact', target: it };
  const tile = screenToTile(cfg, px, py);
  for (const s of ctx.stairTiles ?? []) {
    if (pointInTileDiamond(cfg, s.x, s.y, px, py)) return { type: 'stairs', x: s.x, y: s.y };
  }
  if (ctx.grid.isWalkable(tile.x, tile.y)) return { type: 'floor', x: tile.x, y: tile.y };
  // forgiveness: nearest interactable anchor within 96 px, else a walkable tile within 1.5 tiles
  const anchors = [...ctx.zombies, ...ctx.interactables].map((c) => ({ ...c, x: c.ax ?? c.x, y: c.ay ?? c.y }));
  const near = nearestInteractable(cfg, anchors, px, py);
  if (near) {
    const orig = ctx.zombies.find((c) => c.id === near.id && c.kind === near.kind) ?? ctx.interactables.find((c) => c.id === near.id && c.kind === near.kind);
    return { type: ctx.zombies.includes(orig) ? 'zombie' : 'interact', target: orig ?? near, snapped: true };
  }
  const w = ctx.grid.nearestWalkable(tile.x, tile.y, cfg.tapSnapWalkTiles);
  if (w) return { type: 'floor', x: w.x, y: w.y, snapped: true };
  return { type: 'none' };
}
