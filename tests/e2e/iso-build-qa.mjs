/*
 * QA e2e for C2 piece 2 (build mode) beyond iso-build.mjs: tap target sizes, top bar fit, window plating, picker
 * cells, rapid Build taps, app hidden mid-build, reload (claim + selected piece survive), rotate, screenshots.
 * Run: node tests/e2e/iso-build-qa.mjs (after npm run build:e2e). Env: E2E_VIEW=412x915, E2E_SHOTS, E2E_URL.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 4187;
const [W, H] = (process.env.E2E_VIEW || '360x800').split('x').map(Number);
const shots = process.env.E2E_SHOTS || 'tests/screenshots';
mkdirSync(shots, { recursive: true });
let server = null;
let url = process.env.E2E_URL;
if (!url) { server = await serve('dist-e2e', PORT); url = server.url; }
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  const noise = /WebGL|GL Driver|GroupMarker/;
  page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const E = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);
  const waitFor = (f, ms = 8000, a = null) => page.waitForFunction(f, a, { timeout: ms }).then(() => true).catch(() => false);
  const boot = async () => {
    await page.goto(`${url}?debug`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 20000 });
    await sleep(700);
  };
  const press = async (n) => { const p = await E((x) => window.__floor15.debugButton(x), n); await page.touchscreen.tap(p.x, p.y); };
  const pressBar = async (n) => { const p = await E((x) => window.__floor15.debugBar(x), n); await page.touchscreen.tap(p.x, p.y); };
  const stand = async (x, y, f) => { await E(([a, b, c]) => { const g = window.__floor15; g.debugGoto(a, b); g.hero.facing = c; g.faceTarget = null; }, [x, y, f]); await sleep(350); };
  const rush = () => E(() => { const a = window.__floor15.action; if (a) a.elapsed = Math.max(a.elapsed, a.duration - 0.05); });
  const toast = () => E(() => { const t = window.__floor15.toast.text; return t.visible ? t.text : ''; });
  const css = (px) => E((v) => { const g = window.__floor15; return v * g.game.canvas.getBoundingClientRect().width / g.scale.width; }, px);
  const give = async () => { for (const [id, q] of [['hammer', 1], ['sledgehammer', 1], ['wood', 40], ['metal', 8], ['sheet_metal', 6], ['parts', 4], ['glass', 2]]) await E(([i, n]) => window.__floor15.debugGive(i, n), [id, q]); };
  console.log(`viewport ${W}x${H}`);

  await boot();
  // claim the floor (debug shortcuts for the Cleared state, then the real timed action)
  await E(() => { const g = window.__floor15; for (const rt of g.zombies.list.slice()) g.zombies.kill(rt); });
  await give();
  await stand(14, 10, 270);
  await waitFor(() => window.__floor15.targeting.target?.kind === 'claim');
  await sleep(600);
  await press('main'); await sleep(250); await rush();
  check(await waitFor(() => window.__floor15.state.hq.claimed, 5000), 'claimed the floor');
  await sleep(500);

  // ---- tap targets (CSS px) and fit
  const sizes = await E(() => {
    const g = window.__floor15; const k = g.game.canvas.getBoundingClientRect().width / g.scale.width;
    const out = {};
    for (const n of ['main', 'secondary', 'attack', 'quick']) { const b = g.buttons.btn[n]; out[n] = b.hit.input.enabled !== false ? b.hit.radius * 2 * k : 0; }
    for (const id of Object.keys(g.hud.buttons)) { const b = g.hud.buttons[id]; out['bar_' + id] = b.visible === false ? null : { x: b.x * k, y: b.y * k }; }
    out.k = k; out.barHit = g.balance.ui.topBar.hitAreaPx * k; out.screenW = g.game.canvas.getBoundingClientRect().width;
    return out;
  });
  check(sizes.main >= 48 && sizes.secondary >= 48 && sizes.attack >= 48 && sizes.quick >= 48, `action buttons at least 48 css px (${['main', 'secondary', 'attack', 'quick'].map((n) => sizes[n].toFixed(0))})`);
  check(sizes.barHit >= 48, `top bar hit area ${sizes.barHit.toFixed(1)} css px`);
  const buildX = sizes.bar_build?.x;
  check(buildX != null && buildX + sizes.barHit / 2 <= sizes.screenW, `Build icon fully on screen (right edge ${(buildX + sizes.barHit / 2).toFixed(0)} of ${sizes.screenW})`);
  const moodleX = await E(() => { const g = window.__floor15; const k = g.game.canvas.getBoundingClientRect().width / g.scale.width; return g.moodles?.view?.container ? g.moodles.view.container.x * k : null; });
  console.log('  info: moodle column x', moodleX);
  await page.screenshot({ path: `${shots}/qa-c2p2-claimed-${W}x${H}.png` });

  // ---- build mode on, rapid Build taps (21 taps -> odd count: ends on)
  await pressBar('build'); await sleep(200);
  check(await E(() => window.__floor15.buildMode), 'build mode on');
  for (let i = 0; i < 20; i++) await pressBar('build');
  await sleep(400);
  const modeAfter = await E(() => ({ m: window.__floor15.buildMode, on: window.__floor15.hud.buildOn }));
  check(modeAfter.m === modeAfter.on, `rapid Build taps leave HUD and mode in agreement (${JSON.stringify(modeAfter)})`);
  if (!modeAfter.m) await pressBar('build');
  await sleep(300);

  // ---- picker cell sizes (css px)
  await press('quick'); await sleep(300);
  const cells = await E(() => { const g = window.__floor15; const k = g.game.canvas.getBoundingClientRect().width / g.scale.width; const rect = g.game.canvas.getBoundingClientRect();
    return g.buttons.picker.filter((o) => o.getData && o.getData('picker')).map((c) => ({ w: c.width * k, h: c.height * k, l: rect.left + (c.x - c.width / 2) * k, r: rect.left + (c.x + c.width / 2) * k, t: rect.top + (c.y - c.height / 2) * k, b: rect.top + (c.y + c.height / 2) * k })); });
  check(cells.length >= 5 && cells.every((c) => c.w >= 48 && c.h >= 48), `picker cells >= 48 css px (${cells.length} cells, min ${Math.min(...cells.map((c) => c.w)).toFixed(0)})`);
  check(cells.every((c) => c.l >= 0 && c.r <= W && c.t >= 0 && c.b <= H), 'picker fully on screen');
  await page.screenshot({ path: `${shots}/qa-c2p2-picker-${W}x${H}.png` });
  await press('quick'); await sleep(200);
  await E(() => window.__floor15.buttons.closePicker());

  // ---- plate a window (exterior window (0,2,W)) after boards
  const pick = async (id) => {
    await press('quick'); await sleep(250);
    const p = await E((pid) => { const g = window.__floor15; const pieces = g.balance.build.pieces.filter((q) => q !== 'barricade'); const c = g.buttons.picker.filter((o) => o.getData && o.getData('picker'))[pieces.indexOf(pid)];
      const rect = g.game.canvas.getBoundingClientRect(); const k = rect.width / g.scale.width; return { x: rect.left + c.x * k, y: rect.top + c.y * k }; }, id);
    await page.touchscreen.tap(p.x, p.y); await sleep(250);
  };
  await stand(0, 2, 180);
  await waitFor(() => window.__floor15.targeting.target?.kind === 'edge');
  await pick('plating');
  const mm = await E(() => { const m = window.__floor15.slots.main; return m && { icon: m.icon, enabled: m.enabled, reason: m.reason }; });
  console.log('  info: plating on the window:', JSON.stringify(mm));
  if (mm?.enabled) {
    await press('main'); await sleep(250); await rush();
    check(await waitFor(() => window.__floor15.world.structures.describe(0, 2, 'W').overlay?.kind === 'plating', 4000), 'window plated');
    await sleep(500);
    await page.screenshot({ path: `${shots}/qa-c2p2-plated-${W}x${H}.png` });
  } else check(false, `plating a window should be possible with sheet metal in the bag (${JSON.stringify(mm)})`);

  // ---- hide mid-build action cancels it and costs nothing; save round-trip keeps claim + selected piece
  await pick('wall');
  await stand(14, 10, 270);
  await waitFor(() => window.__floor15.targeting.target?.kind === 'edge');
  const wood0 = await E(() => window.__floor15.state.inventory.reduce((n, s) => n + (s && s.id === 'wood' ? s.qty : 0), 0));
  await press('main'); await sleep(250);
  check(await E(() => !!window.__floor15.action), 'a build action runs');
  await E(() => window.__floor15.game.events.emit('floor15:hide'));
  await sleep(200);
  check(await E(() => !window.__floor15.action), 'hiding the app cancels the build action');
  check(await E(() => window.__floor15.world.structures.describe(14, 10, 'N').piece === 'gap'), 'nothing was built');
  check(wood0 === await E(() => window.__floor15.state.inventory.reduce((n, s) => n + (s && s.id === 'wood' ? s.qty : 0), 0)), 'and nothing was paid');
  await E(() => window.__floor15.save());
  await boot();
  const re = await E(() => ({ claimed: window.__floor15.state.hq.claimed, sel: window.__floor15.state.build?.selectedPiece, hud: window.__floor15.hud.buildShown, mode: window.__floor15.buildMode, plate: window.__floor15.world.structures.describe(0, 2, 'W').overlay?.kind }));
  check(re.claimed && re.hud && re.sel === 'wall' && re.plate === 'plating', `reload keeps claim, Build icon, selected piece and the plating (${JSON.stringify(re)})`);
  console.log('  info: build mode after reload =', re.mode);
  await page.screenshot({ path: `${shots}/qa-c2p2-reload-${W}x${H}.png` });

  // ---- rotate to landscape and back with build mode on
  await pressBar('build'); await sleep(200);
  await page.setViewportSize({ width: H, height: W }); await sleep(600);
  await page.screenshot({ path: `${shots}/qa-c2p2-landscape-${W}x${H}.png` });
  await page.setViewportSize({ width: W, height: H }); await sleep(600);
  const afterRot = await E(() => { const g = window.__floor15; const k = g.game.canvas.getBoundingClientRect(); return { mode: g.buildMode, w: k.width, h: k.height }; });
  check(afterRot.w <= W + 0.5 && afterRot.h <= H + 0.5, `after rotating back the canvas fits (${afterRot.w}x${afterRot.h})`);

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
