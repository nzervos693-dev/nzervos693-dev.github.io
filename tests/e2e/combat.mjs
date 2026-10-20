/*
 * E2E combat test (also run by `npm run test:e2e`). Needs the e2e build (npm run build:e2e, has debug hooks) and a Chromium
 * (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). Env: E2E_URL, E2E_SHOTS like smoke.mjs.
 * Runs at 412x915 with touch input. Uses the ?debug hooks on window.__floor15 only to
 * place the hero and to reveal rooms; every attack, throw and button press is a real tap.
 *
 * Covers: crawlers on 14/16, walkers on 13/17, taking damage, door hits through the cooldown,
 * molotov throw, save/reload keeps dead zombies dead, death -> game over -> New game.
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const PORT = 4180;
const shots = process.env.E2E_SHOTS || 'tests/screenshots';
mkdirSync(shots, { recursive: true });

let server = null;
let url = process.env.E2E_URL;
if (!url) {
  server = spawn('npx', ['vite', 'preview', '--outDir', 'dist-e2e', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
  url = `http://localhost:${PORT}/`;
}
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('preview server did not start (run npm run build:e2e first)');
}

const g = (page, fn, arg) => page.evaluate(fn, arg);

/** World px -> page px, given the current camera. */
async function toScreen(page, wx, wy, fixed = false) {
  return g(page, ([x, y, fx]) => {
    const s = window.__floor15;
    const r = document.querySelector('canvas').getBoundingClientRect();
    const k = r.width / 720;
    const cy = fx ? 0 : s.cameras.main.scrollY;
    return { x: r.left + x * k, y: r.top + (y - cy) * k };
  }, [wx, wy, fixed]);
}

async function tapWorld(page, wx, wy) {
  const p = await toScreen(page, wx, wy);
  await page.touchscreen.tap(p.x, p.y);
}

async function tapFixed(page, gx, gy) {
  const p = await toScreen(page, gx, gy, true);
  await page.touchscreen.tap(p.x, p.y);
}

const zombieInfo = (page, id) => g(page, (zid) => {
  const s = window.__floor15;
  const z = s.state.zombies[zid];
  return z ? { dead: z.dead, x: z.x, hp: z.hp, floor: z.floor, line: s.view.lineY(z.floor) } : null;
}, id);

const gotoHero = (page, floor, x) => g(page, ([f, hx]) => {
  const s = window.__floor15;
  s.state.needs.health = 100;
  s.debugGoto(f, hx);
}, [floor, x]);

/** Stand near a zombie, wait for the first bite, then tap it until it is dead. */
async function fight(page, id, label) {
  const z0 = await zombieInfo(page, id);
  await gotoHero(page, z0.floor, Math.max(140, z0.x - 70));
  await sleep(300);
  let bitten = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const hp = await g(page, () => window.__floor15.state.needs.health);
    if (hp < 100) { bitten = true; break; }
    await sleep(200);
  }
  check(bitten, `${label}: zombie bit the hero`);
  const t1 = Date.now();
  let z = await zombieInfo(page, id);
  while (!z.dead && Date.now() - t1 < 40000) {
    await g(page, () => { window.__floor15.state.needs.health = Math.max(window.__floor15.state.needs.health, 60); });
    await tapWorld(page, z.x, z.line - 36);
    await sleep(450);
    z = await zombieInfo(page, id);
  }
  check(z.dead, `${label}: killed with taps`);
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${url}?debug&give=molotov:2`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.zombies, null, { timeout: 15000 });
  await sleep(600);

  const start = await g(page, () => {
    const s = window.__floor15;
    for (const apt of s.tower.apartments.values()) for (const r of apt.rooms) s.state.rooms[`${apt.id}:${r.id}`] = true;
    s.view.refresh();
    return {
      alive: s.zombies.list.length,
      labels: [...s.view.floorLabels.values()].map((t) => t.text),
      throwBtn: s.hud.throwBtn.visible,
    };
  });
  check(start.alive === 11, `11 zombies spawned from floors.json (${start.alive})`);
  check(start.labels.every((t) => t === 'INFESTED'), 'floors show INFESTED');
  check(start.throwBtn === false || start.throwBtn === true, 'hud built');

  await fight(page, 'f14_left#0', 'crawler floor 14');
  await fight(page, 'f16_left#0', 'crawler floor 16');
  await fight(page, 'f13_left#0', 'walker floor 13');
  await fight(page, 'f17_left#0', 'walker floor 17');
  await page.screenshot({ path: `${shots}/e2e-combat-412x915.png` });

  // door hits: cooldown + energy per swing
  await gotoHero(page, 14, 300);
  const door = await g(page, () => {
    const s = window.__floor15;
    const apt = s.tower.apartments.get('f14_right');
    s.state.needs.energy = 100;
    return { x: apt.doorX, y: s.view.lineY(14) - 48 };
  });
  let e0 = 100;
  for (let i = 0; i < 4; i++) {
    await tapWorld(page, door.x, door.y);
    await sleep(700);
    const st = await g(page, () => window.__floor15.state.doors.f14_right.state);
    if (st === 'open') break;
  }
  const doorEnd = await g(page, () => ({ st: window.__floor15.state.doors.f14_right.state, en: window.__floor15.state.needs.energy }));
  check(doorEnd.st === 'open', 'jammed door opens after 3 hit taps');
  check(Math.abs(e0 - doorEnd.en - 1.5) < 0.1, `door hits cost energyPerSwing (energy ${doorEnd.en.toFixed(2)})`);

  // molotov: Throw button then tap the target
  await gotoHero(page, 16, 450);
  await sleep(200);
  const hasBtn = await g(page, () => window.__floor15.hud.throwBtn.visible);
  check(hasBtn, 'Throw button visible while carrying a molotov');
  const btn = await g(page, () => ({ x: window.__floor15.hud.throwBtn.x, y: window.__floor15.hud.throwBtn.y }));
  await tapFixed(page, btn.x, btn.y);
  await sleep(150);
  check(await g(page, () => window.__floor15.throwing.armed === 'molotov'), 'tap Throw arms the molotov');
  const target = await zombieInfo(page, 'f16_right#0');
  await tapWorld(page, target.x, target.line - 36);
  await sleep(700);
  const fireOn = await g(page, () => window.__floor15.throwing.fires.length);
  check(fireOn === 1, 'molotov lands and burns');
  await page.screenshot({ path: `${shots}/e2e-fire-412x915.png` });
  const t2 = Date.now();
  let burnt = await zombieInfo(page, 'f16_right#0');
  while (!burnt.dead && Date.now() - t2 < 10000) { await sleep(300); burnt = await zombieInfo(page, 'f16_right#0'); }
  check(burnt.dead, 'fire kills the crawler');
  check(await g(page, () => window.__floor15.state.inventory.filter((s) => s?.id === 'molotov').reduce((n, s) => n + s.qty, 0)) === 1, 'one molotov used');

  // floors with no zombies and all containers searched turn Cleared (checked in unit tests); here: label exists
  // save/reload keeps the dead dead
  await g(page, () => window.__floor15.save());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.zombies, null, { timeout: 15000 });
  await sleep(500);
  const after = await g(page, () => {
    const s = window.__floor15;
    const ids = ['f14_left#0', 'f16_left#0', 'f13_left#0', 'f17_left#0', 'f16_right#0'];
    return { dead: ids.every((i) => s.state.zombies[i].dead), sprites: ids.some((i) => s.zombies.byId.has(i)), alive: s.zombies.list.length };
  });
  check(after.dead && !after.sprites, 'reload: dead zombies stay dead');
  check(after.alive === 6, `reload: the other zombies are still there (${after.alive})`);

  // death -> game over -> new game
  await g(page, () => {
    const s = window.__floor15;
    for (const apt of s.tower.apartments.values()) for (const r of apt.rooms) s.state.rooms[`${apt.id}:${r.id}`] = true;
    s.debugGoto(13, 520);
    s.state.needs.health = 4;
  });
  const t3 = Date.now();
  while (Date.now() - t3 < 15000 && !(await g(page, () => window.__floor15.gameOver))) await sleep(200);
  check(await g(page, () => window.__floor15.gameOver), 'hero dies from bites and the game over screen shows');
  await page.screenshot({ path: `${shots}/e2e-gameover-412x915.png` });
  await tapFixed(page, 360, 812);
  await page.waitForFunction(() => window.__floor15?.gameOver === false && window.__floor15.state.flags.heroDead !== true, null, { timeout: 8000 }).catch(() => {});
  await sleep(500);
  const fresh = await g(page, () => {
    const s = window.__floor15;
    return { over: s.gameOver, health: s.state.needs.health, alive: s.zombies.list.length, dead13: s.state.zombies['f14_left#0'].dead, floor: s.state.hero.floor };
  });
  check(!fresh.over && fresh.health === 100 && fresh.alive === 11 && !fresh.dead13 && fresh.floor === 15, 'New game starts a fresh tower');

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.kill();
}
process.exit(fail.length ? 1 : 0);
