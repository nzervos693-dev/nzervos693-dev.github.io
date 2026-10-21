import { describe, it, expect } from 'vitest';
import balance from '../../public/data/balance.json';
import { findPath, smoothPath, pathConfig, PATH_DEFAULTS } from '../../src/iso/path.js';
import { ascii, room, put } from './helpers.js';
import { Grid } from '../../src/iso/grid.js';

// two rooms side by side, wall at x=3 with a door at row 1
function twoRooms(doorChar = 'D') {
  const l = room(6, 3);
  for (const cy of [1, 3, 5]) put(l, 6, cy, '|');
  put(l, 6, 3, doorChar);
  return ascii(l);
}

describe('A*', () => {
  it('finds straight and diagonal paths with octile cost', () => {
    const g = ascii(room(8, 8));
    const r = findPath(g, { x: 0, y: 0 }, { x: 5, y: 5 });
    expect(r.found).toBe(true);
    expect(r.path.length).toBe(6);
    expect(r.cost).toBeCloseTo(5 * Math.SQRT2);
  });
  it('same tile and unwalkable goal', () => {
    const g = ascii(room(3, 3));
    expect(findPath(g, { x: 1, y: 1 }, { x: 1, y: 1 }).path.length).toBe(1);
    g.setObstacle(2, 2, true);
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 2 }).found).toBe(false);
    expect(findPath(g, { x: 0, y: 0 }, { x: 9, y: 9 }).found).toBe(false);
  });
  it('never cuts a wall corner', () => {
    const l = room(2, 2);
    put(l, 2, 1, '|'); // wall between (0,0)-(1,0)
    const g = ascii(l);
    const r = findPath(g, { x: 0, y: 0 }, { x: 1, y: 1 });
    expect(r.found).toBe(true);
    expect(r.path.length).toBe(3); // goes via (0,1), not diagonally
    expect(r.path[1]).toEqual({ x: 0, y: 1 });
  });
  it('detours around obstacle blocks and walls', () => {
    const l = room(5, 5);
    for (const cy of [3, 5, 7]) put(l, 4, cy, '|'); // wall W of x=2 on rows 1..3... rows y=1..3
    const g = ascii(l);
    const r = findPath(g, { x: 0, y: 2 }, { x: 4, y: 2 });
    expect(r.found).toBe(true);
    const cross = r.path.find((p, i) => i > 0 && r.path[i - 1].x === 1 && p.x === 2);
    expect([0, 4]).toContain(cross.y); // goes round the wall through row 0 or 4
  });
  it('hero walks through a closed door and lists it; costs extra', () => {
    const g = twoRooms('D');
    const r = findPath(g, { x: 0, y: 1 }, { x: 5, y: 1 });
    expect(r.found).toBe(true);
    expect(r.doors.length).toBe(1);
    expect(r.doors[0].locked).toBe(false);
    const open = twoRooms('d');
    const r2 = findPath(open, { x: 0, y: 1 }, { x: 5, y: 1 });
    expect(r2.doors.length).toBe(0);
    expect(r.cost).toBeCloseTo(r2.cost + 1);
  });
  it('hero cannot path through jammed door unless asked; no diagonal through door frame', () => {
    const g = twoRooms('J');
    expect(findPath(g, { x: 0, y: 1 }, { x: 5, y: 1 }).found).toBe(false);
    const r = findPath(g, { x: 0, y: 1 }, { x: 5, y: 1 }, { throughLocked: true });
    expect(r.found).toBe(true);
    expect(r.doors[0].locked).toBe(true);
    const o = twoRooms('d');
    const p = findPath(o, { x: 0, y: 0 }, { x: 5, y: 2 }).path;
    for (let i = 0; i + 1 < p.length; i++) {
      if (p[i].x === 2 && p[i + 1].x === 3) expect(p[i].y).toBe(p[i + 1].y);
    }
  });
  it('zombie treats a closed door as a +10 cost and reports it; prefers a detour when cheap', () => {
    const pc = pathConfig(balance);
    const g = twoRooms('D');
    const r = findPath(g, { x: 0, y: 1 }, { x: 5, y: 1 }, { mode: 'zombie', doorCost: pc.zombieDoorCost });
    expect(r.found).toBe(true);
    expect(r.doors.length).toBe(1);
    expect(r.cost).toBeGreaterThanOrEqual(10);
    // second, open doorway at row 0 (N edge ... use W edge of (3,0)): detour costs 2 more, so avoid the closed door
    const l = room(6, 3);
    for (const cy of [1, 3, 5]) put(l, 6, cy, '|');
    put(l, 6, 3, 'D');
    put(l, 6, 1, 'd');
    const g2 = ascii(l);
    const r2 = findPath(g2, { x: 0, y: 1 }, { x: 5, y: 1 }, { mode: 'zombie', doorCost: pc.zombieDoorCost });
    expect(r2.doors.length).toBe(0);
  });
  it('own barricade: hero squeezes through at squeeze cost, zombies bang, 0 HP lets zombies through', () => {
    const g = twoRooms('d');
    const d = g.doorAt(3, 1, 'W');
    g.setBarricade(d, { own: true, hp: 30 });
    const pc = pathConfig(balance);
    expect(pc.squeezeCost).toBeCloseTo(0.5 * balance.hero.walkTilesPerSecond);
    const open = findPath(twoRooms('d'), { x: 0, y: 1 }, { x: 5, y: 1 });
    const hero = findPath(g, { x: 0, y: 1 }, { x: 5, y: 1 }, { squeezeCost: pc.squeezeCost });
    expect(hero.found).toBe(true);
    expect(hero.doors[0].squeeze).toBe(true);
    expect(hero.cost).toBeCloseTo(open.cost + pc.squeezeCost);
    const z = findPath(g, { x: 0, y: 1 }, { x: 5, y: 1 }, { mode: 'zombie' });
    expect(z.doors.length).toBe(1);
    expect(z.doors[0].locked).toBe(false);
    expect(z.cost).toBeGreaterThanOrEqual(PATH_DEFAULTS.zombieDoorCost);
    g.damageBarricade(d, 30);
    const z2 = findPath(g, { x: 0, y: 1 }, { x: 5, y: 1 }, { mode: 'zombie' });
    expect(z2.doors.length).toBe(0);
    // someone else's barricade blocks the hero
    g.setBarricade(d, { own: false, hp: 30 });
    expect(findPath(g, { x: 0, y: 1 }, { x: 5, y: 1 }).found).toBe(false);
  });
  it('pathConfig honours doors.barricadeSqueezeSeconds and path.maxExpansions', () => {
    const b = { ...balance, doors: { ...balance.doors, barricadeSqueezeSeconds: 1 }, path: { maxExpansions: 77 } };
    const c = pathConfig(b);
    expect(c.squeezeCost).toBeCloseTo(1 * balance.hero.walkTilesPerSecond);
    expect(c.maxExpansions).toBe(77);
  });
  it('smoothing respects isBlocked', () => {
    const g = ascii(room(6, 6));
    const blocked = (x, y) => x === 2 && y === 2;
    const r = findPath(g, { x: 0, y: 0 }, { x: 5, y: 5 }, { smooth: true, isBlocked: blocked });
    for (let i = 0; i + 1 < r.waypoints.length; i++) {
      const a = r.waypoints[i], b = r.waypoints[i + 1];
      if (Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) > 1) expect(g.lineClear(a.x, a.y, b.x, b.y, true, blocked)).toBe(true);
      expect(blocked(b.x, b.y)).toBe(false);
    }
  });
  it('walls are never passable', () => {
    const l = room(6, 3);
    for (const cy of [1, 3, 5]) put(l, 6, cy, '|');
    const g = ascii(l);
    expect(findPath(g, { x: 0, y: 1 }, { x: 5, y: 1 }, { mode: 'zombie' }).found).toBe(false);
  });
  it('respects the search budget', () => {
    const g = ascii(room(30, 22));
    const r = findPath(g, { x: 0, y: 0 }, { x: 29, y: 21 }, { maxExpansions: 5 });
    expect(r.found).toBe(false);
    expect(r.truncated).toBe(true);
  });
  it('isBlocked adds occupancy', () => {
    const g = ascii(room(3, 1));
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 0 }, { isBlocked: (x) => x === 1 }).found).toBe(false);
  });
  it('smoothing collapses open runs but keeps door waypoints', () => {
    const g = ascii(room(10, 10));
    const r = findPath(g, { x: 0, y: 0 }, { x: 9, y: 4 }, { smooth: true });
    expect(r.waypoints.length).toBeLessThan(r.path.length);
    expect(r.waypoints[0]).toEqual({ x: 0, y: 0, i: 0 });
    expect(r.waypoints[r.waypoints.length - 1]).toEqual({ x: 9, y: 4, i: r.path.length - 1 });
    const d = twoRooms('D');
    const rd = findPath(d, { x: 0, y: 1 }, { x: 5, y: 1 }, { smooth: true });
    const ids = rd.waypoints.map((p) => `${p.x},${p.y}`);
    expect(ids).toContain('2,1');
    expect(ids).toContain('3,1');
    const wi = rd.waypoints.map((w) => w.i);
    expect(wi).toContain(rd.doors[0].index);
    expect(wi).toContain(rd.doors[0].index + 1);
    expect(smoothPath(d, [{ x: 0, y: 0 }])).toHaveLength(1);
  });
  it('30x22 floor path under a few ms', () => {
    const g = new Grid(30, 22);
    const t = performance.now();
    for (let i = 0; i < 50; i++) findPath(g, { x: 0, y: 0 }, { x: 29, y: 21 });
    expect((performance.now() - t) / 50).toBeLessThan(5);
  });
});
