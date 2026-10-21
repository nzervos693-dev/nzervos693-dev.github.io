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
  for (const [floor, id, x0, scroll] of [[15, 'f15L-4-floor1', 400, -48], [13, 'f13R-5-floor1', 2700, 2448], [17, 'f17R-2-floor2', 2700, 2448], [14, 'f14L-5-floor1', 400, -48]]) {
    const exists = await P.g((id) => !!window.__floor15.tower.objects.get(id), id);
    if (!exists) { console.log('skip', id); continue; }
    await P.g(([f, x, sc]) => { const s = window.__floor15; s.state.needs.health = 100; for (const rt of s.zombies.list.slice()) if (!rt.dying) s.zombies.kill(rt); s.debugGoto(f, x); s.following = false; s.dragPauseUntil = Date.now() + 600000; s.setScrollX(sc); }, [floor, x0, scroll]);
    await sleep(400);
    const t = await P.g(([f, id]) => { const q = window.__floor15.view.targetsOnFloor(f).find((q) => q.id === id); return q ? { x: q.x, cy: q.cy } : null; }, [floor, id]);
    const pg = await toPage(P, t.x, t.cy);
    const vw = (await P.page.viewportSize()).width;
    console.log(id, 'x', t.x, 'page x', Math.round(pg.x), 'of', vw);
    check(pg.x - 24 >= 0 && pg.x + 24 <= vw, `${id}: the object (x ${t.x}) is fully on screen at the world edge`);
    await tapWorld(P, t.x, t.cy);
    await sleep(500);
    const menuOpen = await P.g(() => window.__floor15.menu.isOpen);
    check(menuOpen, `${id}: tapping an edge object opens its menu`);
    const box = await P.g(() => { const c = window.__floor15.menu.c; const cam = window.__floor15.cameras.main; if (!c) return null; const b = c.getBounds(); return { l: b.left - cam.scrollX, r: b.right - cam.scrollX }; });
    console.log('menu bounds (game px)', JSON.stringify(box));
    if (box) check(box.l >= 8 && box.r <= 712, `${id}: the action menu stays inside the screen (${Math.round(box.l)}..${Math.round(box.r)} of 720)`);
    await P.shot(`edge-${id}`);
    await tapMenu(P, 'Search');
    const ok = await until(P, (id) => !!window.__floor15.state.objects[id]?.searched, id, 25000);
    const hx = await P.g(() => window.__floor15.state.hero.x);
    check(ok, `${id}: search completes (hero at x ${Math.round(hx)})`);
  }
  // hero can walk to the very edge by tapping the ground beside it
  await P.g(() => { const s = window.__floor15; s.debugGoto(15, 300); s.following = true; s.dragPauseUntil = 0; });
  await sleep(300);
  const ly = await P.g(() => window.__floor15.view.lineY(15));
  await tapWorld(P, 30, ly + 20);
  await sleep(3500);
  const hx2 = (await cam(P)).hx;
  check(hx2 <= 50, `a ground tap at the far left walks to the edge (x ${Math.round(hx2)})`);
  await P.shot('edge-hero-left');
  check(P.errors.length === 0, 'no console errors ' + P.errors.join('|'));
  await P.ctx.close();
}
await done();
