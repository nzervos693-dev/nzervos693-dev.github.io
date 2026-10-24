/*
 * QA e2e for C2 piece 3 beyond iso-attack.mjs: the scripted first attack before the claim (2 crawlers hit the start flat front
 * door), the barricade lifecycle through the real build UI (Lv1, Lv2, repair, demolish), heart bed / merged stashes / pooled
 * stash across save and load, an older claimed save, a Stage A style save (attack 10 min after load), the offline report
 * wording and the gaps it leaves, hide mid fight, frame times with 12 attackers, no console errors.
 * Run: node tests/e2e/iso-attack-qa.mjs (after npm run build:e2e). Env: E2E_VIEW=412x915, E2E_SHOTS, E2E_URL.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { mkdirSync } from 'node:fs';

const PORT = 4189;
const [W, H] = (process.env.E2E_VIEW || '360x800').split('x').map(Number);
const shots = process.env.E2E_SHOTS || 'tests/screenshots';
mkdirSync(shots, { recursive: true });
let server = null;
let url = process.env.E2E_URL;
if (!url) { server = await serve('dist-e2e', PORT); url = server.url; }
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  const noise = /WebGL|GL Driver|GroupMarker/;
  page.on('console', (m) => { if (m.type() === 'error' && !noise.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  // Edit the stored save BEFORE the game loads (a page that is closing writes its own state over a patch made in-page).
  await ctx.addInitScript(() => {
    const mode = sessionStorage.getItem('__patch');
    if (!mode) return;
    sessionStorage.removeItem('__patch');
    const r = JSON.parse(localStorage.getItem('floor15.save'));
    const g = r.game ?? r;
    if (mode === 'older-claimed') { delete g.heart; g.stashes = g.stashes?.slice(0, 1); g.stockpile = g.stockpile?.slice(0, 40); }
    if (mode === 'no-attacks') { delete g.attacks; }
    localStorage.setItem('floor15.save', JSON.stringify(r));
  });
  const E = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);
  const waitFor = (f, ms = 8000, a = null) => page.waitForFunction(f, a, { timeout: ms }).then(() => true).catch(() => false);
  const boot = async (q = '?debug&attacks') => {
    await page.goto(`${url}${q}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 20000 });
    await sleep(700);
  };
  const press = async (n) => { const p = await E((x) => window.__floor15.debugButton(x), n); await page.touchscreen.tap(p.x, p.y); };
  const pressBar = async (n) => { const p = await E((x) => window.__floor15.debugBar(x), n); await page.touchscreen.tap(p.x, p.y); };
  const stand = async (x, y, f) => { await E(([a, b, c]) => { const g = window.__floor15; g.debugGoto(a, b); g.hero.facing = c; g.faceTarget = null; }, [x, y, f]); await sleep(350); };
  const rush = () => E(() => { const a = window.__floor15.action; if (a) a.elapsed = Math.max(a.elapsed, a.duration - 0.05); });
  const give = async (o) => { for (const [i, q] of Object.entries(o)) await E(([a, b]) => window.__floor15.debugGive(a, b), [i, q]); };
  const killAll = () => E(() => { const g = window.__floor15; for (const rt of g.zombies.list.slice()) g.zombies.kill(rt); });
  const total = () => E(() => { const g = window.__floor15; const t = {}; for (const s of [...g.state.inventory, ...g.state.stockpile]) if (s) t[s.id] = (t[s.id] || 0) + s.qty; return t; });
  console.log(`viewport ${W}x${H}`);

  // ============ A. the scripted first attack, before the claim
  await boot();
  await killAll();
  const a0 = await E(() => { const g = window.__floor15; const a = g.state.attacks; return { due: a.nextAt - g.state.times.startedAt, kind: a.kind }; });
  check(a0.due === 600000 && a0.kind === 'scripted', `a New game schedules the scripted attack 10 min out (${JSON.stringify(a0)})`);
  await E(() => {
    const g = window.__floor15; g.debugGoto(2, 2);
    g.zombies.cfg.types.crawler.speedTilesPerSecond = 1.5; // e2e only: the real crawler needs about a minute for the walk
    g.debugAttackIn(14, 'scripted');
    window.__bang = 0; window.__flick = 0; window.__stair = false; window.__groan = 0;
    const iv = setInterval(() => { window.__flick = Math.max(window.__flick, g.view.landingDip || 0); window.__stair = window.__stair || !!g.soundscape.stair?.on; }, 50);
    window.__iv = iv;
  });
  check(await waitFor(() => window.__floor15.attacks.phase === 'cue', 6000), 'the cue starts about 15 s before the attack');
  check(await waitFor(() => window.__floor15.attacks.phase === 'fight', 25000), 'the attack arrives');
  const arr = await E(() => { const g = window.__floor15; const z = g.zombies.list.filter((r) => r.rec.siege); return { n: z.length, types: z.map((r) => r.rec.type), flick: window.__flick, stair: window.__stair, total: g.state.attacks.current?.total, kind: g.state.attacks.current?.kind, str: g.state.attacks.current?.strength }; });
  check(arr.flick > 0 && arr.stair, `the cue showed the landing flicker (${arr.flick.toFixed(2)}) and started the stairwell shuffle`);
  check(arr.total === 2 && arr.kind === 'scripted' && arr.str === 15, `the scripted attack is 2 attackers at strength 15 (${JSON.stringify(arr)})`);
  await sleep(3600);
  const types = await E(() => window.__floor15.zombies.list.filter((r) => r.rec.siege).map((r) => r.rec.type));
  check(types.length === 2 && types.every((t) => t === 'crawler'), `both attackers are crawlers (${types})`);
  const doorId = await E(() => window.__floor15.world.home.frontDoor);
  check(await waitFor((id) => { const d = window.__floor15.world.doors.find((x) => x.id === id); return d.hp < d.maxHp; }, 90000, doorId), 'the crawlers hit the start flat front door');
  await page.screenshot({ path: `${shots}/qa-c2p3-scripted-${W}x${H}.png` });
  await E(() => { const g = window.__floor15; for (const rt of g.zombies.list.slice()) if (rt.rec.siege) g.zombies.kill(rt); });
  check(await waitFor(() => window.__floor15.attacks.phase === 'idle', 4000), 'killing both ends the attack');
  const after = await E(() => { const g = window.__floor15; const a = g.state.attacks; return { kind: a.kind, h: (a.nextAt - Date.now()) / 3600000 }; });
  check(after.kind === 'scheduled' && after.h > 5.9 && after.h < 10.1, `the next attack is 8 h +/- 2 h out (${after.h.toFixed(1)} h)`);
  await E(() => clearInterval(window.__iv));

  // ============ B. barricade lifecycle through the build UI (front door of the start flat)
  await boot('?debug');
  await killAll();
  await give({ hammer: 1, sledgehammer: 1, wood: 60, metal: 10, duct_tape: 6, sheet_metal: 6, parts: 4 });
  await E(() => window.__floor15.finishClaim());
  await sleep(400);
  await pressBar('build'); await sleep(300);
  await stand(6, 9, 90);
  check(await waitFor(() => window.__floor15.targeting.target?.kind === 'edge', 4000), 'the cursor is on the front door');
  const pick = async (id) => {
    await press('quick'); await sleep(250);
    const p = await E((pid) => { const g = window.__floor15; const items = g.pickerItems().map((c) => c.id); const c = g.buttons.picker.filter((o) => o.getData && o.getData('picker'))[items.indexOf(pid)];
      const rect = g.game.canvas.getBoundingClientRect(); const k = rect.width / g.scale.width; return { x: rect.left + c.x * k, y: rect.top + c.y * k }; }, id);
    await page.touchscreen.tap(p.x, p.y); await sleep(250);
  };
  await E(() => { const g = window.__floor15; const d = g.world.doors.find((x) => x.id === g.world.home.frontDoor); d.hp = d.maxHp; g.buttonsDirty = true; }); // section A left it damaged: Main would Repair first (rule 1)
  await sleep(300);
  console.log('  info: before pick', JSON.stringify(await E(() => { const g = window.__floor15; const d = g.world.doors.find((x) => x.id === g.world.home.frontDoor); const m = g.slots.main; return { door: { hp: d.hp, max: d.maxHp, st: d.state, bar: d.barricade, bb: g.state.build.barricade }, main: m && { icon: m.icon, en: m.enabled, r: m.reason }, sel: g.state.build.selectedPiece }; })));
  await pick('barricade');
  const door = () => E(() => { const g = window.__floor15; const d = g.world.doors.find((x) => x.id === g.world.home.frontDoor); return { bar: d.barricade ? { lvl: d.barricade.level, hp: d.barricade.hp } : null, hp: d.hp }; });
  const mainIcon = () => E(() => { const m = window.__floor15.slots.main; return m && { icon: m.icon, enabled: m.enabled, reason: m.reason }; });
  console.log('  info: selectedPiece', await E(() => window.__floor15.state.build.selectedPiece), 'Main with barricade selected:', JSON.stringify(await mainIcon()));
  await press('main'); await sleep(250); await rush(); await sleep(600);
  let d = await door();
  check(d.bar && (d.bar.lvl ?? 1) === 1 && d.bar.hp === 120, `Lv1 barricade on the door (${JSON.stringify(d)})`);
  console.log('  info: Main after Lv1:', JSON.stringify(await mainIcon()));
  await press('main'); await sleep(250); await rush(); await sleep(600);
  d = await door();
  check(d.bar && d.bar.lvl === 2 && d.bar.hp === 250, `Upgrade to Lv2 (${JSON.stringify(d)})`);
  await E(() => { const g = window.__floor15; const dd = g.world.doors.find((x) => x.id === g.world.home.frontDoor); dd.barricade.hp = 100; });
  await sleep(500);
  console.log('  info: Main on damaged Lv2:', JSON.stringify(await mainIcon()));
  await press('main'); await sleep(250); await rush(); await sleep(600);
  d = await door();
  check(d.bar && d.bar.hp > 100, `Repair restores HP (${JSON.stringify(d)})`);
  const sec = await E(() => { const m = window.__floor15.slots.secondary; return m && { icon: m.icon, enabled: m.enabled }; });
  check(sec && sec.enabled, `Secondary offers Demolish on the barricade (${JSON.stringify(sec)})`);
  await press('secondary'); await sleep(250); await rush(); await sleep(600);
  d = await door();
  check(d.bar === null || d.bar.lvl === 0 || d.bar.hp <= 0, `Demolish removes the barricade (${JSON.stringify(d)})`);
  const stash = await E(() => { const g = window.__floor15; return g.world.objects.filter((o) => o.stash).map((o) => ({ x: o.x, y: o.y, tiles: o.tiles })); });
  console.log('  info: stash fixtures', stash.length);

  // ============ C. heart and stash
  const hs = await E(() => {
    const g = window.__floor15;
    const hero = [Math.floor(g.hero.x), Math.floor(g.hero.y)];
    const stashes = g.world.objects.filter((o) => o.stash);
    const onHero = stashes.some((o) => o.tiles.some((t) => t.x === hero[0] && t.y === hero[1]));
    const piles = g.world.objects.filter((o) => /pile/i.test(o.objectId || '') || o.pile);
    const keys = new Set(Object.keys(g.state.piles || {}));
    const onPile = stashes.some((o) => o.tiles.some((t) => [...keys].some((k) => k === `${t.x},${t.y}` || k.startsWith(`${t.x},${t.y},`))));
    const ids = stashes.map((o) => o.id);
    return { n: stashes.length, onHero, onPile, dup: ids.length !== new Set(ids).size, unreachable: 0, slots: g.state.stockpile.length };
  });
  check(hs.n === 5 && !hs.onHero && !hs.onPile && !hs.dup && hs.slots === 120, `claim made the merged stashes (${JSON.stringify(hs)})`);
  const before = await total();
  await E(() => window.__floor15.save());
  await boot('?debug');
  const afterT = await total();
  check(JSON.stringify(before) === JSON.stringify(afterT), `item totals identical across save and load (${JSON.stringify(before)})`);
  const hs2 = await E(() => { const g = window.__floor15; return { n: g.world.objects.filter((o) => o.stash).length, slots: g.state.stockpile.length }; });
  check(hs2.n === 5 && hs2.slots === 120, `stash fixtures and slots survive a reload (${JSON.stringify(hs2)})`);
  // store and take
  await E(() => { const g = window.__floor15; g.debugGoto(2, 2); });
  const heart0 = await E(() => window.__floor15.world.home.bed);
  const other = await E(() => { const g = window.__floor15; const o = g.world.objects.find((x) => g.balance.objects[x.objectId]?.sleepable && x.id !== g.world.home.bed && x.tiles.some((t) => g.world.structures && g.state.hq.claimed)); return o && { id: o.id, x: o.tiles[0].x, y: o.tiles[0].y }; });
  if (other) {
    const moved = await E((id) => { const g = window.__floor15; const before = g.state.heart?.bedId; g.markHeart(g.world.objectById.get(id)); return { before, after: g.state.heart?.bedId }; }, other.id);
    check(moved.after === other.id, `sleeping in another HQ bed moves the heart (${JSON.stringify(moved)})`);
    const goal = await E(() => { const g = window.__floor15; return g.attacks.siege.goal ?? null; });
    await E(() => window.__floor15.save()); await boot('?debug');
    check(await E((id) => window.__floor15.state.heart?.bedId === id, other.id), 'the heart bed survives a reload');
  } else check(false, 'found another sleepable bed in the HQ');

  // ============ D. an older claimed save (no merged stashes, no heart) and a Stage A style save (no attacks)
  await E(() => { const g = window.__floor15; g.debugGoto(8, 7); g.save(); sessionStorage.setItem('__patch', 'older-claimed'); });
  await boot('?debug&attacks');
  const old = await E(() => { const g = window.__floor15; const pos = g.world.objects.filter((o) => o.stash); const h = [Math.floor(g.hero.x), Math.floor(g.hero.y)];
    return { claimed: g.state.hq.claimed, stashes: pos.length, slots: g.state.stockpile.length, onHero: pos.some((o) => o.tiles.some((t) => t.x === h[0] && t.y === h[1])), hero: h, tiles: pos.map((o) => o.tiles[0].x + ',' + o.tiles[0].y) }; });
  check(old.claimed && old.stashes === 5 && old.slots === 120 && !old.onHero, `an older claimed save gets the merged stashes on load, never under the hero (${JSON.stringify(old)})`);
  await E(() => { const g = window.__floor15; g.save(); sessionStorage.setItem('__patch', 'no-attacks'); });
  await boot('?debug&attacks');
  const noAtk = await E(() => { const a = window.__floor15.state.attacks; return { kind: a.kind, min: (a.nextAt - Date.now()) / 60000 }; });
  check(noAtk.kind === 'scripted' && noAtk.min > 9.5 && noAtk.min <= 10.01, `a save without attacks gets the scripted attack 10 min after load (${JSON.stringify(noAtk)})`);
  await boot('?debug&attacks'); // load twice: no duplicates
  const old2 = await E(() => ({ stashes: window.__floor15.world.objects.filter((o) => o.stash).length, slots: window.__floor15.state.stockpile.length }));
  check(old2.stashes === 5 && old2.slots === 120, `loading again adds no more stashes (${JSON.stringify(old2)})`);

  // ============ E. offline: a breach path, the report wording and the gaps it leaves
  await killAll();
  const off = await E(() => {
    const g = window.__floor15;
    const lines = []; const orig = g.popup.show.bind(g.popup); g.popup.show = (t, l) => { lines.push(...l); orig(t, l); };
    const now = Date.now();
    g.state.attacks.nextAt = now - 3 * 3600 * 1000; g.state.attacks.kind = 'scheduled';
    g.state.times.startedAt = now - 40 * 24 * 3600 * 1000; // a strong attack: it will break through
    g.state.times.lastTickAt = now - 4 * 3600 * 1000;
    const front = g.world.doors.find((d) => d.id === g.world.home.frontDoor);
    g.applyOffline(4 * 3600 * 1000, false);
    return { lines, front: front.state, bar: front.barricade };
  });
  console.log('  info: offline report lines:', JSON.stringify(off.lines));
  check(off.lines.some((l) => /^Around \d\d:\d\d they /.test(l)) && !off.lines.some((l) => /\d{3}|strength|defen[cs]e|HP/i.test(l.replace(/\d\d:\d\d/, ''))), 'the offline attack is in prose with no numbers');
  check(off.lines.some((l) => /walked in|came through|stairwell|north|south|east|west/i.test(l)), 'it names where they went in');
  await E(() => window.__floor15.popup.close());
  await page.screenshot({ path: `${shots}/qa-c2p3-offline-${W}x${H}.png` });

  // ============ F. 12 attackers: frame times, then hide mid fight and resume
  await boot('?debug&attacks');
  await killAll();
  await E(() => { const g = window.__floor15; g.finishClaim(); g.state.times.startedAt = Date.now() - 60 * 24 * 3600 * 1000; g.zombies.cfg.types.walker.speedTilesPerSecond = 2; g.debugGoto(24, 18); g.debugAttackIn(2); window.__ft = []; let last = performance.now(); const loop = () => { const n = performance.now(); window.__ft.push(n - last); last = n; requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  check(await waitFor(() => window.__floor15.attacks.phase === 'fight', 15000), 'a late (day 60) attack starts');
  check(await waitFor(() => window.__floor15.zombies.list.filter((r) => r.rec.siege).length >= 12, 60000), '12 attackers are on the floor');
  await E(() => { window.__ft.length = 0; }); await sleep(10000);
  const ft = await E(() => { const a = window.__ft.slice().sort((x, y) => x - y); return { n: a.length, med: a[Math.floor(a.length / 2)], p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1], on: window.__floor15.zombies.list.filter((r) => r.rec.siege).length }; });
  console.log('  info: frame times with 12 attackers (headless software GL):', JSON.stringify(ft));
  check(ft.on <= 12, `never more than 12 attackers on the floor (${ft.on})`);
  await page.screenshot({ path: `${shots}/qa-c2p3-fight12-${W}x${H}.png` });
  const hid = await E(() => { const g = window.__floor15; g.game.events.emit('floor15:hide'); return { alive: g.zombies.list.filter((r) => r.rec.siege).length, phase: g.attacks.phase, active: g.attacks.siege.active }; });
  check(hid.alive === 0 && hid.phase === 'idle' && !hid.active, `hide mid fight clears the attackers (${JSON.stringify(hid)})`);
  const back = await E(() => { const g = window.__floor15; g.applyOffline(120000, false); return { cur: g.state.attacks.current, phase: g.attacks.phase, alive: g.zombies.list.filter((r) => r.rec.siege).length, popup: g.popup.isOpen }; });
  check(back.cur === null && back.phase === 'idle' && back.alive === 0, `resume settles the fight (${JSON.stringify(back)})`);
  await E(() => window.__floor15.popup.close());
  await sleep(1500);
  check(await E(() => { const g = window.__floor15; return !g.action && !g.walk && g.attacks.phase === 'idle' && !g.gameOver; }), 'no stuck state after resume (no action, no auto-walk, idle)');

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
