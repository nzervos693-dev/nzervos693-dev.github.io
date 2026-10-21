import { open, done, check, sleep, cam, tapWorld, until, toPage } from './stage2.mjs';
async function tapMenu(P, text) {
  const pos = await P.g((t) => { const c = window.__floor15.menu.c; const b = c?.list.find((o) => o.list && o.list.some((k) => k.type === 'Text' && k.text === t)); return b ? { x: b.x, y: b.y } : null; }, text);
  if (!pos) return false;
  await tapWorld(P, pos.x, pos.y);
  return true;
}
for (const view of ['360x800', '412x915']) {
  console.log('=== ' + view);
  const P = await open(view);
  const ly = await P.g(() => window.__floor15.view.lineY(15));
  // open f15R door with 3 real taps from the landing
  await P.g(() => window.__floor15.debugGoto(15, 1560)); await sleep(500);
  let n = 0;
  for (; n < 8 && (await P.g(() => window.__floor15.state.doors.f15R.state)) === 'jammed'; n++) { await tapWorld(P, 1680, ly - 48); await sleep(900); }
  check(n === 3, `f15R front door opens with 3 taps (${n})`);
  const cleared0 = await P.g(() => !!window.__floor15.state.flags?.aptCleared?.f15R);
  check(!cleared0, 'f15R is not home before it is cleared');
  // fight the crawler with real taps (fists)
  const t0 = Date.now();
  let hits = 0;
  while (Date.now() - t0 < 90000) {
    const st = await P.g(() => { const s = window.__floor15; const rt = s.zombies.list.find((r) => r.rec.id.startsWith('f15R') && !r.rec.dead && !r.dying); s.state.needs.health = Math.max(s.state.needs.health, 60); return rt ? { x: rt.rec.x, floor: rt.rec.floor, hx: s.state.hero.x, mode: rt.ai.mode } : null; });
    if (!st) break;
    // keep the camera on screen near the zombie
    const c = await cam(P);
    if (st.x < c.x + 30 || st.x > c.x + 690) await P.g((x) => { const s = window.__floor15; s.following = false; s.dragPauseUntil = Date.now() + 5000; s.setScrollX(x - 360); }, st.x);
    await tapWorld(P, st.x, ly - 30); hits++;
    await sleep(500);
  }
  const alive = await P.g(() => window.__floor15.zombies.list.filter((r) => r.rec.id.startsWith('f15R') && !r.rec.dead && !r.dying).length);
  check(alive === 0, `crawler killed with real taps (${hits} taps)`);
  await sleep(800);
  const fl = await P.g(() => { const s = window.__floor15; return { cleared: !!s.state.flags?.aptCleared?.f15R, flags: JSON.stringify(s.state.flags?.aptCleared), floorState: JSON.stringify(s.state.floors?.[15] ?? null) }; });
  console.log(JSON.stringify(fl));
  check(fl.cleared, 'f15R is latched as cleared (becomes home)');
  // stockpile access and Store all inside f15R
  await P.g(() => window.__floor15.debugGoto(15, 2000)); await sleep(500);
  await P.g(() => { window.__floor15.debugGive('wood', 12); window.__floor15.debugGive('cloth', 4); });
  const canStore = await P.g(() => window.__floor15.canStoreAll());
  check(canStore, 'Store all is available inside f15R (counts as home)');
  // dismantle (debug flag) a floor object in f15R so its slot is free
  const freed = await P.g(() => { const s = window.__floor15; const o = s.tower.apartments.get('f15R').objects.find((q) => q.layer === 'floor' && !q.door && q.objectId !== 'wardrobe'); s.state.objects[o.id] = { ...(s.state.objects[o.id] || {}), dismantled: true }; s.view.refresh(); return [o.id, o.x, o.objectId]; });
  console.log('freed', JSON.stringify(freed));
  // placement: craft the Survivor bed from the workbench (real taps), look at the spots offered
  await P.g(() => window.__floor15.debugGoto(15, 888 + 0)); await sleep(500);
  const wb = await P.g(() => { const t = window.__floor15.view.targetsOnFloor(15).find((q) => q.type === 'fixture' && q.id === 'workbench'); return { x: t.x, cy: t.cy }; });
  await tapWorld(P, wb.x, wb.cy);
  const opened = await until(P, () => window.__floor15.craftPanel.isOpen || window.__floor15.menu.isOpen, null, 8000);
  if (await P.g(() => window.__floor15.menu.isOpen)) { await tapMenu(P, 'Use'); await until(P, () => window.__floor15.craftPanel.isOpen, null, 8000); }
  check(await P.g(() => window.__floor15.craftPanel.isOpen), 'workbench opens the craft panel');
  for (let i = 0; i < 6; i++) {
    const pos = await P.g(() => window.__floor15.craftPanel.rowPos.get('survivor_bed') || null);
    if (pos) { const b = await P.g(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, k: r.width / 720 }; }); await P.page.touchscreen.tap(b.l + pos.x * b.k, b.t + pos.y * b.k); break; }
    const next = await P.g(() => { const b = window.__floor15.craftPanel.nextBtn; return b ? { x: b.x, y: b.y } : null; });
    if (!next) break;
    const b = await P.g(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, k: r.width / 720 }; });
    await P.page.touchscreen.tap(b.l + next.x * b.k, b.t + next.y * b.k); await sleep(200);
  }
  await sleep(200);
  const btn = await P.g(() => { const b = window.__floor15.craftPanel.craftBtn; return b ? { x: b.x, y: b.y, a: b.alpha } : null; });
  check(btn && btn.a === 1, 'Survivor bed craft button enabled');
  if (btn) { const b = await P.g(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return { l: r.left, t: r.top, k: r.width / 720 }; }); await P.page.touchscreen.tap(b.l + btn.x * b.k, b.t + btn.y * b.k); }
  await sleep(500);
  const spots = await P.g(() => window.__floor15.placement.spots?.map((s) => [s.key, Math.round(s.x)]));
  console.log('placement spots', JSON.stringify(spots));
  check(await P.g(() => window.__floor15.placement.active), 'placement mode starts');
  check(spots.some((s) => s[1] === freed[1]), 'a freed slot in f15R is offered as a spot (and only freed ones)');
  check(spots.filter((s) => s[1] > 1680).length === 1, 'occupied f15R slots are not offered');
  check(spots.some((s) => s[1] < 1440), 'spots in the start flat are offered');
  await P.shot('home-placement');
  // pick an f15R spot: pan there, tap it
  const far = spots.filter((s) => s[1] > 1680)[0];
  await P.g((x) => { const s = window.__floor15; s.following = false; s.dragPauseUntil = Date.now() + 60000; s.setScrollX(x - 360); }, far[1]);
  await sleep(300);
  await P.shot('home-placement-f15R');
  await tapWorld(P, far[1], ly - 48);
  const placed = await until(P, () => Object.values(window.__floor15.state.build.spots).some((p) => p.id === 'survivor_bed'), null, 25000);
  check(placed, `the bed is placed in f15R at x ${far[1]} (hero walked ${Math.abs(far[1] - 888)} px)`);
  await P.shot('home-bed-f15R');
  check(P.errors.length === 0, 'no console errors ' + P.errors.join('|'));
  await P.ctx.close();
}
await done();
