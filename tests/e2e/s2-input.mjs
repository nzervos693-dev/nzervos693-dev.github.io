import { open, done, check, sleep, cam, drag, flingDrag, tapWorld, toPage, until } from './stage2.mjs';
for (const view of ['360x800', '412x915']) {
  console.log('=== ' + view);
  const P = await open(view);
  const ly = await P.g(() => window.__floor15.view.lineY(15));
  await P.g(() => { const s = window.__floor15; s.following = false; s.dragPauseUntil = Date.now() + 600000; s.setScrollX(300); });
  // 1. drag that starts on an object / zombie / door pans and opens no menu
  for (const [label, id] of [['object', 'f15L-1-floor1'], ['workbench', 'workbench']]) {
    const t = await P.g((id) => { const q = window.__floor15.view.targetsOnFloor(15).find((q) => q.id === id); return { x: q.x, cy: q.cy }; }, id);
    await P.g((x) => window.__floor15.setScrollX(x - 360), t.x);
    const c0 = await cam(P);
    const pg = await toPage(P, t.x, t.cy);
    const b = await P.g(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, k: r.width / 720 }; });
    await drag(P, (pg.x - b.l) / b.k, (pg.y - b.t) / b.k, -60, 0, { steps: 6, ms: 16 });
    await sleep(2500);
    const c1 = await cam(P);
    const menu = await P.g(() => window.__floor15.menu.isOpen);
    check(c1.x - c0.x > 80 && !menu, `a drag that starts on ${label} pans (x +${Math.round(c1.x - c0.x)}) and opens no menu`);
  }
  // 2. two fingers: second finger ignored, no errors, camera follows finger 1 only
  await P.g(() => window.__floor15.setScrollX(600));
  const c0 = await cam(P);
  const b = await P.g(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, k: r.width / 720 }; });
  const x1 = b.l + 300 * b.k, y1 = b.t + 700 * b.k, x2 = b.l + 500 * b.k, y2 = b.t + 700 * b.k;
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }] });
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1, id: 1 }, { x: x2, y: y2, id: 2 }] });
  for (let i = 1; i <= 4; i++) await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 - 20 * i, y: y1, id: 1 }, { x: x2 + 30 * i, y: y2, id: 2 }] });
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(2000);
  const c1 = await cam(P);
  console.log('two fingers: x', Math.round(c0.x), '->', Math.round(c1.x));
  check(c1.x > c0.x && c1.x - c0.x < 400, 'two-finger drag moves the camera by the first finger only, no pinch zoom');
  check(await P.g(() => window.__floor15.cameras.main.zoom) === 1, 'camera zoom stays 1');
  // 3. rapid tapping: 30 alternating ground taps while walking
  await P.g(() => window.__floor15.debugGoto(15, 700)); await sleep(300);
  let errs0 = P.errors.length;
  for (let i = 0; i < 30; i++) { const c = await cam(P); await tapWorld(P, i % 2 ? c.x + 60 : c.x + 660, ly + 20); }
  await sleep(1500);
  const st = await P.g(() => { const s = window.__floor15; return { hx: s.state.hero.x, hf: s.state.hero.floor, route: s.route.length, over: s.gameOver, nan: Number.isNaN(s.state.hero.x) }; });
  check(!st.nan && st.hx > 0 && st.hx < 3120 && P.errors.length === errs0, `30 rapid taps: hero sane at ${Math.round(st.hx)}, no errors`);
  // 4. rotation to landscape and back
  const vs = P.view === '360x800' ? [800, 360] : [915, 412];
  await P.page.setViewportSize({ width: vs[0], height: vs[1] }); await sleep(800);
  const land = await P.g(() => { const r = document.querySelector('canvas').getBoundingClientRect(); const c = window.__floor15.cameras.main; return { w: r.width, h: r.height, l: r.left, t: r.top, sx: c.scrollX, sw: window.__floor15.scale.width }; });
  console.log('landscape canvas', JSON.stringify(land), 'viewport', vs);
  check(land.h <= vs[1] + 1 && land.w <= vs[0] + 1 && land.l >= -1, 'landscape: canvas fits inside the viewport');
  await P.shot('landscape');
  // tap works in landscape
  const hx0 = (await cam(P)).hx;
  const lp = await toPage(P, hx0 + 100, ly + 20);
  await P.page.touchscreen.tap(lp.x, lp.y); await sleep(1500);
  check(Math.abs((await cam(P)).hx - hx0) > 10, 'a tap in landscape still walks the hero');
  await P.page.setViewportSize(P.view === '360x800' ? { width: 360, height: 800 } : { width: 412, height: 915 }); await sleep(800);
  const back = await P.g(() => { const r = document.querySelector('canvas').getBoundingClientRect(); const c = window.__floor15.cameras.main; return { w: r.width, h: r.height, sx: c.scrollX }; });
  check(back.w > 340 && back.sx >= -48 && back.sx <= 2448, `after rotating back the canvas is fitted again (${Math.round(back.w)}x${Math.round(back.h)}) and the camera is in bounds (${Math.round(back.sx)})`);
  check(P.errors.length === 0, 'no console errors ' + P.errors.join('|'));
  await P.ctx.close();
}
await done();
