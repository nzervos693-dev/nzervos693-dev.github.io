/*
 * E2E for the isometric Stage A gameplay (not part of `npm test`), driven by the context action buttons: search,
 * quick-use and its picker, shove and zombie combat with hit feedback (hold to repeat), closing a door, forcing a
 * jammed door, crafting and placing the home barricade, save/continue and the stale side-view save popup. Run: npm run test:e2e (builds dist-e2e with debug hooks).
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
  /** Wait until the hero's target is this id (a door, object or zombie id), then let the buttons settle. */
  const waitTarget = async (id, ms = 8000) => {
    try { await page.waitForFunction((i) => window.__floor15.targeting.entry?.id === i, id, { timeout: ms }); } catch (e) {
      const d = await E(() => { const g = window.__floor15; return { entry: g.targeting.entry?.id, hero: [g.hero.x, g.hero.y, g.hero.facing], action: g.action?.spec.kind, sleeping: g.sleeping, panels: g.anyPanelOpen(), placing: !!g.placing, zs: g.zombies.list.map((z) => [z.rec.id, +z.rec.x.toFixed(2), +z.rec.y.toFixed(2), z.visible, z.ai.mode, z.ai.stun]), hp: g.state.needs.health }; });
      throw new Error(`no target ${id}: ${JSON.stringify(d)}`);
    }
    await sleep(200);
  };
  /** Press an action button with a real touch. */
  const press = async (name) => { const p = await E((n) => window.__floor15.debugButton(n), name); await page.touchscreen.tap(p.x, p.y); };
  /** Stand beside a door's edge facing it. */
  const standAt = (id) => E((i) => { const g = window.__floor15; const d = g.world.doors.find((x) => x.id === i); if (d.side === 'N') { g.debugGoto(d.x, d.y); g.hero.facing = 270; } else { g.debugGoto(d.x, d.y); g.hero.facing = 180; } g.updateVision(true); }, id);

  await boot();

  // ---- search: stand at the fridge (it becomes the target), Main shows Search, press it
  await E(() => { const g = window.__floor15; g.debugGoto(3, 8); g.hero.facing = 90; });
  await waitTarget('f15NW-3.9');
  check(await E(() => { const m = window.__floor15.slots.main; return m?.id === 'search' && m.icon === 'search'; }), 'the fridge is the target and Main shows Search');
  check(await E(() => window.__floor15.slots.secondary?.id === 'dismantle'), 'Secondary shows Dismantle');
  await press('main');
  await page.waitForFunction(() => window.__floor15.state.objects['f15NW-3.9']?.searched, null, { timeout: 15000 });
  check(await E(() => window.__floor15.state.inventory.some((s) => s?.id === 'canned_food')), 'search gave the fridge loot (canned food)');
  await sleep(300);
  check(await E(() => window.__floor15.slots.main?.icon === 'search_empty' && !window.__floor15.slots.main.enabled), 'after the search Main is the greyed empty-search icon');
  check(await E(() => window.__floor15.quick.cooldown === 0 && window.__floor15.state.quickUse.id === 'canned_food'), 'the quick-use slot auto-filled with the canned food he now carries');
  await page.screenshot({ path: `${shots}/e2e-iso-search-360x800.png` });

  // ---- quick-use: eat (Not now. when full, uses one when hungry), picker
  await E(() => { const g = window.__floor15; g.tickClock = () => {}; g.state.needs.food = 100; }); // freeze the needs clock: food drains the moment it is below 100
  await press('quick');
  await sleep(300);
  check((await E(() => window.__floor15.toast.text?.text)) === 'Not now.' && (await E(() => window.__floor15.state.inventory.some((s) => s?.id === 'canned_food'))), 'quick-use with everything full shows "Not now." and keeps the item');
  await E(() => { window.__floor15.state.needs.food = 20; });
  await press('quick');
  await sleep(300);
  check(await E(() => window.__floor15.state.needs.food >= 49 && !window.__floor15.state.inventory.some((s) => s?.id === 'canned_food')), 'quick-use eats one canned food');
  check(await E(() => window.__floor15.quick.cooldown > 0), 'the 1 s cooldown runs');
  await E(() => { const g = window.__floor15; g.debugGive('water_bottle', 2); g.debugGive('chocolate', 1); });
  const qb = await E(() => window.__floor15.debugButton('quick'));
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: qb.x, y: qb.y, id: 1 }] });
  await sleep(900);
  const picker = await E(() => window.__floor15.buttons.pickerOpen);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check(picker === true, 'long-pressing the quick-use slot opens the picker');
  await page.screenshot({ path: `${shots}/e2e-iso-picker-360x800.png` });
  check(await E(() => window.__floor15.buttons.picker.length) >= 3, 'the picker lists the carried types plus the empty cell');
  await page.touchscreen.tap(10, 300); // anywhere else closes it
  await sleep(300);
  check(!(await E(() => window.__floor15.buttons.pickerOpen)), 'tapping elsewhere closes the picker');
  await E(() => window.__floor15.onQuickPick('chocolate'));
  check(await E(() => window.__floor15.state.quickUse.id === 'chocolate' && window.__floor15.state.quickUse.chosen), 'a chosen type is kept');

  // ---- combat: open the SW front door, face the walker, shove it, hit it with Main and the Attack button
  await E(() => { const g = window.__floor15; g.grid.setDoorState(g.world.doors.find((d) => d.id === 'f15SW-7.0.N'), 'open'); g.debugGoto(3, 17); g.hero.facing = 90; g.updateVision(true); });
  await sleep(900);
  check(await E(() => window.__floor15.zombies.get('f15SW-z1').visible), 'a zombie in the hero\'s view is drawn');
  check(!(await E(() => window.__floor15.zombies.get('f15NE-z1').visible)), 'a zombie out of sight is not drawn');
  await E(() => { const g = window.__floor15; const z = g.zombies.get('f15SW-z1'); z.rec.x = 3.5; z.rec.y = 19.0; z.ai.pause = 9999; z.ai.mode = 'idle'; z.ai.noticed = false; z.ai.path = null; g.debugGoto(3, 18); g.hero.facing = 90; });
  await waitTarget('f15SW-z1');
  check(await E(() => window.__floor15.slots.main?.id === 'attack' && window.__floor15.slots.secondary?.id === 'shove'), 'a zombie target shows Attack on Main and Shove on Secondary');
  await page.screenshot({ path: `${shots}/e2e-iso-target-zombie-360x800.png` });
  const sh0 = await E(() => { const g = window.__floor15; const z = g.zombies.get('f15SW-z1'); return { d: Math.hypot(z.rec.x - g.hero.x, z.rec.y - g.hero.y), e: g.state.needs.energy }; });
  await press('secondary');
  await sleep(250);
  const sh1 = await E(() => { const g = window.__floor15; const z = g.zombies.get('f15SW-z1'); return { d: Math.hypot(z.rec.x - g.hero.x, z.rec.y - g.hero.y), e: g.state.needs.energy, stun: z.ai.stun, cd: g.shoveCd.left, hp: z.rec.hp }; });
  check(sh1.d - sh0.d > 0.3 && sh1.d - sh0.d < 0.7 && sh1.stun > 0 && sh1.hp === 45, `Shove pushes it ${(sh1.d - sh0.d).toFixed(2)} tiles, stuns it, no damage`);
  check(sh0.e - sh1.e > 0.8 && sh1.cd > 1, 'Shove costs 1 energy and starts its 2.5 s cooldown');
  await press('secondary');
  await sleep(200);
  const nyTxt = await E(() => window.__floor15.toast.text?.text);
  check(nyTxt === 'Not yet.', `a second Shove during the cooldown shows "Not yet." (${nyTxt})`);
  await E(() => { const g = window.__floor15; const z = g.zombies.get('f15SW-z1'); z.rec.x = 3.5; z.rec.y = 19.3; z.ai.stun = 0; });
  await sleep(300);
  await press('main');
  await page.waitForFunction(() => (window.__floor15.zombies.get('f15SW-z1')?.rec.hp ?? 0) < 45, null, { timeout: 15000 }).catch(() => {});
  const hp = await E(() => window.__floor15.zombies.get('f15SW-z1')?.rec.hp);
  check(hp !== undefined && hp < 45, `Main (Attack) swings at the targeted zombie (walker hp ${hp}/45)`);
  check(await E(() => { const n = window.__floor15.actors.nextBlood; return n.fx_blood + n.fx_blood_small > 0; }), 'the hit sprays blood');
  await page.screenshot({ path: `${shots}/e2e-iso-combat-360x800.png` });
  for (let i = 0; i < 14; i++) {
    const alive = await E(() => !!window.__floor15.zombies.get('f15SW-z1'));
    if (!alive) break;
    await press(i % 2 ? 'attack' : 'main').catch(() => {});
    await sleep(600);
  }
  check(await E(() => window.__floor15.state.stats.zombiesKilled >= 1), 'the walker can be killed with the buttons');
  // holding Attack repeats the swing every cooldown
  await E(() => { const g = window.__floor15; g.state.needs.energy = 90; g.combat.cd = 0; });
  const ab = await E(() => window.__floor15.debugButton('attack'));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ab.x, y: ab.y, id: 1 }] });
  await sleep(1500);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const en = await E(() => window.__floor15.state.needs.energy);
  check(90 - en >= 1.4, `holding Attack repeats the swing (energy 90 -> ${en.toFixed(1)}, 0.5 per swing)`);

  // ---- throwing: the first quick-use tap arms (landing ellipse), the second throws; the molotov lands 0.5 s later
  await E(() => { const g = window.__floor15; g.debugGive('molotov', 2); g.onQuickPick('molotov'); g.debugGoto(3, 17); g.hero.facing = 90; g.combat.cd = 0; });
  await sleep(300);
  await press('quick');
  await sleep(300);
  check(await E(() => window.__floor15.quick.armed && window.__floor15.throw.g.visible), 'the first tap on a throwable arms it and shows the landing ellipse');
  await press('main'); // any Main / Secondary tap disarms and keeps the item
  await sleep(300);
  check(await E(() => !window.__floor15.quick.armed && !window.__floor15.throw.g.visible && window.__floor15.state.inventory.some((s) => s?.id === 'molotov' && s.qty === 2)), 'a Main tap disarms and keeps the molotov');
  await press('quick');
  await sleep(200);
  await press('quick');
  await sleep(1200);
  check(await E(() => window.__floor15.state.inventory.some((s) => s?.id === 'molotov' && s.qty === 1) && window.__floor15.throw.patches.length === 1), 'the second tap throws it and a fire patch burns where it lands');
  await E(() => { window.__floor15.throw.patches.length = 0; });

  // ---- close a door: stand at the open kitchen door, Main shows Close
  await E(() => { const g = window.__floor15; g.zombies.resetAll(); g.debugGoto(2, 16); g.hero.x = 2.9; g.hero.facing = 129; g.updateVision(true); }); // a chair stands in front of the door: aim at the door itself
  await sleep(500);
  const doorState = () => E(() => window.__floor15.world.doors.find((d) => d.id === 'f15SW-2.5.N').state);
  check((await doorState()) === 'open', 'interior door starts open');
  await waitTarget('f15SW-2.5.N');
  check(await E(() => window.__floor15.slots.main?.id === 'close' && window.__floor15.slots.main.icon === 'close_door'), 'an open door shows Close on Main');
  await press('main');
  await page.waitForFunction(() => window.__floor15.world.doors.find((d) => d.id === 'f15SW-2.5.N').state === 'closed', null, { timeout: 15000 });
  check(true, 'Close shuts the door (0.4 s action)');
  await sleep(300);
  check(await E(() => window.__floor15.slots.main?.id === 'open'), 'the closed door now shows Open');

  // ---- jammed front door: Main tries the handle, Secondary forces it (3 hits)
  await standAt('f15NE-4.9.S');
  await waitTarget('f15NE-4.9.S');
  check(await E(() => window.__floor15.slots.main?.id === 'open' && window.__floor15.slots.secondary?.id === 'force'), 'a jammed door shows Open and Force');
  await press('main');
  await sleep(300);
  check((await E(() => window.__floor15.toast.text?.text)) === "It's stuck.", 'Main on a jammed door says "It\'s stuck."');
  for (let k = 0; k < 4; k++) {
    if ((await E(() => window.__floor15.world.doors.find((d) => d.id === 'f15NE-4.9.S').state)) === 'open') break;
    await press('secondary');
    await sleep(900);
  }
  check((await E(() => window.__floor15.world.doors.find((d) => d.id === 'f15NE-4.9.S').state)) === 'open', 'three Force hits open the jammed door');

  // ---- placement: craft the barricade, panel closes, walk to the door, ghost, Cancel then Place
  await E(() => { const g = window.__floor15; g.debugGive('wood', 6); g.debugGive('metal', 3); g.debugGoto(6, 9); g.hero.facing = 90; g.updateVision(true); });
  await E(() => window.__floor15.craftPanel.open());
  await E(() => window.__floor15.onCraftTap('barricade_lv1'));
  await sleep(300);
  check(await E(() => !!window.__floor15.placing && !window.__floor15.craftPanel.isOpen), 'crafting a barricade closes the panel and enters placement mode');
  check(await E(() => window.__floor15.state.build.barricade.level === 0), 'nothing is paid or built yet');
  await waitTarget('spot:f15NW-6.9.S');
  check(await E(() => window.__floor15.slots.main?.id === 'place' && window.__floor15.slots.secondary?.id === 'cancel'), 'the targeted spot shows Place and Cancel');
  check(await E(() => window.__floor15.view.doors.get('f15NW-6.9.S').rec.ghost > 0), 'the door shows the barricade ghost');
  await page.screenshot({ path: `${shots}/e2e-iso-placement-360x800.png` });
  await press('secondary');
  await sleep(300);
  check(await E(() => !window.__floor15.placing && window.__floor15.state.inventory.filter((s) => s?.id === 'wood').reduce((n, s) => n + s.qty, 0) >= 6), 'Cancel leaves placement mode and costs nothing');
  await E(() => window.__floor15.onCraftTap('barricade_lv1'));
  await waitTarget('spot:f15NW-6.9.S');
  await press('main');
  await sleep(500);
  const craft = await E(() => { const g = window.__floor15; const d = g.world.doors.find((x) => x.id === g.world.home.frontDoor); return { lvl: g.state.build.barricade.level, hp: d.barricade?.hp, own: d.barricade?.own, placing: !!g.placing, zs: g.zombies.list.map((z) => [z.rec.id, +z.rec.x.toFixed(2), +z.rec.y.toFixed(2), z.visible, z.ai.mode, z.ai.stun]), hp: g.state.needs.health }; });
  check(craft.lvl === 1 && craft.hp > 0 && craft.own === true && !craft.placing, `Place builds Barricade Lv1 on the home front door (hp ${craft.hp})`);
  await sleep(300);
  await waitTarget('f15NW-6.9.S').catch(() => {});
  check(await E(() => window.__floor15.slots.main?.id === 'inspect'), 'the barricaded front door now shows Inspect on Main');
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
