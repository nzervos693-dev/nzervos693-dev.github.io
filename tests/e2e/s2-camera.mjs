import { open, done, check, sleep, cam, drag, tapWorld, toPage, tapFixed, flingDrag, until } from './stage2.mjs';
for (const view of ['360x800', '412x915']) {
  console.log('=== ' + view);
  const P = await open(view);
  const info = await P.g(() => { const s = window.__floor15; const fx = s.tower.apartments.get('f15L').fixtures; return { fx: fx.map(f => [f.kind, f.x]), hero: s.state.hero, bedId: s.tower.homeBedId, maxScroll: s.maxScroll(), ly: s.view.lineY(15) }; });
  console.log(JSON.stringify(info));
  const bedX = 408; // f15L-3-floor0 (bedroom slot 0)
  check(Math.abs(info.hero.x - bedX) <= 100 && info.hero.floor === 15, `spawn at the bed (hero ${info.hero.x}, bed ${bedX})`);
  const c0 = await cam(P);
  const vw = 720;
  check(Math.abs((c0.x + vw / 2) - info.hero.x) <= 8, `camera centred on the hero at start (cam centre ${c0.x + vw / 2})`);
  // ---- tap-walk and dead-zone follow
  const log = [];
  let taps = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) {
    const c = await cam(P);
    log.push({ hx: c.hx, off: c.hx - (c.x + 360), camx: c.x });
    if (c.hx > 1300) break;
    if (c.hx > c.x + 360 + 160 - 5 && c.x + 700 - c.hx < 120 || taps === 0 || (Math.abs(c.hx - (log.at(-1).tapTarget ?? 0)) < 5)) { /* handled below */ }
    if (taps === 0 || !(await P.g(() => window.__floor15.route.length))) { await tapWorld(P, c.x + 690, info.ly + 20); taps++; }
    await sleep(100);
  }
  const maxOff = Math.max(...log.map(l => Math.abs(l.off)));
  const firstMove = log.findIndex((l, i) => i > 0 && Math.abs(l.camx - log[0].camx) > 1);
  console.log('taps', taps, 'samples', log.length);
  const offAtFirstMove = log[firstMove]?.off;
  console.log('offsets', log.filter((_, i) => i % 6 === 0).map(l => `${Math.round(l.hx)}:${Math.round(l.off)}`).join(' '));
  check(log.at(-1).hx > 1290, `hero walked to ~1300 (x ${Math.round(log.at(-1).hx)})`);
  check(offAtFirstMove > 140 && offAtFirstMove < 200, `camera stays still inside the +/-160 dead zone, starts moving at offset ${Math.round(offAtFirstMove)}`);
  check(maxOff < 230, `hero never strays far past the dead zone (max offset ${Math.round(maxOff)})`);
  await P.shot('cam-after-walk');
  // ---- follow pause: drag while the camera is following a walking hero
  await P.g(() => window.__floor15.debugGoto(15, 300)); await sleep(300);
  await P.g(() => { const s = window.__floor15; s.following = true; s.dragPauseUntil = 0; });
  await tapWorld(P, (await cam(P)).x + 690, info.ly + 20);
  await until(P, () => { const s = window.__floor15; return s.state.hero.x - (s.cameras.main.scrollX + 360) > 150; }, null, 20000);
  const hxBefore = (await cam(P)).hx;
  await flingDrag(P, 400, 700, 40, 0, { steps: 2, stepMs: 30 });
  const pauseLeft = await P.g(() => window.__floor15.dragPauseUntil - Date.now());
  const cp0 = await cam(P);
  const tStart = Date.now();
  let movedAt = null; let camAtPause = cp0.x;
  while (Date.now() - tStart < 4500) {
    await sleep(100);
    const c = await cam(P);
    const el = Date.now() - tStart;
    if (movedAt === null && el < 1700 && Math.abs(c.x - camAtPause) > 1) movedAt = el;
    if (el > 2600) break;
  }
  const cp1 = await cam(P);
  console.log('hero moved', Math.round(cp1.hx - hxBefore), 'px during/after the drag; pause left at drag end', Math.round(pauseLeft));
  check(pauseLeft > 1500 && pauseLeft <= 2000, `drag sets a ~2 s follow pause (${Math.round(pauseLeft)} ms left at drag end)`);
  check(movedAt === null, `camera does not follow during the pause (moved at ${movedAt})`);
  const dz = cp1.hx - (cp1.x + 360);
  console.log('after pause hero offset', Math.round(dz), 'cam', Math.round(cp1.x));
  check(Math.abs(dz) <= 200 || (await cam(P)).following === false, `follow resumes after the pause (offset ${Math.round(dz)})`);
  // ---- bounds + momentum
  await P.g(() => { const s = window.__floor15; s.following = false; s.dragPauseUntil = Date.now() + 600000; });
  await sleep(100);
  await drag(P, 600, 700, -100, 0, { steps: 5, ms: 6 });   // fling left finger -> content moves left -> camera x grows
  await sleep(100);
  await P.g(() => { window.__floor15.vx = 4000; });   // a hard fling to the right (momentum path, clamps without overshoot)
  let maxX = -1e9;
  for (let i = 0; i < 30; i++) { await sleep(100); maxX = Math.max(maxX, (await cam(P)).x); }
  const m2 = await cam(P);
  check(m2.x > 600 && m2.x <= 2448 + 0.01 && maxX <= 2448.01, `momentum carries the camera on and respects the bound (x ${Math.round(m2.x)}, max ${Math.round(maxX)})`);
  await P.g(() => { window.__floor15.vx = -9000; });
  let minX = 1e9;
  for (let i = 0; i < 30; i++) { await sleep(100); minX = Math.min(minX, (await cam(P)).x); }
  check(minX >= -48.01, `left momentum respects -48 (min ${Math.round(minX)})`);
  for (let i = 0; i < 6; i++) { await drag(P, 600, 700, -300, 0, { steps: 6, ms: 12 }); await sleep(100); }
  await sleep(2500);
  const r = await cam(P);
  check(Math.abs(r.x - 2448) < 1, `right bound = 3120 + 48 - 720 = 2448 (x ${r.x})`);
  await P.shot('cam-right-bound');
  for (let i = 0; i < 12; i++) { await drag(P, 100, 700, 300, 0, { steps: 6, ms: 12 }); await sleep(100); }
  await sleep(2500);
  const l = await cam(P);
  check(Math.abs(l.x + 48) < 1, `left bound -48 (x ${l.x})`);
  await P.shot('cam-left-bound');
  // ---- axis lock
  await P.g(() => window.__floor15.setScrollX(1000)); await sleep(100);
  const a0 = await cam(P);
  await drag(P, 300, 700, 70, 60, { steps: 10, ms: 16 }); await sleep(2800);   // diagonal x-dominant
  const a1 = await cam(P);
  check(Math.abs(a1.y - a0.y) < 0.5 && Math.abs(a1.x - a0.x) > 40, `diagonal x-dominant drag moves only x (dx ${Math.round(a1.x - a0.x)}, dy ${Math.round(a1.y - a0.y)})`);
  await drag(P, 300, 700, 60, 70, { steps: 10, ms: 16 }); await sleep(2800);   // diagonal y-dominant
  const a2 = await cam(P);
  check(Math.abs(a2.x - a1.x) < 0.5, `diagonal y-dominant drag moves no x (dx ${(a2.x - a1.x).toFixed(1)}, dy ${Math.round(a2.y - a1.y)}, maxScroll ${info.maxScroll})`);
  // starts vertical, then goes mostly horizontal: stays vertical-locked
  await P.g(() => window.__floor15.setScroll(150)); await sleep(100);
  const a3 = await cam(P);
  const b = await P.g(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, k: r.width / 720 }; });
  const x0 = b.l + 300 * b.k, y0 = b.t + 700 * b.k;
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (const [dx, dy] of [[0, 4], [0, 10], [0, 20], [60, 20], [120, 24], [150, 26]]) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + dx, y: y0 + dy }] }); await sleep(30); }
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(2500);
  const a4 = await cam(P);
  check(Math.abs(a4.x - a3.x) < 0.5, `axis stays locked to y once decided (x ${a3.x} -> ${a4.x}; y ${Math.round(a3.y)} -> ${Math.round(a4.y)})`);
  // ---- vertical scroll range
  await P.g(() => window.__floor15.setScroll(0)); const v0 = await cam(P);
  await drag(P, 300, 300, 0, 200, { steps: 8, ms: 16 }); await sleep(100);
  console.log('vertical: scrollY now', (await cam(P)).y, 'maxScroll', info.maxScroll);
  await P.ctx.close();
  P.errors.length && console.log(P.errors);
  check(P.errors.length === 0, 'no console errors');
}
await done();
