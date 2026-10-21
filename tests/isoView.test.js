import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import data from '../public/data/levels/floors_iso.json';
import { loadIsoFloor } from '../src/iso/loader.js';
import { VisionMap, VIS, visionConfig } from '../src/iso/vision.js';
import {
  shade, REMEMBERED_SHADE, tileBrightness, tintOf, activeRooms, wallIsCut, rectsOverlap, doorStage, doorFrameName, barricadeArtStage, propOrientation,
} from '../src/gameplay/isoView.js';

const floor = loadIsoFloor(data, 15, balance);
const cfg = balance.vision;

describe('vision brightness', () => {
  it('unknown is black, remembered dim, visible by light, edge darker, close circle lighter', () => {
    expect(tileBrightness(cfg, VIS.NONE, false, 'grey', false)).toBe(0);
    expect(tileBrightness(cfg, VIS.NONE, true, 'grey', false)).toBeCloseTo(0.18);
    expect(tileBrightness(cfg, VIS.FULL, true, 'grey', false)).toBeCloseTo(0.7);
    expect(tileBrightness(cfg, VIS.FULL, true, 'dark', false)).toBeCloseTo(0.3);
    expect(tileBrightness(cfg, VIS.EDGE, true, 'grey', false)).toBeCloseTo(0.2);
    expect(tileBrightness(cfg, VIS.FULL, true, 'dim', true)).toBeGreaterThan(tileBrightness(cfg, VIS.FULL, true, 'dim', false));
  });
  it('tint is grey when visible', () => {
    expect(tintOf(1, false)).toBe(0xffffff);
    expect(tintOf(0, false)).toBe(0);
  });
});

describe('cutaway', () => {
  it('walls south/east of the hero room are stubs; north/west walls are not', () => {
    const vm = new VisionMap(30, 22);
    const active = new Uint8Array(floor.rooms.length);
    activeRooms(floor, vm, { x: 2, y: 2 }, active);
    const hr = floor.roomAt(2, 2);
    expect(active[hr]).toBe(1);
    const south = floor.walls.find((w) => w.side === 'N' && w.a.x === 2 && w.a.y === 4 && w.roomA === hr) // bedroom|kitchen edge
      ?? floor.walls.find((w) => w.roomA === hr && w.side === 'N');
    expect(wallIsCut(south, active)).toBe(true);
    const north = floor.walls.find((w) => w.roomB === hr && w.side === 'N');
    expect(wallIsCut(north, active)).toBe(north.roomA >= 0 && active[north.roomA] === 1);
    const outer = floor.walls.find((w) => w.roomA === -1 && w.roomB === hr);
    expect(wallIsCut(outer, active)).toBe(false);
  });
  it('rooms with a visible tile count', () => {
    const vm = new VisionMap(30, 22);
    vm.visible[10 * 30 + 5] = VIS.FULL;
    const active = new Uint8Array(floor.rooms.length);
    activeRooms(floor, vm, { x: 2, y: 2 }, active);
    expect(active[floor.roomAt(5, 10)]).toBe(1);
  });
});

describe('view helpers', () => {
  it('rect overlap', () => {
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 5, y0: 5, x1: 15, y1: 15 })).toBe(true);
    expect(rectsOverlap({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 10, y0: 0, x1: 20, y1: 10 })).toBe(false);
  });
  it('door damage stages by HP ratio', () => {
    expect(doorStage(60, 60)).toBe(0);
    expect(doorStage(39, 60)).toBe(1);
    expect(doorStage(19, 60)).toBe(2);
    expect(doorFrameName({ state: 'closed', kind: 'front', hp: 120, maxHp: 120 }, 'x', false)).toBe('frontdoor_x_full_closed');
    expect(doorFrameName({ state: 'closed', kind: 'front', hp: 30, maxHp: 120 }, 'y', true)).toBe('door_y_stub_hanging');
    expect(doorFrameName({ state: 'jammed', kind: 'interior', hp: 60, maxHp: 60 }, 'y', false)).toBe('door_y_full_jammed');
  });
  it('barricade art stages', () => {
    expect([0, 1, 2, 3, 4].map(barricadeArtStage)).toEqual([0, 0, 1, 2, 2]);
  });
  it('prop orientation', () => {
    expect(propOrientation([2, 1], 'S')).toEqual({ suffix: 'a', flip: false });
    expect(propOrientation([1, 2], 'S')).toEqual({ suffix: 'b', flip: false });
    expect(propOrientation([1, 1], 'N')).toEqual({ suffix: 'a', flip: true });
  });
});

describe('readability curve', () => {
  it('unknown stays black; remembered is dim but above black; visible keeps its order', () => {
    expect(shade(0)).toBe(0);
    expect(shade(0.18, true)).toBe(REMEMBERED_SHADE);
    const grey = shade(tileBrightness(cfg, VIS.FULL, true, 'grey', false));
    const dim = shade(tileBrightness(cfg, VIS.FULL, true, 'dim', false));
    const dark = shade(tileBrightness(cfg, VIS.FULL, true, 'dark', false));
    expect(grey).toBeGreaterThan(dim);
    expect(dim).toBeGreaterThan(dark);
    expect(dark).toBeGreaterThan(REMEMBERED_SHADE);
  });
});
