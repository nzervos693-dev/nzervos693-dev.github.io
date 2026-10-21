/*
 * QA e2e for the isometric Stage A (not part of `npm test`): vision proof (a zombie is drawn only on a Visible
 * tile, never behind a wall or a closed door), tap accuracy on the start flat's objects (real touches at the art
 * pixels), the Home button, "The stairs are blocked.", hold-to-look while searching, hide and resume, a lethal
 * bite and a killing blow in the same frame.
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
  const panTo = (id) => E((i) => {
    const g = window.__floor15;
    g.buildTapCandidates();
    const c = g.cands.find((x) => x.id === i) || g.zCands.find((x) => x.id === i);
    g.camera.snapTo(c.x, c.y, 0);
    g.camera.followPause = 2;
    g.applyCamera();
  }, id);
  const tapId = async (id) => {
    await panTo(id);
    await sleep(120);
    const p = await E((i) => window.__floor15.debugClientOf(i), id);
    await page.touchscreen.tap(p.x, p.y);
  };
  const menuBtn = async (i) => { const b = await E((n) => window.__floor15.debugMenuButton(n), i); if (b) await page.touchscreen.tap(b.x, b.y); return !!b; };

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
      if (now - t0 > 25000) { clearInterval(iv); resolve({ frames, shown, bad: bad.slice(0, 5) }); }
    }, 33);
  }));
  check(soak.shown > 20, `the soak really showed zombies (${soak.shown} zombie draws)`);
  check(soak.bad.length === 0, `zombies are never drawn outside the view (${soak.frames} frames, ${soak.shown} zombie draws)${soak.bad.length ? ': ' + soak.bad.join('; ') : ''}`);

  // ---- tap accuracy: real touches on the visible art pixels of every start-flat object
  await boot();
  await E(() => {
    const g = window.__floor15;
    g.__rec = [];
    g.handleInteract = (x) => g.__rec.push(x.id);
    g.handleGround = () => g.__rec.push('ground');
    g.turnAround = () => g.__rec.push('hero');
  });
  const targets = await E(() => {
    const g = window.__floor15;
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const props = g.view.props.filter((p) => !p.gone);
    const alphaAt = (p, x, y) => {
      const sp = p.sp; const fr = sp.frame; const org = p.pf.big ? [0.5, 52 / 72] : [0.5, 48 / 56];
      let lx = (x - sp.x) / 3 + org[0] * fr.width; const ly = (y - sp.y) / 3 + org[1] * fr.height;
      if (sp.flipX) lx = fr.width - lx;
      if (lx < 0 || ly < 0 || lx >= fr.width || ly >= fr.height) return 0;
      return g.textures.getPixelAlpha(Math.floor(lx), Math.floor(ly), sp.texture.key, fr.name);
    };
    const out = [];
    for (const p of props) {
      if (!p.o.id.startsWith('f15NW')) continue;
      const sp = p.sp; const fr = sp.frame; const pts = [];
      for (let tries = 0; pts.length < 5 && tries < 800; tries++) {
        const lx = Math.floor(rnd() * fr.width); const ly = Math.floor(rnd() * fr.height);
        if (g.textures.getPixelAlpha(lx, ly, sp.texture.key, fr.name) <= 60) continue;
        const ux = sp.flipX ? fr.width - 1 - lx : lx;
        const org = p.pf.big ? [0.5, 52 / 72] : [0.5, 48 / 56];
        const wx = sp.x + (ux + 0.5 - org[0] * fr.width) * 3; const wy = sp.y + (ly + 0.5 - org[1] * fr.height) * 3;
        if (props.some((q) => q !== p && q.sp.depth > sp.depth && alphaAt(q, wx, wy) > 60)) continue; // hidden behind a nearer prop
        pts.push([wx, wy]);
      }
      out.push({ id: p.o.id, cx: sp.x, cy: sp.y, pts });
    }
    return out;
  });
  let taps = 0;
  let good = 0;
  const wrong = [];
  for (const o of targets) {
    await E(([x, y]) => { const g = window.__floor15; g.camera.snapTo(x, y, 0); g.camera.followPause = 5; g.applyCamera(); }, [o.cx, o.cy]);
    await sleep(100);
    for (const [wx, wy] of o.pts) {
      const p = await E(([x, y]) => {
        const g = window.__floor15; g.__rec.length = 0;
        const cam = g.cameras.main; const r = g.game.canvas.getBoundingClientRect(); const k = r.width / g.scale.width;
        return { x: r.left + (x - cam.scrollX) * k, y: r.top + (y - cam.scrollY) * k };
      }, [wx, wy]);
      if (p.x < 2 || p.x > W - 2 || p.y < topY + 2 || p.y > H - 130) continue;
      await page.touchscreen.tap(p.x, p.y);
      await sleep(40);
      const got = (await E(() => window.__floor15.__rec.slice()))[0];
      taps++;
      if (got === o.id) good++; else wrong.push(`${o.id}->${got}`);
    }
  }
  check(taps >= 60 && good / taps >= 0.9, `a real tap on a visible object pixel opens the right target on ${(100 * good / taps).toFixed(0)}% of ${taps} taps (want 90%+)${wrong.length ? ' misses: ' + wrong.slice(0, 6).join(', ') : ''}`);

  // ---- the home front door and the stash next to it (BUG-042)
  await boot();
  await E(() => { const g = window.__floor15; g.debugGoto(6, 8); g.hero.facing = 90; g.updateVision(true); });
  await sleep(800);
  let doorHits = 0;
  for (const dx of [-12, -6, 0, 6]) {
    await E(() => { const g = window.__floor15; g.walk = null; g.pending = null; g.panel.close(); g.debugGoto(6, 8); g.updateVision(true); });
    await sleep(450);
    const q = await E(() => window.__floor15.debugClientOf('f15NW-6.9.S'));
    await page.touchscreen.tap(q.x + dx * (W / 360), q.y);
    await sleep(200);
    if ((await E(() => window.__floor15.pending?.kind)) === 'door-open') doorHits++;
  }
  check(doorHits === 4, `taps across the home front door open it (${doorHits}/4; BUG-042 fixed)`);

  // ---- Home: once re-centres, twice walks to the bed (through the front door)
  await boot();
  await E(() => { const g = window.__floor15; g.debugGoto(20, 10); g.hero.facing = 0; g.updateVision(true); g.camera.snapTo(0, 0, 0); g.camera.followPause = 5; g.applyCamera(); });
  const home = await E(() => { const g = window.__floor15; const b = g.hud.homeBtn; const r = g.game.canvas.getBoundingClientRect(); const k = r.width / g.scale.width; return { x: r.left + b.x * k, y: r.top + b.y * k }; });
  await page.touchscreen.tap(home.x, home.y);
  await sleep(300);
  const near = await E(() => { const g = window.__floor15; const s = g.actors.toScreen(g.hero.x, g.hero.y, { x: 0, y: 0 }); return Math.hypot(g.camera.x - s.x, g.camera.y - s.y); });
  check(near < 135, `Home once re-centres the camera on the hero (offset ${Math.round(near)} px)`);
  await page.touchscreen.tap(home.x, home.y);
  await sleep(300);
  check(await E(() => !!window.__floor15.walk), 'Home twice within 1 s starts the walk to the bed');
  check(await waitFor(() => { const g = window.__floor15; return !g.walk && Math.floor(g.hero.x) === 3 && Math.floor(g.hero.y) === 2; }, 60000), 'the hero arrives next to the bed (opens the front door on the way)');

  // ---- stairs are blocked
  await E(() => { const g = window.__floor15; g.debugGoto(14, 8); g.hero.facing = 0; g.updateVision(true); g.camera.snapTo(9 * 48 + 48, 16 * 24, 0); g.camera.followPause = 5; g.applyCamera(); });
  await sleep(200);
  const st = await E(() => window.__floor15.debugTileToClient(12, 3));
  await page.touchscreen.tap(st.x, st.y);
  await sleep(300);
  check(await E(() => window.__floor15.toast.text?.text) === 'The stairs are blocked.', 'tapping a stair flight shows "The stairs are blocked."');

  // ---- hold to look while searching: the search keeps running and the hero turns
  await boot();
  await E(() => { const g = window.__floor15; g.debugGoto(3, 8); g.hero.facing = 90; g.updateVision(true); });
  await sleep(500);
  await tapId('f15NW-3.9');
  await sleep(300);
  await menuBtn(0);
  await waitFor(() => window.__floor15.action?.spec.kind === 'search', 20000);
  const f0 = await E(() => window.__floor15.hero.facing);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', W * 0.8, H * 0.35);
  await sleep(700);
  await touch('touchMove', W * 0.85, H * 0.4);
  await sleep(400);
  const during = await E(() => ({ act: window.__floor15.action?.spec.kind, looking: window.__floor15.looking, f: window.__floor15.hero.facing }));
  await touch('touchEnd');
  check(during.act === 'search' && during.looking && Math.abs(during.f - f0) > 20, 'a hold-to-look turns the hero while the search keeps running');
  check(await waitFor(() => window.__floor15.state.objects['f15NW-3.9']?.searched, 20000), 'the search finishes after the look');

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
