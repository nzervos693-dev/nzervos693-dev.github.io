/**
 * Zombie sprites, hit flash, hit sparks, death and corpse fade. View only: no rules here.
 */
import { floorLineY, roomKey, ART_SCALE } from '../gameplay/layout.js';
import { roomRefAt } from '../gameplay/zombies.js';
import { COLORS } from './ui.js';

const ZOMBIE_DEPTH = 15;
const SPARK_DEPTH = 25;
const BAR_DEPTH = 26;
const SPARK_POOL = 6;
const SPARK_SCALE = 4;
const BAR_W = 54;
const BAR_H = 8;
const BAR_ABOVE = 80;
const CORPSE_FADE_MS = 800;
const RING_POOL = 3;
const RING_FRAME_PX = 16;
const RING_START_SCALE = 3;
const RING_MAX_RADIUS = 360;
const RING_MS = 600;
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
    this.rings = [];
    for (let i = 0; i < RING_POOL; i++) {
      this.rings.push(scene.add.sprite(0, 0, 'fx_noise', 0).setDepth(SPARK_DEPTH).setTint(COLORS.amber).setVisible(false));
    }
    this.nextRing = 0;
  }

  /** Sprite parts for a zombie record. */
  create(rec) {
    const { scene } = this;
    const y = floorLineY(this.tower, rec.floor);
    const key = `zombie_${rec.type}`;
    const sprite = scene.add.sprite(rec.x, y, key, 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(ZOMBIE_DEPTH);
    const barBack = scene.add.rectangle(rec.x, y - BAR_ABOVE, BAR_W + 4, BAR_H + 4, COLORS.ink).setDepth(BAR_DEPTH).setVisible(false);
    const bar = scene.add.rectangle(rec.x - BAR_W / 2, y - BAR_ABOVE, BAR_W, BAR_H, COLORS.red).setOrigin(0, 0.5).setDepth(BAR_DEPTH + 1).setVisible(false);
    return { key, y, sprite, bar, barBack, anim: null, visible: true };
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
    const max = this.balance.zombies.types[rec.type].hp;
    const showBar = vis && rec.hp < max && !rec.dead;
    rt.barBack.setVisible(showBar);
    rt.bar.setVisible(showBar);
    if (showBar) {
      rt.barBack.x = rec.x;
      rt.bar.x = rec.x - BAR_W / 2;
      rt.bar.width = Math.max(1, (BAR_W * rec.hp) / max);
    }
  }

  /** White flash for balance.combat.hitFlashMs. */
  flash(rt) {
    rt.sprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(this.balance.combat.hitFlashMs, () => { if (rt.sprite.active) rt.sprite.clearTint(); });
  }

  /**
   * Expanding ring where a noise was made (radius Infinity = whole floor, drawn at the floor's width).
   * @param {{floor:number,x:number,radius:number}} n
   */
  noiseRing(n) {
    const sp = this.rings[this.nextRing];
    this.nextRing = (this.nextRing + 1) % this.rings.length;
    this.scene.tweens.killTweensOf(sp);
    const r = Math.min(Number.isFinite(n.radius) ? n.radius : this.tower.floorWidth / 2, RING_MAX_RADIUS);
    sp.setPosition(n.x, floorLineY(this.tower, n.floor) - BODY_CENTER).setScale(RING_START_SCALE).setAlpha(0.8).setVisible(true).play('fx_noise_ring');
    this.scene.tweens.add({
      targets: sp, scale: (r * 2) / RING_FRAME_PX, alpha: 0, duration: RING_MS, ease: 'Quad.easeOut',
      onComplete: () => sp.setVisible(false),
    });
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
    rt.bar.setVisible(false);
    rt.barBack.setVisible(false);
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
    rt.bar.destroy();
    rt.barBack.destroy();
  }
}
