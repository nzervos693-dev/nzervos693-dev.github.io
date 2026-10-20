/*
 * E2E crafting test (also run by `npm run test:e2e`). Needs the e2e build (npm run build:e2e) and a Chromium
 * (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). Env: E2E_URL, E2E_SHOTS like smoke.mjs. 412x915 with touch input.
 * Uses the ?debug hooks (window.__floor15) only to read state, give items, spawn a zombie and rewind the
 * save clock; walking, dismantling, searching, crafting, placing, fighting and collecting are real taps.
 *
 * Flow: dismantle chair + table, search the drawer, craft Barricade Lv1 at the workbench (auto-placed),
 * a zombie spawned outside on floor 15 is blocked and damages it, the hero can walk through it,
 * craft + place a rain collector, rewind the clock 7 h, reload, collect, dismantle for the refund.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 4181;
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('preview server did not start (run npm run build:e2e first)');
}

const g = (page, fn, arg) => page.evaluate(fn, arg);

async function toScreen(page, wx, wy, fixed = false) {
  return g(page, ([x, y, fx]) => {
    const s = window.__floor15;
    const r = document.querySelector('canvas').getBoundingClientRect();
    const k = r.width / 720;
    return { x: r.left + x * k, y: r.top + (y - (fx ? 0 : s.cameras.main.scrollY)) * k };
  }, [wx, wy, fixed]);
}
const tapWorld = async (page, wx, wy) => { const p = await toScreen(page, wx, wy); await page.touchscreen.tap(p.x, p.y); };
const tapFixed = async (page, gx, gy) => { const p = await toScreen(page, gx, gy, true); await page.touchscreen.tap(p.x, p.y); };

async function until(page, fn, arg, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await g(page, fn, arg)) return true;
    await sleep(150);
  }
  return false;
}

/** Tap a world object by its placement/spot data, centre of its 96 px target. */
const lineY = (page, floor) => g(page, (f) => window.__floor15.view.lineY(f), floor);

/** Tap the menu button with this label (world-space container). */
async function tapMenu(page, text) {
  const pos = await g(page, (t) => {
    const c = window.__floor15.menu.c;
    const b = c?.list.find((o) => o.list && o.list.some((k) => k.type === 'Text' && k.text === t));
    return b ? { x: b.x, y: b.y } : null;
  }, text);
  if (!pos) return false;
  await tapWorld(page, pos.x, pos.y);
  return true;
}

/** Open the Craft panel on the page with this recipe, select it and tap its action button. */
async function craftViaPanel(page, id) {
  check(await until(page, () => window.__floor15.craftPanel.isOpen, null, 12000), `workbench tap opens the Craft panel (${id})`);
  for (let i = 0; i < 6; i++) {
    const pos = await g(page, (rid) => window.__floor15.craftPanel.rowPos.get(rid) || null, id);
    if (pos) { await tapFixed(page, pos.x, pos.y); break; }
    const next = await g(page, () => { const b = window.__floor15.craftPanel.nextBtn; return b ? { x: b.x, y: b.y } : null; });
    if (!next) break;
    await tapFixed(page, next.x, next.y);
    await sleep(150);
  }
  await sleep(150);
  const sel = await g(page, () => window.__floor15.craftPanel.selected);
  check(sel === id, `recipe row ${id} selected by tap`);
  const btn = await g(page, () => { const b = window.__floor15.craftPanel.craftBtn; return b ? { x: b.x, y: b.y, a: b.alpha } : null; });
  check(btn && btn.a === 1, `${id}: craft button enabled`);
  if (btn) await tapFixed(page, btn.x, btn.y);
  await sleep(250);
}

const bagCount = (page, id) => g(page, (i) => window.__floor15.state.inventory.filter((s) => s?.id === i).reduce((n, s) => n + s.qty, 0), id);

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

  await page.goto(`${url}?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.zombies, null, { timeout: 15000 });
  await sleep(600);
  await g(page, () => {
    const s = window.__floor15;
    window.__barHits = 0;
    s.bus.on('barricade-hit', () => { window.__barHits++; });
  });
  const line = await lineY(page, 15);

  // ---- gather wood and metal with real taps
  await tapWorld(page, 168, line - 48); // chair: one action, starts straight away
  check(await until(page, () => window.__floor15.state.objects["f15L-01"]?.dismantled, null, 20000), 'chair dismantled by tap');
  await tapWorld(page, 270, line - 48); // table
  check(await until(page, () => window.__floor15.state.objects['f15L-02']?.dismantled, null, 25000), 'table dismantled by tap');
  await tapWorld(page, 270, line - 84 - 48); // kitchen drawer: Search / Dismantle menu
  check(await until(page, () => window.__floor15.menu.isOpen, null, 10000), 'drawer tap opens the action menu');
  check(await tapMenu(page, 'Search'), 'Search button tapped');
  check(await until(page, () => window.__floor15.state.objects['f15L-05']?.searched, null, 15000), 'drawer searched');
  check(await bagCount(page, 'wood') === 6 && await bagCount(page, 'metal') === 2, `bag holds 6 wood + 2 metal (${await bagCount(page, 'wood')}/${await bagCount(page, 'metal')})`);

  // ---- craft Barricade Lv1 at the workbench
  await tapWorld(page, 372, line - 84 - 48);
  await craftViaPanel(page, 'barricade_lv1');
  const bar = await g(page, () => ({ ...window.__floor15.state.build.barricade, wood: 0 }));
  check(bar.level === 1 && bar.hp === 100, `Barricade Lv1 built at full HP (${JSON.stringify(bar)})`);
  check(await bagCount(page, 'wood') === 1 && await bagCount(page, 'metal') === 0, 'materials were spent (1 wood left)');
  check(await g(page, () => window.__floor15.view.barricade?.img.visible === true), 'barricade sprite is drawn');
  await page.screenshot({ path: `${shots}/e2e-craft-panel-412x915.png` });
  await g(page, () => window.__floor15.craftPanel.close());

  // ---- a zombie outside is blocked and damages it
  await g(page, () => {
    const s = window.__floor15;
    s.state.needs.health = 100;
    s.debugGoto(15, 200);
    const rec = { id: 'wander:e2e', type: 'crawler', floor: 15, x: 40, homeX: 40, hp: 15, dead: false };
    s.state.zombies[rec.id] = rec;
    s.zombies.add(rec, true);
  });
  await sleep(6500);
  const z = await g(page, () => {
    const s = window.__floor15;
    return { x: s.state.zombies['wander:e2e'].x, hp: s.state.build.barricade.hp, health: s.state.needs.health, hits: window.__barHits, mode: s.zombies.get('wander:e2e').ai.mode };
  });
  check(z.x <= 88.5 && z.x > 60, `zombie is held outside the barricade (x ${z.x.toFixed(1)})`);
  check(z.hp < 100 && z.hits >= 2, `zombie damaged the barricade (${z.hp}/100 HP, ${z.hits} hits)`);
  check(z.health === 100, 'hero was not bitten through the barricade');
  await page.screenshot({ path: `${shots}/e2e-barricade-412x915.png` });

  // kill it with taps, then walk through the barricade
  const t1 = Date.now();
  while (Date.now() - t1 < 30000) {
    const zi = await g(page, () => { const r = window.__floor15.state.zombies['wander:e2e']; return { dead: !r || r.dead, x: r?.x ?? 0 }; }); // wanderer records vanish when killed
    if (zi.dead) break;
    await g(page, () => { window.__floor15.state.needs.health = 100; });
    await tapWorld(page, zi.x, line - 36);
    await sleep(450);
  }
  check(await g(page, () => window.__floor15.state.zombies['wander:e2e']?.dead ?? true), 'zombie killed with taps through the barricade');
  await tapWorld(page, 62, line - 20); // stairwell side of the barricade (x < 100)
  check(await until(page, () => window.__floor15.state.hero.x < 90, null, 8000), 'the hero walks through his own barricade');

  // ---- rain collector: craft, place, offline production
  // window spots live in f15_right: clear that flat (debug hooks) so its spots open up (GDD 5.3 / 5.6)
  await g(page, () => {
    const s = window.__floor15;
    s.debugGive('plastic', 3); s.debugGive('metal', 2);
    s.state.doors.f15_right.state = 'open';
    for (const id of ['f15R-01', 'f15R-02', 'f15R-03', 'f15R-04', 'f15R-05', 'f15R-06']) s.state.objects[id] = { searched: true, dismantled: true };
    const rt = s.zombies.get('f15_right#0');
    if (rt) s.zombies.kill(rt);
    for (const r of s.tower.apartments.get('f15_right').rooms) s.state.rooms[`f15_right:${r.id}`] = true;
    s.view.refresh();
    s.debugGoto(15, 300);
  });
  check(await g(page, () => window.__floor15.inHome() === true), 'hero at x 300 is at home');
  await sleep(300);
  await tapWorld(page, 372, line - 84 - 48);
  await craftViaPanel(page, 'rain_collector');
  check(await g(page, () => window.__floor15.placement.active), 'placement mode starts after crafting a placeable');
  const spots = await g(page, () => window.__floor15.placement.spots.map((s) => ({ x: s.x, cy: s.cy, key: s.key })));
  check(spots.length === 2 && spots.every((s) => s.key.includes(':w')) && spots[0].x === 468, 'two window spots (right flat) are highlighted');
  check(await g(page, () => window.__floor15.state.build.spots['15:w1'] === undefined), 'nothing is spent before a spot is chosen');
  await page.screenshot({ path: `${shots}/e2e-placement-412x915.png` });
  await tapWorld(page, spots[0].x, spots[0].cy);
  await sleep(300);
  const placed = await g(page, () => window.__floor15.state.build.spots['15:w1']?.id);
  check(placed === 'rain_collector', 'tap on a spot places the rain collector');
  check(await g(page, () => window.__floor15.view.built.has('15:w1')), 'placed object is drawn');
  check(await bagCount(page, 'plastic') === 0, 'rain collector cost was paid');

  await g(page, () => window.__floor15.save());
  await page.addInitScript(() => {
    if (sessionStorage.getItem('rewound')) return;
    sessionStorage.setItem('rewound', '1');
    const d = JSON.parse(localStorage.getItem('floor15.save'));
    const h = 7 * 3600 * 1000;
    d.lastSaveTime -= h;
    d.game.times.lastTickAt -= h;
    localStorage.setItem('floor15.save', JSON.stringify(d));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.zombies, null, { timeout: 15000 });
  await sleep(600);
  const away = await g(page, () => {
    const s = window.__floor15;
    return {
      stored: s.state.build.spots['15:w1'].stored,
      popup: s.popup.isOpen,
      lines: (s.popup.c?.list || []).filter((o) => o.type === 'Text').map((o) => o.text),
      barricade: s.state.build.barricade,
    };
  });
  check(away.stored === 2, `7 h offline made 2 clean water (${away.stored})`);
  check(away.popup && away.lines.some((l) => l.startsWith('Rain collector: +2 clean water')), `away report lists the rain collector (${away.lines.filter((l) => l.includes('Rain')).join('|')})`);
  check(away.barricade.level === 1, 'barricade persisted through reload');
  await g(page, () => window.__floor15.popup.close());

  // collect with Use
  await tapWorld(page, 468, line - 84 - 48);
  check(await until(page, () => window.__floor15.menu.isOpen, null, 8000), 'tap on the rain collector opens its menu');
  check(await g(page, () => window.__floor15.menu.c.list.length) >= 2, 'menu offers Collect and Dismantle');
  check(await tapMenu(page, 'Collect'), 'Collect button tapped');
  check(await until(page, () => window.__floor15.state.inventory.some((s) => s?.id === 'clean_water' && s.qty === 2), null, 10000), 'collected 2 clean water into the bag');
  check(await g(page, () => window.__floor15.state.build.spots['15:w1'].stored) === 0, 'collector is empty again');

  // dismantle for the 50% refund
  await tapWorld(page, 468, line - 84 - 48);
  check(await until(page, () => window.__floor15.menu.isOpen, null, 8000), 'menu opens again');
  check(await tapMenu(page, 'Dismantle'), 'Dismantle button tapped');
  check(await until(page, () => !window.__floor15.state.build.spots['15:w1'], null, 10000), 'collector dismantled');
  check(await bagCount(page, 'plastic') === 1 && await bagCount(page, 'metal') === 1, 'refund is 50% of the cost rounded down (1 plastic, 1 metal)');

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
