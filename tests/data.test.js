import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import floorsData from '../public/data/levels/floors.json';
import lootData from '../public/data/levels/loot.json';
import manifest from '../public/assets/art/manifest.json';
import { buildTower, M1_FLOOR_WIDTH } from '../src/gameplay/layout.js';

const items = balance.items;
const allObjects = [];
for (const f of floorsData.floors) {
  for (const a of f.apartments) for (const o of a.objects || []) allObjects.push({ f, a, o });
}
const hasFrame = (key, name) => manifest.files.find((x) => x.key === key)?.names.includes(name);

describe('data files: references resolve', () => {
  it('every placed object has a balance definition and art', () => {
    for (const { o } of allObjects) {
      expect(balance.objects[o.objectId], `${o.id} objectId ${o.objectId}`).toBeTruthy();
      expect(hasFrame('props_s', o.objectId) || hasFrame('props_l', o.objectId), `art for ${o.objectId}`).toBe(true);
    }
  });

  it('object ids are unique across the tower', () => {
    const ids = allObjects.map((x) => x.o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('balance objects reference real items and tools', () => {
    for (const [id, def] of Object.entries(balance.objects)) {
      for (const k of Object.keys(def.yield || {})) expect(items[k], `${id} yield ${k}`).toBeTruthy();
      for (const c of def.chanceYield || []) expect(items[c.id], `${id} chance ${c.id}`).toBeTruthy();
      if (def.tool) expect(items[def.tool]?.type, `${id} tool ${def.tool}`).toBe('tool');
      if (def.primary?.tool) expect(items[def.primary.tool]?.type).toBe('tool');
      if (def.primary?.type === 'search') {
        expect(lootData.tables[def.primary.lootTable], `${id} loot table`).toBeTruthy();
      }
      for (const k of Object.keys(def.primary?.yield || {})) expect(items[k], `${id} primary yield ${k}`).toBeTruthy();
      expect(['small', 'medium', 'large']).toContain(def.size);
      expect(['quiet', 'noisy', 'loud']).toContain(def.noise);
    }
  });

  it('loot tables only drop real items with sane weights and quantities', () => {
    for (const [name, t] of Object.entries(lootData.tables)) {
      expect(t.entries.length, name).toBeGreaterThan(0);
      for (const e of t.entries) {
        expect(items[e.id], `${name}: ${e.id}`).toBeTruthy();
        expect(e.weight, `${name}: ${e.id} weight`).toBeGreaterThan(0);
        expect(e.qtyMin).toBeGreaterThanOrEqual(1);
        expect(e.qtyMax).toBeGreaterThanOrEqual(e.qtyMin);
      }
    }
  });

  it('fixedLoot, quest items and recipes reference real items', () => {
    for (const { o } of allObjects) for (const f of o.fixedLoot || []) expect(items[f.id], `${o.id} fixedLoot ${f.id}`).toBeTruthy();
    for (const f of floorsData.floors) for (const a of f.apartments) for (const q of a.questItems || []) {
      expect(items[q.itemId], q.id).toBeTruthy();
      expect(hasFrame('icons', q.itemId), `icon for quest item ${q.itemId}`).toBe(true);
    }
    for (const [id, r] of Object.entries(balance.recipes)) {
      for (const k of Object.keys(r.cost)) expect(items[k], `${id} cost ${k}`).toBeTruthy();
      for (const k of Object.keys(r.output || {})) expect(items[k], `${id} output ${k}`).toBeTruthy();
    }
  });

  it('every item has an icon frame', () => {
    for (const id of Object.keys(items)) expect(hasFrame('icons', id), `icon ${id}`).toBe(true);
  });

  it('consumable table references only known items', () => {
    for (const id of Object.keys(balance.consumables)) expect(items[id]?.type).toBe('consumable');
  });
});

describe('data files: level layout rules', () => {
  const L = floorsData.layout;
  it('covers floors floorMin..floorMax once, with exactly one home on the home floor', () => {
    const nums = floorsData.floors.map((f) => f.number).sort((a, b) => a - b);
    const want = [];
    for (let n = balance.world.floorMin; n <= balance.world.floorMax; n++) want.push(n);
    expect(nums).toEqual(want);
    const homes = floorsData.floors.flatMap((f) => f.apartments.filter((a) => a.isHome).map(() => f.number));
    expect(homes).toEqual([balance.home.startFloor]);
  });

  it('objects in one layer are at least minHitAreaPx apart on a floor', () => {
    const min = balance.controls.minHitAreaPx;
    for (const f of floorsData.floors) {
      const objs = f.apartments.flatMap((a) => a.objects || []);
      for (const layer of ['floor', 'wall']) {
        const xs = objs.filter((o) => (o.layer || 'floor') === layer).map((o) => o.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `floor ${f.number} ${layer} ${xs[i - 1]}/${xs[i]}`).toBeGreaterThanOrEqual(min);
      }
    }
  });

  it('every object lies inside its apartment rooms and apartments fit the floor', () => {
    for (const f of floorsData.floors) for (const a of f.apartments) {
      for (const r of a.rooms) {
        expect(r.xMin).toBeGreaterThanOrEqual(L.stairwell.xMax);
        expect(r.xMax).toBeLessThanOrEqual(balance.world.floorWidthPx);
      }
      for (const o of a.objects || []) {
        expect(o.x, `${o.id}`).toBeGreaterThanOrEqual(a.rooms[0].xMin);
        expect(o.x, `${o.id}`).toBeLessThanOrEqual(a.rooms[a.rooms.length - 1].xMax);
        if (o.room) expect(a.rooms.map((r) => r.id)).toContain(o.room);
      }
    }
  });

  it('the home apartment holds no object flagged allowedInHome:false', () => {
    for (const { a, o } of allObjects) if (a.isHome) expect(balance.objects[o.objectId].allowedInHome, o.id).not.toBe(false);
  });

  it('door states are open or jammed; the home apartment door is open', () => {
    for (const f of floorsData.floors) for (const a of f.apartments) {
      expect(['open', 'jammed', undefined]).toContain(a.doorState);
      if (a.isHome) expect(a.doorState).not.toBe('jammed');
    }
  });

  it('every jammed door can still be reached: no object stands left of a door that blocks the way to the stairs', () => {
    // hero walks from the stairwell (x=60) rightwards; a jammed left door at 130 must not hide the stairwell side
    for (const f of floorsData.floors) for (const a of f.apartments) {
      if (a.doorState === 'jammed') expect(L.doorX[a.side]).toBeGreaterThan(L.stairwell.xMax);
    }
  });
});

describe('balance.json sanity ranges', () => {
  const n = balance.needs;
  it('time settings', () => {
    expect(balance.time.tickSeconds).toBe(1);
    expect(balance.time.offlineCapHours).toBeGreaterThan(0);
    expect(balance.time.offlineCapHours).toBeLessThanOrEqual(24);
    expect(balance.time.offlineStepMinutes).toBeGreaterThanOrEqual(1);
    expect(balance.time.offlineStepMinutes).toBeLessThanOrEqual(60);
    expect(balance.time.autosaveSeconds).toBeGreaterThanOrEqual(1);
    expect(balance.time.autosaveSeconds).toBeLessThanOrEqual(60);
  });

  it('all needs start within 0..max and drain is positive', () => {
    for (const k of ['health', 'food', 'water', 'energy', 'morale']) {
      expect(n[k].start, k).toBeGreaterThan(0);
      expect(n[k].start, k).toBeLessThanOrEqual(n.max);
    }
    for (const k of ['food', 'water', 'energy', 'morale']) expect(n[k].drain, k).toBeGreaterThan(0);
  });

  it('GDD fairness: 12 h offline never starves a full hero (80/80)', () => {
    const h = balance.time.offlineCapHours;
    expect(n.food.start - n.food.drain * h).toBeGreaterThanOrEqual(0);
    expect(n.water.start - n.water.drain * h).toBeGreaterThanOrEqual(0);
  });

  it('thresholds are ordered and inside range', () => {
    expect(n.lastResortThreshold).toBeLessThan(n.autoUseThreshold);
    expect(n.autoUseThreshold).toBeLessThan(n.max);
    expect(n.offlineHealthFloor).toBeGreaterThan(0);
    expect(n.morale.lowThreshold).toBeLessThan(n.morale.highThreshold);
    expect(n.energy.lowPenalty).toBeGreaterThan(0);
    expect(n.energy.lowPenalty).toBeLessThan(1);
    expect(n.health.regenMinFoodWater).toBeLessThan(n.max);
  });

  it('controls and hero speeds are phone-sensible', () => {
    const c = balance.controls;
    expect(c.buttonSizePx).toBeGreaterThanOrEqual(96);
    expect(c.minHitAreaPx).toBeGreaterThanOrEqual(96);
    expect(c.dragThresholdPx).toBeGreaterThanOrEqual(8);
    expect(c.dragThresholdPx).toBeLessThanOrEqual(40);
    expect(c.homeDoubleTapSeconds).toBeGreaterThan(0.2);
    expect(c.homeDoubleTapSeconds).toBeLessThanOrEqual(2);
    expect(balance.hero.walkSpeed).toBeGreaterThan(40);
    expect(balance.hero.walkSpeed).toBeLessThan(400);
    expect(balance.hero.stairSecondsPerFloor).toBeGreaterThan(0.3);
    expect(balance.hero.stairSecondsPerFloor).toBeLessThan(5);
  });

  it('inventory sizes and salvage times are positive; larger objects take longer', () => {
    const inv = balance.inventory;
    expect(inv.carrySlots).toBeGreaterThan(0);
    expect(inv.stockpileSlots).toBeGreaterThanOrEqual(inv.carrySlots);
    expect(inv.toolStack).toBe(1);
    const t = balance.salvage.time;
    expect(t.small).toBeLessThan(t.medium);
    expect(t.medium).toBeLessThan(t.large);
    expect(balance.salvage.keepProgressRatio).toBeGreaterThan(0);
    expect(balance.salvage.keepProgressRatio).toBeLessThan(1);
    expect(balance.world.jammedDoorHits).toBeGreaterThanOrEqual(1);
  });

  it('home spots and world sizes match the layout file', () => {
    // stage 1 still runs the M1 720 px floors: balance.world is already the wide stage-2 geometry
    // (3120 px), so the tower width comes from floors.json and the code default M1_FLOOR_WIDTH
    expect(buildTower(floorsData, balance).floorWidth).toBe(M1_FLOOR_WIDTH);
    expect(floorsData.layout.doorX.right + 290).toBe(M1_FLOOR_WIDTH);
    expect(balance.world.floorWidthPx).toBeGreaterThan(M1_FLOOR_WIDTH);
    expect(floorsData.layout.slots.left.length).toBe(3);
  });
});
