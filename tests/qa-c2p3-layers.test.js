/**
 * QA: the GDD 5.20 "layered defence" fairness examples (day 10 and day 20) measured on the REAL floor 15 (authored heart in the
 * start flat bedroom at (2,0)), with the real cost field and the real offline resolver. A 4-edge keep sits in the exterior
 * corner around the bed: tiles (1,0) and (2,0), walls W of (1,0), E of (2,0), S of both; the door is the S edge of (2,0).
 */
import { describe, it, expect } from 'vitest';
import { hqWorld, stock, giveTool, balance } from './iso/hqHelpers.js';
import { planOfflineRoute, resolveOfflineHq } from '../src/gameplay/isoOffline.js';
import { addOverlay } from '../src/gameplay/isoBuild.js';

const DAY = 24 * 3600 * 1000;
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const GATE = [{ x: 14, y: 10, side: 'N' }, { x: 15, y: 10, side: 'N' }];
// the real bed is 2x2 at tiles (3..4, 0..1) facing S, stand tile (3,2); the east side of the bedroom is an 80 HP partition at x=5.
// The smallest keep: tiles (3..4, 0..2): west x=3 (y 0..2), east x=5 (y 0..2), south (3,3) and (4,3); the door is (3,3,N).
const KEEP_WALLS = [{ x: 3, y: 0, side: 'W' }, { x: 3, y: 1, side: 'W' }, { x: 3, y: 2, side: 'W' }, { x: 5, y: 0, side: 'W' }, { x: 5, y: 1, side: 'W' }, { x: 5, y: 2, side: 'W' }, { x: 4, y: 3, side: 'N' }];
const KEEP_DOOR = { x: 3, y: 3, side: 'N' };
const plating = { kind: 'plating', hp: 200, maxHp: 200 };

function world({ gate, keepTier, keepOverlay, keepDoor, doorBarricade, noKeep = false }) {
  const w = hqWorld();
  const st = w.structures;
  for (const g of GATE) st.place(g, { piece: 'wall', tier: gate });
  if (!noKeep) for (const k of KEEP_WALLS) st.place(k, { piece: 'wall', tier: keepTier, overlay: keepOverlay ? { ...plating } : null });
  if (!noKeep) st.place(KEEP_DOOR, { piece: 'door', tier: keepDoor, state: 'closed' });
  const front = w.floor.doors.find((d) => d.id === w.floor.home.frontDoor);
  giveTool(w.state, 'hammer');
  stock(w.state, { wood: 200, metal: 40, duct_tape: 8, parts: 8, sheet_metal: 20 }, 'stockpile');
  // barricades (Lv1 / Lv2) on the start flat front door and on the keep door
  const addBar = (edge, lv) => { const a = addOverlay(w.ctx, edge, 'barricade'); if (!a.ok) console.log('ADDBAR', JSON.stringify(edge), a.code, a.message); if (lv === 2) { const u = addOverlay(w.ctx, edge, 'barricade'); if (!u.ok) console.log('LV2', u.code, u.message); } };
  addBar({ x: front.x, y: front.y, side: front.side }, 1);
  if (doorBarricade) addBar(KEEP_DOOR, doorBarricade);
  return w;
}
const route = (w) => {
  const r = planOfflineRoute(w.floor, w.structures, w.state, balance);
  return { defense: r.defense, path: r.crossings.map((c) => `${c.rec.piece}:${c.rec.tier}@${c.rec.x},${c.rec.y},${c.rec.side}=${c.defense.toFixed(1)}`) };
};
const resolve = (w, A) => resolveOfflineHq({ floor: w.floor }, w.state, balance, { kind: 'scheduled', strength: A, types: [] }, seeded(3));

describe('GDD 5.20 layered defence on the real floor 15 (QA measurements, block wall defence 40)', () => {
  const measure = (name, o, A) => { const w = world(o); const r = route(w); const res = resolve(w, A); console.log(name, JSON.stringify(r), 'D =', res.defense); return { r, res }; };
  it('day 3, A = 34: wood gate, no keep: D 47, held', () => {
    const { res } = measure('DAY3', { gate: 'wood', noKeep: true, doorBarricade: 0 }, 34);
    expect(res.defense).toBe(47);
    expect(res.repelled).toBe(true);
  });
  it('day 10, A = 55, all wood (gate, keep, door + Lv1): D 53, breached', () => {
    const { r, res } = measure('DAY10 all wood', { gate: 'wood', keepTier: 'wood', keepDoor: 'wood', doorBarricade: 1 }, 55);
    expect(r.defense).toBe(38);
    expect(res.defense).toBe(53);
    expect(res.repelled).toBe(false);
  });
  it('day 10, A = 55, sheet-metal gate + wood keep: D 65, held', () => {
    const { res } = measure('DAY10 sensible', { gate: 'sheet_metal', keepTier: 'wood', keepDoor: 'wood', doorBarricade: 1 }, 55);
    expect(res.defense).toBe(65);
    expect(res.repelled).toBe(true);
  });
  it('day 20, A = 85: gate alone (sheet metal gate, wood keep): D 65, breached', () => {
    const { res } = measure('DAY20 gate only', { gate: 'sheet_metal', keepTier: 'wood', keepDoor: 'wood', doorBarricade: 1 }, 85);
    expect(res.defense).toBe(65);
    expect(res.repelled).toBe(false);
  });
  it('day 20, A = 85: keep alone (wood gate, plated sheet-metal keep, metal door + Lv2): D 78, breached', () => {
    const { res } = measure('DAY20 keep only', { gate: 'wood', keepTier: 'sheet_metal', keepOverlay: true, keepDoor: 'metal', doorBarricade: 2 }, 85);
    expect(res.defense).toBe(78);
    expect(res.repelled).toBe(false);
  });
  it('day 20, A = 85: full plan: D 90, held with margin 5', () => {
    const { r, res } = measure('DAY20 plan', { gate: 'sheet_metal', keepTier: 'sheet_metal', keepOverlay: true, keepDoor: 'metal', doorBarricade: 2 }, 85);
    expect(r.defense).toBe(75);
    expect(res.defense).toBe(90);
    expect(res.repelled).toBe(true);
  });
});
