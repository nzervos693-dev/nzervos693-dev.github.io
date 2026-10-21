/*
 * QA e2e for Milestone 2 stage 2 (wide floors, horizontal camera). Not in run.mjs yet. Needs `npm run build:e2e`.
 * Usage: node tests/e2e/stage2.mjs <section...> (render, camera, doors, ...). Env: E2E_SHOTS (screenshot dir).
 * Real touch input via CDP for drags and page.touchscreen for taps; debug hooks only read state / teleport.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { mkdirSync } from 'node:fs';

const shots = process.env.E2E_SHOTS || 'tests/screenshots';
mkdirSync(shots, { recursive: true });
const fail = [];
export const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = await serve('dist-e2e', 4190 + Math.floor(Math.random() * 100));
const url = server.url;
const browser = await chromium.launch();
const VIEWS = { '360x800': { width: 360, height: 800 }, '412x915': { width: 412, height: 915 } };

/** Open a fresh context/page. */
export async function open(view = '360x800', query = '?debug', init = null, dsf = 2, waitGame = true) {
  const ctx = await browser.newContext({ viewport: VIEWS[view], hasTouch: true, isMobile: true, deviceScaleFactor: dsf });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(url + query, { waitUntil: 'load' });
  if (waitGame) await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 20000 });
  await sleep(600);
  const cdp = await ctx.newCDPSession(page);
  const P = { ctx, page, cdp, errors, view };
  P.shot = (name) => page.screenshot({ path: `${shots}/${name}-${view}.png` });
  P.g = (fn, arg) => page.evaluate(fn, arg);
  return P;
}
export const gameBox = (P) => P.g(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, k: r.width / 720 }; });
/** world -> page px using the live camera (floor y is world y) */
export async function toPage(P, wx, wy) {
  return P.g(([x, y]) => { const r = document.querySelector('canvas').getBoundingClientRect(); const k = r.width / 720; const c = window.__floor15.cameras.main; return { x: r.left + (x - c.scrollX) * k, y: r.top + (y - c.scrollY) * k }; }, [wx, wy]);
}
export async function tapWorld(P, wx, wy) { const p = await toPage(P, wx, wy); await P.page.touchscreen.tap(p.x, p.y); }
export async function tapFixed(P, x, y) { const b = await gameBox(P); await P.page.touchscreen.tap(b.l + x * b.k, b.t + y * b.k); }
/** Real touch drag in page px from game (gx,gy) by (dx,dy) page px; steps, per-step ms. Returns nothing. */
export async function drag(P, gx, gy, dx, dy, { steps = 8, ms = 16, release = true } = {}) {
  const b = await gameBox(P);
  const x0 = b.l + gx * b.k; const y0 = b.t + gy * b.k;
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / steps, y: y0 + (dy * i) / steps }] });
    await sleep(ms);
  }
  if (release) await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
export const cam = (P) => P.g(() => { const s = window.__floor15; const c = s.cameras.main; return { x: c.scrollX, y: c.scrollY, hx: s.state.hero.x, hf: s.state.hero.floor, following: s.following, vx: s.vx, vy: s.vy }; });
export const until = async (P, fn, arg, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await P.g(fn, arg)) return true; await sleep(120); } return false; };
export const revealAll = (P) => P.g(() => { const s = window.__floor15; for (const apt of s.tower.apartments.values()) for (const r of apt.rooms) s.state.rooms[`${apt.id}:${r.id}`] = true; s.view.refresh(); });
export const done = async () => { await browser.close(); server.close(); console.log(fail.length ? `\n${fail.length} FAILED` : '\nall passed'); process.exit(fail.length ? 1 : 0); };

const sections = {};
export const section = (n, fn) => { sections[n] = fn; };

/**
 * Fast in-page synthetic touch drag on the canvas (real TouchEvents, controlled 16 ms spacing like a 60 Hz phone).
 * CDP touch events are too slow in software-GL headless (about 3 per second), which breaks fling velocity.
 * Game px start (gx, gy), total page-px (dx, dy), `steps` moves, `stepMs` apart, `holdMs` rest before lift.
 */
export function flingDrag(P, gx, gy, dx, dy, { steps = 8, stepMs = 16, holdMs = 0, id = 7 } = {}) {
  return P.g(async ([gx, gy, dx, dy, steps, stepMs, holdMs, id]) => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); const k = r.width / 720;
    const x0 = r.left + gx * k; const y0 = r.top + gy * k;
    const mk = (type, x, y) => {
      const t = new Touch({ identifier: id, target: c, clientX: x, clientY: y, pageX: x, pageY: y, screenX: x, screenY: y });
      return new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true });
    };
    const w = (ms) => new Promise((res) => setTimeout(res, ms));
    c.dispatchEvent(mk('touchstart', x0, y0));
    for (let i = 1; i <= steps; i++) { await w(stepMs); c.dispatchEvent(mk('touchmove', x0 + (dx * i) / steps, y0 + (dy * i) / steps)); }
    if (holdMs) await w(holdMs);
    c.dispatchEvent(mk('touchend', x0 + dx, y0 + dy));
  }, [gx, gy, dx, dy, steps, stepMs, holdMs, id]);
}
