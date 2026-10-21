import { open, done, check, sleep, cam } from './stage2.mjs';
const P = await open('360x800');
const snap = () => P.g(() => { const s = window.__floor15 || window.__scenes.Game; return { children: s.children.list.length, zombies: s.zombies.list.length, recs: Object.keys(s.state.zombies).length, tweens: s.tweens.getTweens().length, timers: s.time._active.length, listeners: s.bus.eventNames().map((n) => s.bus.listenerCount(n)).reduce((a, b) => a + b, 0), cam: [Math.round(s.cameras.main.scrollX), Math.round(s.cameras.main.scrollY)], hero: s.state.hero, active: s.sys.isActive() }; });
const base = await snap();
console.log('base', JSON.stringify(base));
for (let i = 0; i < 5; i++) {
  await P.g(() => { const s = window.__floor15; s.debugGoto(13, 3000); s.setScrollX(2400); });
  await sleep(300);
  await P.g(() => window.__floor15.newGame());
  await sleep(1500);
  await P.page.waitForFunction(() => window.__floor15?.sys.isActive(), null, { timeout: 10000 }).catch(() => {});
  const r = await snap().catch((e) => ({ err: String(e) }));
  console.log('restart', i + 1, JSON.stringify(r));
}
const last = await snap();
check(last.children === base.children && last.zombies === base.zombies && last.recs === base.recs, 'repeated New game: same display list, zombies and records as a fresh start');
check(last.listeners <= base.listeners + 2, `no listener growth (${base.listeners} -> ${last.listeners})`);
check(last.hero.floor === 15 && last.hero.x === 408 && Math.abs(last.cam[0] + 360 - 408) < 5, 'fresh start: hero at the bed and the camera centred on him (not left at the far end)');
for (let i = 0; i < 5; i++) { await P.page.reload(); await P.page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 20000 }); }
check(P.errors.length === 0, 'no console errors ' + P.errors.join('|'));
await done();
