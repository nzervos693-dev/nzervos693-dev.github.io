import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { createSlots, addItem, countItem } from '../src/gameplay/inventory.js';
import { initNeeds } from '../src/gameplay/needs.js';
import { autoFill, chooseQuick, carriedEligible, consumeQuick, QuickUseController, throwAim, quickConfig, quickCount } from '../src/gameplay/isoQuickUse.js';

const mk = () => ({ inventory: createSlots(10), needs: { ...initNeeds(balance) }, quickUse: { id: null, chosen: false } });
const give = (s, id, n = 1) => addItem(s.inventory, id, n, balance);

describe('quick-use slot', () => {
  it('is empty at New game and auto-fills from the default order the first time he carries something eligible', () => {
    const s = mk();
    expect(autoFill(s, balance)).toBe(false);
    give(s, 'wood', 3); // not eligible
    expect(autoFill(s, balance)).toBe(false);
    give(s, 'chocolate'); give(s, 'canned_food');
    expect(autoFill(s, balance)).toBe(true);
    expect(s.quickUse.id).toBe('canned_food'); // order: water bottle, clean water, canned food, ...
  });
  it('a type the player chose is never changed automatically', () => {
    const s = mk();
    give(s, 'chocolate'); give(s, 'water_bottle');
    chooseQuick(s, 'chocolate');
    give(s, 'canned_food');
    expect(autoFill(s, balance)).toBe(false);
    expect(s.quickUse.id).toBe('chocolate');
    chooseQuick(s, null); // cleared on purpose: stays empty
    expect(autoFill(s, balance)).toBe(false);
  });
  it('lists carried eligible types with counts (consumables, water, throwables)', () => {
    const s = mk();
    give(s, 'water_bottle', 2); give(s, 'molotov'); give(s, 'crowbar'); give(s, 'wood', 5);
    expect(carriedEligible(s, balance)).toEqual([{ id: 'water_bottle', count: 2 }, { id: 'molotov', count: 1 }]);
  });
  it('uses one item; "Not now." when everything it restores is full; "None left." at zero', () => {
    const s = mk();
    give(s, 'canned_food', 2); chooseQuick(s, 'canned_food');
    s.needs.food = 100;
    expect(consumeQuick(s, balance)).toMatchObject({ ok: false, reason: 'Not now.' });
    expect(countItem(s.inventory, 'canned_food')).toBe(2);
    s.needs.food = 10;
    expect(consumeQuick(s, balance)).toMatchObject({ ok: true });
    expect(s.needs.food).toBe(40);
    expect(quickCount(s)).toBe(1);
    s.needs.food = 10; consumeQuick(s, balance);
    s.needs.food = 10;
    expect(consumeQuick(s, balance)).toMatchObject({ ok: false, reason: 'None left.' });
  });
  it('dirty water costs health as usual', () => {
    const s = mk(); give(s, 'dirty_water'); chooseQuick(s, 'dirty_water');
    s.needs.water = 10; const h = s.needs.health;
    expect(consumeQuick(s, balance).ok).toBe(true);
    expect(s.needs.health).toBeLessThan(h);
  });
});

describe('controller: cooldown, arming, throwing', () => {
  it('a use starts the 1 s cooldown during which taps are ignored', () => {
    const s = mk(); give(s, 'canned_food', 3); chooseQuick(s, 'canned_food'); s.needs.food = 10;
    const c = new QuickUseController(balance);
    expect(c.tap(s, balance).type).toBe('used');
    expect(c.tap(s, balance).type).toBe('none');
    c.step(0.5); expect(c.cooldownFrac).toBeCloseTo(0.5);
    c.step(0.6); s.needs.food = 10;
    expect(c.tap(s, balance).type).toBe('used');
  });
  it('a throwable: the first tap arms, the second within 3 s throws, a timeout disarms and keeps the item', () => {
    const s = mk(); give(s, 'molotov'); chooseQuick(s, 'molotov');
    const c = new QuickUseController(balance);
    expect(c.tap(s, balance).type).toBe('arm');
    expect(c.armed).toBe(true);
    c.step(2.9); expect(c.armed).toBe(true);
    expect(c.tap(s, balance).type).toBe('throw');
    expect(c.armed).toBe(false);
    c.step(1.1);
    expect(c.tap(s, balance).type).toBe('arm');
    c.step(3.1);
    expect(c.armed).toBe(false);
    expect(countItem(s.inventory, 'molotov')).toBe(1);
  });
  it('disarm (Main/Secondary tap) keeps the item', () => {
    const s = mk(); give(s, 'molotov'); chooseQuick(s, 'molotov');
    const c = new QuickUseController(balance);
    c.tap(s, balance); c.disarm();
    expect(c.armed).toBe(false);
  });
  it('an empty slot ignores taps, a used-up one says None left.', () => {
    const s = mk();
    const c = new QuickUseController(balance);
    expect(c.tap(s, balance).type).toBe('none');
    chooseQuick(s, 'canned_food');
    expect(c.tap(s, balance)).toMatchObject({ type: 'toast', reason: 'None left.' });
  });
});

describe('throw aim point', () => {
  const q = quickConfig(balance);
  const o = (extra = {}) => ({ rangeTiles: balance.throw.rangeTiles, coneDegrees: q.throwAimConeDegrees, defaultTiles: q.throwDefaultTiles, isWalkable: () => true, los: () => true, ...extra });
  it('aims at the nearest Visible zombie within 6 tiles and +-30 degrees', () => {
    const hero = { x: 2.5, y: 2.5, facing: 0 };
    const zs = [{ x: 8.5, y: 2.5 }, { x: 6.5, y: 3.4 }, { x: 5.5, y: 2.5 }];
    expect(throwAim(hero, zs, o())).toEqual({ x: 5.5, y: 2.5 });
    expect(throwAim(hero, [{ x: 2.5, y: 6.5 }], o())).toEqual({ x: 6.5, y: 2.5 }); // outside the cone: straight ahead 4 tiles
    expect(throwAim(hero, [{ x: 12.5, y: 2.5 }], o())).toEqual({ x: 6.5, y: 2.5 }); // out of range
  });
  it('without a zombie: the last walkable tile in sight, at most 4 tiles ahead', () => {
    const hero = { x: 2.5, y: 2.5, facing: 0 };
    expect(throwAim(hero, [], o())).toEqual({ x: 6.5, y: 2.5 });
    expect(throwAim(hero, [], o({ isWalkable: (x) => x < 5 }))).toEqual({ x: 4.5, y: 2.5 });
    expect(throwAim(hero, [{ x: 4.5, y: 2.5 }], o({ los: () => false }))).toEqual({ x: 2.5, y: 2.5 }); // nothing in sight at all
  });
});
