/*
 * E2E for Stage C2 piece 2, HQ building by touch: the fire-door claim (greyed, then Cleared, 5 s, Remembered
 * tiles, main home), build mode (Build icon, edge cursor), a wall built on a gap with the ghost during the action,
 * an upgrade, a demolished inner wall merging two rooms (Loud noise), a fitted door, a boarded exterior window,
 * refused actions greyed with their message, the seal-in warning, and the partial re-bake (an HP hit redraws one
 * edge, a built piece re-bakes the layer). Real taps on the buttons; only the setup (items, teleport, facing,
 * fast-forwarding the timers) uses the debug hooks. Run: npm run test:e2e (or node tests/e2e/iso-build.mjs after
 * npm run build:e2e). Env: E2E_URL.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';

const PORT = 4187;
let server = null;
let url = process.env.E2E_URL;
if (!url) { server = await serve('dist-e2e', PORT); url = server.url; }
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  const noiseRe = /WebGL|GL Driver|GroupMarker/;
  page.on('console', (m) => { if (m.type() === 'error' && !noiseRe.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const E = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);
  const waitFor = (f, ms = 8000, a = null) => page.waitForFunction(f, a, { timeout: ms }).then(() => true).catch(() => false);
  await page.goto(`${url}?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 20000 });
  await sleep(700);

  const press = async (name) => { const p = await E((n) => window.__floor15.debugButton(n), name); await page.touchscreen.tap(p.x, p.y); };
  const pressBar = async (id) => { const p = await E((n) => window.__floor15.debugBar(n), id); await page.touchscreen.tap(p.x, p.y); };
  /** Stand on a tile and face a grid angle (E 0, S 90, W 180, N 270); the cursor / target follows. */
  const stand = async (x, y, facing) => {
    await E(([tx, ty, f]) => { const g = window.__floor15; g.debugGoto(tx, ty); g.hero.facing = f; g.faceTarget = null; }, [x, y, facing]);
    await sleep(350);
  };
  const give = (id, qty) => E(([i, q]) => window.__floor15.debugGive(i, q), [id, qty]);
  /** Fast-forward a timed action to its last moment (the time itself is checked separately). */
  const rush = () => E(() => { const a = window.__floor15.action; if (a) a.elapsed = Math.max(a.elapsed, a.duration - 0.05); });
  const toast = () => E(() => { const t = window.__floor15.toast.text; return t.visible ? t.text : ''; });
  const main = () => E(() => { const m = window.__floor15.slots.main; return m && { id: m.id, icon: m.icon, enabled: m.enabled, reason: m.reason }; });
  const sec = () => E(() => { const m = window.__floor15.slots.secondary; return m && { id: m.id, icon: m.icon, enabled: m.enabled, reason: m.reason }; });
  const edgeOf = (x, y, s) => E(([a, b, c]) => { const d = window.__floor15.world.structures.describe(a, b, c); return { piece: d.piece, tier: d.tier, hp: d.hp, overlay: d.overlay?.kind ?? null, kind: d.kind }; }, [x, y, s]);
  const pickPiece = async (id) => {
    await press('quick');
    await sleep(250);
    const p = await E((pid) => {
      const g = window.__floor15;
      const pieces = g.balance.build.pieces.filter((q) => q !== 'barricade');
      const cells = g.buttons.picker.filter((o) => o.getData && o.getData('picker'));
      const c = cells[pieces.indexOf(pid)];
      const rect = g.game.canvas.getBoundingClientRect();
      const k = rect.width / g.scale.width;
      return { x: rect.left + c.x * k, y: rect.top + c.y * k };
    }, id);
    await page.touchscreen.tap(p.x, p.y);
    await sleep(250);
  };
  const buildAction = async (expectIcon, label) => {
    const m = await main();
    check(m && m.icon === expectIcon && m.enabled, `${label}: Main shows ${expectIcon}, enabled (${JSON.stringify(m)})`);
    await press('main');
    await sleep(200);
    return E(() => { const a = window.__floor15.action; return a && { kind: a.spec.kind, seconds: a.duration }; });
  };

  // ---- the Build icon is hidden before the HQ exists; the world has no build target yet
  check(await E(() => !window.__floor15.hud.buildShown && !window.__floor15.buildMode), 'no Build icon before the HQ is claimed (no tools in the bag)');

  // ---- claim: greyed while something moves, then the 5 s fire-door action
  await stand(14, 10, 270);
  check(await waitFor(() => window.__floor15.targeting.target?.kind === 'claim'), 'the stairwell fire door is the target from the corridor');
  let m = await main();
  check(m && m.icon === 'claim_floor' && !m.enabled && m.reason === 'Something is still moving here.', `Claim greyed while zombies live (${JSON.stringify(m)})`);
  await press('main');
  await sleep(250);
  check(/still moving/.test(await toast()) && (await E(() => !window.__floor15.action)), 'tapping the greyed claim shows the reason and starts nothing');

  await E(() => { const g = window.__floor15; for (const rt of g.zombies.list.slice()) g.zombies.kill(rt); });
  check(await waitFor(() => window.__floor15.state.thoughts.wholeFloor === true, 4000), '"This whole floor could be mine." latched once the floor is Cleared');
  check(/could be mine/.test(await toast()), 'and the thought was shown');
  await sleep(500);
  m = await main();
  check(m && m.icon === 'claim_floor' && m.enabled, 'Claim the floor is enabled once Cleared');
  await press('main');
  await sleep(300);
  const claimAct = await E(() => { const a = window.__floor15.action; return a && { kind: a.spec.kind, seconds: a.duration }; });
  check(claimAct && claimAct.kind === 'claim' && claimAct.seconds === 5, `the claim is a 5 s timed action (${JSON.stringify(claimAct)})`);
  await E(() => window.__floor15.cancelAction());
  check(await E(() => !window.__floor15.state.hq.claimed), 'cancelling the claim claims nothing');
  await press('main');
  await sleep(200);
  await rush();
  check(await waitFor(() => window.__floor15.state.hq.claimed, 4000), 'the HQ is claimed when the timer ends');
  const claimed = await E(() => {
    const g = window.__floor15;
    const W = g.grid.width;
    return { home: g.state.hq.claimed, corridor: g.vision.seen[11 * W + 3], hud: g.hud.buildShown, thought: g.toast.text.text };
  });
  check(claimed.corridor === 1 && claimed.hud === true, 'HQ tiles are Remembered and the Build icon shows');
  check(/Floor 15\. Mine\./.test(claimed.thought), 'thought "Floor 15. Mine."');

  // ---- build mode on; items for everything below
  for (const [id, q] of [['hammer', 1], ['sledgehammer', 1], ['wood', 40], ['metal', 8], ['sheet_metal', 6], ['parts', 4], ['glass', 2]]) await give(id, q);
  await pressBar('build');
  await sleep(300);
  check(await E(() => window.__floor15.buildMode), 'the Build icon turns build mode on');
  await sleep(300);
  check(await E(() => window.__floor15.buttons.btn.quick.shown) === 'build_wall', 'Quick-use shows the selected piece (wall) in build mode');

  // ---- build a wall on a gap (the gate), ghost while available and during the action
  await stand(14, 10, 270);
  check(await waitFor(() => window.__floor15.targeting.target?.kind === 'edge'), 'the edge cursor is the target');
  const ghost1 = await E(() => { const g = window.__floor15.view.ghost; return g.sp && g.sp.visible && g.sp.frame.name; });
  check(!!ghost1, `ghost preview of the wall on the gap (${ghost1})`);
  let act = await buildAction('build_wall', 'gap + wall');
  const wantSec = await E(() => { const g = window.__floor15; return g.balance.structures.walls.wood.buildSeconds * ({ dim: g.balance.light.dimTimeMult, dark: g.balance.light.darkTimeMult }[g.heroLight()] ?? 1); });
  check(act && act.kind === 'build' && Math.abs(act.seconds - wantSec) < 1e-6, `timed action of seconds x light multiplier (${JSON.stringify(act)} vs ${wantSec})`);
  check(await E(() => { const g = window.__floor15.view.ghost; return g.sp.visible; }), 'the ghost stays during the progress');
  const woodBefore = await E(() => window.__floor15.state.inventory.reduce((n, s) => n + (s && s.id === 'wood' ? s.qty : 0), 0));
  await E(() => window.__floor15.cancelAction());
  check((await edgeOf(14, 10, 'N')).piece === 'gap' && woodBefore === await E(() => window.__floor15.state.inventory.reduce((n, s) => n + (s && s.id === 'wood' ? s.qty : 0), 0)), 'cancelling costs nothing');
  await press('main');
  await sleep(200);
  const bakes0 = await E(() => window.__floor15.view.bakeCount);
  await rush();
  check(await waitFor(() => window.__floor15.world.structures.describe(14, 10, 'N').piece === 'wall', 4000), 'wall built on the gap');
  await sleep(400);
  check(await E((b) => window.__floor15.view.bakeCount > b, bakes0), 'a built piece re-bakes the wall layer');

  // ---- upgrade, and the partial re-bake on an HP hit
  m = await main();
  check(m && m.icon === 'upgrade' && m.enabled, 'wall + wall selected: Upgrade');
  await press('main');
  await sleep(200);
  await rush();
  check(await waitFor(() => window.__floor15.world.structures.describe(14, 10, 'N').tier === 'sheet_metal', 4000), 'upgraded to sheet metal');
  await sleep(400);
  const part = await E(() => {
    const g = window.__floor15;
    const b0 = g.view.bakeCount;
    const sprites0 = g.children.length;
    g.world.structures.damage({ x: 14, y: 10, side: 'N' }, 120);
    return { b0, sprites0 };
  });
  await sleep(500);
  const part2 = await E(() => {
    const g = window.__floor15;
    const rec = g.view.wallByEid.get(g.grid.edgeId(14, 10, 'N'));
    return { b1: g.view.bakeCount, extras: rec.extras.filter((e) => e.on).length, sprites: g.children.length };
  });
  check(part2.b1 === part.b0 && part2.extras >= 1, `an HP hit redraws one edge without a re-bake (bakes ${part.b0} -> ${part2.b1}, damage overlays ${part2.extras}, +${part2.sprites - part.sprites0} sprites)`);
  m = await main();
  check(m && m.icon === 'trowel' && m.enabled, 'a damaged piece: Main is Repair (trowel)');

  // ---- demolish an inner wall: two rooms become one, Loud
  await stand(4, 2, 0);
  check(await waitFor(() => window.__floor15.targeting.target?.kind === 'edge'), 'cursor on the partition wall');
  const rooms0 = await E(() => { const s = window.__floor15.world.structures; return [s.roomOf(4, 2), s.roomOf(5, 2)]; });
  check(rooms0[0] !== rooms0[1], 'two different rooms before');
  const s = await sec();
  check(s && s.icon === 'demolish' && s.enabled, 'Secondary is Demolish');
  await E(() => { window.__noiseLog = []; window.__floor15.bus.on('noise', (n) => window.__noiseLog.push(n.radius)); });
  await press('secondary');
  await sleep(250);
  check(await E(() => window.__noiseLog.includes(Infinity)), 'demolishing is Loud (the whole floor hears it)');
  await rush();
  check(await waitFor(() => window.__floor15.world.structures.describe(5, 2, 'W').piece === 'gap', 4000), 'the partition is a gap');
  const rooms1 = await E(() => { const s2 = window.__floor15.world.structures; return [s2.roomOf(4, 2), s2.roomOf(5, 2)]; });
  check(rooms1[0] === rooms1[1], 'the two rooms merged');

  // ---- fit a door: wall first, then pick Door in the picker
  m = await main();
  check(m && m.icon === 'build_wall' && m.enabled, 'gap + wall: Build');
  await press('main'); await sleep(200); await rush();
  check(await waitFor(() => window.__floor15.world.structures.describe(5, 2, 'W').piece === 'wall', 4000), 'wall built again');
  await sleep(300);
  await pickPiece('door');
  check(await E(() => window.__floor15.state.build.selectedPiece) === 'door', 'the picker chooses Door (saved as build.selectedPiece)');
  act = await buildAction('fit_door', 'wall + door');
  await rush();
  check(await waitFor(() => window.__floor15.world.structures.describe(5, 2, 'W').piece === 'door', 4000), 'a door is fitted into the wall');
  check(await E(() => !!window.__floor15.world.grid.doorAt(5, 2, 'W')), 'and it is a real door in the grid');
  await sleep(300);

  // ---- board a window (exterior windows take overlays)
  await stand(0, 2, 180);
  check(await waitFor(() => window.__floor15.targeting.target?.kind === 'edge'), 'cursor on the exterior window');
  await pickPiece('boards');
  await buildAction('board_window', 'window + boards');
  await rush();
  check(await waitFor(() => window.__floor15.world.structures.describe(0, 2, 'W').overlay?.kind === 'boards', 4000), 'boards on the window');
  await sleep(400);
  const cover = await E(() => { const g = window.__floor15; const r = g.view.wallByEid.get(g.grid.edgeId(0, 2, 'W')); return r.extras.filter((e) => e.on).map((e) => e.slot); });
  check(cover.includes('covF') && cover.includes('covS'), `the boards are drawn, full and cutaway versions (${cover})`);

  // ---- refused actions are greyed with their message; no ghost
  await pickPiece('door');
  await stand(15, 10, 270); // the second gate edge is still a gap
  check(await waitFor(() => window.__floor15.targeting.target?.kind === 'edge'), 'cursor on the open gate edge');
  m = await main();
  check(m && !m.enabled && m.reason === 'Needs a wall first.', `door selected on a gap: greyed "Needs a wall first." (${JSON.stringify(m)})`);
  await press('main');
  await sleep(250);
  check((await toast()) === 'Needs a wall first.' && (await E(() => !window.__floor15.action)), 'the greyed tap shows the message and does nothing');
  check(await E(() => { const g = window.__floor15.view.ghost; return !g.sp || !g.sp.visible; }), 'no ghost for a refused action');
  check(await E(() => window.__floor15.buttons.btn.main.iconB.alpha <= 0.5), 'the Main icon is greyed');
  await stand(12, 10, 270); // a landing wall
  check(await waitFor(() => window.__floor15.targeting.target?.kind === 'edge'), 'cursor on a landing wall');
  const s2 = await sec();
  check(s2 && !s2.enabled && s2.reason === 'Load-bearing. Leave it.', `Demolish greyed on the landing wall (${JSON.stringify(s2)})`);
  await stand(18, 7, 0); // east side of the landing: a void edge
  await sleep(300);
  check(await E(() => window.__floor15.targeting.target?.kind !== 'edge'), 'no edge target on a void / shaft / exterior wall');

  // ---- sealing yourself in: warn first, confirm with a second tap
  await pickPiece('wall');
  await stand(15, 10, 270);
  check(await waitFor(() => window.__floor15.targeting.target?.kind === 'edge'), 'cursor on the second gate edge');
  await press('main');
  await sleep(250);
  check((await toast()) === 'That seals you in.' && (await E(() => !window.__floor15.action)), 'first tap warns "That seals you in." and starts nothing');
  await press('main');
  await sleep(250);
  check(await E(() => window.__floor15.action?.spec.kind === 'build'), 'the second tap confirms and starts');
  await E(() => window.__floor15.cancelAction());

  // ---- leaving build mode
  await pressBar('build');
  await sleep(300);
  check(await E(() => !window.__floor15.buildMode), 'the Build icon turns build mode off');
  await E(() => window.__floor15.save());
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
