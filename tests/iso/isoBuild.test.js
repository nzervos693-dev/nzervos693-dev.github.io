import { describe, it, expect } from 'vitest';
import { hqWorld, stock, giveTool, have, findEdge, balance } from './hqHelpers.js';
import {
  BUILD_CODE as C, canBuild, build, canUpgrade, upgrade, canFit, fit, canAddOverlay, addOverlay, canRepair, repair,
  canDemolish, demolish, mainAction, secondaryAction,
} from '../../src/gameplay/isoBuild.js';
import { damageStage } from '../../src/gameplay/isoStructures.js';
import { findPath } from '../../src/iso/path.js';
import { VisionMap, visionConfig } from '../../src/iso/vision.js';
import { EDGE } from '../../src/iso/grid.js';

const GATE_A = { x: 14, y: 10, side: 'N' };
const GATE_B = { x: 15, y: 10, side: 'N' };
const PARTITION = { x: 5, y: 2, side: 'W' }; // NW bedroom | hallway
const BLOCK = { x: 3, y: 10, side: 'N' }; // NW kitchen | corridor
const PERIM = { x: 12, y: 10, side: 'N' };

const armed = (w, items = {}, tools = ['hammer']) => { for (const t of tools) giveTool(w.state, t); stock(w.state, items); return w; };

describe('edge model', () => {
  it('derives kinds and tiers from the plan and balance', () => {
    const { structures: st } = hqWorld();
    expect(st.describe(14, 10, 'N')).toMatchObject({ kind: 'gate', piece: 'gap' });
    expect(st.describe(12, 10, 'N')).toMatchObject({ kind: 'perimeter', piece: 'wall', tier: 'block', hp: 600, maxHp: 600 });
    expect(st.describe(5, 2, 'W')).toMatchObject({ kind: 'partition', tier: 'partition', hp: 80 });
    expect(st.describe(3, 10, 'N')).toMatchObject({ kind: 'block', tier: 'block' });
    expect(st.describe(0, 5, 'W').kind).toBe('exterior');
    expect(findEdge(st, (d) => d.kind === 'shaft' && d.piece === 'wall')).not.toBeNull();
    expect(findEdge(st, (d) => d.piece === 'door' && d.tier === 'generated_front')).not.toBeNull();
    expect(st.describe(0, 2, 'W')).toMatchObject({ piece: 'window', tier: 'exterior' });
  });
  it('damage stage 0-3 from hp and structures.damageStages (all pieces alike)', () => {
    const w = balance.structures.damageStages;
    expect(w).toEqual([0.75, 0.5, 0.25]);
    expect(damageStage(150, 150, w)).toBe(0);
    expect(damageStage(112, 150, w)).toBe(1);
    expect(damageStage(75, 150, w)).toBe(2);
    expect(damageStage(37, 150, w)).toBe(3);
    expect(damageStage(1, 150, w)).toBe(3);
    const e = findEdge(hqWorld().structures, (d) => d.piece === 'door' && d.tier === 'generated_interior');
    const hw = hqWorld();
    hw.structures.damage(e, 31); // 60 hp door: 29/60 < 0.5
    expect(hw.structures.describe(e.x, e.y, e.side).stage).toBe(2);
  });
  it('stage follows hp through damage()', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    build(w.ctx, GATE_A);
    expect(w.structures.describe(14, 10, 'N').stage).toBe(0);
    w.structures.damage(GATE_A, 40);
    expect(w.structures.describe(14, 10, 'N')).toMatchObject({ hp: 110, stage: 1 });
    w.structures.damage(GATE_A, 80);
    expect(w.structures.describe(14, 10, 'N').stage).toBe(3);
    expect(w.structures.damage(GATE_A, 100).destroyed).toBe(true);
    expect(w.structures.describe(14, 10, 'N').piece).toBe('gap');
  });
  it('edges onto void tiles are void edges, immutable like shaft edges; out-of-range input is safe', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 }, ['hammer', 'sledgehammer']);
    const st = w.structures;
    const e = { x: 18, y: 6, side: 'W' }; // landing | void column
    expect(st.describe(18, 6, 'W')).toMatchObject({ kind: 'void', piece: 'wall' });
    expect(canDemolish(w.ctx, e).code).toBe('shaft_wall');
    expect(canUpgrade(w.ctx, e).code).toBe('shaft_wall');
    expect(canAddOverlay(w.ctx, e, 'plating').code).toBe('shaft_wall');
    expect(st.rec(-5, 99, 'N')).toBeNull();
    expect(st.kindOf(-5, 99, 'W')).toBe('none');
    expect(st.damage({ x: 400, y: 2, side: 'N' }, 5).hit).toBe('none');
  });
  it('exterior and shaft edges take no damage', () => {
    const { structures: st } = hqWorld();
    expect(st.damage({ x: 0, y: 5, side: 'W' }, 999).hit).toBe('none');
  });
});

describe('build', () => {
  it('builds a wood wall on a gap: materials out, rooms and grid update', () => {
    const w = armed(hqWorld(), { wood: 7, metal: 2 });
    const v0 = w.grid.version;
    const r = build(w.ctx, GATE_A);
    expect(r).toMatchObject({ ok: true, code: 'ok', toTier: 'wood', seconds: 6, energy: 2, noise: 'noisy', noiseTiles: balance.salvage.noiseRadiusTiles });
    expect(have(w.state, 'wood')).toBe(1);
    expect(have(w.state, 'metal')).toBe(1);
    expect(w.grid.edgeType(14, 10, 'N')).toBe(EDGE.WALL);
    expect(w.structures.describe(14, 10, 'N')).toMatchObject({ piece: 'wall', tier: 'wood', hp: 150 });
    expect(w.grid.version).toBeGreaterThan(v0);
  });
  it('canBuild does not mutate', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    const r = canBuild(w.ctx, GATE_A);
    expect(r.ok).toBe(true);
    expect(r.cost).toEqual([{ id: 'wood', qty: 6 }, { id: 'metal', qty: 1 }]);
    expect(have(w.state, 'wood')).toBe(6);
    expect(w.structures.describe(14, 10, 'N').piece).toBe('gap');
  });
  it('no_materials names one missing material; materials come from the stockpile too', () => {
    const w = armed(hqWorld(), { wood: 3 });
    const r = canBuild(w.ctx, GATE_A);
    expect(r).toMatchObject({ code: 'no_materials', message: 'Needs 6 wood', missing: { id: 'wood', qty: 6, have: 3 } });
    stock(w.state, { wood: 3, metal: 1 }, 'stockpile');
    expect(build(w.ctx, GATE_A).ok).toBe(true);
    expect(have(w.state, 'wood')).toBe(0);
  });
  it('needs_tool without a hammer; nothing consumed on any refusal', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 }, []);
    const r = build(w.ctx, GATE_A);
    expect(r).toMatchObject({ code: 'needs_tool', needTool: ['hammer'], message: 'Needs hammer' });
    expect(have(w.state, 'wood')).toBe(6);
  });
  it('refuses outside floor 15', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    w.structures.floor.number = 14;
    expect(canBuild(w.ctx, GATE_A).code).toBe('not_floor15');
  });
  it('refuses before the HQ is claimed', () => {
    const w = armed(hqWorld({ claimed: false }), { wood: 6, metal: 1 });
    expect(canBuild(w.ctx, GATE_A).code).toBe('not_hq');
  });
  it('refuses a non-gap, void and out-of-grid edges, shaft and exterior', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    expect(canBuild(w.ctx, PARTITION).code).toBe('wrong_target');
    expect(canBuild(w.ctx, { x: 99, y: 99, side: 'N' }).code).toBe('no_edge');
    expect(canBuild(w.ctx, { x: 14, y: 2, side: 'N' }).code).toBe('no_edge'); // inside the elevator shaft void
    const shaft = findEdge(w.structures, (d) => d.kind === 'shaft' && d.piece === 'wall');
    expect(canBuild(w.ctx, shaft).code).toBe('shaft_wall');
    expect(canBuild(w.ctx, { x: 0, y: 5, side: 'W' }).code).toBe('exterior_wall');
  });
  it('occupied when a character centre is within 0.4 tiles of the edge, or a footprint straddles it', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    w.ctx.characters = [{ x: 14.5, y: 10.3 }];
    expect(canBuild(w.ctx, GATE_A).code).toBe('occupied');
    w.ctx.characters = [{ x: 14.5, y: 10.5 }];
    expect(canBuild(w.ctx, GATE_A).ok).toBe(true);
    const o = { id: 'bed', blocks: true, tiles: [{ x: 14, y: 9 }, { x: 14, y: 10 }] };
    w.structures.floor.objects = [o];
    expect(canBuild(w.ctx, GATE_A).code).toBe('occupied');
  });
  it('occupied by a wall-mounted object that is not dismantled yet', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 });
    w.structures.floor.objects = [{ id: 'cab', mounted: true, tile: [14, 10], facing: 'S' }]; // hangs on its N wall
    expect(canBuild(w.ctx, GATE_A).code).toBe('occupied');
    w.state.objects.cab = { dismantled: true };
    expect(canBuild(w.ctx, GATE_A).ok).toBe(true);
  });
  it('building a wall splits a room and closes the path; vision is blocked', () => {
    const w = armed(hqWorld(), { wood: 12, metal: 2 });
    const from = { x: 14, y: 8 };
    const to = { x: 14, y: 11 };
    expect(findPath(w.grid, from, to).found).toBe(true);
    const cfg = visionConfig(balance);
    const vm = new VisionMap(w.grid.width, w.grid.height);
    const view = { x: 14.5, y: 9.5, facing: 90 };
    vm.update(w.grid, cfg, view);
    expect(vm.isVisible(14, 11)).toBe(true);
    build(w.ctx, GATE_A);
    build(w.ctx, GATE_B);
    expect(findPath(w.grid, from, to).found).toBe(false);
    expect(vm.maybeUpdate(w.grid, cfg, view, 1e6)).toBe(true); // grid.version moved
    expect(vm.isVisible(14, 11)).toBe(false);
    demolish(armed(w, {}, ['sledgehammer']).ctx, GATE_A);
    demolish(w.ctx, GATE_B);
    expect(findPath(w.grid, from, to).found).toBe(true);
    vm.maybeUpdate(w.grid, cfg, view, 2e6);
    expect(vm.isVisible(14, 11)).toBe(true);
  });
});

describe('upgrade', () => {
  it('wood -> sheet metal -> block, one tier at a time, cost per tier, no refund, full new hp', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 4, sheet_metal: 3, concrete_block: 5 });
    build(w.ctx, GATE_A);
    w.structures.damage(GATE_A, 100);
    let r = upgrade(w.ctx, GATE_A);
    expect(r).toMatchObject({ ok: true, toTier: 'sheet_metal', seconds: 8 });
    expect(w.structures.describe(14, 10, 'N')).toMatchObject({ tier: 'sheet_metal', hp: 320 });
    expect(have(w.state, 'sheet_metal')).toBe(0);
    expect(have(w.state, 'metal')).toBe(2);
    expect(canUpgrade(w.ctx, GATE_A)).toMatchObject({ code: 'no_materials', message: 'Needs 6 concrete block' });
    stock(w.state, { concrete_block: 1 });
    r = upgrade(w.ctx, GATE_A);
    expect(r).toMatchObject({ ok: true, toTier: 'block' });
    expect(w.structures.describe(14, 10, 'N').hp).toBe(600);
    expect(canUpgrade(w.ctx, GATE_A).code).toBe('max_tier');
  });
  it('partition goes straight to sheet metal', () => {
    const w = armed(hqWorld(), { sheet_metal: 3, metal: 1 });
    expect(upgrade(w.ctx, PARTITION)).toMatchObject({ ok: true, toTier: 'sheet_metal' });
  });
  it('perimeter block wall is already top tier', () => {
    const w = armed(hqWorld(), { concrete_block: 5, metal: 1 });
    expect(canUpgrade(w.ctx, PERIM).code).toBe('max_tier');
  });
  it('door tiers: generated -> reinforced -> metal; keeps state and id', () => {
    const w = armed(hqWorld(), { sheet_metal: 6, metal: 1, parts: 2 });
    const e = findEdge(w.structures, (d) => d.piece === 'door' && d.tier === 'generated_interior');
    const door = w.grid.doorAt(e.x, e.y, e.side);
    door.state = 'open';
    expect(upgrade(w.ctx, e)).toMatchObject({ ok: true, toTier: 'reinforced' });
    expect(w.grid.doorAt(e.x, e.y, e.side)).toBe(door);
    expect(door).toMatchObject({ tier: 'reinforced', hp: 250, maxHp: 250, state: 'open' });
    expect(upgrade(w.ctx, e)).toMatchObject({ ok: true, toTier: 'metal' });
    expect(canUpgrade(w.ctx, e).code).toBe('max_tier');
  });
  it('wrong target on gap and window; shaft refused', () => {
    const w = armed(hqWorld());
    expect(canUpgrade(w.ctx, GATE_A).code).toBe('wrong_target');
    expect(canUpgrade(w.ctx, { x: 0, y: 2, side: 'W' }).code).toBe('exterior_wall');
  });
});

describe('fit door / window', () => {
  it('fits a wood door into a block wall: needs hammer AND sledgehammer, refund 2 blocks, door usable', () => {
    const w = armed(hqWorld(), { wood: 5, metal: 1, parts: 1 });
    expect(canFit(w.ctx, BLOCK, 'door')).toMatchObject({ code: 'needs_tool', needTool: ['sledgehammer'] });
    giveTool(w.state, 'sledgehammer');
    const r = fit(w.ctx, BLOCK, 'door');
    expect(r).toMatchObject({ ok: true, toTier: 'wood', seconds: 6, salvage: [{ id: 'concrete_block', qty: 2 }] });
    expect(have(w.state, 'concrete_block')).toBe(2);
    expect(have(w.state, 'wood')).toBe(0);
    expect(w.structures.describe(3, 10, 'N')).toMatchObject({ piece: 'door', tier: 'wood', hp: 100 });
    expect(w.grid.doorAt(3, 10, 'N')).toMatchObject({ state: 'closed', tier: 'wood' });
    expect(w.floor.doors).toContain(w.grid.doorAt(3, 10, 'N'));
    expect(findPath(w.grid, { x: 3, y: 9 }, { x: 3, y: 11 }, { mode: 'hero' }).found).toBe(true);
  });
  it('wood wall refund is half the build cost rounded down; partition refunds nothing', () => {
    const w = armed(hqWorld(), { wood: 20, metal: 3, parts: 2, glass: 2 }, ['hammer', 'sledgehammer']);
    build(w.ctx, GATE_A);
    const r = fit(w.ctx, GATE_A, 'door');
    expect(r.salvage).toEqual([{ id: 'wood', qty: 3 }]);
    const p = canFit(w.ctx, PARTITION, 'window');
    expect(p.ok).toBe(true);
    expect(p.salvage).toEqual([]);
    expect(p.toTier).toBe('glass');
  });
  it('fits a glass window; glass passes sight but blocks movement', () => {
    const w = armed(hqWorld(), { glass: 2, wood: 2 }, ['hammer', 'sledgehammer']);
    const cfg = visionConfig(balance);
    const vm = new VisionMap(w.grid.width, w.grid.height);
    const view = { x: 3.5, y: 9.5, facing: 90 };
    vm.update(w.grid, cfg, view);
    expect(vm.isVisible(3, 11)).toBe(false);
    expect(fit(w.ctx, BLOCK, 'window').ok).toBe(true);
    expect(w.grid.edgeType(3, 10, 'N')).toBe(EDGE.WINDOW);
    expect(w.grid.edgeBlocksSight(w.grid.edgeId(3, 10, 'N'))).toBe(false);
    expect(w.grid.moveClass(w.grid.edgeId(3, 10, 'N'))).toBe(1);
    vm.update(w.grid, cfg, view);
    expect(vm.isVisible(3, 11)).toBe(true);
  });
  it('refusals: gap needs a wall, perimeter, exterior, door target, tools', () => {
    const w = armed(hqWorld(), { wood: 5, metal: 1, parts: 1 }, ['hammer', 'sledgehammer']);
    expect(canFit(w.ctx, GATE_A, 'door').code).toBe('needs_wall');
    expect(canFit(w.ctx, PERIM, 'door').code).toBe('landing_wall_reinforce_only');
    expect(canFit(w.ctx, { x: 0, y: 5, side: 'W' }, 'window').code).toBe('exterior_wall');
    const door = findEdge(w.structures, (d) => d.piece === 'door');
    expect(canFit(w.ctx, door, 'door').code).toBe('wrong_target');
    expect(canFit(w.ctx, PARTITION, 'barricade').code).toBe('wrong_target');
    w.ctx.characters = [{ x: 4.9, y: 2.5 }];
    expect(canFit(w.ctx, PARTITION, 'door').code).toBe('occupied');
  });
});

describe('overlays', () => {
  const windowWorld = () => {
    const w = armed(hqWorld(), { glass: 2, wood: 12, sheet_metal: 4, parts: 2 }, ['hammer', 'sledgehammer']);
    fit(w.ctx, BLOCK, 'window');
    return w;
  };
  it('boards on a window block sight; one overlay per edge', () => {
    const w = windowWorld();
    expect(addOverlay(w.ctx, BLOCK, 'boards')).toMatchObject({ ok: true, seconds: 3 });
    expect(w.structures.describe(3, 10, 'N').overlay).toMatchObject({ kind: 'boards', hp: 80 });
    expect(w.grid.edgeBlocksSight(w.grid.edgeId(3, 10, 'N'))).toBe(true);
    expect(canAddOverlay(w.ctx, BLOCK, 'plating').code).toBe('already_covered');
  });
  it('plating fits walls, doors and windows; boards only windows', () => {
    const w = windowWorld();
    expect(canAddOverlay(w.ctx, PARTITION, 'boards').code).toBe('wrong_target');
    expect(addOverlay(w.ctx, PARTITION, 'plating')).toMatchObject({ ok: true, consumed: [{ id: 'sheet_metal', qty: 2 }, { id: 'parts', qty: 1 }] });
    expect(canAddOverlay(w.ctx, GATE_A, 'boards').code).toBe('nothing_to_cover');
    expect(canAddOverlay(w.ctx, PARTITION, 'barricade').code).toBe('unsupported'); // barricades come in a later piece
  });
  it('plating on a perimeter wall works; exterior window takes overlays, exterior wall does not', () => {
    const w = armed(hqWorld(), { sheet_metal: 2, parts: 1, wood: 3 });
    expect(addOverlay(w.ctx, PERIM, 'plating').ok).toBe(true);
    expect(addOverlay(w.ctx, { x: 0, y: 2, side: 'W' }, 'boards').ok).toBe(true);
    expect(canAddOverlay(w.ctx, { x: 0, y: 5, side: 'W' }, 'plating').code).toBe('exterior_wall');
  });
  it('overlay takes damage first and is gone at 0', () => {
    const w = windowWorld();
    addOverlay(w.ctx, BLOCK, 'boards');
    w.structures.damage(BLOCK, 50);
    expect(w.structures.describe(3, 10, 'N')).toMatchObject({ hp: 30, overlay: { hp: 30 } });
    expect(w.structures.describe(3, 10, 'N').overlayStage).toBeGreaterThan(0);
    w.structures.damage(BLOCK, 50);
    expect(w.structures.describe(3, 10, 'N').overlay).toBeNull();
    expect(w.grid.edgeBlocksSight(w.grid.edgeId(3, 10, 'N'))).toBe(false);
  });
  it('glass shatters at 0 hp: loud, see-through, cannot be repaired', () => {
    const w = windowWorld();
    const r = w.structures.damage(BLOCK, 30);
    expect(r).toMatchObject({ destroyed: true, noise: 'loud' });
    expect(w.structures.describe(3, 10, 'N').broken).toBe(true);
    expect(canRepair(w.ctx, BLOCK).code).toBe('cannot_repair');
    expect(demolish(w.ctx, BLOCK).salvage).toEqual([{ id: 'wood', qty: 1 }]);
  });
});

describe('repair', () => {
  it('one unit restores hpPerUnit up to full, 2 s, noisy, overlay first', () => {
    const w = armed(hqWorld(), { wood: 10, metal: 1, sheet_metal: 3, parts: 1 });
    build(w.ctx, GATE_A);
    w.structures.damage(GATE_A, 60);
    const r = repair(w.ctx, GATE_A);
    expect(r).toMatchObject({ ok: true, seconds: 2, noise: 'noisy', energy: 2, target: 'piece', consumed: [{ id: 'wood', qty: 1 }] });
    expect(w.structures.describe(14, 10, 'N').hp).toBe(110);
    repair(w.ctx, GATE_A); repair(w.ctx, GATE_A);
    expect(w.structures.describe(14, 10, 'N').hp).toBe(150);
    expect(canRepair(w.ctx, GATE_A).code).toBe('full_hp');
    addOverlay(w.ctx, PERIM, 'plating');
    w.structures.damage(PERIM, 100);
    expect(canRepair(w.ctx, PERIM)).toMatchObject({ ok: true, target: 'overlay', cost: [{ id: 'sheet_metal', qty: 1 }] });
  });
  it('refusals: gap, tool, material', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 }, []);
    expect(canRepair(w.ctx, GATE_A).code).toBe('nothing_here');
    giveTool(w.state, 'hammer');
    build(w.ctx, GATE_A);
    w.structures.damage(GATE_A, 10);
    have(w.state, 'wood');
    expect(canRepair(w.ctx, GATE_A)).toMatchObject({ code: 'no_materials', message: 'Needs 1 wood' });
    w.state.inventory = w.state.inventory.map((s) => (s && s.id === 'hammer' ? null : s));
    expect(canRepair(w.ctx, GATE_A).code).toBe('needs_tool');
  });
  it('a broken generated door cannot be repaired', () => {
    const w = armed(hqWorld(), { wood: 2 });
    const e = findEdge(w.structures, (d) => d.piece === 'door' && d.tier === 'generated_interior');
    w.structures.damage(e, 999);
    expect(w.structures.describe(e.x, e.y, e.side).broken).toBe(true);
    expect(canRepair(w.ctx, e).code).toBe('broken');
    expect(canUpgrade(w.ctx, e).code).toBe('broken');
  });
});

describe('demolish', () => {
  it('sledgehammer: gap at once, yield in the bag, 1 use of 30, loud, 3 energy', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    const r = demolish(w.ctx, PARTITION);
    expect(r).toMatchObject({ ok: true, seconds: 6, energy: 3, noise: 'loud', noiseTiles: Infinity, tool: 'sledgehammer', salvage: [{ id: 'wood', qty: 1 }, { id: 'metal', qty: 1 }] });
    expect(have(w.state, 'wood')).toBe(1);
    expect(have(w.state, 'metal')).toBe(1);
    expect(w.structures.describe(5, 2, 'W').piece).toBe('gap');
    expect(w.grid.edgeType(5, 2, 'W')).toBe(EDGE.NONE);
    expect(w.state.inventory.find((s) => s?.id === 'sledgehammer').uses).toBe(balance.build.sledgehammerUses - 1);
  });
  it('merges spaces: rooms recomputed', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    const st = w.structures;
    expect(st.roomOf(4, 2)).not.toBe(st.roomOf(5, 2));
    demolish(w.ctx, PARTITION);
    expect(st.roomOf(4, 2)).toBe(st.roomOf(5, 2));
    expect(st.roomTiles(4, 2).length).toBeGreaterThan(40);
    expect(findPath(w.grid, { x: 4, y: 2 }, { x: 5, y: 2 }).path.length).toBe(2);
  });
  it('block wall costs 5 energy, 14 s, yields 4 blocks (stack of 5 fits)', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    const r = demolish(w.ctx, BLOCK);
    expect(r).toMatchObject({ ok: true, seconds: 14, energy: 5, salvage: [{ id: 'concrete_block', qty: 4 }], dropped: [] });
    expect(have(w.state, 'concrete_block')).toBe(4);
  });
  it('works before the HQ claim (demolish is allowed anywhere on floor 15)', () => {
    const w = armed(hqWorld({ claimed: false }), {}, ['sledgehammer']);
    expect(demolish(w.ctx, PARTITION).ok).toBe(true);
  });
  it('gate-built wall can be demolished; perimeter, exterior and shaft never', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 }, ['hammer', 'sledgehammer']);
    build(w.ctx, GATE_A);
    expect(demolish(w.ctx, GATE_A).ok).toBe(true);
    expect(canDemolish(w.ctx, PERIM)).toMatchObject({ code: 'landing_wall_reinforce_only', message: 'Load-bearing. Leave it.' });
    expect(canDemolish(w.ctx, { x: 12, y: 6, side: 'W' }).code).toBe('landing_wall_reinforce_only');
    expect(canDemolish(w.ctx, { x: 0, y: 5, side: 'W' }).code).toBe('exterior_wall');
    expect(canDemolish(w.ctx, { x: 0, y: 2, side: 'W' }).code).toBe('exterior_wall');
    const shaft = findEdge(w.structures, (d) => d.kind === 'shaft' && d.piece === 'wall');
    expect(canDemolish(w.ctx, shaft).code).toBe('shaft_wall');
    expect(w.structures.describe(12, 10, 'N').piece).toBe('wall');
  });
  it('plating on a perimeter wall comes off, the wall stays', () => {
    const w = armed(hqWorld(), { sheet_metal: 2, parts: 1 }, ['hammer', 'sledgehammer']);
    addOverlay(w.ctx, PERIM, 'plating');
    expect(demolish(w.ctx, PERIM)).toMatchObject({ ok: true, target: 'overlay', salvage: [{ id: 'sheet_metal', qty: 1 }], seconds: 6 });
    expect(w.structures.describe(12, 10, 'N')).toMatchObject({ piece: 'wall', overlay: null });
    expect(canDemolish(w.ctx, PERIM).code).toBe('landing_wall_reinforce_only');
  });
  it('needs a tool; fire axe only for partition, wood walls, doors, windows, boards (x1.5, 5 durability)', () => {
    const w = armed(hqWorld(), { wood: 6, metal: 1 }, []);
    expect(canDemolish(w.ctx, PARTITION)).toMatchObject({ code: 'needs_tool', message: 'Needs sledgehammer' });
    giveTool(w.state, 'fire_axe');
    const r = canDemolish(w.ctx, PARTITION);
    expect(r).toMatchObject({ ok: true, tool: 'fire_axe', seconds: 9 });
    expect(canDemolish(w.ctx, BLOCK).code).toBe('needs_tool'); // block walls: sledgehammer only
    demolish(w.ctx, PARTITION);
    expect(w.state.inventory.find((s) => s?.id === 'fire_axe').uses).toBe(balance.combat.weapons.fire_axe.durability - 5);
    expect(canDemolish(w.ctx, GATE_A).code).toBe('nothing_here');
  });
  it('sledgehammer breaks after its last use and is reported', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    w.state.inventory.find((s) => s?.id === 'sledgehammer').uses = 1;
    const r = demolish(w.ctx, PARTITION);
    expect(r.toolBroke).toBe('sledgehammer');
    expect(w.state.inventory.some((s) => s?.id === 'sledgehammer')).toBe(false);
  });
  it('overflow of the yield drops as a pile on the hero tile', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    w.state.inventory = w.state.inventory.map((s) => s ?? { id: 'rock', qty: 1 }); // jam every free slot
    const r = demolish(w.ctx, PARTITION);
    expect(r.dropped.length).toBe(2);
    expect(w.state.piles.length).toBe(1);
    expect(w.state.piles[0].items).toEqual(expect.arrayContaining([{ id: 'wood', qty: 1 }]));
  });
  it('overlay comes off first, then the piece; a door demolished leaves a gap and leaves floor.doors', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    const e = findEdge(w.structures, (d) => d.piece === 'door' && d.tier === 'generated_interior');
    const door = w.grid.doorAt(e.x, e.y, e.side);
    expect(demolish(w.ctx, e).salvage).toEqual([{ id: 'wood', qty: 5 }, { id: 'metal', qty: 1 }]);
    expect(w.grid.doorAt(e.x, e.y, e.side)).toBeNull();
    expect(w.floor.doors).not.toContain(door);
    expect(w.grid.edgeType(e.x, e.y, e.side)).toBe(EDGE.NONE);
  });
  it('mounted object on the wall blocks demolition until dismantled', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    w.structures.floor.objects = [{ id: 'cab', mounted: true, tile: [5, 2], facing: 'E' }]; // faces E, hangs on the W wall of (5,2)
    expect(canDemolish(w.ctx, PARTITION).code).toBe('occupied');
  });
});

describe('broken perimeter wall (CD rule: rebuild, never remove)', () => {
  const breach = (extra = {}) => {
    const w = armed(hqWorld(), { wood: 6, metal: 4, sheet_metal: 3, concrete_block: 6, ...extra }, ['hammer', 'sledgehammer']);
    w.structures.place(PERIM, { piece: 'gap' }); // a zombie broke it
    return w;
  };
  it('a gap on the perimeter takes a normal wood wall (same cost, time, hammer), then upgrades back to block', () => {
    const w = breach();
    expect(w.structures.describe(12, 10, 'N')).toMatchObject({ kind: 'perimeter', piece: 'gap' });
    expect(canBuild(w.ctx, PERIM)).toMatchObject({ ok: true, toTier: 'wood', seconds: 6, cost: [{ id: 'wood', qty: 6 }, { id: 'metal', qty: 1 }] });
    expect(build(w.ctx, PERIM).ok).toBe(true);
    expect(upgrade(w.ctx, PERIM)).toMatchObject({ ok: true, toTier: 'sheet_metal' });
    expect(upgrade(w.ctx, PERIM)).toMatchObject({ ok: true, toTier: 'block' });
    expect(w.structures.describe(12, 10, 'N')).toMatchObject({ tier: 'block', hp: 600 });
  });
  it('a zombie in the breach blocks the build; hammer needed', () => {
    const w = breach();
    w.ctx.characters = [{ x: 12.5, y: 10.1 }];
    expect(canBuild(w.ctx, PERIM).code).toBe('occupied');
    w.ctx.characters = [];
    w.state.inventory = w.state.inventory.map((s) => (s?.id === 'hammer' ? null : s));
    expect(canBuild(w.ctx, PERIM).code).toBe('needs_tool');
  });
  it('the rebuilt wall can still never be demolished or fitted', () => {
    const w = breach();
    build(w.ctx, PERIM);
    expect(canDemolish(w.ctx, PERIM).code).toBe('landing_wall_reinforce_only');
    expect(canFit(w.ctx, PERIM, 'door').code).toBe('landing_wall_reinforce_only');
    expect(canFit(w.ctx, PERIM, 'window').code).toBe('landing_wall_reinforce_only');
  });
});

describe('barricades and tool wear', () => {
  const frontDoor = (w) => w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
  it('a barricade is demolished first (overlay timing, no yield), clears the home barricade, then the door', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    const d = frontDoor(w);
    const e = { x: d.x, y: d.y, side: d.side };
    w.grid.setBarricade(d, { own: true, hp: 100 });
    w.state.build.barricade = { level: 1, hp: 100 };
    const c = canDemolish(w.ctx, e);
    expect(c).toMatchObject({ ok: true, target: 'overlay', overlayKind: 'barricade', seconds: balance.structures.overlays.barricade.demolishSeconds, salvage: [] });
    const r = demolish(w.ctx, e);
    expect(r.ok).toBe(true);
    expect(d.barricade).toBeNull();
    expect(w.state.build.barricade).toEqual({ level: 0, hp: 0 });
    expect(w.grid.doorAt(d.x, d.y, d.side)).toBe(d); // the door itself is still there
    expect(canDemolish(w.ctx, e)).toMatchObject({ ok: true, target: 'piece' });
    expect(demolish(w.ctx, e).ok).toBe(true);
    expect(w.grid.doorAt(d.x, d.y, d.side)).toBeNull();
  });
  it('a barricade at 0 hp does not count', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    const d = frontDoor(w);
    w.grid.setBarricade(d, { own: true, hp: 0 });
    expect(canDemolish(w.ctx, { x: d.x, y: d.y, side: d.side }).target).toBe('piece');
  });
  it('sledgehammer wear comes from build.sledgehammerUsesPerDemolish and ...PerFit', () => {
    const w = armed(hqWorld(), { wood: 5, metal: 1, parts: 1 }, ['hammer', 'sledgehammer']);
    const sl = () => w.state.inventory.find((s) => s?.id === 'sledgehammer');
    const saved = { ...balance.build };
    balance.build.sledgehammerUsesPerDemolish = 3;
    balance.build.sledgehammerUsesPerFit = 2;
    try {
      const before = sl().uses;
      fit(w.ctx, PARTITION, 'door');
      expect(sl().uses).toBe(before - 2);
      demolish(w.ctx, BLOCK);
      expect(sl().uses).toBe(before - 5);
      sl().uses = 2;
      expect(fit(armed(w, { glass: 2, wood: 2 }).ctx, { x: 5, y: 3, side: 'W' }, 'window').toolBroke).toBe('sledgehammer');
    } finally { Object.assign(balance.build, saved); }
  });
  it('a refused action wears nothing', () => {
    const w = armed(hqWorld(), {}, ['sledgehammer']);
    const before = w.state.inventory.find((s) => s?.id === 'sledgehammer').uses;
    demolish(w.ctx, PERIM);
    expect(w.state.inventory.find((s) => s?.id === 'sledgehammer').uses).toBe(before);
  });
});

describe('Main / Secondary logic (GDD 5.19 rules 1-7)', () => {
  it('follows the rule order', () => {
    const w = armed(hqWorld(), { wood: 20, metal: 4, glass: 2, parts: 2, sheet_metal: 3 }, ['hammer', 'sledgehammer']);
    expect(mainAction(w.ctx, GATE_A, 'wall').action).toBe('build');
    expect(mainAction(w.ctx, GATE_A, 'door').result.code).toBe('needs_wall');
    expect(mainAction(w.ctx, GATE_A, 'boards').result.code).toBe('nothing_to_cover');
    build(w.ctx, GATE_A);
    expect(mainAction(w.ctx, GATE_A, 'wall').action).toBe('upgrade');
    expect(mainAction(w.ctx, GATE_A, 'door').action).toBe('fit');
    expect(mainAction(w.ctx, GATE_A, 'plating').action).toBe('overlay');
    expect(mainAction(w.ctx, GATE_A, 'boards').result.code).toBe('wrong_target');
    w.structures.damage(GATE_A, 5);
    expect(mainAction(w.ctx, GATE_A, 'door').action).toBe('repair');
    repair(w.ctx, GATE_A);
    const m = mainAction(w.ctx, GATE_A, 'door');
    m.perform();
    expect(mainAction(w.ctx, GATE_A, 'door').action).toBe('upgrade');
    expect(mainAction(w.ctx, GATE_A, 'wall').result.code).toBe('wrong_target');
    expect(mainAction(w.ctx, { x: 99, y: 0, side: 'N' }, 'wall').result.code).toBe('no_edge');
    expect(secondaryAction(w.ctx, GATE_A).result.ok).toBe(true);
  });
});
