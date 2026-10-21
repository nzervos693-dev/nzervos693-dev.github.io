import { describe, it, expect } from 'vitest';
import balance from '../../public/data/balance.json';
import { IsoCamera, cameraConfig, floorBounds } from '../../src/iso/camera.js';
import { isoConfig, facingToAngle } from '../../src/iso/projection.js';

const iso = isoConfig(balance);
const cc = cameraConfig(balance);
const mk = () => new IsoCamera(cc, iso, floorBounds(iso, 30, 22, cc.edgePad));

describe('iso camera', () => {
  it('zoom is fixed at 1', () => {
    expect(mk().zoom).toBe(1);
  });
  it('bounds: iso bounding box + 96 pad', () => {
    const b = floorBounds(iso, 30, 22, 96);
    expect(b.minX).toBe(-22 * 48 - 96);
    expect(b.maxX).toBe(30 * 48 + 96);
    expect(b.minY).toBe(-96);
    expect(b.maxY).toBe(52 * 24 + 96);
  });
  it('look-ahead leads the hero in the facing direction (N = up the screen)', () => {
    const c = mk();
    c.snapTo(0, 600, facingToAngle('N'));
    expect(c.y).toBeCloseTo(600 - 120);
    expect(c.x).toBeCloseTo(0);
  });
  it('eases toward the look-ahead target and clamps the hero inside the 160x240 rect', () => {
    const c = mk();
    c.snapTo(0, 600);
    c.update(1 / 60, { x: 0, y: 700 }, null); // 100 away: eases by k, hero still inside rect
    expect(c.y).toBeCloseTo(600 + 100 * 0.12);
    const d = mk();
    d.snapTo(0, 600);
    d.update(1 / 60, { x: 0, y: 900 }, null); // eased 36 -> hero 264 away > 120: clamped
    expect(d.y).toBe(900 - 120);
    const e = mk();
    e.snapTo(0, 600);
    for (let i = 0; i < 10; i++) e.update(1 / 60, { x: 500, y: 600 }, null);
    expect(500 - e.x).toBeLessThanOrEqual(80);
  });
  it('look-ahead shifts the view toward facing while the hero stays in the rect', () => {
    const c = mk();
    c.snapTo(0, 600);
    for (let i = 0; i < 120; i++) c.update(1 / 60, { x: 0, y: 600 }, facingToAngle('S'));
    expect(c.y).toBeGreaterThan(600 + 100);
    expect(c.y - 600).toBeLessThanOrEqual(120);
  });
  it('drag with a stale last sample leaves no momentum', () => {
    const c = mk();
    c.snapTo(0, 600);
    c.beginDrag();
    c.dragBy(60, 0, 0.016);
    c.update(0.2, null, null);
    c.endDrag();
    const x = c.x;
    c.update(0.5, null, null);
    expect(c.x).toBe(x);
    const f = mk();
    f.snapTo(0, 600);
    f.beginDrag();
    f.dragBy(60, 0, 0.016);
    f.update(0.01, null, null);
    f.endDrag();
    const fx = f.x;
    f.update(0.2, null, null);
    expect(f.x).toBeLessThan(fx);
  });
  it('follow is frame-rate independent', () => {
    const run = (fps) => {
      const c = mk();
      c.snapTo(0, 600);
      for (let i = 0; i < fps * 0.5; i++) c.update(1 / fps, { x: 0, y: 700 }, null);
      return c.y;
    };
    expect(run(30)).toBeCloseTo(run(120), 1);
    expect(run(60)).toBeCloseTo(run(120), 1);
  });
  it('clamps to bounds', () => {
    const c = mk();
    c.snapTo(99999, 99999);
    expect(c.x).toBe(30 * 48 + 96);
    expect(c.y).toBe(52 * 24 + 96);
  });
  it('drag pans opposite the finger, pauses follow 2 s, momentum decays, resume works', () => {
    const c = mk();
    c.snapTo(0, 600);
    c.beginDrag();
    c.dragBy(40, 20, 0.016);
    expect(c.x).toBe(-40);
    expect(c.y).toBe(580);
    c.update(0.5, { x: 0, y: 600 }, null);
    expect(c.x).toBe(-40); // dragging: no follow
    c.endDrag();
    expect(c.followPaused).toBe(true);
    c.update(1, { x: 0, y: 600 }, null);
    expect(c.followPaused).toBe(true);
    c.update(1.1, { x: 0, y: 600 }, null);
    expect(c.followPaused).toBe(false);
    c.endDrag();
    c.resumeFollow();
    expect(c.followPaused).toBe(false);
  });
  it('view <-> world transforms are inverse', () => {
    const c = mk();
    c.snapTo(100, 300);
    const v = c.worldToView(160, 340, 720, 1280);
    const w = c.viewToWorld(v.x, v.y, 720, 1280);
    expect(w.x).toBeCloseTo(160);
    expect(w.y).toBeCloseTo(340);
  });
});
