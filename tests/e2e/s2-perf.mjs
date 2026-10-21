import { open, done, check, sleep, cam } from './stage2.mjs';
const P = await open('360x800');
await P.g(() => { const s = window.__floor15; window.__upd = []; const o = s.update.bind(s); s.update = (t, d) => { const a = performance.now(); o(t, d); window.__upd.push(performance.now() - a); }; });
for (const [name, sx] of [['left', -48], ['shaft', 1200], ['right', 2400]]) {
  await P.g((x) => { const s = window.__floor15; s.following = false; s.dragPauseUntil = Date.now() + 600000; s.setScrollX(x); window.__upd = []; }, sx);
  const r = await P.g(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 4000) res(n / 4); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  const info = await P.g(() => { const s = window.__floor15; const u = window.__upd; const cam = s.cameras.main; const list = s.children.list; return { n: list.length, rendered: list.filter((c) => c.willRender && c.willRender(cam)).length, upd: u.reduce((a, b) => a + b, 0) / Math.max(1, u.length), updMax: Math.max(...u), frames: u.length, fps: s.game.loop.actualFps }; });
  console.log(name, 'raf fps', r.toFixed(1), JSON.stringify(info));
}
// idle with no rendering work at all for comparison (pause tower view? hide canvas)
// long walk times
const t = await P.g(() => { const s = window.__floor15; return { walk: s.balance.hero.walkSpeedPxPerSecond ?? s.balance.hero.walkSpeed, run: s.balance.hero.runSpeedPxPerSecond ?? s.balance.hero.runSpeed, stairs: s.balance.hero.stairSecondsPerFloor, hero: JSON.stringify(s.balance.hero) }; });
console.log(JSON.stringify(t));
for (const [label, from, to, run] of [['f15 far left -> stairs', [15, 72], [15, 1560], false], ['f15 far left -> stairs (run)', [15, 72], [15, 1560], true], ['f13 far right -> f17 far left', [13, 3048], [17, 72], false]]) {
  await P.g(([f, x]) => { const s = window.__floor15; s.state.needs.health = 100; s.state.needs.energy = 100; for (const rt of s.zombies.list.slice()) if (!rt.dying) s.zombies.kill(rt); s.debugGoto(f, x); }, from);
  const t0 = Date.now();
  await P.g(([f, x, run]) => window.__floor15.goTo(f, x, null, run), [...to, run]);
  let ok = false;
  while (Date.now() - t0 < 90000) { const st = await P.g(([f, x]) => { const s = window.__floor15; return Math.abs(s.state.hero.x - x) < 3 && s.state.hero.floor === f && !s.stair; }, to); if (st) { ok = true; break; } await sleep(200); }
  console.log(label, ok ? ((Date.now() - t0) / 1000).toFixed(1) + ' s' : 'timeout');
}
await done();
