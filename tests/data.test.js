import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { towerData, makeTower } from './helpers/tower.js';
import lootData from '../public/data/levels/loot.json';
import manifest from '../public/assets/art/manifest.json';

const items = balance.items;
const allObjects = [];
const unitsOf = (f) => [f.left, f.right].filter(Boolean);
for (const f of towerData.floors) {
  for (const a of unitsOf(f)) for (const o of a.objects || []) allObjects.push({ f, a, o });
}
const hasFrame = (key, name) => manifest.files.find((x) => x.key === key)?.names.includes(name);

describe('data files: references resolve', () => {
  it('every placed object has a balance definition and art', () => {
    for (const { o } of allObjects) {
      if (o.fixture) continue; // the workbench is a fixture: not in balance.objects, drawn from the build sheet
      expect(balance.objects[o.objectId], `${o.id} objectId ${o.objectId}`).toBeTruthy();
      const art = ['props_s', 'props_l', 'props_s2', 'props_l2'].some((k) => hasFrame(k, o.objectId));
      expect(art, `art for ${o.objectId}`).toBe(true);
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
    for (const f of towerData.floors) for (const a of unitsOf(f)) for (const q of a.questItems || []) {
      // quest goods are fixedLoot of a container (tower_m2.json questItems point at it)
      const box = a.objects.find((o) => o.id === q.container);
      expect(box?.fixedLoot?.some((l) => l.id === q.id), `${q.id} in ${q.container}`).toBe(true);
      expect(hasFrame('icons', q.id), `icon for quest item ${q.id}`).toBe(true);
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
  const w = balance.world;
  const doorX = { left: w.wingWidthPx, right: w.wingWidthPx + w.stairwellWidthPx };
  const edge = (side, d) => (side === 'left' ? doorX.left - d : doorX.right + d);

  it('covers floors floorMin..floorMax once, with exactly one home on the home floor', () => {
    const nums = towerData.floors.map((f) => f.number).sort((a, b) => a - b);
    const want = [];
    for (let n = w.floorMin; n <= w.floorMax; n++) want.push(n);
    expect(nums).toEqual(want);
    const homes = towerData.floors.flatMap((f) => unitsOf(f).filter((a) => a.isHome).map(() => f.number));
    expect(homes).toEqual([balance.home.startFloor]);
  });

  it('every unit has 6 modules of rooms laid out from the front door, with no gaps', () => {
    for (const f of towerData.floors) for (const side of ['left', 'right']) {
      const a = f[side];
      let at = 0;
      for (const r of a.rooms) {
        expect(r.startModule, `${a.id} ${r.ref}`).toBe(at);
        at += r.modules;
        expect([1, 2, 3]).toContain(r.modules);
      }
      expect(at, a.id).toBe(w.modulesPerWing);
    }
  });

  it('every object sits on its slot formula x, in its room, at least 96 px from same-layer neighbours', () => {
    const min = balance.controls.minHitAreaPx;
    for (const f of towerData.floors) for (const side of ['left', 'right']) {
      const a = f[side];
      for (const o of a.objects) {
        const room = a.rooms.find((r) => r.ref === o.room);
        expect(room, `${o.id} room`).toBeTruthy();
        const [, layer, k] = /^(floor|wall)(\d+)$/.exec(o.slot);
        expect(o.layer, o.id).toBe(layer);
        expect(Number(k), `${o.id} slot inside the room`).toBeLessThan(room.modules * 2);
        const d = room.startModule * w.moduleWidthPx + w.moduleWidthPx * Math.floor(Number(k) / 2) + w.slotOffsetsPx[Number(k) % 2];
        expect(o.x, `${o.id} x`).toBe(edge(side, d));
        expect(o.id).toBe(`${a.id}-${a.rooms.indexOf(room)}-${o.slot}`);
      }
      for (const layer of ['floor', 'wall']) {
        const xs = a.objects.filter((o) => o.layer === layer).map((o) => o.x).sort((p, q) => p - q);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `${a.id} ${layer}`).toBeGreaterThanOrEqual(min);
      }
      const slots = a.objects.map((o) => `${o.room}:${o.slot}`);
      expect(new Set(slots).size, `${a.id} one object per slot`).toBe(slots.length);
    }
  });

  it('zombies stand inside their unit, outside its first module, and the tutorial crawler waits on the landing', () => {
    for (const f of towerData.floors) for (const side of ['left', 'right']) {
      const a = f[side];
      for (const z of a.zombies) {
        const d = side === 'left' ? doorX.left - z.x : z.x - doorX.right;
        expect(d, z.id).toBeGreaterThan(w.moduleWidthPx);
        expect(d, z.id).toBeLessThan(w.wingWidthPx);
        expect(balance.zombies.types[z.type], z.id).toBeTruthy();
      }
    }
    const sp = towerData.floors.find((f) => f.number === 15).scriptedSpawns[0];
    expect(sp.x).toBeGreaterThan(doorX.left);
    expect(sp.x).toBeLessThan(doorX.right);
  });

  it('door states are open or jammed; the home front door is open', () => {
    for (const f of towerData.floors) for (const a of unitsOf(f)) {
      expect(['open', 'jammed']).toContain(a.frontDoor);
      for (const r of a.rooms) expect(['open', 'jammed', 'none']).toContain(r.doorAfter);
      if (a.isHome) expect(a.frontDoor).toBe('open');
    }
  });

  it('floors are 3120 wide in the tower index and the home is the start flat', () => {
    const t = makeTower(balance);
    expect(t.floorWidth).toBe(3120);
    expect(t.home.id).toBe('f15L');
    expect(t.stairwell.xMin).toBe(1440);
    expect(t.stairwell.xMax).toBe(1680);
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
});
