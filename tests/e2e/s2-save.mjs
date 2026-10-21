import { open, done, check, sleep, cam, tapWorld, until, tapFixed } from './stage2.mjs';
const seed = (raw) => `(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('floor15.save', ${JSON.stringify(raw)}); } })()`;
const mk = (raw) => new Function(`return ${seed(raw)}`);
const title = (P) => P.g(() => { const t = window.__scenes?.Title; return { has: !!t, popup: !!t?.popup?.isOpen, line: t?.popup?.c?.list.filter((o) => o.type === 'Text').map((o) => o.text)[0], cont: !!t?.buttons?.continue, save: localStorage.getItem('floor15.save') }; });
for (const view of ['360x800', '412x915']) {
  console.log('=== ' + view);
  const cases = [
    ['M1 save (v1)', JSON.stringify({ version: 1, lastSaveTime: 1, settings: { muted: false }, game: { started: true, v: 1, hero: { floor: 15, x: 200 }, objects: {}, doors: {} } }), true],
    ['M1 save without game.v', JSON.stringify({ version: 1, lastSaveTime: 1, game: { started: true, hero: { floor: 15, x: 200 } } }), true],
    ['corrupt save', '{not json', false],
    ['empty object', '{}', false],
  ];
  for (const [label, raw, popup] of cases) {
    const P = await open(view, '?debug&story', new Function(`if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded','1'); localStorage.setItem('floor15.save', ${JSON.stringify(raw)}); }`), 2, false);
    await P.page.waitForFunction(() => window.__scenes?.Title?.buttons, null, { timeout: 15000 });
    await sleep(400);
    const t = await title(P);
    check(t.popup === popup && (!popup || t.line === 'The building has changed.'), `${label}: popup ${t.popup ? '"' + t.line + '"' : 'none'} (expected ${popup ? 'popup' : 'none'})`);
    check(!t.cont, `${label}: only New game is offered`);
    if (popup) {
      await P.shot('stale-save-popup');
      // dismiss by tap and reload: the popup must not come back
      await P.g(() => window.__scenes.Title.popup.close?.());
      await P.page.reload();
      await P.page.waitForFunction(() => window.__scenes?.Title?.buttons, null, { timeout: 15000 });
      await sleep(400);
      const t2 = await title(P);
      check(!t2.popup, `${label}: popup does not return after reload`);
    }
    check(P.errors.length === 0, `${label}: no console errors ${P.errors.join('|')}`);
    await P.ctx.close();
  }
  // a v2 game survives a reload (hero position, searched container, door, camera)
  const P = await open(view, '?debug');
  const ly = await P.g(() => window.__floor15.view.lineY(15));
  await P.g(() => { const s = window.__floor15; s.debugGoto(15, 1560); });
  await sleep(300);
  await tapWorld(P, 1560 - 230, ly + 20); // walk into the flat, left of the stairs
  await sleep(2500);
  await P.g(() => { const s = window.__floor15; s.state.doors.f15R.state = 'open'; s.state.objects['f15L-2-floor0'] = { ...(s.state.objects['f15L-2-floor0'] || {}), searched: true }; s.debugGive('crowbar', 1); s.save(); });
  const before = await P.g(() => { const s = window.__floor15; return { hero: s.state.hero.x, inv: JSON.stringify(s.state.inventory), door: s.state.doors.f15R.state }; });
  await P.page.reload();
  await P.page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 20000 });
  await sleep(800);
  const after = await P.g(() => { const s = window.__floor15; return { hero: s.state.hero.x, inv: JSON.stringify(s.state.inventory), door: s.state.doors.f15R.state, searched: !!s.state.objects['f15L-2-floor0']?.searched, camc: s.cameras.main.scrollX + 360 }; });
  console.log(JSON.stringify(before), JSON.stringify(after));
  check(after.inv === before.inv && after.door === 'open' && after.searched, 'v2 game survives a reload (bag, door, searched; hero returns home on hide by design)');
  check(Math.abs(after.camc - after.hero) < 30, `camera is centred on the hero after reload (${Math.round(after.camc)} vs ${Math.round(after.hero)})`);
  await P.shot('reload-resume');
  check(P.errors.length === 0, 'no console errors ' + P.errors.join('|'));
  await P.ctx.close();
}
await done();
