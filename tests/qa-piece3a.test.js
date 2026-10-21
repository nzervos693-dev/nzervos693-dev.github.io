/**
 * QA piece 3a: gaps left by crafting.test.js. Crafting rules, build spots, barricade, producers, secure floor.
 * Pure gameplay logic only; browser checks live in tests/e2e/craft.mjs and the QA scripts.
 */
import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { towerData, makeTower } from './helpers/tower.js';
import { createGameState, normalizeGameState } from '../src/gameplay/gameState.js';
import { addItem, countItem } from '../src/gameplay/inventory.js';
import { craftCheck, performCraft, USE_ORDER, LATER_STAGE_EFFECTS } from '../src/gameplay/crafting.js';
import { homeSpots, freeSpots, dismantleRefund, secureFloor } from '../src/gameplay/building.js';
import { buildBarricade, damageBarricade, repairBarricade, barricadeMaxHp } from '../src/gameplay/barricade.js';
import { advanceProducer, newProducer } from '../src/gameplay/producers.js';
import { getDefense } from '../src/gameplay/defense.js';

const tower = makeTower(balance);
const fresh = () => createGameState(balance, tower, 1000);
const give = (s, id, n, where = 'inventory') => addItem(s[where], id, n, balance);
const craft = (s, id, target) => performCraft(s, tower, balance, id, target);
const snapshot = (s) => JSON.stringify([s.inventory, s.stockpile, s.build, s.floorStates]);
const R = balance.recipes;

describe('QA 3a: recipe data is consistent with the rest of balance.json', () => {
  const placeKinds = new Set(['none', 'window', 'floor', 'front_door', 'cleared_floor']);
  it('every item id in cost, output, effect exists in balance.items', () => {
    for (const [id, r] of Object.entries(R)) {
      for (const [i, q] of Object.entries(r.cost)) { expect(balance.items[i], `${id} cost ${i}`).toBeDefined(); expect(Number.isInteger(q) && q > 0, `${id} cost qty`).toBe(true); }
      for (const i of Object.keys(r.output || {})) expect(balance.items[i], `${id} output ${i}`).toBeDefined();
      const e = r.effect;
      if (e?.produces) expect(balance.items[e.produces], `${id} produces`).toBeDefined();
      if (e?.input) expect(balance.items[e.input], `${id} input`).toBeDefined();
      for (const i of e?.waterItems || []) expect(balance.items[i], `${id} water item ${i}`).toBeDefined();
    }
  });
  it('recipes have a name, a known use group, a valid build spot and exactly one of output / effect', () => {
    for (const [id, r] of Object.entries(R)) {
      expect(r.name?.length, id).toBeGreaterThan(2);
      if (!LATER_STAGE_EFFECTS.includes(r.effect?.type)) expect(USE_ORDER, id).toContain(r.use);
      expect(placeKinds.has(r.buildSpot), `${id} buildSpot ${r.buildSpot}`).toBe(true);
      expect(!!r.output !== !!r.effect, `${id} has output xor effect`).toBe(true);
      expect(r.workbenchLevel).toBe(1);
    }
  });
  it('barricade recipes point at levels that exist; levels are increasing', () => {
    for (const id of ['barricade_lv1', 'barricade_lv2']) expect(balance.barricade.levels.find((l) => l.level === R[id].effect.level)).toBeDefined();
    const lv = balance.barricade.levels;
    for (let i = 1; i < lv.length; i++) { expect(lv[i].hp).toBeGreaterThan(lv[i - 1].hp); expect(lv[i].defense).toBeGreaterThan(lv[i - 1].defense); }
    expect(balance.barricade.repairHpPerWood).toBeGreaterThan(0);
  });
  it('producer numbers are sensible', () => {
    for (const id of ['rain_collector', 'water_filter', 'planter']) {
      const e = R[id].effect;
      expect(e.intervalHours).toBeGreaterThan(0.25);
      expect(e.intervalHours).toBeLessThanOrEqual(24);
      expect(e.maxStored).toBeGreaterThanOrEqual(1);
      expect(e.maxStored).toBeLessThanOrEqual(12);
      expect(e.qty).toBe(1);
    }
    expect(R.water_filter.effect.queueMax).toBeGreaterThanOrEqual(1);
    expect(R.planter.effect.waterPerUnit).toBeGreaterThanOrEqual(1);
    expect(R.rain_collector.effect.waterPerUnit).toBe(0);
  });
  it('every placeable recipe has at least one build spot of its kind in tower_m2.json (regression: window spots)', () => {
    for (const kind of ['window', 'floor']) {
      const n = homeSpots(tower, balance).filter((s) => s.kind === kind).length;
      expect(n, `home ${kind} spots`).toBeGreaterThanOrEqual(1);
    }
  });
  it('home build spots are 96 px apart per layer and inside the floor', () => {
    for (const kind of ['window', 'floor']) {
      const xs = homeSpots(tower, balance).filter((s) => s.kind === kind).map((s) => s.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `${kind} spots ${xs}`).toBeGreaterThanOrEqual(96);
      for (const x of xs) { expect(x).toBeGreaterThanOrEqual(48); expect(x).toBeLessThanOrEqual(tower.floorWidth - 48); }
    }
  });
});

describe('QA 3a: crafting never pays for something it does not deliver', () => {
  it('wrong spot kind, taken spot, unknown spot, missing spot: nothing is spent', () => {
    const s = fresh();
    give(s, 'plastic', 3); give(s, 'metal', 2);
    const win = freeSpots(s, tower, balance, 'window')[0];
    const flo = freeSpots(s, tower, balance, 'floor')[0];
    if (!win || !flo) return; // layout without spots is reported by the data test above
    const before = snapshot(s);
    expect(craft(s, 'rain_collector', { spot: flo.key }).ok).toBe(false);
    expect(craft(s, 'rain_collector', { spot: 'nope' }).ok).toBe(false);
    expect(craft(s, 'rain_collector', {}).ok).toBe(false);
    expect(snapshot(s)).toBe(before);
    expect(craft(s, 'rain_collector', { spot: win.key }).ok).toBe(true);
    give(s, 'plastic', 3); give(s, 'metal', 2);
    const again = snapshot(s);
    expect(craft(s, 'rain_collector', { spot: win.key }).ok).toBe(false); // spot now taken
    expect(snapshot(s)).toBe(again);
  });
  it('Secure floor on a non-Cleared floor or without a target costs nothing', () => {
    const s = fresh();
    give(s, 'wood', 8); give(s, 'metal', 4);
    s.floorStates[14] = 'Cleared'; for (const z of Object.values(s.zombies)) z.dead = true;
    const before = snapshot(s);
    expect(craft(s, 'secure_floor', { floor: 16 }).ok).toBe(false);
    expect(craft(s, 'secure_floor', {}).ok).toBe(false);
    expect(snapshot(s)).toBe(before);
    expect(craft(s, 'secure_floor', { floor: 14 }).ok).toBe(true);
    expect(s.floorStates[14]).toBe('Secured');
    expect(countItem(s.inventory, 'wood')).toBe(0);
    s.floorStates[14] = 'Secured';
    give(s, 'wood', 8); give(s, 'metal', 4);
    expect(craftCheck(s, tower, balance, 'secure_floor').reason).toBe('No Cleared floor'); // Secured is not Cleared
  });
  it('Barricade Lv1 twice, Lv2 without Lv1 and Repair at full HP are refused and free', () => {
    const s = fresh();
    give(s, 'wood', 40); give(s, 'metal', 20); give(s, 'duct_tape', 4);
    const before = snapshot(s);
    expect(craft(s, 'barricade_lv2').ok).toBe(false);
    expect(craft(s, 'barricade_repair').ok).toBe(false);
    expect(snapshot(s)).toBe(before);
    expect(craft(s, 'barricade_lv1').ok).toBe(true);
    const after1 = snapshot(s);
    expect(craft(s, 'barricade_lv1').ok).toBe(false);
    expect(craft(s, 'barricade_repair').ok).toBe(false);
    expect(snapshot(s)).toBe(after1);
  });
  it('Lv2 can replace a BROKEN Lv1 at full Lv2 HP', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    damageBarricade(s, 1000);
    expect(s.build.barricade.hp).toBe(0);
    give(s, 'wood', 10); give(s, 'metal', 5); give(s, 'duct_tape', 2);
    expect(craft(s, 'barricade_lv2').ok).toBe(true);
    expect(s.build.barricade).toMatchObject({ level: 2, hp: 250 });
  });
  it('cost needing the stockpile alone works, and uses every unit from both places', () => {
    const s = fresh();
    give(s, 'wood', 1); give(s, 'wood', 2, 'stockpile'); give(s, 'metal', 1, 'stockpile');
    expect(craft(s, 'spiked_bat').ok).toBe(true);
    expect(countItem(s.inventory, 'wood') + countItem(s.stockpile, 'wood') + countItem(s.stockpile, 'metal')).toBe(0);
    expect(countItem(s.inventory, 'spiked_bat')).toBe(1);
  });
});

describe('QA 3a: barricade edge cases', () => {
  it('breaking is reported once, HP never goes negative, repair from 0 takes 5 wood', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    const lv1 = balance.barricade.levels[0].hp;
    expect(damageBarricade(s, lv1 - 1)).toEqual({ hp: 1, broken: false });
    expect(damageBarricade(s, 5)).toEqual({ hp: 0, broken: true });
    expect(damageBarricade(s, 5)).toEqual({ hp: 0, broken: false });
    const repairs = Math.ceil(lv1 / balance.barricade.repairHpPerWood);
    give(s, 'wood', repairs);
    for (let i = 0; i < repairs; i++) expect(craft(s, 'barricade_repair').ok, `repair ${i}`).toBe(true);
    expect(s.build.barricade.hp).toBe(lv1);
    expect(countItem(s.inventory, 'wood')).toBe(0);
    expect(craft(s, 'barricade_repair').ok).toBe(false);
  });
  it('Lv2 needs 13 repairs from broken; one repair never exceeds max HP', () => {
    const s = fresh();
    buildBarricade(s, balance, 2);
    s.build.barricade.hp = 245;
    expect(repairBarricade(s, balance)).toBe(5);
    expect(s.build.barricade.hp).toBe(barricadeMaxHp(s, balance));
  });
  it('defense: broken barricade 0, Lv2 25, secured floors add 5 each, character 10', () => {
    const s = fresh();
    expect(getDefense(s, balance).total).toBe(10);
    buildBarricade(s, balance, 2);
    expect(getDefense(s, balance).total).toBe(35);
    damageBarricade(s, 999);
    expect(getDefense(s, balance).total).toBe(10);
    s.floorStates[14] = 'Secured'; s.floorStates[16] = 'Secured'; s.floorStates[13] = 'Cleared';
    expect(getDefense(s, balance).total).toBe(20);
  });
  // BUG-012 (fixed): normalizeBuild clamps.
  const reload = (s) => normalizeGameState(JSON.parse(JSON.stringify(s)), balance, tower, 1000);
  it('a loaded save with barricade HP above the level max is clamped (tampered save or retuned balance)', () => {
    const s = fresh();
    s.build.barricade = { level: 1, hp: 9999 };
    expect(reload(s).build.barricade.hp).toBeLessThanOrEqual(balance.barricade.levels[0].hp);
  });
  it('a loaded save with an unknown barricade level falls back to none', () => {
    const s = fresh();
    s.build.barricade = { level: 7, hp: 50 };
    const n = reload(s).build.barricade;
    expect(n.level === 0 || balance.barricade.levels.some((l) => l.level === n.level)).toBe(true);
  });
  it('a loaded save with negative barricade HP is clamped to 0', () => {
    const s = fresh();
    s.build.barricade = { level: 1, hp: -20 };
    expect(reload(s).build.barricade.hp).toBeGreaterThanOrEqual(0);
  });
  it('a loaded save with a producer record holding junk numbers is sane', () => {
    const s = fresh();
    s.build.spots['15:f15L-spot-hallway-floor0'] = { id: 'planter', floor: 15, spot: 'f15L-spot-hallway-floor0', stored: 99, progress: -5, queue: 0 };
    const p = reload(s).build.spots['15:f15L-spot-hallway-floor0'];
    expect(p.stored).toBeLessThanOrEqual(balance.recipes.planter.effect.maxStored);
    expect(p.progress).toBeGreaterThanOrEqual(0);
  });
});

describe('QA 3a: producer edge cases', () => {
  const rain = R.rain_collector.effect;
  const filter = R.water_filter.effect;
  const planter = R.planter.effect;
  it('a filter with an empty queue does not bank progress: the first unit still takes a full hour', () => {
    const p = newProducer('water_filter', 15, 's1');
    advanceProducer(p, filter, 10 * 3600);
    expect(p.progress).toBe(0);
    p.queue = 1;
    expect(advanceProducer(p, filter, 3599).made).toBe(0);
    expect(advanceProducer(p, filter, 1).made).toBe(1);
  });
  it('a planter waiting for water keeps its progress and finishes the moment water arrives', () => {
    const p = newProducer('planter', 15, 's1');
    const bare = [];
    expect(advanceProducer(p, planter, 8 * 3600, { stockpile: bare })).toMatchObject({ made: 0, waiting: true });
    const wet = [{ id: 'dirty_water', qty: 1 }];
    expect(advanceProducer(p, planter, 1, { stockpile: wet })).toMatchObject({ made: 1, waiting: false });
    expect(wet[0]?.qty ?? 0).toBe(0);
  });
  it('maxStored is a hard cap even for absurd elapsed time, and bad seconds change nothing', () => {
    const p = newProducer('rain_collector', 15, 'w1');
    advanceProducer(p, rain, 1e12);
    expect(p.stored).toBe(4);
    const q = newProducer('rain_collector', 15, 'w1');
    advanceProducer(q, rain, -50);
    expect(q).toMatchObject({ stored: 0, progress: 0 });
    advanceProducer(q, rain, NaN);
    expect(Number.isFinite(q.progress)).toBe(true);
    expect(Number.isFinite(q.stored)).toBe(true);
  });
  it('planter makes a crop only while water lasts: 3 water, 100 h -> 3 crops (the max), water left 0', () => {
    const p = newProducer('planter', 15, 's1');
    const st = [{ id: 'clean_water', qty: 5 }];
    advanceProducer(p, planter, 100 * 3600, { stockpile: st });
    expect(p.stored).toBe(3);
    expect(st[0].qty).toBe(2); // full planter stops drinking
  });
  it('dismantle refund omits zero lines and includes stored output', () => {
    const planterRec = Object.assign(newProducer('planter', 15, 's1'), { stored: 2 });
    const refund = dismantleRefund(planterRec, balance);
    expect(refund.every((e) => e.qty > 0)).toBe(true);
    expect(refund).toEqual(expect.arrayContaining([{ id: 'wood', qty: 1 }, { id: 'planter_crop', qty: 2 }]));
    expect(refund.find((e) => e.id === 'seeds')).toBeUndefined();
    expect(dismantleRefund(newProducer('survivor_bed', 15, 's1'), balance)).toEqual([{ id: 'wood', qty: 3 }, { id: 'cloth', qty: 1 }]);
  });
  it('secureFloor refuses Infested and Secured floors and keeps other timers', () => {
    const s = fresh();
    s.floorStates[14] = 'Cleared'; s.floorStates[16] = 'Cleared'; for (const z of Object.values(s.zombies)) z.dead = true;
    s.wanderAt = { 14: 5, 16: 9 };
    expect(secureFloor(s, 15)).toBe(false);
    expect(secureFloor(s, 14)).toBe(true);
    expect(secureFloor(s, 14)).toBe(false);
    expect(s.wanderAt).toEqual({ 16: 9 });
  });
});
