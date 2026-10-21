import { describe, it, expect } from 'vitest';
import balance from '../../public/data/balance.json';
import { VisionMap, VIS, visionConfig, coneAngle, viewRange, soundRipple } from '../../src/iso/vision.js';
import { facingToAngle } from '../../src/iso/projection.js';
import { ascii, room, put } from './helpers.js';
import { Grid } from '../../src/iso/grid.js';

const cfg = visionConfig(balance);
const open = (w = 30, h = 22) => new Grid(w, h);
const look = (g, x, y, facing, extra = {}) => new VisionMap(g.width, g.height).update(g, cfg, { x, y, facing, ...extra });
// facing +x (grid angle 0)

describe('vision cone', () => {
  it('config values come from balance', () => {
    expect(coneAngle(cfg, 'lit')).toBe(120);
    expect(coneAngle(cfg, 'dark')).toBe(70);
    expect(coneAngle(cfg, 'dark', 3)).toBe(40);
    expect(coneAngle(cfg, 'lit', 3)).toBe(90);
    expect(viewRange(cfg, 'dim')).toBe(4);
    expect(viewRange(cfg, 'lit', 3)).toBe(8);
    expect(viewRange(cfg, 'lit')).toBe(9);
  });
  it('sees along the facing up to range 9, not beyond', () => {
    const v = look(open(), 5, 11, 0);
    expect(v.visAt(13, 11)).not.toBe(VIS.NONE);
    expect(v.visAt(14, 11)).toBe(VIS.EDGE);
    expect(v.visAt(15, 11)).toBe(VIS.NONE);
    expect(v.visAt(1, 11)).toBe(VIS.NONE); // behind
  });
  it('cone edges at half the cone angle (lit: 60 deg)', () => {
    const v = look(open(), 5, 11, 0);
    // tile at 55 deg from facing (5 tiles out): inside; 65 deg: outside
    const at = (deg, r) => [5 + Math.round(r * Math.cos(deg * Math.PI / 180)), 11 + Math.round(r * Math.sin(deg * Math.PI / 180))];
    const [ix, iy] = at(40, 6);
    expect(v.visAt(ix, iy)).not.toBe(VIS.NONE);
    const [ox, oy] = at(80, 6);
    expect(v.visAt(ox, oy)).toBe(VIS.NONE);
    // soft edge band near the cone edge
    const [ex, ey] = at(55, 5);
    expect(v.visAt(ex, ey)).toBe(VIS.EDGE);
  });
  it('close circle sees all 8 neighbours behind the hero, any light, but not 2 tiles back', () => {
    const v = look(open(), 5, 11, 0, { lightAt: () => 'dark' });
    for (const [dx, dy] of [[-1, 0], [-1, -1], [-1, 1], [0, 1], [0, -1]]) expect(v.visAt(5 + dx, 11 + dy)).toBe(VIS.FULL);
    expect(v.visAt(3, 11)).toBe(VIS.NONE);
  });
  it('light: dark target tiles shorten range; lit room seen down a dark corridor', () => {
    const lightAt = (x) => (x > 10 ? 'lit' : 'dark');
    const v = look(open(), 5, 11, 0, { lightAt });
    expect(v.visAt(7, 11)).not.toBe(VIS.NONE); // 2 tiles, dark range 2.5
    expect(v.visAt(8, 11)).toBe(VIS.NONE); // 3 tiles, dark
    expect(v.visAt(11, 11)).not.toBe(VIS.NONE); // lit, 6 away
  });
  it('hero light narrows the cone', () => {
    const lit = look(open(), 5, 11, 0, { lightAt: () => 'lit' });
    const dark = look(open(), 5, 11, 0, { lightAt: (x, y) => (x === 5 && y === 11 ? 'dark' : 'lit') });
    // tile at about 50 deg off axis: in a 120 cone, out of a 70 cone
    expect(lit.visAt(8, 14)).not.toBe(VIS.NONE);
    expect(dark.visAt(8, 14)).toBe(VIS.NONE);
  });
  it('panic narrows the cone, never below 40', () => {
    const v = look(open(), 5, 11, 0, { panicLevel: 3 });
    expect(v.visAt(7, 14)).toBe(VIS.NONE); // 56 deg: inside a 120 cone, outside 90
    expect(look(open(), 5, 11, 0).visAt(7, 14)).not.toBe(VIS.NONE);
    expect(v.visAt(9, 11)).not.toBe(VIS.NONE);
  });
  it('tired L3+ shortens range by 1', () => {
    const v = look(open(), 5, 11, 0, { tiredLevel: 3 });
    expect(v.visAt(13, 11)).toBe(VIS.EDGE);
    expect(v.visAt(14, 11)).toBe(VIS.NONE);
  });
});

describe('vision shadows and memory', () => {
  it('a wall casts a shadow, but wall tile itself and its own far wall remain visible', () => {
    const l = room(12, 6);
    for (const cy of [1, 3, 5]) put(l, 10, cy, '|'); // wall W of x=5, rows 0-2
    const g = ascii(l);
    const v = look(g, 1, 1, 0);
    expect(v.visAt(4, 1)).not.toBe(VIS.NONE);
    expect(v.visAt(5, 1)).toBe(VIS.NONE);
    expect(v.visAt(8, 1)).toBe(VIS.NONE);
  });
  it('closed door blocks, open door shows the next room; jammed blocks; barricade does not', () => {
    const mk = (ch) => ascii(put(put(room(8, 1), 8, 1, ch), 0, 0, '+'));
    expect(look(mk('D'), 1, 0, 0).visAt(6, 0)).toBe(VIS.NONE);
    expect(look(mk('J'), 1, 0, 0).visAt(6, 0)).toBe(VIS.NONE);
    expect(look(mk('d'), 1, 0, 0).visAt(6, 0)).not.toBe(VIS.NONE);
    const g = mk('d');
    g.setBarricade(g.doorAt(4, 0, 'W'), { own: false, hp: 50 });
    expect(look(g, 1, 0, 0).visAt(6, 0)).not.toBe(VIS.NONE);
  });
  it('windows block sight', () => {
    const g = ascii(put(room(8, 1), 8, 1, 'w'));
    expect(look(g, 1, 0, 0).visAt(6, 0)).toBe(VIS.NONE);
  });
  it('closing a door makes tiles beyond it remembered at the next recompute', () => {
    const g = ascii(put(room(8, 1), 8, 1, 'd'));
    const vm = new VisionMap(8, 1);
    vm.update(g, cfg, { x: 1, y: 0, facing: 0 });
    expect(vm.stateOf(6, 0)).toBe('visible');
    g.setDoorState(g.doorAt(4, 0, 'W'), 'closed');
    vm.update(g, cfg, { x: 1, y: 0, facing: 0 });
    expect(vm.stateOf(6, 0)).toBe('remembered');
    expect(vm.stateOf(3, 0)).toBe('visible');
    expect(vm.isVisible(6.4, 0.5)).toBe(false);
  });
  it('unknown until seen; memory persists, saves and loads', () => {
    const g = open();
    const vm = new VisionMap(30, 22);
    expect(vm.stateOf(8, 11)).toBe('unknown');
    vm.update(g, cfg, { x: 5, y: 11, facing: 0 });
    vm.update(g, cfg, { x: 5, y: 11, facing: 180 });
    expect(vm.stateOf(9, 11)).toBe('remembered');
    expect(vm.stateOf(2, 11)).toBe('visible');
    const b64 = vm.serialize();
    const vm2 = new VisionMap(30, 22);
    vm2.deserialize(b64);
    expect(vm2.stateOf(9, 11)).toBe('remembered');
    expect(vm2.stateOf(29, 0)).toBe('unknown');
    vm2.deserialize('###');
    expect(vm2.stateOf(9, 11)).toBe('unknown');
    vm2.markSeenRect(0, 0, 3, 3);
    expect(vm2.isKnown(2, 2)).toBe(true);
  });
  it('void tiles are never visible and stop sight', () => {
    const g = open(10, 1);
    g.setKind(4, 0, 0);
    const v = look(g, 1, 0, 0);
    expect(v.visAt(4, 0)).toBe(VIS.NONE);
    expect(v.visAt(6, 0)).toBe(VIS.NONE);
  });
  it('maybeUpdate throttles to 10 Hz and triggers on tile/turn/door change', () => {
    const g = ascii(put(room(8, 1), 8, 1, 'd'));
    const vm = new VisionMap(8, 1);
    const view = { x: 1, y: 0, facing: 0 };
    expect(vm.maybeUpdate(g, cfg, view, 1000)).toBe(true);
    expect(vm.maybeUpdate(g, cfg, view, 1200)).toBe(false); // nothing changed
    expect(vm.maybeUpdate(g, cfg, { ...view, facing: 10 }, 1300)).toBe(false); // < 15 deg
    expect(vm.maybeUpdate(g, cfg, { ...view, facing: 20 }, 1050)).toBe(false); // throttled (<100 ms)
    expect(vm.maybeUpdate(g, cfg, { ...view, facing: 20 }, 1100)).toBe(true);
    g.setDoorState(g.doorAt(4, 0, 'W'), 'closed');
    expect(vm.maybeUpdate(g, cfg, { ...view, facing: 20 }, 1150)).toBe(false);
    expect(vm.maybeUpdate(g, cfg, { ...view, facing: 20 }, 1200)).toBe(true);
    expect(vm.maybeUpdate(g, cfg, { ...view, x: 2 }, 1400)).toBe(true);
  });
  it('performance smoke: 30x22 floor with rooms, many recomputes', () => {
    const l = room(30, 22);
    for (let x = 5; x < 30; x += 6) for (let y = 0; y < 22; y++) if (y % 5 !== 0) put(l, 2 * x, 2 * y + 1, '|');
    const g = ascii(l);
    const vm = new VisionMap(30, 22);
    const t = performance.now();
    const N = 200;
    for (let i = 0; i < N; i++) vm.update(g, cfg, { x: 3 + (i % 20), y: 5 + (i % 10), facing: (i * 37) % 360 });
    const per = (performance.now() - t) / N;
    expect(per).toBeLessThan(3);
  });
});

describe('vision inputs', () => {
  it('floors fractional hero tile and ignores out-of-bounds', () => {
    const g = open();
    const vm = new VisionMap(30, 22);
    vm.update(g, cfg, { x: 5.7, y: 11.2, facing: 0 });
    expect(vm.visAt(5, 11)).toBe(VIS.FULL);
    const rev = vm.revision;
    vm.update(g, cfg, { x: -3, y: 4, facing: 0 });
    expect(vm.revision).toBe(rev);
  });
  it('maybeUpdate reacts to light version, panic and tired changes', () => {
    const g = open();
    const vm = new VisionMap(30, 22);
    const v = { x: 5, y: 5, facing: 0, lightVersion: 0 };
    vm.maybeUpdate(g, cfg, v, 0);
    expect(vm.maybeUpdate(g, cfg, v, 500)).toBe(false);
    expect(vm.maybeUpdate(g, cfg, { ...v, lightVersion: 1 }, 1000)).toBe(true);
    expect(vm.maybeUpdate(g, cfg, { ...v, lightVersion: 1, panicLevel: 2 }, 1500)).toBe(true);
    expect(vm.maybeUpdate(g, cfg, { ...v, lightVersion: 1, panicLevel: 2, tiredLevel: 3 }, 2000)).toBe(true);
  });
  it('deserialize rejects a different map size', () => {
    const a = new VisionMap(30, 22);
    a.markSeenRect(0, 0, 5, 5);
    const b = new VisionMap(20, 20);
    b.deserialize(a.serialize());
    expect(b.isKnown(1, 1)).toBe(false);
  });
});

describe('sound ripple', () => {
  const hero = { x: 5, y: 5, facing: 0, coneAngle: 120 };
  const base = { hearRange: 12, noise: 'loud', sourceVisible: false };
  it('behind = outside coneAngle/2; radius follows', () => {
    const side = soundRipple(cfg, { ...hero, range: 7 }, { x: 5, y: 9 }, base); // 90 deg off, cone half 60
    expect(side.behind).toBe(true);
    expect(side.radiusTiles).toBe(cfg.closeRadius);
    const front = soundRipple(cfg, { ...hero, range: 7 }, { x: 10, y: 6 }, base);
    expect(front.behind).toBe(false);
    expect(front.radiusTiles).toBe(7);
  });
  it('filters: quiet, out of hear range, visible source, own tile; far alpha mult', () => {
    expect(soundRipple(cfg, hero, { x: 8, y: 5 }, { ...base, noise: 'quiet' })).toBeNull();
    expect(soundRipple(cfg, hero, { x: 20, y: 5 }, base)).toBeNull();
    expect(soundRipple(cfg, hero, { x: 20, y: 5 }, { ...base, hearRange: 15 })).not.toBeNull();
    expect(soundRipple(cfg, hero, { x: 8, y: 5 }, { ...base, sourceVisible: true })).toBeNull();
    expect(soundRipple(cfg, hero, hero, base)).toBeNull();
    const near = soundRipple(cfg, hero, { x: 8, y: 5 }, base);
    const far = soundRipple(cfg, hero, { x: 15, y: 5 }, base);
    expect(near.alpha).toBe(0.4);
    expect(far.alpha).toBeCloseTo(0.4 * 0.6);
    expect(soundRipple(cfg, hero, { x: 8, y: 5 }, { ...base, noise: 'noisy' }).alpha).toBe(0.25);
  });
  it('uses the visibility map when given', () => {
    const vm = look(open(), 5, 5, 0);
    expect(soundRipple(cfg, hero, { x: 8, y: 5 }, { ...base, visionMap: vm })).toBeNull();
    expect(soundRipple(cfg, hero, { x: 2, y: 5 }, { ...base, visionMap: vm })).not.toBeNull(); // behind, not visible
  });
});
