/**
 * Zombie sprites, hit flash, hit sparks, death and corpse fade. View only: no rules here.
 * No health bars and no noise rings (GDD 5.4, 5.6): damage reads from the zombie, noise from the sound.
 */
import { floorLineY, ART_SCALE } from '../gameplay/layout.js';
import { HIT_FX, decalAlpha } from '../gameplay/hitfx.js';

const ZOMBIE_DEPTH = 15;
/** Zombies this far outside the camera view are hidden, px. */
const VIEW_MARGIN = 150;
const SPARK_DEPTH = 25;
const SPARK_POOL = 6;
const SPARK_SCALE = 4;
const BLOOD_POOL = 6;
const DECAL_DEPTH = 11;
const DECAL_FRAMES = 4;
/** Impact point inside the 24x24 splash and 16x16 spatter frames (art px). */
const BLOOD_ORIGIN = { fx_blood: [4 / 24, 0.5], fx_blood_small: [3 / 16, 0.5] };
const CORPSE_FADE_MS = 800;
/** Vertical centre of a standing zombie above the floor line, px. */
export const BODY_CENTER = 36;

export default class ZombieView {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} tower
   * @param {object} state
   * @param {object} balance
   */
  constructor(scene, tower, state, balance) {
    this.scene = scene;
    this.tower = tower;
    this.state = state;
    this.balance = balance;
    this.sparks = [];
    for (let i = 0; i < SPARK_POOL; i++) {
      const sp = scene.add.sprite(0, 0, 'fx_spark', 0).setScale(SPARK_SCALE).setDepth(SPARK_DEPTH).setVisible(false);
      sp.on('animationcomplete', () => sp.setVisible(false));
      this.sparks.push(sp);
    }
    this.nextSpark = 0;
    this.blood = { fx_blood: [], fx_blood_small: [] };
    this.nextBlood = { fx_blood: 0, fx_blood_small: 0 };
    for (const key in this.blood) {
      for (let i = 0; i < BLOOD_POOL; i++) {
        const sp = scene.add.sprite(0, 0, key, 0).setScale(SPARK_SCALE).setDepth(SPARK_DEPTH).setVisible(false);
        sp.on('animationcomplete', () => sp.setVisible(false));
        this.blood[key].push(sp);
      }
    }
    /** @type {Map<number, {sprite:object, born:number}[]>} decals per floor, oldest first (cosmetic, not saved) */
    this.decals = new Map();
    this.clock = 0;
  }

  /** Sprite parts for a zombie record. */
  create(rec) {
    const { scene } = this;
    const y = floorLineY(this.tower, rec.floor);
    const key = `zombie_${rec.type}`;
    const sprite = scene.add.sprite(rec.x, y, key, 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(ZOMBIE_DEPTH);
    return { key, y, sprite, anim: null, visible: true };
  }

  /**
   * Stage 2: every room is drawn (no Dark state until stage 4), so a zombie is visible whenever it is inside the
   * camera view (plus a margin); the ones outside are hidden explicitly.
   */
  revealed(floor, x) {
    const cam = this.scene.cameras.main;
    const y = floorLineY(this.tower, floor);
    return x > cam.scrollX - VIEW_MARGIN && x < cam.scrollX + cam.width + VIEW_MARGIN
      && y > cam.scrollY - VIEW_MARGIN && y < cam.scrollY + cam.height + VIEW_MARGIN;
  }

  /** Per-frame sync of a living zombie's sprite with its record and AI. */
  sync(rt) {
    const { rec, ai, sprite } = rt;
    const vis = this.revealed(rec.floor, rec.x);
    if (vis !== rt.visible) { rt.visible = vis; sprite.setVisible(vis); }
    sprite.x = rec.x;
    sprite.setFlipX(ai.facing < 0);
    const want = ai.mode === 'attack' ? 'attack' : ai.moving ? 'walk' : 'idle';
    if (want !== rt.anim) {
      rt.anim = want;
      if (want === 'idle') { sprite.anims.stop(); sprite.setFrame(0); } else sprite.play(`${rt.key}_${want}`);
    }
  }

  /** White flash for balance.combat.hitFlashMs. */
  flash(rt) {
    rt.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(this.balance.combat.hitFlashMs, () => { if (rt.sprite.active) rt.sprite.clearTint(); });
  }

  /** Hit spark at a world position (pooled). */
  spark(x, y) {
    const sp = this.sparks[this.nextSpark];
    this.nextSpark = (this.nextSpark + 1) % this.sparks.length;
    sp.setPosition(x, y).setVisible(true).play('fx_spark_hit');
  }

  /**
   * Blood splash at a world position (pooled); the spray flies toward `dir` (+1 right, -1 left).
   * @param {boolean} small fists / weak hits use the small spatter
   */
  bloodSplash(x, y, dir, small) {
    const key = small ? 'fx_blood_small' : 'fx_blood';
    const pool = this.blood[key];
    const sp = pool[this.nextBlood[key]];
    this.nextBlood[key] = (this.nextBlood[key] + 1) % pool.length;
    const [ox, oy] = BLOOD_ORIGIN[key];
    sp.setFlipX(dir < 0).setOrigin(dir < 0 ? 1 - ox : ox, oy).setPosition(x, y).setVisible(true)
      .play(small ? 'fx_blood_small_spatter' : 'fx_blood_splash');
  }

  /** Leave a blood decal on the floor under x; the oldest on that floor is reused past the cap. */
  addDecal(floor, x) {
    let list = this.decals.get(floor);
    if (!list) { list = []; this.decals.set(floor, list); }
    let d;
    if (list.length >= HIT_FX.decalMaxPerFloor) d = list.shift();
    else d = { sprite: this.scene.add.sprite(0, 0, 'blood_decal', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(DECAL_DEPTH), born: 0 };
    d.born = this.clock;
    const jitter = (Math.random() * 2 - 1) * HIT_FX.decalJitterPx;
    d.sprite.setFrame(Math.floor(Math.random() * DECAL_FRAMES)).setFlipX(Math.random() < 0.5)
      .setPosition(x + jitter, floorLineY(this.tower, floor)).setAlpha(decalAlpha(0)).setVisible(true);
    list.push(d);
  }

  /** Slowly fade decals (dt in seconds; paused time does not count). */
  update(dt) {
    this.clock += dt;
    for (const list of this.decals.values()) {
      for (const d of list) d.sprite.setAlpha(decalAlpha(this.clock - d.born));
    }
  }

  /** Death animation, then the corpse lingers `corpseMs` and fades out. */
  die(rt, corpseMs) {
    const { scene } = this;
    rt.sprite.clearTint();
    rt.sprite.setVisible(this.revealed(rt.rec.floor, rt.rec.x));
    rt.sprite.play(`${rt.key}_death`);
    scene.time.delayedCall(corpseMs, () => {
      if (!rt.sprite.active) return;
      scene.tweens.add({ targets: rt.sprite, alpha: 0, duration: CORPSE_FADE_MS, onComplete: () => this.destroy(rt) });
    });
  }

  destroy(rt) {
    rt.sprite.destroy();
  }
}
