/**
 * Quick-use slot rules (GDD 4, keys quickUse.*). Pure, no Phaser.
 *
 * The slot holds one item TYPE (state.quickUse = { id, chosen }), used from carried items only. Eligible:
 * balance.quickUse.eligibleTypes (consumables, water, throwables). The first time the hero carries an
 * eligible item the slot takes the first type from quickUse.defaultOrder he carries; a type the player
 * chose is never changed automatically.
 */
import { countItem, removeItem } from './inventory.js';
import { applyItem } from './needs.js';
import { heroCtx } from './gameState.js';

/** Defaults when balance.quickUse lacks a key. */
export const QUICK_DEFAULTS = Object.freeze({
  longPressSeconds: 0.5, cooldownSeconds: 1, eligibleTypes: ['consumable', 'water', 'throwable'],
  defaultOrder: ['water_bottle', 'clean_water', 'canned_food', 'dry_snack', 'chocolate', 'bandage'],
  throwArmSeconds: 3, throwAimConeDegrees: 60, throwDefaultTiles: 4,
});

/** Quick-use numbers from balance. */
export const quickConfig = (balance) => ({ ...QUICK_DEFAULTS, ...(balance.quickUse ?? {}) });

/** Make sure state.quickUse exists. @returns {{id:string|null, chosen:boolean}} */
export function quickState(state) {
  if (!state.quickUse || typeof state.quickUse !== 'object') state.quickUse = { id: null, chosen: false };
  return state.quickUse;
}

/** Can this item type be kept at hand? */
export const isEligible = (id, balance) => !!balance.items[id] && quickConfig(balance).eligibleTypes.includes(balance.items[id].type);

/** Eligible types the hero carries, in bag order: [{id, count}]. */
export function carriedEligible(state, balance) {
  const out = [];
  for (const s of state.inventory) {
    if (!s || out.some((e) => e.id === s.id) || !isEligible(s.id, balance)) continue;
    out.push({ id: s.id, count: countItem(state.inventory, s.id) });
  }
  return out;
}

/**
 * Auto-fill an empty, never-chosen slot from the default order. Call after the bag changes.
 * @returns {boolean} the slot changed
 */
export function autoFill(state, balance) {
  const q = quickState(state);
  if (q.id || q.chosen) return false;
  const carried = carriedEligible(state, balance);
  if (!carried.length) return false;
  const order = quickConfig(balance).defaultOrder;
  const pick = order.find((id) => carried.some((c) => c.id === id));
  if (!pick) return false;
  q.id = pick;
  return true;
}

/** The player picked a type (or null to clear): never changed automatically afterwards. */
export function chooseQuick(state, id) {
  const q = quickState(state);
  q.id = id;
  q.chosen = true;
}

/** Carried count of the slot's type. */
export const quickCount = (state) => (quickState(state).id ? countItem(state.inventory, quickState(state).id) : 0);

/**
 * Use one carried item of the slot's type on the hero's needs.
 * @returns {{ok:boolean, reason?:string, id?:string}} reason "None left." / "Not now."
 */
export function consumeQuick(state, balance) {
  const q = quickState(state);
  if (!q.id) return { ok: false, reason: '' };
  if (countItem(state.inventory, q.id) <= 0) return { ok: false, reason: 'None left.' };
  const r = applyItem(state.needs, q.id, balance, heroCtx(state, balance));
  if (!r.ok) return { ok: false, reason: 'Not now.' };
  removeItem(state.inventory, q.id, 1);
  return { ok: true, id: q.id };
}

/** Remove one carried item of the slot's type (a thrown molotov). */
export function spendQuick(state) {
  const q = quickState(state);
  return q.id ? removeItem(state.inventory, q.id, 1) > 0 : false;
}

const RAD = 180 / Math.PI;

function angDiff(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return Math.abs(d);
}

/**
 * Aim point of a throw (GDD 4): the nearest Visible zombie within throw.rangeTiles, within +-half the aim
 * cone of his facing and in line of sight; else the last walkable tile in line of sight straight along his
 * facing, at most throwDefaultTiles away.
 * @param {{x:number,y:number,facing:number}} hero
 * @param {{x:number,y:number}[]} zombies Visible zombies (tile-unit centres)
 * @param {{rangeTiles:number, coneDegrees:number, defaultTiles:number, isWalkable:(x:number,y:number)=>boolean, los:(ax:number,ay:number,bx:number,by:number)=>boolean}} o
 * @param {{x:number,y:number}} [out] @returns {{x:number,y:number}} tile centre in tile units
 */
export function throwAim(hero, zombies, o, out = { x: 0, y: 0 }) {
  const htx = Math.floor(hero.x);
  const hty = Math.floor(hero.y);
  let best = null;
  let bd = Infinity;
  for (const z of zombies) {
    const dx = z.x - hero.x;
    const dy = z.y - hero.y;
    const d = Math.hypot(dx, dy);
    if (d > o.rangeTiles || d >= bd) continue;
    if (d > 1e-6 && angDiff(hero.facing, Math.atan2(dy, dx) * RAD) > o.coneDegrees / 2) continue;
    if (!o.los(htx, hty, Math.floor(z.x), Math.floor(z.y))) continue;
    best = z;
    bd = d;
  }
  if (best) { out.x = Math.floor(best.x) + 0.5; out.y = Math.floor(best.y) + 0.5; return out; }
  const ux = Math.cos(hero.facing / RAD);
  const uy = Math.sin(hero.facing / RAD);
  let lx = htx;
  let ly = hty;
  for (let s = 0.25; s <= o.defaultTiles + 1e-6; s += 0.25) {
    const tx = Math.floor(hero.x + ux * s);
    const ty = Math.floor(hero.y + uy * s);
    if (tx === lx && ty === ly) continue;
    if (!o.isWalkable(tx, ty) || !o.los(htx, hty, tx, ty)) break;
    lx = tx;
    ly = ty;
  }
  out.x = lx + 0.5;
  out.y = ly + 0.5;
  return out;
}

/**
 * Tap logic of the slot: cooldown, arming and the 3 s throw window. Time is advanced with step(dt).
 */
export class QuickUseController {
  /** @param {object} balance */
  constructor(balance) {
    this.cfg = quickConfig(balance);
    this.cooldown = 0;
    this.armed = false;
    this.armT = 0;
  }

  /** Per frame. */
  step(dt) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.armed) { this.armT -= dt; if (this.armT <= 0) this.disarm(); }
  }

  /** Disarm a throw (timeout, Main/Secondary tap, panel). The item is kept. */
  disarm() { this.armed = false; this.armT = 0; }

  /** 0..1 share of the cooldown left (for the ring). */
  get cooldownFrac() { return this.cfg.cooldownSeconds > 0 ? this.cooldown / this.cfg.cooldownSeconds : 0; }

  /**
   * A tap on the slot.
   * @returns {{type:'none'|'toast'|'used'|'arm'|'throw', reason?:string, id?:string}}
   */
  tap(state, balance) {
    const q = quickState(state);
    if (!q.id) return { type: 'none' };
    if (this.cooldown > 0) return { type: 'none' };
    if (countItem(state.inventory, q.id) <= 0) { this.disarm(); return { type: 'toast', reason: 'None left.' }; }
    if (balance.items[q.id]?.type === 'throwable') {
      if (!this.armed) { this.armed = true; this.armT = this.cfg.throwArmSeconds; return { type: 'arm', id: q.id }; }
      this.disarm();
      this.cooldown = this.cfg.cooldownSeconds;
      return { type: 'throw', id: q.id };
    }
    const r = consumeQuick(state, balance);
    if (!r.ok) return { type: 'toast', reason: r.reason };
    this.cooldown = this.cfg.cooldownSeconds;
    return { type: 'used', id: r.id };
  }
}
