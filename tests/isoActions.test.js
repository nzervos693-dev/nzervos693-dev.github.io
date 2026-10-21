import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { noiseTiles, lightTimeMult, jamHit } from '../src/gameplay/isoActions.js';

describe('iso action rules', () => {
  it('noise radius in tiles', () => {
    expect(noiseTiles('quiet', balance)).toBe(0);
    expect(noiseTiles('noisy', balance)).toBe(8);
    expect(noiseTiles('loud', balance)).toBe(Infinity);
  });
  it('dim x1.5, dark x2', () => {
    expect(lightTimeMult('grey', balance)).toBe(1);
    expect(lightTimeMult('dim', balance)).toBe(1.5);
    expect(lightTimeMult('dark', balance)).toBe(2);
  });
  it('three hits open a jammed door', () => {
    const d = {};
    expect(jamHit(d, 3).opened).toBe(false);
    expect(jamHit(d, 3).opened).toBe(false);
    expect(jamHit(d, 3).opened).toBe(true);
  });
});
