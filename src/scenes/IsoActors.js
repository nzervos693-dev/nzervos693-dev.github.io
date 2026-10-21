/**
 * Characters on the iso floor: the hero, zombies, hit feedback (blood splash, floor stains, white flash,
 * 8 px shove) and the pop-in fade. View only. Sprites are the baked 8-direction sheets: animation key
 * `${sheet}_${anim}_${DIR}`, DIR chosen from the SCREEN direction of the grid facing (angleToSpriteFacing).
 */
import { angleToSpriteFacing, depthKey, LAYER } from '../iso/projection.js';
import { frameOf } from './art.js';
import { isoDepth } from './IsoWorldView.js';
import { HIT_FX, decalAlpha } from '../gameplay/hitfx.js';
import { tintOf } from '../gameplay/isoView.js';

const S = 3;
const ORIGIN_Y = 30 / 32;
const BLOOD_POOL = 6;
const SHOVE_DECAY = 1 / 0.12;
const ZOMBIE_MIN_BRIGHT = 0.6;

const keyCache = {};
/** Animation key `${sheet}_${anim}_${dir}`, cached so the per-frame sync allocates no strings. */
function animKey(sheet, anim, dir) {
  const a = (keyCache[sheet] ||= {});
  const b = (a[anim] ||= {});
  return (b[dir] ||= `${sheet}_${anim}_${dir}`);
}

export default class IsoActors {
  /** @param {Phaser.Scene} scene @param {{iso:object, balance:object, vision:object, worldView:object}} ctx */
  constructor(scene, ctx) {
    this.scene = scene;
    this.iso = ctx.iso;
    this.balance = ctx.balance;
    this.vision = ctx.vision;
    this.world = ctx.worldView;
    this.popRate = 1 / (this.balance.vision.popInSeconds || 0.15);
    this.hitFlashMs = this.balance.combat.hitFlashMs;
    this.shovePx = this.balance.combat.knockbackPx;
    this.hero = null;
    this.heroAnim = '';
    this.blood = { fx_blood: [], fx_blood_small: [] };
    this.nextBlood = { fx_blood: 0, fx_blood_small: 0 };
    for (const key of Object.keys(this.blood)) {
      for (let i = 0; i < BLOOD_POOL; i++) {
        const sp = scene.add.sprite(0, 0, key, 0).setScale(S).setVisible(false).setDepth(900);
        sp.on('animationcomplete', () => sp.setVisible(false));
        this.blood[key].push(sp);
      }
    }
    this.decals = [];
    this.clock = 0;
    this.pos = { x: 0, y: 0 };
  }

  /** Screen (world px) position of continuous tile coordinates, into `out`. */
  toScreen(x, y, out = this.pos) {
    out.x = (x - y) * 48;
    out.y = (x + y) * 24;
    return out;
  }

  // ---------------------------------------------------------------- hero

  createHero(h) {
    this.hero = this.scene.add.sprite(0, 0, 'iso_hero', 0).setOrigin(0.5, ORIGIN_Y).setScale(S);
    this.heroDir = '';
    this.syncHero(h, 'idle', 0, false);
    return this.hero;
  }

  /**
   * @param {{x:number,y:number,facing:number}} h
   * @param {'idle'|'walk'|'attack'|'death'|'hurt'} anim @param {number} speedMult anim speed (run > 1)
   */
  syncHero(h, anim, speedMult = 1, sleeping = false) {
    const sp = this.hero;
    this.toScreen(h.x, h.y);
    sp.setPosition(this.pos.x, this.pos.y);
    sp.setDepth(isoDepth(depthKey(Math.floor(h.x), Math.floor(h.y), LAYER.CHARACTER)));
    const dir = angleToSpriteFacing(this.iso, h.facing);
    const key = animKey('iso_hero', anim, dir);
    if (key !== this.heroAnim) {
      this.heroAnim = key;
      if (this.scene.anims.exists(key)) sp.play(key);
    }
    sp.anims.timeScale = speedMult || 1;
    sp.setAlpha(sleeping ? 0.55 : 1);
  }

  // ---------------------------------------------------------------- zombies

  /** Create the sprite parts of a zombie runtime. */
  createZombie(rt) {
    const sheet = `iso_${rt.rec.type}`;
    const sp = this.scene.add.sprite(0, 0, sheet, 0).setOrigin(0.5, ORIGIN_Y).setScale(S).setAlpha(0).setVisible(false);
    rt.sheet = sheet;
    rt.sp = sp;
    rt.anim = '';
    rt.alpha = 0;
    rt.shoveX = 0;
    rt.shoveY = 0;
    rt.flashUntil = 0;
    rt.dying = false;
    return rt;
  }

  /** Per-frame sync of a living zombie sprite. Drawn only while its tile is Visible (0.15 s pop-in). */
  syncZombie(rt, dt) {
    const { rec, ai, sp } = rt;
    const vis = this.vision.isVisible(rec.x, rec.y);
    const step = this.popRate * dt;
    rt.alpha = vis ? Math.min(1, rt.alpha + step) : Math.max(0, rt.alpha - step * 2);
    rt.visible = rt.alpha > 0.01;
    sp.setVisible(rt.visible);
    if (!rt.visible) return;
    sp.setAlpha(rt.alpha);
    if (rt.shoveX || rt.shoveY) {
      const k = Math.max(0, 1 - SHOVE_DECAY * dt);
      rt.shoveX *= k;
      rt.shoveY *= k;
      if (Math.abs(rt.shoveX) + Math.abs(rt.shoveY) < 0.3) { rt.shoveX = 0; rt.shoveY = 0; }
    }
    this.toScreen(rec.x, rec.y);
    sp.setPosition(this.pos.x + rt.shoveX, this.pos.y + rt.shoveY);
    sp.setDepth(isoDepth(depthKey(Math.floor(rec.x), Math.floor(rec.y), LAYER.CHARACTER)));
    const dir = angleToSpriteFacing(this.iso, ai.facing);
    const want = ai.windup > 0 ? 'attack' : ai.moving ? 'shuffle' : 'still';
    const key = animKey(rt.sheet, want === 'still' ? 'shuffle' : want, dir);
    const sig = animKey(rt.sheet, want, dir);
    if (sig !== rt.anim) {
      rt.anim = sig;
      if (want === 'still') { sp.anims.stop(); sp.setFrame(frameOf(rt.sheet, `shuffle_${dir}_0`)); } else if (this.scene.anims.exists(key)) sp.play(key);
    }
    if (this.scene.time.now < rt.flashUntil) sp.setTintFill(0xffffff);
    else {
      const b = Math.max(ZOMBIE_MIN_BRIGHT, this.world.bright[this.world.tileIdx(Math.floor(rec.x), Math.floor(rec.y))]);
      sp.setTint(tintOf(b, false));
    }
  }

  /** Hit feedback: white flash, shove away from the hero, blood splash and (sometimes) a floor stain. */
  hitFx(rt, fromX, fromY, small, decal) {
    const { rec } = rt;
    rt.flashUntil = this.scene.time.now + this.hitFlashMs;
    // shove 8 px along the screen direction hero -> zombie
    const hs = this.toScreen(fromX, fromY, { x: 0, y: 0 });
    const zs = this.toScreen(rec.x, rec.y, { x: 0, y: 0 });
    let dx = zs.x - hs.x;
    let dy = zs.y - hs.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    rt.shoveX = dx * this.shovePx;
    rt.shoveY = dy * this.shovePx;
    const key = small ? 'fx_blood_small' : 'fx_blood';
    const pool = this.blood[key];
    const sp = pool[this.nextBlood[key]];
    this.nextBlood[key] = (this.nextBlood[key] + 1) % pool.length;
    const ox = small ? 3 / 16 : 4 / 24;
    sp.setFlipX(dx < 0).setOrigin(dx < 0 ? 1 - ox : ox, 0.5).setPosition(zs.x + dx * 8, zs.y - 40 + dy * 4).setVisible(true).setDepth(900)
      .play(small ? 'fx_blood_small_spatter' : 'fx_blood_splash');
    if (decal) this.addDecal(Math.floor(rec.x), Math.floor(rec.y));
  }

  /** Blood stain on a tile (cosmetic, only drawn while that tile is Visible; oldest reused past the cap). */
  addDecal(tx, ty) {
    let d;
    if (this.decals.length >= HIT_FX.decalMaxPerFloor) d = this.decals.shift();
    else d = { sp: this.scene.add.image(0, 0, 'iso_fx', 0).setScale(S) };
    d.born = this.clock;
    d.tx = tx;
    d.ty = ty;
    d.sp.setFrame(frameOf('iso_fx', `blood_floor_${Math.floor(Math.random() * 3)}`))
      .setPosition((tx - ty) * 48 + (Math.random() * 2 - 1) * 12, (tx + ty + 1) * 24 + (Math.random() * 2 - 1) * 5)
      .setDepth(isoDepth(depthKey(tx, ty, LAYER.DECAL))).setAlpha(decalAlpha(0)).setVisible(true).setFlipX(Math.random() < 0.5);
    this.decals.push(d);
  }

  /** Fade stains (dt in seconds of online play) and hide those on tiles out of sight. */
  update(dt) {
    this.clock += dt;
    for (let i = 0; i < this.decals.length; i++) {
      const d = this.decals[i];
      const a = decalAlpha(this.clock - d.born);
      d.sp.setAlpha(a).setVisible(a > 0 && this.vision.isVisible(d.tx, d.ty));
    }
  }

  /** Death animation, then the corpse lingers `corpseMs` and fades out. */
  die(rt, corpseMs, onGone) {
    const { sp } = rt;
    rt.dying = true;
    sp.clearTint().setAlpha(1).setVisible(this.vision.isVisible(rt.rec.x, rt.rec.y));
    const dir = angleToSpriteFacing(this.iso, rt.ai.facing);
    const key = `${rt.sheet}_death_${dir}`;
    if (this.scene.anims.exists(key)) sp.play(key);
    this.scene.time.delayedCall(corpseMs, () => {
      if (!sp.active) return;
      this.scene.tweens.add({ targets: sp, alpha: 0, duration: 800, onComplete: () => { sp.destroy(); onGone?.(); } });
    });
  }

  destroyZombie(rt) { rt.sp?.destroy(); }
}
