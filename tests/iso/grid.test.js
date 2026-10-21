import { describe, it, expect } from 'vitest';
import { Grid, MOVE, EDGE, TILE } from '../../src/iso/grid.js';
import { ascii, room, put } from './helpers.js';

describe('grid', () => {
  it('parses ascii: tiles, walls, doors, windows', () => {
    const l = room(4, 3);
    put(l, 4, 1, '|'); // W edge of (2,0)
    put(l, 5, 2, 'D'); // N... y=2 even => N edge of tile (2,1)
    const g = ascii(l);
    expect(g.width).toBe(4);
    expect(g.height).toBe(3);
    expect(g.edgeType(2, 0, 'W')).toBe(EDGE.WALL);
    expect(g.doorAt(2, 1, 'N').state).toBe('closed');
    expect(g.doorAt(2, 0, 'S')).toBe(g.doorAt(2, 1, 'N'));
    expect(g.doorAt(2, 1, 'N').maxHp).toBe(60);
  });
  it('fromDescription works and door HP follows kind', () => {
    const g = Grid.fromDescription({
      width: 3, height: 1, tiles: ['.#S'], edges: [{ x: 1, y: 0, side: 'W', type: 'wall' }],
      doors: [{ id: 'front', x: 0, y: 0, side: 'N', kind: 'front' }],
    }, { interiorHp: 60, frontHp: 120 });
    expect(g.kindAt(1, 0)).toBe(TILE.VOID);
    expect(g.kindAt(2, 0)).toBe(TILE.STAIRS);
    expect(g.doorById('front').hp).toBe(120);
    expect(g.isWalkable(1, 0)).toBe(false);
    expect(g.isWalkable(-1, 0)).toBe(false);
  });
  it('door classes and sight', () => {
    const g = ascii(put(room(3, 1), 2, 1, 'D'));
    const e = g.edgeBetween(0, 0, 1, 0);
    expect(g.moveClass(e)).toBe(MOVE.CLOSED);
    expect(g.edgeBlocksSight(e)).toBe(true);
    const d = g.doorAt(1, 0, 'W');
    g.setDoorState(d, 'open');
    expect(g.moveClass(e)).toBe(MOVE.OPEN);
    expect(g.edgeBlocksSight(e)).toBe(false);
    g.setDoorState(d, 'jammed');
    expect(g.moveClass(e)).toBe(MOVE.LOCKED);
    expect(g.edgeBlocksSight(e)).toBe(true);
    g.setDoorState(d, 'open');
    g.setBarricade(d, { own: false, hp: 50 });
    expect(g.moveClass(e)).toBe(MOVE.LOCKED);
    expect(g.edgeBlocksSight(e)).toBe(false); // barricades never block sight
  });
  it('own barricade squeezes (hero), 0 HP barricade does not exist, damageBarricade', () => {
    const g = ascii(put(room(3, 1), 2, 1, 'd'));
    const d = g.doorAt(1, 0, 'W');
    g.setBarricade(d, { own: true, hp: 10 });
    expect(g.moveClass(d.edge)).toBe(MOVE.SQUEEZE);
    expect(g.edgeBlocksSight(d.edge)).toBe(false);
    expect(g.damageBarricade(d, 4)).toBe(false);
    expect(g.damageBarricade(d, 6)).toBe(true);
    expect(g.moveClass(d.edge)).toBe(MOVE.OPEN);
    g.setBarricade(d, { own: true, hp: 10 });
    g.setDoorState(d, 'jammed');
    expect(g.moveClass(d.edge)).toBe(MOVE.LOCKED);
  });
  it('damageDoor breaks at 0 and bumps version', () => {
    const g = ascii(put(room(3, 1), 2, 1, 'D'));
    const d = g.doorAt(1, 0, 'W');
    const v = g.version;
    expect(g.damageDoor(d, 59)).toBe(false);
    expect(g.damageDoor(d, 5)).toBe(true);
    expect(d.state).toBe('broken');
    expect(g.version).toBeGreaterThan(v);
    expect(g.moveClass(d.edge)).toBe(MOVE.OPEN);
  });
  it('diagonals cannot cut wall corners', () => {
    const l = room(2, 2);
    put(l, 2, 1, '|'); // wall between (0,0) and (1,0)
    const g = ascii(l);
    expect(g.stepClass(0, 0, 1, 1)).toBe(MOVE.BLOCK);
    expect(g.stepClass(1, 0, -1, 1)).toBe(MOVE.BLOCK);
    expect(g.stepClass(0, 1, 1, -1)).toBe(MOVE.BLOCK);
    expect(g.stepClass(0, 1, 1, 0)).toBe(MOVE.OPEN);
  });
  it('obstacles block walking and corner cutting but not sight', () => {
    const g = ascii(room(3, 3));
    g.setObstacle(1, 0, true);
    expect(g.stepClass(0, 0, 1, 0)).toBe(MOVE.BLOCK);
    expect(g.stepClass(0, 0, 1, 1)).toBe(MOVE.BLOCK);
    expect(g.hasLOS(0, 0, 2, 0)).toBe(true);
  });
  it('nearestWalkable snaps within range', () => {
    const g = ascii(room(4, 4));
    g.setObstacle(1, 1, true);
    expect(g.nearestWalkable(1, 1, 1.5)).not.toBeNull();
    expect(g.nearestWalkable(9, 9, 1.5)).toBeNull();
  });
  it('LOS: walls block, own far walls do not, corners are strict', () => {
    const l = room(4, 4);
    put(l, 4, 3, '|'); put(l, 4, 5, '|'); // wall W of (2,1) and (2,2)
    const g = ascii(l);
    expect(g.hasLOS(0, 1, 3, 1)).toBe(false);
    expect(g.hasLOS(0, 0, 3, 0)).toBe(true);
    expect(g.hasLOS(0, 1, 1, 1)).toBe(true);
    // diagonal through the corner point between four tiles with one wall on the cross
    const l2 = room(3, 3);
    put(l2, 3, 2, '-'); // N edge of (1,1)
    const g2 = ascii(l2);
    expect(g2.hasLOS(0, 0, 2, 2)).toBe(false); // passes corner (1,1) with an edge there
    expect(g2.hasLOS(0, 2, 2, 0)).toBe(false);
  });
});
