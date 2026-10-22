import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { isoConfig, FACINGS, angleDiff } from '../src/iso/projection.js';
import {
  stickConfig, stickSide, inStickZone, readStick, stickGridDir, stepStickMove, STICK, DoubleTapDetector,
} from '../src/gameplay/isoStick.js';
import { ascii, room, put } from './iso/helpers.js';

const iso = isoConfig(balance);
const cfg = stickConfig(balance);
const env = (grid, extra = {}) => ({
  grid, radius: 0.3, doorMin: 0.35, maxStep: 0.3, assistTiles: 0.35, assistMinCos: Math.cos(Math.PI / 3), ...extra,
});
const run = (grid, hero, gx, gy, seconds, e = env(grid), speed = 2) => {
  let last = null;
  for (let t = 0; t < seconds; t += 1 / 60) last = { ...stepStickMove(hero, gx, gy, speed / 60, e) };
  return last;
};

describe('screen to grid direction (GDD 4)', () => {
  const ang = (ux, uy) => stickGridDir(iso, ux, uy).angle;
  it('maps the four screen axes and the iso diagonals to the grid facings', () => {
    expect(Math.abs(angleDiff(ang(0, -1), FACINGS.N))).toBeLessThan(1);
    expect(Math.abs(angleDiff(ang(1, 0), FACINGS.E))).toBeLessThan(1);
    expect(Math.abs(angleDiff(ang(0, 1), FACINGS.S))).toBeLessThan(1);
    expect(Math.abs(angleDiff(ang(-1, 0), FACINGS.W))).toBeLessThan(1);
    // screen up-right along the tile diagonal = grid NE (-y)
    const d = stickGridDir(iso, iso.halfW, -iso.halfH);
    expect(d.x).toBeCloseTo(0, 5);
    expect(d.y).toBeCloseTo(-1, 5);
  });
  it('moving up the screen moves the hero up the screen', () => {
    const grid = ascii(room(10, 10));
    const hero = { x: 5.5, y: 5.5 };
    const sy0 = (hero.x + hero.y) * iso.halfH;
    const d = stickGridDir(iso, 0, -1);
    run(grid, hero, d.x, d.y, 0.5);
    expect((hero.x + hero.y) * iso.halfH).toBeLessThan(sy0);
    expect((hero.x - hero.y) * iso.halfW).toBeCloseTo(0, 3);
  });
});

describe('stick reading and zone', () => {
  it('dead zone, creep, walk and run bands', () => {
    const r = (frac) => readStick(cfg, frac * cfg.radiusPx, 0);
    expect(r(0.1).active).toBe(false);
    expect(r(0.2)).toMatchObject({ active: true, turn: true, creep: false, moving: false, run: false });
    expect(r(0.3)).toMatchObject({ active: true, turn: false, creep: true, moving: true, run: false });
    expect(r(0.55)).toMatchObject({ active: true, creep: false, run: false });
    expect(r(0.7)).toMatchObject({ run: true, creep: false });
    expect(r(3).mag).toBe(1);
    expect(Math.hypot(r(3).x, r(3).y)).toBeCloseTo(cfg.radiusPx, 5);
  });
  it('zone is the lower-left (or lower-right) block above the bottom bar', () => {
    const W = 720; const H = 1280;
    expect(inStickZone(cfg, 100, 1000, W, H, 1150)).toBe(true);
    expect(inStickZone(cfg, 500, 1000, W, H, 1150)).toBe(false);
    expect(inStickZone(cfg, 100, 300, W, H, 1150)).toBe(false);
    expect(inStickZone(cfg, 100, 1200, W, H, 1150)).toBe(false); // on the bottom bar
    expect(inStickZone(cfg, 600, 1000, W, H, 1150, 'right')).toBe(true);
    expect(inStickZone(cfg, 100, 1000, W, H, 1150, 'right')).toBe(false);
  });
  it('stickSide defaults to left', () => {
    expect(stickSide({})).toBe('left');
    expect(stickSide({ joystickSide: 'right' })).toBe('right');
    expect(stickSide(undefined)).toBe('left');
  });
});

describe('collision and sliding', () => {
  it('slides along a wall when the direction is partly blocked', () => {
    const grid = ascii(room(10, 10));
    const hero = { x: 5.5, y: 1.5 };
    const s = Math.SQRT1_2;
    run(grid, hero, -s, -s, 2); // up-left grid diagonal into the north wall
    expect(hero.y).toBeGreaterThanOrEqual(0.3 - 1e-9);
    expect(hero.y).toBeLessThan(0.35);
    expect(hero.x).toBeLessThan(4.5); // kept sliding west
  });
  it('stands still when fully blocked, never inside the wall', () => {
    const grid = ascii(room(10, 10));
    const hero = { x: 5.5, y: 1.5 };
    run(grid, hero, 0, -1, 2);
    expect(hero.x).toBe(5.5);
    expect(hero.y).toBeCloseTo(0.3, 5);
  });
  it('furniture blocks like a wall', () => {
    const grid = ascii(room(10, 10));
    grid.setObstacle(6, 5, true);
    const hero = { x: 5.5, y: 5.5 };
    run(grid, hero, 1, 0, 2);
    expect(hero.x).toBeLessThanOrEqual(5.7 + 1e-9);
  });
  it('a zombie tile blocks', () => {
    const grid = ascii(room(10, 10));
    const hero = { x: 5.5, y: 5.5 };
    run(grid, hero, 1, 0, 2, env(grid, { isBlocked: (x, y) => x === 6 && y === 5 }));
    expect(hero.x).toBeLessThanOrEqual(5.7 + 1e-9);
  });
});

describe('doors and doorways', () => {
  it('pushing into a closed door reports it and stops short', () => {
    const grid = ascii(put(room(10, 10), 11, 10, 'D')); // N edge of tile (5,5)
    const hero = { x: 5.5, y: 5.5 };
    const r = run(grid, hero, 0, -1, 1);
    expect(r.code).toBe(STICK.DOOR);
    expect(r.door.state).toBe('closed');
    expect(hero.y).toBeGreaterThanOrEqual(5.3 - 1e-9);
  });
  it('a jammed door reports LOCKED; an open one lets the hero through', () => {
    const jam = ascii(put(room(10, 10), 11, 10, 'J'));
    expect(run(jam, { x: 5.5, y: 5.5 }, 0, -1, 1).code).toBe(STICK.LOCKED);
    const open = ascii(put(room(10, 10), 11, 10, 'd'));
    const hero = { x: 5.5, y: 5.5 };
    run(open, hero, 0, -1, 1);
    expect(hero.y).toBeLessThan(4.5);
  });
  it('a door is ignored when the stick only grazes it', () => {
    const grid = ascii(put(room(10, 10), 11, 10, 'D'));
    const hero = { x: 5.5, y: 5.5 };
    const r = run(grid, hero, 0.99, -0.1, 0.3);
    expect(r.code).toBe(STICK.MOVING);
  });
  it('doorway assist eases the hero into a 1-tile gap beside a wall corner', () => {
    const lines = room(10, 10);
    for (let ty = 0; ty < 10; ty++) if (ty !== 5) put(lines, 12, 2 * ty + 1, '|'); // wall between x=5 and x=6, gap at row 5
    const grid = ascii(lines);
    const hero = { x: 5.5, y: 5.2 }; // 0.3 off the centre line: the circle would clip the corner
    run(grid, hero, 1, 0, 2);
    expect(hero.x).toBeGreaterThan(6.5);
    // too far off the centre line: no assist, he stays on his side
    const far = { x: 5.5, y: 4.05 };
    run(grid, far, 1, 0, 2);
    expect(far.x).toBeLessThan(5.8);
  });
});

describe('diagonal push into a doorway', () => {
  it('does not fight the assist: the hero ends up through the gap', () => {
    const lines = room(10, 10);
    for (let ty = 0; ty < 10; ty++) if (ty !== 5) put(lines, 12, 2 * ty + 1, '|');
    const grid = ascii(lines);
    const hero = { x: 5.5, y: 5.25 };
    run(grid, hero, 0.94, -0.34, 3); // mostly east, a little -y (screen right and slightly up)
    expect(hero.x).toBeGreaterThan(6.5);
  });
});

import { createGust, stepGust, GUST_DEFAULTS } from '../src/gameplay/soundscape.js';

describe('weather gusts (no constant bed)', () => {
  it('are silent for the gap, swell and fade, and never exceed the peak', () => {
    let n = 1;
    const rng = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
    const g = createGust(rng, GUST_DEFAULTS.wind);
    let silent = 0; let loud = 0; let max = 0;
    for (let t = 0; t < 600; t += 0.1) {
      const v = stepGust(g, 0.1, rng, GUST_DEFAULTS.wind);
      if (v === 0) silent++; else loud++;
      max = Math.max(max, v);
    }
    expect(silent).toBeGreaterThan(loud); // mostly quiet
    expect(loud).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(GUST_DEFAULTS.wind.peak);
  });
});

import { Grid, EDGE, MOVE } from '../src/iso/grid.js';

describe('wall clearance (BUG-047, review critical 1)', () => {
  it('keeps sliding along a wall with an obstacle behind it at shallow angles', () => {
    for (const ang of [200, 225, 250]) {
      const g = new Grid(10, 10, {});
      for (let y = 0; y < 10; y++) g.edges[g.edgeId(5, y, 'W')] = EDGE.WALL;
      g.setObstacle(4, 4, true); g.setObstacle(4, 2, true);
      const hero = { x: 5.5, y: 6.5 };
      const a = (ang * Math.PI) / 180;
      run(g, hero, Math.cos(a), Math.sin(a), 12);
      expect(hero.y).toBeLessThan(2); // slid all the way up the wall
      expect(hero.x).toBeGreaterThanOrEqual(5.3 - 1e-6);
    }
  });

  /** Distance from a point to the blocking sides of the tiles around it. */
  const clearance = (grid, hx, hy) => {
    let best = Infinity;
    const tx = Math.floor(hx); const ty = Math.floor(hy);
    for (let y = ty - 1; y <= ty + 1; y++) {
      for (let x = tx - 1; x <= tx + 1; x++) {
        if (!grid.isWalkable(x, y)) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (grid.stepClass(x, y, dx, dy) === MOVE.OPEN) continue;
          const x0 = dx === 1 ? x + 1 : dx === -1 ? x : x;
          const x1 = dx === 0 ? x + 1 : x0;
          const y0 = dy === 1 ? y + 1 : dy === -1 ? y : y;
          const y1 = dy === 0 ? y + 1 : y0;
          const px = Math.min(Math.max(hx, x0), x1);
          const py = Math.min(Math.max(hy, y0), y1);
          best = Math.min(best, Math.hypot(hx - px, hy - py));
        }
      }
    }
    return best;
  };

  it('fuzz: on a random walled floor the hero never ends closer than the radius to a wall', () => {
    let n = 7;
    const rnd = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
    let worst = Infinity;
    for (let trial = 0; trial < 40; trial++) {
      const lines = room(12, 12);
      for (let k = 0; k < 14; k++) {
        const horiz = rnd() < 0.5;
        const tx = 1 + Math.floor(rnd() * 10); const ty = 1 + Math.floor(rnd() * 10);
        const ch = rnd() < 0.3 ? 'd' : rnd() < 0.5 ? '-' : '|';
        if (horiz) put(lines, 2 * tx + 1, 2 * ty, ch === '|' ? '-' : ch); else put(lines, 2 * tx, 2 * ty + 1, ch === '-' ? '|' : ch);
      }
      const grid = ascii(lines);
      for (let k = 0; k < 4; k++) grid.setObstacle(1 + Math.floor(rnd() * 10), 1 + Math.floor(rnd() * 10), true);
      let hero = null;
      for (let t = 0; t < 100 && !hero; t++) { const x = Math.floor(rnd() * 12); const y = Math.floor(rnd() * 12); if (grid.isWalkable(x, y)) hero = { x: x + 0.3 + rnd() * 0.4, y: y + 0.3 + rnd() * 0.4 }; }
      const e = env(grid);
      for (let step = 0; step < 900; step++) {
        if (step % 40 === 0) { var a = rnd() * Math.PI * 2; }
        stepStickMove(hero, Math.cos(a), Math.sin(a), 0.05, e);
        worst = Math.min(worst, clearance(grid, hero.x, hero.y));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(0.3 - 0.02);
  });
});

describe('assist does not trap a wall-corner slide', () => {
  it('a diagonal push past a wall end keeps sliding along the wall', () => {
    const lines = room(10, 10);
    for (let ty = 0; ty < 5; ty++) put(lines, 12, 2 * ty + 1, '|'); // wall between x=5 and 6 for rows 0-4, open below
    const grid = ascii(lines);
    const hero = { x: 5.5, y: 5.45 };
    run(grid, hero, 0.707, -0.707, 4);
    expect(hero.y).toBeLessThan(2); // slid up along the wall
  });
});

describe('turn band and double tap (GDD 4)', () => {
  it('turn band is 0.15 to below 0.25, creep starts at 0.25', () => {
    const r = (frac) => readStick(cfg, frac * cfg.radiusPx, 0);
    expect(r(0.14).turn).toBe(false);
    expect(r(0.15)).toMatchObject({ active: true, turn: true });
    expect(r(0.249).turn).toBe(true);
    expect(r(0.25)).toMatchObject({ turn: false, creep: true });
    expect(r(0.4)).toMatchObject({ creep: false, run: false });
  });
  it('a double tap within 0.3 s and 48 px is a turn around', () => {
    const d = new DoubleTapDetector(cfg);
    d.down(0, 100, 900); expect(d.up(0.1, false)).toBe('tap');
    d.down(0.3, 120, 910); expect(d.up(0.38, false)).toBe('double');
    // the detector resets after a double
    d.down(0.5, 120, 910); expect(d.up(0.58, false)).toBe('tap');
  });
  it('too slow, too far, too long or a drag is not a double tap', () => {
    const d = new DoubleTapDetector(cfg);
    d.down(0, 100, 900); d.up(0.1, false);
    d.down(0.5, 100, 900); expect(d.up(0.6, false)).toBe('tap'); // 0.4 s after the release
    d.down(0.7, 300, 900); expect(d.up(0.8, false)).toBe('tap'); // 200 px away
    d.down(0.9, 300, 900); expect(d.up(1.4, false)).toBe(null); // held 0.5 s: not a tap
    d.down(1.5, 300, 900); expect(d.up(1.55, true)).toBe(null); // left the dead zone
  });
});
