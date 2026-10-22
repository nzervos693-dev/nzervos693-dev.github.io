/*
 * E2E smoke test for the isometric Stage A scene (not part of `npm test`). Run: npm run test:e2e
 * (builds dist-e2e with debug hooks). Boots at 360x800 with touch and checks: IsoGame is active, the floor
 * rendered, the virtual joystick walks / creeps / runs the hero (CDP multi-touch), a tap on empty floor does nothing, tapping the closed front door walks to it and opens
 * it and the vision changes, a look drag turns the hero, the camera never pans, no console errors.
 * Needs a Chromium: set PLAYWRIGHT_BROWSERS_PATH or run `npx playwright-core install chromium`.
 * Env: E2E_URL (use a running server), E2E_SHOTS (screenshot dir).
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 4179;
const shots = process.env.E2E_SHOTS || 'tests/screenshots';
mkdirSync(shots, { recursive: true });

let server = null;
let url = process.env.E2E_URL;
if (!url) {
  server = await serve('dist-e2e', PORT);
  url = server.url;
}
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('preview server did not start (run npm run build:e2e first)');
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  const noise = /WebGL|GL Driver|GroupMarker/;
  page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const E = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);

  await page.goto(`${url}?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 15000 });
  await sleep(800);

  const info = await E(() => {
    const g = window.__floor15;
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { scene: g.scene.key, floor: g.state.hero.floor, health: g.state.needs.health, canvas: { w: c.width, h: c.height },
      children: g.children.list.length, world: g.state.world };
  });
  check(info.scene === 'IsoGame', 'IsoGameScene is active');
  check(info.floor === 15 && info.world === 'iso-1', 'hero starts on floor 15 of the iso world');
  check(info.children > 300, `iso floor rendered (${info.children} objects)`);
  check(info.canvas.w > 300 && info.canvas.h > 500, `canvas visible (${info.canvas.w}x${info.canvas.h})`);
  await page.screenshot({ path: `${shots}/e2e-iso-start-360x800.png` });

  const vis = () => E(() => {
    const g = window.__floor15;
    let v = 0; let s = 0;
    for (let i = 0; i < g.vision.visible.length; i++) { if (g.vision.visible[i]) v++; if (g.vision.seen[i]) s++; }
    const d = g.world.doors.find((x) => x.id === g.world.home.frontDoor);
    return { v, s, door: d.state, hx: g.hero.x, hy: g.hero.y, facing: g.hero.facing, t: performance.now() };
  });
  // joystick: synthetic multi-touch through CDP. Game px (720x1280) -> client px.
  const cdp = await ctx.newCDPSession(page);
  const toClient = (gx, gy) => E(([x, y]) => { const r = window.__floor15.game.canvas.getBoundingClientRect(); const k = r.width / window.__floor15.scale.width; return { x: r.left + x * k, y: r.top + y * k }; }, [gx, gy]);
  const touches = new Map();
  const send = async (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches].map(([id, p]) => ({ x: p.x, y: p.y, id })) });
  const down = async (id, gx, gy) => { touches.set(id, await toClient(gx, gy)); await send('touchStart'); };
  const moveTo = async (id, gx, gy) => { touches.set(id, await toClient(gx, gy)); await send('touchMove'); };
  const up = async (id) => { const p = touches.get(id); touches.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id }] }); }; // touchEnd lists the released points

  // stick: touch down in the lower-left zone, push screen-right (grid east), hold, release
  const a = await vis();
  await down(1, 150, 900);
  await moveTo(1, 150 + 80, 900); // 80/120 = 0.67 of the radius: a walk
  await sleep(900);
  const mid = await E(() => ({ st: window.__floor15.stick.active, run: !!window.__floor15.run, alpha: window.__floor15.stickView.ring.alpha }));
  await up(1);
  await sleep(50);
  const b = await vis();
  check(mid.st && !mid.run && mid.alpha > 0.5, 'the joystick appears under the thumb and a 0.67 push walks (no run)');
  const scrX = (o) => (o.hx - o.hy) * 48; // iso projection: screen x of a grid position
  const scrY = (o) => (o.hx + o.hy) * 24;
  check(scrX(b) - scrX(a) > 40 && Math.abs(scrY(b) - scrY(a)) < 0.5 * (scrX(b) - scrX(a)), `pushing screen-right moves the hero right on screen (${a.hx.toFixed(1)},${a.hy.toFixed(1)} -> ${b.hx.toFixed(1)},${b.hy.toFixed(1)}; wall slide may bend it)`);
  await sleep(150);
  const b2 = await vis();
  check(Math.hypot(b2.hx - b.hx, b2.hy - b.hy) < 0.15, 'release stops the hero at once');
  await sleep(500);
  check(await E(() => window.__floor15.stickView.ring.alpha) === 0, 'the stick fades out after release');
  // light push = creep (half speed), far push = run
  await E(() => { const g = window.__floor15; g.debugGoto(3, 3); });
  await sleep(300);
  await down(1, 150, 900);
  await moveTo(1, 150 + 30, 900); // 0.25: creep
  await sleep(300);
  const c0 = await vis(); // speed is measured between two in-page timestamps (CDP calls take a variable time)
  await sleep(1000);
  const c1 = await vis();
  const creeping = await E(() => window.__floor15.creeping);
  await up(1);
  const cs = Math.hypot(c1.hx - c0.hx, c1.hy - c0.hy) / ((c1.t - c0.t) / 1000);
  check(creeping && Math.abs(cs - 1) < 0.15, `a light push creeps at about 1 tile/s (${cs.toFixed(2)} tiles/s)`);
  await E(() => { const g = window.__floor15; g.debugGoto(3, 3); });
  await sleep(200);
  await down(1, 150, 900);
  await moveTo(1, 150 + 120, 900);
  await sleep(300);
  check(await E(() => !!window.__floor15.run), 'a full push runs');
  // a second finger tapping empty floor must not stop the stick finger
  await down(2, 560, 400);
  await up(2);
  await sleep(300);
  check(await E(() => window.__floor15.stick.active), 'a second finger tapping does not drop the stick finger (multi-touch)');
  await up(1);
  await E(() => { const g = window.__floor15; g.debugGoto(2, 3); g.run = null; });
  await sleep(300);
  // a tap on empty floor does nothing
  const tp = await E(() => window.__floor15.debugTileToClient(3, 4, 0));
  const t0 = await vis();
  await page.touchscreen.tap(tp.x, tp.y);
  await sleep(600);
  const t1 = await vis();
  check(Math.hypot(t1.hx - t0.hx, t1.hy - t0.hy) < 0.01 && !(await E(() => window.__floor15.walk)), 'a tap on empty floor does nothing');

  // open the front door and see the corridor
  check(b.door === 'closed', 'front door starts closed');
  const dp = await E((id) => window.__floor15.debugClientOf(id), 'f15NW-6.9.S');
  await page.touchscreen.tap(dp.x, dp.y);
  await page.waitForFunction(() => window.__floor15.world.doors.find((x) => x.id === window.__floor15.world.home.frontDoor).state === 'open', null, { timeout: 20000 });
  await sleep(500);
  const c = await vis();
  check(c.door === 'open', 'tapping the closed door walks to it and opens it');
  check(c.s > a.s, `vision memory grew after opening the door (${a.s} -> ${c.s} remembered tiles)`);
  await page.screenshot({ path: `${shots}/e2e-iso-door-360x800.png` });

  // look: a one-finger drag on the right half turns the hero toward the finger
  const f0 = (await vis()).facing;
  await down(1, 600, 300);
  for (let k = 1; k <= 6; k++) { await moveTo(1, 600 + k * 12, 300 - k * 14); await sleep(30); }
  await sleep(300);
  const looking = await E(() => window.__floor15.looking);
  const f1 = (await vis()).facing;
  await up(1);
  await sleep(150);
  check(looking === true, 'a drag outside the stick zone starts look mode');
  check(Math.abs(((f1 - f0 + 540) % 360) - 180) > 5, `look turns the hero toward the finger (${f0.toFixed(0)} -> ${f1.toFixed(0)} deg)`);

  // the camera cannot be panned: the same drag leaves it following the hero
  const cam0 = await E(() => ({ x: window.__floor15.camera.x, y: window.__floor15.camera.y }));
  await down(1, 500, 300);
  for (let k = 1; k <= 8; k++) { await moveTo(1, 500 + k * 12, 300 + k * 6); await sleep(16); }
  await up(1);
  await sleep(300);
  const cam1 = await E(() => ({ x: window.__floor15.camera.x, y: window.__floor15.camera.y }));
  check(Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y) < 20, `dragging does not pan the camera (${Math.round(Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y))} px)`);

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
