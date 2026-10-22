/*
 * E2E smoke test for the isometric Stage A scene (not part of `npm test`). Run: npm run test:e2e
 * (builds dist-e2e with debug hooks). Boots at 360x800 with touch and checks: IsoGame is active, the floor
 * rendered, the virtual joystick walks / creeps / runs the hero (CDP multi-touch), the world takes no touches, walking up to the front door targets it and the Main button opens it (vision changes),
 * a double tap in the stick zone turns the hero around, the camera never pans, no console errors.
 * Needs a Chromium: set PLAYWRIGHT_BROWSERS_PATH or run `npx playwright-core install chromium`.
 * Env: E2E_URL (use a running server), E2E_SHOTS (screenshot dir).
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 4179;
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

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(url)).ok) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('preview server did not start (run npm run build:e2e first)');
}

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  const errors = [];
  const noise = /WebGL|GL Driver|GroupMarker/;
  page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const E = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);

  await page.goto(`${url}?debug`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 15000 });
  await sleep(800);

  const info = await E(() => {
    const g = window.__floor15;
    const c = document.querySelector('canvas').getBoundingClientRect();
    return { scene: g.scene.key, floor: g.state.hero.floor, health: g.state.needs.health, canvas: { w: c.width, h: c.height },
      children: g.children.list.length, world: g.state.world };
  });
  check(info.scene === 'IsoGame', 'IsoGameScene is active');
  check(info.floor === 15 && info.world === 'iso-1', 'hero starts on floor 15 of the iso world');
  check(info.children > 300, `iso floor rendered (${info.children} objects)`);
  check(info.canvas.w > 300 && info.canvas.h > 500, `canvas visible (${info.canvas.w}x${info.canvas.h})`);
  await page.screenshot({ path: `${shots}/e2e-iso-start-360x800.png` });

  const vis = () => E(() => {
    const g = window.__floor15;
    let v = 0; let s = 0;
    for (let i = 0; i < g.vision.visible.length; i++) { if (g.vision.visible[i]) v++; if (g.vision.seen[i]) s++; }
    const d = g.world.doors.find((x) => x.id === g.world.home.frontDoor);
    return { v, s, door: d.state, hx: g.hero.x, hy: g.hero.y, facing: g.hero.facing, t: performance.now() };
  });
  // joystick: synthetic multi-touch through CDP. Game px (720x1280) -> client px.
  const cdp = await ctx.newCDPSession(page);
  const toClient = (gx, gy) => E(([x, y]) => { const r = window.__floor15.game.canvas.getBoundingClientRect(); const k = r.width / window.__floor15.scale.width; return { x: r.left + x * k, y: r.top + y * k }; }, [gx, gy]);
  const touches = new Map();
  const send = async (type) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...touches].map(([id, p]) => ({ x: p.x, y: p.y, id })) });
  const down = async (id, gx, gy) => { touches.set(id, await toClient(gx, gy)); await send('touchStart'); };
  const moveTo = async (id, gx, gy) => { touches.set(id, await toClient(gx, gy)); await send('touchMove'); };
  const up = async (id) => { const p = touches.get(id); touches.delete(id); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: p.x, y: p.y, id }] }); }; // touchEnd lists the released points

  // stick: touch down in the lower-left zone, push screen-right (grid east), hold, release
  const a = await vis();
  await down(1, 150, 900);
  await moveTo(1, 150 + 80, 900); // 80/120 = 0.67 of the radius: a walk
  await sleep(900);
  const mid = await E(() => ({ st: window.__floor15.stick.active, run: !!window.__floor15.run, alpha: window.__floor15.stickView.ring.alpha }));
  await up(1);
  await sleep(50);
  const b = await vis();
  check(mid.st && !mid.run && mid.alpha > 0.5, 'the joystick appears under the thumb and a 0.67 push walks (no run)');
  const scrX = (o) => (o.hx - o.hy) * 48; // iso projection: screen x of a grid position
  const scrY = (o) => (o.hx + o.hy) * 24;
  check(scrX(b) - scrX(a) > 40 && Math.abs(scrY(b) - scrY(a)) < 0.5 * (scrX(b) - scrX(a)), `pushing screen-right moves the hero right on screen (${a.hx.toFixed(1)},${a.hy.toFixed(1)} -> ${b.hx.toFixed(1)},${b.hy.toFixed(1)}; wall slide may bend it)`);
  await sleep(150);
  const b2 = await vis();
  check(Math.hypot(b2.hx - b.hx, b2.hy - b.hy) < 0.15, 'release stops the hero at once');
  await sleep(500);
  check(await E(() => window.__floor15.stickView.ring.alpha) === 0, 'the stick fades out after release');
  // very light push = turn in place (no step), light push = creep (half speed), far push = run
  await E(() => { const g = window.__floor15; g.debugGoto(3, 3); g.hero.facing = 0; });
  await sleep(300);
  const p0 = await vis();
  await down(1, 150, 900);
  await moveTo(1, 150, 900 + 24); // 0.2 of the radius, screen-down: the turn band
  await sleep(700);
  const turned = await E(() => ({ turn: window.__floor15.stick.turn, moving: window.__floor15.moving, creeping: window.__floor15.creeping, f: window.__floor15.hero.facing }));
  await up(1);
  const p1 = await vis();
  check(turned.turn && !turned.moving && !turned.creeping, 'a 0.2 push is the turn band (no step, no creep)');
  check(Math.hypot(p1.hx - p0.hx, p1.hy - p0.hy) < 0.01, 'turning in place does not move the hero');
  check(Math.abs(((turned.f - 45 + 540) % 360) - 180) < 15, `he turned toward the stick direction (screen-down = grid ${turned.f.toFixed(0)} deg)`);

  await E(() => { const g = window.__floor15; g.debugGoto(3, 3); });
  await sleep(300);
  await down(1, 150, 900);
  await moveTo(1, 150 + 36, 900); // 0.3: creep
  await sleep(300);
  const c0 = await vis(); // speed is measured between two in-page timestamps (CDP calls take a variable time)
  await sleep(1000);
  const c1 = await vis();
  const creeping = await E(() => window.__floor15.creeping);
  await up(1);
  const cs = Math.hypot(c1.hx - c0.hx, c1.hy - c0.hy) / ((c1.t - c0.t) / 1000);
  check(creeping && Math.abs(cs - 1) < 0.15, `a light push creeps at about 1 tile/s (${cs.toFixed(2)} tiles/s)`);
  await E(() => { const g = window.__floor15; g.debugGoto(3, 3); });
  await sleep(200);
  await down(1, 150, 900);
  await moveTo(1, 150 + 120, 900);
  await sleep(300);
  check(await E(() => !!window.__floor15.run), 'a full push runs');
  // a second finger on the Attack button must not stop the stick finger (multi-touch) and swings at the air
  const atk = await E(() => window.__floor15.debugButton('attack'));
  const en0 = await E(() => window.__floor15.state.needs.energy);
  touches.set(2, atk); await send('touchStart'); touches.delete(2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: atk.x, y: atk.y, id: 2 }] });
  await sleep(300);
  check(await E(() => window.__floor15.stick.active), 'a second finger on a button does not drop the stick finger (multi-touch)');
  check(await E(() => window.__floor15.combat.cd > 0 || window.__floor15.combat.cdMax > 0) && (await E(() => window.__floor15.state.needs.energy)) < en0, 'Attack with nothing in reach swings at the air (costs energy)');
  await up(1);
  await E(() => { const g = window.__floor15; g.debugGoto(2, 3); g.run = null; });
  await sleep(300);

  // the world is not touchable: a tap on empty floor, and a tap on the closed door, do nothing
  const tp = await E(() => window.__floor15.debugTileToClient(3, 4, 0));
  const t0 = await vis();
  await page.touchscreen.tap(tp.x, tp.y);
  await sleep(600);
  const t1 = await vis();
  check(Math.hypot(t1.hx - t0.hx, t1.hy - t0.hy) < 0.01 && !(await E(() => window.__floor15.walk)), 'a tap on empty floor does nothing');
  await E(() => { const g = window.__floor15; g.debugGoto(6, 8); });
  await sleep(500);
  const dtp = await E(() => window.__floor15.debugTileToClient(6, 10, 40));
  await page.touchscreen.tap(dtp.x, dtp.y);
  await sleep(800);
  check((await vis()).door === 'closed' && !(await E(() => window.__floor15.walk)) && !(await E(() => window.__floor15.action)), 'tapping the door in the world does nothing');

  // walk up to the front door: it becomes the target, Main shows Open; pressing Main opens it
  check(b.door === 'closed', 'front door starts closed');
  await E(() => { const g = window.__floor15; g.debugGoto(6, 9); g.hero.facing = 90; });
  await page.waitForFunction(() => window.__floor15.targeting.target?.kind === 'door', null, { timeout: 5000 });
  check(await E(() => window.__floor15.slots.main?.id === 'open' && window.__floor15.slots.main.icon === 'open_door'), 'the door is the target and Main shows Open');
  await sleep(300);
  await page.screenshot({ path: `${shots}/e2e-iso-target-360x800.png` });
  const mb = await E(() => window.__floor15.debugButton('main'));
  await page.touchscreen.tap(mb.x, mb.y);
  await page.waitForFunction(() => window.__floor15.world.doors.find((x) => x.id === window.__floor15.world.home.frontDoor).state === 'open', null, { timeout: 8000 });
  await sleep(500);
  const c = await vis();
  check(c.door === 'open', 'pressing Main opens the door');
  check(c.s > a.s, `vision memory grew after opening the door (${a.s} -> ${c.s} remembered tiles)`);
  await page.screenshot({ path: `${shots}/e2e-iso-door-360x800.png` });

  // double tap in the stick zone turns the hero around (180 degrees, 0.2 s)
  await E(() => { window.__floor15.hero.facing = 90; window.__floor15.faceTarget = null; });
  await sleep(100);
  const f0 = (await vis()).facing;
  // (coordinates are converted once: each CDP touch event can take 100+ ms on a software renderer)
  const zp = await toClient(100, 1000);
  const rawTap = async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: zp.x, y: zp.y, id: 1 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await rawTap();
  await rawTap();
  await sleep(500);
  const f1 = (await vis()).facing;
  check(Math.abs(((f1 - f0 + 540) % 360) - 180) > 172, `a double tap in the stick zone turns him around (${f0.toFixed(0)} -> ${f1.toFixed(0)} deg)`);
  // a single tap does nothing
  await rawTap();
  await sleep(500);
  check(Math.abs((await vis()).facing - f1) < 1, 'a single tap in the stick zone does nothing');

  // the camera cannot be panned: a drag outside the stick zone leaves it following the hero
  const cam0 = await E(() => ({ x: window.__floor15.camera.x, y: window.__floor15.camera.y }));
  await down(1, 500, 300);
  for (let k = 1; k <= 8; k++) { await moveTo(1, 500 + k * 12, 300 + k * 6); await sleep(16); }
  await up(1);
  await sleep(300);
  const cam1 = await E(() => ({ x: window.__floor15.camera.x, y: window.__floor15.camera.y }));
  check(Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y) < 20, `dragging does not pan the camera (${Math.round(Math.hypot(cam1.x - cam0.x, cam1.y - cam0.y))} px)`);
  const f2 = (await vis()).facing;
  check(Math.abs(f2 - f1) < 1, 'dragging on the world does not turn the hero (no look drag)');

  // the hero rests above the control band (camera.heroScreenYFrac 0.4)
  await E(() => { const g = window.__floor15; g.debugGoto(8, 8); });
  await sleep(1500);
  const hy = await E(() => { const g = window.__floor15; return { y: g.heroSp.y - g.cameras.main.scrollY, h: g.scale.height }; });
  check(hy.y > 0.28 * hy.h && hy.y < 0.55 * hy.h, `the hero stands high on screen, above the control band (y ${Math.round(hy.y)} of ${hy.h})`);

  // Stick: Right mirrors the button arc and the stick zone (GDD 4)
  await E(() => { const g = window.__floor15; g.menuPanel.ctrl.onToggleStickSide(); });
  await sleep(200);
  const mirrored = await E(() => { const g = window.__floor15; return { mainX: g.buttons.centre('main').x, w: g.scale.width }; });
  check(mirrored.mainX < mirrored.w / 2, `Stick: Right moves the button arc to the lower-left (Main x ${Math.round(mirrored.mainX)} of ${mirrored.w})`);
  await down(1, 600, 900);
  await moveTo(1, 600 + 80, 900);
  await sleep(200);
  check(await E(() => window.__floor15.stick.active), 'with Stick: Right the stick zone is the lower-right');
  await up(1);
  await down(1, 100, 900);
  await sleep(150);
  check(await E(() => !window.__floor15.stick.down), 'and the lower-left no longer starts the stick');
  await up(1);
  await E(() => { window.__floor15.menuPanel.ctrl.onToggleStickSide(); });

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
