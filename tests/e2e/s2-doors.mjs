import { open, done, check, sleep, cam, tapWorld, until } from './stage2.mjs';
const zs = (P, floor) => P.g((f) => window.__floor15.zombies.list.filter(r => r.rec.floor === f).map(r => ({ id: r.rec.id, x: Math.round(r.rec.x), mode: r.ai.mode, type: r.rec.type })), floor);
for (const view of ['360x800', '412x915']) {
  console.log('=== ' + view);
  const P = await open(view);
  const ly = (f) => 880 - (15 - f) * 0 ; // placeholder, replaced below
  const lineY = (f) => P.g((fl) => window.__floor15.view.lineY(fl), f);
  // ---- front door f13L from the landing
  await P.g(() => window.__floor15.debugGoto(13, 1560)); await sleep(500);
  const y13 = await lineY(13);
  await tapWorld(P, 1330, y13 + 20);   // ground inside the flat, behind the jammed door
  await sleep(4000);
  let c = await cam(P);
  check(c.hx > 1440 && c.hx <= 1482, `hero stops at the jammed front door of f13L (x ${Math.round(c.hx)}), cannot enter`);
  const door = await P.g(() => window.__floor15.state.doors.f13L.state);
  check(door === 'jammed', 'door still jammed after walking into it');
  await P.shot('door-f13L-blocked');
  // zombie inside forced to chase the hero's noise: must not pass the door
  await P.g(() => { const s = window.__floor15; for (const r of s.zombies.list) if (r.rec.floor === 13 && r.rec.x > 800 && r.rec.x < 1440) { r.ai.mode = 'chase'; r.ai.lastKnownX = 1500; r.ai.noticed = true; } });
  await sleep(9000);
  let z = await zs(P, 13);
  const inside = z.filter(q => q.x > 800 && q.x < 1500);
  console.log('zombies f13', JSON.stringify(z));
  check(z.filter(q => q.id.startsWith('f13L')).every(q => q.x <= 1440) , `zombies chasing the hero stay inside the jammed front door (max x ${Math.max(...z.filter(q => q.id.startsWith('f13L')).map(q => q.x))})`);
  check(z.some(q => q.id.startsWith('f13L') && q.x >= 1200), 'a chaser walks toward the door and stops at it');
  // hero hits door 3 times with fists (real taps)
  let nt = 0;
  for (; nt < 8 && (await P.g(() => window.__floor15.state.doors.f13L.state)) === 'jammed'; nt++) { await tapWorld(P, 1440, y13 - 48); await sleep(900); }
  const opened = (await P.g(() => window.__floor15.state.doors.f13L.state)) !== 'jammed';
  console.log('door taps used', nt);
  check(nt === 3, `exactly 3 taps (hits) force the front door (used ${nt})`);
  check(opened, 'three taps force the door open');
  // ---- interior jammed bathroom door f13L (x 240), from the bathroom side and from the bedroom side
  const doorId = await P.g(() => [...window.__floor15.tower.floors.get(13).doors].filter(d => d.x === 240).map(d => d.id)[0]);
  const st = await P.g((id) => window.__floor15.state.doors[id].state, doorId);
  console.log('interior door', doorId, st);
  check(st === 'jammed', 'f13L bathroom door starts jammed');
  // from the bathroom side (Mara's side): hero x 150, walks right
  await P.g(() => window.__floor15.debugGoto(13, 150)); await sleep(400);
  console.log('dialogue', await P.g(() => window.__floor15.dialogue.isOpen));
  await tapWorld(P, 330, y13 + 20);
  await sleep(3000);
  console.log('hero', JSON.stringify(await cam(P)), await P.g(() => window.__floor15.toast.text?.text));
  c = await cam(P);
  check(c.hx < 240 && c.hx >= 190, `from the bathroom side the hero stops at the door (x ${Math.round(c.hx)})`);
  // crawler in the bedroom chases hero's last known x on the other side
  await P.g(() => { const s = window.__floor15; for (const r of s.zombies.list) if (r.rec.floor === 13 && r.rec.x > 240 && r.rec.x < 480) { r.ai.mode = 'chase'; r.ai.lastKnownX = 150; r.ai.noticed = true; } });
  await sleep(8000);
  z = await zs(P, 13);
  console.log('zombies f13', JSON.stringify(z));
  const cr = z.find(q => q.type === 'crawler');
  check(cr && cr.x >= 240, `crawler cannot cross the jammed bathroom door (x ${cr?.x})`);
  // from the bedroom side
  await P.g(() => window.__floor15.debugGoto(13, 330)); await sleep(400);
  await tapWorld(P, 150 + 0, y13 + 20);
  await sleep(3500);
  c = await cam(P);
  check(c.hx > 240 && c.hx <= 290, `from the bedroom side the hero stops at the door (x ${Math.round(c.hx)})`);
  // crowbar opens in ~1 s
  await P.g(() => window.__floor15.debugGive('crowbar', 1));
  await tapWorld(P, 240, y13 - 48);
  const t0 = Date.now();
  await sleep(500); console.log('pry state', await P.g(() => ({ a: window.__floor15.action?.spec?.kind, hero: window.__floor15.state.hero.x, pend: window.__floor15.pending?.kind })));
  const pried = await until(P, (id) => window.__floor15.state.doors[id].state !== 'jammed', doorId, 20000);
  check(pried, `crowbar opens the interior door (${Date.now() - t0} ms incl. walk)`);
  // ---- f16R and f15R fronts, from the landing
  for (const [f, id, wx] of [[16, 'f16R', 1800], [15, 'f15R', 1800]]) {
    await P.g(([fl]) => window.__floor15.debugGoto(fl, 1560), [f]); await sleep(400);
    const y = await lineY(f);
    await tapWorld(P, 1560 + 230, y + 20);
    await sleep(3500);
    c = await cam(P);
    check(c.hx >= 1630 && c.hx < 1680, `${id}: hero stops short of the jammed door (x ${Math.round(c.hx)})`);
  }
  check(P.errors.length === 0, 'no console errors: ' + P.errors.join('|'));
  await P.ctx.close();
}
await done();
