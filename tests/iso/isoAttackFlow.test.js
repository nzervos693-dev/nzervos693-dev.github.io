import { describe, it, expect } from 'vitest';
import floorsIso from '../../public/data/levels/floors_iso.json';
import { hqWorld, stock, giveTool, have, balance } from './hqHelpers.js';
import { loadIsoFloor } from '../../src/iso/loader.js';
import { createIsoState, normalizeIsoState, snapshotDoors, applyDoorsToGrid } from '../../src/gameplay/isoState.js';
import { attackSpec, makeAttackHook, attackState, settleInterrupted, finishAttack } from '../../src/gameplay/attacks.js';
import { daysSurvived } from '../../src/gameplay/death.js';
import { reportLines, attackLines } from '../../src/gameplay/report.js';
import {
  planOfflineRoute, resolveOfflineHq, makeIsoResolver, arrivalTile, edgeLabel, heroAtHome,
} from '../../src/gameplay/isoOffline.js';
import { canSleepIn, heartBed, setHeart, heartStandTile, attackGoal } from '../../src/gameplay/isoHeart.js';
import {
  createMergedStashes, ensureMergedStashes, placeStashTile, normalizeStashes, applyStashesToFloor, loseHeartStack, stashSections, START_STASH,
} from '../../src/gameplay/isoStash.js';
import { nextArrivalTile, isInsideHome, HeartLoot } from '../../src/gameplay/isoAttacks.js';
import { mainAction, secondaryAction, canAddOverlay, addOverlay, canRepair, repair, demolish, build, canBuild, BUILD_CODE } from '../../src/gameplay/isoBuild.js';
import { buildPieces, selectedPiece, selectPiece, sealsIn, resultToast, pieceCells } from '../../src/gameplay/isoBuildMode.js';
import { haveCount } from '../../src/gameplay/crafting.js';
import { claimFloor } from '../../src/gameplay/isoHq.js';
import { countItem } from '../../src/gameplay/inventory.js';

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
const T0 = 1_000_000;
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const front = (w) => w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
const edgeOf = (d) => ({ x: d.x, y: d.y, side: d.side });
const gate = [{ x: 14, y: 10, side: 'N' }, { x: 15, y: 10, side: 'N' }];

describe('the attack clock (GDD 5.8, 11.3)', () => {
  it('a New game schedules the scripted first attack 10 minutes later: 15 strength, 2 crawlers', () => {
    const w = hqWorld({ claimed: false });
    const s = createIsoState(balance, w.floor, T0);
    expect(attackState(s)).toMatchObject({ scriptedDone: false, kind: 'scripted', nextAt: T0 + 10 * 60 * 1000, current: null });
    expect(attackSpec(s, balance, 'scripted', T0)).toMatchObject({ strength: 15, types: ['crawler', 'crawler'] });
  });
  it('wave size grows with the days survived: ceil((25 + 3 x days) / 10) walkers, capped at 150 strength', () => {
    const w = hqWorld({ claimed: false });
    const s = createIsoState(balance, w.floor, T0);
    const at = (d) => attackSpec(s, balance, 'scheduled', T0 + d * DAY + 1);
    expect(daysSurvived(s, T0 + 3 * DAY + 1)).toBe(3);
    expect([0, 3, 10, 50].map((d) => at(d).types.length)).toEqual([3, 4, 6, 15]);
    expect(at(50).strength).toBe(150);
    expect(at(3).types.every((t) => t === 'walker')).toBe(true);
  });
  it('a Stage A save (placeholder: no attacks) starts the scripted attack from now; a real record is kept; attackers are never restored', () => {
    const w = hqWorld({ claimed: false });
    const s = createIsoState(balance, w.floor, T0);
    s.attacks = { scriptedDone: true, nextAt: null, kind: 'scripted', current: null };
    const n = normalizeIsoState(JSON.parse(JSON.stringify(s)), balance, w.floor, T0 + 5);
    expect(n.attacks).toMatchObject({ scriptedDone: false, nextAt: T0 + 5 + 10 * 60 * 1000 });
    const real = createIsoState(balance, w.floor, T0);
    real.attacks = { scriptedDone: true, nextAt: T0 + 8 * HOUR, kind: 'scheduled', current: { kind: 'scheduled', strength: 34, total: 4, killed: 1, broke: true } };
    real.zombies['attack:1:0'] = { id: 'attack:1:0', type: 'walker', x: 13.5, y: 5.5, hp: 45, dead: false, siege: true };
    const m = normalizeIsoState(JSON.parse(JSON.stringify(real)), balance, w.floor, T0 + 9);
    expect(m.attacks).toMatchObject({ scriptedDone: true, nextAt: T0 + 8 * HOUR, kind: 'scheduled', current: { total: 4, killed: 1, broke: true } });
    expect(m.zombies['attack:1:0']).toBeUndefined();
  });
  it('attackers arrive on the landing end of the down flight, or the nearest free stairwell tile', () => {
    const w = hqWorld();
    expect(arrivalTile(w.floor)).toEqual({ x: 12, y: 5 });
    const taken = new Set();
    const occ = (x, y) => taken.has(`${x},${y}`);
    const first = nextArrivalTile(w.floor, occ);
    expect(first).toEqual({ x: 12, y: 5 });
    taken.add('12,5');
    expect(nextArrivalTile(w.floor, occ)).toEqual({ x: 13, y: 5 });
    taken.add('13,5');
    const third = nextArrivalTile(w.floor, occ);
    expect(w.floor.rooms[w.floor.roomAt(third.x, third.y)].type).toBe('stairwell');
    expect(taken.has(`${third.x},${third.y}`)).toBe(false);
  });
});

describe('the heart (GDD 5.19)', () => {
  it('is the start flat bed until another bed in the claimed HQ is slept in', () => {
    const w = hqWorld();
    const home = w.floor.objectById.get('f15NW-3.0');
    const other = w.floor.objectById.get('f15SE-3.8');
    expect(heartBed(w.floor, w.state, balance)).toBe(home);
    expect(canSleepIn(w.floor, w.state, balance, other)).toBe(true); // any bed in the HQ
    expect(setHeart(w.floor, w.state, balance, other)).toBe(true);
    expect(w.state.heart).toEqual({ bedId: 'f15SE-3.8' });
    expect(heartBed(w.floor, w.state, balance)).toBe(other);
    expect(setHeart(w.floor, w.state, balance, other)).toBe(false);
    const t = heartStandTile(w.floor, w.state, balance);
    expect(w.grid.isWalkable(t.x, t.y)).toBe(true);
    expect(Math.abs(t.x - 21) + Math.abs(t.y - 20)).toBeLessThanOrEqual(3);
  });
  it('before the claim only the start flat bed can be slept in; a dismantled heart falls back to the start flat, then to the hero', () => {
    const w = hqWorld({ claimed: false });
    const other = w.floor.objectById.get('f15SE-3.8');
    expect(canSleepIn(w.floor, w.state, balance, other)).toBe(false);
    expect(setHeart(w.floor, w.state, balance, other)).toBe(false);
    const c = hqWorld();
    setHeart(c.floor, c.state, balance, c.floor.objectById.get('f15SE-3.8'));
    c.state.objects['f15SE-3.8'] = { dismantled: true };
    expect(heartBed(c.floor, c.state, balance).id).toBe('f15NW-3.0');
    c.state.objects['f15NW-3.0'] = { dismantled: true };
    expect(heartBed(c.floor, c.state, balance)).toBeNull();
    expect(attackGoal(c.floor, c.state, balance)).toEqual({ x: Math.floor(c.state.hero.x), y: Math.floor(c.state.hero.y) });
  });
  it('the seal-in warning measures from the heart: walling off the gate seals the heart in even with the hero on the landing', () => {
    const w = hqWorld();
    giveTool(w.state, 'hammer');
    stock(w.state, { wood: 12, metal: 2 });
    const bctx = { ...w.ctx };
    expect(build(w.ctx, gate[0]).ok).toBe(true);
    const act = mainAction(bctx, gate[1], 'wall');
    const hero = { x: 14.5, y: 8.5 }; // standing on the landing
    expect(act.action).toBe('build');
    expect(act.result.ok).toBe(true);
    expect(sealsIn(bctx, act, hero)).toBe(true); // the heart can no longer reach the landing
    // with no heart measured (a ctx without state / balance) the old hero-based check says no: he is on the landing already
    expect(sealsIn({ structures: w.structures }, act, hero)).toBe(false);
  });
});

describe('barricades on any HQ door (GDD 5.20)', () => {
  it('is in the piece picker now, with Lv1 from recipes.barricade_lv1 and the level time', () => {
    expect(buildPieces(balance)).toContain('barricade');
    expect(pieceCells({ build: {} }, balance).map((c) => c.id)).toContain('barricade');
    const w = hqWorld();
    giveTool(w.state, 'hammer');
    const door = w.floor.doors.find((d) => d.kind === 'interior' && !d.built && w.structures.describe(d.x, d.y, d.side).kind !== 'perimeter');
    const e = edgeOf(door);
    expect(canAddOverlay(w.ctx, e, 'barricade')).toMatchObject({ ok: false, code: BUILD_CODE.NO_MATERIALS });
    stock(w.state, { wood: 5, metal: 2 });
    const c = canAddOverlay(w.ctx, e, 'barricade');
    expect(c).toMatchObject({ ok: true, level: 1, seconds: balance.structures.overlays.barricade.buildSeconds[0], cost: [{ id: 'wood', qty: 5 }, { id: 'metal', qty: 2 }] });
    const r = addOverlay(w.ctx, e, 'barricade');
    expect(r.ok).toBe(true);
    expect(door.barricade).toMatchObject({ own: true, hp: 120, level: 1 });
    expect(have(w.state, 'wood')).toBe(0);
    expect(w.structures.describe(e.x, e.y, e.side).overlay).toMatchObject({ kind: 'barricade', level: 1, hp: 120, maxHp: 120 });
    expect(resultToast(r, balance)).toBe('Barricaded.');
  });
  it('Lv1 -> Lv2 is an Upgrade (Lv2 cost, 250 HP, 8 s); a third level is refused; plating and barricade exclude each other', () => {
    const w = hqWorld();
    giveTool(w.state, 'hammer');
    stock(w.state, { wood: 15, metal: 7, duct_tape: 2 });
    const d = front(w);
    const e = edgeOf(d);
    expect(addOverlay(w.ctx, e, 'barricade').ok).toBe(true);
    const m = mainAction(w.ctx, e, 'barricade');
    expect(m.action).toBe('upgrade');
    expect(m.result).toMatchObject({ ok: true, level: 2, seconds: 8 });
    expect(m.perform().ok).toBe(true);
    expect(d.barricade).toMatchObject({ hp: 250, level: 2 });
    expect(w.state.build.barricade).toEqual({ level: 2, hp: 250 }); // the workbench front-door record follows
    expect(canAddOverlay(w.ctx, e, 'barricade')).toMatchObject({ ok: false, code: BUILD_CODE.MAX_TIER });
    const plated = hqWorld();
    giveTool(plated.state, 'hammer');
    stock(plated.state, { sheet_metal: 2, parts: 1, wood: 5, metal: 2 });
    expect(addOverlay(plated.ctx, edgeOf(front(plated)), 'plating').ok).toBe(true);
    expect(canAddOverlay(plated.ctx, edgeOf(front(plated)), 'barricade').code).toBe(BUILD_CODE.ALREADY_COVERED);
  });
  it('goes on doors only, never on a wall or a gap; repair restores 20 HP per wood; demolish takes it off first', () => {
    const w = hqWorld();
    giveTool(w.state, 'hammer'); giveTool(w.state, 'sledgehammer');
    stock(w.state, { wood: 12, metal: 3 });
    expect(canAddOverlay(w.ctx, { x: 5, y: 2, side: 'W' }, 'barricade').code).toBe(BUILD_CODE.WRONG_TARGET); // a partition wall
    expect(mainAction(w.ctx, gate[0], 'barricade').result.code).toBe(BUILD_CODE.NOTHING_TO_COVER);
    const d = front(w);
    const e = edgeOf(d);
    addOverlay(w.ctx, e, 'barricade');
    w.structures.damageEid(d.edge, 70);
    expect(d.barricade.hp).toBe(50);
    const m = mainAction(w.ctx, e, 'barricade');
    expect(m.action).toBe('repair'); // rule 1: damaged cover first
    expect(canRepair(w.ctx, e)).toMatchObject({ ok: true, target: 'overlay', cost: [{ id: 'wood', qty: 1 }], seconds: 2 });
    expect(repair(w.ctx, e).ok).toBe(true);
    expect(d.barricade.hp).toBe(70);
    expect(w.state.build.barricade.hp).toBe(70);
    const del = secondaryAction(w.ctx, e);
    expect(del.result).toMatchObject({ ok: true, target: 'overlay', overlayKind: 'barricade' });
    expect(del.perform().ok).toBe(true);
    expect(d.barricade).toBeNull();
    expect(w.state.build.barricade).toEqual({ level: 0, hp: 0 });
  });
  it('a barricade on a built door survives a save round trip with its level', () => {
    const w = hqWorld();
    giveTool(w.state, 'hammer');
    stock(w.state, { wood: 20, metal: 10, duct_tape: 2, parts: 2, sheet_metal: 0 });
    w.structures.place(gate[0], { piece: 'wall', tier: 'wood' });
    w.structures.place(gate[0], { piece: 'door', tier: 'wood' });
    expect(addOverlay(w.ctx, gate[0], 'barricade').ok).toBe(true);
    expect(addOverlay(w.ctx, gate[0], 'barricade').ok).toBe(true); // Lv2
    snapshotDoors(w.state, w.floor);
    const saved = JSON.parse(JSON.stringify(w.state.doors['b14.10.N']));
    expect(saved.barricade).toMatchObject({ own: true, hp: 250, level: 2 });
    const again = hqWorld();
    again.state.doors['b14.10.N'] = saved;
    again.structures.place(gate[0], { piece: 'wall', tier: 'wood' });
    again.structures.place(gate[0], { piece: 'door', tier: 'wood' });
    applyDoorsToGrid(again.state, again.floor);
    expect(again.floor.doors.find((d) => d.id === 'b14.10.N').barricade).toMatchObject({ hp: 250, level: 2 });
  });
});

describe('one HQ stash pool (GDD 5.19)', () => {
  it('claiming gives every merged unit without a stash a 20-slot stash on a free tile that keeps the unit reachable', () => {
    const w = hqWorld();
    expect(w.state.stockpile).toHaveLength(40);
    const made = createMergedStashes(w.state, w.floor, balance);
    expect(made.map((m) => m.entry.unit).sort()).toEqual(['f15NE', 'f15S', 'f15SE', 'f15SW']);
    expect(w.state.stockpile).toHaveLength(40 + 4 * 20);
    expect(w.state.stashes.map((e) => e.offset)).toEqual([0, 40, 60, 80, 100]);
    for (const { entry } of made) {
      const u = w.floor.units.find((x) => x.id === entry.unit);
      const [x, y] = entry.tile;
      expect(x >= u.rect[0] && y >= u.rect[1] && x < u.rect[0] + u.rect[2] && y < u.rect[1] + u.rect[3]).toBe(true);
      expect(w.grid.isWalkable(x, y)).toBe(false); // now a fixture
      expect(w.floor.objectById.get(entry.id).stash).toBe(true);
    }
    expect(createMergedStashes(w.state, w.floor, balance)).toHaveLength(0); // once
  });
  it('the placement keeps every doorway free and every other tile reachable', () => {
    const w = hqWorld();
    for (const u of w.floor.units.filter((x) => x.id !== 'f15NW')) {
      const t = placeStashTile(w.floor, u);
      expect(t).not.toBeNull();
      for (const d of w.floor.doors) for (const dt of w.grid.doorTiles(d)) expect(dt.x === t.x && dt.y === t.y).toBe(false);
    }
  });
  it('is one pool: crafting counts it, building takes from it, Store / Take see all of it', () => {
    const w = hqWorld();
    createMergedStashes(w.state, w.floor, balance);
    const far = w.state.stashes[2]; // a merged unit's stash
    w.state.stockpile[far.offset + 3] = { id: 'wood', qty: 6 };
    w.state.stockpile[1] = { id: 'metal', qty: 1 };
    expect(haveCount(w.state, 'wood')).toBe(6);
    giveTool(w.state, 'hammer');
    expect(canBuild(w.ctx, gate[0]).ok).toBe(true);
    expect(build(w.ctx, gate[0]).ok).toBe(true);
    expect(countItem(w.state.stockpile, 'wood')).toBe(0);
    expect(stashSections(w.state)).toHaveLength(5);
  });
  it('a claimed save from before merged stashes existed gets them on load, once', () => {
    const w = hqWorld();
    const saved = JSON.parse(JSON.stringify(w.state));
    delete saved.stashes;
    const floor = loadIsoFloor(floorsIso, 15, balance);
    const s = normalizeIsoState(saved, balance, floor, 0);
    expect(s.hq.claimed).toBe(true);
    expect(s.stashes).toHaveLength(1);
    applyStashesToFloor(s, floor);
    expect(ensureMergedStashes(s, floor, balance)).toHaveLength(4);
    expect(s.stockpile).toHaveLength(120);
    expect(floor.objects.filter((o) => o.stash)).toHaveLength(5);
    expect(ensureMergedStashes(s, floor, balance)).toHaveLength(0);
    const unclaimed = normalizeIsoState(JSON.parse(JSON.stringify(createIsoState(balance, loadIsoFloor(floorsIso, 15, balance), 0))), balance, floor, 0);
    expect(ensureMergedStashes(unclaimed, loadIsoFloor(floorsIso, 15, balance), balance)).toHaveLength(0);
  });
  it('a stash is never put under the hero or on a pile', () => {
    const base = hqWorld();
    const free = createMergedStashes(base.state, base.floor, balance).map((m) => m.entry.tile.join(','));
    const w = hqWorld();
    const t = free[0].split(',').map(Number);
    w.state.hero.x = t[0] + 0.5; w.state.hero.y = t[1] + 0.5; // standing on the first choice
    const p = free[1].split(',').map(Number);
    w.state.piles.push({ id: 'p1', floor: 15, x: p[0] + 0.5, y: p[1] + 0.5, items: [{ id: 'wood', qty: 1 }] });
    const made = createMergedStashes(w.state, w.floor, balance).map((m) => m.entry.tile.join(','));
    expect(made).toHaveLength(4);
    expect(made).not.toContain(free[0]);
    expect(made).not.toContain(free[1]);
  });
  it('survives a reload: sections and objects come back', () => {
    const w = hqWorld();
    createMergedStashes(w.state, w.floor, balance);
    w.state.stockpile[75] = { id: 'wood', qty: 2 };
    const saved = JSON.parse(JSON.stringify(w.state));
    const floor = loadIsoFloor(floorsIso, 15, balance);
    const s = normalizeIsoState(saved, balance, floor, 0);
    applyStashesToFloor(s, floor);
    expect(s.stockpile).toHaveLength(120);
    expect(s.stockpile[75]).toEqual({ id: 'wood', qty: 2 });
    expect(floor.objects.filter((o) => o.stash)).toHaveLength(5);
    expect(floor.grid.isWalkable(...s.stashes[1].tile)).toBe(false);
    expect(s.stashes[0].id).toBe(START_STASH);
  });
  it('the heart room loses stacks from the stash nearest the heart', () => {
    const w = hqWorld();
    createMergedStashes(w.state, w.floor, balance);
    const near = w.state.stashes[0];
    const farE = w.state.stashes[w.state.stashes.length - 1];
    w.state.stockpile[near.offset + 2] = { id: 'wood', qty: 4 };
    w.state.stockpile[farE.offset] = { id: 'metal', qty: 2 };
    const heart = heartStandTile(w.floor, w.state, balance);
    expect(loseHeartStack(w.state, heart, seeded(3))).toEqual({ id: 'wood', qty: 4 });
    expect(loseHeartStack(w.state, heart, seeded(3))).toEqual({ id: 'metal', qty: 2 }); // the near stash is empty now
    expect(loseHeartStack(w.state, heart, seeded(3))).toBeNull();
  });
  it('HeartLoot: one stack per attacker per 10 s, at most 5 per attack', () => {
    const l = new HeartLoot(balance.hq.attacks);
    expect(l.step(9.9, 1)).toBe(0);
    expect(l.step(0.2, 1)).toBe(1);
    expect(l.step(10, 3)).toBe(3);
    expect(l.step(100, 4)).toBe(1); // capped at heartMaxStacksLost = 5
    expect(l.step(100, 4)).toBe(0);
    l.reset();
    expect(l.step(10, 1)).toBe(1);
  });
});

describe('offline resolve on floor 15 (GDD 5.20)', () => {
  /** The GDD fairness setup: the gate walled in wood, the start flat door with Lv1 barricade. */
  const fair = () => {
    const w = hqWorld();
    giveTool(w.state, 'hammer');
    stock(w.state, { wood: 40, metal: 8, duct_tape: 2 });
    for (const g of gate) expect(build(w.ctx, g).ok).toBe(true);
    expect(addOverlay(w.ctx, edgeOf(front(w)), 'barricade').ok).toBe(true);
    return w;
  };
  const resolve = (w, strength, rng = seeded(5)) => resolveOfflineHq({ floor: w.floor }, w.state, balance, { kind: 'scheduled', strength, types: [] }, rng);

  it('fairness check, day 3: gate wall 10 + door 8 + Lv1 barricade 10 + character 10 + secured 5 = 43 (+ the bedroom partition 4 on the way) >= 34 repelled', () => {
    const w = fair();
    const route = planOfflineRoute(w.floor, w.structures, w.state, balance);
    expect(route.crossings.map((c) => c.label).slice(0, 2)).toEqual(['the stairwell side', 'the south-east door']);
    expect(route.crossings).toHaveLength(3); // the 80 HP partition into the bedroom is crossed too: every structure on the path counts
    expect(route.defense).toBe(28 + 4);
    const spec = attackSpec(w.state, balance, 'scheduled', w.state.times.startedAt + 3 * DAY + 1);
    expect(spec.strength).toBe(34);
    const r = resolve(w, spec.strength);
    expect(r).toMatchObject({ defense: 47, repelled: true, where: 'the stairwell side', broke: [] });
  });
  it('repelled: the path structures lose A x 0.5 HP in total, outermost first, none below 1 HP', () => {
    const w = fair();
    const gateRec = w.structures.rec(14, 10, 'N') ?? w.structures.rec(15, 10, 'N');
    const before = { gate: w.structures.hpOf(gateRec), door: front(w).hp, bar: front(w).barricade.hp };
    resolve(w, 34);
    expect(before.gate - w.structures.hpOf(gateRec)).toBeCloseTo(17, 5); // all of it from the outermost
    expect(front(w).hp).toBe(before.door);
    // a nearly dead piece is never broken by a repel
    const v = fair();
    const rec = v.structures.rec(14, 10, 'N') ?? v.structures.rec(15, 10, 'N');
    v.structures.setHp(rec, 5);
    v.state.survivors = { mara: { recruited: true, dead: false, job: 'guard', health: 80 }, ivo: { recruited: true, dead: false, job: 'guard', health: 80 }, kes: { recruited: true, dead: false, job: 'guard', health: 80 } };
    const r = resolve(v, 40);
    expect(r.repelled).toBe(true);
    expect(v.structures.hpOf(rec)).toBe(1);
    expect(front(v).barricade.hp).toBeLessThan(120); // the rest wore the next structure
    expect(v.structures.rec(rec.x, rec.y, rec.side)).toBe(rec);
  });
  it('breached: every structure on the path becomes a gap or breaks open, residents are hurt, stacks lost, morale -10 once', () => {
    const w = fair();
    for (let i = 0; i < 6; i++) w.state.stockpile[i] = { id: 'wood', qty: 1 + i };
    const morale = w.state.needs.morale;
    const r = resolve(w, 90);
    expect(r.repelled).toBe(false);
    expect(r.shortfall).toBe(90 - 47);
    expect(r.broke.slice(0, 2)).toEqual(['the stairwell side', 'the south-east door']);
    const gone = gate.filter((g) => w.structures.describe(g.x, g.y, g.side).piece === 'gap');
    expect(gone.length).toBe(1); // the one gate edge on the path became a gap
    expect(front(w).state).toBe('broken');
    expect(front(w).barricade.hp).toBe(0);
    expect(w.state.build.barricade.hp).toBe(0);
    expect(r.hurt[0].id).toBe('active');
    expect(r.lost).toHaveLength(Math.floor(r.shortfall / 10));
    expect(w.state.needs.morale).toBe(morale + balance.needs.morale.events.barricadeBreached);
    expect(w.state.needs.health).toBeGreaterThanOrEqual(balance.needs.offlineHealthFloor);
    // the next route is free: nothing is left to cross
    expect(planOfflineRoute(w.floor, w.structures, w.state, balance).crossings).toHaveLength(0);
  });
  it('before the claim the same rule runs against the start flat: its front door is the path', () => {
    const w = hqWorld({ claimed: false });
    const route = planOfflineRoute(w.floor, w.structures, w.state, balance);
    expect(route.crossings.map((c) => c.label)[0]).toBe('the south-east door');
    const r = resolveOfflineHq({ floor: w.floor }, w.state, balance, { kind: 'scripted', strength: 15 }, seeded(1));
    expect(r.defense).toBe(8 + 4 + 10); // door 8 + the bedroom partition 4 + character 10; the floor is not Secured yet
    expect(r.repelled).toBe(true);
  });
  it('the character only counts when he is home', () => {
    const w = hqWorld();
    expect(heroAtHome(w.floor, w.state)).toBe(true);
    w.state.hero.x = 14.5; w.state.hero.y = 8.5; // the landing
    expect(heroAtHome(w.floor, w.state)).toBe(false);
    const r = resolve(w, 15);
    expect(r.defense).toBe(8 + 4 + 5); // no character bonus
  });
  it('plugs into the existing hook: at most 2 per catch-up, an interrupted fight settles first, results carry the prose fields', () => {
    const w = hqWorld();
    const s = w.state;
    s.attacks = { scriptedDone: false, nextAt: T0 + 1000, kind: 'scripted', current: null };
    s.times.startedAt = T0;
    const report = {};
    const hook = makeAttackHook(s, balance, seeded(2), T0, makeIsoResolver(w.floor));
    hook(null, 600, T0 + 3 * 3600 * 1000, report);
    expect(report.attacks.length).toBe(1); // the scripted one; the next scheduled is 8 h +/- 2 h later
    expect(report.attacks[0]).toMatchObject({ kind: 'scripted', repelled: true });
    expect(report.attacks[0].where).toBe('the south-east door');
    const t = T0 + 40 * HOUR;
    hook(null, 600, t, report);
    expect(report.attacks.length).toBeLessThanOrEqual(3);
    // an interrupted fight
    const v = hqWorld();
    v.state.attacks = { scriptedDone: true, nextAt: null, kind: 'scheduled', current: { kind: 'scheduled', strength: 34, total: 4, killed: 3 } };
    const res = settleInterrupted(v.state, balance, T0, seeded(4), makeIsoResolver(v.floor));
    expect(res).toMatchObject({ interrupted: true, strength: 10, repelled: true });
    expect(attackState(v.state).current).toBeNull();
    finishAttack(v.state, balance, T0, seeded(1));
    expect(attackState(v.state).nextAt).toBeGreaterThan(T0);
  });
});

describe('the report says what held and what broke, in prose (GDD 5.1, 5.20)', () => {
  const base = { atMs: new Date(2026, 5, 1, 3, 10).getTime(), strength: 99, defense: 3 };
  it('repelled: they went for the east wall, it held; never numbers', () => {
    const lines = attackLines([{ ...base, repelled: true, where: 'the east wall', broke: [], hurt: [], lost: [] }], balance);
    expect(lines).toEqual(['Around 03:10 they went for the east wall. It held.']);
  });
  it('breached through a window / through the gate and the door, with hurt and lost', () => {
    expect(attackLines([{ ...base, repelled: false, where: 'the kitchen window', broke: ['the kitchen window'], hurt: [], lost: [] }], balance)).toEqual(['Around 03:10 they came through the kitchen window.']);
    const l = attackLines([{ ...base, repelled: false, where: 'the stairwell side', broke: ['the stairwell side', 'the south-east door'], hurt: [{ id: 'active', damage: 20 }], lost: [{ id: 'wood', qty: 4 }] }], balance);
    expect(l[0]).toBe('Around 03:10 they broke through the stairwell side and the south-east door. They got in.');
    expect(l.slice(1)).toEqual(['You are hurt.', 'Lost: 4 wood.']);
    expect(l.join(' ').replace(/\d\d:\d\d/, '')).not.toMatch(/\d{2,}/); // no strength / defense figures, only the clock time
  });
  it('a breach with nothing on the path to break reads "They walked in."', () => {
    expect(attackLines([{ ...base, repelled: false, where: null, broke: [], hurt: [], lost: [] }], balance)).toEqual(['Around 03:10 they walked in.']);
  });
  it('old-style results (no where) keep the barricade sentences', () => {
    expect(attackLines([{ repelled: true, atMs: base.atMs }], balance)).toEqual(['Around 03:10 something beat on the door for a long time. It held.']);
    expect(reportLines({ attacks: [], after: {}, used: {} }, balance)).toEqual([]);
  });
  it('edge labels: "the <side> <piece>", the gate as the stairwell door or side', () => {
    const w = hqWorld();
    const heart = heartStandTile(w.floor, w.state, balance);
    const lab = (x, y, s) => edgeLabel(w.floor, w.structures, w.grid.edgeId(x, y, s), heart);
    expect(lab(14, 10, 'N')).toBe('the stairwell side'); // the gate as a gap or wall
    w.structures.place({ x: 14, y: 10, side: 'N' }, { piece: 'door', tier: 'wood' });
    expect(lab(14, 10, 'N')).toBe('the stairwell door');
    expect(edgeLabel(w.floor, w.structures, front(w).edge, { x: 6, y: 5 })).toBe('the south door'); // straight below the heart
    expect(edgeLabel(w.floor, w.structures, front(w).edge, { x: 6, y: 14 })).toBe('the north door');
    expect(lab(12, 7, 'W')).toMatch(/^the (north|south|east|west)(-(east|west))? wall$/);
    expect(edgeLabel(w.floor, w.structures, w.grid.edgeId(5, 2, 'W'), { x: 2, y: 2 })).toBe('the east wall'); // the partition east of the bed
  });
  it('isInsideHome: the start flat before the claim, the whole HQ after', () => {
    const a = hqWorld({ claimed: false });
    expect(isInsideHome(a.floor, a.state, 3, 3)).toBe(true);
    expect(isInsideHome(a.floor, a.state, 20, 3)).toBe(false);
    const b = hqWorld();
    expect(isInsideHome(b.floor, b.state, 20, 3)).toBe(true);
    expect(isInsideHome(b.floor, b.state, 14, 8)).toBe(false);
    expect(claimFloor).toBeTypeOf('function');
  });
});
