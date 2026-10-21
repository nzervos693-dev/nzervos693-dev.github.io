/*
 * QA tests for the isometric Stage A (floor 15): an independent re-implementation of the GDD 5.17 vision rules
 * checked against the real floor data, data invariants of floors_iso.json, sound ripple limits, save
 * normalising. Independent means: written from the GDD text (segment crossing in doubled integer coordinates),
 * not by copying src/iso/grid.js.
 */
import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import floorsIso from '../public/data/levels/floors_iso.json';
import lootData from '../public/data/levels/loot.json';
import { loadIsoFloor } from '../src/iso/loader.js';
import { EDGE, MOVE } from '../src/iso/grid.js';
import { findPath } from '../src/iso/path.js';
import { VisionMap, visionConfig, soundRipple } from '../src/iso/vision.js';
import { createIsoState, normalizeIsoState, isStaleSave, ISO_WORLD, snapshotDoors, applyDoorsToGrid } from '../src/gameplay/isoState.js';

const world = () => loadIsoFloor(floorsIso, 15, balance);
const lightOf = (w) => (x, y) => w.light[y * w.width + x] ?? 'dim';

/** Blocking edges (walls, windows, closed and jammed doors) as integer segments in doubled coordinates. */
function blockingSegments(g) {
  const segs = [];
  const blocks = (id) => {
    const t = g.edges[id];
    if (t === EDGE.NONE) return false;
    if (t === EDGE.DOOR) { const d = g.doors.get(id); return d.state === 'closed' || d.state === 'jammed'; }
    return true;
  };
  for (let y = 0; y <= g.height; y++) for (let x = 0; x < g.width; x++) if (blocks(g.edgeId(x, y, 'N'))) segs.push([2 * x, 2 * y, 2 * x + 2, 2 * y]);
  for (let y = 0; y < g.height; y++) for (let x = 0; x <= g.width; x++) if (blocks(g.edgeId(x, y, 'W'))) segs.push([2 * x, 2 * y, 2 * x, 2 * y + 2]);
  return segs;
}
const orient = (ax, ay, bx, by, cx, cy) => Math.sign((bx - ax) * (cy - ay) - (by - ay) * (cx - ax));
const onSeg = (ax, ay, bx, by, cx, cy) => Math.min(ax, bx) <= cx && cx <= Math.max(ax, bx) && Math.min(ay, by) <= cy && cy <= Math.max(ay, by);
/** Segments intersect, touching counts (GDD: through a corner it is blocked when ANY of the 4 edges blocks). */
function touches(p, q) {
  const [ax, ay, bx, by] = p;
  const [cx, cy, dx, dy] = q;
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && onSeg(ax, ay, bx, by, cx, cy)) || (o2 === 0 && onSeg(ax, ay, bx, by, dx, dy))
    || (o3 === 0 && onSeg(cx, cy, dx, dy, ax, ay)) || (o4 === 0 && onSeg(cx, cy, dx, dy, bx, by));
}

describe('floor 15 line of sight (GDD 5.17), independent check', () => {
  it('Grid.hasLOS equals the centre-to-centre segment test for every pair within 9 tiles', () => {
    const w = world();
    const g = w.grid;
    const segs = blockingSegments(g);
    let bad = 0;
    let n = 0;
    for (let ay = 0; ay < g.height; ay++) for (let ax = 0; ax < g.width; ax++) {
      if (!g.isFloor(ax, ay)) continue;
      for (let by = Math.max(0, ay - 9); by <= Math.min(g.height - 1, ay + 9); by++) for (let bx = Math.max(0, ax - 9); bx <= Math.min(g.width - 1, ax + 9); bx++) {
        if (!g.isFloor(bx, by) || (ax === bx && ay === by)) continue;
        n++;
        const seg = [2 * ax + 1, 2 * ay + 1, 2 * bx + 1, 2 * by + 1];
        const expect = !segs.some((s) => touches(seg, s));
        if (expect !== g.hasLOS(ax, ay, bx, by)) bad++;
      }
    }
    expect(n).toBeGreaterThan(100000);
    expect(bad).toBe(0);
  });

  it('a closed door hides the room behind it and opening it shows it', () => {
    const w = world();
    const g = w.grid;
    const door = w.doors.find((d) => d.id === w.home.frontDoor);
    const [a, b] = g.doorTiles(door);
    expect(door.state).toBe('closed');
    expect(g.hasLOS(a.x, a.y, b.x, b.y)).toBe(false);
    g.setDoorState(door, 'open');
    expect(g.hasLOS(a.x, a.y, b.x, b.y)).toBe(true);
  });
});

describe('floor 15 vision cone and range (GDD 5.17), independent check', () => {
  it('visible set = close circle or (cone by hero light AND range by target light) AND line of sight', () => {
    const w = world();
    const g = w.grid;
    const cfg = visionConfig(balance);
    const lightAt = lightOf(w);
    const vm = new VisionMap(g.width, g.height);
    const cone = balance.vision.coneDegrees;
    const range = balance.vision.rangeTiles;
    let bad = 0;
    for (let hy = 0; hy < g.height; hy += 2) for (let hx = 0; hx < g.width; hx += 2) {
      if (!g.isFloor(hx, hy)) continue;
      for (const facing of [0, 45, 90, 135, 180, 225, 270, 315, 20]) {
        vm.update(g, cfg, { x: hx + 0.5, y: hy + 0.5, facing, lightAt });
        const half = cone[lightAt(hx, hy)] / 2;
        for (let y = Math.max(0, hy - 10); y <= Math.min(g.height - 1, hy + 10); y++) for (let x = Math.max(0, hx - 10); x <= Math.min(g.width - 1, hx + 10); x++) {
          if (!g.isFloor(x, y)) { if (vm.visAt(x, y)) bad++; continue; }
          const dx = x - hx;
          const dy = y - hy;
          let exp = true;
          if (dx || dy) {
            const d = Math.hypot(dx, dy);
            const diff = Math.abs((((Math.atan2(dy, dx) * 180 / Math.PI - facing) % 360) + 540) % 360 - 180);
            exp = (d <= 1.5 || (diff <= half && d <= Math.min(9, range[lightAt(x, y)]))) && g.hasLOS(hx, hy, x, y);
          }
          if (!!vm.visAt(x, y) !== exp) bad++;
        }
      }
    }
    expect(bad).toBe(0);
  });

  it('Panic narrows the cone and Tired L3 shortens the range, never below the minimum cone', () => {
    const w = world();
    const cfg = visionConfig(balance);
    const lightAt = () => 'lit';
    const vm = new VisionMap(w.width, w.height);
    const x = 14;
    const y = 10;
    vm.update(w.grid, cfg, { x: x + 0.5, y: y + 0.5, facing: 0, lightAt });
    const wide = vm.visible.reduce((a, b) => a + (b ? 1 : 0), 0);
    vm.update(w.grid, cfg, { x: x + 0.5, y: y + 0.5, facing: 0, lightAt, panicLevel: 3 });
    const narrow = vm.visible.reduce((a, b) => a + (b ? 1 : 0), 0);
    expect(narrow).toBeLessThan(wide);
    vm.update(w.grid, cfg, { x: x + 0.5, y: y + 0.5, facing: 0, lightAt, tiredLevel: 3 });
    const tired = vm.visible.reduce((a, b) => a + (b ? 1 : 0), 0);
    expect(tired).toBeLessThan(wide);
  });

  it('memory: tiles stay remembered after they leave the view and survive a save round trip', () => {
    const w = world();
    const cfg = visionConfig(balance);
    const vm = new VisionMap(w.width, w.height);
    vm.update(w.grid, cfg, { x: 2.5, y: 2.5, facing: 90, lightAt: lightOf(w) });
    const first = [...vm.seen].reduce((a, b) => a + b, 0);
    vm.update(w.grid, cfg, { x: 2.5, y: 2.5, facing: 270, lightAt: lightOf(w) });
    expect([...vm.seen].reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(first);
    const copy = new VisionMap(w.width, w.height);
    copy.deserialize(vm.serialize());
    expect(Array.from(copy.seen)).toEqual(Array.from(vm.seen));
    const wrong = new VisionMap(10, 10);
    wrong.deserialize(vm.serialize());
    expect([...wrong.seen].every((v) => v === 0)).toBe(true);
  });
});

describe('sound ripple limits (GDD 5.17)', () => {
  const cfg = visionConfig(balance);
  const hero = { x: 10.5, y: 10.5, facing: 0, coneAngle: 90, range: 4 };
  const vm = new VisionMap(30, 22);
  it('quiet sounds never ripple; noisy and loud do when unseen and in range', () => {
    expect(soundRipple(cfg, hero, { x: 14.5, y: 10.5 }, { hearRange: 12, noise: 'quiet', visionMap: vm })).toBeNull();
    expect(soundRipple(cfg, hero, { x: 14.5, y: 10.5 }, { hearRange: 12, noise: 'noisy', visionMap: vm })).not.toBeNull();
    expect(soundRipple(cfg, hero, { x: 14.5, y: 10.5 }, { hearRange: 12, noise: 'loud', visionMap: vm }).alpha).toBeCloseTo(0.4);
  });
  it('out of hearing range, on a Visible tile or on the hero tile: no ripple', () => {
    expect(soundRipple(cfg, hero, { x: 23.5, y: 10.5 }, { hearRange: 12, noise: 'loud', visionMap: vm })).toBeNull();
    expect(soundRipple(cfg, hero, { x: 14.5, y: 10.5 }, { hearRange: 12, noise: 'loud', sourceVisible: true })).toBeNull();
    expect(soundRipple(cfg, hero, { x: 10.5, y: 10.5 }, { hearRange: 12, noise: 'loud', visionMap: vm })).toBeNull();
  });
  it('behind or beside the cone the arc sits on the close circle (1.5 tiles), inside the cone at the range edge; far sounds are x0.6', () => {
    const behind = soundRipple(cfg, hero, { x: 6.5, y: 10.5 }, { hearRange: 12, noise: 'loud', visionMap: vm });
    expect(behind.behind).toBe(true);
    expect(behind.radiusTiles).toBe(1.5);
    const front = soundRipple(cfg, hero, { x: 15.5, y: 10.5 }, { hearRange: 12, noise: 'loud', visionMap: vm });
    expect(front.behind).toBe(false);
    expect(front.radiusTiles).toBe(4);
    const far = soundRipple(cfg, hero, { x: 20.5, y: 10.5 }, { hearRange: 12, noise: 'loud', visionMap: vm });
    expect(far.alpha).toBeCloseTo(0.4 * 0.6);
  });
});

describe('floor 15 data (Stage A)', () => {
  const w = world();
  const g = w.grid;

  it('has 3+ zombies, all on walkable tiles inside a room, with known types', () => {
    expect(w.zombies.length).toBeGreaterThanOrEqual(3);
    for (const z of w.zombies) {
      expect(balance.zombies.types[z.type], z.id).toBeTruthy();
      expect(g.isWalkable(z.x, z.y), `${z.id} on ${z.x},${z.y}`).toBe(true);
      expect(w.roomAt(z.x, z.y), z.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('the hero starts on a walkable bedroom tile in the home unit with the bed, workbench and front door defined', () => {
    const s = w.home.heroStart;
    expect(g.isWalkable(s.x, s.y)).toBe(true);
    expect(w.rooms[w.roomAt(s.x, s.y)].type).toBe('bedroom');
    expect(w.objectById.get(w.home.bed)).toBeTruthy();
    expect(w.objectById.get(w.home.workbench)).toBeTruthy();
    expect(w.doors.find((d) => d.id === w.home.frontDoor)?.kind).toBe('front');
  });

  it('every salvage object has a balance entry and a loot table or yield, and none overlap', () => {
    const seen = new Set();
    for (const o of w.objects) {
      if (o.id === w.home.workbench) continue;
      expect(balance.objects[o.objectId], `${o.id} ${o.objectId}`).toBeTruthy();
      for (const t of o.tiles) {
        const k = `${t.x},${t.y}`;
        if (!o.mounted) { expect(seen.has(k), `overlap at ${k} (${o.id})`).toBe(false); seen.add(k); }
        expect(g.isFloor(t.x, t.y), `${o.id} on void ${k}`).toBe(true);
      }
      const tbl = balance.objects[o.objectId].lootTable;
      if (tbl) expect(lootData.tables[tbl], `${o.id} loot table ${tbl}`).toBeTruthy();
    }
  });

  it('every door touches two floor tiles that are not furniture, so a hero can stand on either side', () => {
    for (const d of w.doors) {
      const [a, b] = g.doorTiles(d);
      expect(g.isFloor(a.x, a.y), d.id).toBe(true);
      expect(g.isFloor(b.x, b.y), d.id).toBe(true);
      expect(g.isWalkable(a.x, a.y) && g.isWalkable(b.x, b.y), `${d.id} blocked by furniture`).toBe(true);
    }
  });

  it('front doors start closed or jammed; 60% of interior doors are not all open (GDD 5.18 spread)', () => {
    for (const d of w.doors.filter((x) => x.kind === 'front')) expect(['closed', 'jammed']).toContain(d.state);
    const interior = w.doors.filter((x) => x.kind === 'interior');
    const closed = interior.filter((x) => x.state === 'closed').length;
    expect(closed / interior.length).toBeGreaterThan(0.25);
    expect(closed / interior.length).toBeLessThan(0.8);
  });

  it('every walkable tile can be reached from the hero start when closed and jammed doors are opened (stairs excluded)', () => {
    const s = w.home.heroStart;
    const missing = [];
    for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
      if (!g.isWalkable(x, y) || g.kindAt(x, y) !== 1) continue;
      const r = findPath(g, { x: s.x, y: s.y }, { x, y }, { mode: 'hero', throughLocked: true });
      if (!r.found) missing.push(`${x},${y}`);
    }
    expect(missing).toEqual([]);
  });

  it('every searchable object has a walkable access tile on its front side or a neighbour', () => {
    for (const o of w.objects) {
      if (o.id === w.home.workbench) continue;
      const out = [];
      for (const t of o.tiles) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = t.x + dx;
        const y = t.y + dy;
        if (g.isWalkable(x, y) && !o.tiles.some((q) => q.x === x && q.y === y)) out.push([x, y]);
      }
      expect(out.length, `${o.id} has no free neighbour tile`).toBeGreaterThan(0);
    }
  });

  it('light values are known and the tile lights follow the room light', () => {
    for (const l of new Set(w.light)) expect(['lit', 'grey', 'dim', 'dark']).toContain(l);
    for (const r of w.rooms) expect(['lit', 'grey', 'dim', 'dark'], r.id).toContain(r.light);
  });
});

describe('iso save (v2)', () => {
  it('stale saves are flagged, empty and iso saves are not', () => {
    expect(isStaleSave({ started: true, v: 1 })).toBe(true);
    expect(isStaleSave({ started: true, world: 'iso-0' })).toBe(true);
    expect(isStaleSave({})).toBe(false);
    expect(isStaleSave(undefined)).toBe(false);
    expect(isStaleSave({ started: true, world: ISO_WORLD })).toBe(false);
  });

  it('a junk iso save is repaired instead of throwing', () => {
    const w = world();
    const raw = { world: ISO_WORLD, started: true, hero: { x: 'a', y: null }, needs: { health: 'x', food: -5 }, zombies: { 'f15SW-z1': { hp: 'bad' }, ghost: { hp: 3 } }, doors: 3, objects: [], piles: [{ items: [{ id: 'nope', qty: 1 }], x: 1, y: 1 }], build: { barricade: { level: 99, hp: 5 } }, equipped: { slot: 'x' } };
    const s = normalizeIsoState(raw, balance, w, Date.now());
    expect(s.hero.x).toBe(w.home.heroStart.x + 0.5);
    expect(Number.isFinite(s.needs.health)).toBe(true);
    expect(s.zombies.ghost).toBeUndefined();
    expect(Number.isFinite(s.zombies['f15SW-z1'].hp)).toBe(true);
    expect(s.piles).toEqual([]);
    expect(s.build.barricade).toEqual({ level: 0, hp: 0 });
    expect(s.equipped).toBeNull();
    expect(normalizeIsoState({ started: true }, balance, w, 0)).toBeNull();
  });

  it('a hero saved on a void tile is moved back to the start', () => {
    const w = world();
    const s = normalizeIsoState({ world: ISO_WORLD, hero: { x: 11.5, y: 0.5, facing: 10 } }, balance, w, 0);
    expect(w.grid.isFloor(Math.floor(s.hero.x), Math.floor(s.hero.y))).toBe(true);
  });

  it('door states and damage round-trip through snapshotDoors and applyDoorsToGrid', () => {
    const w = world();
    const st = createIsoState(balance, w, 0);
    const d = w.doors.find((x) => x.id === 'f15SW-5.2.E');
    expect(d.state).toBe('closed');
    w.grid.setDoorState(d, 'open');
    d.hp = 33;
    snapshotDoors(st, w);
    const w2 = world();
    expect(w2.doors.find((x) => x.id === d.id).state).toBe('closed');
    applyDoorsToGrid(JSON.parse(JSON.stringify(st)), w2);
    const again = w2.doors.find((x) => x.id === d.id);
    expect(again.state).toBe('open');
    expect(again.hp).toBe(33);
    expect(w2.grid.moveClass(again.edge)).toBe(MOVE.OPEN);
  });

  it('a fresh state has no zombies dead, floor Infested, Stage A flags (no attacks, no tutorial)', () => {
    const w = world();
    const st = createIsoState(balance, w, 0);
    expect(Object.values(st.zombies).every((z) => !z.dead)).toBe(true);
    expect(st.floorStates[15]).toBe('Infested');
    expect(st.attacks.scriptedDone).toBe(true);
    expect(st.story.tutorial).toBe('skipped');
  });
});
