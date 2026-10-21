import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { isoConfig, tileCenterToScreen, bodyAnchor } from '../src/iso/projection.js';
import { resolveTap, pickInteractable } from '../src/gameplay/isoTap.js';
import { ascii, room, put } from './iso/helpers.js';

const cfg = isoConfig(balance);
const grid = ascii(room(10, 10));
grid.setObstacle(5, 5, true);
const base = (o = {}) => ({ zombies: [], hero: null, interactables: [], stairTiles: [], grid, ...o });
const at = (tx, ty) => tileCenterToScreen(cfg, tx, ty);

describe('tap resolution order (GDD 4)', () => {
  it('a visible zombie beats the hero, an object and the floor', () => {
    const b = bodyAnchor(cfg, 3, 3);
    const ctx = base({
      zombies: [{ id: 'z', x: b.x, y: b.y, w: 96, h: 96, depth: 5 }],
      hero: { id: 'hero', x: b.x, y: b.y, w: 96, h: 96, depth: 4 },
      interactables: [{ id: 'o', x: b.x, y: b.y, w: 96, h: 96, depth: 9 }],
    });
    expect(resolveTap(cfg, ctx, b.x + 10, b.y).type).toBe('zombie');
    ctx.zombies = [];
    expect(resolveTap(cfg, ctx, b.x + 10, b.y).type).toBe('hero');
    ctx.hero = null;
    expect(resolveTap(cfg, ctx, b.x + 10, b.y).type).toBe('interact');
  });
  it('plain walkable floor walks; a blocked tile snaps to the nearest walkable one', () => {
    const p = at(2, 2);
    expect(resolveTap(cfg, base(), p.x, p.y)).toMatchObject({ type: 'floor', x: 2, y: 2 });
    const q = at(5, 5);
    const r = resolveTap(cfg, base(), q.x, q.y);
    expect(r.type).toBe('floor');
    expect(r.snapped).toBe(true);
  });
  it('outside the floor does nothing', () => {
    const p = at(-6, 3);
    expect(resolveTap(cfg, base(), p.x, p.y).type).toBe('none');
  });
  it('stairs tiles are tappable (diamond test) and come before the floor', () => {
    const p = at(2, 2);
    expect(resolveTap(cfg, base({ stairTiles: [{ x: 2, y: 2 }] }), p.x, p.y).type).toBe('stairs');
  });
  it('forgiveness: a tap on a blocked tile snaps to an interactable within 96 px', () => {
    const q = at(5, 5);
    const o = { id: 'o', x: q.x + 60, y: q.y, w: 10, h: 10, depth: 1, ax: q.x + 60, ay: q.y };
    const r = resolveTap(cfg, base({ interactables: [o] }), q.x, q.y);
    expect(r).toMatchObject({ type: 'interact', snapped: true });
  });
});

describe('overlapping padded rects', () => {
  const a = { id: 'bed', x: 0, y: 0, w: 150, h: 110, depth: 3, ax: 0, ay: 0 };
  const b = { id: 'chair', x: 70, y: 10, w: 96, h: 110, depth: 9, ax: 70, ay: 10 };
  it('the front-most solid sprite wins, not the front-most padded rect', () => {
    const ctx = base({ interactables: [a, b], pixelHit: (c) => c.id === 'bed' });
    expect(pickInteractable(cfg, ctx, 30, 0).id).toBe('bed');
  });
  it('without a solid hit the nearest anchor wins', () => {
    const ctx = base({ interactables: [a, b], pixelHit: () => false });
    expect(pickInteractable(cfg, ctx, 10, 0).id).toBe('bed');
    expect(pickInteractable(cfg, ctx, 62, 12).id).toBe('chair');
  });
});
