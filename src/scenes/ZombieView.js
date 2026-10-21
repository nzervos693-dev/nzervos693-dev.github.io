/**
 * Zombie sprites, hit flash, hit sparks, death and corpse fade. View only: no rules here.
 * No health bars and no noise rings (GDD 5.4, 5.6): damage reads from the zombie, noise from the sound.
 */
import { floorLineY, roomKey, ART_SCALE } from '../gameplay/layout.js';
import { roomRefAt } from '../gameplay/zombies.js';

const ZOMBIE_DEPTH = 15;
const SPARK_DEPTH = 25;
const SPARK_POOL = 6;
const SPARK_SCALE = 4;
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
    this.keyOf = new Map();
    for (const apt of tower.apartments.values()) for (const r of apt.rooms) this.keyOf.set(r, roomKey(apt, r));
    this.sparks = [];
    for (let i = 0; i < SPARK_POOL; i++) {
      const sp = scene.add.sprite(0, 0, 'fx_spark', 0).setScale(SPARK_SCALE).setDepth(SPARK_DEPTH).setVisible(false);
      sp.on('animationcomplete', () => sp.setVisible(false));
      this.sparks.push(sp);
    }
    this.nextSpark = 0;
  }

  /** Sprite parts for a zombie record. */
  create(rec) {
    const { scene } = this;
    const y = floorLineY(this.tower, rec.floor);
    const key = `zombie_${rec.type}`;
    const sprite = scene.add.sprite(rec.x, y, key, 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(ZOMBIE_DEPTH);
    return { key, y, sprite, anim: null, visible: true };
  }

  /** Is the room under x already entered? (Stairwell is always visible.) */
  revealed(floor, x) {
    const room = roomRefAt(this.tower, floor, x);
    return !room || !!this.state.rooms[this.keyOf.get(room)];
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
