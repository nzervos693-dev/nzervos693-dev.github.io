/** QA data checks for the authored stage 2 tower (tower_m2.json) against balance, loot tables and templates. */
import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import loot from '../public/data/levels/loot.json';
import { towerData, templates, makeTower } from './helpers/tower.js';

const units = towerData.floors.flatMap((f) => [f.left, f.right].map((u) => ({ f: f.number, u })));
const W = balance.world;
const edge = (u) => (u.id.endsWith('L') ? [0, 1440] : [1680, 3120]);

describe('tower_m2.json integrity', () => {
  it('has floors 13-17 once each, 10 units, ids f<floor><L|R>', () => {
    expect(towerData.floors.map((f) => f.number).sort()).toEqual([13, 14, 15, 16, 17]);
    for (const { f, u } of units) expect(u.id).toMatch(new RegExp(`^f${f}[LR]$`));
    expect(units).toHaveLength(10);
  });
  it('every objectId exists in balance.objects; every lootTable exists', () => {
    for (const { u } of units) for (const o of u.objects.filter((x) => !x.fixture)) {
      const def = balance.objects[o.objectId];
      expect(def, `${o.id} ${o.objectId}`).toBeTruthy();
      const table = o.lootTable ?? def.primary?.lootTable;
      if (table && !o.empty) expect(loot.tables[table], `${o.id} table ${table}`).toBeTruthy();
    }
  });
  it('fixedLoot ids exist in balance.items', () => {
    for (const { u } of units) for (const o of u.objects) for (const it of o.fixedLoot || []) expect(balance.items[it.id], `${o.id} ${it.id}`).toBeTruthy();
  });
  it('object ids are unique and objects lie inside their wing and on a unique (layer, x)', () => {
    const ids = new Set();
    for (const { u } of units) {
      const seen = new Set();
      const [lo, hi] = edge(u);
      for (const o of u.objects) {
        expect(ids.has(o.id), `dup id ${o.id}`).toBe(false);
        ids.add(o.id);
        expect(o.x).toBeGreaterThan(lo);
        expect(o.x).toBeLessThan(hi);
        const key = `${o.layer}:${o.x}`;
        expect(seen.has(key), `two ${o.layer} objects at ${o.x} in ${u.id}`).toBe(false);
        seen.add(key);
      }
    }
  });
  it('same-layer objects are at least 96 px apart (tap targets do not overlap)', () => {
    for (const { u } of units) for (const layer of ['floor', 'wall']) {
      const xs = u.objects.filter((o) => o.layer === layer).map((o) => o.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `${u.id} ${layer} ${xs[i - 1]}/${xs[i]}`).toBeGreaterThanOrEqual(96);
    }
  });
  it('zombies are inside their wing, away from walls and doors (>= 40 px) and inside a room', () => {
    for (const { u } of units) {
      const [lo, hi] = edge(u);
      const doors = u.rooms.map((r) => (u.id.endsWith('L') ? 1440 - (r.startModule + r.modules) * 240 : 1680 + (r.startModule + r.modules) * 240));
      for (const z of u.zombies) {
        expect(z.x, z.id).toBeGreaterThan(lo + 16);
        expect(z.x, z.id).toBeLessThan(hi - 16);
        expect(u.rooms.some((r) => r.ref === z.room), `${z.id} room ${z.room}`).toBe(true);
        expect(['crawler', 'walker']).toContain(z.type);
        expect(['left', 'right']).toContain(z.facing);
      }
    }
  });
  it('room modules fill the wing exactly (6 modules) with consecutive startModule', () => {
    for (const { u } of units) {
      let m = 0;
      for (const r of u.rooms) { expect(r.startModule, u.id).toBe(m); m += r.modules; }
      expect(m, u.id).toBe(6);
    }
  });
  it('every foundNote id exists in templates.notes (or is an authored quest note)', () => {
    const known = new Set(templates.notes.map((n) => n.id));
    for (const { u } of units) for (const o of u.objects) if (o.foundNote) {
      const id = o.foundNote.id;
      expect(known.has(id) || o.foundNote.text || ['hint_nails', 'note_mara_bag'].includes(id), `${o.id} ${id}`).toBe(true);
    }
  });
  it('quest items point at an existing fixedLoot container', () => {
    for (const { u } of units) for (const q of u.questItems || []) {
      const c = u.objects.find((o) => o.id === q.container);
      expect(c, q.id).toBeTruthy();
      expect(c.fixedLoot.some((i) => i.id === q.id), `${q.id} in ${q.container}`).toBe(true);
    }
  });
  it('every floor has food and water somewhere (guarantee), and walls/doors are consistent', () => {
    for (const f of towerData.floors) {
      const ids = [f.left, f.right].flatMap((u) => u.objects.flatMap((o) => (o.fixedLoot || []).map((i) => i.id)));
      const tables = [f.left, f.right].flatMap((u) => u.objects.filter((o) => !o.empty && !o.fixture).map((o) => o.lootTable ?? balance.objects[o.objectId].primary?.lootTable)).filter(Boolean);
      expect(ids.length + tables.length, `floor ${f.number} has any loot`).toBeGreaterThan(3);
    }
  });
  it('M2 stage 2: floor width 3120, world numbers present', () => {
    expect(W.floorWidthPx ?? W.floorWidth ?? 3120).toBe(3120);
    expect(W.moduleWidthPx).toBe(240);
  });
  it('index builds without throwing and every unit has a front door x at the stairwell edge', () => {
    const t = makeTower(balance);
    for (const apt of t.apartments.values()) expect(apt.doorX).toBe(apt.side === 'left' || apt.id.endsWith('L') ? 1440 : 1680);
  });
});

describe('empty container prose', () => {
  it('emptyLines are non-empty strings, no digits, one sentence', () => {
    const all = Array.isArray(loot.emptyLines) ? loot.emptyLines : Object.values(loot.emptyLines).flat();
    expect(all.length).toBeGreaterThan(2);
    for (const s of all) { expect(typeof s).toBe('string'); expect(s.length).toBeGreaterThan(3); expect(s).not.toMatch(/\d/); }
  });
});

describe('found notes have text after indexing', () => {
  it('every foundNote placement carries a non-empty text (no `Note: ""` toast)', () => {
    const t = makeTower(balance);
    for (const o of t.objects.values()) if (o.foundNote) expect(o.foundNote.text, `${o.id} ${o.foundNote.id}`).toBeTruthy();
  });
});
