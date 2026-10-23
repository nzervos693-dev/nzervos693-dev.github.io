import { describe, it, expect } from 'vitest';
import balance from '../../public/data/balance.json';
import { IsoCamera, cameraConfig, floorBounds, CAMERA_DEFAULTS } from '../../src/iso/camera.js';
import { isoConfig } from '../../src/iso/projection.js';

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
  it('snapTo centres on the hero with no look-ahead', () => {
    const c = mk();
    c.snapTo(0, 600);
    expect(c.y).toBe(600);
    expect(c.x).toBe(0);
  });
  it('eases toward the hero (exponential) and clamps the hero inside the 160x240 rect', () => {
    const c = mk();
    c.snapTo(0, 600);
    c.update(1 / 60, { x: 0, y: 640 }); // 40 px: inside the soft zone start
    expect(c.y).toBeCloseTo(600 + 40 * (1 - Math.exp(-1 / 60 / cc.followSmoothSeconds)));
    const d = mk();
    d.snapTo(0, 600);
    d.update(1 / 60, { x: 0, y: 900 });
    expect(d.y).toBe(900 - 120);
    const e = mk();
    e.snapTo(0, 600);
    for (let i = 0; i < 10; i++) e.update(1 / 60, { x: 500, y: 600 });
    expect(500 - e.x).toBeLessThanOrEqual(80);
  });

  /** Walk the hero along (dx,dy) px/s for `secs`, return the camera. */
  const walk = (c, h, fps, secs, dx, dy) => {
    const dt = 1 / fps;
    for (let i = 0; i < fps * secs; i++) {
      h.x += dx * dt;
      h.y += dy * dt;
      c.update(dt, h);
    }
  };

  it('look-ahead leads the hero in the direction of actual movement', () => {
    const c = mk();
    const h = { x: 0, y: 2000 };
    c.snapTo(h.x, h.y);
    walk(c, h, 60, 6, 0, -100);
    expect(c.lookY).toBeLessThan(-cc.lookAheadPx * 0.7);
    expect(c.y).toBeLessThan(h.y - 20);
    expect(h.y - c.y).toBeLessThanOrEqual(120);
  });
  it('turning in place (no movement) does not move the camera', () => {
    const c = mk();
    const h = { x: 500, y: 900 };
    c.snapTo(h.x, h.y);
    for (let i = 0; i < 120; i++) c.update(1 / 60, h);
    expect(c.x).toBeCloseTo(500);
    expect(c.y).toBeCloseTo(900);
    expect(c.lookX).toBe(0);
    expect(c.lookY).toBe(0);
  });
  it('a 180 degree reversal never moves the look-ahead faster than the (reverse) rate limit', () => {
    const c = mk();
    const h = { x: 0, y: 3000 };
    c.snapTo(h.x, h.y);
    walk(c, h, 60, 8, 0, -100); // look-ahead built up going north
    const before = c.lookY;
    expect(before).toBeLessThan(-cc.lookAheadPx * 0.7);
    let px = c.lookX, py = c.lookY, worst = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 5; i++) {
      h.y += 100 * dt; // now south
      c.update(dt, h);
      worst = Math.max(worst, Math.hypot(c.lookX - px, c.lookY - py) / dt);
      px = c.lookX; py = c.lookY;
    }
    // the cap is raised (but still finite) while the look-ahead opposes the new heading
    expect(worst).toBeLessThanOrEqual(cc.lookAheadMaxPxPerSecond * cc.lookAheadReverseRateMult + 1e-6);
    expect(c.lookY).toBeGreaterThan(before); // it did start swinging round
  });
  it('camera speed stays near hero speed on a reversal (no whip)', () => {
    const c = mk();
    const h = { x: 0, y: 3000 };
    c.snapTo(h.x, h.y);
    walk(c, h, 60, 8, 0, -100);
    let py = c.y, worst = 0;
    const dt = 1 / 60;
    for (let i = 0; i < 60 * 4; i++) {
      h.y += 100 * dt;
      c.update(dt, h);
      worst = Math.max(worst, Math.abs(c.y - py) / dt);
      py = c.y;
    }
    expect(worst).toBeLessThan(100 + cc.lookAheadMaxPxPerSecond + 20);
  });
  it('a hero jump above teleportSpeedPx gives no look-ahead kick; just below it does', () => {
    const jump = (speed) => {
      const c = mk();
      const h = { x: 0, y: 500 };
      c.snapTo(h.x, h.y);
      c.update(1 / 60, h);
      h.x += speed / 60;
      c.update(1 / 60, h);
      return c;
    };
    const above = jump(cc.teleportSpeedPx * 1.01);
    expect(above.velX).toBe(0);
    expect(above.lookX).toBe(0);
    const below = jump(cc.teleportSpeedPx * 0.99);
    expect(below.velX).toBeGreaterThan(0);
  });
  it('defaults are used for missing camera keys', () => {
    const b = { ...balance, camera: { heroScreenYFrac: 0.4 } };
    expect(cameraConfig(b).followSmoothSeconds).toBe(CAMERA_DEFAULTS.followSmoothSeconds);
  });

  /** Run, then reverse; report hero offset vs the dead zone and camera acceleration (50 ms windows). */
  const reversal = (speed, nextDt) => {
    const c = new IsoCamera(cc, iso, { minX: -1e6, maxX: 1e6, minY: -1e6, maxY: 1e6 });
    const h = { x: 0, y: 0 };
    c.snapTo(0, 0);
    const hw = cc.deadzone[0] / 2;
    let maxOff = 0, clampFrames = 0, maxAcc = 0, t = 0, winT = 0, winX = c.x, prevV = null;
    const stepFor = (secs, dir) => {
      for (let s = 0; s < secs;) {
        const dt = nextDt();
        h.x += dir * speed * dt;
        c.update(dt, h);
        s += dt; t += dt; winT += dt;
        const off = Math.abs(h.x - c.x);
        maxOff = Math.max(maxOff, off);
        if (off >= hw - 1e-6) clampFrames++;
        if (winT >= 0.05) {
          const v = (c.x - winX) / winT;
          if (prevV !== null && t > 1) maxAcc = Math.max(maxAcc, Math.abs(v - prevV) / winT);
          prevV = v; winX = c.x; winT = 0;
        }
      }
    };
    stepFor(6, 1);
    stepFor(4, -1);
    return { maxOff, hw, clampFrames, maxAcc };
  };
  const jitter = () => { let q = 1; return () => { q = (q * 16807) % 2147483647; return 0.008 + (q / 2147483647) * 0.025; }; };
  const RUN_PX = 3.4 * 67.9; // run speed along screen-horizontal
  it('running reversal keeps the hero clear of the hard clamp edge, smooth at 60 fps', () => {
    const r = reversal(RUN_PX, () => 1 / 60);
    expect(r.clampFrames).toBe(0);
    expect(r.maxOff).toBeLessThan(r.hw * 0.95);
    expect(r.maxAcc).toBeLessThan(1800);
  });
  it('running reversal with jittery 8-33 ms frames stays off the clamp with bounded acceleration', () => {
    const r = reversal(RUN_PX, jitter());
    expect(r.clampFrames).toBe(0);
    expect(r.maxOff).toBeLessThan(r.hw * 0.95);
    expect(r.maxAcc).toBeLessThan(1800);
  });
  it('look-ahead and view are frame-rate independent (30 vs 60 vs 120 fps)', () => {
    const run = (fps) => {
      const c = mk();
      const h = { x: 0, y: 3000 };
      c.snapTo(h.x, h.y);
      walk(c, h, fps, 4, 70, -40);
      walk(c, h, fps, 2, -70, 40);
      return c;
    };
    const a = run(30), b = run(60), d = run(120);
    expect(a.lookX).toBeCloseTo(d.lookX, 0);
    expect(b.lookY).toBeCloseTo(d.lookY, 0);
    expect(Math.abs(a.x - d.x)).toBeLessThan(2); // discretisation only
    expect(b.y).toBeCloseTo(d.y, 0);
  });
  it('steady walking is jitter-free (camera step is smooth frame to frame)', () => {
    const c = mk();
    const h = { x: 0, y: 3000 };
    c.snapTo(h.x, h.y);
    walk(c, h, 60, 5, 60, 40);
    let prev = c.x, prevStep = null, maxJerk = 0;
    for (let i = 0; i < 120; i++) {
      h.x += 1; h.y += 40 / 60;
      c.update(1 / 60, h);
      const step = c.x - prev;
      if (prevStep !== null) maxJerk = Math.max(maxJerk, Math.abs(step - prevStep));
      prevStep = step; prev = c.x;
    }
    expect(maxJerk).toBeLessThan(0.1);
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
      for (let i = 0; i < fps * 0.5; i++) c.update(1 / fps, { x: 0, y: 640 });
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
