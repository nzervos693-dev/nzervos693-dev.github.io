/*
 * E2E for the isometric Stage A gameplay (not part of `npm test`): action menu and search, zombie combat
 * with hit feedback, closing a door, forcing a jammed door, crafting the home barricade, save/continue and
 * the stale side-view save popup. Run: npm run test:e2e (builds dist-e2e with debug hooks).
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 4183;
const shots = process.env.E2E_SHOTS || 'tests/screenshots';
mkdirSync(shots, { recursive: true });
let server = null;
let url = process.env.E2E_URL;
if (!url) { server = await serve('dist-e2e', PORT); url = server.url; }
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  const noise = /WebGL|GL Driver|GroupMarker/;
  page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const E = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);
  const boot = async (q = '?debug') => {
    await page.goto(`${url}${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 15000 });
    await sleep(700);
  };
  const tapId = async (id) => { const p = await E((i) => window.__floor15.debugClientOf(i), id); if (!p) throw new Error(`no target ${id}`); await page.touchscreen.tap(p.x, p.y); };

  await boot();

  // ---- action menu: tap the fridge, press Search
  await E(() => { const g = window.__floor15; g.debugGoto(2, 6); g.hero.facing = 90; });
  await sleep(500);
  await tapId('f15NW-3.9');
  await sleep(300);
  check(await E(() => window.__floor15.menu.isOpen), 'tapping a Visible fridge opens the action menu');
  const sb = await E(() => window.__floor15.debugMenuButton(0));
  await page.touchscreen.tap(sb.x, sb.y);
  await page.waitForFunction(() => window.__floor15.state.objects['f15NW-3.9']?.searched, null, { timeout: 15000 });
  check(await E(() => window.__floor15.state.inventory.some((s) => s?.id === 'canned_food')), 'search gave the fridge loot (canned food)');
  await page.screenshot({ path: `${shots}/e2e-iso-search-360x800.png` });

  // ---- combat: open the SW front door and the interior door, face the walker, hit it
  await E(() => { const g = window.__floor15; g.grid.setDoorState(g.world.doors.find((d) => d.id === 'f15SW-7.0.N'), 'open'); g.debugGoto(3, 17); g.hero.facing = 90; g.updateVision(true); });
  await sleep(900);
  check(await E(() => window.__floor15.zombies.get('f15SW-z1').visible), 'a zombie in the hero\'s view is drawn');
  check(!(await E(() => window.__floor15.zombies.get('f15NE-z1').visible)), 'a zombie out of sight is not drawn');
  await tapId('f15SW-z1');
  await page.waitForFunction(() => (window.__floor15.zombies.get('f15SW-z1')?.rec.hp ?? 0) < 45, null, { timeout: 15000 }).catch(() => {});
  const hp = await E(() => window.__floor15.zombies.get('f15SW-z1')?.rec.hp);
  check(hp !== undefined && hp < 45, `tap on a zombie walks up and swings (walker hp ${hp}/45, unaware hit x3)`);
  check(await E(() => { const n = window.__floor15.actors.nextBlood; return n.fx_blood + n.fx_blood_small > 0; }), 'the hit sprays blood');
  await page.screenshot({ path: `${shots}/e2e-iso-combat-360x800.png` });
  for (let i = 0; i < 8; i++) {
    const alive = await E(() => !!window.__floor15.zombies.get('f15SW-z1'));
    if (!alive) break;
    await tapId('f15SW-z1').catch(() => {});
    await sleep(700);
  }
  check(await E(() => window.__floor15.state.stats.zombiesKilled >= 1), 'the walker can be killed');

  // ---- close a door: the interior kitchen door (open) is tapped, Close pressed
  await E(() => { const g = window.__floor15; g.debugGoto(3, 16); g.hero.facing = 90; g.zombies.resetAll(); g.updateVision(true); });
  await sleep(500);
  const doorState = () => E(() => window.__floor15.world.doors.find((d) => d.id === 'f15SW-2.5.N').state);
  check((await doorState()) === 'open', 'interior door starts open');
  await tapId('f15SW-2.5.N');
  await sleep(300);
  if (await E(() => window.__floor15.menu.isOpen)) {
    const cb = await E(() => window.__floor15.debugMenuButton(0));
    await page.touchscreen.tap(cb.x, cb.y);
    await page.waitForFunction(() => window.__floor15.world.doors.find((d) => d.id === 'f15SW-2.5.N').state === 'closed', null, { timeout: 15000 });
    check(true, 'Close shuts the door (0.4 s action)');
  } else check(false, 'tapping an open door opens a menu');

  // ---- jammed front door: Force with hits (3 hits)
  await E(() => { const g = window.__floor15; g.debugGoto(24, 10); g.hero.facing = 180; g.updateVision(true); });
  await sleep(500);
  await tapId('f15NE-4.9.S');
  await sleep(300);
  const fb = await E(() => window.__floor15.debugMenuButton(0));
  check(!!fb, 'tapping a jammed door shows the Force button');
  if (fb) {
    await page.touchscreen.tap(fb.x, fb.y);
    await page.waitForFunction(() => window.__floor15.world.doors.find((d) => d.id === 'f15NE-4.9.S').state === 'open', null, { timeout: 20000 });
    check(true, 'three hits force the jammed door open');
  }

  // ---- crafting the barricade on the home front door
  await E(() => { const g = window.__floor15; g.debugGive('wood', 6); g.debugGive('metal', 3); g.debugGoto(6, 8); });
  const craft = await E(() => { const g = window.__floor15; g.onCraftTap('barricade_lv1'); const d = g.world.doors.find((x) => x.id === g.world.home.frontDoor); return { lvl: g.state.build.barricade.level, hp: d.barricade?.hp, own: d.barricade?.own }; });
  check(craft.lvl === 1 && craft.hp > 0 && craft.own === true, `Barricade Lv1 is built on the home front door (hp ${craft.hp})`);
  await sleep(600);
  await E(() => { const g = window.__floor15; g.debugGoto(6, 9); g.hero.facing = 90; g.updateVision(true); });
  await sleep(800);
  await page.screenshot({ path: `${shots}/e2e-iso-barricade-360x800.png` });

  // ---- save and continue: reload keeps hero tile, door states, memory
  await E(() => { const g = window.__floor15; g.save(); });
  const before = await E(() => { const g = window.__floor15; return { hx: Math.floor(g.hero.x), hy: Math.floor(g.hero.y), door: g.world.doors.find((d) => d.id === 'f15NE-4.9.S').state, seen: g.vision.seen.reduce((a, b) => a + b, 0), lvl: g.state.build.barricade.level }; });
  await boot();
  const after = await E(() => { const g = window.__floor15; return { hx: Math.floor(g.hero.x), hy: Math.floor(g.hero.y), door: g.world.doors.find((d) => d.id === 'f15NE-4.9.S').state, seen: g.vision.seen.reduce((a, b) => a + b, 0), lvl: g.state.build.barricade.level, bar: g.world.doors.find((d) => d.id === g.world.home.frontDoor).barricade?.hp }; });
  check(JSON.stringify([before.hx, before.hy, before.door, before.seen, before.lvl]) === JSON.stringify([after.hx, after.hy, after.door, after.seen, after.lvl]) && after.bar > 0, 'reload restores hero tile, door states, vision memory and the barricade');

  // ---- stale side-view save: popup, settings kept, New game
  await page.goto(`${url}manifest.webmanifest`, { waitUntil: 'load' }); // same origin, no game: nothing rewrites the save
  await E(() => {
    localStorage.setItem('floor15.save', JSON.stringify({ version: 1, lastSaveTime: Date.now(), settings: { muted: true }, game: { started: true, v: 1, hero: { floor: 15, x: 100 }, needs: { health: 50 } } }));
  });
  await page.goto(`${url}?debug&story`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__scenes?.Title, null, { timeout: 15000 });
  await sleep(600);
  const stale = await E(() => {
    const t = window.__scenes.Title;
    const texts = t.children.list.flatMap((c) => (c.type === 'Container' ? c.list : [c])).filter((c) => c.text).map((c) => c.text);
    return { texts, game: JSON.parse(localStorage.getItem('floor15.save')) };
  });
  check(stale.texts.includes('The building has changed.'), 'an old save shows "The building has changed."');
  check(stale.game.settings.muted === true && !stale.game.game?.started, 'the old game is dropped and the settings are kept');
  check(!stale.texts.includes('Continue'), 'there is no Continue after a stale save, only New game');
  await page.screenshot({ path: `${shots}/e2e-iso-stale-360x800.png` });

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
