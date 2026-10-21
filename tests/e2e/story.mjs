/*
 * E2E story test (also run by `npm run test:e2e`). Needs the e2e build (npm run build:e2e, has debug hooks) and a
 * Chromium (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). Env: E2E_URL, E2E_SHOTS like smoke.mjs. 360x800 with touch.
 * URL is ?debug&story: the real title -> intro -> tutorial -> attacks flow. Debug hooks are used only to read state,
 * move the hero between floors, kill far-away zombies, give crafting materials and to shorten timers / rewind the
 * save clock; the title, intro, tutorial, fights, crafting, dialogue, Crew screen and pass the torch are real taps.
 *
 * Flow: new game -> intro (card, then Skip) -> tutorial (walk, fridge, chair, table, drawer, workbench ->
 * Barricade Lv1, door -> crawler killed) -> scripted attack online (diegetic cue, repelled) -> 9 h offline with a
 * breach and the away report -> Mara: talk, fetch the bag from 14, hand it over (no bed yet), build a Survivor bed,
 * she moves in; Guard job, talk, Steady hands -> 9 h offline again, repelled thanks to the Guard ->
 * hero dies -> pass the torch -> Mara dies -> game over -> New game -> intro -> skip tutorial -> Continue / New game
 * confirm on the title.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 4182;
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
const g = (page, fn, arg) => page.evaluate(fn, arg);
const HOUR = 3600 * 1000;

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await sleep(200);
  }
  throw new Error('preview server did not start (run npm run build:e2e first)');
}

/** Game px (720x1280 space) -> page px. `scroll` = subtract the Game camera (world coordinates). */
async function toScreen(page, x, y, world) {
  return g(page, ([px, py, w]) => {
    const r = document.querySelector('canvas').getBoundingClientRect();
    const k = r.width / 720;
    const cy = w ? window.__floor15.cameras.main.scrollY : 0;
    return { x: r.left + px * k, y: r.top + (py - cy) * k };
  }, [x, y, world]);
}
const tapFixed = async (page, x, y) => { const p = await toScreen(page, x, y, false); await page.touchscreen.tap(p.x, p.y); };
const tapWorld = async (page, x, y) => { const p = await toScreen(page, x, y, true); await page.touchscreen.tap(p.x, p.y); };

async function until(page, fn, arg, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await g(page, fn, arg)) return true;
    await sleep(150);
  }
  return false;
}

const lineY = (page, floor) => g(page, (f) => window.__floor15.view.lineY(f), floor);
const gameReady = (page, ms = 15000) => until(page, () => window.__floor15?.state && window.__floor15.sys.isActive(), null, ms);

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
  const btn = await g(page, () => { const b = window.__floor15.craftPanel.craftBtn; return b ? { x: b.x, y: b.y, a: b.alpha } : null; });
  check(btn && btn.a === 1, `${id}: craft button enabled`);
  if (btn) await tapFixed(page, btn.x, btn.y);
  await sleep(250);
}

/** Tap through an open dialogue until it closes. @returns {number} taps used */
async function readDialogue(page, label) {
  check(await until(page, () => window.__floor15.dialogue.isOpen, null, 12000), `${label}: dialogue opens`);
  let n = 0;
  while (n < 12 && await g(page, () => window.__floor15.dialogue.isOpen)) {
    await tapFixed(page, 360, 700);
    await sleep(200);
    n++;
  }
  return n;
}

const revealAll = (page) => g(page, () => {
  const s = window.__floor15;
  for (const apt of s.tower.apartments.values()) for (const r of apt.rooms) s.state.rooms[`${apt.id}:${r.id}`] = true;
  s.view.refresh();
});
const goto = (page, floor, x) => g(page, ([f, hx]) => { const s = window.__floor15; s.state.needs.health = Math.max(s.state.needs.health, 60); s.debugGoto(f, hx); }, [floor, x]);
const killZ = (page, id) => g(page, (zid) => { const s = window.__floor15; const rt = s.zombies.get(zid); if (rt) s.zombies.kill(rt); }, id);
const bagCount = (page, id) => g(page, (i) => window.__floor15.state.inventory.filter((s) => s?.id === i).reduce((n, s) => n + s.qty, 0), id);

/** Tap every living zombie matching a filter until none are left. */
async function killAll(page, filter, label, ms = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const targets = await g(page, (f) => {
      const s = window.__floor15;
      const out = [];
      for (const id in s.state.zombies) {
        const z = s.state.zombies[id];
        if (!z.dead && id.startsWith(f)) out.push({ id, x: z.x, floor: z.floor });
      }
      return out;
    }, filter);
    if (!targets.length) return true;
    await g(page, () => { window.__floor15.state.needs.health = 100; });
    const z = targets[0];
    const line = await lineY(page, z.floor);
    await tapWorld(page, z.x, line - 36);
    await sleep(450);
  }
  check(false, `${label}: all killed in time`);
  return false;
}

/** Rewind the save clock (applied at load, after the pagehide save) and put the next attack `attackAfterH` into the away time. */
async function reloadAway(page, hours, attackAfterH) {
  await g(page, () => window.__floor15.save());
  await g(page, ([h, a]) => sessionStorage.setItem('rewind', JSON.stringify({ hours: h, attackAfterH: a })), [hours, attackAfterH]);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__scenes?.Title, null, { timeout: 15000 });
  await sleep(300);
  const t = await g(page, () => ({ cont: !!window.__scenes.Title.buttons.continue }));
  check(t.cont, 'title offers Continue for the saved game');
  const c = await g(page, () => ({ x: window.__scenes.Title.buttons.continue.x, y: window.__scenes.Title.buttons.continue.y }));
  await tapFixed(page, c.x, c.y);
  check(await gameReady(page), 'Continue loads the game');
  await sleep(500);
}

const popupLines = (page) => g(page, () => {
  const s = window.__floor15;
  return s.popup.isOpen ? s.popup.c.list.filter((o) => o.type === 'Text').map((o) => o.text) : null;
});

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  await ctx.addInitScript(() => {
    const cfg = sessionStorage.getItem('rewind');
    if (!cfg) return;
    sessionStorage.removeItem('rewind');
    const { hours, attackAfterH } = JSON.parse(cfg);
    const d = JSON.parse(localStorage.getItem('floor15.save'));
    const h = hours * 3600 * 1000;
    d.lastSaveTime -= h;
    d.game.times.lastTickAt -= h;
    d.game.attacks.nextAt = d.game.times.lastTickAt + attackAfterH * 3600 * 1000;
    localStorage.setItem('floor15.save', JSON.stringify(d));
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('console.error:', m.text()); } });
  page.on('pageerror', (e) => { errors.push(String(e)); console.log('pageerror:', String(e)); });

  // ------------------------------------------------------------ title, intro
  await page.goto(`${url}?debug&story`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__scenes?.Title?.buttons, null, { timeout: 15000 });
  await sleep(400);
  const title = await g(page, () => {
    const b = window.__scenes.Title.buttons;
    const small = Object.values(b).every((x) => x.size.w >= 96 && x.size.h >= 96);
    return { cont: !!b.continue, newGame: { x: b.newGame.x, y: b.newGame.y }, small, sound: { x: b.sound.x, y: b.sound.y } };
  });
  check(!title.cont && title.small, 'title: only New game without a save, every button is at least 96 px');
  await page.screenshot({ path: `${shots}/e2e-title-360x800.png` });
  await tapFixed(page, title.sound.x, title.sound.y);
  await sleep(150);
  check(await g(page, () => window.__scenes.Title.buttons.sound.list.some((o) => o.type === 'Text' && o.text === 'Sound: OFF')), 'title: sound toggle works');
  await tapFixed(page, title.sound.x, title.sound.y);
  await tapFixed(page, title.newGame.x, title.newGame.y);
  check(await until(page, () => window.__scenes.Intro?.sys.isActive(), null, 8000), 'New game opens the intro');
  await sleep(700);
  const card1 = await g(page, () => window.__scenes.Intro.text.text);
  check(card1.length > 20, `intro card 1: "${card1.split('\n')[0]}"`);
  await page.screenshot({ path: `${shots}/e2e-intro-360x800.png` });
  await tapFixed(page, 360, 400);
  await sleep(300);
  check(await g(page, () => window.__scenes.Intro.i) === 1, 'tap advances to card 2');
  const skip = await g(page, () => ({ x: window.__scenes.Intro.skipBtn.x, y: window.__scenes.Intro.skipBtn.y }));
  await tapFixed(page, skip.x, skip.y);
  check(await gameReady(page), 'Skip goes straight to the game');
  await sleep(800);

  // ------------------------------------------------------------ tutorial
  const line = await lineY(page, 15);
  const tut = () => g(page, () => {
    const s = window.__floor15;
    const v = s.tutorialView;
    return { tutorial: s.state.story.tutorial, shown: v.shown, step: v.stepId, text: v.text.text, arrow: v.arrow.visible, ax: v.arrow.x };
  });
  let t = await tut();
  check(t.tutorial === 'active' && t.shown && t.step === 'walk' && t.text.includes('walk'), `tutorial starts with the walk hint ("${t.text}")`);
  check(await g(page, () => window.__floor15.state.attacks.nextAt === null), 'no attack is scheduled while the tutorial runs');
  await page.screenshot({ path: `${shots}/e2e-tutorial-walk-360x800.png` });
  await tapWorld(page, 310, line + 24);
  check(await until(page, () => window.__floor15.tutorialView.stepId === 'fridge', null, 8000), 'walking moves the hint to the fridge');
  t = await tut();
  check(t.arrow && Math.abs(t.ax - 168) < 6, `arrow points at the fridge (x ${Math.round(t.ax)})`);
  await page.screenshot({ path: `${shots}/e2e-tutorial-fridge-360x800.png` });
  await tapWorld(page, 168, line - 84 - 48);
  check(await until(page, () => window.__floor15.menu.isOpen, null, 8000), 'fridge tap opens the action menu');
  check(await tapMenu(page, 'Search'), 'Search tapped');
  check(await until(page, () => window.__floor15.tutorialView.stepId === 'chair', null, 15000), 'searching the fridge moves the hint to the chair');
  await tapWorld(page, 168, line - 48);
  check(await until(page, () => window.__floor15.state.objects['f15L-01']?.dismantled, null, 25000), 'chair dismantled');
  check(await until(page, () => window.__floor15.tutorialView.stepId === 'table', null, 5000), 'hint moves to the table');
  await tapWorld(page, 270, line - 48);
  check(await until(page, () => window.__floor15.state.objects['f15L-02']?.dismantled, null, 30000), 'table dismantled');
  check(await until(page, () => window.__floor15.tutorialView.stepId === 'drawer', null, 5000), 'hint moves to the kitchen drawer');
  await tapWorld(page, 270, line - 84 - 48);
  check(await until(page, () => window.__floor15.menu.isOpen, null, 8000), 'drawer tap opens the action menu');
  check(await tapMenu(page, 'Search'), 'drawer: Search tapped');
  check(await until(page, () => window.__floor15.tutorialView.stepId === 'workbench', null, 15000), 'hint moves to the workbench');
  await tapWorld(page, 372, line - 84 - 48);
  await craftViaPanel(page, 'barricade_lv1');
  check(await g(page, () => window.__floor15.state.build.barricade.level) === 1, 'Barricade Lv1 built');
  check(await until(page, () => window.__floor15.tutorialView.stepId === 'door', null, 5000), 'hint moves to the door');
  await g(page, () => window.__floor15.craftPanel.close());
  check(await g(page, () => window.__floor15.state.zombies['scripted:tutorial_crawler'] === undefined), 'no crawler before the door');
  await page.screenshot({ path: `${shots}/e2e-tutorial-door-360x800.png` });
  await tapWorld(page, 60, line + 24);
  check(await until(page, () => window.__floor15.state.zombies['scripted:tutorial_crawler'], null, 8000), 'walking out of the door spawns the tutorial crawler');
  check(await g(page, () => window.__floor15.state.zombies['scripted:tutorial_crawler'].homeX < window.__floor15.tower.barricadeX), 'the crawler spawns in the corridor, outside the barricade');
  check(await until(page, () => window.__floor15.tutorialView.stepId === 'fight', null, 3000), 'hint says fight');
  await killAll(page, 'scripted:', 'tutorial crawler');
  check(await until(page, () => window.__floor15.state.story.tutorial === 'done', null, 5000), 'killing the crawler ends the tutorial');
  const after = await g(page, () => {
    const s = window.__floor15;
    return { shown: s.tutorialView.shown, next: s.state.attacks.nextAt, now: Date.now(), kind: s.state.attacks.kind, hp: s.state.build.barricade.hp };
  });
  check(!after.shown, 'tutorial hint is gone');
  check(after.kind === 'scripted' && Math.abs(after.next - after.now - 600000) < 15000, `the scripted attack is set about 10 min out (${Math.round((after.next - after.now) / 1000)} s)`);

  // ------------------------------------------------------------ scripted attack, online, repelled
  await g(page, () => {
    const s = window.__floor15;
    window.__ev = [];
    for (const e of ['attack-cue', 'attack-stairwell', 'attack-start', 'attack-end', 'barricade-broken']) s.bus.on(e, (p) => window.__ev.push([e, p]));
    s.balance.attacks.cueSeconds = 5;
    s.balance.attacks.cue = { groanAtSeconds: 5, stairwellAtSeconds: 3, flickerFromSeconds: 3, stairwellAudibleFloors: 2 };
    s.balance.attacks.tuning = { spawnGapSeconds: 1.5 };
    s.state.build.barricade.hp = 1e6; // deterministic: the test's tap speed must not decide whether it holds
    s.state.needs.morale = 50;
    s.debugGoto(15, 250);
    s.state.attacks.nextAt = Date.now() + 7000;
  });
  check(await until(page, () => window.__floor15.attacks.phase === 'cue', null, 6000), 'the cue phase starts before the attack');
  const noUi = await g(page, () => { const a = window.__floor15.attacks; return { banner: !!(a.bg || a.text || a.tint) }; });
  check(!noUi.banner, 'there is no banner, countdown or tint object any more');
  const dips = new Set();
  for (let i = 0; i < 30; i++) { dips.add((await g(page, () => window.__floor15.view.landingShade.alpha)).toFixed(2)); await sleep(60); }
  check(dips.size > 1, `the landing light flickers (${dips.size} different dips)`);
  await page.screenshot({ path: `${shots}/e2e-attack-warning-360x800.png` });
  check(await until(page, () => window.__floor15.attacks.phase === 'fight', null, 8000), 'attackers arrive after the cue');
  check(await g(page, () => window.__floor15.state.attacks.current?.total === Object.values(window.__floor15.balance.attacks.scripted.zombies).reduce((a, b) => a + b, 0)), 'scripted attack has the attackers from balance.attacks.scripted');
  await sleep(2500);
  await page.screenshot({ path: `${shots}/e2e-attack-fight-360x800.png` });
  await killAll(page, 'attack:', 'attackers', 60000);
  check(await until(page, () => window.__floor15.attacks.phase === 'idle', null, 6000), 'attack ends when all attackers are dead');
  const res = await g(page, () => {
    const s = window.__floor15;
    return { ev: window.__ev.map((e) => e[0]), end: window.__ev.find((e) => e[0] === 'attack-end')?.[1], a: s.state.attacks, morale: s.state.needs.morale, now: Date.now(), left: Object.keys(s.state.zombies).filter((k) => k.startsWith('attack:')).length };
  });
  check(res.ev.includes('attack-cue') && res.ev.includes('attack-stairwell') && res.ev.includes('attack-start') && res.ev.includes('attack-end'), 'cue, stairwell, start and end events fired');
  check(res.end?.kind === 'scripted' && res.end.repelled === true, 'the scripted attack was repelled');
  check(res.a.scriptedDone && res.a.current === null && res.a.kind === 'scheduled', 'scripted attack resolved; a scheduled one follows');
  const h = (res.a.nextAt - res.now) / HOUR;
  check(h > 5.9 && h < 10.1, `next attack in ${h.toFixed(1)} h (8 +/- 2)`);
  check(res.morale >= 54.9 && res.left === 0, `repelled gives +5 morale (${res.morale}); no attacker records left`);

  // ------------------------------------------------------------ offline attack, breach, report
  const pre = await g(page, () => { const s = window.__floor15; s.state.needs.food = 100; s.state.needs.water = 100; s.state.needs.health = 100; s.state.build.barricade.hp = s.balance.barricade.levels[0].hp; return { morale: s.state.needs.morale }; });
  await reloadAway(page, 9, 2);
  const away = await g(page, () => {
    const s = window.__floor15;
    return { hp: s.state.build.barricade.hp, health: s.state.needs.health, morale: s.state.needs.morale, lines: s.popup.isOpen ? s.popup.c.list.filter((o) => o.type === 'Text').map((o) => o.text) : null, a: s.state.attacks };
  });
  check(Array.isArray(away.lines) && away.lines[0] === 'While you were away', 'away report popup opens');
  const awayText = (away.lines || []).join(' | ');
  check(/Around \d\d:\d\d something broke through/.test(awayText), `report describes the attack in prose (${awayText})`);
  check(!/strength|defense|HP|->/i.test(awayText), 'report has no strength, defense or HP numbers');
  check(away.lines?.some((l) => l.includes('They got in.')) && away.lines?.some((l) => l === 'You are hurt.'), 'report says they got in and who was hurt');
  check(away.hp === 0, 'the barricade fell');
  check(away.health >= 10, `health floor holds (${Math.round(away.health)})`);
  check(away.a.nextAt > Date.now() - HOUR, 'next attack was scheduled after the offline one');
  await page.screenshot({ path: `${shots}/e2e-away-report-360x800.png` });
  await g(page, () => window.__floor15.popup.close());
  await revealAll(page);

  // ------------------------------------------------------------ Mara: talk, bag, no bed, bed, moves in
  await goto(page, 13, 200);
  for (const id of ['f13_left#0', 'f13_left#1', 'f13_right#0', 'f13_right#1', 'f13_right#2']) await killZ(page, id); // all of floor 13 (level data may add more)
  await g(page, () => { const s = window.__floor15; s.state.doors.f13_left.state = 'open'; s.view.refresh(); });
  const l13 = await lineY(page, 13);
  const marax = await g(page, () => window.__floor15.tower.floors.get(13).apartments[0].survivors[0].x);
  await tapWorld(page, marax, l13 - 48);
  const n1 = await readDialogue(page, 'Mara intro');
  check(n1 >= 3, `Mara speaks in short lines (${n1} taps)`);
  check(await g(page, () => window.__floor15.state.survivors.mara.quest) === 'asked', 'quest started: fetch the bag from 14');
  await tapWorld(page, marax, l13 - 48);
  await readDialogue(page, 'Mara reminder');
  check(await g(page, () => window.__floor15.state.survivors.mara.recruited) === false, 'no bag, no deal');

  await goto(page, 14, 200);
  await killZ(page, 'f14_left#0');
  const l14 = await lineY(page, 14);
  await tapWorld(page, 270, l14 - 48);
  check(await until(page, () => window.__floor15.state.inventory.some((s) => s?.id === 'medical_bag'), null, 12000), 'tapping the medical bag on 14 picks it up');
  await goto(page, 13, 200);
  await tapWorld(page, marax, l13 - 48);
  await readDialogue(page, 'Mara bag (no bed)');
  const noBed = await g(page, () => { const s = window.__floor15; return { q: s.state.survivors.mara.quest, rec: s.state.survivors.mara.recruited, bag: s.state.inventory.some((x) => x?.id === 'medical_bag') }; });
  check(noBed.q === 'asked' && !noBed.rec && noBed.bag, 'without a Survivor bed she says so and the bag stays with the hero');

  await goto(page, 15, 300);
  await g(page, () => { const s = window.__floor15; s.debugGive('wood', 6); s.debugGive('cloth', 2); });
  await sleep(300);
  await tapWorld(page, 372, line - 84 - 48);
  await craftViaPanel(page, 'survivor_bed');
  check(await g(page, () => window.__floor15.placement.active), 'Survivor bed asks for a spot');
  const spot = await g(page, () => { const p = window.__floor15.placement.spots[0]; return { x: p.x, cy: p.cy }; });
  await tapWorld(page, spot.x, spot.cy);
  check(await until(page, () => Object.values(window.__floor15.state.build.spots).some((p) => p.id === 'survivor_bed'), null, 5000), 'Survivor bed placed');
  const m0 = await g(page, () => window.__floor15.state.needs.morale);
  await goto(page, 13, 200);
  await tapWorld(page, marax, l13 - 48);
  await readDialogue(page, 'Mara joins');
  const rec = await g(page, () => {
    const s = window.__floor15;
    return { rec: s.state.survivors.mara.recruited, health: s.state.survivors.mara.health, crew: s.view.crew.has('mara'), crewBtn: s.hud.crewBtn.visible, f13: s.view.sprites.get('survivor:mara').img.visible, morale: s.state.needs.morale };
  });
  check(await g(page, () => !window.__floor15.state.inventory.some((x) => x?.id === 'medical_bag')), 'with a bed the bag is handed over');
  check(rec.rec && rec.health === 100 && rec.crew, 'Mara moves in: recruited, 100 health, standing at home');
  check(!rec.f13 && rec.crewBtn, 'she is gone from floor 13 and the Crew button appears');
  check(rec.morale >= Math.min(100, m0 + 15 - 1), `recruit morale bonus (+15 from ${Math.round(m0)} to ${Math.round(rec.morale)})`);
  await goto(page, 15, 300);
  await sleep(300);

  // Crew screen
  const crewBtn = await g(page, () => ({ x: window.__floor15.hud.crewBtn.x, y: window.__floor15.hud.crewBtn.y, w: window.__floor15.hud.crewBtn.size.w }));
  check(crewBtn.w >= 96, 'Crew button is at least 96 px');
  await tapFixed(page, crewBtn.x, crewBtn.y);
  check(await until(page, () => window.__floor15.crewPanel.isOpen, null, 4000), 'Crew button opens the Survivors screen');
  const crew = await g(page, () => {
    const p = window.__floor15.crewPanel;
    const texts = p.c.list.filter((o) => o.type === 'Text').map((o) => o.text);
    const sizes = Object.entries(p.buttons).map(([k, b]) => [k, b.size.w, b.size.h]);
    return { texts, sizes, jobs: Object.keys(p.buttons) };
  });
  check(crew.texts.some((x) => x === 'Steady hands: bandages go further'), 'Crew screen shows Mara\'s trait');
  check(crew.jobs.includes('treat') && crew.jobs.includes('talk'), 'Treat button is there');
  check(crew.jobs.includes('job:guard') && crew.jobs.includes('job:scavenger') && crew.jobs.includes('job:tender') && crew.jobs.includes('talk'), 'job picker (Guard / Scavenger / Tender) and Talk are there');
  check(crew.sizes.every(([, w, h]) => w >= 96 && h >= 96), 'every Crew button is at least 96 px');
  await page.screenshot({ path: `${shots}/e2e-crew-360x800.png` });
  const pos = (k) => g(page, (key) => { const b = window.__floor15.crewPanel.buttons[key]; return { x: b.x, y: b.y }; }, k);
  let p = await pos('job:guard');
  await tapFixed(page, p.x, p.y);
  await sleep(200);
  check(await g(page, () => window.__floor15.state.survivors.mara.job) === 'guard', 'Guard job chosen by tap');
  check(await g(page, () => window.__floor15.defense().guards) === 15, 'a Guard adds +15 defense');
  const mm = await g(page, () => window.__floor15.state.needs.morale);
  p = await pos('talk');
  await tapFixed(page, p.x, p.y);
  await sleep(200);
  check(await g(page, (m) => window.__floor15.state.needs.morale > m || window.__floor15.state.needs.morale === 100, mm), 'Talk gives morale');
  check(await g(page, () => window.__floor15.crewPanel.buttons.talk.alpha) < 1, 'Talk is greyed out afterwards (12 h cooldown)');
  p = await pos('close');
  await tapFixed(page, p.x, p.y);
  check(await g(page, () => !window.__floor15.crewPanel.isOpen), 'Close closes the Crew screen');
  const bandage = await g(page, () => { const s = window.__floor15; return s.describeItem({ id: 'bandage', qty: 1 }, 'bag').effect; });
  check(!/\d/.test(bandage), `the bandage is described in words ("${bandage}")`);

  // ------------------------------------------------------------ offline again: the Guard helps, repelled
  await g(page, () => { const s = window.__floor15; s.state.build.barricade.hp = s.balance.barricade.levels[0].hp; s.state.needs.food = 100; s.state.needs.water = 100; s.state.survivors.mara.upkeepAt = Date.now() + 20 * 3600 * 1000; });
  await reloadAway(page, 9, 2);
  const away2 = await g(page, () => {
    const s = window.__floor15;
    return { hp: s.state.build.barricade.hp, lines: s.popup.isOpen ? s.popup.c.list.filter((o) => o.type === 'Text').map((o) => o.text) : null, mara: s.state.survivors.mara.health };
  });
  check(away2.lines?.some((l) => /It held\.$/.test(l)) && away2.hp > 0 && away2.mara === 100, `attack repelled with the Guard, barricade ${Math.round(away2.hp)} HP, Mara unhurt`);
  await g(page, () => window.__floor15.popup.close());
  await revealAll(page);

  // ------------------------------------------------------------ pass the torch
  await g(page, () => {
    const s = window.__floor15;
    s.debugGive('bandage', 2);
    s.state.survivors.mara.health = 64;
    s.state.needs.food = 12; s.state.needs.water = 14; s.state.needs.energy = 33;
    s.debugGoto(15, 250);
  });
  const lineH = await lineY(page, 15);
  await g(page, () => { window.__floor15.state.needs.health = -5; }); // below 0: regen cannot lift it back above 0 before the next check
  check(await until(page, () => window.__floor15.dialogue.isOpen, null, 8000), 'hero dies: a card appears instead of game over');
  const card = await g(page, () => ({ text: window.__floor15.dialogue.text.text, over: window.__floor15.gameOver, dead: window.__floor15.dead }));
  check(card.text === 'You carry on as Mara.' && !card.over, `the card says "${card.text}"`);
  await page.screenshot({ path: `${shots}/e2e-torch-360x800.png` });
  await tapFixed(page, 360, 700);
  check(await until(page, () => window.__floor15.state.activeId === 'mara' && !window.__floor15.dead, null, 5000), 'tap continues as Mara');
  const t2 = await g(page, () => {
    const s = window.__floor15;
    return {
      tex: s.heroSprite.texture.key, health: s.state.needs.health, bodies: s.state.bodies.length, bodySprites: s.view.bodies.length,
      bag: s.state.inventory.filter(Boolean).length, pile: s.state.piles.some((q) => q.items.some((i) => i.id === 'bandage')),
      over: s.gameOver, crew: s.view.crew.size, job: s.state.survivors.mara.job, guards: s.defense().guards, bandage: s.describeItem({ id: 'bandage', qty: 1 }, 'bag').effect,
    };
  });
  check(t2.tex === 'mara_play' && Math.abs(t2.health - 64) < 0.5, `Mara is the active character with her own health (${t2.health})`);
  check(await g(page, () => { const n = window.__floor15.state.needs; const b = window.__floor15.balance.needs; return n.food >= b.food.start - 1 && n.water >= b.water.start - 1 && n.energy >= b.energy.start - 1; }), 'Mara starts with fresh food, water and energy');
  check(t2.bodies === 1 && t2.bodySprites === 1 && t2.bag === 0 && t2.pile, 'the hero\'s body stays and his bag dropped as a pile');
  check(!t2.over && t2.crew === 0 && t2.job === null && t2.guards === 0, 'game continues; she no longer stands at home or counts as a guard');
  check(t2.bandage === 'Patches you up.', 'bandage still described in words as Mara (Steady hands maths is unit tested)');
  await page.screenshot({ path: `${shots}/e2e-as-mara-360x800.png` });
  // she can walk: tap the floor
  await tapWorld(page, 320, lineH + 24);
  check(await until(page, () => Math.abs(window.__floor15.state.hero.x - 320) < 3, null, 8000), 'Mara walks with taps');
  // Mara dies: game over
  await g(page, () => { window.__floor15.state.needs.health = -5; });
  check(await until(page, () => window.__floor15.gameOver, null, 8000), 'Mara dying (active) is game over');
  check(await g(page, () => window.__floor15.state.survivors.mara.dead && !window.__floor15.dialogue.isOpen), 'no torch card for a dead last survivor');
  await page.screenshot({ path: `${shots}/e2e-gameover-story-360x800.png` });

  // ------------------------------------------------------------ New game -> intro -> skip the tutorial -> title Continue / confirm
  const ng = await g(page, () => {
    const c = window.__floor15.gameOverPanel.c.list.find((o) => o.list && o.list.some((k) => k.type === 'Text' && k.text === 'New game'));
    return { x: c.x, y: c.y };
  });
  await tapFixed(page, ng.x, ng.y);
  check(await until(page, () => window.__scenes.Intro?.sys.isActive(), null, 8000), 'game over -> New game leads to the intro');
  await sleep(600);
  await tapFixed(page, 360, 400);
  await sleep(200);
  await tapFixed(page, 360, 400);
  await sleep(200);
  await tapFixed(page, 360, 400); // last card ends the intro
  check(await until(page, () => window.__floor15?.sys.isActive() && window.__floor15.state.story.tutorial === 'active' && window.__floor15.state.survivors.mara === undefined, null, 10000), 'three taps end the intro; a fresh tower with the tutorial');
  await sleep(500);
  const sk = await g(page, () => ({ x: window.__floor15.tutorialView.skip.x, y: window.__floor15.tutorialView.skip.y, w: window.__floor15.tutorialView.skip.size.w, h: window.__floor15.tutorialView.skip.size.h }));
  check(sk.w >= 96 && sk.h >= 96, `tutorial Skip is at least 96 px (${sk.w}x${sk.h})`);
  await tapFixed(page, sk.x, sk.y);
  await sleep(300);
  const skipped = await g(page, () => ({ tut: window.__floor15.state.story.tutorial, shown: window.__floor15.tutorialView.shown, next: window.__floor15.state.attacks.nextAt }));
  check(skipped.tut === 'skipped' && !skipped.shown && skipped.next, 'Skip ends the tutorial for good and starts the attack clock');
  await g(page, () => window.__floor15.save());
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__scenes?.Title?.buttons, null, { timeout: 15000 });
  await sleep(400);
  const tb = await g(page, () => { const b = window.__scenes.Title.buttons; return { cont: !!b.continue, ng: { x: b.newGame.x, y: b.newGame.y } }; });
  check(tb.cont, 'title shows Continue and New game for a saved game');
  await tapFixed(page, tb.ng.x, tb.ng.y);
  await sleep(300);
  check(await g(page, () => !!window.__scenes.Title.buttons.confirm), 'New game asks to confirm when a save exists');
  await page.screenshot({ path: `${shots}/e2e-title-confirm-360x800.png` });
  const cancel = await g(page, () => ({ x: window.__scenes.Title.buttons.cancel.x, y: window.__scenes.Title.buttons.cancel.y }));
  await tapFixed(page, cancel.x, cancel.y);
  await sleep(200);
  check(await g(page, () => !!JSON.parse(localStorage.getItem('floor15.save')).game.started), 'Cancel keeps the save');

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
