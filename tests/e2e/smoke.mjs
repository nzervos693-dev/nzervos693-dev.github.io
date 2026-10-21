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
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
