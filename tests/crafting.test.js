import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { towerData, makeTower } from './helpers/tower.js';
import { createGameState, normalizeGameState } from '../src/gameplay/gameState.js';
import { addItem, countItem } from '../src/gameplay/inventory.js';
import {
  recipeRows, recipeGroups, LATER_STAGE_EFFECTS, paginateRows, craftCheck, performCraft, effectText, haveCount, costLines, recipeKind,
} from '../src/gameplay/crafting.js';
import {
  homeSpots, freeSpots, dismantleRefund, builtActions, useBuilt, secureFloor, clearedFloors, survivorBeds, spotKey,
} from '../src/gameplay/building.js';
import {
  buildBarricade, damageBarricade, repairBarricade, barricadeDefense, barricadeUp, barricadeBlock,
} from '../src/gameplay/barricade.js';
import { advanceProducer, tickProducers, tenderMult, productionLines, intervalSeconds } from '../src/gameplay/producers.js';
import { atHome } from '../src/gameplay/buildSpots.js';
import { getDefense } from '../src/gameplay/defense.js';
import { zombieId, barricadeInside, movementBounds, makeAi, stepZombie, makeZombie, STEP_BARRICADE, STEP_ATTACK, zombieTuning, startChase } from '../src/gameplay/zombies.js';
import { catchUp } from '../src/gameplay/offline.js';
import { reportLines } from '../src/gameplay/report.js';
import { seededRng } from '../src/gameplay/rng.js';

const tower = makeTower(balance);
const fresh = () => createGameState(balance, tower, 1000);
const give = (s, id, n, where = 'inventory') => addItem(s[where], id, n, balance);
/** Clear the home floor's apartments and dismantle everything so every home build spot is usable. */
const unlock = (s) => {
  for (const apt of tower.apartments.values()) {
    if (apt.floor !== 15) continue;
    for (const o of apt.objects) s.objects[o.id] = { searched: true, dismantled: true };
    (apt.zombies || []).forEach((_, i) => { s.zombies[zombieId(apt, i)].dead = true; });
  }
};
/** Floor 13/14 zombies dead so a Cleared state is true. */
const killFloor = (s, n) => { for (const z of Object.values(s.zombies)) if (z.floor === n) z.dead = true; };
/** Stage 2 home spot keys: f15L spots are authored in tower_m2.json (start flat). */
const SP = {
  hall: '15:f15L-spot-hallway-floor0', living2: '15:f15L-spot-kitchen-floor1', kitchen1: '15:f15L-spot-kitchen-floor1',
  chair: '15:f15L-spot-living-floor0', table: '15:f15L-spot-living-floor1',
  win1: '15:f15L-spot-living-wall1', win2: '15:f15L-spot-bedroom-wall1',
};
const craft = (s, id, target) => performCraft(s, tower, balance, id, target);

describe('recipe list', () => {
  it('has the 14 M1 recipes grouped by use in panel order', () => {
    const groups = recipeGroups(balance);
    expect(groups.map((g) => g.use)).toEqual(['weapon', 'throwable', 'tool', 'medicine', 'water', 'food', 'defense', 'home']);
    expect(groups.flatMap((g) => g.ids)).toHaveLength(14);
    expect(recipeRows(balance).filter((r) => r.type === 'recipe')).toHaveLength(14);
  });
  it('pages never end on a group header and keep every row once', () => {
    const rows = recipeRows(balance);
    const pages = paginateRows(rows, 450, { group: 36, recipe: 96, gap: 6 });
    expect(pages.flat()).toEqual(rows);
    for (const p of pages) expect(p[p.length - 1].type).toBe('recipe');
    for (const p of pages) {
      const h = p.reduce((n, r) => n + (r.type === 'group' ? 36 : 96) + 6, 0);
      expect(h).toBeLessThanOrEqual(450);
    }
  });
  it('describes every recipe', () => {
    for (const id of Object.keys(balance.recipes).filter((r) => !LATER_STAGE_EFFECTS.includes(balance.recipes[r].effect?.type))) expect(effectText(balance, id).length).toBeGreaterThan(5);
  });
});

describe('craft checks', () => {
  it('reports missing materials, counting bag and stockpile', () => {
    const s = fresh();
    give(s, 'wood', 2); give(s, 'wood', 3, 'stockpile');
    expect(haveCount(s, 'wood')).toBe(5);
    expect(craftCheck(s, tower, balance, 'barricade_lv1')).toMatchObject({ ok: false, reason: 'Missing: 2 metal' });
    give(s, 'metal', 2, 'stockpile');
    expect(craftCheck(s, tower, balance, 'barricade_lv1').ok).toBe(true);
  });
  it('explains structural blocks first', () => {
    const s = fresh();
    expect(craftCheck(s, tower, balance, 'barricade_lv2').reason).toBe('Build Barricade Lv1 first');
    expect(craftCheck(s, tower, balance, 'barricade_repair').reason).toBe('No barricade to repair');
    expect(craftCheck(s, tower, balance, 'secure_floor').reason).toBe('No Cleared floor');
    expect(craftCheck(s, tower, balance, 'bandage').reason).toBe('Missing: 2 cloth');
    const lv2 = { ...balance, recipes: { ...balance.recipes, bandage: { ...balance.recipes.bandage, workbenchLevel: 2 } } };
    expect(craftCheck(s, tower, lv2, 'bandage').reason).toBe('Needs workbench Lv2');
  });
  it('kinds', () => {
    expect(recipeKind(balance.recipes.rain_collector)).toBe('place');
    expect(recipeKind(balance.recipes.survivor_bed)).toBe('place');
    expect(recipeKind(balance.recipes.barricade_lv1)).toBe('barricade');
    expect(recipeKind(balance.recipes.bandage)).toBe('item');
  });
});

describe('crafting items', () => {
  it('pays from the bag first, then the stockpile', () => {
    const s = fresh();
    give(s, 'cloth', 1); give(s, 'cloth', 3, 'stockpile');
    const r = craft(s, 'bandage');
    expect(r.ok).toBe(true);
    expect(countItem(s.inventory, 'cloth')).toBe(0);
    expect(countItem(s.stockpile, 'cloth')).toBe(2);
    expect(countItem(s.inventory, 'bandage')).toBe(1);
  });
  it('tools and weapons get their uses', () => {
    const s = fresh();
    give(s, 'metal', 3);
    craft(s, 'crowbar');
    expect(s.inventory.find((x) => x?.id === 'crowbar').uses).toBe(balance.salvage.toolUses);
  });
  it('a full bag sends the output to the stockpile, then to a pile', () => {
    const s = fresh();
    const slots = balance.inventory.carrySlots;
    for (let i = 0; i < slots - 1; i++) s.inventory[i] = { id: i % 2 ? 'wood' : 'metal', qty: 20 };
    s.inventory[slots - 1] = { id: 'cloth', qty: 5 }; // 3 left after paying: the slot stays taken
    let r = craft(s, 'bandage', { loc: { floor: 15, x: 200 } });
    expect(r.gained.stock).toEqual([{ id: 'bandage', qty: 1 }]);
    expect(countItem(s.stockpile, 'bandage')).toBe(1);
    s.stockpile.find((x) => x.id === 'bandage').qty = 10;
    s.stockpile.forEach((x, i) => { if (!x) s.stockpile[i] = { id: i % 2 ? 'wood' : 'metal', qty: 20 }; });
    r = craft(s, 'bandage', { loc: { floor: 15, x: 200 } });
    expect(r.gained.piled).toEqual([{ id: 'bandage', qty: 1 }]);
    expect(s.piles[0].items).toEqual([{ id: 'bandage', qty: 1 }]);
  });
  it('does not pay when blocked', () => {
    const s = fresh();
    give(s, 'wood', 3);
    expect(craft(s, 'spiked_bat').ok).toBe(false);
    expect(countItem(s.inventory, 'wood')).toBe(3);
  });
  it('purify water uses water items from the cost', () => {
    const s = fresh();
    give(s, 'chemicals', 1); give(s, 'dirty_water', 2);
    const r = craft(s, 'purify_water');
    expect(r.ok).toBe(true);
    expect(countItem(s.inventory, 'clean_water')).toBe(2);
    expect(costLines(s, balance.recipes.purify_water.cost).every((l) => !l.ok)).toBe(true);
  });
});

describe('build spots and placing', () => {
  it('the start flat lists 2 window and 5 floor spots (x 888 is taken by the workbench in practice; chair and table slots free once dismantled)', () => {
    const spots = homeSpots(tower, balance);
    expect(spots.filter((x) => x.apt === 'f15L' && x.kind === 'window').map((x) => x.x)).toEqual([1032, 312]);
    expect(spots.filter((x) => x.apt === 'f15L' && x.kind === 'floor').map((x) => x.x)).toEqual([1368, 1128, 1032, 888, 552]);
    expect(spots.find((x) => x.kind === 'floor').key).toBe(spotKey(15, 'f15L-spot-hallway-floor0'));
  });
  it('spots need their slot empty, and the other flat of floor 15 must be cleared', () => {
    const s = fresh();
    expect(homeSpots(tower, balance, s).map((x) => x.key).sort()).toEqual([SP.hall, SP.kitchen1, SP.win1, SP.win2].sort());
    s.objects['f15L-1-floor0'] = { dismantled: true }; // chair slot
    expect(homeSpots(tower, balance, s).map((x) => x.key)).toContain(SP.chair);
    s.objects['f15L-1-floor1'] = { dismantled: true };
    expect(homeSpots(tower, balance, s).map((x) => x.key)).toContain(SP.table);
    const base = homeSpots(tower, balance, s).length;
    // right flat: its crawler still lives, so none of its slots are spots yet
    s.zombies[zombieId(tower.apartments.get('f15R'), 0)].dead = false;
    expect(homeSpots(tower, balance, s)).toHaveLength(base);
    s.zombies[zombieId(tower.apartments.get('f15R'), 0)].dead = true;
    const more = homeSpots(tower, balance, s);
    expect(more.length).toBeGreaterThan(base); // every empty slot of f15R counts once cleared
    expect(more.some((x) => x.apt === 'f15R' && x.kind === 'window')).toBe(true); // the kids' room wall slot is empty
    s.zombies[zombieId(tower.apartments.get('f15R'), 0)].dead = false; // latched: cleared stays cleared
    expect(homeSpots(tower, balance, s)).toHaveLength(more.length);
  });
  it('home extends to the right flat of floor 15 once it is cleared', () => {
    const s = fresh();
    expect(atHome(tower, s, balance, 15, 900)).toBe(true);
    expect(atHome(tower, s, balance, 15, 2000)).toBe(false);
    unlock(s);
    expect(atHome(tower, s, balance, 15, 2000)).toBe(true);
    expect(atHome(tower, s, balance, 15, 1560)).toBe(false); // the landing is never home
    expect(atHome(tower, s, balance, 14, 2000)).toBe(false);
  });
  it('placed objects whose spot disappeared are refunded to the stockpile on load', () => {
    const s = fresh();
    s.build.spots['15:f15L-gone'] = { id: 'rain_collector', floor: 15, spot: 'f15L-gone', stored: 2, progress: 0, queue: 0 };
    const n = normalizeGameState(JSON.parse(JSON.stringify(s)), balance, tower, 2000);
    expect(n.build.spots['15:f15L-gone']).toBeUndefined();
    expect(countItem(n.stockpile, 'plastic')).toBe(1);
    expect(countItem(n.stockpile, 'metal')).toBe(1);
    expect(countItem(n.stockpile, 'clean_water')).toBe(2);
  });
  it('places a rain collector on a window spot only, pays once', () => {
    const s = fresh();
    unlock(s);
    give(s, 'plastic', 3); give(s, 'metal', 2);
    expect(craft(s, 'rain_collector', { spot: SP.hall })).toMatchObject({ ok: false, reason: 'Pick a free spot' });
    expect(countItem(s.inventory, 'plastic')).toBe(3);
    const r = craft(s, 'rain_collector', { spot: SP.win1 });
    expect(r.ok).toBe(true);
    expect(s.build.spots[SP.win1]).toMatchObject({ id: 'rain_collector', stored: 0 });
    expect(countItem(s.inventory, 'plastic')).toBe(0);
    expect(freeSpots(s, tower, balance, 'window').length).toBeGreaterThan(0);
  });
  it('is blocked when every spot of the kind is used', () => {
    const s = fresh();
    unlock(s);
    for (const sp of [SP.win1, SP.win2]) { give(s, 'plastic', 3); give(s, 'metal', 2); craft(s, 'rain_collector', { spot: sp }); }
    for (const sl of tower.apartments.get('f15R').slots.filter((x) => x.window)) { give(s, 'plastic', 3); give(s, 'metal', 2); craft(s, 'rain_collector', { spot: `15:${sl.id}` }); }
    give(s, 'plastic', 3); give(s, 'metal', 2);
    expect(craft(s, 'rain_collector', { spot: SP.win1 }).reason).toBe('No free spot');
  });
  it('survivor bed counts for piece 3b', () => {
    const s = fresh();
    unlock(s);
    give(s, 'wood', 6); give(s, 'cloth', 2);
    craft(s, 'survivor_bed', { spot: SP.living2 });
    expect(survivorBeds(s, balance)).toBe(1);
  });
  it('dismantle refunds 50% of the cost rounded down plus stored output', () => {
    const s = fresh();
    unlock(s);
    give(s, 'plastic', 3); give(s, 'metal', 2);
    craft(s, 'rain_collector', { spot: SP.win1 });
    s.build.spots[SP.win1].stored = 2;
    expect(dismantleRefund(s.build.spots[SP.win1], balance)).toEqual([
      { id: 'plastic', qty: 1 }, { id: 'metal', qty: 1 }, { id: 'clean_water', qty: 2 },
    ]);
    give(s, 'wood', 3); give(s, 'plastic', 1); give(s, 'seeds', 1);
    craft(s, 'planter', { spot: SP.living2 });
    expect(dismantleRefund(s.build.spots[SP.living2], balance)).toEqual([{ id: 'wood', qty: 1 }]);
  });
  it('survives save normalisation and drops unknown recipes', () => {
    const s = fresh();
    s.build.spots[SP.hall] = { id: 'nope' };
    const n = normalizeGameState(JSON.parse(JSON.stringify(s)), balance, tower, 2000);
    expect(n.build.spots[SP.hall]).toBeUndefined();
    expect(n.build.barricade).toEqual({ level: 0, hp: 0 });
    const old = normalizeGameState({ started: true }, balance, tower, 2000);
    expect(old.build.spots).toEqual({});
  });
});

describe('barricade', () => {
  it('Lv1 then Lv2 replaces it at full HP', () => {
    const s = fresh();
    give(s, 'wood', 15); give(s, 'metal', 7); give(s, 'duct_tape', 2);
    expect(craft(s, 'barricade_lv1').ok).toBe(true);
    expect(s.build.barricade).toEqual({ level: 1, hp: balance.barricade.levels[0].hp });
    expect(barricadeDefense(s, balance)).toBe(10);
    expect(craft(s, 'barricade_lv1').reason).toBe('Already built');
    damageBarricade(s, 30);
    expect(craft(s, 'barricade_lv2').ok).toBe(true);
    expect(s.build.barricade).toEqual({ level: 2, hp: 250 });
    expect(barricadeDefense(s, balance)).toBe(25);
    expect(barricadeBlock(s, balance, 2)).toBe('Already built');
  });
  it('broken gives no defense; repair works, 20 HP per wood, capped, greyed at full', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    expect(craft(s, 'barricade_repair').reason).toBe('Barricade is holding');
    expect(damageBarricade(s, 500)).toEqual({ hp: 0, broken: true });
    expect(damageBarricade(s, 5)).toEqual({ hp: 0, broken: false });
    expect(barricadeUp(s)).toBe(false);
    expect(barricadeDefense(s, balance)).toBe(0);
    give(s, 'wood', 10);
    expect(craft(s, 'barricade_repair')).toMatchObject({ ok: true, restored: 20 });
    expect(s.build.barricade.hp).toBe(20);
    expect(barricadeUp(s)).toBe(true);
    damageBarricade(s, 20 - 10); // 10 left
    s.build.barricade.hp = balance.barricade.levels[0].hp - 5;
    expect(repairBarricade(s, balance)).toBe(5);
    expect(countItem(s.inventory, 'wood')).toBe(9); // repairBarricade alone does not pay
  });
  it('tower puts the barricade on the home front door (x 1440), inside is the left', () => {
    expect(tower.barricadeX).toBe(1440);
    expect(tower.barricadeInside).toBe(-1);
    expect(tower.floors.get(15).stairwell.xMax).toBe(tower.stairwell.xMax);
  });
});

describe('zombies and the barricade (front door of the left home wing)', () => {
  const doors = { f15R: { state: 'jammed' } };
  const bar = (up) => ({ up, floor: 15, x: 1440, inside: -1 });
  it('is a wall for zombies on both sides while up, nothing when broken', () => {
    const out = { min: 0, max: 0 };
    movementBounds(tower, doors, 15, 1560, out, bar(true)); // on the landing (outside)
    expect(out.min).toBe(1452);
    movementBounds(tower, doors, 15, 1300, out, bar(true)); // inside the flat
    expect(out.max).toBe(1428);
    movementBounds(tower, doors, 15, 1560, out, bar(false));
    expect(out.min).toBeLessThan(1440);
    movementBounds(tower, doors, 14, 1560, out, bar(true));
    expect(out.min).toBeLessThan(1440);
  });
  function setup(up) {
    const types = balance.zombies.types;
    const env = {
      tower, doors: {}, heroFloor: 15, heroX: 1300, heroRoom: null, types, sightRadius: 200, attackRange: 30,
      tune: zombieTuning(balance), rng: seededRng(1), bounds: { min: 0, max: 0 }, barricade: bar(up),
    };
    const z = makeZombie('t', 'crawler', 15, 1560, balance);
    const ai = makeAi();
    startChase(ai, env.tune); // already hunting (an intact barricade blocks sight, so it cannot notice the hero through it)
    return { env, z, ai };
  }
  it('a chasing zombie stops at the barricade and hits it, never the hero', () => {
    const { env, z, ai } = setup(true);
    let barHits = 0; let heroHits = 0;
    for (let i = 0; i < 900; i++) {
      const f = stepZombie(z, ai, { ...env, heroX: 1420 }, 0.05);
      if (f & STEP_BARRICADE) barHits++;
      if (f & STEP_ATTACK) heroHits++;
    }
    expect(z.x).toBeCloseTo(1452, 0);
    expect(heroHits).toBe(0);
    expect(barHits).toBeGreaterThanOrEqual(8); // ~30 s at one hit per 2.5 s, after the windup and the walk
  });
  it('walks through once the barricade is down', () => {
    const { env, z, ai } = setup(false);
    for (let i = 0; i < 1200; i++) stepZombie(z, ai, env, 0.05);
    expect(z.x).toBeLessThan(1400);
  });
  it('a hero outside the barricade is bitten normally', () => {
    const { env, z, ai } = setup(true);
    let hero = 0;
    for (let i = 0; i < 100; i++) if (stepZombie(z, ai, { ...env, heroX: 1540 }, 0.05) & STEP_ATTACK) hero++;
    expect(hero).toBeGreaterThan(0);
  });
  it('the hero standing in the doorway counts as inside; an inside zombie is never blocked outward by a hit on it', () => {
    expect(barricadeInside(bar(true), 1440)).toBe(true);
    expect(barricadeInside(bar(true), 1441)).toBe(false);
    expect(barricadeInside(bar(true), 100)).toBe(true);
    expect(barricadeInside({ up: true, floor: 15, x: 1680, inside: 1 }, 1680)).toBe(true);
  });
});

describe('producers', () => {
  const rain = balance.recipes.rain_collector.effect;
  const rec = () => ({ id: 'rain_collector', stored: 0, progress: 0, queue: 0 });
  it('rain collector makes 1 per 3 h up to 4, then pauses', () => {
    const p = rec();
    expect(advanceProducer(p, rain, 3 * 3600 - 1).made).toBe(0);
    expect(advanceProducer(p, rain, 2).made).toBe(1);
    expect(advanceProducer(p, rain, 100 * 3600)).toMatchObject({ made: 3, full: true });
    expect(p.stored).toBe(4);
    p.stored = 3; // collected one: it restarts from scratch
    expect(advanceProducer(p, rain, 3 * 3600).made).toBe(1);
  });
  it('step size does not change the result', () => {
    const a = rec(); const b = rec();
    advanceProducer(a, rain, 7 * 3600);
    for (let i = 0; i < 42; i++) advanceProducer(b, rain, 600);
    expect(a.stored).toBe(b.stored);
    expect(a.progress).toBeCloseTo(b.progress, 3);
  });
  it('tender multiplier divides the interval', () => {
    const s = fresh();
    expect(tenderMult(s, balance)).toBe(1);
    s.survivors.mara = { recruited: true, dead: false, job: 'tender' };
    expect(tenderMult(s, balance)).toBe(1.5);
    expect(intervalSeconds(rain, 1.5)).toBe(2 * 3600);
    const p = rec();
    expect(advanceProducer(p, rain, 6 * 3600, { mult: 1.5 }).made).toBe(3);
    s.survivors.mara.dead = true;
    expect(tenderMult(s, balance)).toBe(1);
  });
  it('planter eats dirty water first and stalls without water', () => {
    const s = fresh();
    unlock(s);
    give(s, 'wood', 3); give(s, 'plastic', 1); give(s, 'seeds', 1);
    craft(s, 'planter', { spot: SP.hall });
    const p = s.build.spots[SP.hall];
    tickProducers(s, balance, 7 * 3600);
    expect(p.stored).toBe(0);
    expect(p.waiting).toBe(true);
    give(s, 'clean_water', 1, 'stockpile'); give(s, 'dirty_water', 1, 'stockpile');
    tickProducers(s, balance, 60);
    expect(p.stored).toBe(1);
    expect(countItem(s.stockpile, 'dirty_water')).toBe(0);
    expect(countItem(s.stockpile, 'clean_water')).toBe(1);
    tickProducers(s, balance, 6 * 3600);
    expect(p.stored).toBe(2);
    expect(countItem(s.stockpile, 'clean_water')).toBe(0);
  });
  it('water filter converts queued dirty water 1 per hour, queue of 6', () => {
    const s = fresh();
    unlock(s);
    give(s, 'plastic', 2); give(s, 'cloth', 2); give(s, 'parts', 1);
    craft(s, 'water_filter', { spot: SP.living2 });
    const p = s.build.spots[SP.living2];
    give(s, 'dirty_water', 4); give(s, 'dirty_water', 5, 'stockpile');
    const loc = { floor: 15, x: 200 };
    expect(builtActions(s, balance, p)[0]).toMatchObject({ kind: 'use', label: 'Load', enabled: true });
    const r = useBuilt(s, balance, p, loc);
    expect(r.loaded).toBe(6);
    expect(p.queue).toBe(6);
    expect(countItem(s.inventory, 'dirty_water')).toBe(0);
    expect(countItem(s.stockpile, 'dirty_water')).toBe(3);
    tickProducers(s, balance, 3.5 * 3600);
    expect(p.stored).toBe(3);
    expect(p.queue).toBe(3);
    const r2 = useBuilt(s, balance, p, loc);
    expect(r2.collected).toMatchObject({ id: 'clean_water', qty: 3 });
    expect(r2.loaded).toBe(3);
    expect(countItem(s.inventory, 'clean_water')).toBe(3);
  });
  it('collect: bag first, stockpile next, rest stays when both are full; first planter harvest flagged once', () => {
    const s = fresh();
    unlock(s);
    give(s, 'wood', 3); give(s, 'plastic', 1); give(s, 'seeds', 1);
    craft(s, 'planter', { spot: SP.hall });
    const p = s.build.spots[SP.hall];
    p.stored = 3;
    for (let i = 0; i < balance.inventory.carrySlots; i++) s.inventory[i] = { id: 'wood', qty: 20 };
    s.stockpile.fill(null);
    s.stockpile.forEach((_, i) => { s.stockpile[i] = { id: 'wood', qty: 20 }; });
    s.stockpile[0] = null;
    const loc = { floor: 15, x: 200 };
    let r = useBuilt(s, balance, p, loc);
    expect(r.collected.qty).toBe(3);
    expect(r.firstHarvest).toBe(true);
    p.stored = 1;
    r = useBuilt(s, balance, p, loc);
    expect(r.firstHarvest).toBe(false);
    expect(s.flags.firstPlanterHarvest).toBe(true); // once per game, not per planter
    s.stockpile[0] = { id: 'wood', qty: 20 };
    s.stockpile[1] = { id: 'wood', qty: 20 };
    p.stored = 2;
    r = useBuilt(s, balance, p, loc);
    expect(r.collected).toBe(null);
    expect(p.stored).toBe(2);
    expect(r.full).toBe(true);
  });
  it('offline catch-up produces through stepHooks and reports it', () => {
    const s = fresh();
    unlock(s);
    give(s, 'plastic', 3); give(s, 'metal', 2);
    craft(s, 'rain_collector', { spot: SP.win1 });
    const sim = { needs: s.needs, stockpile: s.stockpile, ctx: {} };
    const hook = (_sim, seconds, _t, rep) => tickProducers(s, balance, seconds, rep);
    const report = catchUp(sim, 7 * 3600 * 1000, balance, { startMs: 0, stepHooks: [hook] });
    expect(s.build.spots[SP.win1].stored).toBe(2);
    expect(report.production.rain_collector).toMatchObject({ made: 2, full: false });
    const lines = reportLines(report, balance);
    expect(lines).toContain('The rain collector made 2 clean water.');
    const full = catchUp(sim, 12 * 3600 * 1000, balance, { startMs: 0, stepHooks: [hook] });
    expect(productionLines(full.production, balance)[0]).toBe('The rain collector is full.');
  });
});

describe('secure floor and defense', () => {
  it('lists Cleared floors, secures one, stops its wanderers, adds defense', () => {
    const s = fresh();
    s.floorStates[13] = 'Cleared'; s.floorStates[14] = 'Cleared';
    killFloor(s, 13); killFloor(s, 14);
    s.wanderAt[13] = 5000;
    expect(clearedFloors(s)).toEqual([13, 14]);
    give(s, 'wood', 8); give(s, 'metal', 4);
    expect(craft(s, 'secure_floor', { floor: 16 }).ok).toBe(false);
    expect(craft(s, 'secure_floor', { floor: 13 }).ok).toBe(true);
    expect(s.floorStates[13]).toBe('Secured');
    expect(s.wanderAt[13]).toBeUndefined();
    expect(secureFloor(s, 13)).toBe(false);
    expect(countItem(s.inventory, 'wood')).toBe(0);
    expect(getDefense(s, balance)).toMatchObject({ total: 15, secured: 5, character: 10, barricade: 0 });
  });
  it('getDefense sums barricade, secured floors, guards and the character (GDD first-night fairness D = 25)', () => {
    const s = fresh();
    s.floorStates[13] = 'Secured';
    buildBarricade(s, balance, 1);
    expect(getDefense(s, balance).total).toBe(25);
    s.survivors.mara = { recruited: true, dead: false, job: 'guard' };
    expect(getDefense(s, balance).total).toBe(40);
    damageBarricade(s, 1000);
    expect(getDefense(s, balance).total).toBe(30);
  });
});

describe('breach latch, side rule and wanderer rule', () => {
  it('breach morale is due once until repaired to full or reset', async () => {
    const { latchBreach, resetBreachLatch } = await import('../src/gameplay/barricade.js');
    const s = fresh();
    buildBarricade(s, balance, 1);
    expect(latchBreach(s)).toBe(true);
    expect(latchBreach(s)).toBe(false);
    give(s, 'wood', 10);
    damageBarricade(s, balance.barricade.levels[0].hp);
    craft(s, 'barricade_repair'); // 20 HP: not full, still latched
    expect(latchBreach(s)).toBe(false);
    resetBreachLatch(s);
    expect(latchBreach(s)).toBe(true);
    s.build.barricade.hp = balance.barricade.levels[0].hp - 20;
    craft(s, 'barricade_repair'); // full again: re-armed
    expect(s.build.breachLatched).toBe(false);
  });
  it('Secure floor is greyed while a wanderer lives on the only Cleared floor', () => {
    const s = fresh();
    s.floorStates[14] = 'Cleared'; killFloor(s, 14);
    s.zombies['wander:1'] = { id: 'wander:1', type: 'walker', floor: 14, x: 300, homeX: 300, hp: 30, dead: false };
    give(s, 'wood', 8); give(s, 'metal', 4);
    expect(craftCheck(s, tower, balance, 'secure_floor').reason).toBe('Wanderers on floor 14');
    expect(craft(s, 'secure_floor', { floor: 14 }).ok).toBe(false);
    s.zombies['wander:1'].dead = true;
    expect(craft(s, 'secure_floor', { floor: 14 }).ok).toBe(true);
  });
  it('a zombie inside the barricade is clamped and never attacks it; the hero on the barricade is safe', () => {
    const env = {
      tower, doors: {}, heroFloor: 15, heroX: 60, heroRoom: null, types: balance.zombies.types, sightRadius: 200, attackRange: 30,
      tune: zombieTuning(balance), rng: seededRng(1), bounds: { min: 0, max: 0 }, barricade: { up: true, floor: 15, x: 100 },
    };
    const z = makeZombie('in', 'crawler', 15, 250, balance);
    const ai = makeAi(-1);
    startChase(ai, env.tune); // hunting him from behind the barricade
    let bar = 0; let bite = 0;
    for (let i = 0; i < 1200; i++) { const f = stepZombie(z, ai, env, 0.05); if (f & STEP_BARRICADE) bar++; if (f & STEP_ATTACK) bite++; }
    expect(z.x).toBeCloseTo(112, 0);
    expect(bar + bite).toBe(0);
    const out = makeZombie('out', 'crawler', 15, 40, balance);
    const ai2 = makeAi();
    let bite2 = 0;
    for (let i = 0; i < 400; i++) if (stepZombie(out, ai2, { ...env, heroX: 100 }, 0.05) & STEP_ATTACK) bite2++;
    expect(bite2).toBe(0);
  });
});
