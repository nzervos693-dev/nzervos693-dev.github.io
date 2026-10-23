/*
 * QA e2e for the isometric Stage A (not part of `npm test`): vision proof (a zombie is drawn only on a Visible
 * tile, never behind a wall or a closed door), the world takes no touches (real touches on the art pixels of the
 * start flat's objects do nothing), the front door is always the target when walking up to it, the Home button
 * (pressed look, then auto-walk), "The stairs are blocked." (push the stick into a flight), the turn band does not
 * cancel a search (creep does), hide and resume, a lethal bite and a killing blow in the same frame.
 * (Adapted for the context-button controls: the tap-accuracy, door-tap and look-drag checks became the checks above.)
 * Checks marked KNOWN BUG-xxx document open bugs in docs/BUGS.md: they print KNOWN and do not fail the run;
 * when the bug is fixed they print PASS and the marker can be dropped.
 * Run: npm run test:e2e (or node tests/e2e/iso-qa.mjs after npm run build:e2e).
 * Env: E2E_VIEW=412x915 to change the viewport (default 360x800), E2E_SHOTS (screenshot dir), E2E_URL.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 4184;
const [W, H] = (process.env.E2E_VIEW || '360x800').split('x').map(Number);
const shots = process.env.E2E_SHOTS || 'tests/screenshots';
mkdirSync(shots, { recursive: true });
let server = null;
let url = process.env.E2E_URL;
if (!url) { server = await serve('dist-e2e', PORT); url = server.url; }
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };
const known = (ok, bug, msg) => console.log(ok ? `PASS  ${msg} (${bug} looks fixed)` : `KNOWN ${bug}  ${msg}`);

try {
  const browser = await chromium.launch();
  let ctx = null;
  let page = null;
  const errors = [];
  const noise = /WebGL|GL Driver|GroupMarker/;
  /** A brand-new browser context (empty storage) so every section starts from a New game. */
  const newPage = async () => {
    await ctx?.close();
    ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
    page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
  };
  const E = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);
  const boot = async (q = '?debug') => {
    await newPage();
    await page.goto(`${url}${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 20000 });
    await sleep(700);
  };
  const topY = Math.round((H - (W * 1280) / 720) / 2);
  const waitFor = (f, ms = 30000, a = null) => page.waitForFunction(f, a, { timeout: ms }).then(() => true).catch(() => false);
  let cdp = null;
  let cdpFor = null;
  const touch = async (type, touchPoints) => { if (cdpFor !== page) { cdp = await ctx.newCDPSession(page); cdpFor = page; } return cdp.send('Input.dispatchTouchEvent', { type, touchPoints }); };
  const press = async (name) => { const p = await E((n) => window.__floor15.debugButton(n), name); await page.touchscreen.tap(p.x, p.y); };
  const waitTarget = (id, ms = 8000) => waitFor((i) => window.__floor15.targeting.entry?.id === i, ms, id);

  await boot();
  console.log(`viewport ${W}x${H}`);

  // ---- vision proof: a zombie is drawn only while its tile is Visible and has a line of sight
  const soak = await E(() => new Promise((resolve) => {
    const g = window.__floor15;
    const Z = g.zombies;
    const tiles = [];
    for (let y = 0; y < g.grid.height; y++) for (let x = 0; x < g.grid.width; x++) if (g.grid.isWalkable(x, y)) tiles.push([x, y]);
    let tele = 0;
    let frames = 0;
    let shown = 0;
    const bad = [];
    const off = {};
    const t0 = performance.now();
    const iv = setInterval(() => {
      const now = performance.now();
      if (now - tele > 1000) {
        tele = now;
        let [x, y] = tiles[Math.floor(Math.random() * tiles.length)];
        if (Math.random() < 0.6 && Z.list.length) { // often stand near a zombie so it is really seen
          const z = Z.list[Math.floor(Math.random() * Z.list.length)].rec;
          const near = tiles.filter(([a, b]) => Math.hypot(a - z.x, b - z.y) < 6);
          if (near.length) [x, y] = near[Math.floor(Math.random() * near.length)];
        }
        g.debugGoto(x, y);
        g.hero.facing = Math.random() * 360;
        g.updateVision(true);
        if (Math.random() < 0.5) for (const rt of Z.list) { rt.ai.mode = 'chase'; rt.ai.noticed = false; rt.ai.last = { x, y }; }
      }
      frames++;
      const hx = Math.floor(g.hero.x);
      const hy = Math.floor(g.hero.y);
      for (const rt of Z.list) {
        const tx = Math.floor(rt.rec.x);
        const ty = Math.floor(rt.rec.y);
        if (!rt.sp.visible) { off[rt.rec.id] = 0; continue; }
        shown++;
        if (!g.vision.isVisible(rt.rec.x, rt.rec.y)) { off[rt.rec.id] = off[rt.rec.id] || now; if (now - off[rt.rec.id] > 300) bad.push(`${rt.rec.id} drawn off-view at ${tx},${ty}`); } else off[rt.rec.id] = 0;
        if (g.vision.isVisible(rt.rec.x, rt.rec.y) && !(hx === tx && hy === ty) && !g.grid.hasLOS(hx, hy, tx, ty)) bad.push(`${rt.rec.id} drawn without line of sight at ${tx},${ty} from ${hx},${hy}`);
      }
      if (now - t0 > 40000) { clearInterval(iv); resolve({ frames, shown, bad: bad.slice(0, 5) }); }
    }, 33);
  }));
  check(soak.shown >= 8, `the soak really showed zombies (${soak.shown} zombie draws)`);
  check(soak.bad.length === 0, `zombies are never drawn outside the view (${soak.frames} frames, ${soak.shown} zombie draws)${soak.bad.length ? ': ' + soak.bad.join('; ') : ''}`);

  // ---- the world takes no touches: real taps on the visible art pixels of every start-flat object do nothing
  await boot();
  await E(() => {
    const g = window.__floor15;
    g.__calls = 0;
    for (const name of ['perform', 'attackPress', 'beginAction', 'beginDoorOpen', 'goToTile', 'turnAround', 'startSleep']) {
      const f = g[name].bind(g);
      g[name] = (...a) => { g.__calls++; return f(...a); };
    }
  });
  const targets = await E(() => {
    const g = window.__floor15;
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const out = [];
    for (const p of g.view.props.filter((q) => !q.gone && q.o.id.startsWith('f15NW'))) {
      const sp = p.sp; const fr = sp.frame; const pts = [];
      for (let tries = 0; pts.length < 3 && tries < 400; tries++) {
        const lx = Math.floor(rnd() * fr.width); const ly = Math.floor(rnd() * fr.height);
        if (g.textures.getPixelAlpha(lx, ly, sp.texture.key, fr.name) <= 60) continue;
        const ux = sp.flipX ? fr.width - 1 - lx : lx;
        const org = p.pf.big ? [0.5, 52 / 72] : [0.5, 48 / 56];
        pts.push([sp.x + (ux + 0.5 - org[0] * fr.width) * 3, sp.y + (ly + 0.5 - org[1] * fr.height) * 3]);
      }
      out.push({ id: p.o.id, cx: sp.x, cy: sp.y, pts });
    }
    return out;
  });
  const hero0 = await E(() => { const g = window.__floor15; return [g.hero.x, g.hero.y]; });
  let taps = 0;
  for (const o of targets) {
    await E(([x, y]) => { const g = window.__floor15; g.camera.snapTo(x - 110, y); g.camera.followPause = 5; /* prop right of centre: clear of the stick zone (no look-ahead on snap any more) */ g.applyCamera(); }, [o.cx, o.cy]);
    await sleep(80);
    for (const [wx, wy] of o.pts) {
      const p = await E(([x, y]) => {
        const g = window.__floor15; const cam = g.cameras.main; const r = g.game.canvas.getBoundingClientRect(); const k = r.width / g.scale.width;
        return { x: r.left + (x - cam.scrollX) * k, y: r.top + (y - cam.scrollY) * k };
      }, [wx, wy]);
      const gy = (p.y - topY) * (720 / W);
      const inStickZone = p.x < 0.55 * W && gy > 0.45 * 1280; // a quick double tap there is the turn-around gesture, not a world tap
      if (p.x < 2 || p.x > W - 2 || gy < 130 || gy > 860 || inStickZone) continue; // skip the top bar, the control band and the stick zone: those are UI
      await page.touchscreen.tap(p.x, p.y);
      await sleep(30);
      taps++;
    }
  }
  await sleep(300);
  const after = await E(() => { const g = window.__floor15; return { calls: g.__calls, act: !!g.action, walk: !!g.walk, panel: g.anyPanelOpen(), h: [g.hero.x, g.hero.y] }; });
  check(taps >= 20 && after.calls === 0 && !after.act && !after.walk && !after.panel && Math.hypot(after.h[0] - hero0[0], after.h[1] - hero0[1]) < 0.01, `${taps} real taps on object pixels start nothing (no action, walk, panel or turn; ${after.calls} calls)`);

  // ---- walking up to the home front door from several sides always targets it (BUG-042: it used to be hard to hit)
  await boot();
  let doorHits = 0;
  for (const [px, py] of [[6.2, 9.4], [6.5, 9.4], [6.8, 9.4], [6.5, 9.9]]) {
    await E(([x, y]) => { const g = window.__floor15; g.walk = null; g.action = null; g.hero.x = x; g.hero.y = y; g.hero.facing = 90; g.updateVision(true); g.snapCamera(); }, [px, py]);
    await sleep(500);
    if (await waitTarget('f15NW-6.9.S', 3000)) doorHits++;
  }
  check(doorHits === 4, `the home front door is the target from 4 spots in front of it (${doorHits}/4)`);

  // ---- Home: the first tap shows the pressed look, the second within 1 s walks to the bed (through the front door)
  await boot();
  await E(() => { const g = window.__floor15; g.debugGoto(20, 10); g.hero.facing = 0; g.updateVision(true); });
  const home = await E(() => window.__floor15.debugBar('home'));
  await page.touchscreen.tap(home.x, home.y);
  await sleep(300);
  check(await E(() => !window.__floor15.walk && window.__floor15.hud.buttons.home.img.alpha > 0.85), 'the first Home tap only shows the pressed look');
  await page.touchscreen.tap(home.x, home.y);
  await sleep(300);
  check(await E(() => !!window.__floor15.walk), 'Home twice within 1 s starts the walk to the bed');
  check(await waitFor(() => { const g = window.__floor15; return !g.walk && Math.floor(g.hero.x) === 3 && Math.floor(g.hero.y) === 2; }, 60000), 'the hero arrives next to the bed (opens the front door on the way)');
  // the stick cancels the auto-walk at once
  await E(() => { const g = window.__floor15; g.debugGoto(20, 10); });
  await page.touchscreen.tap(home.x, home.y);
  await page.touchscreen.tap(home.x, home.y);
  await sleep(200);
  const wasWalking = await E(() => !!window.__floor15.walk);
  const gp = (gx, gy) => E(([x, y]) => { const r = window.__floor15.game.canvas.getBoundingClientRect(); const k = r.width / window.__floor15.scale.width; return { x: r.left + x * k, y: r.top + y * k }; }, [gx, gy]);
  const s0 = await gp(150, 900);
  const s1 = await gp(150 + 24, 900); // the turn band is enough to cancel an auto-walk
  await touch('touchStart', [{ x: s0.x, y: s0.y, id: 1 }]);
  await touch('touchMove', [{ x: s1.x, y: s1.y, id: 1 }]);
  await sleep(300);
  const walkAfter = await E(() => !!window.__floor15.walk);
  await touch('touchEnd', []);
  check(wasWalking && !walkAfter, 'pushing the stick (even a very light push) cancels the Home auto-walk');

  // ---- stairs are blocked: push the stick into a flight
  await boot();
  const stair = await E(() => {
    const g = window.__floor15;
    const s = g.world.stairs.down.concat(g.world.stairs.up);
    for (const t of s) for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
      const hx = t.x + dx; const hy = t.y + dy;
      if (g.grid.isWalkable(hx, hy) && g.grid.moveClass(g.grid.edgeBetween(hx, hy, t.x, t.y)) === 0) return { hx, hy, dx: -dx, dy: -dy };
    }
    return null;
  });
  await sleep(3500); // let the opening thought ("Dark in here.", 0.7-3.3 s) pass so it cannot replace the stairs toast
  if (stair) {
    await E((st) => { const g = window.__floor15; g.debugGoto(st.hx, st.hy); g.hero.facing = 0; g.updateVision(true); }, stair);
    const ux = (stair.dx - stair.dy) * 48; const uy = (stair.dx + stair.dy) * 24; const len = Math.hypot(ux, uy);
    const a0 = await gp(150, 900); const a1 = await gp(150 + (ux / len) * 70, 900 + (uy / len) * 70);
    await touch('touchStart', [{ x: a0.x, y: a0.y, id: 1 }]);
    await touch('touchMove', [{ x: a1.x, y: a1.y, id: 1 }]);
    await sleep(900);
    const txt = await E(() => window.__floor15.toast.text?.text);
    await touch('touchEnd', []);
    check(txt === 'The stairs are blocked.', `pushing the stick into a stair flight shows "The stairs are blocked." (${txt})`);
  } else check(false, 'found a walkable tile next to a stair flight');

  // ---- the turn band does not cancel a search (he keeps facing the fridge); creep does
  await boot();
  await E(() => { const g = window.__floor15; g.debugGoto(3, 8); g.hero.facing = 90; g.updateVision(true); });
  await waitTarget('f15NW-3.9');
  await press('main');
  await waitFor(() => window.__floor15.action?.spec.kind === 'search' && window.__floor15.action.elapsed > 0, 20000);
  const f0 = await E(() => window.__floor15.hero.facing);
  const t0 = await gp(150, 900); const t1 = await gp(150 + 24, 900 - 6); // d 0.2: turn band
  await touch('touchStart', [{ x: t0.x, y: t0.y, id: 1 }]);
  await touch('touchMove', [{ x: t1.x, y: t1.y, id: 1 }]);
  await sleep(250);
  const during = await E(() => ({ act: window.__floor15.action?.spec.kind, f: window.__floor15.hero.facing, p: window.__floor15.action ? window.__floor15.action.elapsed / window.__floor15.action.duration : 1 }));
  check(during.act === 'search' && Math.abs(during.f - f0) < 5, `a turn-band push does not cancel the search or turn him away from the fridge (${f0.toFixed(0)} -> ${during.f.toFixed(0)} deg)`);
  const t2 = await gp(150 + 36, 900); // d 0.3: creep
  await touch('touchMove', [{ x: t2.x, y: t2.y, id: 1 }]);
  await sleep(250);
  const creepAct = await E(() => window.__floor15.action?.spec.kind ?? null);
  await touch('touchEnd', []);
  check(during.p < 0.5 && creepAct === null, 'a creep push cancels the search while it is before 50%');
  await E(() => { const g = window.__floor15; g.debugGoto(3, 8); g.hero.facing = 90; });
  await waitTarget('f15NW-3.9');
  await press('main');
  check(await waitFor(() => window.__floor15.state.objects['f15NW-3.9']?.searched, 20000), 'the search finishes when left alone');

  // ---- hide and resume: zombies go home, 2 h away are counted, a popup tells it
  await boot();
  await E(() => { const g = window.__floor15; g.debugGoto(3, 17); g.hero.facing = 90; g.updateVision(true); const z = g.zombies.get('f15SW-z1'); z.ai.facing = 270; });
  await sleep(1500);
  await E(() => { const g = window.__floor15; g.debugGoto(25, 10); g.updateVision(true); }); // out of sight, the zombie keeps hunting for a while
  await sleep(500);
  await E(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(300);
  const hid = await E(() => { const z = window.__floor15.zombies.get('f15SW-z1'); return { mode: z.ai.mode, x: z.rec.x, y: z.rec.y, walk: !!window.__floor15.walk }; });
  check(hid.mode === 'idle' && Math.abs(hid.x - 3.5) < 0.01 && Math.abs(hid.y - 20.5) < 0.01, 'on hide the chasing zombie is back at its spawn tile and calm');
  const food0 = await E(() => window.__floor15.state.needs.food);
  await E(() => { const real = Date.now; Date.now = () => real.call(Date) + 2 * 3600 * 1000; Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(1200);
  const food1 = await E(() => window.__floor15.state.needs.food);
  check(food1 < food0 - 3 && (await E(() => window.__floor15.popup.isOpen)), `2 h away are counted (food ${Math.round(food0)} -> ${Math.round(food1)}) and the away report shows`);

  // ---- a corpse is not drawn once its tile leaves the view (GDD 5.17) (BUG-043)
  await boot();
  await E(() => { const g = window.__floor15; for (const rt of g.zombies.list) rt.ai.pause = 9999; g.debugGoto(3, 17); g.hero.facing = 90; g.updateVision(true); const z = g.zombies.get('f15SW-z1'); z.rec.x = 3.5; z.rec.y = 19.5; });
  await sleep(1000);
  await E(() => { const g = window.__floor15; g.zombies.hurt(g.zombies.get('f15SW-z1'), 999, false); g.hero.facing = 270; g.updateVision(true); });
  await sleep(600);
  const corpse = await E(() => window.__floor15.children.list.filter((c) => c.texture?.key === 'iso_walker' && c.visible).length);
  check(corpse === 0, `no corpse is drawn after the hero turns away (${corpse} drawn; BUG-043 fixed)`);

  // ---- lethal bite and killing blow in the same frame: game over once, floor Cleared
  await boot();
  const both = await E(() => {
    const g = window.__floor15;
    for (const id of ['f15NE-z1', 'f15S-z1']) { const rt = g.zombies.get(id); if (rt) g.zombies.hurt(rt, 999, false); }
    const rt = g.zombies.get('f15SW-z1');
    g.debugGoto(3, 17);
    g.state.needs.health = 5;
    g.zombies.hurt(rt, 999, false);
    g.onZombieBite(rt, 14);
    return { dead: g.dead, over: g.state.flags.heroDead, floor: g.state.floorStates[15] };
  });
  await sleep(2000);
  check(both.dead && both.over && both.floor === 'Cleared' && (await E(() => window.__floor15.gameOver)), 'killing the last zombie and dying in the same frame ends in one game over');

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await page.screenshot({ path: `${shots}/e2e-iso-qa-${W}x${H}.png` });
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
