/**
 * Throwing and fire on the iso floor (GDD 4 quick-use, 5.11): the faint iso ellipse of the landing area
 * while armed, the throw in flight (lands throw.landSeconds later), the molotov fire patch (radius
 * molotov.radiusTiles tiles, molotov.seconds s, damage per second to zombies and to the hero standing in it)
 * and its flame sprites. Rules live in gameplay/isoCombat.js (patches) and gameplay/isoQuickUse.js (aim).
 */
import { createFirePatch, patchCovers, stepPatch } from '../gameplay/isoCombat.js';
import { depthKey, LAYER } from '../iso/projection.js';
import { isoDepth } from './IsoWorldView.js';
import { playSfx } from './sfx.js';
import { damageHero } from '../gameplay/combat.js';

const S = 3;

export default class IsoThrow {
  /** @param {import('./IsoGameScene.js').default} scene */
  constructor(scene) {
    this.scene = scene;
    this.g = scene.add.graphics().setDepth(isoDepth(900000)).setVisible(false);
    this.pending = []; // { t, x, y } tile
    this.patches = [];
    this.flames = [];
    this.burnHero = 0;
  }

  /** Show the landing ellipse centred on a tile centre (tile units). */
  showAim(x, y) {
    const r = this.scene.balance.molotov.radiusTiles ?? 1;
    const n = 2 * r + 1;
    const sx = (x - y) * 48;
    const sy = (x + y) * 24;
    this.g.setVisible(true).clear().lineStyle(3, 0xbdb8ab, 0.35).strokeEllipse(sx, sy, n * 96 * 0.9, n * 48 * 0.9);
  }

  hideAim() { this.g.setVisible(false); }

  /** Throw: the item lands on the tile after throw.landSeconds. */
  launch(x, y) { this.pending.push({ t: this.scene.balance.throw.landSeconds, x: Math.floor(x), y: Math.floor(y) }); }

  /** Per frame. */
  update(dt) {
    const sc = this.scene;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      if (p.t > 0) continue;
      this.pending.splice(i, 1);
      this.land(p.x, p.y);
    }
    let burning = false;
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const f = this.patches[i];
      if (!stepPatch(f, dt)) { this.patches.splice(i, 1); continue; }
      for (const rt of sc.zombies.list.slice()) {
        if (rt.dying) continue;
        if (patchCovers(f, Math.floor(rt.rec.x), Math.floor(rt.rec.y))) sc.zombies.burn(rt, f.zdps * dt);
      }
      if (!sc.dead && patchCovers(f, Math.floor(sc.hero.x), Math.floor(sc.hero.y))) {
        burning = true;
        const r = damageHero(sc.state.needs, f.hdps * dt);
        this.burnHero += dt;
        if (this.burnHero > 0.5) { this.burnHero = 0; sc.heroHurt(1); }
        if (r.dead) sc.onHeroDeath();
      }
    }
    if (!burning) this.burnHero = 0;
    this.drawFlames();
  }

  land(x, y) {
    const sc = this.scene;
    const patch = createFirePatch(x, y, sc.balance.molotov);
    this.patches.push(patch);
    playSfx(sc, 'glass_shatter');
    playSfx(sc, 'fire_whoosh');
    sc.noise(x + 0.5, y + 0.5, 'loud', Infinity, 'molotov');
  }

  drawFlames() {
    let n = 0;
    const sc = this.scene;
    for (const f of this.patches) {
      for (const t of f.tiles) {
        if (!sc.grid.isFloor(t.x, t.y)) continue;
        let sp = this.flames[n];
        if (!sp) {
          sp = sc.add.sprite(0, 0, 'fx_fire', 0).setScale(S).setOrigin(0.5, 0.8);
          if (sc.anims.exists('fx_fire_burn')) sp.play('fx_fire_burn');
          this.flames[n] = sp;
        }
        const vis = sc.vision.isVisible(t.x, t.y);
        sp.setVisible(vis).setPosition((t.x - t.y) * 48, (t.x + t.y + 1) * 24).setDepth(isoDepth(depthKey(t.x, t.y, LAYER.OBJECT, 8)));
        n++;
      }
    }
    for (let i = n; i < this.flames.length; i++) this.flames[i].setVisible(false);
  }

  /** App hidden: nothing burns on. */
  clear() { this.pending.length = 0; this.patches.length = 0; this.hideAim(); this.drawFlames(); }
}
