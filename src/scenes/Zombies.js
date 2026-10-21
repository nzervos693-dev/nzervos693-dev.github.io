/**
 * Runtime zombies for the scene: builds sprites from state.zombies, runs the AI each frame for
 * the zombies that matter, and routes hits, noise and deaths. Rules live in gameplay/zombies.js
 * and gameplay/combat.js.
 */
import { floorAtY, floorLineY, homeSpot } from '../gameplay/layout.js';
import {
  makeAi, isAttacker, sightRadius, stepZombie, hearNoise, startChase, resetZombie, roomRefAt, movementBounds, zombieTuning,
  STEP_ATTACK, STEP_AGGRO, STEP_BARRICADE,
} from '../gameplay/zombies.js';
import { barricadeUp, barricadeDamage } from '../gameplay/barricade.js';
import { hitZombie, burnZombie } from '../gameplay/combat.js';
import ZombieView, { BODY_CENTER } from './ZombieView.js';
import { playSfx } from './sfx.js';
import { HIT_FX, wantsDecal } from '../gameplay/hitfx.js';

/** Tap hit box half width / half height (96x96 hit area). */
const HIT_HALF_W = 48;
const HIT_HALF_H = 60;

export default class Zombies {
  /** @param {import('./GameScene.js').default} scene */
  constructor(scene) {
    this.scene = scene;
    this.tune = zombieTuning(scene.balance);
    this.view = new ZombieView(scene, scene.tower, scene.state, scene.balance);
    /** @type {{rec:object, ai:object, sprite:object, dying:boolean}[]} */
    this.list = [];
    this.byId = new Map();
    this.bounds = { min: 0, max: 0 };
    /** The home barricade as zombies see it (refreshed every frame): a wall while up. */
    this.barricade = { up: false, floor: scene.tower.homeFloor, x: scene.tower.barricadeX };
    /** Where attackers head when the hero is elsewhere: inside the home apartment. */
    this.siegeX = homeSpot(scene.tower).x;
    this.env = {
      tower: scene.tower, doors: scene.state.doors, heroFloor: null, heroX: 0, heroRoom: null,
      types: scene.balance.zombies.types, sightRadius: scene.balance.zombies.sight?.frontPx ?? 180, heroRunning: false,
      attackRange: scene.balance.zombies.attackRange, tune: this.tune, rng: scene.rng, bounds: this.bounds,
      barricade: this.barricade,
    };
    for (const id in scene.state.zombies) {
      const rec = scene.state.zombies[id];
      if (!rec.dead) this.add(rec);
    }
  }

  /** Create the runtime for a zombie record. @returns the runtime */
  add(rec, aggro = false) {
    const rt = { rec, ai: makeAi(rec.facing === -1 ? -1 : 1), dying: false, ...this.view.create(rec) };
    if (aggro) startChase(rt.ai, this.tune); // attackers head for the door; they only notice the hero when they see him
    this.list.push(rt);
    this.byId.set(rec.id, rt);
    this.view.sync(rt);
    return rt;
  }

  get(id) { return this.byId.get(id) || null; }

  /** Add runtimes for living records created outside the scene (wanderers from offline catch-up). */
  syncRecords() {
    const zs = this.scene.state.zombies;
    for (const id in zs) {
      if (!zs[id].dead && !this.byId.has(id)) this.add(zs[id]);
    }
  }

  /** Living, visible zombie under a world tap, or null. */
  hitTest(wx, wy) {
    const floor = floorAtY(this.scene.tower, wy);
    if (floor == null) return null;
    const cy = floorLineY(this.scene.tower, floor) - BODY_CENTER;
    let best = null;
    let bestD = Infinity;
    for (const rt of this.list) {
      const z = rt.rec;
      if (rt.dying || z.floor !== floor || !rt.visible) continue;
      const dx = Math.abs(wx - z.x);
      if (dx > HIT_HALF_W || Math.abs(wy - cy) > HIT_HALF_H) continue;
      if (dx < bestD) { bestD = dx; best = rt; }
    }
    return best;
  }

  /** Per-frame AI and sprite sync. */
  update(dt) {
    const { scene, env } = this;
    this.view.update(dt);
    this.barricade.up = barricadeUp(scene.state);
    env.heroFloor = scene.zombieTargetFloor();
    env.heroX = scene.state.hero.x;
    env.heroRoom = env.heroFloor == null ? null : roomRefAt(scene.tower, env.heroFloor, env.heroX);
    env.heroRunning = !!scene.run;
    env.sightRadius = env.heroFloor == null ? 0 : sightRadius(scene.tower, env.heroFloor, env.heroX, scene.balance);
    const realSight = env.sightRadius;
    const realFloor = env.heroFloor;
    const realX = env.heroX;
    const realRoom = env.heroRoom;
    for (let i = 0; i < this.list.length; i++) {
      const rt = this.list[i];
      if (rt.dying) continue;
      const m = rt.ai.mode;
      // attackers (siege) keep pounding the barricade even when the hero is on another floor
      const siege = rt.rec.siege && realFloor !== rt.rec.floor;
      const active = siege || rt.rec.floor === env.heroFloor || m === 'chase' || m === 'attack' || m === 'return';
      if (active) {
        if (siege) { env.heroFloor = rt.rec.floor; env.heroX = this.siegeX; env.heroRoom = null; env.sightRadius = 9999; }
        const flags = stepZombie(rt.rec, rt.ai, env, dt);
        if (siege) { env.heroFloor = realFloor; env.heroX = realX; env.heroRoom = realRoom; env.sightRadius = realSight; }
        if (flags & STEP_AGGRO && !siege) scene.onZombieAggro(rt);
        if (flags & STEP_BARRICADE) scene.onBarricadeHit(rt, barricadeDamage(env.types[rt.rec.type].damage, scene.balance));
        if (flags & STEP_ATTACK && !siege) scene.onZombieBite(rt, env.types[rt.rec.type].damage);
      }
      this.view.sync(rt);
    }
  }

  /** Noise event from the scene bus: aggro the zombies it reaches (same floor only). */
  onNoise(n) {
    for (const rt of this.list) {
      if (!rt.dying && hearNoise(rt.rec, rt.ai, n, this.tune)) this.scene.onZombieAggro(rt, true);
    }
  }

  /** A hero weapon hit. @returns {boolean} killed */
  hurt(rt, damage, fromX, small = false) {
    const { scene } = this;
    this.barricade.up = barricadeUp(scene.state);
    movementBounds(scene.tower, scene.state.doors, rt.rec.floor, rt.rec.x, this.bounds, this.barricade);
    const killed = hitZombie(rt.rec, rt.ai, damage, fromX, this.bounds, scene.balance, this.tune);
    this.view.flash(rt);
    const dir = fromX < rt.rec.x ? 1 : -1; // the spray flies away from the hero
    this.view.bloodSplash(rt.rec.x - dir * 10, rt.y - BODY_CENTER - 6, dir, small);
    if (wantsDecal(killed)) this.view.addDecal(rt.rec.floor, rt.rec.x);
    if (killed) {
      this.kill(rt);
      if (Math.random() < HIT_FX.dripChance) {
        scene.time.delayedCall(HIT_FX.dripDelayMs, () => playSfx(scene, 'blood_drip', { volume: HIT_FX.dripVolume }));
      }
    }
    return killed;
  }

  /** Damage over time (fire): no knockback or stun. @returns {boolean} killed */
  burn(rt, amount) {
    if (rt.dying) return false;
    const killed = burnZombie(rt.rec, amount);
    if (killed) this.kill(rt);
    return killed;
  }

  kill(rt) {
    rt.dying = true;
    rt.rec.dead = true;
    this.view.die(rt, this.tune.corpseSeconds * 1000);
    playSfx(this.scene, 'zombie_death');
    const i = this.list.indexOf(rt);
    if (i >= 0) this.list.splice(i, 1);
    this.byId.delete(rt.rec.id);
    this.scene.onZombieKilled(rt);
  }

  /** Remove every attack zombie (app hidden mid-attack): runtimes, sprites and records. */
  removeAttackers() {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const rt = this.list[i];
      if (!isAttacker(rt.rec.id)) continue;
      this.view.destroy(rt);
      this.list.splice(i, 1);
      this.byId.delete(rt.rec.id);
    }
    for (const id of Object.keys(this.scene.state.zombies)) if (isAttacker(id)) delete this.scene.state.zombies[id];
  }

  /** App hidden: everyone walks back to their spawn point and calms down (hp kept). */
  resetAll() {
    for (const rt of this.list) {
      resetZombie(rt.rec, rt.ai);
      this.view.sync(rt);
    }
  }
}
