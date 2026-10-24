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

function world({ gate, keepTier, keepOverlay, keepDoor, doorBarricade }) {
  const w = hqWorld();
  const st = w.structures;
  for (const g of GATE) st.place(g, { piece: 'wall', tier: gate });
  for (const k of KEEP_WALLS) st.place(k, { piece: 'wall', tier: keepTier, overlay: keepOverlay ? { ...plating } : null });
  st.place(KEEP_DOOR, { piece: 'door', tier: keepDoor, state: 'closed' });
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

describe('GDD 5.20 layered defence on the real floor 15 (QA measurements)', () => {
  it('day 10, A = 55: wood gate + wood keep (door + Lv1) holds (GDD: path 42, D 57)', () => {
    const w = world({ gate: 'wood', keepTier: 'wood', keepDoor: 'wood', doorBarricade: 1 });
    const r = route(w);
    console.log('DAY10', JSON.stringify(r));
    const res = resolve(w, 55);
    console.log('DAY10 D =', res.defense, 'repelled', res.repelled);
    
    // MEASURED on the authored floor: the bed (2x2 at x 3..4) lies against the bedroom's east partition, so a keep around it
    // shares that wall with the living room: the cheapest route crosses it directly, with no extra 80 HP partition first.
    // Path defense 38 (GDD 42), D = 53 (GDD 57) < A = 55: NOT held (GDD says held, barely). See BUG-052.
    expect(res.defense).toBe(53);
    expect(res.repelled).toBe(false);
  });
  it('day 20, A = 85: gate alone at sheet metal fails (GDD: path 49, D 64)', () => {
    const w = world({ gate: 'sheet_metal', keepTier: 'wood', keepDoor: 'wood', doorBarricade: 1 });
    console.log('DAY20 gate only', JSON.stringify(route(w)), 'D=', resolve(w, 85).defense);
    expect(resolve(w, 85).repelled).toBe(false);
  });
  it('day 20, A = 85: keep alone fails (GDD: path 67, D 82)', () => {
    const w = world({ gate: 'wood', keepTier: 'sheet_metal', keepOverlay: true, keepDoor: 'metal', doorBarricade: 2 });
    console.log('DAY20 keep only', JSON.stringify(route(w)), 'D=', resolve(w, 85).defense);
    expect(resolve(w, 85).repelled).toBe(false);
  });
  it('day 20, A = 85: gate sheet metal + plated sheet-metal keep + metal door + Lv2 barricade holds (GDD: path 77, D 92)', () => {
    const w = world({ gate: 'sheet_metal', keepTier: 'sheet_metal', keepOverlay: true, keepDoor: 'metal', doorBarricade: 2 });
    const r = route(w);
    const res = resolve(w, 85);
    console.log('DAY20 plan', JSON.stringify(r), 'D=', res.defense);
    // MEASURED: the cheapest route is the landing's block wall (35) straight into the living room, then the plated keep wall (35):
    // path 70, D = 85 = A, repelled with zero margin (GDD: landing route 74, D 89, gate route 77, D 92).
    expect(r.defense).toBe(70);
    expect(res.defense).toBe(85);
    expect(res.repelled).toBe(true);
  });
});
