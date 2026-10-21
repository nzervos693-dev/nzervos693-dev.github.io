import { open, done, check, sleep, cam } from './stage2.mjs';
for (const view of ['360x800', '412x915']) {
  console.log('=== ' + view);
  const P = await open(view, '?debug&attacks');
  const info = await P.g(() => { const s = window.__floor15; return { bx: s.tower.barricadeX, inside: s.tower.barricadeInside, entry: s.tower.stairwell.entryX, home: s.tower.homeFloor, bs: JSON.stringify(s.tower.apartments.get('f15L').buildSpots?.barricade) }; });
  console.log(JSON.stringify(info));
  await P.g(() => {
    const s = window.__floor15; const b = s.state.build.barricade; b.level = 1; b.hp = s.balance.barricade.levels?.[0]?.hp ?? 40; s.view.refresh();
    window.__ev = []; for (const e of ['attack-cue', 'attack-stairwell', 'attack-start', 'attack-end', 'barricade-broken']) s.bus.on(e, (p) => window.__ev.push([e, Math.round(performance.now())]));
    s.balance.attacks.cueSeconds = 6; s.balance.attacks.cue = { groanAtSeconds: 6, stairwellAtSeconds: 4, flickerFromSeconds: 4, stairwellAudibleFloors: 2 };
    s.state.build.barricade.hp = Math.max(b.hp, 30);
    s.debugGoto(15, 200);   // far end of the flat: far from the door, out of sight
    s.state.attacks.nextAt = Date.now() + 8000;
  });
  const log = [];
  const t0 = Date.now();
  let landed = false;
  while (Date.now() - t0 < 60000) {
    const r = await P.g(() => { const s = window.__floor15; const bar = s.state.build.barricade; return { phase: s.attacks.phase, hp: bar.hp, shade: s.view.landingShade.alpha, z: s.zombies.list.filter(r => r.rec.id.startsWith('attack:')).map(r => [Math.round(r.rec.x), r.rec.floor, r.ai.mode]), hero: s.state.hero.x, hf: s.state.hero.floor }; });
    log.push({ t: Math.round((Date.now() - t0) / 100) / 10, ...r });
    if (r.phase === 'idle' && log.length > 5 && log.some(l => l.phase === 'fight')) break;
    if (r.z.length && r.hp < 30 && log.filter(l => l.hp < 30).length > 3) { /* barricade is taking hits */ }
    if (log.some(l => l.phase === 'fight') && log.filter(l => l.phase === 'fight').length > 40) break;
    await sleep(500);
  }
  const fight = log.filter(l => l.phase === 'fight');
  console.log(log.filter((_, i) => i % 3 === 0).map(l => `${l.t}s ${l.phase} hp${Math.round(l.hp)} shade${l.shade.toFixed(2)} ${JSON.stringify(l.z)}`).join('\n'));
  const dips = new Set(log.filter(l => l.phase === 'cue').map(l => l.shade.toFixed(2)));
  check(dips.size > 1, `cue flickers the shaft light (${dips.size} dip values)`);
  const first = log.find(l => l.z.length);
  check(first && first.z[0][1] === 15 && Math.abs(first.z[0][0] - info.entry) < 100, `attackers appear at the stairs on floor 15 (${JSON.stringify(first?.z[0])})`);
  const minX = Math.min(...fight.flatMap(l => l.z.map(q => q[0])));
  check(minX >= info.bx - 1 && minX < info.bx + 70, `attackers walk to the home front door / barricade and stop outside it (min x ${minX}, barricade ${info.bx})`);
  const hpMin = Math.min(...log.map(l => l.hp));
  check(hpMin < 30, `they hit the barricade (hp 30 -> ${Math.round(hpMin)})`);
  console.log('events', JSON.stringify(await P.g(() => window.__ev)));
  await P.shot('attack-barricade');
  check(P.errors.length === 0, 'no console errors ' + P.errors.join('|'));
  await P.ctx.close();
}
await done();
