import { describe, it, expect } from 'vitest';
import { hqWorld, balance, stock, giveTool } from './hqHelpers.js';
import { miniWorld, runSiege } from './siegeHelpers.js';
import {
  siegeConfig, edgeCrossCost, CostField, traceRoute, Siege, slotTiles, entryCountForDay, DECIDE,
} from '../../src/gameplay/isoSiege.js';
import { arrivalTile } from '../../src/gameplay/isoOffline.js';
import { attackGoal } from '../../src/gameplay/isoHeart.js';
import { MOVE } from '../../src/iso/grid.js';
import { stepStickMove, STICK } from '../../src/gameplay/isoStick.js';
import { addOverlay, build } from '../../src/gameplay/isoBuild.js';
import { PIECE } from '../../src/gameplay/isoStructures.js';

const cfg = siegeConfig(balance);
const ROWS = ['.......', '.......', '.......'];
/** Three wall segments across a 7x3 room at x = 3: one per row, every one a different strength. */
const COL = ['3,0,W', '3,1,W', '3,2,W'];
const eidOf = (st, k) => { const [x, y, s] = k.split(','); return st.grid.edgeId(+x, +y, s); };
const field = (floor, goal) => {
  const f = new CostField(floor.grid);
  for (let e = 0; e < f.cost.length; e++) f.cost[e] = edgeCrossCost(floor.structures, cfg, e);
  f.compute(goal.x, goal.y);
  return f;
};

describe('structure path cost (GDD 5.20: HP / 10 tiles, closed doors at least 10, gaps and open doors free)', () => {
  it('walls cost HP / pathHpPerTile, plus the cover', () => {
    const { floor, st } = miniWorld(ROWS, COL, { '3,0,W': 'wood', '3,1,W': 'block', '3,2,W': 'sheet_metal' });
    expect(edgeCrossCost(st, cfg, eidOf(st, '3,0,W'))).toBe(15);
    expect(edgeCrossCost(st, cfg, eidOf(st, '3,1,W'))).toBe(60);
    expect(edgeCrossCost(st, cfg, eidOf(st, '3,2,W'))).toBe(32);
    st.setOverlay(st.rec(3, 0, 'W'), { kind: 'plating', hp: 200, maxHp: 200 });
    expect(edgeCrossCost(st, cfg, eidOf(st, '3,0,W'))).toBe(35); // (150 + 200) / 10
    expect(floor.grid.edges.length).toBeGreaterThan(0);
  });
  it('a gap and an open door are free; a closed door costs at least 10; a barricade and plating add up', () => {
    const w = hqWorld();
    const st = w.structures;
    const front = w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
    expect(front.state).toBe('closed');
    expect(edgeCrossCost(st, cfg, front.edge)).toBe(12); // 120 HP / 10
    const interior = w.floor.doors.find((d) => d.kind === 'interior' && d.state === 'closed');
    expect(edgeCrossCost(st, cfg, interior.edge)).toBe(10); // 60 HP / 10 = 6, the closed-door floor is 10 (doors.zombiePathDoorCost)
    w.grid.setBarricade(front, { own: true, hp: 120 });
    expect(edgeCrossCost(st, cfg, front.edge)).toBe(24);
    w.grid.setDoorState(front, 'open');
    expect(edgeCrossCost(st, cfg, front.edge)).toBe(24); // a barricade still stands in an open door
    w.grid.setBarricade(front, null);
    expect(edgeCrossCost(st, cfg, front.edge)).toBe(0);
    expect(edgeCrossCost(st, cfg, w.grid.edgeId(14, 10, 'N'))).toBe(0); // the gate is a gap
  });
  it('exterior, shaft and void edges can never be crossed (exterior windows are never attacked)', () => {
    const w = hqWorld();
    const st = w.structures;
    expect(edgeCrossCost(st, cfg, w.grid.edgeId(0, 5, 'W'))).toBe(Infinity);
    expect(edgeCrossCost(st, cfg, w.grid.edgeId(0, 2, 'W'))).toBe(Infinity); // an exterior window
    expect(edgeCrossCost(st, cfg, w.grid.edgeId(18, 6, 'W'))).toBe(Infinity); // void edge
    expect(edgeCrossCost(st, cfg, w.grid.edgeId(12, 3, 'W'))).toBe(Infinity); // shaft edge
  });
  it('a built glass window costs HP / 10; broken it costs the climb (+3); boards on it add', () => {
    const { st } = miniWorld(ROWS, COL);
    st.place({ x: 3, y: 1, side: 'W' }, { piece: PIECE.WINDOW, tier: 'glass' });
    const eid = eidOf(st, '3,1,W');
    expect(edgeCrossCost(st, cfg, eid)).toBe(3);
    st.setOverlay(st.rec(3, 1, 'W'), { kind: 'boards', hp: 80, maxHp: 80 });
    expect(edgeCrossCost(st, cfg, eid)).toBe(11);
    st.damage({ x: 3, y: 1, side: 'W' }, 80);
    st.damage({ x: 3, y: 1, side: 'W' }, 30);
    expect(st.rec(3, 1, 'W').broken).toBe(true);
    expect(edgeCrossCost(st, cfg, eid)).toBe(3); // climb only
    expect(st.grid.moveClass(eid)).toBe(MOVE.CLIMB);
  });
  it('entries by day: 1 (days 0-2), 2 (3-5), 3 (6+)', () => {
    expect([0, 2, 3, 5, 6, 40].map((d) => entryCountForDay(cfg, d))).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe('weak spots: the cheapest route', () => {
  it('goes through the weakest segment of a wall, not the nearest one', () => {
    const { floor, st } = miniWorld(ROWS, COL, { '3,0,W': 'block', '3,1,W': 'block', '3,2,W': 'wood' });
    const f = field(floor, { x: 6, y: 0 });
    const r = traceRoute(f, 0, 0);
    expect(r.found).toBe(true);
    expect(r.crossings).toHaveLength(1);
    expect(r.crossings[0].eid).toBe(eidOf(st, '3,2,W')); // 2 rows of detour (about 3 tiles) beat 60 - 15 tiles of wall
  });
  it('damage left by an earlier attack makes a spot cheaper (weak spots are remembered by HP)', () => {
    const { floor, st } = miniWorld(ROWS, COL, { '3,0,W': 'wood', '3,1,W': 'wood', '3,2,W': 'wood' });
    st.setHp(st.rec(3, 2, 'W'), 40);
    const r = traceRoute(field(floor, { x: 6, y: 0 }), 0, 0);
    expect(r.crossings[0].eid).toBe(eidOf(st, '3,2,W'));
  });
  it('a gap costs nothing: the route walks through it and crosses nothing', () => {
    const { floor, st } = miniWorld(ROWS, COL);
    st.place({ x: 3, y: 2, side: 'W' }, { piece: PIECE.GAP });
    const r = traceRoute(field(floor, { x: 6, y: 0 }), 0, 0);
    expect(r.found).toBe(true);
    expect(r.crossings).toHaveLength(0);
  });
  it('on floor 15 the first attack probes the start flat front door, the weakest way to the bed', () => {
    const w = hqWorld();
    const goal = attackGoal(w.floor, w.state, balance);
    const s = new Siege(w.structures, balance);
    s.begin(arrivalTile(w.floor), goal, 1);
    const front = w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
    expect(s.entries[0]).toBe(front.edge);
  });
  it('a built, stronger gate sends the route to another weak spot', () => {
    const w = hqWorld();
    const goal = attackGoal(w.floor, w.state, balance);
    const s0 = new Siege(w.structures, balance);
    s0.begin(arrivalTile(w.floor), goal, 1);
    giveTool(w.state, 'hammer');
    stock(w.state, { wood: 6, metal: 1 });
    expect(build(w.ctx, { x: 14, y: 10, side: 'N' }).ok).toBe(true); // a 150 HP wood wall across half the gate
    expect(build(w.ctx, { x: 15, y: 10, side: 'N' }).ok).toBe(false); // no more wood: the other half stays a gap
    const s1 = new Siege(w.structures, balance);
    s1.begin(arrivalTile(w.floor), goal, 1);
    expect(s1.entries[0]).toBe(s0.entries[0]); // still the front door: the open half of the gate costs nothing
  });
});

describe('entries: a wave probes several weak spots (GDD 5.20)', () => {
  it('entry 2 is the next weakest way; attackers are dealt to the entries in turn', () => {
    const w = hqWorld();
    const goal = attackGoal(w.floor, w.state, balance);
    const s = new Siege(w.structures, balance);
    s.begin(arrivalTile(w.floor), goal, 3);
    expect(s.entries).toHaveLength(3);
    expect(new Set(s.entries).size).toBe(3);
    const dealt = [0, 1, 2, 3].map(() => { const ai = {}; s.assign(ai); return ai.entry; });
    expect(dealt).toEqual([0, 1, 2, 0]);
    // attacker 2 follows the field with entry 1 excluded: its route crosses entry 2 first
    const tr = traceRoute(s.fields[1], arrivalTile(w.floor).x, arrivalTile(w.floor).y);
    expect(tr.crossings[0].eid).toBe(s.entries[1]);
  });
  it('when an entry breaks the plan ends and everyone follows the plain field', () => {
    const w = hqWorld();
    const goal = attackGoal(w.floor, w.state, balance);
    const s = new Siege(w.structures, balance);
    s.begin(arrivalTile(w.floor), goal, 2);
    expect(s.plain).toBe(false);
    const front = w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
    w.structures.damageEid(front.edge, 1000); // breaks the door (generated doors break open)
    s.onStructures(true);
    s.update(0.01);
    expect(s.plain).toBe(true);
    expect(s.entries.length).toBeLessThanOrEqual(1);
    const ai = {}; s.assign(ai);
    expect(s.fieldOf(ai)).toBe(s.fields[0]);
  });
});

describe('attack slots: at most 3 hit one edge (GDD 5.20)', () => {
  it('slot tiles are the tile across the edge and the two beside it, none round a corner', () => {
    const { floor, st } = miniWorld(ROWS, COL);
    const f = field(floor, { x: 6, y: 1 });
    const t = slotTiles(floor.grid, f.cost, 2, 1, 3, 1);
    expect(t.n).toBe(3);
    expect([0, 1, 2].map((i) => `${t.x[i]},${t.y[i]}`).sort()).toEqual(['2,0', '2,1', '2,2']);
    const edge = slotTiles(floor.grid, f.cost, 2, 0, 3, 0); // top row: the corner tile (2,-1) is outside
    expect(edge.n).toBe(2);
    // a wall between the middle tile and a neighbour closes that slot
    st.place({ x: 2, y: 2, side: 'N' }, { piece: 'wall', tier: 'block' });
    const f2 = field(floor, { x: 6, y: 1 });
    expect(slotTiles(floor.grid, f2.cost, 2, 1, 3, 1).n).toBe(2);
  });
  it('a 1-wide chokepoint gets one attacker at a time', () => {
    const { floor } = miniWorld(['#.', '..', '#.'], ['1,1,W']); // the tile left of the wall has void above and below it
    const f = new CostField(floor.grid);
    f.cost.fill(0);
    const t = slotTiles(floor.grid, f.cost, 0, 1, 1, 1);
    expect(t.n).toBe(1); // only the tile across the edge
  });
  it('five walkers on the front door: never more than 3 hit it, the rest queue, and the door falls', () => {
    const w = hqWorld();
    const goal = attackGoal(w.floor, w.state, balance);
    const front = w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
    const run = runSiege(w.floor, { spawn: arrivalTile(w.floor), goal, types: ['walker', 'walker', 'walker', 'walker', 'walker'] });
    let maxHolders = 0;
    let brokeAt = null;
    for (let i = 0; i < 1500 && brokeAt === null; i++) {
      run.step(0.1);
      maxHolders = Math.max(maxHolders, run.siege.holdersOf(front.edge));
      for (const n of run.siege.holders.values()) expect(n).toBeLessThanOrEqual(3);
      if (front.state === 'broken') brokeAt = run.time();
    }
    expect(maxHolders).toBe(3);
    expect(brokeAt).not.toBeNull();
    // three walkers do 14 x 0.4 / 2.2 = 2.5 HP/s each: 120 HP in about 16 s once they stand there (plus the 0.9 s wind-up)
    const hitsOnDoor = run.log.filter((l) => l.eid === front.edge).length;
    expect(hitsOnDoor).toBeGreaterThanOrEqual(120 / (14 * 0.4));
    expect(hitsOnDoor).toBeLessThanOrEqual(120 / (14 * 0.4) + 4);
  });
  it('the 4th attacker seeks another edge when the slots of the weakest are full', () => {
    // a wide wall of identical segments: the first three queue on one segment, the others spread to the next ones
    const rows = ['.......', '.......', '.......', '.......', '.......'];
    const walls = ['3,0,W', '3,1,W', '3,2,W', '3,3,W', '3,4,W'];
    const { floor, st } = miniWorld(rows, walls, Object.fromEntries(walls.map((k) => [k, 'wood'])));
    const run = runSiege(floor, { spawn: { x: 0, y: 2 }, goal: { x: 6, y: 2 }, types: ['walker', 'walker', 'walker', 'walker', 'walker', 'walker'] });
    for (let i = 0; i < 900; i++) run.step(0.1);
    const used = [...run.hits.keys()];
    expect(used.length).toBeGreaterThanOrEqual(2); // more than one segment is under attack
    for (const eid of used) {
      expect(run.log.filter((l) => l.eid === eid).length).toBeGreaterThan(0);
    }
    for (const n of run.siege.holders.values()) expect(n).toBeLessThanOrEqual(3);
    expect(st.grid.edges.length).toBeGreaterThan(0);
  });
});

describe('damage and breach', () => {
  it('overlay first, then the piece; a built wall at 0 HP becomes a gap and the field goes through it', () => {
    const { floor, st } = miniWorld(ROWS, ['3,1,W'], { '3,1,W': 'wood' });
    st.setOverlay(st.rec(3, 1, 'W'), { kind: 'plating', hp: 200, maxHp: 200 });
    const run = runSiege(floor, { spawn: { x: 0, y: 1 }, goal: { x: 6, y: 1 }, types: ['walker', 'walker', 'walker'] });
    // the row is one wall at x = 3 with a gap above and below: close those too
    st.place({ x: 3, y: 0, side: 'W' }, { piece: 'wall', tier: 'block' });
    st.place({ x: 3, y: 2, side: 'W' }, { piece: 'wall', tier: 'block' });
    run.siege.onStructures(true);
    let order = [];
    for (let i = 0; i < 4000; i++) {
      run.step(0.1);
      for (const l of run.log.splice(0)) order.push(`${l.hit}${l.destroyed ? '!' : ''}`);
      if (st.rec(3, 1, 'W') === null) break;
    }
    const firstPiece = order.findIndex((o) => o.startsWith('piece'));
    expect(order.slice(0, firstPiece).every((o) => o.startsWith('overlay'))).toBe(true);
    expect(order).toContain('overlay!');
    expect(order[order.length - 1]).toBe('piece!');
    expect(st.describe(3, 1, 'W').piece).toBe('gap');
    for (let i = 0; i < 1200; i++) run.step(0.1);
    expect(run.zs.some((z) => z.x > 3.5)).toBe(true); // they flooded through the breach
  });
  it('a built door at 0 HP becomes a gap (not a broken door); a generated door breaks and stays', () => {
    const w = hqWorld();
    const st = w.structures;
    giveTool(w.state, 'hammer'); giveTool(w.state, 'sledgehammer');
    stock(w.state, { wood: 12, metal: 3, parts: 1 });
    st.place({ x: 14, y: 10, side: 'N' }, { piece: 'wall', tier: 'wood' });
    st.place({ x: 14, y: 10, side: 'N' }, { piece: 'door', tier: 'wood' });
    const eid = w.grid.edgeId(14, 10, 'N');
    expect(st.damageEid(eid, 99).destroyed).toBe(false);
    expect(st.damageEid(eid, 5).destroyed).toBe(true);
    expect(st.describe(14, 10, 'N').piece).toBe('gap');
    expect(w.grid.doorAt(14, 10, 'N')).toBeNull();
    const front = w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
    expect(st.damageEid(front.edge, 500).destroyed).toBe(true);
    expect(front.state).toBe('broken');
    expect(w.grid.moveClass(front.edge)).toBe(MOVE.OPEN);
  });
  it('a barricade takes the hits before its door; broken at 0 HP it stays until repaired', () => {
    const w = hqWorld();
    const st = w.structures;
    const front = w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
    w.grid.setBarricade(front, { own: true, hp: 120 });
    front.barricade.level = 1;
    expect(st.damageEid(front.edge, 100)).toMatchObject({ hit: 'overlay', destroyed: false });
    expect(front.hp).toBe(120);
    expect(st.damageEid(front.edge, 30)).toMatchObject({ hit: 'overlay', destroyed: true });
    expect(front.barricade.hp).toBe(0);
    expect(st.damageEid(front.edge, 10)).toMatchObject({ hit: 'piece' });
    expect(front.hp).toBe(110);
  });
  it('glass breaks into a broken window; every change is announced as a per-edge change, never a re-bake, until a piece goes', () => {
    const { st } = miniWorld(ROWS, ['3,1,W']);
    st.place({ x: 3, y: 1, side: 'W' }, { piece: PIECE.WINDOW, tier: 'glass' });
    const events = [];
    st.onChange((s, ev) => events.push({ structural: ev.structural, eid: ev.eid }));
    const eid = eidOf(st, '3,1,W');
    st.damageEid(eid, 10);
    st.damageEid(eid, 10);
    expect(events.every((e) => !e.structural && e.eid === eid)).toBe(true);
    const r = st.damageEid(eid, 10);
    expect(r).toMatchObject({ hit: 'piece', destroyed: true, noise: 'loud' });
    expect(events.at(-1)).toEqual({ structural: false, eid });
    st.place({ x: 3, y: 1, side: 'W' }, { piece: PIECE.GAP });
    expect(events.at(-1).structural).toBe(true);
  });
});

describe('re-planning on structure change', () => {
  it('the field is rebuilt (throttled) after an HP change and at once after a piece went', () => {
    const { floor, st } = miniWorld(ROWS, COL, { '3,0,W': 'wood', '3,1,W': 'block', '3,2,W': 'block' });
    const s = new Siege(st, balance);
    s.begin({ x: 0, y: 1 }, { x: 6, y: 1 }, 1);
    expect(s.entries[0]).toBe(eidOf(st, '3,0,W'));
    const stamp = s.stamp;
    st.setHp(st.rec(3, 2, 'W'), 10); // now the cheapest
    s.onStructures(false);
    s.update(0.1); // throttled: replanSeconds = 0.5
    expect(s.stamp).toBe(stamp);
    s.update(0.5);
    expect(s.stamp).toBe(stamp + 1);
    const ai = {}; s.assign(ai);
    expect(traceRoute(s.fieldOf(ai), 0, 1).crossings[0].eid).toBe(eidOf(st, '3,2,W'));
    st.place({ x: 3, y: 1, side: 'W' }, { piece: PIECE.GAP });
    s.onStructures(true);
    s.update(0.001); // a piece went: rebuilt at once
    expect(s.stamp).toBe(stamp + 2);
    expect(traceRoute(s.fieldOf(ai), 0, 1).crossings).toHaveLength(0);
    expect(floor.grid.edges.length).toBeGreaterThan(0);
  });
  it('an attacker re-derives its target after a rebuild unless it already holds a slot', () => {
    const { st } = miniWorld(ROWS, COL, { '3,0,W': 'wood', '3,1,W': 'wood', '3,2,W': 'wood' });
    const s = new Siege(st, balance);
    s.begin({ x: 0, y: 1 }, { x: 6, y: 1 }, 1);
    const occ = new Uint8Array(21);
    const z = { x: 2.5, y: 1.5 };
    const ai = {}; s.assign(ai);
    expect(s.decide(z, ai, occ).kind).toBe(DECIDE.HIT);
    expect(ai.holdEid).toBe(eidOf(st, '3,1,W'));
    st.setHp(st.rec(3, 0, 'W'), 5); s.onStructures(false); s.update(1);
    s.decide(z, ai, occ);
    expect(ai.tgt).toBe(eidOf(st, '3,1,W')); // a slot holder keeps its edge
  });
});

describe('broken windows: passable slowly (hero vault 1.0 s, zombie climb 1.5 s)', () => {
  const brokenWindowWorld = () => {
    const w = miniWorld(ROWS, COL);
    w.st.place({ x: 3, y: 1, side: 'W' }, { piece: PIECE.WINDOW, tier: 'glass' });
    w.st.damageEid(eidOf(w.st, '3,1,W'), 1000);
    return w;
  };
  it('a broken window is a CLIMB edge: walls and glass block, a broken pane does not', () => {
    const { st, grid } = brokenWindowWorld();
    expect(grid.moveClass(eidOf(st, '3,1,W'))).toBe(MOVE.CLIMB);
    expect(grid.moveClass(eidOf(st, '3,0,W'))).toBe(MOVE.BLOCK);
    expect(grid.stepClass(2, 1, 1, 0)).toBe(MOVE.CLIMB);
    expect(grid.stepClass(2, 1, 1, 1)).toBe(MOVE.BLOCK); // never diagonally
    st.setOverlay(st.rec(3, 1, 'W'), { kind: 'boards', hp: 80, maxHp: 80 });
    expect(grid.moveClass(eidOf(st, '3,1,W'))).toBe(MOVE.BLOCK); // boarded: nobody climbs
  });
  it('the hero pushing into a broken window gets CLIMB with the step across (the scene vaults him in 1.0 s)', () => {
    const { grid } = brokenWindowWorld();
    const hero = { x: 2.8, y: 1.5 };
    const env = { grid, radius: 0.3, doorMin: 0.35, maxStep: 0.1, assistTiles: 0.3, assistMinCos: 0.7 };
    let r;
    for (let i = 0; i < 10; i++) r = stepStickMove(hero, 1, 0, 0.1, env);
    expect(r.code).toBe(STICK.CLIMB);
    expect([r.dx, r.dy]).toEqual([1, 0]);
    expect(balance.structures.brokenWindowVaultSeconds.hero).toBe(1);
    const wall = stepStickMove({ x: 2.8, y: 0.5 }, 1, 0, 0.5, env); // an intact wall segment just stops him
    expect(wall.code).toBe(STICK.MOVING);
  });
  it('zombies pause at the sill for brokenWindowClimbExtraSeconds.zombie, then take the normal step: climbing is always slower than walking', () => {
    const { floor, st } = brokenWindowWorld();
    const run = runSiege(floor, { spawn: { x: 2, y: 1 }, goal: { x: 4, y: 1 }, types: ['crawler'] });
    let started = null;
    let crossed = null;
    for (let i = 0; i < 4000 && crossed === null; i++) {
      run.step(0.02);
      const z = run.zs[0];
      if (z && started === null && run.time() > 0.1) started = run.time() - 0.1;
      if (z && z.x >= 3.5) crossed = run.time();
    }
    expect(crossed).not.toBeNull();
    const step = 1 / balance.zombies.types.crawler.speedTilesPerSecond;
    expect(balance.structures.brokenWindowClimbExtraSeconds.zombie).toBe(1.5);
    expect(balance.structures.brokenWindowVaultSeconds.zombie).toBeUndefined();
    expect(crossed - started).toBeGreaterThan(step + 1.4);
    expect(crossed - started).toBeLessThan(step + 1.7);
    expect(run.log).toHaveLength(0); // nothing was hit: it climbed
    expect(st.rec(3, 0, 'W')).not.toBeNull();
  });
  it('a zombie that sees the hero mid-climb finishes the climb first', () => {
    const { floor } = brokenWindowWorld();
    const run = runSiege(floor, { spawn: { x: 2, y: 1 }, goal: { x: 5, y: 1 }, types: ['walker'], hero: { x: 2.5, y: 0.5 } });
    for (let i = 0; i < 20; i++) run.step(0.05); // in the sill pause now
    expect(run.ais[0].sclimb).toBe(true);
    expect(run.ais[0].mode).toBe('siege'); // the hero is right there, yet it does not turn
    for (let i = 0; i < 100; i++) run.step(0.05);
    expect(run.ais[0].mode).toBe('siege');
    for (let i = 0; i < 400 && run.zs[0].x < 3.5; i++) run.step(0.05);
    run.step(0.05);
    expect(run.zs[0].x).toBeGreaterThan(3.4);
  });
  it('a broken window as an entry ends the plan; holders of the old plan let go and re-path', () => {
    const w = hqWorld();
    const goal = attackGoal(w.floor, w.state, balance);
    const st = w.structures;
    st.place({ x: 15, y: 10, side: 'N' }, { piece: 'wall', tier: 'block' });
    st.place({ x: 14, y: 10, side: 'N' }, { piece: PIECE.WINDOW, tier: 'glass' }); // the gate is glass and block: glass is the cheapest entry
    const s = new Siege(st, balance);
    s.begin(arrivalTile(w.floor), goal, 2);
    const eid = w.grid.edgeId(14, 10, 'N');
    expect(s.entries).toContain(eid);
    expect(s.plain).toBe(false);
    const ai = {}; s.assign(ai);
    ai.holdEid = eid; s.holders.set(eid, 1);
    st.damageEid(eid, 1000); // shatters: climbable, not "gone"
    s.onStructures(false);
    s.update(1);
    expect(s.plain).toBe(true);
    s.decide({ x: 14.5, y: 9.5 }, ai, new Uint8Array(660));
    expect(ai.epoch).toBe(s.epoch);
    expect(s.holdersOf(eid)).toBe(0);
  });
  it('boards going up on a broken window drop a zombie that is climbing', () => {
    const { floor, st } = brokenWindowWorld();
    const run = runSiege(floor, { spawn: { x: 2, y: 1 }, goal: { x: 4, y: 1 }, types: ['walker'] });
    for (let i = 0; i < 10; i++) run.step(0.05);
    expect(run.ais[0].sclimb).toBe(true);
    st.setOverlay(st.rec(3, 1, 'W'), { kind: 'boards', hp: 80, maxHp: 80 });
    run.step(0.05);
    expect(run.ais[0].sclimb).toBe(false);
    expect(run.zs[0].x).toBeLessThan(3);
  });
  it('a leg in progress is dropped when a wall is built across it', () => {
    const { floor, st } = miniWorld(ROWS, []);
    const run = runSiege(floor, { spawn: { x: 1, y: 1 }, goal: { x: 5, y: 1 }, types: ['walker'] });
    for (let i = 0; i < 12; i++) run.step(0.05);
    expect(run.ais[0].sleg).toBe(true);
    const sx = run.ais[0].sx;
    st.place({ x: sx, y: 1, side: 'W' }, { piece: 'wall', tier: 'block' });
    run.step(0.05);
    expect(run.zs[0].x).toBeLessThan(sx);
    expect(run.zs[0].rsv).not.toBe(1 * 7 + sx);
  });
});

describe('HQ barricade picks up the weak-spot cost', () => {
  it('a barricade on the front door makes it costlier and the entry moves when it grows stronger than another way in', () => {
    const w = hqWorld();
    const goal = attackGoal(w.floor, w.state, balance);
    giveTool(w.state, 'hammer');
    stock(w.state, { wood: 30, metal: 10, duct_tape: 4 });
    const front = w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
    const ctx = w.ctx;
    const edge = { x: front.x, y: front.y, side: front.side };
    expect(addOverlay(ctx, edge, 'barricade').ok).toBe(true);
    expect(front.barricade).toMatchObject({ own: true, hp: 120, level: 1 });
    const s = new Siege(w.structures, balance);
    s.begin(arrivalTile(w.floor), goal, 1);
    expect(s.base[front.edge]).toBe(24);
  });
});
