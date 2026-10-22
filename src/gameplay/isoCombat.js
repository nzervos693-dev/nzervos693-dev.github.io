/**
 * Iso combat extras (GDD 4, 5.4, 5.11). Pure, no Phaser: shove, the swing-at-air rules and molotov fire.
 */
import { MOVE } from '../iso/grid.js';

/** Defaults when balance.combat.shove lacks a key. */
export const SHOVE_DEFAULTS = Object.freeze({ rangeTiles: 1.5, pushTiles: 0.5, stunSeconds: 0.8, energy: 1, cooldownSeconds: 2.5 });

/** Shove numbers from balance. */
export const shoveConfig = (balance) => ({ ...SHOVE_DEFAULTS, ...(balance.combat?.shove ?? {}) });

/** Is a zombie centre within shove range of the hero (centre to centre)? */
export const inShoveRange = (hero, z, cfg) => Math.hypot(z.x - hero.x, z.y - hero.y) <= cfg.rangeTiles;

/**
 * Push a zombie straight away from the hero by cfg.pushTiles, stopping early at walls, doors, objects, other
 * zombies and the floor edge, then stun it and cancel its bite wind-up (GDD 5.4). No damage. A shoved unaware
 * zombie becomes aware. Mutates z and ai.
 * @param {{x:number,y:number}} hero
 * @param {{x:number,y:number,hp:number}} z record
 * @param {object} ai transient AI
 * @param {{grid:object, occupied:(x:number,y:number)=>boolean}} env
 * @returns {{dx:number, dy:number}} how far it moved (tile units)
 */
export function applyShove(hero, z, ai, cfg, env) {
  const ox = z.x;
  const oy = z.y;
  let ux = z.x - hero.x;
  let uy = z.y - hero.y;
  const len = Math.hypot(ux, uy) || 1;
  ux /= len;
  uy /= len;
  const step = 0.05;
  for (let s = step; s <= cfg.pushTiles + 1e-9; s += step) {
    const nx = ox + ux * s;
    const ny = oy + uy * s;
    const cx = Math.floor(z.x);
    const cy = Math.floor(z.y);
    const tx = Math.floor(nx);
    const ty = Math.floor(ny);
    if (tx !== cx || ty !== cy) {
      const dx = tx - cx;
      const dy = ty - cy;
      if (env.grid.stepClass(cx, cy, dx, dy) !== MOVE.OPEN) break;
      if (env.occupied(tx, ty)) break;
    }
    z.x = nx;
    z.y = ny;
  }
  ai.stun = cfg.stunSeconds;
  ai.windup = 0;
  ai.path = null;
  ai.moving = false;
  if (ai.mode !== 'chase' && ai.mode !== 'attack') ai.mode = 'chase';
  ai.noticed = true;
  ai.facing = (Math.atan2(hero.y - z.y, hero.x - z.x) * 180) / Math.PI;
  ai.last = { x: Math.floor(hero.x), y: Math.floor(hero.y) };
  ai.unseen = 0;
  return { dx: z.x - ox, dy: z.y - oy };
}

/** Tracks the shove cooldown. */
export class ShoveCooldown {
  constructor(cfg) { this.cfg = cfg; this.left = 0; }

  get ready() { return this.left <= 0; }

  start() { this.left = this.cfg.cooldownSeconds; }

  step(dt) { if (this.left > 0) this.left = Math.max(0, this.left - dt); }
}

/**
 * A molotov fire patch: the landing tile and its neighbours within radius (3 x 3 for radius 1) for `seconds`.
 * @param {number} tx @param {number} ty landing tile @param {object} molotov balance.molotov
 */
export function createFirePatch(tx, ty, molotov) {
  const r = molotov.radiusTiles ?? 1;
  const tiles = [];
  for (let y = ty - r; y <= ty + r; y++) for (let x = tx - r; x <= tx + r; x++) tiles.push({ x, y });
  return { x: tx, y: ty, r, tiles, left: molotov.seconds, zdps: molotov.zombieDps, hdps: molotov.heroDps };
}

/** Does the patch burn tile (x, y)? */
export const patchCovers = (p, x, y) => Math.abs(x - p.x) <= p.r && Math.abs(y - p.y) <= p.r;

/** Age a patch. @returns {boolean} still burning */
export function stepPatch(p, dt) { p.left -= dt; return p.left > 0; }
