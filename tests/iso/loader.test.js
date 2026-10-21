import { describe, it, expect } from 'vitest';
import data from '../../public/data/levels/floors_iso.json';
import balance from '../../public/data/balance.json';
import { loadIsoFloor, gridFacing, canonicalEdge, footprintOf } from '../../src/iso/loader.js';
import { EDGE, TILE } from '../../src/iso/grid.js';
import { findPath } from '../../src/iso/path.js';

const floor = loadIsoFloor(data, 15, balance);

describe('iso loader', () => {
  it('has the 30x22 floor and rooms', () => {
    expect(floor.width).toBe(30);
    expect(floor.height).toBe(22);
    expect(floor.rooms.length).toBeGreaterThan(10);
  });
  it('maps grid facings, not screen compass', () => {
    expect(gridFacing('N')).toBe(270);
    expect(gridFacing('E')).toBe(0);
    expect(gridFacing('S')).toBe(90);
    expect(gridFacing('W')).toBe(180);
  });
  it('canonicalises S/E edges', () => {
    expect(canonicalEdge(3, 4, 'S')).toEqual({ x: 3, y: 5, side: 'N' });
    expect(canonicalEdge(3, 4, 'E')).toEqual({ x: 4, y: 4, side: 'W' });
    expect(footprintOf([1, 1], [2, 2]).length).toBe(4);
  });
  it('derives walls between rooms and boundary, doors replace walls', () => {
    const g = floor.grid;
    expect(g.edgeType(2, 0, 'N')).toBe(EDGE.WINDOW); // NW bedroom north window (f15NW-2.0.N)
    expect(g.edgeType(0, 0, 'N')).toBe(EDGE.WALL);
    expect(g.edgeType(0, 10, 'N')).toBe(EDGE.WALL); // unit | corridor
    expect(g.edgeType(3, 10, 'N')).toBe(EDGE.WALL);
    expect(g.edgeType(3, 11, 'N')).toBe(EDGE.NONE); // inside the corridor
    for (const d of floor.doors) expect(g.edges[d.edge]).toBe(EDGE.DOOR);
    expect(floor.doors.length).toBe(data.floors.find((f) => f.number === 15).edges.doors.length);
    for (const w of floor.windows) expect(g.edges[w.eid]).toBe(EDGE.WINDOW);
  });
  it('fire door doorway is open, elevator door stays a wall', () => {
    const g = floor.grid;
    const fire = floor.doorways.find((d) => d.kind === 'fire_door_propped');
    const elev = floor.doorways.find((d) => d.kind === 'elevator_door_dead');
    expect(g.edges[g.edgeId(fire.edge.x, fire.edge.y, fire.edge.side)]).toBe(EDGE.NONE);
    expect(g.edges[g.edgeId(elev.edge.x, elev.edge.y, elev.edge.side)]).not.toBe(EDGE.NONE);
  });
  it('stairs are blocked, mounted objects do not block', () => {
    const g = floor.grid;
    expect(floor.stairs.down.length).toBe(10);
    for (const s of floor.stairs.down) { expect(g.kindAt(s.x, s.y)).toBe(TILE.STAIRS); expect(g.isWalkable(s.x, s.y)).toBe(false); }
    for (const o of floor.objects) for (const t of o.tiles) {
      if (o.mounted) continue;
      expect(g.isWalkable(t.x, t.y)).toBe(false);
    }
  });
  it('hero start is walkable and can reach the front door and the corridor', () => {
    const h = floor.home.heroStart;
    expect(floor.grid.isWalkable(h.x, h.y)).toBe(true);
    const r = findPath(floor.grid, { x: h.x, y: h.y }, { x: 6, y: 10 }, { mode: 'hero', throughLocked: true });
    expect(r.found).toBe(true);
  });
  it('every zombie stands on a walkable tile', () => {
    expect(floor.zombies.length).toBeGreaterThan(2);
    for (const z of floor.zombies) expect(floor.grid.isWalkable(z.x, z.y)).toBe(true);
  });
  it('the home stash is a fixture object on its data tile', () => {
    const s = floor.objectById.get('stash');
    expect(s.stash).toBe(true);
    expect(s.tile).toEqual(floor.home.stash.tile);
    expect(floor.grid.isWalkable(s.tile[0], s.tile[1])).toBe(false);
  });
  it('light: corridor ends are grey, middle dim', () => {
    expect(floor.light[10 * 30 + 1]).toBe('grey');
    expect(floor.light[10 * 30 + 15]).toBe('dim');
  });
});
