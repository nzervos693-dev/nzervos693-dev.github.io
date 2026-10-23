import { describe, it, expect } from 'vitest';
import floorsIso from '../../public/data/levels/floors_iso.json';
import { hqWorld, stock, giveTool, balance } from './hqHelpers.js';
import { loadIsoFloor } from '../../src/iso/loader.js';
import { createIsoState, normalizeIsoState, applyDoorsToGrid, snapshotDoors, ISO_STATE_VERSION } from '../../src/gameplay/isoState.js';
import {
  canClaimFloor, claimFloor, isHqClaimed, mainHome, countsAsSecured, clearedThought, isHqTile, edgeTouchesHq, hqTiles,
  snapshotStructures, restoreStructures, THOUGHT_CLAIMED, THOUGHT_CLEARED,
} from '../../src/gameplay/isoHq.js';
import { build, fit, addOverlay, demolish, upgrade } from '../../src/gameplay/isoBuild.js';
import { parseEdgeKey, edgeKey } from '../../src/gameplay/isoStructures.js';

const killAll = (state) => { for (const id in state.zombies) state.zombies[id].dead = true; };

describe('claim the floor', () => {
  it('is blocked while any zombie lives, ok once Cleared; main home becomes HQ', () => {
    const w = hqWorld({ claimed: false });
    expect(mainHome(w.state)).toBe('start_flat');
    expect(canClaimFloor(w.state, balance, 15)).toMatchObject({ ok: false, code: 'not_cleared', message: 'Something is still moving here.', seconds: 5 });
    expect(clearedThought(w.state, balance, 15)).toBeNull();
    killAll(w.state);
    expect(clearedThought(w.state, balance, 15)).toBe(THOUGHT_CLEARED);
    expect(clearedThought(w.state, balance, 15)).toBeNull(); // once
    expect(canClaimFloor(w.state, balance, 15)).toMatchObject({ ok: true, code: 'ok' });
    const r = claimFloor(w.state, balance, 15, 1234);
    expect(r).toMatchObject({ ok: true, thought: THOUGHT_CLAIMED, mainHome: 'hq' });
    expect(w.state.hq).toEqual({ claimed: true, claimedAt: 1234 });
    expect(isHqClaimed(w.state)).toBe(true);
    expect(countsAsSecured(w.state, balance, 15)).toBe(true);
  });
  it('is permanent: a later zombie does not undo it; claiming twice is refused; wrong floor refused', () => {
    const w = hqWorld({ claimed: false });
    killAll(w.state);
    claimFloor(w.state, balance, 15, 1);
    w.state.zombies.late = { id: 'late', dead: false, floor: 15 };
    expect(isHqClaimed(w.state)).toBe(true);
    expect(canClaimFloor(w.state, balance, 15).code).toBe('already_claimed');
    expect(canClaimFloor(w.state, balance, 14).code).toBe('not_floor15');
    expect(claimFloor(hqWorld({ claimed: false }).state, balance, 15).ok).toBe(false);
  });
  it('HQ tiles are everything but the stairwell core', () => {
    const { structures: st } = hqWorld();
    expect(isHqTile(st, 3, 3)).toBe(true);
    expect(isHqTile(st, 5, 10)).toBe(true); // corridor
    expect(isHqTile(st, 14, 8)).toBe(false); // landing
    expect(isHqTile(st, 12, 3)).toBe(false); // flight
    expect(edgeTouchesHq(st, { x: 14, y: 10, side: 'N' })).toBe(true); // gate: corridor side
    expect(edgeTouchesHq(st, { x: 14, y: 8, side: 'N' })).toBe(false); // landing | landing
    expect(hqTiles(st).length).toBeGreaterThan(400);
  });
  it('building inside the landing is refused as not_hq', () => {
    const w = hqWorld();
    giveTool(w.state, 'hammer');
    stock(w.state, { wood: 6, metal: 1 });
    expect(build(w.ctx, { x: 14, y: 8, side: 'N' }).code).toBe('not_hq');
  });
});

describe('save / load', () => {
  function roundTrip(w) {
    snapshotDoors(w.state, w.floor);
    snapshotStructures(w.state, w.floor);
    const saved = JSON.parse(JSON.stringify(w.state));
    const floor = loadIsoFloor(floorsIso, 15, balance);
    const state = normalizeIsoState(saved, balance, floor, 0);
    const structures = restoreStructures(state, floor, balance);
    applyDoorsToGrid(state, floor);
    return { floor, state, structures, grid: floor.grid };
  }

  it('a fresh state has no overrides and no hq claim; the state version is bumped', () => {
    const w = hqWorld({ claimed: false });
    snapshotStructures(w.state, w.floor);
    expect(w.state.edges[15]).toEqual({});
    expect(w.state.hq).toEqual({ claimed: false, claimedAt: null });
    expect(w.state.v).toBe(ISO_STATE_VERSION);
    expect(w.state.build.selectedPiece).toBe('wall');
  });
  it('keys are canonical N / W', () => {
    expect(edgeKey(3, 4, 'S')).toBe('3.5.N');
    expect(edgeKey(3, 4, 'E')).toBe('4.4.W');
    expect(parseEdgeKey('3.5.N')).toEqual({ x: 3, y: 5, side: 'N' });
    expect(parseEdgeKey('bad')).toBeNull();
  });
  it('round-trips built, upgraded, fitted, covered, damaged and demolished edges; only changes are saved', () => {
    const w = hqWorld();
    giveTool(w.state, 'hammer'); giveTool(w.state, 'sledgehammer');
    stock(w.state, { wood: 30, metal: 6, glass: 2, parts: 2, sheet_metal: 6 });
    const doorEdge = w.structures.describe(5, 7, 'W'); // generated NW interior door
    build(w.ctx, { x: 14, y: 10, side: 'N' });
    upgrade(w.ctx, { x: 14, y: 10, side: 'N' }); // sheet metal
    build(w.ctx, { x: 15, y: 10, side: 'N' });
    fit(w.ctx, { x: 15, y: 10, side: 'N' }, 'door'); // wood door
    w.structures.damage({ x: 15, y: 10, side: 'N' }, 25);
    fit(w.ctx, { x: 3, y: 10, side: 'N' }, 'window');
    addOverlay(w.ctx, { x: 3, y: 10, side: 'N' }, 'boards');
    addOverlay(w.ctx, { x: 12, y: 10, side: 'N' }, 'plating');
    demolish(w.ctx, { x: 5, y: 2, side: 'W' });
    w.structures.damage({ x: 12, y: 10, side: 'N' }, 50); // overlay damage
    expect(doorEdge.piece).toBe('door');

    const keys = Object.keys(w.structures.exportOverrides()).sort();
    expect(keys).toEqual(['12.10.N', '14.10.N', '15.10.N', '3.10.N', '5.2.W']);

    const r = roundTrip(w);
    for (const [x, y, side] of [[14, 10, 'N'], [15, 10, 'N'], [3, 10, 'N'], [12, 10, 'N'], [5, 2, 'W'], [5, 7, 'W'], [0, 2, 'W'], [3, 3, 'N']]) {
      const a = w.structures.describe(x, y, side);
      const b = r.structures.describe(x, y, side);
      expect({ piece: b.piece, tier: b.tier, hp: b.hp, overlay: b.overlay, stage: b.stage }).toEqual({ piece: a.piece, tier: a.tier, hp: a.hp, overlay: a.overlay, stage: a.stage });
    }
    expect(r.structures.describe(15, 10, 'N')).toMatchObject({ piece: 'door', tier: 'wood', hp: 75 });
    expect(r.grid.doorAt(15, 10, 'N')).toMatchObject({ tier: 'wood', state: 'closed' });
    expect(r.floor.doors).toContain(r.grid.doorAt(15, 10, 'N'));
    expect(r.grid.edgeBlocksSight(r.grid.edgeId(3, 10, 'N'))).toBe(true); // boarded glass
    expect(r.structures.roomOf(4, 2)).toBe(r.structures.roomOf(5, 2)); // merged
    expect(r.state.hq.claimed).toBe(true);
    expect(r.structures.exportOverrides()).toEqual(w.structures.exportOverrides());
  });
  it('a demolished generated door stays gone and its door state is not resurrected', () => {
    const w = hqWorld();
    giveTool(w.state, 'sledgehammer');
    const id = w.grid.doorAt(5, 7, 'W').id;
    demolish(w.ctx, { x: 5, y: 7, side: 'W' });
    const r = roundTrip(w);
    expect(r.grid.doorAt(5, 7, 'W')).toBeNull();
    expect(r.floor.doors.find((d) => d.id === id)).toBeUndefined();
  });
  it('bad override entries are ignored; a perimeter gap survives a reload but never a door or window', () => {
    const w = hqWorld();
    const n = w.structures.applyOverrides({ 'x.y.N': {}, '5.2.W': { piece: 'wall', tier: 'unobtainium' }, '0.5.W': { piece: 'gap' }, '5.3.W': null, '12.10.N': { piece: 'door', tier: 'wood', hp: 100 }, '18.6.W': { piece: 'gap' } });
    expect(n).toBe(0);
    expect(w.structures.describe(0, 5, 'W').piece).toBe('wall');
    expect(w.structures.describe(12, 10, 'N').piece).toBe('wall');
    expect(w.structures.describe(18, 6, 'W').piece).toBe('wall'); // void edge
  });
  describe('overlays and damage on exterior and perimeter pieces survive a reload (BUG-051)', () => {
    const edgeInfo = (st, x, y, side) => { const d = st.describe(x, y, side); return { piece: d.piece, tier: d.tier, hp: d.hp, overlay: d.overlay, stage: d.stage }; };
    it('a plated, damaged exterior window', () => {
      const w = hqWorld();
      stock(w.state, { sheet_metal: 2, parts: 1 });
      giveTool(w.state, 'hammer');
      addOverlay(w.ctx, { x: 0, y: 2, side: 'W' }, 'plating');
      const rec = w.structures.rec(0, 2, 'W'); // exterior edges take no zombie damage before M4: set the HP the way a later climber hit would
      w.structures.setOverlay(rec, { ...rec.overlay, hp: 130 });
      w.structures.setHp(rec, 20);
      const before = edgeInfo(w.structures, 0, 2, 'W');
      expect(before).toMatchObject({ hp: 20, overlay: { kind: 'plating', hp: 130 } });
      const r = roundTrip(w);
      expect(edgeInfo(r.structures, 0, 2, 'W')).toEqual(before);
      expect(r.grid.edgeBlocksSight(r.grid.edgeId(0, 2, 'W'))).toBe(true); // plated: blocks sight
    });
    it('a boarded exterior window, and the window\'s own damage', () => {
      const w = hqWorld();
      stock(w.state, { wood: 3 });
      giveTool(w.state, 'hammer');
      addOverlay(w.ctx, { x: 0, y: 2, side: 'W' }, 'boards');
      const rec = w.structures.rec(0, 2, 'W');
      w.structures.setHp(rec, 12); // the pane under the boards is cracked
      const before = edgeInfo(w.structures, 0, 2, 'W');
      const r = roundTrip(w);
      expect(edgeInfo(r.structures, 0, 2, 'W')).toEqual(before);
      expect(r.structures.describe(0, 2, 'W')).toMatchObject({ hp: 12, overlay: { kind: 'boards', hp: 80 } });
      // an unboarded window keeps only its damage
      const w2 = hqWorld();
      w2.structures.setHp(w2.structures.rec(0, 2, 'W'), 9);
      expect(roundTrip(w2).structures.describe(0, 2, 'W')).toMatchObject({ hp: 9, overlay: null, tier: 'exterior' });
    });
    it('a damaged perimeter wall', () => {
      const w = hqWorld();
      w.structures.damage({ x: 12, y: 10, side: 'N' }, 250);
      const r = roundTrip(w);
      expect(r.structures.describe(12, 10, 'N')).toMatchObject({ piece: 'wall', tier: 'block', hp: 350 });
    });
    it('a perimeter door keeps its HP and overlay (a door on a perimeter edge exists when the plan has one)', () => {
      const bal = { ...balance, hq: { ...balance.hq, perimeterEdges: [...balance.hq.perimeterEdges, '5.7.W'] } };
      const mk = () => {
        const floor = loadIsoFloor(floorsIso, 15, bal);
        const state = createIsoState(bal, floor, 0);
        return { floor, state, structures: restoreStructures(state, floor, bal) };
      };
      const w = mk();
      expect(w.structures.describe(5, 7, 'W')).toMatchObject({ kind: 'perimeter', piece: 'door' });
      w.structures.damage({ x: 5, y: 7, side: 'W' }, 20);
      w.structures.setOverlay(w.structures.rec(5, 7, 'W'), { kind: 'plating', hp: 150, maxHp: 200 });
      snapshotDoors(w.state, w.floor);
      snapshotStructures(w.state, w.floor);
      const saved = JSON.parse(JSON.stringify(w.state));
      const floor = loadIsoFloor(floorsIso, 15, bal);
      const state = normalizeIsoState(saved, bal, floor, 0);
      const structures = restoreStructures(state, floor, bal);
      applyDoorsToGrid(state, floor);
      expect(structures.describe(5, 7, 'W')).toMatchObject({ piece: 'door', hp: 40, overlay: { kind: 'plating', hp: 150 } });
    });
    it('still refused: a piece change the rules forbid, and anything on void / shaft edges', () => {
      const w = hqWorld();
      const n = w.structures.applyOverrides({
        '0.2.W': { piece: 'wall', tier: 'block', hp: 600 }, // exterior window cannot become a wall
        '12.10.N': { piece: 'window', tier: 'glass', hp: 30 }, // no window on a perimeter wall
        '18.6.W': { piece: 'gap' },
      });
      expect(n).toBe(0);
      expect(w.structures.describe(0, 2, 'W').piece).toBe('window');
      expect(w.structures.describe(12, 10, 'N').piece).toBe('wall');
    });
    it('crafted saves cannot change an exterior edge or fake an overlay', () => {
      const w = hqWorld();
      const gen = (x, y) => { const d = w.structures.describe(x, y, 'W'); return { piece: d.piece, tier: d.tier }; };
      const g02 = gen(0, 2);
      const g07 = gen(0, 7);
      const g05 = gen(0, 5);
      expect(g02.piece).toBe('window');
      expect(g07.piece).toBe('window');
      expect(g05.piece).toBe('wall');
      w.structures.applyOverrides({
        '0.2.W': { piece: 'window', tier: 'glass' },
        '0.7.W': { piece: 'window', tier: 'exterior', broken: true },
        '0.5.W': { piece: 'wall', tier: 'wood', hp: 1, overlay: { kind: 'boards', hp: 50 } },
      });
      expect(gen(0, 2)).toEqual(g02); // tier kept
      expect(w.structures.describe(0, 7, 'W').broken).toBe(false);
      expect(w.grid.edgeBlocksSight(w.grid.edgeId(0, 2, 'W'))).toBe(true);
      expect(w.grid.edgeBlocksSight(w.grid.edgeId(0, 7, 'W'))).toBe(true);
      expect(w.structures.describe(0, 5, 'W')).toMatchObject({ piece: 'wall', tier: g05.tier, overlay: null });
      expect(w.structures.describe(0, 5, 'W').hp).toBe(w.structures.describe(0, 5, 'W').maxHp);
    });
    it('an overlay must fit the piece (boards only on windows, barricade not as an overlay), on every edge kind', () => {
      const w = hqWorld();
      w.structures.applyOverrides({
        '5.2.W': { piece: 'wall', tier: 'wood', hp: 100, overlay: { kind: 'boards', hp: 50 } }, // boards on a wall
        '3.10.N': { piece: 'wall', tier: 'wood', hp: 100, overlay: { kind: 'plating', hp: 9999 } }, // hp above max is clamped
        '12.10.N': { piece: 'wall', tier: 'block', hp: 500, overlay: { kind: 'barricade', hp: 10 } },
      });
      expect(w.structures.describe(5, 2, 'W')).toMatchObject({ tier: 'wood', overlay: null });
      expect(w.structures.describe(3, 10, 'N').overlay).toMatchObject({ kind: 'plating', hp: 200, maxHp: 200 });
      expect(w.structures.describe(12, 10, 'N')).toMatchObject({ hp: 500, overlay: null });
    });
    it('restored generated walls and doors keep their generated look (genTier passes through)', () => {
      const w = hqWorld();
      const before = w.structures.rec(3, 10, 'N').genTier;
      expect(before).toBe('block');
      w.structures.damage({ x: 3, y: 10, side: 'N' }, 100);
      const r = roundTrip(w);
      expect(r.structures.rec(3, 10, 'N')).toMatchObject({ genTier: 'block', hp: 500 });
      const door = w.floor.structures.recs.size && [...w.structures.recs.values()].find((x) => x.piece === 'door' && x.tier === 'generated_interior');
      w.structures.setOverlay(door, { kind: 'plating', hp: 100, maxHp: 200 });
      const r2 = roundTrip(w);
      expect(r2.structures.recs.get(door.eid)).toMatchObject({ genTier: 'generated_interior' });
    });
  });
  it('a broken perimeter wall stays a gap after save and load', () => {
    const w = hqWorld();
    w.structures.place({ x: 13, y: 10, side: 'N' }, { piece: 'gap' });
    w.structures.place({ x: 12, y: 6, side: 'W' }, { piece: 'gap' });
    const r = roundTrip(w);
    expect(r.structures.describe(13, 10, 'N').piece).toBe('gap');
    expect(r.structures.describe(12, 6, 'W').piece).toBe('gap');
    expect(r.structures.describe(14, 10, 'N').piece).toBe('gap');
    expect(r.structures.describe(12, 10, 'N').piece).toBe('wall');
  });
  it('an older v2 iso save (no edges / hq) loads with defaults', () => {
    const w = hqWorld({ claimed: false });
    const old = JSON.parse(JSON.stringify(w.state));
    delete old.edges; delete old.hq; delete old.build.selectedPiece; old.v = 2;
    const s = normalizeIsoState(old, balance, w.floor, 0);
    expect(s.edges).toEqual({});
    expect(s.hq.claimed).toBe(false);
    expect(s.build.selectedPiece).toBe('wall');
  });
});
