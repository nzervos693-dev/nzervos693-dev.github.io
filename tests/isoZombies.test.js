import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { ascii, room, put } from './iso/helpers.js';
import {
  isoZombieConfig, makeIsoEnv, makeIsoAi, fillOccupancy, canSee, stepIsoZombie, hearIsoNoise, hitIsoZombie,
  STEP_ATTACK, STEP_AGGRO, STEP_DOORHIT, isAware,
} from '../src/gameplay/isoZombies.js';
import { makeZombie } from '../src/gameplay/zombies.js';

const cfg = isoZombieConfig(balance);
const rng = () => 0.5;
function setup(grid, zx, zy, facing, type = 'walker') {
  const z = makeZombie('z', type, 15, zx + 0.5, balance, { y: zy + 0.5, homeX: zx + 0.5, homeY: zy + 0.5, facing });
  const env = makeIsoEnv(grid, cfg, rng);
  const ai = makeIsoAi(z, rng, cfg);
  ai.pause = 99;
  env.heroActive = true;
  env.heroLight = 'grey';
  fillOccupancy(env, [z]);
  return { z, ai, env };
}
const hero = (env, x, y, run = false) => { env.heroX = x + 0.5; env.heroY = y + 0.5; env.heroRunning = run; };

describe('zombie sight', () => {
  it('sees the hero in front within range, not beyond, not behind when walking', () => {
    const g = ascii(room(12, 4));
    const { z, ai, env } = setup(g, 2, 2, 0);
    hero(env, 5, 2);
    expect(canSee(z, ai, env)).toBe(true); // 3 tiles, grey range 4
    hero(env, 8, 2);
    expect(canSee(z, ai, env)).toBe(false); // 6 tiles
    ai.facing = 180;
    hero(env, 3, 2); // 1 tile behind-ish: > 0.9
    expect(canSee(z, ai, env)).toBe(false);
    hero(env, 3, 2, true); // running: 1.5
    expect(canSee(z, ai, env)).toBe(true);
  });
  it('creeping shrinks the front range (x0.75) and the behind range (0.5 tiles)', () => {
    const g = ascii(room(12, 4));
    const { z, ai, env } = setup(g, 2, 2, 0);
    env.heroCreeping = true;
    hero(env, 5, 2); // 3 tiles: inside grey 4 x 0.75 = 3
    expect(canSee(z, ai, env)).toBe(true);
    hero(env, 6, 2); // 4 tiles: seen walking, not creeping
    expect(canSee(z, ai, env)).toBe(false);
    env.heroCreeping = false;
    expect(canSee(z, ai, env)).toBe(true);
    ai.facing = 180;
    hero(env, 2, 2); hero(env, 3, 2); // 1 tile behind
    env.heroCreeping = true;
    expect(canSee(z, ai, env)).toBe(false);
  });
  it('a closed door blocks sight, an open one does not', () => {
    const l = room(8, 3);
    put(l, 8, 3, 'D'); put(l, 8, 1, '|'); put(l, 8, 5, '|');
    const g = ascii(l);
    const { z, ai, env } = setup(g, 2, 1, 0);
    hero(env, 5, 1);
    expect(canSee(z, ai, env)).toBe(false);
    g.setDoorState(g.doorAt(4, 1, 'W'), 'open');
    expect(canSee(z, ai, env)).toBe(true);
  });
  it('dark hero tile shortens the front range', () => {
    const g = ascii(room(12, 4));
    const { z, ai, env } = setup(g, 2, 2, 0);
    env.heroLight = 'dark';
    hero(env, 5, 2);
    expect(canSee(z, ai, env)).toBe(false);
  });
});

describe('zombie behaviour', () => {
  it('notices, walks up and bites after the wind-up', () => {
    const g = ascii(room(12, 4));
    const { z, ai, env } = setup(g, 2, 2, 0);
    hero(env, 5, 2);
    let flags = 0;
    let t = 0;
    let bit = false;
    for (let i = 0; i < 600 && !bit; i++) {
      flags = stepIsoZombie(z, ai, env, 0.05);
      t += 0.05;
      if (i === 0) expect(flags & STEP_AGGRO).toBeTruthy();
      if (flags & STEP_ATTACK) bit = true;
    }
    expect(bit).toBe(true);
    expect(isAware(ai)).toBe(true);
    expect(Math.hypot(z.x - env.heroX, z.y - env.heroY)).toBeLessThanOrEqual(1.5);
    expect(t).toBeGreaterThan(0.9);
  });
  it('bangs a closed door and breaks it in about 24 s (walker, interior door)', () => {
    const l = room(8, 3);
    put(l, 8, 3, 'D'); put(l, 8, 1, '|'); put(l, 8, 5, '|');
    const g = ascii(l);
    const { z, ai, env } = setup(g, 6, 1, 180);
    hero(env, 1, 1);
    env.heroLight = 'grey';
    let hits = 0;
    let t = 0;
    for (let i = 0; i < 2000 && g.doorAt(4, 1, 'W').state !== 'broken'; i++) {
      // noise-alert it (it cannot see through the door)
      if (ai.mode === 'idle') { hearIsoNoise(z, ai, { x: 1.5, y: 1.5, radius: Infinity }, cfg.tune); ai.noticed = true; }
      const f = stepIsoZombie(z, ai, env, 0.05);
      t += 0.05;
      if (f & STEP_DOORHIT) { hits++; g.damageDoor(env.doorHit.door, env.doorHit.damage); }
      if (g.doorAt(4, 1, 'W').state !== 'closed') break;
    }
    expect(hits).toBeGreaterThan(5);
    expect(g.doorAt(4, 1, 'W').state).toBe('broken');
    expect(t).toBeGreaterThan(15);
    expect(t).toBeLessThan(40);
  });
  it('jammed doors take no damage', () => {
    const l = room(8, 3);
    put(l, 8, 3, 'J'); put(l, 8, 1, '|'); put(l, 8, 5, '|');
    const g = ascii(l);
    const { z, ai, env } = setup(g, 6, 1, 180);
    hero(env, 1, 1);
    hearIsoNoise(z, ai, { x: 1.5, y: 1.5, radius: Infinity }, cfg.tune);
    let dmg = 0; let hits = 0;
    for (let i = 0; i < 400; i++) {
      const f = stepIsoZombie(z, ai, env, 0.05);
      if (f & STEP_DOORHIT) { hits++; dmg += env.doorHit.damage; }
    }
    expect(hits).toBeGreaterThan(0);
    expect(dmg).toBe(0);
    expect(g.doorAt(4, 1, 'W').state).toBe('jammed');
  });
  it('a noise-alerted zombie is not aware; a hit makes it aware', () => {
    const g = ascii(room(12, 4));
    const { z, ai, env } = setup(g, 2, 2, 0);
    env.heroActive = false;
    expect(hearIsoNoise(z, ai, { x: 9.5, y: 2.5, radius: 20 }, cfg.tune)).toBe(true);
    expect(isAware(ai)).toBe(false);
    for (let i = 0; i < 200; i++) stepIsoZombie(z, ai, env, 0.1);
    expect(Math.floor(z.x)).toBe(9);
    hitIsoZombie(z, ai, 1, cfg.tune);
    expect(isAware(ai)).toBe(true);
  });
  it('a zombie hit from behind turns to the hero and bites back', () => {
    const g = ascii(room(12, 4));
    const { z, ai, env } = setup(g, 5, 2, 0); // facing +x, hero behind at x=4
    hero(env, 4, 2);
    expect(canSee(z, ai, env)).toBe(false); // 1 tile behind: beyond the 0.9 behind range
    hero(env, 3, 2);
    expect(canSee(z, ai, env)).toBe(false);
    hero(env, 4, 2);
    hitIsoZombie(z, ai, 5, cfg.tune, env.heroX, env.heroY);
    let bit = false;
    for (let i = 0; i < 100 && !bit; i++) bit = !!(stepIsoZombie(z, ai, env, 0.1) & STEP_ATTACK);
    expect(bit).toBe(true);
  });
  it('out of radius noise is ignored', () => {
    const g = ascii(room(12, 4));
    const { z, ai } = setup(g, 2, 2, 0);
    expect(hearIsoNoise(z, ai, { x: 11.5, y: 2.5, radius: 5 }, cfg.tune)).toBe(false);
  });
  it('loses track after 8 s unseen and goes home', () => {
    const g = ascii(room(14, 4));
    const { z, ai, env } = setup(g, 2, 2, 0);
    hero(env, 5, 2);
    stepIsoZombie(z, ai, env, 0.05);
    env.heroActive = false;
    for (let i = 0; i < 400; i++) stepIsoZombie(z, ai, env, 0.1);
    for (let i = 0; i < 600; i++) stepIsoZombie(z, ai, env, 0.1);
    expect(ai.mode).toBe('idle');
    expect(Math.floor(z.x)).toBe(2);
  });
  it('a stale path with a diagonal that a door change made illegal is dropped, not walked', () => {
    const g = ascii(room(8, 6));
    const { z, ai, env } = setup(g, 2, 2, 0);
    ai.path = [{ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 3 }];
    ai.pathI = 1;
    ai.leg = false;
    ai.mode = 'chase';
    ai.noticed = true;
    ai.last = { x: 6, y: 3 };
    g.setEdge(3, 3, 'W', 1); // a wall now stands next to the diagonal's corner
    hero(env, 7, 3);
    env.heroActive = false;
    stepIsoZombie(z, ai, env, 0.05);
    expect(Math.floor(z.x)).toBeLessThanOrEqual(2);
    expect(Math.floor(z.y)).toBe(2);
  });
  it('one zombie per tile: a second zombie waits', () => {
    const g = ascii(room(12, 3));
    const a = setup(g, 3, 1, 0);
    const z2 = makeZombie('z2', 'walker', 15, 5.5, balance, { y: 1.5, homeX: 5.5, homeY: 1.5, facing: 0 });
    const ai2 = makeIsoAi(z2, rng, cfg);
    ai2.pause = 99;
    fillOccupancy(a.env, [a.z, z2]);
    hero(a.env, 9, 1);
    for (let i = 0; i < 100; i++) { stepIsoZombie(a.z, a.ai, a.env, 0.1); }
    // z2 never moved; first zombie must not stand in its tile
    expect(Math.floor(a.z.x)).toBeLessThan(5);
  });
});
