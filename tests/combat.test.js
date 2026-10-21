import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { towerData, makeTower } from './helpers/tower.js';
import { seededRng } from '../src/gameplay/rng.js';
import { createGameState, normalizeGameState } from '../src/gameplay/gameState.js';
import { addItem } from '../src/gameplay/inventory.js';
import { catchUp } from '../src/gameplay/offline.js';
import { heroCtx } from '../src/gameplay/gameState.js';
import {
  makeZombie, makeAi, stepZombie, hearNoise, movementBounds, barrierBetween, initZombies, countAlive,
  resetZombie, zombieTuning, sightRadius, STEP_ATTACK, STEP_AGGRO,
} from '../src/gameplay/zombies.js';
import {
  heroWeapon, equipSlot, unequip, isEquipped, swingDamage, damageMult, spendWeaponUse, spendSwingEnergy,
  hitZombie, burnZombie, damageHero, inReach,
} from '../src/gameplay/combat.js';
import { floorProgress, updateFloorStates } from '../src/gameplay/floorState.js';
import { spawnDueWanderers, wanderIntervalMs, pickSpawnX, dropLostWanderTime } from '../src/gameplay/wanderers.js';
import { throwableIds, cycleArm, checkThrow, createFire, stepFire, fireCovers } from '../src/gameplay/throwables.js';
import { livingSurvivors, gameOverStats, daysSurvived } from '../src/gameplay/death.js';

const tower = makeTower(balance);
const tune = zombieTuning(balance);
const fresh = () => createGameState(balance, tower, 1000);
const rngFixed = (v) => () => v;

/** Shared per-frame context like Zombies.update builds it. */
const makeEnv = (state, over = {}) => ({
  tower, doors: state.doors, heroFloor: 14, heroX: 200, heroRoom: null, types: balance.zombies.types,
  sightRadius: balance.zombies.sight.frontPx, attackRange: balance.zombies.attackRange, tune,
  rng: rngFixed(0.5), bounds: { min: 0, max: 0 }, ...over,
});

const authored = (floor) => [...tower.apartments.values()].filter((a) => floor == null || a.floor === floor).reduce((n, a) => n + (a.zombies || []).length, 0); // follows tower_m2.json

describe('zombie records', () => {
  it('spawns every authored zombie with full hp, once', () => {
    const s = fresh();
    expect(Object.keys(s.zombies)).toHaveLength(authored());
    expect(s.zombies['f14L-z2']).toMatchObject({ type: 'crawler', floor: 14, x: 370, hp: 20, dead: false });
    expect(s.zombies['f13R-z2']).toMatchObject({ type: 'walker', hp: 45 });
    expect(countAlive(s, 13)).toBe(authored(13));
    expect(countAlive(s, 15)).toBe(1);
  });

  it('keeps dead and damaged zombies across a reload and drops removed ones', () => {
    const s = fresh();
    s.zombies['f14L-z2'].dead = true;
    s.zombies['f16L-z1'].hp = 4;
    s.zombies['ghost#9'] = makeZombie('ghost#9', 'crawler', 14, 300, balance);
    s.zombies['wander:1'] = makeZombie('wander:1', 'walker', 14, 500, balance, { roam: true });
    const again = normalizeGameState(JSON.parse(JSON.stringify(s)), balance, tower, 2000);
    expect(again.zombies['f14L-z2'].dead).toBe(true);
    expect(again.zombies['f16L-z1'].hp).toBe(4);
    expect(again.zombies['ghost#9']).toBeUndefined();
    expect(again.zombies['wander:1'].roam).toBe(true);
    expect(initZombies(again, tower, balance)['f13L-z1'].dead).toBe(false);
  });

  it('migrates an old save without zombies', () => {
    const s = fresh();
    delete s.zombies;
    delete s.equipped;
    const again = normalizeGameState(s, balance, tower, 2000);
    expect(Object.keys(again.zombies)).toHaveLength(authored());
    expect(again.stats.zombiesKilled).toBe(0);
  });
});

describe('zombie AI', () => {
  it('notices the hero within the sight radius on the same floor', () => {
    const s = fresh();
    const z = makeZombie('t', 'walker', 14, 400, balance);
    const ai = makeAi(-1); // facing the hero (left)
    const flags = stepZombie(z, ai, makeEnv(s, { heroX: 400 - balance.zombies.sight.frontPx + 5 }), 0.1);
    expect(flags & STEP_AGGRO).toBeTruthy();
    expect(ai.mode).toBe('chase');
  });

  it('ignores a hero outside the radius, on another floor, or on the stairs', () => {
    const s = fresh();
    const far = makeEnv(s, { heroX: 400 - balance.zombies.sight.frontPx - 20 });
    let ai = makeAi();
    expect(stepZombie(makeZombie('a', 'walker', 14, 400, balance), ai, far, 0.1) & STEP_AGGRO).toBe(0);
    ai = makeAi();
    expect(stepZombie(makeZombie('b', 'walker', 14, 400, balance), ai, makeEnv(s, { heroFloor: 15, heroX: 395 }), 0.1)).toBe(0);
    ai = makeAi();
    expect(stepZombie(makeZombie('c', 'walker', 14, 400, balance), ai, makeEnv(s, { heroFloor: null, heroX: 395 }), 0.1)).toBe(0);
    expect(ai.mode).not.toBe('chase');
  });

  it('entering a room does not wake anyone: sight radius is 110 on the landing, 180 in a room', () => {
    const s = fresh();
    const z = makeZombie('r', 'crawler', 16, 100, balance);
    expect(sightRadius(tower, 16, 1560, balance)).toBe(balance.zombies.sight.dimFrontPx); // the stairwell landing
    expect(sightRadius(tower, 16, 900, balance)).toBe(balance.zombies.sight.frontPx); // stage 2: every room counts as Grey
    const far = stepZombie(z, makeAi(-1), makeEnv(s, { heroFloor: 16, heroX: 100 - 120, sightRadius: 110 }), 0.1);
    expect(far & STEP_AGGRO).toBe(0);
    const near = stepZombie(z, makeAi(-1), makeEnv(s, { heroFloor: 16, heroX: 100 - 100, sightRadius: 110 }), 0.1);
    expect(near & STEP_AGGRO).toBeTruthy();
  });

  it('a jammed door blocks sight and movement in both directions', () => {
    const s = fresh(); // f13L front door is jammed (x 1440); its bedroom door at x 240 too
    expect(barrierBetween(tower, s.doors, 13, 1300, 1600)).toBe(true);
    expect(barrierBetween(tower, s.doors, 13, 1450, 1600)).toBe(false);
    expect(barrierBetween(tower, s.doors, 13, 300, 100)).toBe(true); // Mara's interior door
    const z = makeZombie('j', 'crawler', 13, 1300, balance);
    const ai = makeAi();
    expect(stepZombie(z, ai, makeEnv(s, { heroFloor: 13, heroX: 1560 }), 0.1) & STEP_AGGRO).toBe(0);
    // noise still alerts it, but it cannot pass the door
    expect(hearNoise(z, ai, { floor: 13, x: 1560, radius: Infinity }, tune)).toBe(true);
    for (let i = 0; i < 4000; i++) stepZombie(z, ai, makeEnv(s, { heroFloor: 13, heroX: 1560 }), 0.05);
    expect(z.x).toBeLessThan(1440);
    expect(z.x).toBeCloseTo(1440 - 12, 0);
    const b = movementBounds(tower, s.doors, 13, 1600, { min: 0, max: 0 });
    expect(b.min).toBe(1440 + 12);
  });

  it('noise reaches same-floor zombies in radius only; loud is the whole floor, never other floors', () => {
    const z = makeZombie('n', 'walker', 14, 600, balance);
    expect(hearNoise(z, makeAi(), { floor: 14, x: 100, radius: balance.salvage.noiseRadius }, tune)).toBe(false);
    expect(hearNoise(z, makeAi(), { floor: 14, x: 300, radius: balance.salvage.noiseRadius }, tune)).toBe(true);
    expect(hearNoise(z, makeAi(), { floor: 14, x: 0, radius: Infinity }, tune)).toBe(true);
    expect(hearNoise(z, makeAi(), { floor: 15, x: 600, radius: Infinity }, tune)).toBe(false);
    const dead = makeZombie('d', 'walker', 14, 600, balance);
    dead.dead = true;
    expect(hearNoise(dead, makeAi(), { floor: 14, x: 600, radius: Infinity }, tune)).toBe(false);
  });

  it('chases at its speed, then bites once per attack interval after the windup', () => {
    const s = fresh();
    const z = makeZombie('w', 'walker', 14, 340, balance);
    const ai = makeAi(-1);
    const env = makeEnv(s, { heroX: 250 });
    const dt = 0.05;
    let t = 0;
    let bites = [];
    while (t < 8) {
      const f = stepZombie(z, ai, env, dt);
      t += dt;
      if (f & STEP_ATTACK) bites.push(t);
    }
    expect(z.x).toBeLessThan(250 + balance.zombies.attackRange);
    expect(bites.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < bites.length; i++) {
      expect(bites[i] - bites[i - 1]).toBeCloseTo(balance.zombies.types.walker.attackIntervalSeconds, 1);
    }
    // zombies deal damage only inside attackRange
    expect(Math.abs(z.x - 250)).toBeLessThanOrEqual(balance.zombies.attackRange);
  });

  it('is frame-rate independent: 30 fps and 120 fps cover the same distance', () => {
    const s = fresh();
    const run = (dt) => {
      const z = makeZombie('f', 'crawler', 14, 600, balance);
      const ai = makeAi();
      ai.mode = 'chase';
      ai.cd = 99;
      const env = makeEnv(s, { heroFloor: 14, heroX: 100 });
      env.doors = {};
      for (let i = 0; i < Math.round(4 / dt); i++) stepZombie(z, ai, env, dt);
      return z.x;
    };
    expect(run(1 / 30)).toBeCloseTo(run(1 / 120), 0);
    expect(run(1 / 60)).toBeCloseTo(600 - 4 * balance.zombies.types.crawler.speed, 0);
  });

  it('walks home when the hero leaves the floor and stays on its floor', () => {
    const s = fresh();
    const z = makeZombie('h', 'walker', 16, 400, balance);
    z.x = 330;
    const ai = makeAi();
    ai.mode = 'chase';
    for (let i = 0; i < 600; i++) stepZombie(z, ai, makeEnv(s, { heroFloor: 15, heroX: 330 }), 0.1);
    expect(z.floor).toBe(16);
    expect(ai.mode).toBe('idle');
    expect(z.x).toBeCloseTo(400, 0);
  });

  it('hit stun freezes it briefly; resetZombie sends it home calm with hp kept', () => {
    const s = fresh();
    const z = makeZombie('s', 'walker', 14, 300, balance);
    z.x = 350;
    z.hp = 12;
    const ai = makeAi();
    ai.mode = 'chase';
    ai.stun = 0.25;
    const before = z.x;
    stepZombie(z, ai, makeEnv(s, { heroX: 100 }), 0.1);
    expect(z.x).toBe(before);
    resetZombie(z, ai);
    expect(z.x).toBe(300);
    expect(z.hp).toBe(12);
    expect(ai.mode).toBe('idle');
  });

  it('idle zombies only sway around home, roamers cross the floor', () => {
    const s = fresh();
    const z = makeZombie('i', 'crawler', 14, 340, balance);
    const ai = makeAi();
    const rng = seededRng(7);
    const env = makeEnv(s, { heroFloor: 15, rng });
    env.heroFloor = 14;
    env.heroX = 10; // far, and behind the stairwell
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < 4000; i++) { stepZombie(z, ai, env, 0.1); lo = Math.min(lo, z.x); hi = Math.max(hi, z.x); }
    expect(lo).toBeGreaterThanOrEqual(340 - tune.wanderRadiusPx - 1);
    expect(hi).toBeLessThanOrEqual(340 + tune.wanderRadiusPx + 1);
    const r = makeZombie('r', 'walker', 13, 500, balance, { roam: true });
    const rai = makeAi();
    let spread = 0;
    let rlo = Infinity;
    let rhi = -Infinity;
    const renv = makeEnv(s, { heroFloor: 13, heroX: 10, rng: seededRng(3), doors: {} });
    for (let i = 0; i < 20000; i++) { stepZombie(r, rai, renv, 0.1); rlo = Math.min(rlo, r.x); rhi = Math.max(rhi, r.x); }
    spread = rhi - rlo;
    expect(spread).toBeGreaterThan(200);
  });
});

describe('weapons and swings', () => {
  it('fists are the default and never break', () => {
    const s = fresh();
    const w = heroWeapon(s, balance);
    expect(w).toMatchObject({ id: 'fists', damage: 5, range: 40, cooldown: 0.4, slot: -1 });
    expect(spendWeaponUse(s, balance)).toBeNull();
  });

  it('equips a weapon from its bag slot; the weapon stays in the slot', () => {
    const s = fresh();
    addItem(s.inventory, 'wood', 3, balance);
    addItem(s.inventory, 'kitchen_knife', 1, balance);
    expect(equipSlot(s, 0, balance)).toBe(false); // wood is not a weapon
    expect(equipSlot(s, 1, balance)).toBe(true);
    expect(heroWeapon(s, balance)).toMatchObject({ id: 'kitchen_knife', damage: 10, range: 45, cooldown: 0.35, uses: 40, slot: 1 });
    expect(isEquipped(s, 1)).toBe(true);
    expect(s.inventory[1].id).toBe('kitchen_knife');
    unequip(s);
    expect(heroWeapon(s, balance).id).toBe('fists');
  });

  it('falls back to fists when the equipped weapon leaves its slot', () => {
    const s = fresh();
    addItem(s.inventory, 'spiked_bat', 1, balance);
    equipSlot(s, 0, balance);
    s.inventory[0] = null; // stored or dropped
    expect(heroWeapon(s, balance).id).toBe('fists');
    expect(s.equipped).toBeNull();
    addItem(s.inventory, 'kitchen_knife', 1, balance); // lands in slot 0
    expect(heroWeapon(s, balance).id).toBe('fists'); // not auto-equipped
  });

  it('durability counts hits and the weapon breaks back to fists', () => {
    const s = fresh();
    addItem(s.inventory, 'kitchen_knife', 1, balance);
    equipSlot(s, 0, balance);
    s.inventory[0].uses = 2;
    expect(spendWeaponUse(s, balance)).toEqual({ broke: false, id: 'kitchen_knife' });
    expect(spendWeaponUse(s, balance)).toEqual({ broke: true, id: 'kitchen_knife' });
    expect(s.inventory[0]).toBeNull();
    expect(heroWeapon(s, balance).id).toBe('fists');
  });

  it('applies the need modifiers to damage', () => {
    const n = { energy: 100, morale: 60 };
    expect(damageMult(n, balance)).toBe(1);
    expect(damageMult({ energy: 10, morale: 60 }, balance)).toBeCloseTo(0.7);
    expect(damageMult({ energy: 100, morale: 10 }, balance)).toBeCloseTo(0.8);
    expect(damageMult({ energy: 100, morale: 90 }, balance)).toBeCloseTo(1.1);
    expect(damageMult({ energy: 10, morale: 10 }, balance)).toBeCloseTo(0.56);
    const fists = { damage: 5 };
    expect(swingDamage(fists, { energy: 10, morale: 10 }, balance)).toBe(3);
    expect(swingDamage({ damage: 1 }, { energy: 10, morale: 10 }, balance)).toBe(1);
  });

  it('a swing costs energyPerSwing, never below 0', () => {
    const needs = { energy: 1 };
    spendSwingEnergy(needs, balance);
    expect(needs.energy).toBe(0.5);
    spendSwingEnergy(needs, balance);
    spendSwingEnergy(needs, balance);
    expect(needs.energy).toBe(0);
  });

  it('knocks back, stuns and aggros; kills at 0 hp; walls stop the knockback', () => {
    const z = makeZombie('k', 'walker', 14, 300, balance);
    const ai = makeAi();
    const bounds = { min: 0, max: 700 };
    expect(hitZombie(z, ai, 10, 250, bounds, balance, tune)).toBe(false);
    expect(z.hp).toBe(35);
    expect(z.x).toBe(300 + balance.combat.knockbackPx);
    expect(ai.stun).toBe(tune.hitStunSeconds);
    expect(ai.mode).toBe('chase');
    const left = makeZombie('l', 'walker', 14, 300, balance);
    hitZombie(left, makeAi(), 1, 350, bounds, balance, tune);
    expect(left.x).toBe(300 - balance.combat.knockbackPx);
    const wall = makeZombie('w', 'walker', 14, 5, balance);
    hitZombie(wall, makeAi(), 1, 100, { min: 0, max: 700 }, balance, tune);
    expect(wall.x).toBe(0);
    expect(hitZombie(z, ai, 99, 250, bounds, balance, tune)).toBe(true);
    expect(z.dead).toBe(true);
  });

  it('fire damage kills without knockback', () => {
    const z = makeZombie('f', 'crawler', 14, 300, balance);
    expect(burnZombie(z, 19)).toBe(false);
    expect(z.x).toBe(300);
    expect(burnZombie(z, 1)).toBe(true);
    expect(z.dead).toBe(true);
  });

  it('range check and hero damage', () => {
    expect(inReach(100, 140, 40)).toBe(true);
    expect(inReach(100, 141, 40)).toBe(false);
    const needs = { health: 10 };
    expect(damageHero(needs, 8)).toEqual({ damage: 8, dead: false });
    expect(damageHero(needs, 8)).toEqual({ damage: 8, dead: true });
    expect(needs.health).toBe(0);
  });

  it('crawler dies to 4 fist hits, walker to 9', () => {
    const hits = (type, dmg) => {
      const z = makeZombie('x', type, 14, 300, balance);
      let n = 0;
      while (!z.dead) { hitZombie(z, makeAi(), dmg, 250, { min: 0, max: 700 }, balance, tune); n++; }
      return n;
    };
    expect(hits('crawler', 5)).toBe(4);
    expect(hits('walker', 5)).toBe(9);
  });
});

describe('floor states', () => {
  const kill = (s, floor) => { for (const z of Object.values(s.zombies)) if (z.floor === floor) z.dead = true; };
  const searchAll = (s, floor) => {
    for (const [id, e] of tower.objects) {
      if (e.floor !== floor || e.quest) continue;
      if (balance.objects[e.placement.objectId]?.primary?.type === 'search') s.objects[id] = { searched: true };
    }
  };

  it('starts Infested; M2 Cleared = no living zombies (containers need not be searched)', () => {
    const s = fresh();
    expect(s.floorStates[14]).toBe('Infested');
    expect(updateFloorStates(tower, s, balance, 5000)).toEqual([]);
    const [first, ...rest] = Object.values(s.zombies).filter((z) => z.floor === 14);
    for (const z of rest) z.dead = true;
    expect(updateFloorStates(tower, s, balance, 5000)).toEqual([]); // one still lives
    first.dead = true;
    expect(floorProgress(tower, s, balance, 14)).toEqual({ zombies: 0, clear: true });
    expect(updateFloorStates(tower, s, balance, 5000)).toEqual([14]);
    expect(s.floorStates[14]).toBe('Cleared');
    expect(s.wanderAt[14]).toBe(5000 + wanderIntervalMs(balance));
  });

  it('never goes back to Infested and leaves Secured alone', () => {
    const s = fresh();
    kill(s, 14);
    searchAll(s, 14);
    updateFloorStates(tower, s, balance, 0);
    s.zombies['wander:1'] = makeZombie('wander:1', 'walker', 14, 500, balance);
    expect(updateFloorStates(tower, s, balance, 1)).toEqual([]);
    expect(s.floorStates[14]).toBe('Cleared');
    s.floorStates[16] = 'Secured';
    kill(s, 16);
    searchAll(s, 16);
    expect(updateFloorStates(tower, s, balance, 1)).toEqual([]);
    expect(s.floorStates[16]).toBe('Secured');
  });

  it('a dismantled container counts as searched', () => {
    const s = fresh();
    kill(s, 16);
    for (const [id, e] of tower.objects) {
      if (e.floor === 16 && balance.objects[e.placement.objectId]?.primary?.type === 'search') s.objects[id] = { dismantled: true };
    }
    expect(floorProgress(tower, s, balance, 16).clear).toBe(true);
  });
});

describe('wanderers', () => {
  const clearedState = (at = 0) => {
    const s = fresh();
    s.floorStates[14] = 'Cleared';
    for (const z of Object.values(s.zombies)) if (z.floor === 14) z.dead = true;
    s.wanderAt[14] = at + wanderIntervalMs(balance);
    return s;
  };

  it('arrive every 12 h on Cleared floors, 1-2 walkers, roaming', () => {
    const s = clearedState(0);
    const interval = wanderIntervalMs(balance);
    expect(interval).toBe(12 * 3600 * 1000);
    expect(spawnDueWanderers(s, tower, balance, interval - 1, rngFixed(0))).toHaveLength(0);
    const made = spawnDueWanderers(s, tower, balance, interval, rngFixed(0));
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ type: 'walker', floor: 14, roam: true, dead: false, hp: 45 });
    expect(made[0].id).toBe('wander:1');
    expect(s.zombies['wander:1']).toBe(made[0]);
    expect(s.wanderAt[14]).toBe(2 * interval);
    const more = spawnDueWanderers(s, tower, balance, 2 * interval, rngFixed(0.99));
    expect(more).toHaveLength(2);
  });

  it('does not touch Infested or Secured floors', () => {
    const s = clearedState(0);
    s.floorStates[14] = 'Secured';
    expect(spawnDueWanderers(s, tower, balance, 99 * 3600 * 1000, rngFixed(0))).toHaveLength(0);
    s.floorStates[14] = 'Infested';
    expect(spawnDueWanderers(s, tower, balance, 99 * 3600 * 1000, rngFixed(0))).toHaveLength(0);
  });

  it('starts the timer for a Cleared floor without one', () => {
    const s = fresh();
    s.floorStates[16] = 'Cleared';
    expect(spawnDueWanderers(s, tower, balance, 1000, rngFixed(0))).toHaveLength(0);
    expect(s.wanderAt[16]).toBe(1000 + wanderIntervalMs(balance));
  });

  it('caps the living wanderers per floor', () => {
    const s = clearedState(0);
    for (let k = 1; k <= 10; k++) spawnDueWanderers(s, tower, balance, k * wanderIntervalMs(balance), rngFixed(0.99));
    expect(countAlive(s, 14)).toBeLessThanOrEqual(tune.maxWanderersPerFloor);
  });

  it('keeps away from the hero when he is on that floor', () => {
    const rng = seededRng(5);
    for (let i = 0; i < 50; i++) {
      const x = pickSpawnX(rng, tower, 14, { floor: 14, x: 300 }, 200);
      expect(Math.abs(x - 300)).toBeGreaterThanOrEqual(200);
      expect(x < tower.stairwell.xMin || x > tower.stairwell.xMax).toBe(true); // never on the landing
    }
  });

  it('spawns during offline catch-up steps (stepHooks) and is deterministic with a seeded rng', () => {
    const run = () => {
      const s = clearedState(0);
      const sim = { needs: { ...s.needs }, stockpile: s.stockpile, ctx: heroCtx(s, balance) };
      const hook = (_sim, _sec, atMs) => spawnDueWanderers(s, tower, balance, atMs, seededRng(11));
      catchUp(sim, 30 * 3600 * 1000, balance, { startMs: 0, stepHooks: [hook] });
      return Object.keys(s.zombies).filter((k) => k.startsWith('wander:')).map((k) => s.zombies[k].floor);
    };
    const a = run();
    expect(a.length).toBeGreaterThanOrEqual(2); // 2 intervals in 30 h
    expect(run()).toEqual(a);
  });
});

describe('throwing', () => {
  it('lists carried throwables and cycles: first, next, past the last = off', () => {
    const slots = fresh().inventory;
    expect(throwableIds(slots, balance)).toEqual([]);
    expect(cycleArm(null, [])).toBeNull();
    addItem(slots, 'molotov', 3, balance);
    addItem(slots, 'wood', 1, balance);
    expect(throwableIds(slots, balance)).toEqual(['molotov']);
    expect(cycleArm(null, ['molotov'])).toBe('molotov');
    expect(cycleArm('molotov', ['molotov'])).toBeNull();
    expect(cycleArm(null, ['molotov', 'lure'])).toBe('molotov');
    expect(cycleArm('molotov', ['molotov', 'lure'])).toBe('lure');
    expect(cycleArm('lure', ['molotov', 'lure'])).toBeNull();
  });

  it('a throw needs the same floor and the range from balance.throw', () => {
    const r = balance.throw.rangePx;
    const hero = { floor: 15, x: 300 };
    expect(checkThrow(hero, { floor: 15, x: 300 + r }, r, 720).ok).toBe(true);
    expect(checkThrow(hero, { floor: 15, x: 300 + r + 1 }, r, 720).ok).toBe(false);
    expect(checkThrow(hero, { floor: 16, x: 300 }, r, 720).ok).toBe(false);
    expect(checkThrow(hero, { floor: null, x: 300 }, r, 720).ok).toBe(false);
  });

  it('a fire patch is 120 px wide for 4 s', () => {
    const f = createFire(14, 400, balance);
    expect(f).toMatchObject({ w: 120, left: 4, zdps: 15, hdps: 10 });
    expect(fireCovers(f, 460)).toBe(true);
    expect(fireCovers(f, 461)).toBe(false);
    let alive = true;
    let t = 0;
    while (alive) { alive = stepFire(f, 0.1); t += 0.1; }
    expect(t).toBeCloseTo(4, 0);
  });

  it('fire kills a crawler in about 1.4 s and a walker in 3 s', () => {
    const secondsToKill = (type) => {
      const z = makeZombie('f', type, 14, 400, balance);
      let t = 0;
      while (!z.dead) { burnZombie(z, balance.molotov.zombieDps * 0.05); t += 0.05; }
      return t;
    };
    expect(secondsToKill('crawler')).toBeCloseTo(20 / balance.molotov.zombieDps, 1);
    expect(secondsToKill('walker')).toBeCloseTo(45 / balance.molotov.zombieDps, 1);
  });
});

describe('death and game over', () => {
  it('lists only recruited, living survivors', () => {
    const s = fresh();
    expect(livingSurvivors(s)).toEqual([]);
    s.survivors = { mara: { recruited: true }, bob: { recruited: false }, eve: { recruited: true, dead: true } };
    expect(livingSurvivors(s)).toEqual(['mara']);
  });

  it('counts days and the game over stats', () => {
    const s = fresh();
    s.stats.zombiesKilled = 7;
    s.stats.objectsSalvaged = 4;
    s.floorStates[14] = 'Cleared';
    s.floorStates[16] = 'Secured';
    const day = 24 * 3600 * 1000;
    expect(daysSurvived(s, 1000 + day * 2.5)).toBe(2);
    expect(gameOverStats(s, 1000 + day)).toEqual({ days: 1, floors: 2, zombies: 7, salvaged: 4 });
  });
});

describe('review fixes', () => {
  it('wanderers never spawn inside the home apartment, even with the hero away', () => {
    const rng = seededRng(21);
    for (let i = 0; i < 300; i++) {
      const x = pickSpawnX(rng, tower, tower.homeFloor, null, 200);
      expect(x < tower.home.xMin || x > tower.home.xMax).toBe(true);
      expect(x).toBeGreaterThan(tower.stairwell.xMax);
    }
    for (let i = 0; i < 100; i++) {
      const x = pickSpawnX(rng, tower, tower.homeFloor, { floor: tower.homeFloor, x: 450 }, 200);
      expect(x > tower.home.xMax || x < tower.home.xMin).toBe(true);
    }
  });

  it('offline catch-up with the home spot as hero keeps wanderers out of home', () => {
    const s = fresh();
    s.floorStates[15] = 'Cleared';
    for (const z of Object.values(s.zombies)) if (z.floor === 15) z.dead = true;
    s.wanderAt[15] = 0;
    const home = { floor: 15, x: 200 };
    for (let k = 1; k <= 20; k++) spawnDueWanderers(s, tower, balance, k * wanderIntervalMs(balance), seededRng(k), { hero: home });
    const made = Object.values(s.zombies).filter((z) => z.id.startsWith('wander:') && z.floor === 15);
    expect(made.length).toBeGreaterThan(0);
    for (const z of made) expect(z.x < tower.home.xMin || z.x > tower.home.xMax).toBe(true);
  });

  it('time beyond the offline cap is lost: overdue wander timers restart', () => {
    const s = fresh();
    s.wanderAt = { 14: 100, 16: 10 ** 12 };
    dropLostWanderTime(s, 5000, balance);
    expect(s.wanderAt[14]).toBe(5000 + wanderIntervalMs(balance));
    expect(s.wanderAt[16]).toBe(10 ** 12);
  });

  it('dead wanderers are pruned on load; authored and scripted dead stay', () => {
    const s = fresh();
    s.zombies['wander:1'] = { ...makeZombie('wander:1', 'walker', 14, 500, balance), dead: true };
    s.zombies['scripted:t'] = { ...makeZombie('scripted:t', 'crawler', 15, 40, balance), dead: true };
    s.zombies['f14L-z2'].dead = true;
    initZombies(s, tower, balance);
    expect(s.zombies['wander:1']).toBeUndefined();
    expect(s.zombies['scripted:t'].dead).toBe(true);
    expect(s.zombies['f14L-z2'].dead).toBe(true);
  });

  it('a record with a broken homeX falls back to the authored x; broken wanderers are dropped', () => {
    const s = fresh();
    s.zombies['f14L-z2'].homeX = null;
    s.zombies['f14L-z2'].x = 999;
    s.zombies['wander:2'] = { ...makeZombie('wander:2', 'walker', 14, 500, balance), x: NaN };
    s.zombies['wander:3'] = { ...makeZombie('wander:3', 'walker', 14, 500, balance), homeX: undefined };
    initZombies(s, tower, balance);
    expect(s.zombies['f14L-z2']).toMatchObject({ x: 370, homeX: 370 });
    expect(s.zombies['wander:2']).toBeUndefined();
    expect(s.zombies['wander:3'].homeX).toBe(500);
  });
});
