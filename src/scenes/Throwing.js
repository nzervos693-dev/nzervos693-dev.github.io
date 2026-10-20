/**
 * Throw button flow and fire patches (GDD 5.11): arm, show the range, tap to throw, the bottle
 * lands after throw.landSeconds, burns molotov.seconds. Rules live in gameplay/throwables.js.
 */
import { floorAtY, floorLineY } from '../gameplay/layout.js';
import { removeItem } from '../gameplay/inventory.js';
import {
  throwableIds, cycleArm, checkThrow, createFire, stepFire, fireCovers,
} from '../gameplay/throwables.js';
import { frameOf } from './art.js';
import { playSfx } from './sfx.js';
import { COLORS } from './ui.js';

const FIRE_DEPTH = 18;
const RANGE_DEPTH = 17;
const FLIGHT_DEPTH = 30;
const THROW_FROM_HEAD = 100;
const ARC_HEIGHT = 110;
const RANGE_H = 150;
const RANGE_LIFT = 60;
const FLAME_SPACING = 40;
const FLAME_SCALE = 3;
const FADE_LAST = 0.6;

export default class Throwing {
  /** @param {import('./GameScene.js').default} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {string|null} armed item id */
    this.armed = null;
    this.flight = null;
    this.fires = [];
    const range = scene.balance.throw.rangePx;
    this.ring = scene.add.ellipse(0, 0, range * 2, RANGE_H, COLORS.amber, 0.1)
      .setStrokeStyle(3, COLORS.amber, 0.7).setDepth(RANGE_DEPTH).setVisible(false);
    this.bottle = scene.add.image(0, 0, 'icons', frameOf('icons', 'molotov')).setScale(5).setDepth(FLIGHT_DEPTH).setVisible(false);
  }

  /** Carried throwable ids. */
  ids() { return throwableIds(this.scene.state.inventory, this.scene.balance); }

  disarm() {
    this.armed = null;
    this.ring.setVisible(false);
  }

  arm(id) {
    this.armed = id;
    this.ring.setVisible(true);
  }

  /** Throw button tap: arm / cycle / disarm. @returns {string|null} armed id */
  tapButton() {
    const next = cycleArm(this.armed, this.ids());
    if (next) this.arm(next); else this.disarm();
    return next;
  }

  /**
   * A world tap while armed. Throws if valid, else disarms and keeps the item.
   * @returns {boolean} the tap was consumed
   */
  handleTap(wx, wy) {
    if (!this.armed) return false;
    const s = this.scene;
    const h = s.state.hero;
    if (s.stair) { this.disarm(); return true; }
    const r = checkThrow(h, { floor: floorAtY(s.tower, wy), x: wx }, s.balance.throw.rangePx, s.tower.floorWidth);
    const id = this.armed;
    this.disarm();
    if (!r.ok) { s.deny('Out of range. Throw cancelled.', 1600); return true; }
    if (removeItem(s.state.inventory, id, 1) < 1) return true;
    s.heroSprite.setFlipX(r.x < h.x);
    s.playSwingAnim();
    const y0 = floorLineY(s.tower, h.floor);
    this.flight = { id, t: 0, floor: h.floor, x0: h.x, x1: r.x, y0, y1: y0 };
    this.bottle.setVisible(true);
    s.panel.refresh();
    s.save();
    return true;
  }

  /** Per-frame: bottle in flight, fire damage, drawing. */
  update(dt) {
    const s = this.scene;
    const h = s.state.hero;
    if (this.armed) {
      if (!this.ids().includes(this.armed)) this.disarm();
      else this.ring.setPosition(h.x, floorLineY(s.tower, h.floor) - RANGE_LIFT).setVisible(!s.stair);
    }
    const f = this.flight;
    if (f) {
      f.t += dt;
      const p = Math.min(1, f.t / s.balance.throw.landSeconds);
      this.bottle.setPosition(
        f.x0 + (f.x1 - f.x0) * p,
        f.y0 - THROW_FROM_HEAD + (f.y1 - f.y0 + THROW_FROM_HEAD) * p - Math.sin(Math.PI * p) * ARC_HEIGHT,
      ).setAngle(p * 540);
      if (p >= 1) this.land(f);
    }
    this.burn(dt);
    this.fade();
  }

  land(f) {
    const s = this.scene;
    this.flight = null;
    this.bottle.setVisible(false);
    this.fires.push(this.light(createFire(f.floor, f.x1, s.balance, f.id)));
    playSfx(s, 'glass_shatter');
    playSfx(s, 'fire_whoosh');
    // Molotovs count as Loud: the whole floor hears it, no other floor.
    s.bus.emit('noise', { floor: f.floor, x: f.x1, level: s.balance.molotov.noise, radius: Infinity, source: 'molotov' });
  }

  burn(dt) {
    const s = this.scene;
    const h = s.state.hero;
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const fire = this.fires[i];
      if (!stepFire(fire, dt)) { this.fires.splice(i, 1); fire.sprites.forEach((sp) => sp.destroy()); continue; }
      const list = s.zombies.list;
      for (let k = list.length - 1; k >= 0; k--) {
        const rt = list[k];
        if (rt.rec.floor === fire.floor && fireCovers(fire, rt.rec.x)) s.zombies.burn(rt, fire.zdps * dt);
      }
      if (!s.stair && !s.dead && h.floor === fire.floor && fireCovers(fire, h.x)) s.burnHero(fire.hdps * dt);
    }
  }

  /** Flame sprites (fx_fire burn loop) across the patch. */
  light(fire) {
    const { scene } = this;
    const y = floorLineY(scene.tower, fire.floor);
    const n = Math.max(1, Math.ceil(fire.w / FLAME_SPACING));
    fire.sprites = [];
    for (let i = 0; i < n; i++) {
      const x = fire.x - fire.w / 2 + (fire.w * (i + 0.5)) / n;
      const sp = scene.add.sprite(x, y, 'fx_fire', 0).setOrigin(0.5, 1).setScale(FLAME_SCALE).setDepth(FIRE_DEPTH).setFlipX(i % 2 === 1);
      sp.play({ key: 'fx_fire_burn', startFrame: i % 3 });
      fire.sprites.push(sp);
    }
    return fire;
  }

  /** Flames fade out over the last moments. */
  fade() {
    for (const fire of this.fires) {
      const a = Math.min(1, fire.left / FADE_LAST);
      if (a < 1) for (const sp of fire.sprites) sp.setAlpha(a);
    }
  }

  /** App hidden: fires burn out, a bottle in the air goes back to the bag, disarm. */
  reset() {
    this.disarm();
    for (const f of this.fires) f.sprites.forEach((sp) => sp.destroy());
    this.fires.length = 0;
    this.bottle.setVisible(false);
    const f = this.flight;
    this.flight = null;
    return f;
  }
}
