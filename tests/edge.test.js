import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { towerData, makeTower } from './helpers/tower.js';
import { tickNeeds, applyItem, initNeeds } from '../src/gameplay/needs.js';
import { catchUp } from '../src/gameplay/offline.js';
import { createSlots, addItem, moveAll, moveStack, countItem, removeItem, normalizeSlots, fitCount } from '../src/gameplay/inventory.js';
import { buildTower, floorAtY, floorTopY, floorLineY, worldHeight, isInHome, homeSpot } from '../src/gameplay/layout.js';
import { createGameState, normalizeGameState, addPile, takeFromPile, enterRoom } from '../src/gameplay/gameState.js';
import { limitWalk, hitJammedDoor, stepToward, doorStopX } from '../src/gameplay/routing.js';
import { elapsedInfo } from '../src/core/clock.js';
import { formatDuration, reportLines } from '../src/gameplay/report.js';

const tower = makeTower(balance);
const HOUR = 3600e3;

describe('offline math matches balance.json (GDD 5.1/5.2)', () => {
  const run = (hours, mut) => {
    const state = { needs: initNeeds(balance), stockpile: createSlots(balance.inventory.stockpileSlots), ctx: {} };
    mut?.(state);
    const rep = catchUp(state, hours * HOUR, balance);
    return { state, rep };
  };

  it('3 h away: food -9, water -12, morale -3, energy stays full', () => {
    const { state } = run(3);
    expect(state.needs.food).toBeCloseTo(80 - 3 * balance.needs.food.drain, 5);
    expect(state.needs.water).toBeCloseTo(80 - 3 * balance.needs.water.drain, 5);
    expect(state.needs.morale).toBeCloseTo(60 - 3 * balance.needs.morale.drain, 5);
    expect(state.needs.energy).toBe(100);
    expect(state.needs.health).toBe(100);
  });

  it('12 h away from 80/80 ends at 44 food / 32 water and nobody is hurt', () => {
    const { state, rep } = run(12);
    expect(state.needs.food).toBeCloseTo(44, 5);
    expect(state.needs.water).toBeCloseTo(32, 5);
    expect(state.needs.health).toBe(100);
    expect(rep.steps).toBe(72);
  });

  it('energy regenerates offline at offlineRegen per hour, capped at max', () => {
    const { state } = run(2, (s) => { s.needs.energy = 10; });
    expect(state.needs.energy).toBeCloseTo(10 + 2 * balance.needs.energy.offlineRegen, 5);
    const full = run(12, (s) => { s.needs.energy = 90; });
    expect(full.state.needs.energy).toBe(100);
  });

  it('auto-use fires once water drops under 40 and uses the smallest restore first', () => {
    const { state, rep } = run(12, (s) => { addItem(s.stockpile, 'water_bottle', 3, balance); addItem(s.stockpile, 'dirty_water', 2, balance); });
    expect(rep.used.dirty_water ?? 0).toBeGreaterThanOrEqual(1); // smallest restore (20) goes before the bottle (35)
    expect(state.needs.water).toBeGreaterThan(40 - 4 / 6 - 0.001); // never left under the threshold by more than one step of drain
  });

  it('empty needs offline: health floors at 10 and never reaches 0 even for 12 h', () => {
    const { state } = run(12, (s) => { s.needs.food = 0; s.needs.water = 0; });
    expect(state.needs.health).toBe(balance.needs.offlineHealthFloor);
  });

  it('zero and negative elapsed time change nothing', () => {
    const { state } = run(0);
    expect(state.needs).toEqual(initNeeds(balance));
    const s2 = { needs: initNeeds(balance), stockpile: createSlots(40), ctx: {} };
    catchUp(s2, -5 * HOUR, balance);
    expect(s2.needs).toEqual(initNeeds(balance));
  });

  it('partial last step is handled (65 minutes = 6 full steps + 5 min)', () => {
    const { state, rep } = run(65 / 60);
    expect(rep.steps).toBe(7);
    expect(state.needs.food).toBeCloseTo(80 - balance.needs.food.drain * 65 / 60, 6);
  });
});

describe('clock elapsed (GDD 5.1)', () => {
  const cap = balance.time.offlineCapHours * HOUR;
  it('caps at 12 h and flags capped', () => {
    const r = elapsedInfo(1000, 1000 + 30 * HOUR, cap);
    expect(r.elapsedMs).toBe(cap);
    expect(r.capped).toBe(true);
    expect(r.rawMs).toBe(30 * HOUR);
  });
  it('exactly at the cap is not flagged', () => {
    expect(elapsedInfo(1, 1 + cap, cap).capped).toBe(false);
  });
  it('clock moved backwards or never saved gives 0', () => {
    expect(elapsedInfo(5000, 1000, cap).elapsedMs).toBe(0);
    expect(elapsedInfo(0, 1000, cap).elapsedMs).toBe(0);
    expect(elapsedInfo(NaN, 1000, cap).elapsedMs).toBe(0);
  });
});

describe('needs rules', () => {
  it('two empty needs hurt twice as fast', () => {
    const a = { ...initNeeds(balance), food: 0 };
    const b = { ...initNeeds(balance), food: 0, water: 0 };
    tickNeeds(a, 3600, {}, balance); tickNeeds(b, 3600, {}, balance);
    expect(100 - b.health).toBeCloseTo(2 * (100 - a.health), 5);
  });
  it('low morale drains energy faster while awake', () => {
    const a = { ...initNeeds(balance), morale: 10 };
    const b = { ...initNeeds(balance), morale: 60 };
    tickNeeds(a, 3600, {}, balance); tickNeeds(b, 3600, {}, balance);
    expect(100 - a.energy).toBeCloseTo((100 - b.energy) * balance.needs.morale.lowEnergyDrainMult, 4);
  });
  it('values never leave 0..max', () => {
    const n = { health: 1, food: 0, water: 0, energy: 0, morale: 0 };
    tickNeeds(n, 1000 * 3600, {}, balance);
    for (const v of Object.values(n)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
    const m = { health: 100, food: 100, water: 100, energy: 100, morale: 100 };
    tickNeeds(m, 3600, { sleeping: true }, balance);
    for (const v of Object.values(m)) expect(v).toBeLessThanOrEqual(100);
  });
  it('dirty water refuses at full water, cannot drop health below 0', () => {
    const n = { ...initNeeds(balance), water: 100 };
    expect(applyItem(n, 'dirty_water', balance).ok).toBe(false);
    const m = { ...initNeeds(balance), water: 10, health: 3 };
    applyItem(m, 'dirty_water', balance);
    expect(m.health).toBeGreaterThanOrEqual(0);
  });
  it('unknown items cannot be used', () => {
    expect(applyItem(initNeeds(balance), 'wood', balance).ok).toBe(false);
  });
});

describe('inventory edge cases', () => {
  it('a full bag refuses and reports the exact leftover', () => {
    const bag = createSlots(balance.inventory.carrySlots);
    for (let i = 0; i < bag.length; i++) addItem(bag, 'wood', 20, balance);
    expect(addItem(bag, 'wood', 5, balance)).toBe(5);
    expect(addItem(bag, 'metal', 1, balance)).toBe(1);
  });
  it('fitCount agrees with addItem', () => {
    const bag = createSlots(2);
    addItem(bag, 'canned_food', 8, balance);
    expect(fitCount(bag, 'canned_food', 100, balance)).toBe(12);
    expect(addItem(bag, 'canned_food', 100, balance)).toBe(88);
  });
  it('tools: two crowbars take two slots and each keeps its uses when stored', () => {
    const bag = createSlots(4); const stock = createSlots(4);
    addItem(bag, 'crowbar', 2, balance);
    bag[0].uses = 3;
    moveAll(bag, stock, balance);
    expect(stock.filter(Boolean).map((s) => s.uses).sort((a, b) => a - b)).toEqual([3, balance.salvage.toolUses]);
    expect(bag.filter(Boolean).length).toBe(0);
  });
  it('moveAll into a full stockpile loses nothing', () => {
    const bag = createSlots(8); const stock = createSlots(1);
    addItem(stock, 'wood', 20, balance);
    addItem(bag, 'wood', 7, balance);
    expect(moveAll(bag, stock, balance)).toBe(0);
    expect(countItem(bag, 'wood')).toBe(7);
    expect(countItem(stock, 'wood')).toBe(20);
  });
  it('removeItem of more than owned removes only what exists', () => {
    const bag = createSlots(4); addItem(bag, 'wood', 5, balance);
    expect(removeItem(bag, 'wood', 99)).toBe(5);
    expect(bag.every((s) => s === null)).toBe(true);
  });
  it('normalizeSlots drops corrupt entries', () => {
    const out = normalizeSlots([{ id: 'wood', qty: 0 }, { id: 3, qty: 2 }, null, { id: 'wood', qty: 2 }], 4);
    expect(out.filter(Boolean).length).toBe(1);
  });
  it('moveStack with a tool needs a free slot', () => {
    const bag = createSlots(2); addItem(bag, 'crowbar', 1, balance);
    const full = [{ id: 'wood', qty: 1 }];
    expect(moveStack(bag, 0, full, balance)).toBe(0);
    expect(bag[0]).toBeTruthy();
  });
});

describe('tower geometry', () => {
  it('floorAtY is the inverse of floorTopY and rejects outside the tower', () => {
    for (let f = tower.floorMin; f <= tower.floorMax; f++) {
      expect(floorAtY(tower, floorTopY(tower, f) + 1)).toBe(f);
      expect(floorAtY(tower, floorTopY(tower, f) + tower.floorHeight - 1)).toBe(f);
      expect(floorLineY(tower, f)).toBeGreaterThan(floorTopY(tower, f));
    }
    expect(floorAtY(tower, 0)).toBeNull();
    expect(floorAtY(tower, worldHeight(tower))).toBeNull();
  });
  it('home spot is inside the home apartment', () => {
    const s = homeSpot(tower);
    expect(isInHome(tower, s.floor, s.x)).toBe(true);
    expect(isInHome(tower, 14, s.x)).toBe(false);
  });
  it('the whole world fits the camera with room for scrolling', () => {
    expect(worldHeight(tower)).toBeGreaterThan(1280);
  });
});

describe('routing edge cases', () => {
  const jam = { f15R: { state: 'jammed', hits: 0 } }; // front door of the right flat, x 1680
  it('hero already past a jammed door is not blocked', () => {
    expect(limitWalk(tower, jam, 15, 1750, 2000).x).toBe(2000);
  });
  it('a walk that moves away from the door is never blocked', () => {
    expect(limitWalk(tower, jam, 15, 1600, 1500).blockedDoor).toBeNull();
  });
  it('a walk that ends before the door is not blocked', () => {
    expect(limitWalk(tower, jam, 15, 1500, 1620).blockedDoor).toBeNull();
  });
  it('hero standing exactly at the stop point is still held back', () => {
    const door = tower.apartments.get('f15R').front;
    const r = limitWalk(tower, jam, 15, doorStopX(door, 1500), 2000);
    expect(r.x).toBe(doorStopX(door, 1500));
    expect(r.blockedDoor).toBe(door);
  });
  it('a jammed door blocks from either side', () => {
    const door = tower.apartments.get('f15R').front;
    expect(limitWalk(tower, jam, 15, 2000, 1500)).toEqual({ x: 1722, blockedDoor: door });
  });
  it('extra hits on an open door do not re-close it', () => {
    const d = { state: 'open', hits: 3 };
    expect(hitJammedDoor(d, balance).opened).toBe(true);
    expect(d.state).toBe('open');
  });
  it('very fast taps: exactly 3 hits opens, hit counter does not run past', () => {
    const d = { state: 'jammed', hits: 0 };
    const res = [1, 2, 3, 4, 5].map(() => hitJammedDoor(d, balance).opened);
    expect(res).toEqual([false, false, true, true, true]);
    expect(d.state).toBe('open');
  });
  it('stepToward handles zero dt and zero distance', () => {
    expect(stepToward(10, 50, 100, 0)).toBe(10);
    expect(stepToward(10, 10, 100, 1)).toBe(10);
  });
});

describe('game state edge cases', () => {
  it('normalize survives garbage hero position and NaN needs', () => {
    const s = normalizeGameState({ hero: { floor: 99, x: NaN }, needs: { food: NaN, health: 'x' } }, balance, tower, 5);
    expect(tower.floors.has(s.hero.floor)).toBe(true);
    expect(Number.isFinite(s.needs.food)).toBe(true);
    expect(Number.isFinite(s.needs.health)).toBe(true);
  });
  it('normalize of null creates a playable state', () => {
    const s = normalizeGameState(null, balance, tower, 5);
    expect(s.started).toBe(true);
    expect(s.inventory.length).toBe(balance.inventory.carrySlots);
  });
  it('normalize keeps open doors and entered rooms from a save', () => {
    const s = createGameState(balance, tower, 1);
    s.doors.f15R.state = 'open';
    s.doors['f13L-door3'].state = 'open';
    enterRoom(s, tower.apartments.get('f13R'), tower.apartments.get('f13R').rooms[0]);
    const again = normalizeGameState(JSON.parse(JSON.stringify(s)), balance, tower, 9);
    expect(again.doors.f15R.state).toBe('open');
    expect(again.doors['f13L-door3'].state).toBe('open');
    expect(again.rooms['f13R:reception']).toBe(true);
  });
  it('piles on the same spot merge; a partial pickup leaves the rest', () => {
    const s = createGameState(balance, tower, 1);
    addPile(s, 15, 300, [{ id: 'wood', qty: 5 }]);
    addPile(s, 15, 310, [{ id: 'wood', qty: 4 }]);
    expect(s.piles.length).toBe(1);
    for (let i = 0; i < s.inventory.length - 1; i++) s.inventory[i] = { id: 'metal', qty: 20 };
    const taken = takeFromPile(s, s.piles[0], balance);
    expect(taken[0].qty).toBe(9 > 20 ? 20 : 9);
    expect(s.piles.length).toBe(0);
  });
  it('new game starts with the documented needs', () => {
    const s = createGameState(balance, tower, 1);
    expect(s.needs).toEqual({ health: 100, food: 80, water: 80, energy: 100, morale: 60 });
  });
});

describe('away report text', () => {
  it('shows the cap notice only when capped, and skips unchanged needs', () => {
    const rep = { elapsedMs: 12 * HOUR, before: { food: 80, water: 80, energy: 100, health: 100, morale: 60 }, after: { food: 44, water: 32, energy: 100, health: 100, morale: 48 }, used: {} };
    const l = reportLines(rep, balance, true);
    expect(l).toContain('You slept.');
    expect(l).toContain('Your mouth is dry.');
    expect(l).not.toContain('You woke up hungry.'); // food 44 is above the hungry limit
    expect(l).toContain('Days slipped by. You lost track.');
    expect(l.join(' ')).not.toMatch(/\d|->/);
    expect(reportLines(rep, balance, false)).not.toContain('Days slipped by. You lost track.');
    expect(l.length).toBeLessThanOrEqual(6);
  });
  it('durations', () => {
    expect(formatDuration(59000)).toBe('less than a minute');
    expect(formatDuration(90 * 60000)).toBe('1 h 30 min');
  });
});
