import { open, done, check, sleep, cam } from './stage2.mjs';
const P = await open('360x800');
await P.g(() => { const s = window.__floor15; s.state.story = { tutorial: 'active', walked: true, doorOpened: false }; s.state.objects['f15L-2-floor0'] = { searched: true }; });
const steps = [
  ['chair', 648, () => { }],
  ['table', 1128, (s) => { s.state.objects['f15L-1-floor0'] = { dismantled: true }; }],
  ['drawer', 1032, (s) => { s.state.objects['f15L-1-floor1'] = { dismantled: true }; }],
  ['workbench', 648, (s) => { s.state.objects['f15L-2-wall0'] = { searched: true }; }],
  ['door', 888, (s) => { s.state.build.barricade.level = 1; }],
];
for (const [id, heroX, prep] of steps) {
  await P.g(([x, prepSrc]) => { const s = window.__floor15; (new Function('s', 'return (' + prepSrc + ')(s)'))(s); }, [heroX, prep.toString()]);
  // walk to the previous target so that the camera follows like in play
  const fromX = id === 'chair' ? 400 : (heroX > 700 ? heroX - 300 : heroX + 300);
  await P.g(([x]) => { const s = window.__floor15; s.debugGoto(15, x); s.following = true; s.dragPauseUntil = 0; }, [fromX]);
  await sleep(300);
  await P.g(([x]) => window.__floor15.goTo(15, x), [heroX]);
  await sleep(Math.abs(heroX - fromX) / 100 * 1000 + 2500);
  const r = await P.g(() => { const s = window.__floor15; const tv = s.tutorialView; const c = s.cameras.main; return { step: tv.stepId, arrowX: tv.arrow.x, arrowVis: tv.arrow.visible, cam: c.scrollX, hero: s.state.hero.x, text: tv.text?.text }; });
  const inView = r.arrowVis && r.arrowX >= r.cam + 20 && r.arrowX <= r.cam + 700;
  console.log(id, JSON.stringify(r), inView ? 'IN VIEW' : 'OFF SCREEN');
}
await P.shot('tutorial-door-step');
await done();
