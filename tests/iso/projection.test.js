import { describe, it, expect } from 'vitest';
import balance from '../../public/data/balance.json';
import {
  isoConfig, tileCenterToScreen, screenToTile, screenToWorld, worldToScreen, depthKey, LAYER, footprintDepthKey,
  nearestInteractable, pickByRect, angleToFacing, facingToAngle, screenDeltaToAngle, angleToScreenVec, angleDiff,
  pointInTileDiamond, bodyAnchor, wallDepthKey, angleToSpriteFacing,
} from '../../src/iso/projection.js';

const cfg = isoConfig(balance);

describe('iso projection', () => {
  it('uses the 96x48 balance diamonds', () => {
    expect(cfg.tileW).toBe(96);
    expect(cfg.tileH).toBe(48);
  });
  it('tile centre round-trips for the whole 30x22 floor', () => {
    for (let y = 0; y < 22; y++) for (let x = 0; x < 30; x++) {
      const s = tileCenterToScreen(cfg, x, y);
      expect(s.x).toBe((x - y) * 48);
      expect(s.y).toBe((x + y + 1) * 24);
      expect(screenToTile(cfg, s.x, s.y)).toEqual({ x, y });
    }
  });
  it('points inside a diamond pick that tile', () => {
    const c = tileCenterToScreen(cfg, 5, 7);
    for (const [ox, oy] of [[40, 0], [-40, 0], [0, 20], [0, -20], [20, 10]]) {
      expect(screenToTile(cfg, c.x + ox, c.y + oy)).toEqual({ x: 5, y: 7 });
    }
  });
  it('world <-> screen continuous round trip', () => {
    const s = worldToScreen(cfg, 3.3, 9.9);
    const w = screenToWorld(cfg, s.x, s.y);
    expect(w.x).toBeCloseTo(3.3);
    expect(w.y).toBeCloseTo(9.9);
  });
  it('body anchor is raised', () => {
    expect(bodyAnchor(cfg, 0, 0).y).toBe(24 - 40);
  });
  it('depth: later x+y draws in front; layers order within a tile; footprint uses front tile', () => {
    expect(depthKey(3, 4, 0)).toBeLessThan(depthKey(4, 4, 0));
    expect(depthKey(3, 3, LAYER.FLOOR)).toBeLessThan(depthKey(3, 3, LAYER.WALL_NW));
    expect(depthKey(3, 3, LAYER.WALL_NW)).toBeLessThan(depthKey(3, 3, LAYER.OBJECT));
    expect(depthKey(3, 3, LAYER.OBJECT)).toBeLessThan(depthKey(3, 3, LAYER.WALL_SE));
    expect(depthKey(3, 3, LAYER.WALL_SE)).toBeLessThan(depthKey(4, 3, LAYER.FLOOR));
    expect(footprintDepthKey(3, 3, 1, 2, LAYER.OBJECT)).toBe(depthKey(3, 4, LAYER.OBJECT));
  });
  it('characters win depth ties against objects; wall depth helper', () => {
    expect(depthKey(3, 4, LAYER.OBJECT)).toBeLessThan(depthKey(3, 4, LAYER.CHARACTER));
    expect(footprintDepthKey(3, 3, 1, 2, LAYER.OBJECT)).toBeLessThan(depthKey(3, 4, LAYER.CHARACTER));
    expect(depthKey(3, 4, LAYER.CHARACTER)).toBeLessThan(depthKey(3, 4, LAYER.WALL_SE));
    expect(wallDepthKey(2, 2, 'N')).toBe(depthKey(2, 2, LAYER.WALL_NW));
    expect(wallDepthKey(2, 2, 'W')).toBe(depthKey(2, 2, LAYER.WALL_NW));
    expect(wallDepthKey(2, 2, 'S')).toBe(depthKey(2, 2, LAYER.WALL_SE));
  });
  it('sprite facing uses screen-space 45 degree sectors', () => {
    for (const n of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) {
      expect(angleToSpriteFacing(cfg, facingToAngle(n))).toBe(n);
    }
    // grid angle 340 is 20 deg from SE in grid space but projects nearer screen-E
    expect(angleToFacing(340)).toBe('SE');
    expect(angleToSpriteFacing(cfg, 340)).toBe('E');
  });
  it('tap forgiveness picks nearest within 96 px, none beyond', () => {
    const c = [{ id: 'a', x: 100, y: 100 }, { id: 'b', x: 150, y: 100 }];
    expect(nearestInteractable(cfg, c, 140, 100).id).toBe('b');
    expect(nearestInteractable(cfg, c, 100, 190).id).toBe('a');
    expect(nearestInteractable(cfg, c, 100, 400)).toBeNull();
    expect(nearestInteractable(cfg, c, 100, 196).id).toBe('a'); // exactly 96: inside
  });
  it('rect pick pads small sprites to 96 and prefers front-most', () => {
    const c = [{ id: 'far', x: 0, y: 0, w: 10, h: 10, depth: 1 }, { id: 'near', x: 30, y: 0, w: 10, h: 10, depth: 5 }];
    expect(pickByRect(cfg, c, 20, 0).id).toBe('near');
    expect(pickByRect(cfg, c, -40, 0).id).toBe('far');
    expect(pickByRect(cfg, c, 200, 0)).toBeNull();
  });
  it('facing names map to grid angles and back; screen up = grid (-1,-1)', () => {
    expect(angleToFacing(facingToAngle('N'))).toBe('N');
    for (const n of ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']) expect(angleToFacing(facingToAngle(n))).toBe(n);
    const up = angleToScreenVec(cfg, facingToAngle('N'));
    expect(up.x).toBeCloseTo(0);
    expect(up.y).toBeCloseTo(-1);
    expect(angleDiff(350, 10)).toBe(20);
  });
  it('finger direction maps to the grid angle that projects under it', () => {
    const a = screenDeltaToAngle(cfg, 0, -100);
    expect(angleDiff(a, facingToAngle('N'))).toBeCloseTo(0);
    const a2 = screenDeltaToAngle(cfg, 100, 0);
    expect(angleDiff(a2, facingToAngle('E'))).toBeCloseTo(0);
  });
  it('diamond hit test', () => {
    const c = tileCenterToScreen(cfg, 2, 2);
    expect(pointInTileDiamond(cfg, 2, 2, c.x + 47, c.y)).toBe(true);
    expect(pointInTileDiamond(cfg, 2, 2, c.x + 47, c.y + 20)).toBe(false);
  });
});
