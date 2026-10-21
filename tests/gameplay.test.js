import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { towerData, makeTower } from './helpers/tower.js';
import lootData from '../public/data/levels/loot.json';
import { seededRng } from '../src/gameplay/rng.js';
import {
  createSlots, addItem, removeItem, countItem, moveAll, stackLimit, fitCount, normalizeSlots,
} from '../src/gameplay/inventory.js';
import { rollLoot } from '../src/gameplay/loot.js';
import { resolveYield, dismantleSpec, noiseRadius, spendToolUse, energyTimeMult } from '../src/gameplay/salvage.js';
import { tickNeeds, applyItem, initNeeds } from '../src/gameplay/needs.js';
import { catchUp, pickAutoUseItem } from '../src/gameplay/offline.js';
import { buildTower, roomAt, homeSpot, floorAtY, floorLineY } from '../src/gameplay/layout.js';
import { limitWalk, planRoute, stepToward } from '../src/gameplay/routing.js';
import { createGameState, normalizeGameState, heroCtx, takeFromPile } from '../src/gameplay/gameState.js';
import { listActions, buildSpec, completeAction } from '../src/gameplay/actions.js';

const tower = makeTower(balance);
const tables = lootData.tables;
const fresh = () => createGameState(balance, tower, 1000);

describe('inventory', () => {
  it('stacks by item kind and reports leftovers', () => {
    const s = createSlots(2);
    expect(stackLimit('wood', balance)).toBe(20);
    expect(stackLimit('canned_food', balance)).toBe(10);
    expect(stackLimit('crowbar', balance)).toBe(1);
    expect(addItem(s, 'wood', 25, balance)).toBe(0);
    expect(s[0].qty).toBe(20);
    expect(addItem(s, 'wood', 30, balance)).toBe(15);
    expect(fitCount(s, 'metal', 5, balance)).toBe(0);
  });
  it('tools get uses and never stack', () => {
    const s = createSlots(3);
    addItem(s, 'crowbar', 2, balance);
    expect(s.filter(Boolean).length).toBe(2);
    expect(s[0].uses).toBe(balance.salvage.toolUses);
  });
  it('removes and counts', () => {
    const s = createSlots(2);
    addItem(s, 'metal', 5, balance);
    expect(removeItem(s, 'metal', 3)).toBe(3);
    expect(countItem(s, 'metal')).toBe(2);
    expect(removeItem(s, 'metal', 9)).toBe(2);
    expect(s[0]).toBe(null);
  });
  it('moveAll keeps quest items and what does not fit', () => {
    const a = createSlots(3); const b = createSlots(1);
    addItem(a, 'medical_bag', 1, balance);
    addItem(a, 'wood', 3, balance);
    addItem(a, 'metal', 3, balance);
    moveAll(a, b, balance);
    expect(countItem(b, 'wood') + countItem(b, 'metal')).toBe(3);
    expect(countItem(a, 'medical_bag')).toBe(1);
    expect(a.filter(Boolean).length).toBe(2);
  });
});

describe('loot', () => {
  it('fixedLoot without rolls gives only the fixed list', () => {
    const p = { fixedLoot: [{ id: 'canned_food', qty: 2 }] };
    const def = balance.objects.fridge;
    expect(rollLoot(p, def, tables, balance, seededRng(1))).toEqual([{ id: 'canned_food', qty: 2 }]);
  });
  it('fixedLoot with rolls adds rolls', () => {
    const p = { fixedLoot: [{ id: 'duct_tape', qty: 2 }], rolls: [1, 1] };
    const out = rollLoot(p, balance.objects.toolbox, tables, balance, seededRng(5));
    expect(out.reduce((n, e) => n + e.qty, 0)).toBeGreaterThanOrEqual(3);
  });
  it('no fixedLoot uses scavenge.lootRolls and is deterministic', () => {
    const p = {};
    const a = rollLoot(p, balance.objects.kitchen_cupboard, tables, balance, seededRng(9));
    const b = rollLoot(p, balance.objects.kitchen_cupboard, tables, balance, seededRng(9));
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(balance.scavenge.lootRolls[1]); // 0-2 rolls
  });
});

describe('salvage', () => {
  it('spec by size, low-energy slowdown, unsearched +search', () => {
    expect(dismantleSpec(balance.objects.table, 100, false, balance)).toEqual({ seconds: 4, energy: 2 });
    expect(dismantleSpec(balance.objects.table, 10, false, balance).seconds).toBe(6);
    expect(dismantleSpec(balance.objects.fridge, 100, true, balance)).toEqual({ seconds: 8 + balance.scavenge.searchSeconds, energy: 5 }); // large + a 3 s search
    expect(energyTimeMult(50, balance)).toBe(1);
  });
  it('noise radius', () => {
    expect(noiseRadius('quiet', balance)).toBe(0);
    expect(noiseRadius('noisy', balance)).toBe(400);
    expect(noiseRadius('loud', balance)).toBe(Infinity);
  });
  it('chance yield respects rng', () => {
    const def = balance.objects.potted_plant;
    expect(resolveYield(def, () => 0.1)).toEqual([{ id: 'plastic', qty: 1 }, { id: 'seeds', qty: 1 }]);
    expect(resolveYield(def, () => 0.9)).toEqual([{ id: 'plastic', qty: 1 }]);
  });
  it('tools lose a use and break at 0', () => {
    const s = createSlots(2);
    addItem(s, 'wrench', 1, balance);
    s[0].uses = 2;
    expect(spendToolUse(s, 'wrench')).toEqual({ broke: false, usesLeft: 1 });
    expect(spendToolUse(s, 'wrench').broke).toBe(true);
    expect(s[0]).toBe(null);
    expect(spendToolUse(s, 'wrench')).toBe(null);
  });
});

describe('needs', () => {
  it('drains per hour', () => {
    const n = initNeeds(balance);
    tickNeeds(n, 3600, {}, balance);
    expect(n.food).toBeCloseTo(77); expect(n.water).toBeCloseTo(76);
    expect(n.energy).toBeCloseTo(94); expect(n.morale).toBeCloseTo(59);
  });
  it('sleep restores energy', () => {
    const n = { ...initNeeds(balance), energy: 50 };
    tickNeeds(n, 3600, { sleeping: true }, balance);
    expect(n.energy).toBeCloseTo(75);
  });
  it('empty needs cost health, regen otherwise', () => {
    const n = { ...initNeeds(balance), food: 0, health: 50 };
    tickNeeds(n, 3600, {}, balance);
    expect(n.health).toBeCloseTo(45);
    const m = { ...initNeeds(balance), health: 50 };
    tickNeeds(m, 3600, {}, balance);
    expect(m.health).toBeCloseTo(50 + balance.needs.health.regen);
  });
  it('items: food, dirty water cost, Mara bandage, not-needed refusal', () => {
    const n = { ...initNeeds(balance), food: 50, water: 50, health: 50 };
    applyItem(n, 'canned_food', balance);
    expect(n.food).toBe(80);
    applyItem(n, 'dirty_water', balance);
    expect(n.water).toBe(70); expect(n.health).toBe(42);
    applyItem(n, 'bandage', balance, { bandageMult: 1.5 });
    expect(n.health).toBe(64);
    expect(applyItem({ ...initNeeds(balance), food: 100 }, 'canned_food', balance).ok).toBe(false);
  });
});

describe('offline catch-up', () => {
  const mk = () => ({ needs: initNeeds(balance), stockpile: createSlots(40) });
  it('runs in steps and drains', () => {
    const st = mk();
    const r = catchUp(st, 3 * 3600 * 1000, balance);
    expect(r.steps).toBe(18);
    expect(st.needs.food).toBeCloseTo(71);
  });
  it('auto-uses stockpile below threshold, smallest first', () => {
    const st = mk();
    st.needs.food = 41; st.needs.water = 41;
    addItem(st.stockpile, 'canned_food', 2, balance);
    addItem(st.stockpile, 'dry_snack', 1, balance);
    addItem(st.stockpile, 'water_bottle', 1, balance);
    addItem(st.stockpile, 'dirty_water', 1, balance);
    expect(pickAutoUseItem(st.stockpile, 'food', balance)).toBe('dry_snack');
    const r = catchUp(st, 2 * 3600 * 1000, balance);
    expect(r.used.dry_snack).toBe(1);
    expect(st.needs.food).toBeGreaterThan(35);
  });
  it('never kills: health floors at 10', () => {
    const st = mk();
    st.needs.food = 0; st.needs.water = 0;
    catchUp(st, 12 * 3600 * 1000, balance);
    expect(st.needs.health).toBe(balance.needs.offlineHealthFloor);
  });
  it('does not raise health already below the floor', () => {
    const st = mk(); st.needs.health = 4; st.needs.food = 0;
    catchUp(st, 3600 * 1000, balance);
    expect(st.needs.health).toBe(4);
  });
  it('runs step hooks', () => {
    let n = 0;
    catchUp(mk(), 25 * 60 * 1000, balance, { stepHooks: [() => n++] });
    expect(n).toBe(3);
  });
});

describe('tower layout and routing', () => {
  it('indexes home and rooms from data', () => {
    expect(tower.home.id).toBe('f15L');
    expect(roomAt(tower, 15, 1100).room.id).toBe('living');
    expect(roomAt(tower, 15, 600).room.id).toBe('kitchen');
    expect(roomAt(tower, 15, 480).room.id).toBe('kitchen'); // boundary -> first room (lower x)
    expect(roomAt(tower, 15, 1560)).toBe(null); // the stairwell landing is no room
    expect(roomAt(tower, 15, 2000).room.id).toBe('living'); // right flat
    expect(homeSpot(tower)).toEqual({ floor: 15, x: 408 }); // at the start flat's bed
  });
  it('floor <-> y', () => {
    expect(floorAtY(tower, floorLineY(tower, 14) - 5)).toBe(14);
    expect(floorAtY(tower, 0)).toBe(null);
  });
  it('jammed doors block walking in both directions', () => {
    const doors = { f15L: { state: 'open' }, f15R: { state: 'jammed' } };
    const r = limitWalk(tower, doors, 15, 1560, 2500);
    expect(r.blockedDoor.id).toBe('f15R');
    expect(r.x).toBe(1638);
    expect(limitWalk(tower, doors, 15, 1560, 900).blockedDoor).toBe(null);
    expect(limitWalk(tower, doors, 15, 2500, 1560).x).toBe(1722);
    expect(limitWalk(tower, doors, 15, 1500, 1600).x).toBe(1600);
  });
  it('plans stairs route', () => {
    const steps = planRoute(tower, { floor: 15, x: 300 }, { floor: 13, x: 500 });
    expect(steps.map((s) => s.type)).toEqual(['walk', 'stairs', 'walk']);
    expect(steps[0].x).toBe(tower.stairwell.entryX);
    expect(planRoute(tower, { floor: 15, x: 1 }, { floor: 15, x: 9 }).length).toBe(1);
  });
  it('stepToward does not overshoot', () => {
    expect(stepToward(0, 10, 120, 1)).toBe(10);
    expect(stepToward(0, 1000, 120, 0.5)).toBe(60);
  });
});

describe('game state and actions', () => {
  it('new state starts home with home rooms entered', () => {
    const s = fresh();
    expect(s.hero.floor).toBe(15);
    expect(s.rooms['f15L:kitchen']).toBe(true);
    expect(s.doors.f15R.state).toBe('jammed');
    expect(s.doors['f13L-door3'].state).toBe('jammed'); // Mara's bathroom door
  });
  it('normalize repairs partial saves', () => {
    const s = normalizeGameState({ hero: { floor: 99, x: 1 }, needs: { food: 12 } }, balance, tower, 5);
    expect(s.hero.floor).toBe(15);
    expect(s.needs.food).toBe(12);
    expect(s.needs.water).toBe(80);
    expect(s.inventory.length).toBe(balance.inventory.carrySlots);
  });
  it('Steady hands only when Mara recruited and alive', () => {
    const s = fresh();
    expect(heroCtx(s, balance).bandageMult).toBe(1);
    s.survivors.mara = { recruited: true };
    expect(heroCtx(s, balance).bandageMult).toBe(1.5);
    s.survivors.mara.dead = true;
    expect(heroCtx(s, balance).bandageMult).toBe(1);
  });
  it('lists actions with tool gating', () => {
    const s = fresh();
    const acts = listActions(balance.objects.wardrobe, 'w', s, balance);
    expect(acts.map((a) => a.kind)).toEqual(['search', 'dismantle']);
    expect(acts[1].enabled).toBe(false);
    expect(acts[1].reason).toBe('Needs crowbar');
    addItem(s.inventory, 'crowbar', 1, balance);
    expect(listActions(balance.objects.wardrobe, 'w', s, balance)[1].enabled).toBe(true);
    expect(listActions(balance.objects.chair, 'c', s, balance).length).toBe(1);
  });
  it('search home fridge gives fixed loot once', () => {
    const s = fresh();
    const pl = tower.objects.get('f15L-2-floor0');
    const def = balance.objects.fridge;
    const spec = buildSpec('search', def, 'f15L-2-floor0', s, balance);
    const r = completeAction(s, spec, pl.placement, def, { balance, tables, rng: seededRng(1), loc: { floor: 15, x: pl.placement.x } });
    expect(countItem(s.inventory, 'canned_food')).toBe(1);
    expect(s.objects['f15L-2-floor0'].searched).toBe(true);
    expect(r.gained).toEqual([{ id: 'canned_food', qty: 1 }]);
    expect(s.needs.energy).toBe(99);
    expect(listActions(def, 'f15L-2-floor0', s, balance).map((a) => a.kind)).toEqual(['dismantle']);
  });
  it('dismantle with full inventory drops a pile, pile can be picked up', () => {
    const s = fresh();
    for (let i = 0; i < balance.inventory.carrySlots; i++) addItem(s.inventory, 'chemicals', 20, balance);
    const def = balance.objects.table;
    const spec = buildSpec('dismantle', def, 't', s, balance);
    const r = completeAction(s, spec, { x: 270 }, def, { balance, tables, rng: seededRng(1), loc: { floor: 15, x: 270 } });
    expect(r.piled).toEqual([{ id: 'wood', qty: 4 }]);
    expect(s.piles.length).toBe(1);
    expect(s.stats.objectsSalvaged).toBe(1);
    s.inventory[0] = null;
    expect(takeFromPile(s, s.piles[0], balance)).toEqual([{ id: 'wood', qty: 4 }]);
    expect(s.piles.length).toBe(0);
  });
  it('dismantling an unsearched container also searches it; tool use spent', () => {
    const s = fresh();
    addItem(s.inventory, 'crowbar', 1, balance);
    const def = balance.objects.wardrobe;
    const pl = { id: 'w' };
    const spec = buildSpec('dismantle', def, 'w', s, balance);
    expect(spec.seconds).toBe(8 + balance.scavenge.searchSeconds);
    completeAction(s, spec, pl, def, { balance, tables, rng: seededRng(3), loc: { floor: 14, x: 100 } });
    expect(s.objects.w.searched).toBe(true);
    expect(countItem(s.inventory, 'wood')).toBe(6);
    expect(s.inventory.find((x) => x?.id === 'crowbar').uses).toBe(19);
  });
  it('drain with wrench', () => {
    const s = fresh();
    addItem(s.inventory, 'wrench', 1, balance);
    const def = balance.objects.water_heater;
    expect(listActions(def, 'h', s, balance)[0].enabled).toBe(true);
    const spec = buildSpec('drain', def, 'h', s, balance);
    completeAction(s, spec, {}, def, { balance, tables, rng: Math.random, loc: { floor: 13, x: 5 } });
    expect(countItem(s.inventory, 'dirty_water')).toBe(6);
    expect(listActions(def, 'h', s, balance).map((a) => a.kind)).toEqual(['dismantle']);
  });
});

import { hitJammedDoor } from '../src/gameplay/routing.js';
import { formatDuration, reportLines } from '../src/gameplay/report.js';

describe('jammed doors and report', () => {
  it('opens after jammedDoorHits hits', () => {
    const d = { state: 'jammed', hits: 0 };
    expect(hitJammedDoor(d, balance).opened).toBe(false);
    hitJammedDoor(d, balance);
    expect(hitJammedDoor(d, balance).opened).toBe(true);
    expect(d.state).toBe('open');
  });
  it('formats durations and report lines', () => {
    expect(formatDuration(30000)).toBe('less than a minute');
    expect(formatDuration(3.5 * 3600000)).toBe('3 h 30 min');
    const st = { needs: initNeeds(balance), stockpile: createSlots(40) };
    const r = catchUp(st, 3600000, balance);
    const lines = reportLines(r, balance, true);
    expect(lines).toContain('You slept.');
    expect(lines.join(' ')).not.toMatch(/\d|->/); // prose: no need numbers
  });
});

describe('review fixes', () => {
  it('jammed door only blocks walks that reach the door', () => {
    const jam = { f15R: { state: 'jammed', hits: 0 } };
    expect(limitWalk(tower, jam, 15, 1560, 1670).blockedDoor).toBe(null);
    expect(limitWalk(tower, jam, 15, 1560, 1680).blockedDoor?.id).toBe('f15R');
  });
  it('normalizeSlots never trims filled slots and drops unknown ids', () => {
    const raw = createSlots(50); raw[45] = { id: 'wood', qty: 3 }; raw[2] = { id: 'zzz', qty: 1 };
    const out = normalizeSlots(raw, 40, balance.items);
    expect(out.length).toBe(46);
    expect(out[45].qty).toBe(3);
    expect(out[2]).toBe(null);
    expect(normalizeSlots(createSlots(60), 40, balance.items).length).toBe(40);
  });
  it('comfort items are a last resort when the need is critical', () => {
    const st = createSlots(4); addItem(st, 'chocolate', 1, balance);
    expect(pickAutoUseItem(st, 'food', balance, 35)).toBe(null);
    expect(pickAutoUseItem(st, 'food', balance, 10)).toBe('chocolate');
  });
  it('awake catch-up has no sleep regen and no auto-use', () => {
    const st = { needs: { ...initNeeds(balance), energy: 50 }, stockpile: createSlots(40) };
    addItem(st.stockpile, 'canned_food', 1, balance);
    st.needs.food = 10;
    catchUp(st, 3600 * 1000, balance, { awake: true });
    expect(st.needs.energy).toBeLessThan(50);
    expect(countItem(st.stockpile, 'canned_food')).toBe(1);
  });
  it('state migrations and unknown piles', () => {
    const s = normalizeGameState({ piles: [{ id: 'p', floor: 15, x: 5, items: [{ id: 'nope', qty: 1 }] }], stockpile: createSlots(45).map((_, i) => (i === 44 ? { id: 'wood', qty: 1 } : null)) }, balance, tower, 1);
    expect(s.piles.length).toBe(0);
    expect(s.stockpile.length).toBe(45);
  });
});
