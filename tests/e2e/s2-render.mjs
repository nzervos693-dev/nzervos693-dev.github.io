import { open, done, check, sleep, revealAll } from './stage2.mjs';
const SC = [-48, 500, 1000, 1200, 1700, 2250, 2400];
for (const view of ['360x800', '412x915']) {
  const P = await open(view);
  await revealAll(P);
  for (const f of [13, 14, 15, 16, 17]) {
    await P.g((fl) => { const s = window.__floor15; s.debugGoto(fl, 1560); s.following = false; s.dragPauseUntil = Date.now() + 600000; }, f);
    for (const x of (view === '360x800' ? SC : [-48, 1200, 2400])) {
      await P.g((sx) => window.__floor15.setScrollX(sx), x);
      await sleep(250);
      await P.shot(`render-f${f}-x${x}`);
    }
  }
  check(P.errors.length === 0, `no console errors in render ${view}: ${P.errors.join('|')}`);
  await P.ctx.close();
}
await done();
