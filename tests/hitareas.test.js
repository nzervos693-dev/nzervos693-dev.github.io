import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { makeTower } from './helpers/tower.js';
import { hitBox, pickTarget, WALK_SLAB_PX } from '../src/gameplay/hitAreas.js';
import { floorLineY, tapFloorAtY, floorAtY, WALL_LIFT } from '../src/gameplay/layout.js';
import { atHome, homeSpots } from '../src/gameplay/buildSpots.js';
import { createGameState } from '../src/gameplay/gameState.js';
import { spawnDueWanderers } from '../src/gameplay/wanderers.js';
import { makeZombie, makeAi, stepZombie, zombieTuning } from '../src/gameplay/zombies.js';
import { seededRng } from '../src/gameplay/rng.js';

const cfg = { minWidth: balance.controls.minHitAreaPx, wallLift: WALL_LIFT };
const LINE = 1000;
const chair = { id: 'chair', x: 500, w: 48, h: 48, wall: false };
const fridge = { id: 'fridge', x: 700, w: 96, h: 96, wall: false };
const cupboard = { id: 'cupboard', x: 700, w: 96, h: 96, wall: true };
const lamp = { id: 'lamp', x: 900, w: 48, h: 48, wall: true };
const all = [chair, fridge, cupboard, lamp];

describe('hit areas (BUG-036)', () => {
  it('every target is at least 96 px wide', () => {
    const b = hitBox(chair, LINE, cfg);
    expect(b.x1 - b.x0).toBe(96);
    expect(hitBox(fridge, LINE, cfg).x1 - hitBox(fridge, LINE, cfg).x0).toBe(96);
  });
  it('a floor object takes taps only from the floor line up to its sprite top + 16', () => {
    expect(hitBox(fridge, LINE, cfg)).toMatchObject({ y1: LINE, y0: LINE - 80 });
    expect(pickTarget(all, 700, LINE - 40, LINE, cfg).id).toBe('fridge');
    expect(pickTarget(all, 700, LINE - 82, LINE, cfg)).toBeNull(); // above the trimmed band: between floor and wall objects
    expect(hitBox(chair, LINE, cfg).y0).toBe(LINE - 48); // short objects keep a 48 px band
  });
  it('a wall object takes taps only in its wall band', () => {
    expect(pickTarget(all, 700, LINE - WALL_LIFT - 50, LINE, cfg).id).toBe('cupboard');
    expect(pickTarget(all, 900, LINE - WALL_LIFT - 20, LINE, cfg).id).toBe('lamp');
    expect(pickTarget(all, 900, LINE - 20, LINE, cfg)).toBeNull(); // the floor below a lamp is open floor
  });
  it('gaps between objects, the wall above and the slab below the line are walk taps', () => {
    expect(pickTarget(all, 600, LINE - 20, LINE, cfg)).toBeNull();
    expect(pickTarget(all, 600, LINE - 120, LINE, cfg)).toBeNull();
    expect(pickTarget(all, 500, LINE + 20, LINE, cfg)).toBeNull(); // under the feet
    expect(pickTarget(all, 500, LINE + 59, LINE, cfg)).toBeNull();
  });
  it('overlapping padded boxes: the nearest centre wins', () => {
    const a = { id: 'a', x: 100, w: 48, h: 48, wall: false };
    const b = { id: 'b', x: 160, w: 48, h: 48, wall: false };
    expect(pickTarget([a, b], 120, LINE - 10, LINE, cfg).id).toBe('a');
    expect(pickTarget([a, b], 140, LINE - 10, LINE, cfg).id).toBe('b');
  });
  it('most of a floor is a walk tap: objects of the start flat leave over 30% of the length free at body height (15% before)', () => {
    const tower = makeTower(balance);
    const apt = tower.apartments.get('f15L');
    const targets = apt.objects.filter((o) => !o.door).map((o) => ({ x: o.x, w: 48, h: balance.objects[o.objectId].size === 'small' ? 48 : 96, wall: o.layer === 'wall' }));
    let free = 0;
    let n = 0;
    for (let x = 0; x <= 1440; x += 4, n++) if (!pickTarget(targets, x, LINE - 40, LINE, cfg)) free++;
    expect(free / n).toBeGreaterThan(0.3);
  });
  it('the walk zone under the floor line is 60 px tall and belongs to its own floor', () => {
    const tower = makeTower(balance);
    const line = floorLineY(tower, 15);
    expect(tapFloorAtY(tower, line + 5)).toBe(15);
    expect(tapFloorAtY(tower, line + WALK_SLAB_PX - 1)).toBe(15);
    expect(tapFloorAtY(tower, line + WALK_SLAB_PX + 1)).toBe(14);
    expect(floorAtY(tower, line + 45)).toBe(14); // the plain floor lookup would have switched floors already
  });
});

describe('home rules helpers', () => {
  const tower = makeTower(balance);
  it('atHome does not rebuild lists and still honours the cleared latch', () => {
    const s = createGameState(balance, tower, 1);
    expect(atHome(tower, s, balance, 15, 900)).toBe(true);
    expect(atHome(tower, s, balance, 15, 2000)).toBe(false);
    for (const z of Object.values(s.zombies)) if (z.floor === 15) z.dead = true;
    expect(atHome(tower, s, balance, 15, 2000)).toBe(true);
  });
  it('the workbench fixture takes the floor slot under it (x 888)', () => {
    const s = createGameState(balance, tower, 1);
    expect(homeSpots(tower, balance, s).some((x) => x.x === 888)).toBe(false);
  });
});

describe('wanderers stay in their wing', () => {
  const tower = makeTower(balance);
  it('spawned records carry the wing bounds and never cross the stairwell', () => {
    const s = createGameState(balance, tower, 1);
    s.floorStates[14] = 'Cleared';
    for (const z of Object.values(s.zombies)) if (z.floor === 14) z.dead = true;
    s.wanderAt[14] = 0;
    const rng = seededRng(4);
    spawnDueWanderers(s, tower, balance, 12 * 3600 * 1000, rng, {});
    const w = Object.values(s.zombies).filter((z) => z.id.startsWith('wander:'));
    expect(w.length).toBeGreaterThan(0);
    for (const z of w) {
      expect(z.roamMin === 0 || z.roamMin === 1680).toBe(true);
      const ai = makeAi();
      const env = { tower, doors: s.doors, heroFloor: null, heroX: 0, heroRoom: null, types: balance.zombies.types, sightRadius: 0, attackRange: 30, tune: zombieTuning(balance), rng, bounds: { min: 0, max: 0 } };
      for (let i = 0; i < 6000; i++) {
        stepZombie(z, ai, env, 0.5);
        if (z.roamMin === 0) expect(z.x).toBeLessThanOrEqual(1440);
        else expect(z.x).toBeGreaterThanOrEqual(1680);
      }
    }
  });
});
