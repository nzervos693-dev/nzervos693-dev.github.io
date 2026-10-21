/*
 * E2E smoke test for the isometric Stage A scene (not part of `npm test`). Run: npm run test:e2e
 * (builds dist-e2e with debug hooks). Boots at 360x800 with touch and checks: IsoGame is active, the floor
 * rendered, a tap on a floor tile walks the hero there, tapping the closed front door walks to it and opens
 * it and the vision changes, hold-to-look turns the hero, a drag pans the camera, no console errors.
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
    return { v, s, door: d.state, hx: g.hero.x, hy: g.hero.y, facing: g.hero.facing };
  });
  const tapTile = async (tx, ty) => {
    const p = await E(([x, y]) => window.__floor15.debugTileToClient(x, y, 0), [tx, ty]);
    await page.touchscreen.tap(p.x, p.y);
  };

  // tap-walk
  const a = await vis();
  await tapTile(2, 3);
  await sleep(1800);
  const b = await vis();
  check(Math.hypot(b.hx - 2.5, b.hy - 3.5) < 0.2 && Math.hypot(a.hx - b.hx, a.hy - b.hy) > 0.5, `tap on a floor tile walks the hero there (${b.hx.toFixed(1)},${b.hy.toFixed(1)})`);

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

  // hold to look: CDP touch, hold 0.6 s, slide to the right
  const cdp = await ctx.newCDPSession(page);
  const hp = await E(() => { const g = window.__floor15; const p = g.debugTileToClient(Math.floor(g.hero.x), Math.floor(g.hero.y), 0); return p; });
  const f0 = (await vis()).facing;
  const sx = hp.x - 80;
  const sy = hp.y + 100;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
  await sleep(650);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + 4, y: sy + 4 }] });
  await sleep(250);
  const looking = await E(() => window.__floor15.looking);
  const f1 = (await vis()).facing;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(150);
  check(looking === true, 'holding for 0.4 s starts look mode');
  check(Math.abs(((f1 - f0 + 540) % 360) - 180) > 5, `look turns the hero toward the finger (${f0.toFixed(0)} -> ${f1.toFixed(0)} deg)`);

  // drag pans the camera
  const cam0 = await E(() => ({ x: window.__floor15.camera.x, y: window.__floor15.camera.y }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 400 }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180 + i * 12, y: 400 + i * 6 }] }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(300);
  const cam1 = await E(() => ({ x: window.__floor15.camera.x, y: window.__floor15.camera.y }));
  check(Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y) > 40, `dragging pans the camera (${Math.round(Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y))} px)`);

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
