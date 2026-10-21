/**
 * Hero attack flow: one tap = one swing. Walks into weapon range, swings once, honours the
 * weapon cooldown and buffers `controls.attackBuffer` tap(s) during the cooldown.
 * Door hits go through the same cooldown and energy cost. Rules live in gameplay/combat.js.
 */
import { limitWalk, stepToward } from '../gameplay/routing.js';
import { barrierBetween } from '../gameplay/zombies.js';
import { speedMult } from '../gameplay/needs.js';
import { heroWeapon, swingDamage, spendSwingEnergy, spendWeaponUse } from '../gameplay/combat.js';
import { isAware } from '../gameplay/zombies.js';
import { playSfx } from './sfx.js';
import { hitSoundKey, isSmallHit } from '../gameplay/hitfx.js';

/** Stand a little inside the weapon range so knockback or jitter does not break the swing. */
const RANGE_SLACK = 4;

export default class Combat {
  /** @param {import('./GameScene.js').default} scene */
  constructor(scene) {
    this.scene = scene;
    this.cd = 0;
    /** @type {{type:'zombie', id:string}|{type:'door', door:object}|null} */
    this.order = null;
    /** Last sound variant per class, to avoid an immediate repeat. */
    this.lastHit = {};
  }

  /** Drop the pending attack (new tap elsewhere, hide, death). */
  clear() { this.order = null; }

  /**
   * Queue an attack. During the cooldown only `controls.attackBuffer` taps are kept (the latest).
   * @returns {boolean} accepted
   */
  submit(order) {
    const buf = this.scene.balance.controls.attackBuffer;
    if (this.cd > 0 && buf < 1) return false;
    this.order = order;
    return true;
  }

  orderZombie(rt) { return this.submit({ type: 'zombie', id: rt.rec.id }); }

  orderDoor(door) { return this.submit({ type: 'door', door }); }

  /** Per-frame: cooldown, approach and swing. Call after the hero's normal movement. */
  update(dt) {
    if (this.cd > 0) this.cd = Math.max(0, this.cd - dt);
    const o = this.order;
    const s = this.scene;
    if (!o || s.stair || s.sleeping || s.action) return;
    if (o.type === 'door') {
      if (s.state.doors[o.door.id].state !== 'jammed' || s.state.hero.floor !== o.door.floor) { this.order = null; return; }
      if (this.cd <= 0) { this.order = null; this.swing(null, o.door); }
      return;
    }
    const rt = s.zombies.get(o.id);
    const h = s.state.hero;
    if (!rt || rt.dying || rt.rec.floor !== h.floor) { this.order = null; return; }
    if (barrierBetween(s.tower, s.state.doors, h.floor, h.x, rt.rec.x)) {
      this.order = null; // weapons do not reach through a jammed door
      s.deny('The door is jammed.', 1600);
      return;
    }
    const w = heroWeapon(s.state, s.balance);
    const dx = rt.rec.x - h.x;
    if (Math.abs(dx) > w.range) { this.approach(rt, w, dx, dt); return; }
    s.heroSprite.setFlipX(dx < 0);
    if (this.cd <= 0) { this.order = null; this.swing(rt, null, w); } else s.setHeroAnim('idle');
  }

  /** Walk toward a zombie until it is inside weapon range. */
  approach(rt, w, dx, dt) {
    const s = this.scene;
    const h = s.state.hero;
    const want = rt.rec.x - Math.sign(dx) * Math.max(1, w.range - RANGE_SLACK);
    const lim = limitWalk(s.tower, s.state.doors, h.floor, h.x, want);
    const speed = s.balance.hero.walkSpeed * speedMult(s.state.needs, s.balance); // approaching to hit is always a walk
    const nx = stepToward(h.x, lim.x, speed, dt);
    if (nx !== h.x) { s.heroSprite.setFlipX(nx < h.x); s.setHeroAnim('walk'); s.footstep(dt); } else s.setHeroAnim('idle');
    h.x = nx;
    s.checkRoomEntry();
    // a jammed door in the way: give up (the tap order must be reissued after opening it)
    if (lim.blockedDoor && nx === lim.x && lim.x !== want) { this.order = null; s.deny('The door is jammed.', 1600); }
  }

  /**
   * Perform one swing at a zombie, or at a jammed door when `door` is given.
   * Costs energyPerSwing and starts the weapon cooldown either way.
   */
  swing(rt, door, weapon) {
    const s = this.scene;
    const { state, balance } = s;
    const w = weapon || heroWeapon(state, balance);
    const h = state.hero;
    this.cd = w.cooldown;
    spendSwingEnergy(state.needs, balance);
    if (rt) s.heroSprite.setFlipX(rt.rec.x < h.x);
    s.playSwingAnim();
    playSfx(s, 'swing');
    if (!rt) { s.applyDoorHit(door); return; }
    // the first hit on a zombie that has not noticed the hero deals x3 (GDD 5.4); no damage numbers
    const dmg = swingDamage(w, state.needs, balance, { unaware: !isAware(rt.ai), panic: s.panic.level });
    playSfx(s, hitSoundKey(w.id, this.lastHit));
    const killed = s.zombies.hurt(rt, dmg, h.x, isSmallHit(w.id));
    const wear = spendWeaponUse(state, balance);
    if (wear?.broke) {
      s.toast.show(`Your ${balance.combat.weapons[wear.id].name.toLowerCase()} broke. Back to fists.`);
      playSfx(s, 'weapon_break');
    }
    if (killed || wear?.broke) s.save();
  }
}
