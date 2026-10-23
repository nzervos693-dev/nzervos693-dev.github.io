/*
 * E2E for the C2 structure layer: built / demolished edges re-bake the wall layer live and a save with edge
 * overrides (built wall, demolished door, demolished wall) loads without errors. Run: npm run test:e2e.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';

const PORT = 4186;
let server = null;
let url = process.env.E2E_URL;
if (!url) { server = await serve('dist-e2e', PORT); url = server.url; }
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number((process.env.E2E_VIEW || '360x800').split('x')[0]), height: Number((process.env.E2E_VIEW || '360x800').split('x')[1]) }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  const noise = /WebGL|GL Driver|GroupMarker/;
  page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const E = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);
  const boot = async () => {
    await page.goto(`${url}?debug`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 15000 });
    await sleep(700);
  };
  await boot();
  const base = await E(() => window.__floor15.view.walls.length);
  await E(() => {
    const st = window.__floor15.world.structures;
    st.place({ x: 14, y: 10, side: 'N' }, { piece: 'wall', tier: 'wood' }); // build on the gate
    st.place({ x: 5, y: 7, side: 'W' }, { piece: 'gap' }); // demolish a generated door
    st.place({ x: 5, y: 2, side: 'W' }, { piece: 'gap' }); // demolish a partition wall
  });
  await sleep(600);
  const live = await E(() => window.__floor15.view.walls.length);
  check(live === base - 1, `the wall layer re-bakes live (${base} -> ${live}: +1 wall, -1 door, -1 wall)`);
  const rb = await E(() => {
    const g = window.__floor15;
    const count = () => g.children.length;
    const c0 = count();
    g.view.rebuildWalls();
    const cut = g.view.walls.filter((r) => r.cut);
    const popped = cut.filter((r) => r.fullA > 0.5).length;
    for (let i = 0; i < 4; i++) g.view.rebuildWalls();
    const elev = ['14.6.N', '15.6.N'].map((k) => g.view.walls.filter((r) => `${r.w.x}.${r.w.y}.${r.w.side}` === k).length);
    return { c0, c1: count(), cuts: cut.length, popped, elev };
  });
  check(rb.elev[0] === 1 && rb.elev[1] === 1, `exactly one wall record per elevator edge (${rb.elev})`);
  check(rb.cuts > 0 && rb.popped === 0, `no cut wall is opaque right after a rebuild (${rb.cuts} cut, ${rb.popped} opaque)`);
  check(rb.c0 === rb.c1, `the display list stays stable across 5 rebuilds (${rb.c0} -> ${rb.c1})`);
  await E(() => window.__floor15.save());
  await boot();
  const re = await E(() => {
    const g = window.__floor15;
    const st = g.world.structures;
    return {
      n: g.view.walls.length, gate: st.describe(14, 10, 'N').piece, door: g.world.grid.doorAt(5, 7, 'W'), wall: st.describe(5, 2, 'W').piece,
      merged: st.roomOf(4, 2) === st.roomOf(5, 2),
    };
  });
  check(re.n === live && re.gate === 'wall' && re.door === null && re.wall === 'gap' && re.merged, 'a save with built wall, demolished door and demolished wall reloads and draws it');
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
