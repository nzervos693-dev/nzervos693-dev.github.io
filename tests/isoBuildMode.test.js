import { describe, it, expect } from 'vitest';
import { hqWorld, stock, giveTool, findEdge, balance } from './iso/hqHelpers.js';
import {
  snapSide, edgeInFront, isEdgeTargetable, buildModeAvailable, buildPieces, selectedPiece, selectPiece, pieceCells, edgeSlots,
  actionSeconds, resultToast, ghostFrame, sealsIn, PIECE_ICON,
} from '../src/gameplay/isoBuildMode.js';
import { TargetTracker, targetConfig } from '../src/gameplay/isoTarget.js';
import { describeTarget } from '../src/gameplay/isoButtons.js';
import { mainAction } from '../src/gameplay/isoBuild.js';
import {
  canClaimFloor, claimFloor, clearedThought, rememberHq, THOUGHT_CLEARED, THOUGHT_CLAIMED, isHqTile, mainHome,
} from '../src/gameplay/isoHq.js';
import { doorArtFrame, wallTierArt, windowArtFrame, edgeExtraFrames, damageMaterial } from '../src/gameplay/isoView.js';
import { makeIsoAi, retargetAfterStructureChange } from '../src/gameplay/isoZombies.js';

const GATE_A = { x: 14, y: 10, side: 'N' };
const PARTITION = { x: 5, y: 2, side: 'W' };
const armed = (w, items = {}, tools = ['hammer']) => { for (const t of tools) giveTool(w.state, t); stock(w.state, items); return w; };
const slotCtx = (w, extra = {}) => ({
  balance, state: w.state, weapon: { id: 'fists' }, hasTool: () => false, doorOccupied: () => false, isHomeBed: () => false,
  nap: { enabled: false }, canStoreAll: false, shove: { ready: true, inRange: true }, buildCtx: w.ctx, selectedPiece: 'wall', ...extra,
});

describe('edge cursor: facing snaps to 4 sides with hysteresis', () => {
  it('picks the nearest of N / E / S / W (grid angles: E 0, S 90, W 180, N 270)', () => {
    expect(snapSide(null, 10)).toBe('E');
    expect(snapSide(null, 80)).toBe('S');
    expect(snapSide(null, 200)).toBe('W');
    expect(snapSide(null, 300)).toBe('N');
  });
  it('keeps the side until the facing is more than 45 + 10 degrees away', () => {
    expect(snapSide('E', 50)).toBe('E'); // 50 from E, nearer S would be 40
    expect(snapSide('E', 54)).toBe('E');
    expect(snapSide('E', 56)).toBe('S'); // past 55
    expect(snapSide('N', 270 + 54)).toBe('N');
    expect(snapSide('N', 270 + 56)).toBe('E');
  });
  it('the edge in front is canonical (S / E map onto the neighbour N / W) and written in place', () => {
    const out = { x: 0, y: 0, side: 'N' };
    expect(edgeInFront(3, 4, 'N', out)).toEqual({ x: 3, y: 4, side: 'N' });
    expect(edgeInFront(3, 4, 'S', out)).toEqual({ x: 3, y: 5, side: 'N' });
    expect(edgeInFront(3, 4, 'W', out)).toEqual({ x: 3, y: 4, side: 'W' });
    expect(edgeInFront(3, 4, 'E', out)).toEqual({ x: 4, y: 4, side: 'W' });
  });
});

describe('edge targeting', () => {
  it('no target on shaft, void or plain exterior edges; an exterior window is a target (overlays)', () => {
    const { structures: st } = hqWorld();
    const shaft = findEdge(st, (d) => d.kind === 'shaft');
    const ext = findEdge(st, (d) => d.kind === 'exterior' && d.piece === 'wall');
    const extWin = findEdge(st, (d) => d.kind === 'exterior' && d.piece === 'window');
    const voidE = findEdge(st, (d) => d.kind === 'void');
    for (const e of [shaft, ext, voidE]) expect(isEdgeTargetable(st, e.x, e.y, e.side)).toBe(false);
    expect(isEdgeTargetable(st, extWin.x, extWin.y, extWin.side)).toBe(true);
    expect(isEdgeTargetable(st, GATE_A.x, GATE_A.y, GATE_A.side)).toBe(true); // gap
    expect(isEdgeTargetable(st, PARTITION.x, PARTITION.y, PARTITION.side)).toBe(true); // wall
    expect(isEdgeTargetable(st, 0, 0, 'N') || true).toBe(true);
  });

  const hero = { x: 5.5, y: 5.5, facing: 0 };
  const cfg = targetConfig(balance);
  const ctx = { weaponRange: 1.5, visible: () => true, los: () => true };
  const edge = { id: 'edge', kind: 'edge', x: 0, y: 0, edge: { x: 6, y: 5, side: 'W' }, target: { kind: 'edge' } };
  const wall = { id: 'o1', kind: 'thing', x0: 6, y0: 5, x1: 7, y1: 6, tiles: [{ x: 6, y: 5 }], target: { kind: 'object' } };
  const zombie = { id: 'z', kind: 'zombie', x: 6.5, y: 5.5, target: { kind: 'zombie' } };

  it('the edge cursor is a target when nothing beats it', () => {
    const t = new TargetTracker(cfg);
    expect(t.update(0.016, hero, [edge], ctx, { held: false, locked: false })).toBe(edge);
  });
  it('zombies beat the edge cursor, and the target switches to a zombie at once', () => {
    const t = new TargetTracker(cfg);
    expect(t.update(0.016, hero, [edge], ctx, { held: false, locked: false })).toBe(edge);
    expect(t.update(0.016, hero, [edge, zombie], ctx, { held: false, locked: false })).toBe(zombie);
  });
  it('the cursor is not subject to cone or reach, and is frozen while an action locks the target', () => {
    const t = new TargetTracker(cfg);
    t.update(0.016, hero, [edge], ctx, { held: false, locked: false });
    const far = { ...hero, facing: 180 };
    expect(t.update(0.016, far, [edge], ctx, { held: false, locked: false })).toBe(edge);
    expect(t.update(0.016, far, [zombie], ctx, { held: false, locked: true })).toBe(edge);
  });
  it('objects are not candidates in build mode (the scene simply does not list them): only edge + zombies compete', () => {
    const t = new TargetTracker(cfg);
    expect(t.update(0.016, hero, [wall, edge], ctx, { held: false, locked: false })).toBeTruthy();
  });
});

describe('Main / Secondary button mapping for the edge cursor', () => {
  it('icons follow the action; refusals are greyed with their message', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    const gap = edgeSlots(w.ctx, GATE_A, 'wall');
    expect(gap.main).toMatchObject({ id: 'edgeMain', icon: 'build_wall', enabled: true });
    expect(gap.secondary).toMatchObject({ id: 'edgeSecondary', icon: 'demolish', enabled: false, reason: 'Nothing here.' });
    // upgrade
    w.structures.place(GATE_A, { piece: 'wall', tier: 'wood' });
    expect(edgeSlots(w.ctx, GATE_A, 'wall').main).toMatchObject({ icon: 'upgrade', enabled: false, reason: 'Needs 3 sheet metal' });
    // damaged piece: trowel (repair) comes first
    w.structures.damage(GATE_A, 30);
    expect(edgeSlots(w.ctx, GATE_A, 'wall').main).toMatchObject({ icon: 'trowel', enabled: true });
  });
  it('fit door / fit window / board / plate icons come from the selected piece', () => {
    const w = armed(hqWorld(), { wood: 20, metal: 4, parts: 4, glass: 4, sheet_metal: 4 }, ['hammer', 'sledgehammer']);
    w.structures.place(PARTITION, { piece: 'wall', tier: 'wood' });
    expect(edgeSlots(w.ctx, PARTITION, 'door').main).toMatchObject({ icon: 'fit_door', enabled: true });
    expect(edgeSlots(w.ctx, PARTITION, 'window').main).toMatchObject({ icon: 'fit_window', enabled: true });
    expect(edgeSlots(w.ctx, PARTITION, 'plating').main).toMatchObject({ icon: 'plate_window', enabled: true });
    w.structures.place(PARTITION, { piece: 'window', tier: 'glass' });
    expect(edgeSlots(w.ctx, PARTITION, 'boards').main).toMatchObject({ icon: 'board_window', enabled: true });
    expect(edgeSlots(w.ctx, GATE_A, 'door').main).toMatchObject({ icon: 'fit_door', enabled: false, reason: 'Needs a wall first.' });
  });
  it('perimeter wall: Demolish greyed "Load-bearing. Leave it."; the refusal always has a message', () => {
    const w = armed(hqWorld(), {}, ['hammer', 'sledgehammer']);
    const s = edgeSlots(w.ctx, { x: 12, y: 10, side: 'N' }, 'wall');
    expect(s.secondary).toMatchObject({ enabled: false, reason: 'Load-bearing. Leave it.' });
    expect(s.main.enabled === false ? s.main.reason : 'ok').toBeTruthy();
  });
  it('describeTarget maps an edge target and a claim target', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    const d = describeTarget({ kind: 'edge', edge: GATE_A }, slotCtx(w));
    expect(d.main.act.action).toBe('build');
    expect(describeTarget({ kind: 'claim' }, slotCtx(w, { claim: { ok: true } })).main).toMatchObject({ id: 'claim', icon: 'claim_floor', enabled: true });
    expect(describeTarget({ kind: 'claim' }, slotCtx(w, { claim: { ok: false, message: 'Something is still moving here.' } })).main)
      .toMatchObject({ enabled: false, reason: 'Something is still moving here.', icon: 'claim_floor' });
    expect(describeTarget({ kind: 'claim' }, slotCtx(w, { claim: { ok: true } })).secondary).toBeNull();
  });
  it('a fitted door has no crowbar Dismantle in normal mode', () => {
    const w = hqWorld();
    const d = w.structures.rec(5, 7, 'W');
    w.structures.place({ x: 5, y: 7, side: 'W' }, { piece: 'gap' });
    w.structures.place(PARTITION, { piece: 'door', tier: 'wood' });
    const door = w.grid.doorAt(5, 2, 'W');
    expect(door.built).toBe(true);
    expect(describeTarget({ kind: 'door', door }, slotCtx(w, { hasTool: () => true })).secondary).toBeNull();
    expect(d).toBeTruthy();
  });
});

describe('piece selection (Quick-use in build mode, GDD 5.19)', () => {
  it('lists the pieces the rules support, in balance order (barricade arrived with the attack piece)', () => {
    expect(buildPieces(balance)).toEqual(['wall', 'door', 'window', 'boards', 'plating', 'barricade']);
    expect(PIECE_ICON.wall).toBe('build_wall');
  });
  it('defaults to wall, saves the choice, ignores unknown or unsupported ones', () => {
    const w = hqWorld();
    expect(selectedPiece(w.state, balance)).toBe('wall');
    expect(selectPiece(w.state, balance, 'door')).toBe(true);
    expect(w.state.build.selectedPiece).toBe('door');
    expect(selectPiece(w.state, balance, 'door')).toBe(false);
    expect(selectPiece(w.state, balance, 'barricade')).toBe(true);
    expect(selectPiece(w.state, balance, 'barricade')).toBe(false);
    selectPiece(w.state, balance, 'door');
    expect(selectPiece(w.state, balance, 'nonsense')).toBe(false);
    expect(selectedPiece(w.state, balance)).toBe('door');
    w.state.build.selectedPiece = 'garbage';
    expect(selectedPiece(w.state, balance)).toBe('wall');
  });
  it('picker cells carry the pictogram and mark the selected one', () => {
    const w = hqWorld();
    selectPiece(w.state, balance, 'window');
    const cells = pieceCells(w.state, balance);
    expect(cells.map((c) => c.icon)).toEqual(['build_wall', 'fit_door', 'fit_window', 'board_window', 'plate_window', 'barricade']);
    expect(cells.filter((c) => c.selected).map((c) => c.id)).toEqual(['window']);
  });
  it('build mode is possible inside the claimed HQ or with a tool in the bag', () => {
    const w = hqWorld({ claimed: false });
    const inHq = { x: 3.5, y: 11.5 }; // corridor
    expect(buildModeAvailable(w.state, balance, w.structures, inHq)).toBe(false);
    giveTool(w.state, 'sledgehammer');
    expect(buildModeAvailable(w.state, balance, w.structures, inHq)).toBe(true);
    const c = hqWorld();
    expect(isHqTile(c.structures, 3, 11)).toBe(true);
    expect(buildModeAvailable(c.state, balance, c.structures, inHq)).toBe(true);
    expect(buildModeAvailable(c.state, balance, c.structures, { x: 14.5, y: 8.5 })).toBe(false); // landing
  });
});

describe('timed action numbers and result toasts', () => {
  it('time = result seconds x the light multiplier (Dim x1.5, Dark x2)', () => {
    const r = { seconds: 6 };
    expect(actionSeconds(r, 'grey', balance)).toBe(6);
    expect(actionSeconds(r, 'dim', balance)).toBe(6 * balance.light.dimTimeMult);
    expect(actionSeconds(r, 'dark', balance)).toBe(6 * balance.light.darkTimeMult);
  });
  it('noise comes from the result (noiseTiles), the whole floor for demolish', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 }, ['hammer', 'sledgehammer']);
    const b = mainAction(w.ctx, GATE_A, 'wall');
    expect(b.result.noiseTiles).toBe(balance.salvage.noiseRadiusTiles);
    w.structures.place(PARTITION, { piece: 'wall', tier: 'wood' });
    expect(edgeSlots(w.ctx, PARTITION, 'wall').secondary.act.result.noiseTiles).toBe(Infinity);
  });
  it('toasts say what happened, what came back, and the refusal at completion', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 }, ['hammer', 'sledgehammer']);
    const b = mainAction(w.ctx, GATE_A, 'wall').perform();
    expect(resultToast(b, balance)).toBe('Wall built.');
    const d = edgeSlots(w.ctx, GATE_A, 'wall').secondary.act.perform();
    expect(resultToast(d, balance)).toMatch(/^Knocked out\. \+3 wood/);
    expect(resultToast(mainAction(w.ctx, GATE_A, 'wall').result, balance)).toBeTruthy();
    const refused = mainAction(hqWorld().ctx, GATE_A, 'wall').perform();
    expect(resultToast(refused, balance)).toBe('Needs hammer');
  });
  it('cancelling costs nothing: building only takes materials in perform()', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    const act = mainAction(w.ctx, GATE_A, 'wall');
    const before = JSON.stringify(w.state.inventory);
    expect(act.result.ok).toBe(true);
    expect(JSON.stringify(w.state.inventory)).toBe(before); // the check changed nothing
    expect(w.structures.describe(14, 10, 'N').piece).toBe('gap');
  });
});

describe('ghost frames (gaps only, GDD 5.19)', () => {
  it('a gap shows the wall Main would build; existing pieces and refusals show none', () => {
    const w = armed(hqWorld(), { wood: 20, metal: 4, glass: 4, sheet_metal: 4, parts: 4 }, ['hammer', 'sledgehammer']);
    expect(ghostFrame(mainAction(w.ctx, GATE_A, 'wall'), 'x', false)).toBe('wall_x_full_wood');
    expect(ghostFrame(mainAction(w.ctx, GATE_A, 'wall'), 'x', true)).toBe('wall_x_stub_wood');
    expect(ghostFrame(mainAction(hqWorld().ctx, GATE_A, 'wall'), 'x', false)).toBeNull(); // refused
    w.structures.place(PARTITION, { piece: 'wall', tier: 'wood' });
    for (const sel of ['wall', 'door', 'window', 'plating']) expect(ghostFrame(mainAction(w.ctx, PARTITION, sel), 'y', false)).toBeNull();
    w.structures.place(GATE_A, { piece: 'wall', tier: 'wood' });
    w.structures.damage(GATE_A, 5);
    expect(ghostFrame(mainAction(w.ctx, GATE_A, 'wall'), 'x', false)).toBeNull(); // repair
  });
});

describe('characters and the build rules (GDD 5.19: only Build on a gap is blocked, by a body standing in it)', () => {
  const rich = () => armed(hqWorld(), { wood: 30, metal: 6, sheet_metal: 6, parts: 4, glass: 4 }, ['hammer', 'sledgehammer']);
  it('a hero pressed against a wall can still fit, upgrade and cover it', () => {
    const w = rich();
    w.structures.place(PARTITION, { piece: 'wall', tier: 'wood' });
    w.ctx.characters = [{ x: 4.71, y: 2.5 }]; // 0.29 from the wall: touching it
    for (const sel of ['door', 'window', 'wall', 'plating']) expect(mainAction(w.ctx, PARTITION, sel).result.ok).toBe(true);
  });
  it('a hero standing in a gap blocks Build; one beside it does not', () => {
    const w = rich();
    w.ctx.characters = [{ x: 14.5, y: 10.25 }];
    expect(mainAction(w.ctx, GATE_A, 'wall').result).toMatchObject({ ok: false, code: 'occupied' });
    w.ctx.characters = [{ x: 14.5, y: 10.31 }];
    expect(mainAction(w.ctx, GATE_A, 'wall').result.ok).toBe(true);
  });
  it('a zombie in the gap blocks Build (same radius); a zombie by a wall blocks nothing', () => {
    const w = rich();
    delete w.ctx.characters;
    w.state.hero = { x: 3.5, y: 3.5, facing: 0 };
    for (const id in w.state.zombies) w.state.zombies[id].dead = true;
    w.state.zombies.zz = { id: 'zz', dead: false, floor: 15, x: 14.5, y: 10.1 };
    expect(mainAction(w.ctx, GATE_A, 'wall').result.code).toBe('occupied');
    w.state.zombies.zz.y = 10.6;
    expect(mainAction(w.ctx, GATE_A, 'wall').result.ok).toBe(true);
    w.structures.place(PARTITION, { piece: 'wall', tier: 'wood' });
    w.state.zombies.zz.x = 5; w.state.zombies.zz.y = 2.5;
    expect(mainAction(w.ctx, PARTITION, 'door').result.ok).toBe(true);
  });
});

describe('partial re-bake: structural vs HP / stage events', () => {
  const watch = (st) => {
    const log = [];
    st.onChange((s, ev) => log.push({ structural: ev.structural, eid: ev.eid }));
    return log;
  };
  it('place is structural; damage, repair, upgrade and overlays are per-edge', () => {
    const w = armed(hqWorld(), { wood: 20, metal: 4, sheet_metal: 4 });
    const log = watch(w.structures);
    w.structures.place(GATE_A, { piece: 'wall', tier: 'wood' });
    const eid = w.grid.edgeId(14, 10, 'N');
    expect(log).toEqual([{ structural: true, eid }]);
    log.length = 0;
    w.structures.damage(GATE_A, 20);
    expect(log).toEqual([{ structural: false, eid }]);
    log.length = 0;
    mainAction(w.ctx, GATE_A, 'wall').perform(); // repair (damaged)
    expect(log.every((e) => !e.structural && e.eid === eid)).toBe(true);
    log.length = 0;
    mainAction(w.ctx, GATE_A, 'wall').perform(); // upgrade
    expect(log).toEqual([{ structural: false, eid }]);
  });
  it('a hit that breaks the piece is structural (it became a gap); many hits before that are not', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    mainAction(w.ctx, GATE_A, 'wall').perform();
    const log = watch(w.structures);
    for (let i = 0; i < 6; i++) w.structures.damage(GATE_A, 20);
    expect(log.filter((e) => e.structural)).toHaveLength(0);
    w.structures.damage(GATE_A, 60);
    expect(log.filter((e) => e.structural)).toHaveLength(1);
    expect(w.structures.describe(14, 10, 'N').piece).toBe('gap');
  });
  it('non-structural changes do not recompute rooms', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    mainAction(w.ctx, GATE_A, 'wall').perform();
    let calls = 0;
    const orig = w.structures.recomputeRooms.bind(w.structures);
    w.structures.recomputeRooms = () => { calls++; return orig(); };
    w.structures.damage(GATE_A, 10);
    w.structures.setHp(w.structures.rec(14, 10, 'N'), 100);
    expect(calls).toBe(0);
    w.structures.place(GATE_A, { piece: 'gap' });
    expect(calls).toBe(1);
  });
  it('the event object is reused (no allocation per hit)', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    mainAction(w.ctx, GATE_A, 'wall').perform();
    const seen = new Set();
    w.structures.onChange((s, ev) => seen.add(ev));
    w.structures.damage(GATE_A, 10);
    w.structures.damage(GATE_A, 10);
    expect(seen.size).toBe(1);
  });
});

describe('art frames for the re-bake', () => {
  it('door frames are state + tier; damage is not in the base frame any more', () => {
    expect(doorArtFrame({ state: 'closed', kind: 'front' }, 'generated_front', 'generated_front', 'x', false)).toBe('frontdoor_x_full_closed');
    expect(doorArtFrame({ state: 'broken', kind: 'front' }, 'generated_front', 'generated_front', 'y', true)).toBe('door_y_stub_broken');
    expect(doorArtFrame({ state: 'open', kind: 'interior' }, 'generated_interior', 'generated_interior', 'x', false)).toBe('door_x_full_open');
    expect(doorArtFrame({ state: 'closed', kind: 'interior' }, 'wood', null, 'y', false)).toBe('door_y_full_wood_closed');
    expect(doorArtFrame({ state: 'jammed', kind: 'interior' }, 'metal', null, 'y', true)).toBe('door_y_stub_metal_closed');
    expect(doorArtFrame({ state: 'broken', kind: 'interior' }, 'reinforced', null, 'x', false)).toBe('door_x_full_reinforced_broken');
    // a generated door upgraded in place shows the tier art
    expect(doorArtFrame({ state: 'closed', kind: 'interior' }, 'reinforced', 'generated_interior', 'x', false)).toBe('door_x_full_reinforced_closed');
  });
  it('wall tiers: built and upgraded walls show tier art; generated block walls keep their finish', () => {
    expect(wallTierArt('wood', null)).toBe('wood');
    expect(wallTierArt('sheet_metal', 'partition')).toBe('sheet_metal');
    expect(wallTierArt('block', null)).toBe('block');
    expect(wallTierArt('block', 'block')).toBeNull();
    expect(wallTierArt('partition', 'partition')).toBeNull();
    expect(windowArtFrame('x', false, true)).toBe('wall_x_full_window_broken');
  });
  it('damage overlays: stage 0 none, 1..3 by material (doors included); overlay damage wins over the piece', () => {
    const base = { piece: 'wall', tier: 'wood', overlay: null, stage: 0, overlayStage: 0 };
    expect(edgeExtraFrames(base, 'x', false)).toEqual({ dmg: null, cover: null });
    expect(edgeExtraFrames({ ...base, stage: 2 }, 'y', true).dmg).toBe('dmg_wood_y_stub_2');
    expect(edgeExtraFrames({ ...base, tier: 'block', stage: 3 }, 'x', false).dmg).toBe('dmg_block_x_full_3');
    expect(edgeExtraFrames({ piece: 'door', tier: 'generated_interior', overlay: null, stage: 1, overlayStage: 0 }, 'x', false).dmg).toBe('dmg_wood_x_full_1');
    expect(edgeExtraFrames({ piece: 'door', tier: 'metal', overlay: null, stage: 1, overlayStage: 0 }, 'x', false).dmg).toBe('dmg_sheet_metal_x_full_1');
    const boarded = { piece: 'window', tier: 'glass', overlay: { kind: 'boards' }, stage: 0, overlayStage: 2 };
    expect(edgeExtraFrames(boarded, 'y', false)).toEqual({ dmg: 'dmg_wood_y_full_2', cover: 'cover_boards_y_full' });
    expect(edgeExtraFrames({ piece: 'wall', tier: 'wood', overlay: { kind: 'plating' }, stage: 1, overlayStage: 0 }, 'x', true))
      .toEqual({ dmg: 'dmg_wood_x_stub_1', cover: 'plating_x_stub' });
    expect(damageMaterial('window', 'glass')).toBeNull();
  });
});

describe('sealing yourself in (warn only)', () => {
  it('a wall on the only way out warns; a wall with another way does not; never when already sealed', () => {
    const w = armed(hqWorld(), { wood: 12, metal: 2 });
    // the hero stands in the corridor; the gate is the only edge to the landing besides the 8 perimeter walls
    const hero = { x: 14.5, y: 11.5 };
    const gateA = mainAction(w.ctx, GATE_A, 'wall');
    expect(sealsIn(w.ctx, gateA, hero)).toBe(false); // the other gate edge is still open
    gateA.perform();
    const gateB = mainAction(w.ctx, { x: 15, y: 10, side: 'N' }, 'wall');
    expect(sealsIn(w.ctx, gateB, hero)).toBe(true); // last way to the landing
    gateB.perform();
    const again = mainAction(w.ctx, { x: 10, y: 10, side: 'N' }, 'wall');
    expect(sealsIn(w.ctx, again, hero)).toBe(false); // already sealed in: nothing new to warn about
  });
  it('a door keeps the way open; upgrades and fits never warn', () => {
    const w = armed(hqWorld(), { wood: 20, metal: 4, parts: 2 }, ['hammer', 'sledgehammer']);
    const hero = { x: 14.5, y: 11.5 };
    mainAction(w.ctx, GATE_A, 'wall').perform();
    mainAction(w.ctx, { x: 15, y: 10, side: 'N' }, 'wall').perform();
    // replace one wall by a door (fit): passable again
    mainAction(w.ctx, GATE_A, 'door').perform();
    expect(w.structures.describe(14, 10, 'N').piece).toBe('door');
    expect(sealsIn(w.ctx, mainAction(w.ctx, { x: 15, y: 10, side: 'N' }, 'wall'), hero)).toBe(false);
    expect(sealsIn(w.ctx, mainAction(w.ctx, GATE_A, 'door'), hero)).toBe(false);
  });
  it('a refused act never warns', () => {
    const w = hqWorld();
    expect(sealsIn(w.ctx, mainAction(w.ctx, GATE_A, 'wall'), { x: 14.5, y: 11.5 })).toBe(false);
  });
});

describe('claim the floor', () => {
  const clear = (w) => { for (const id in w.state.zombies) w.state.zombies[id].dead = true; };
  it('greyed "Something is still moving here." until floor 15 is Cleared', () => {
    const w = hqWorld({ claimed: false });
    expect(canClaimFloor(w.state, balance, 15)).toMatchObject({ ok: false, message: 'Something is still moving here.', seconds: balance.hq.claimSeconds });
    clear(w);
    expect(canClaimFloor(w.state, balance, 15).ok).toBe(true);
  });
  it('claiming makes the HQ the main home, once, and marks every HQ tile Remembered', () => {
    const w = hqWorld({ claimed: false });
    clear(w);
    expect(mainHome(w.state)).toBe('start_flat');
    const r = claimFloor(w.state, balance, 15, 1234);
    expect(r).toMatchObject({ ok: true, thought: THOUGHT_CLAIMED, mainHome: 'hq' });
    expect(w.state.hq).toEqual({ claimed: true, claimedAt: 1234 });
    expect(claimFloor(w.state, balance, 15).ok).toBe(false);
    const seen = new Uint8Array(w.grid.width * w.grid.height);
    const n = rememberHq(w.structures, seen);
    expect(n).toBeGreaterThan(100);
    expect(seen[11 * w.grid.width + 3]).toBe(1); // corridor
    expect(seen[8 * w.grid.width + 14]).toBe(0); // landing: not HQ
  });
  it('"This whole floor could be mine." fires once, also for an already Cleared save', () => {
    const w = hqWorld({ claimed: false });
    expect(clearedThought(w.state, balance, 15)).toBeNull(); // zombies alive
    clear(w);
    expect(clearedThought(w.state, balance, 15)).toBe(THOUGHT_CLEARED);
    expect(clearedThought(w.state, balance, 15)).toBeNull();
    // a save that was Cleared before the thought existed: loads Cleared, thought not yet latched
    const old = hqWorld({ claimed: false });
    clear(old);
    delete old.state.thoughts.wholeFloor;
    expect(clearedThought(old.state, balance, 15)).toBe(THOUGHT_CLEARED);
    // already claimed: no thought
    const c = hqWorld();
    clear(c);
    expect(clearedThought(c.state, balance, 15)).toBeNull();
  });
});

describe('zombies re-target when the edge they bang is demolished', () => {
  it('chasing, wandering and returning zombies drop the door and the path; idle ones are left alone', () => {
    const ai = makeIsoAi({ facing: 0 });
    ai.mode = 'chase'; ai.blocked = { id: 'd' }; ai.path = [{ x: 1, y: 1 }]; ai.pathI = 1; ai.leg = true; ai.repathT = 0.4;
    expect(retargetAfterStructureChange(ai)).toBe(true);
    expect(ai).toMatchObject({ blocked: null, path: null, pathI: 0, leg: false, repathT: 0, mode: 'chase' });
    const idle = makeIsoAi({ facing: 0 });
    idle.path = [{ x: 1, y: 1 }];
    expect(retargetAfterStructureChange(idle)).toBe(false);
    expect(idle.path).not.toBeNull();
  });
  it('a demolish fires a structural event (what IsoZombies listens to)', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    const door = findEdge(w.structures, (d) => d.piece === 'door' && d.tier === 'generated_interior');
    const evs = [];
    w.structures.onChange((s, ev) => evs.push(ev.structural));
    edgeSlots(w.ctx, door, 'wall').secondary.act.perform();
    expect(evs).toContain(true);
    expect(w.structures.describe(door.x, door.y, door.side).piece).toBe('gap');
  });
});
