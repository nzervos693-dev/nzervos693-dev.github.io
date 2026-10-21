import { open, done, check, sleep, cam, tapWorld, until, tapFixed } from './stage2.mjs';
async function tapMenu(P, text) {
  const pos = await P.g((t) => { const c = window.__floor15.menu.c; const b = c?.list.find((o) => o.list && o.list.some((k) => k.type === 'Text' && k.text === t)); return b ? { x: b.x, y: b.y } : null; }, text);
  if (!pos) return false;
  await tapWorld(P, pos.x, pos.y);
  return true;
}
/** Walk to an object with real taps (teleport next to it first) and search it. Returns { toast, gained } */
async function search(P, id, { floor, label = 'Search' } = {}) {
  const info = await P.g((id) => { const s = window.__floor15; for (let f = 13; f <= 17; f++) { const t = s.view.targetsOnFloor(f).find((q) => q.id === id); if (t) return { floor: f, x: t.x }; } return null; }, id);
  await P.g(([f, x]) => window.__floor15.debugGoto(f, x - 150 < 60 ? x + 150 : x - 150), [info.floor, info.x]);
  await P.g(() => { const s = window.__floor15; for (const rt of s.zombies.list.slice()) if (!rt.dying && rt.rec.floor === s.state.hero.floor) s.zombies.kill(rt); s.state.needs.health = 100; });
  await sleep(500);
  const before = await P.g(() => JSON.stringify(window.__floor15.state.inventory));
  const tgt = await P.g(([f, id]) => { const t = window.__floor15.view.targetsOnFloor(f).find((q) => q.id === id); return t ? { x: t.x, cy: t.cy } : null; }, [info.floor, id]);
  if (!tgt) return { err: 'no target' };
  await tapWorld(P, tgt.x, tgt.cy);
  await sleep(400);
  const menuOpen = await P.g(() => window.__floor15.menu.isOpen);
  if (menuOpen) await tapMenu(P, label);
  const t0 = Date.now();
  const done1 = await until(P, (id) => !!window.__floor15.state.objects[id]?.searched, id, 15000);
  const dt = Date.now() - t0;
  await sleep(200);
  const toast = await P.g(() => window.__floor15.toast.text?.text);
  return { done: done1, ms: dt, toast, menuOpen };
}
for (const view of ['360x800', '412x915']) {
  console.log('=== ' + view);
  const P = await open(view);
  const ids = await P.g(() => { const s = window.__floor15; const out = { empty: [] }; for (const [id, o] of s.tower.objects) { const p = o.placement || o; if (p.empty) out.empty.push([id, o.apt?.condition ?? p.apt?.condition, o.x]); } return out; });
  if (!ids.empty.length) console.log('keys', await P.g(() => Object.keys([...window.__floor15.tower.objects.values()][0])));
  console.log('empty', JSON.stringify(ids));
  // empty containers by condition
  const lines = { ransacked: ['Someone got here first.', 'Turned out and picked over.', 'Nothing. The drawer hangs open.'], burned: ["Ash and a smell that won't go.", 'Nothing left but soot.', 'Whatever was here is gone.'], normal: ['Nothing.', 'Just mouse droppings.', 'Empty. Someone ate well here once.'] };
  for (const [id, cond] of ids.empty.filter((e) => ['f14L', 'f16R', 'f13R'].some((p) => e[0].startsWith(p))).slice(0, 4)) {
    const r = await search(P, id);
    console.log(id, cond, JSON.stringify(r));
    const first = (r.toast || '').split('\n')[0];
    check(r.done && lines[cond].includes(first), `${id} (${cond}) shows a prose empty line: "${first}" (${r.ms} ms)`);
    check(!/\d/.test(first.replace(/^Note.*/, '')), `no digits in empty line`);
    if (cond === 'burned') await P.shot('loot-burned-empty');
  }
  // note on first search
  const r2 = await search(P, 'f14L-2-wall1');
  console.log(JSON.stringify(r2));
  check(r2.done && /Note: "Boiled the last of the rice/.test(r2.toast || ''), `note appears on first search (empty drawer): ${JSON.stringify(r2.toast)}`);
  await P.shot('loot-note');
  const r3 = await search(P, 'f14R-1-wall4');   // note_water, loot table
  console.log(JSON.stringify(r3));
  check(r3.done && /Note: "Water stopped/.test(r3.toast || ''), `note on a normal container: ${JSON.stringify(r3.toast)}`);
  // fixed loot: f15L fridge
  const fx = await P.g(() => { const o = window.__floor15.tower.objects.get('f15L-2-floor0'); return { f: o.fixedLoot, id: o.id }; });
  const before = await P.g(() => JSON.stringify(window.__floor15.state.inventory));
  const r4 = await search(P, 'f15L-2-floor0');
  const after = await P.g(() => JSON.stringify(window.__floor15.state.inventory));
  console.log('fridge', JSON.stringify(fx.f), JSON.stringify(r4), before, after);
  check(r4.done && r4.toast && !/Nothing|picked|ate well/.test(r4.toast), `fixedLoot fridge gives its items: ${JSON.stringify(r4.toast)}`);
  // drawer hint_nails
  const r5 = await search(P, 'f15L-2-wall0');
  console.log(JSON.stringify(r5));
  // padlocked cage without crowbar
  const cage = [['f17R-0-floor0'], ['f17R-0-floor1']];
  console.log('cages', JSON.stringify(cage));
  const cid = cage[0][0];
  const rc = await search(P, cid);
  console.log('cage no crowbar', JSON.stringify(rc), await P.g((id) => window.__floor15.state.objects[id]?.searched, cid));
  check(!rc.done, `padlocked cage cannot be searched without a crowbar, toast "${rc.toast}"`);
  await P.shot('loot-cage-padlocked');
  await P.g(() => window.__floor15.debugGive('crowbar', 1));
  const rc2 = await search(P, cid);
  console.log('cage crowbar', JSON.stringify(rc2));
  check(rc2.done, `cage opens with a crowbar (${rc2.ms} ms)`);
  check(P.errors.length === 0, 'no console errors ' + P.errors.join('|'));
  await P.ctx.close();
}
await done();
