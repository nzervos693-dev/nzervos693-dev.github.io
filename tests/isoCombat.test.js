import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { Grid } from '../src/iso/grid.js';
import { shoveConfig, inShoveRange, applyShove, ShoveCooldown, createFirePatch, patchCovers, stepPatch } from '../src/gameplay/isoCombat.js';

const cfg = shoveConfig(balance);
const open = () => new Grid(10, 10);
const env = (grid, occ = () => false) => ({ grid, occupied: occ });
const ai = () => ({ mode: 'attack', stun: 0, windup: 0.5, path: [1], moving: true, noticed: false, facing: 0, unseen: 3 });

describe('shove (GDD 5.4)', () => {
  it('reads combat.shove.*', () => expect(cfg).toMatchObject({ rangeTiles: 1.5, pushTiles: 0.5, stunSeconds: 0.8, energy: 1, cooldownSeconds: 2.5 }));
  it('range is 1.5 tiles centre to centre', () => {
    expect(inShoveRange({ x: 0, y: 0 }, { x: 1.4, y: 0 }, cfg)).toBe(true);
    expect(inShoveRange({ x: 0, y: 0 }, { x: 1.6, y: 0 }, cfg)).toBe(false);
  });
  it('pushes 0.5 tiles straight away, stuns 0.8 s, cancels the wind-up, makes it aware, no damage', () => {
    const z = { x: 5.5, y: 5.5, hp: 45 };
    const a = ai();
    applyShove({ x: 4.5, y: 5.5 }, z, a, cfg, env(open()));
    expect(z.x).toBeCloseTo(6.0, 1);
    expect(z.y).toBeCloseTo(5.5, 5);
    expect(z.hp).toBe(45);
    expect(a.stun).toBe(0.8);
    expect(a.windup).toBe(0);
    expect(a.noticed).toBe(true);
    expect(a.facing).toBeCloseTo(180, 3);
  });
  it('stops early at a wall, another zombie and the floor edge', () => {
    const wall = new Grid(10, 10); wall.setEdge(6, 5, 'W', 1); // wall between x=5 and x=6
    const z = { x: 5.8, y: 5.5, hp: 1 };
    applyShove({ x: 4.8, y: 5.5 }, z, ai(), cfg, env(wall));
    expect(z.x).toBeLessThan(6);
    expect(z.x).toBeGreaterThanOrEqual(5.8);
    const z2 = { x: 5.8, y: 5.5, hp: 1 };
    applyShove({ x: 4.8, y: 5.5 }, z2, ai(), cfg, env(open(), (x, y) => x === 6 && y === 5));
    expect(z2.x).toBeLessThan(6);
    const z3 = { x: 9.8, y: 5.5, hp: 1 };
    applyShove({ x: 8.8, y: 5.5 }, z3, ai(), cfg, env(open()));
    expect(z3.x).toBeLessThan(10);
  });
  it('2.5 s cooldown, separate from the weapon', () => {
    const c = new ShoveCooldown(cfg);
    expect(c.ready).toBe(true);
    c.start(); expect(c.ready).toBe(false);
    c.step(2.4); expect(c.ready).toBe(false);
    c.step(0.2); expect(c.ready).toBe(true);
  });
  it('stun 0.8 + wind-up 0.9 is shorter than the cooldown: shoving alone cannot lock a zombie', () => {
    expect(cfg.stunSeconds + balance.zombies.tuning.attackWindupSeconds).toBeLessThan(cfg.cooldownSeconds);
  });
});

describe('molotov fire patch (GDD 5.11)', () => {
  it('covers the landing tile and its 8 neighbours for 4 s', () => {
    const p = createFirePatch(5, 5, balance.molotov);
    expect(p.tiles).toHaveLength(9);
    expect(patchCovers(p, 6, 6)).toBe(true);
    expect(patchCovers(p, 7, 5)).toBe(false);
    expect(p.zdps).toBe(15);
    expect(p.hdps).toBe(10);
    expect(stepPatch(p, 3.9)).toBe(true);
    expect(stepPatch(p, 0.2)).toBe(false);
  });
});
