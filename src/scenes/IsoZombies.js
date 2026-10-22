/**
 * Runtime zombies of the iso scene: owns the AI objects and sprites, steps the AI every frame, and routes
 * hits, noise, bites and door bangs to the scene. Rules live in gameplay/isoZombies.js.
 */
import {
  isoZombieConfig, makeIsoEnv, makeIsoAi, fillOccupancy, stepIsoZombie, hearIsoNoise, hitIsoZombie, resetIsoZombie,
  STEP_ATTACK, STEP_AGGRO, STEP_DOORHIT,
} from '../gameplay/isoZombies.js';
import { wantsDecal, HIT_FX } from '../gameplay/hitfx.js';
import { playSfx } from './sfx.js';

export default class IsoZombies {
  /** @param {import('./IsoGameScene.js').default} scene */
  constructor(scene) {
    this.scene = scene;
    this.cfg = isoZombieConfig(scene.balance);
    this.env = makeIsoEnv(scene.grid, this.cfg, scene.rng);
    /** @type {object[]} runtimes: { rec, ai, sp, ... } */
    this.list = [];
    this.byId = new Map();
    this.records = [];
    for (const id in scene.state.zombies) {
      const rec = scene.state.zombies[id];
      if (!rec.dead) this.add(rec);
    }
  }

  add(rec) {
    const rt = { rec, ai: makeIsoAi(rec, this.scene.rng, this.cfg), dying: false, visible: false };
    this.scene.actors.createZombie(rt);
    this.list.push(rt);
    this.byId.set(rec.id, rt);
    return rt;
  }

  get(id) { return this.byId.get(id) || null; }

  /** Living zombie standing on tile (x, y), or null. */
  at(x, y) {
    for (let i = 0; i < this.list.length; i++) {
      const r = this.list[i].rec;
      if (Math.floor(r.x) === x && Math.floor(r.y) === y) return this.list[i];
    }
    return null;
  }

  /** Per-frame AI and sprite sync. */
  update(dt) {
    const { scene, env } = this;
    const h = scene.state.hero;
    env.heroActive = !scene.dead && !scene.gameOver;
    env.heroX = h.x;
    env.heroY = h.y;
    env.heroRunning = !!scene.run;
    env.heroCreeping = !!scene.creeping;
    env.heroLight = scene.world.light[Math.floor(h.y) * scene.world.width + Math.floor(h.x)] ?? 'dim';
    const recs = this.records;
    recs.length = this.list.length;
    for (let i = 0; i < this.list.length; i++) recs[i] = this.list[i].rec;
    fillOccupancy(env, recs);
    for (let i = 0; i < this.list.length; i++) {
      const rt = this.list[i];
      const flags = stepIsoZombie(rt.rec, rt.ai, env, dt);
      if (flags & STEP_AGGRO) scene.onZombieAggro(rt, false);
      if (flags & STEP_DOORHIT) scene.onZombieDoorHit(rt, env.doorHit);
      if (flags & STEP_ATTACK) scene.onZombieBite(rt, this.cfg.types[rt.rec.type].damage);
      scene.actors.syncZombie(rt, dt);
    }
  }

  /** A noise on the floor: aggro the zombies it reaches (through walls). @param {{x:number,y:number,radius:number}} n tile units */
  onNoise(n) {
    for (const rt of this.list) {
      if (hearIsoNoise(rt.rec, rt.ai, n, this.cfg.tune)) this.scene.onZombieAggro(rt, true);
    }
  }

  /** A hero weapon hit. @returns {boolean} killed */
  hurt(rt, damage, small) {
    const { scene } = this;
    const killed = hitIsoZombie(rt.rec, rt.ai, damage, this.cfg.tune, scene.state.hero.x, scene.state.hero.y);
    scene.actors.hitFx(rt, scene.state.hero.x, scene.state.hero.y, small, wantsDecal(killed));
    if (killed) {
      this.kill(rt);
      if (Math.random() < HIT_FX.dripChance) scene.time.delayedCall(HIT_FX.dripDelayMs, () => playSfx(scene, 'blood_drip', { volume: HIT_FX.dripVolume }));
    }
    return killed;
  }

  kill(rt) {
    rt.dying = true;
    rt.rec.dead = true;
    this.scene.actors.die(rt, (this.cfg.tune.corpseSeconds ?? 1.5) * 1000);
    playSfx(this.scene, 'zombie_death');
    const i = this.list.indexOf(rt);
    if (i >= 0) this.list.splice(i, 1);
    this.byId.delete(rt.rec.id);
    this.scene.onZombieKilled(rt);
  }

  /** App hidden: everyone walks back to their spawn tile and calms down (hp kept). */
  resetAll() {
    for (const rt of this.list) resetIsoZombie(rt.rec, rt.ai);
  }
}
