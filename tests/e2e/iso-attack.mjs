/*
 * E2E for Stage C2 piece 3, HQ attacks on floor 15: the diegetic cue (landing flicker, stairwell shuffle), attackers
 * climbing onto the landing end of the down flight 3 s apart, the cheapest route probing the weakest edge (the weakened
 * half of a walled-in gate), the built wall turning into a gap with no full re-bake from the hits, the front door
 * (a generated door) breaking and the attackers coming through into the start flat, the -10 morale latch, the attack
 * ending when the last attacker dies, an offline attack resolving against the structures with a prose report, the hero's
 * 1.0 s vault over a broken window and the barricade in the build picker. Only the setup (kill the authored zombies, wall the
 * gate, schedule the attack, speed the walkers up) uses the debug hooks. Run: npm run test:e2e (or node tests/e2e/iso-attack.mjs
 * after npm run build:e2e). Env: E2E_URL.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';

const PORT = 4188;
let server = null;
let url = process.env.E2E_URL;
if (!url) { server = await serve('dist-e2e', PORT); url = server.url; }
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: Number((process.env.E2E_VIEW || '360x800').split('x')[0]), height: Number((process.env.E2E_VIEW || '360x800').split('x')[1]) }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  const noiseRe = /WebGL|GL Driver|GroupMarker/;
  page.on('console', (m) => { if (m.type() === 'error' && !noiseRe.test(m.text())) errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const E = (f, a) => page.evaluate(f, a);
  const sleep = (ms) => page.waitForTimeout(ms);
  const waitFor = (f, ms = 8000, a = null) => page.waitForFunction(f, a, { timeout: ms }).then(() => true).catch(() => false);
  await page.goto(`${url}?debug&attacks`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.state && window.__floor15.view, null, { timeout: 20000 });
  await sleep(700);

  // ---- a fresh game: the scripted first attack is 10 minutes away (11.3)
  const first = await E(() => { const g = window.__floor15; const a = g.state.attacks; return { due: a.nextAt - g.state.times.startedAt, kind: a.kind, enabled: g.attacks.enabled, phase: g.attacks.phase }; });
  check(first.due === 10 * 60 * 1000 && first.kind === 'scripted' && first.enabled && first.phase === 'idle', `a New game schedules the scripted attack 10 min out (${JSON.stringify(first)})`);

  // ---- setup: Cleared floor, the HQ claimed, the gate walled in wood (one half weakened), the hero far from the door, walkers speeded up
  const setup = await E(() => {
    const g = window.__floor15;
    for (const rt of g.zombies.list.slice()) g.zombies.kill(rt);
    g.finishClaim(); // the real claim path: HQ, merged stashes (Cleared floor)
    const st = g.world.structures;
    st.place({ x: 14, y: 10, side: 'N' }, { piece: 'wall', tier: 'wood' });
    st.place({ x: 15, y: 10, side: 'N' }, { piece: 'wall', tier: 'wood' });
    st.setHp(st.rec(14, 10, 'N'), 30); // the weak half of the gate
    const far = g.grid.nearestWalkable(24, 18, 4);
    g.debugGoto(far.x, far.y); // the far south-east flat
    g.zombies.cfg.types.walker.speedTilesPerSecond = 2;
    window.__spawns = [];
    const addAttacker = g.zombies.addAttacker.bind(g.zombies);
    g.zombies.addAttacker = (rec, siege) => { window.__spawns.push([Math.floor(rec.x), Math.floor(rec.y), performance.now()]); return addAttacker(rec, siege); };
    window.__maxHolders = 0;
    setInterval(() => { for (const n of g.attacks.siege.holders.values()) window.__maxHolders = Math.max(window.__maxHolders, n); }, 40);
    const front = g.world.doors.find((d) => d.id === g.world.home.frontDoor);
    return { gateEid: g.grid.edgeId(14, 10, 'N'), frontEid: front.edge, bake: g.view.bakeCount, morale: g.state.needs.morale };
  });
  await sleep(500);
  const pool = await E(() => { const g = window.__floor15; return { claimed: g.state.hq.claimed, slots: g.state.stockpile.length, stashes: g.world.objects.filter((o) => o.stash).length, label: g.panel.ctrl.stockLabel() }; });
  check(pool.claimed && pool.slots === 40 + 4 * 20 && pool.stashes === 5 && pool.label === 'HQ', `claiming the HQ pools the stashes: 40 + 4 x 20 slots, 5 stash fixtures, the Bag tab reads HQ (${JSON.stringify(pool)})`);

  // ---- the cue: nothing on screen, only the light and the sounds
  await E(() => window.__floor15.debugAttackIn(10));
  check(await waitFor(() => window.__floor15.attacks.phase === 'cue', 4000), 'the cue starts when the attack is within 15 s');
  let maxDip = 0;
  let stairOn = false;
  for (let i = 0; i < 36 && (await E(() => window.__floor15.attacks.phase)) === 'cue'; i++) {
    const s = await E(() => { const g = window.__floor15; return { dip: g.view.landingDip, stair: g.soundscape.stair.on }; });
    maxDip = Math.max(maxDip, s.dip);
    stairOn = stairOn || s.stair;
    await sleep(250);
  }
  check(maxDip > 0, `the landing light flickers during the cue (max dip ${maxDip.toFixed(2)})`);
  check(stairOn, 'the stairwell shuffling starts at T-8');
  check(await waitFor(() => window.__floor15.attacks.phase === 'fight', 8000), 'the first attacker arrives at T-0 and the fight starts');

  // ---- arrival: landing end of the down flight, 3 s apart; entries and the weak spot
  const arrive = await E(() => {
    const g = window.__floor15;
    const z = g.zombies.list.filter((r) => r.rec.siege);
    return { n: z.length, at: window.__spawns[0].slice(0, 2), entry: g.attacks.siege.entries[0], entries: g.attacks.siege.entries.length, mode: z[0]?.ai.mode, total: g.state.attacks.current?.total };
  });
  check(arrive.n >= 1 && arrive.at[0] === 12 && arrive.at[1] === 5 && arrive.mode === 'siege', `the first attacker climbs onto the landing end of the down flight (${JSON.stringify(arrive)})`);
  check(arrive.total === 3 && arrive.entries === 1, 'a day-0 wave is 3 walkers probing one weak spot');
  check(arrive.entry === setup.gateEid, 'the cheapest route probes the weakened half of the gate first');
  await sleep(3400);
  const gaps = await E(() => window.__spawns.map((s, i, a) => (i ? (s[2] - a[i - 1][2]) / 1000 : 0)).slice(1));
  check(gaps.length >= 1 && gaps.every((g) => g > 2.8 && g < 3.5), `the next attacker follows 3 s later (${gaps.map((g) => g.toFixed(1))})`);

  // ---- they break the weak half of the gate: HP falls, the wall becomes a gap, no re-bake from the hits
  const midBake = await E(() => window.__floor15.view.bakeCount);
  check(await waitFor(() => { const g = window.__floor15; return g.world.structures.hpOf(g.world.structures.rec(14, 10, 'N') ?? { hp: 0 }) < 30; }, 60000), 'an attacker hits the gate wall (its HP falls)');
  const bakesDuringHits = await E(() => window.__floor15.view.bakeCount);
  check(bakesDuringHits === midBake, 'HP hits redraw one edge, they never re-bake the wall layer');
  check(await waitFor(() => window.__floor15.world.structures.describe(14, 10, 'N').piece === 'gap', 60000), 'the built wall at 0 HP becomes a gap');
  check(await E((b) => window.__floor15.view.bakeCount === b + 1, midBake), 'and that one structural change re-bakes the layer once');

  // ---- they flood on to the front door and break it; then they are inside
  const bakeBeforeDoor = await E(() => window.__floor15.view.bakeCount);
  check(await waitFor((id) => { const g = window.__floor15; const d = g.world.doors.find((x) => x.id === id); return d.hp < d.maxHp; }, 90000, 'f15NW-6.9.S'), 'the attackers go on to the start flat front door and hit it');
  check(await waitFor((id) => window.__floor15.world.doors.find((x) => x.id === id).state === 'broken', 120000, 'f15NW-6.9.S'), 'the front door breaks open');
  check(await E((b) => window.__floor15.view.bakeCount === b, bakeBeforeDoor), 'a door breaking is a per-edge redraw, not a re-bake');
  check(await waitFor(() => window.__floor15.zombies.list.some((r) => r.rec.siege && r.rec.x < 12 && r.rec.y < 10), 60000), 'attackers come through into the start flat');
  const breach = await E(() => { const g = window.__floor15; return { latched: g.state.build.breachLatched, morale: g.state.needs.morale, broke: g.attacks.broke, current: g.state.attacks.current?.broke }; });
  check(breach.latched && breach.broke && breach.current && Math.abs(breach.morale - (setup.morale + (await E(() => window.__floor15.balance.needs.morale.events.barricadeBreached)))) < 2, `the breach costs morale once (${JSON.stringify(breach)})`);

  const holders = await E(() => window.__maxHolders);
  check(holders >= 1 && holders <= 3, `never more than 3 attackers on one edge (${holders})`);

  // ---- the fight is over when the last attacker is dead; nothing says so
  await E(() => { const g = window.__floor15; for (const rt of g.zombies.list.slice()) if (rt.rec.siege) g.zombies.kill(rt); });
  check(await waitFor(() => window.__floor15.attacks.phase === 'idle', 4000), 'the attack ends when the last attacker is dead');
  const end = await E(() => { const g = window.__floor15; const a = g.state.attacks; return { next: a.nextAt > Date.now() + 5 * 3600 * 1000, kind: a.kind, done: a.scriptedDone, current: a.current, dip: g.view.landingDip, siege: g.attacks.siege.active }; });
  check(end.next && end.kind === 'scheduled' && end.current === null && end.dip === 0 && !end.siege, `the next attack is scheduled 8 h +/- 2 h out and the landing light is steady again (${JSON.stringify(end)})`);

  // ---- the app is hidden mid-fight and comes back: the attackers leave, the rest of the attack is settled offline
  await E(() => window.__floor15.debugAttackIn(1));
  check(await waitFor(() => window.__floor15.zombies.list.some((r) => r.rec.siege), 20000), 'a second attack arrives');
  const hid = await E(() => {
    const g = window.__floor15;
    g.game.events.emit('floor15:hide');
    return { phase: g.attacks.phase, alive: g.zombies.list.filter((r) => r.rec.siege).length, records: Object.values(g.state.zombies).filter((z) => z.siege).length, total: g.state.attacks.current?.total, active: g.attacks.siege.active };
  });
  check(hid.phase === 'idle' && hid.alive === 0 && hid.records === 0 && hid.total === 3 && !hid.active, `hiding mid-fight removes the attackers and keeps the attack to settle (${JSON.stringify(hid)})`);
  const back = await E(() => {
    const g = window.__floor15;
    g.applyOffline(60000, false); // what the resume handler does
    const a = g.state.attacks;
    return { current: a.current, next: a.nextAt > Date.now(), phase: g.attacks.phase, alive: g.zombies.list.filter((r) => r.rec.siege).length };
  });
  check(back.current === null && back.next && back.phase === 'idle' && back.alive === 0, `resuming settles the fight cleanly (${JSON.stringify(back)})`);
  await E(() => window.__floor15.popup.close());

  // ---- offline: an attack came due while the app was closed; it resolves against the structures and the report says what broke
  const off = await E(() => {
    const g = window.__floor15;
    const lines = [];
    const orig = g.popup.show.bind(g.popup);
    g.popup.show = (title, l) => { lines.push(...l); orig(title, l); };
    const now = Date.now();
    g.state.attacks.nextAt = now - 4 * 3600 * 1000;
    g.state.attacks.kind = 'scheduled';
    g.state.times.lastTickAt = now - 5 * 3600 * 1000;
    g.applyOffline(5 * 3600 * 1000, false);
    return { lines, next: g.state.attacks.nextAt > now, open: g.popup.isOpen };
  });
  check(off.open && off.lines.some((l) => /^Around \d\d:\d\d they /.test(l)), `the offline attack is told in prose (${JSON.stringify(off.lines)})`);
  check(off.next && !off.lines.some((l) => /\d{3}/.test(l)), 'the next attack is rescheduled and no numbers appear in the report');
  await E(() => window.__floor15.popup.close());

  // ---- the hero vaults over a broken window in 1.0 s
  const vault = await E(async () => {
    const g = window.__floor15;
    const st = g.world.structures;
    st.place({ x: 20, y: 11, side: 'W' }, { piece: 'window', tier: 'glass' }); // a pane in the corridor
    st.damage({ x: 20, y: 11, side: 'W' }, 1000);
    g.debugGoto(20, 11);
    g.hero.facing = 180;
    const cls = g.grid.moveClass(g.grid.edgeId(20, 11, 'W'));
    g.beginVault(-1, 0);
    const t0 = performance.now();
    const mid = await new Promise((r) => setTimeout(() => r({ x: g.hero.x }), 500));
    while (g.vault) await new Promise((r) => setTimeout(r, 16));
    return { cls, secs: (performance.now() - t0) / 1000, mid: mid.x, end: g.hero.x };
  });
  check(vault.cls === 5 && vault.secs > 0.9 && vault.secs < 1.4 && vault.mid < 20.4 && vault.mid > 19.6 && Math.abs(vault.end - 19.5) < 0.01, `the hero vaults a broken window in about 1.0 s (${JSON.stringify(vault)})`);

  // ---- the barricade is in the picker now
  const picker = await E(() => {
    const g = window.__floor15;
    const far = g.grid.nearestWalkable(24, 18, 4);
    g.debugGoto(far.x, far.y);
    g.toggleBuildMode(true);
    g.buttons.openPicker();
    return g.pickerItems().map((c) => c.id);
  });
  check(picker.includes('barricade') && picker.length === 6, `build mode's piece picker lists the barricade (${picker})`);

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
} catch (e) {
  fail.push(String(e));
  console.error(e);
} finally {
  server?.close();
}
process.exit(fail.length ? 1 : 0);
