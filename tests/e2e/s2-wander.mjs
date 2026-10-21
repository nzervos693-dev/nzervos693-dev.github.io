import { open, done, check, sleep } from './stage2.mjs';
for (const view of ['360x800', '412x915']) {
  console.log('=== ' + view);
  const P = await open(view);
  await P.g(() => {
    const s = window.__floor15;
    for (const rt of s.zombies.list.slice()) if (!rt.dying && [14, 16].includes(rt.rec.floor)) s.zombies.kill(rt);
    s.checkFloorStates();
  });
  await sleep(1500);
  const fs = await P.g(() => JSON.stringify(window.__floor15.state.floorStates));
  console.log('floorStates', fs);
  await P.g(() => { const s = window.__floor15; for (const n of [14, 16]) s.state.wanderAt[n] = Date.now() - 1000; });
  await sleep(3500);
  const w1 = await P.g(() => Object.values(window.__floor15.state.zombies).filter((z) => z.id.startsWith('wander:')).map((z) => [z.id, z.floor, Math.round(z.x), z.type]));
  console.log('online wanderers', JSON.stringify(w1));
  check(w1.length >= 2 && w1.length <= 4, `online: 1-2 per due floor (${w1.length})`);
  check(w1.every(([, , x]) => (x >= 40 && x <= 1380) || (x >= 1740 && x <= 3080)), 'wanderers spawn inside the wings, not on the landing');
  const sprites = await P.g(() => window.__floor15.zombies.list.filter((r) => r.rec.id.startsWith('wander:')).length);
  check(sprites === w1.length, `each wanderer has a runtime sprite (${sprites})`);
  // offline 12 h
  await P.g(() => { const s = window.__floor15; s.state.times.lastTickAt = Date.now() - 12 * 3600 * 1000; s.applyOffline(12 * 3600 * 1000, false); });
  await sleep(500);
  const w2 = await P.g(() => Object.values(window.__floor15.state.zombies).filter((z) => z.id.startsWith('wander:') && !z.dead).map((z) => [z.floor, Math.round(z.x)]));
  console.log('after 12 h offline', JSON.stringify(w2), 'cap', await P.g(() => window.__floor15.balance.zombies.maxWanderersPerFloor ?? window.__floor15.tune?.maxWanderersPerFloor));
  const per = {}; for (const [f] of w2) per[f] = (per[f] || 0) + 1;
  check(Object.values(per).every((n) => n <= 3), `cap of 3 per floor holds ${JSON.stringify(per)}`);
  check(w2.every(([, x]) => (x >= 40 && x <= 1380) || (x >= 1740 && x <= 3080)), 'offline wanderers also in wings');
  await P.shot('wander-offline');
  const popup = await P.g(() => window.__floor15.popup.isOpen);
  console.log('popup', popup);
  check(P.errors.length === 0, 'no console errors ' + P.errors.join('|'));
  await P.ctx.close();
}
await done();
