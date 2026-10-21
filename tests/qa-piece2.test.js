import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import floorsData from '../public/data/levels/floors.json';
import { buildTower } from '../src/gameplay/layout.js';
import { createGameState } from '../src/gameplay/gameState.js';
import { pastKeepThreshold } from '../src/gameplay/salvage.js';
import {
  makeZombie, makeAi, stepZombie, hearNoise, zombieTuning, STEP_AGGRO, STEP_ATTACK,
} from '../src/gameplay/zombies.js';
import { hitZombie, burnZombie, damageHero, swingDamage, heroWeapon } from '../src/gameplay/combat.js';
import { updateFloorStates } from '../src/gameplay/floorState.js';
import { createFire, fireCovers } from '../src/gameplay/throwables.js';

const tower = buildTower(floorsData, balance);
const tune = zombieTuning(balance);
const env = (state, over = {}) => ({
  tower, doors: state.doors, heroFloor: 14, heroX: 200, heroRoom: null, types: balance.zombies.types,
  sightRadius: balance.zombies.sight.frontPx, attackRange: balance.zombies.attackRange, tune,
  rng: () => 0.5, bounds: { min: 0, max: 0 }, ...over,
});

describe('QA piece 2: edges', () => {
  it('a salvage action at exactly 50% completes (keepProgressRatio is inclusive)', () => {
    expect(pastKeepThreshold(0.4999, balance)).toBe(false);
    expect(pastKeepThreshold(0.5, balance)).toBe(true);
  });

  it('noise radius is inclusive at exactly 400 px and exclusive just beyond', () => {
    const r = balance.salvage.noiseRadius;
    const z = makeZombie('t', 'crawler', 14, 500, balance);
    const hit = (dx) => hearNoise(z, makeAi(), { floor: 14, x: 500 - dx, radius: r }, tune);
    expect(hit(r)).toBe(true);
    expect(hit(r + 0.5)).toBe(false);
  });

  it('sight radius is inclusive at exactly 180 px', () => {
    const s = createGameState(balance, tower, 0);
    const z = makeZombie('t', 'crawler', 14, 340, balance);
    const near = stepZombie(z, makeAi(-1), env(s, { heroX: 340 - balance.zombies.sight.frontPx }), 0.016);
    const far = stepZombie(z, makeAi(-1), env(s, { heroX: 340 - balance.zombies.sight.frontPx - 0.5 }), 0.016);
    expect(near & STEP_AGGRO).toBeTruthy();
    expect(far & STEP_AGGRO).toBeFalsy();
  });

  it('with no target (hero dead or on stairs) a zombie never aggros or bites', () => {
    const s = createGameState(balance, tower, 0);
    const z = makeZombie('t', 'walker', 14, 300, balance);
    const ai = makeAi();
    for (let i = 0; i < 600; i++) {
      const f = stepZombie(z, ai, env(s, { heroFloor: null, heroX: 300 }), 0.016);
      expect(f & (STEP_AGGRO | STEP_ATTACK)).toBe(0);
    }
    expect(ai.mode).not.toBe('chase');
  });

  it('a hit never revives or pushes a dead zombie, and hp never goes negative', () => {
    const z = makeZombie('t', 'crawler', 14, 300, balance);
    const ai = makeAi();
    const b = { min: 16, max: 704 };
    expect(hitZombie(z, ai, 999, 290, b, balance, tune)).toBe(true);
    expect(z.hp).toBe(0);
    expect(z.dead).toBe(true);
    expect(burnZombie(z, 50)).toBe(true);
    expect(z.hp).toBe(0);
  });

  it('bites never heal and never take health below 0', () => {
    const n = { health: 3 };
    expect(damageHero(n, 8)).toEqual({ damage: 8, dead: true });
    expect(n.health).toBe(0);
    expect(damageHero({ health: 50 }, -5).damage).toBe(0);
  });

  it('every weapon row in balance.json matches the GDD table and swingDamage', () => {
    const gdd = { fists: [5, 40, 0.4, null], kitchen_knife: [10, 45, 0.35, 40], spiked_bat: [14, 55, 0.5, 50] };
    const needs = { energy: 100, morale: 60 };
    for (const [id, [dmg, range, cd, dur]] of Object.entries(gdd)) {
      const w = balance.combat.weapons[id];
      expect([w.damage, w.rangePx, w.cooldownSeconds, w.durability]).toEqual([dmg, range, cd, dur]);
      const state = { inventory: [{ id, qty: 1, uses: dur }], equipped: id === 'fists' ? null : { slot: 0, id } };
      expect(swingDamage(heroWeapon(state, balance), needs, balance)).toBe(dmg);
    }
  });

  it('weapon reach always exceeds the zombie attack range so the hero can hit first', () => {
    for (const w of Object.values(balance.combat.weapons)) expect(w.rangePx).toBeGreaterThan(balance.zombies.attackRange);
  });

  it('high morale adds +10%, low morale -20%, low energy -30%, stacked', () => {
    const fists = { damage: 10 };
    expect(swingDamage(fists, { energy: 100, morale: 80 }, balance)).toBe(11);
    expect(swingDamage(fists, { energy: 100, morale: 10 }, balance)).toBe(8);
    expect(swingDamage(fists, { energy: 10, morale: 10 }, balance)).toBe(6);
    expect(swingDamage({ damage: 1 }, { energy: 10, morale: 10 }, balance)).toBe(1);
  });

  it('a fire patch covers exactly +-60 px around its centre', () => {
    const f = createFire(16, 300, balance);
    expect(fireCovers(f, 240)).toBe(true);
    expect(fireCovers(f, 360)).toBe(true);
    expect(fireCovers(f, 239.5)).toBe(false);
    expect(fireCovers(f, 360.5)).toBe(false);
  });

  it('a molotov (4 s x 15/s = 60 dmg) kills every zombie type that stays inside', () => {
    const total = balance.molotov.seconds * balance.molotov.zombieDps;
    for (const t of Object.values(balance.zombies.types)) expect(total).toBeGreaterThanOrEqual(t.hp);
  });

  it('the hero standing in a whole molotov takes 40 damage, not a death sentence at full health', () => {
    expect(balance.molotov.seconds * balance.molotov.heroDps).toBeLessThan(balance.needs.health.start);
  });

  it('killing the last zombie of a floor with all containers searched clears it exactly once', () => {
    const s = createGameState(balance, tower, 0);
    for (const z of Object.values(s.zombies)) if (z.floor === 14) z.dead = true;
    for (const [id, e] of tower.objects) {
      if (e.floor === 14 && balance.objects[e.placement.objectId]?.primary?.type === 'search') s.objects[id] = { searched: true };
    }
    expect(updateFloorStates(tower, s, balance, 5)).toEqual([14]);
    expect(updateFloorStates(tower, s, balance, 6)).toEqual([]);
    expect(s.floorStates[14]).toBe('Cleared');
  });
});
