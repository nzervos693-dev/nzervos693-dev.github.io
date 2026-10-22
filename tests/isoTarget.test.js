import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { TargetTracker, targetConfig, evaluate, bestZombie, absAngleDiff, mountedEdgeRect, doorEdgeRect } from '../src/gameplay/isoTarget.js';

const cfg = targetConfig(balance);
const ctx = (extra = {}) => ({ weaponRange: 1.5, visible: () => true, los: () => true, ...extra });
const thing = (id, x, y, w = 1, h = 1, extra = {}) => ({ id, kind: 'thing', x0: x, y0: y, x1: x + w, y1: y + h, tiles: [{ x, y }], ...extra });
const zombie = (id, x, y) => ({ id, kind: 'zombie', x, y });
const hero = (x, y, facing = 0) => ({ x, y, facing });
const tick = (t, h, entries, c = ctx(), flags = { held: true, locked: false }, dt = 0.05) => t.update(dt, h, entries, c, flags);

describe('config', () => {
  it('reads controls.target.* (GDD 4)', () => {
    expect(cfg).toMatchObject({ objectReachTiles: 1.2, objectConeDegrees: 120, zombieConeDegrees: 180, keepReachExtraTiles: 0.3, keepConeExtraDegrees: 30, angleBucketDegrees: 15, switchHoldSeconds: 0.15 });
    expect(cfg.outline).toMatchObject({ color: '#0b0c0e', alpha: 0.6, widthPx: 3, zombieAlpha: 0.75, zombieWidthPx: 4 });
  });
  it('angle difference wraps', () => {
    expect(absAngleDiff(350, 10)).toBe(20);
    expect(absAngleDiff(0, 180)).toBe(180);
  });
});

describe('candidates', () => {
  const out = { dist: 0, angle: 0 };
  it('an object needs reach 1.2 to the nearest point of its footprint and the 120 degree cone', () => {
    const o = thing('a', 3, 2, 1, 2); // x 3..4, y 2..4
    expect(evaluate(hero(1.9, 3), o, cfg, ctx(), false, out)).toBe(true); // 1.1 away
    expect(evaluate(hero(1.7, 3), o, cfg, ctx(), false, out)).toBe(false); // 1.3 away
    expect(evaluate(hero(2.5, 3, 90), o, cfg, ctx(), false, out)).toBe(false); // facing away (object to the east, he faces south)
    expect(evaluate(hero(2.5, 3, 50), o, cfg, ctx(), false, out)).toBe(true); // 50 deg off the object's centre direction
  });
  it('a zombie needs weapon range and the 180 degree cone', () => {
    expect(evaluate(hero(0, 0, 0), zombie('z', 1.4, 0), cfg, ctx(), false, out)).toBe(true);
    expect(evaluate(hero(0, 0, 0), zombie('z', 1.6, 0), cfg, ctx(), false, out)).toBe(false);
    expect(evaluate(hero(0, 0, 0), zombie('z', -1, 0), cfg, ctx(), false, out)).toBe(false); // behind
    expect(evaluate(hero(0, 0, 0), zombie('z', 0, 1), cfg, ctx(), false, out)).toBe(true); // exactly 90 degrees
  });
  it('needs a Visible tile and a clear line', () => {
    const o = thing('a', 3, 2);
    expect(evaluate(hero(2.5, 2.5), o, cfg, ctx({ visible: () => false }), false, out)).toBe(false);
    expect(evaluate(hero(3.5, 2.5), o, cfg, ctx({ los: () => false }), false, out)).toBe(true); // standing on its tile: no line needed
    expect(evaluate(hero(1.9, 2.5), o, cfg, ctx({ los: () => false }), false, out)).toBe(false);
    expect(evaluate(hero(0, 0), zombie('z', 1, 0), cfg, ctx({ los: () => false }), false, out)).toBe(false);
  });
  it('placement spots use placeReachTiles', () => {
    const s = thing('s', 3, 2, 1, 1, { spot: true });
    expect(evaluate(hero(1.6, 2.5), s, cfg, ctx(), false, out)).toBe(true); // 1.4 away
    expect(evaluate(hero(1.6, 2.5), { ...s, spot: false }, cfg, ctx(), false, out)).toBe(false);
  });
  it('edge things are degenerate rects (door segment, mounted cabinet)', () => {
    expect(doorEdgeRect({ x: 4, y: 3, side: 'N' })).toEqual({ x0: 4, y0: 3, x1: 5, y1: 3 });
    expect(doorEdgeRect({ x: 4, y: 3, side: 'W' })).toEqual({ x0: 4, y0: 3, x1: 4, y1: 4 });
    expect(mountedEdgeRect([2, 2], 90)).toEqual({ x0: 2, y0: 2, x1: 3, y1: 2 }); // faces south: on its north edge
    expect(mountedEdgeRect([2, 2], 270)).toEqual({ x0: 2, y0: 3, x1: 3, y1: 3 });
    const d = { id: 'd', kind: 'thing', ...doorEdgeRect({ x: 4, y: 3, side: 'N' }), tiles: [{ x: 4, y: 2 }, { x: 4, y: 3 }] };
    expect(evaluate(hero(4.5, 3.6, 270), d, cfg, ctx(), false, out)).toBe(true);
    // standing beside a closed door: the door's own edge must not block the line to it (both tiles are its tiles)
    expect(evaluate(hero(4.5, 3.6, 270), d, cfg, ctx({ los: () => false }), false, out)).toBe(true);
    expect(evaluate(hero(4.5, 4.6, 270), { ...d, tiles: [{ x: 4, y: 2 }, { x: 4, y: 3 }] }, cfg, ctx({ los: () => false }), false, out)).toBe(false);
  });
});

describe('choosing', () => {
  it('zombies always beat objects', () => {
    const t = new TargetTracker(cfg);
    const entries = [thing('o', 1, 0), zombie('z', 1.4, 0.9)];
    expect(tick(t, hero(0.9, 0.5, 0), entries).id).toBe('z');
  });
  it('sorts by 15 degree angle buckets, then distance', () => {
    const t = new TargetTracker(cfg);
    const near = thing('near', 1, 1); // ~45 deg below the facing
    const far = thing('far', 1, 0, 1, 1); // straight ahead
    expect(tick(t, hero(0.9, 0.5, 0), [near, far]).id).toBe('far');
    // same bucket (both within 15 degrees): the closer wins
    const t2 = new TargetTracker(cfg);
    const a = thing('a', 1.1, 0.3, 1, 1); const b = thing('b', 1.0, 0.45, 1, 1);
    expect(tick(t2, hero(0.5, 0.8, 0), [a, b]).id).toBe('b');
  });
});

describe('hysteresis', () => {
  it('keeps the target within the loosened reach and cone', () => {
    const t = new TargetTracker(cfg);
    const o = thing('o', 3, 2);
    expect(tick(t, hero(2.0, 2.5), [o]).id).toBe('o'); // 1.0
    expect(tick(t, hero(1.6, 2.5), [o]).id).toBe('o'); // 1.4: beyond 1.2 but within 1.5
    expect(tick(t, hero(1.4, 2.5), [o])).toBe(null); // 1.6: gone
  });
  it('a different best candidate replaces it only after 0.15 s', () => {
    const t = new TargetTracker(cfg);
    const a = thing('a', 3, 2); const b = thing('b', 3, 3);
    expect(tick(t, hero(2.5, 2.5, 0), [a]).id).toBe('a');
    const h = hero(2.5, 2.9, 40); // b is now best (a still valid)
    expect(tick(t, h, [a, b], ctx(), { held: true, locked: false }, 0.05).id).toBe('a');
    expect(tick(t, h, [a, b], ctx(), { held: true, locked: false }, 0.05).id).toBe('a');
    expect(tick(t, h, [a, b], ctx(), { held: true, locked: false }, 0.06).id).toBe('b');
  });
  it('a break in being best restarts the timer', () => {
    const t = new TargetTracker(cfg);
    const a = thing('a', 3, 2); const b = thing('b', 3, 3);
    tick(t, hero(2.5, 2.5, 0), [a]);
    const h = hero(2.5, 2.9, 40);
    tick(t, h, [a, b], ctx(), { held: true, locked: false }, 0.1);
    tick(t, hero(2.5, 2.5, 0), [a, b], ctx(), { held: true, locked: false }, 0.05); // a best again
    expect(tick(t, h, [a, b], ctx(), { held: true, locked: false }, 0.1).id).toBe('a');
  });
  it('standing still keeps the target; a new object never steals it', () => {
    const t = new TargetTracker(cfg);
    const a = thing('a', 3, 2); const b = thing('b', 3, 3);
    tick(t, hero(2.5, 2.5, 0), [a]);
    const h = hero(2.5, 2.9, 40);
    for (let i = 0; i < 10; i++) expect(tick(t, h, [a, b], ctx(), { held: false, locked: false }, 0.1).id).toBe('a');
  });
  it('a zombie takes over at once, even when standing still', () => {
    const t = new TargetTracker(cfg);
    const a = thing('a', 3, 2);
    tick(t, hero(2.5, 2.5, 0), [a]);
    expect(tick(t, hero(2.5, 2.5, 0), [a, zombie('z', 3.5, 2.5)], ctx(), { held: false, locked: false }).id).toBe('z');
  });
  it('an invalid target is replaced at once by the best candidate', () => {
    const t = new TargetTracker(cfg);
    const a = thing('a', 3, 2); const b = thing('b', 0, 2);
    tick(t, hero(2.5, 2.5, 0), [a, b]);
    expect(tick(t, hero(0.9, 2.5, 180), [b], ctx(), { held: false, locked: false }).id).toBe('b'); // a left the list (dismantled)
  });
  it('the target is locked during an action, even against a zombie', () => {
    const t = new TargetTracker(cfg);
    const a = thing('a', 3, 2);
    tick(t, hero(2.5, 2.5, 0), [a]);
    expect(tick(t, hero(2.5, 2.5, 0), [a, zombie('z', 3.5, 2.5)], ctx(), { held: false, locked: true }).id).toBe('a');
    expect(bestZombie(hero(2.5, 2.5, 0), [a, zombie('z', 3.5, 2.5)], cfg, ctx()).id).toBe('z');
  });
});
