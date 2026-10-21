/*
 * E2E smoke test (not part of `npm test`). Run: npm run test:e2e (builds dist-e2e with debug hooks)
 * Boots the built game at 360x800 with touch, asserts no console errors and that
 * the home floor rendered. Needs a Chromium: set PLAYWRIGHT_BROWSERS_PATH or run
 * `npx playwright-core install chromium`.
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${url}?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 15000 });
  await page.waitForTimeout(800);

  const info = await page.evaluate(() => {
    const g = window.__floor15;
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { floor: g.state.hero.floor, home: g.balance.home.startFloor, health: g.state.needs.health,
      canvas: { w: c.width, h: c.height }, scene: g.scene.key, sprites: g.view.sprites.size };
  });
  check(info.scene === 'Game', 'GameScene is active');
  check(info.floor === info.home && info.floor === 15, 'hero starts on home floor 15');
  check(info.sprites > 0, 'tower view built sprites');
  check(info.canvas.w > 300 && info.canvas.h > 500, `canvas visible (${info.canvas.w}x${info.canvas.h})`);
  await page.screenshot({ path: `${shots}/e2e-home-360x800.png` });

  // ---- camera: axis-locked drag (decided on the first 16 px), horizontal pan within the floor, bounds
  const cam = () => page.evaluate(() => { const c = window.__floor15.cameras.main; return { x: c.scrollX, y: c.scrollY, w: window.__floor15.tower.floorWidth }; });
  const box = await page.evaluate(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, k: r.width / 720 }; });
  const cdp = await ctx.newCDPSession(page);
  /** A real touch drag (CDP touch events, like a finger): start at game (180, 560), move by dx/dy page px, lift. */
  const drag = async (dx, dy) => {
    const x0 = box.l + 180 * box.k;
    const y0 = box.t + 560 * box.k;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 8, y: y0 + (dy * i) / 8 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  await page.evaluate(() => { window.__floor15.following = false; window.__floor15.dragPauseUntil = Date.now() + 60000; });
  const c0 = await cam();
  await drag(-150, 14); // mostly horizontal: pans along the floor, floors do not change
  await page.waitForTimeout(150);
  const c1 = await cam();
  check(c1.x > c0.x + 100 && Math.abs(c1.y - c0.y) < 1, `a horizontal drag pans the camera along the floor only (x ${Math.round(c0.x)} -> ${Math.round(c1.x)}, y ${Math.round(c0.y)} -> ${Math.round(c1.y)})`);
  await page.waitForTimeout(3000); // momentum settles
  const c2 = await cam();
  await drag(14, 150); // mostly vertical: scrolls between floors, x stays
  await page.waitForTimeout(150);
  const c3 = await cam();
  check(Math.abs(c3.y - c2.y) > 100 && Math.abs(c3.x - c2.x) < 1, `a vertical drag scrolls floors only (y ${Math.round(c2.y)} -> ${Math.round(c3.y)}, x ${Math.round(c2.x)} -> ${Math.round(c3.x)})`);
  await page.evaluate(() => window.__floor15.setScrollX(99999));
  const edge = await cam();
  check(edge.x <= edge.w - 720 + 48 && edge.x >= edge.w - 720, `the camera stops at the right edge of the 3120 px floor (x ${Math.round(edge.x)})`);
  await page.evaluate(() => window.__floor15.setScrollX(-99999));
  check((await cam()).x >= -48, 'the camera stops at the left edge (with the 48 px back-swipe margin)');
  await page.screenshot({ path: `${shots}/e2e-pan-360x800.png` });
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);

  // ---- save version: a stage 1 / M1 save is deleted at launch with "The building has changed."
  const ctx2 = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await ctx2.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('floor15.save', JSON.stringify({ version: 1, lastSaveTime: 1, settings: { muted: false }, game: { started: true, v: 1, hero: { floor: 15, x: 200 } } }));
    }
  });
  const page2 = await ctx2.newPage();
  await page2.goto(`${url}?debug&story`, { waitUntil: 'load' });
  await page2.waitForFunction(() => window.__scenes?.Title?.buttons, null, { timeout: 15000 });
  await page2.waitForTimeout(500);
  const stale = await page2.evaluate(() => {
    const t = window.__scenes.Title;
    return { popup: !!t.popup?.isOpen, title: t.popup?.c?.list.filter((o) => o.type === 'Text').map((o) => o.text)[0], cont: !!t.buttons.continue, save: JSON.parse(localStorage.getItem('floor15.save') || 'null')?.game };
  });
  check(stale.popup && stale.title === 'The building has changed.', `an M1 save shows the popup "${stale.title}"`);
  check(!stale.cont && !stale.save?.started, 'the old save is gone: only New game is offered');
  await page2.screenshot({ path: `${shots}/e2e-stale-save-360x800.png` });
  await ctx2.close();
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
