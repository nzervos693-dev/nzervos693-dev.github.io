import { describe, it, expect } from 'vitest';
import { elapsedSince, elapsedInfo } from '../src/core/clock.js';

const H = 3600 * 1000;
describe('clock', () => {
  it('returns elapsed time under the cap', () => {
    expect(elapsedSince(1000, 1000 + 2 * H, 12 * H)).toBe(2 * H);
  });
  it('caps catch-up', () => {
    const i = elapsedInfo(1000, 1000 + 30 * H, 12 * H);
    expect(i.elapsedMs).toBe(12 * H);
    expect(i.rawMs).toBe(30 * H);
    expect(i.capped).toBe(true);
  });
  it('treats a backwards clock as 0', () => {
    expect(elapsedSince(5000, 1000, 12 * H)).toBe(0);
  });
  it('treats a never-saved game as 0', () => {
    expect(elapsedSince(0, 999999999, 12 * H)).toBe(0);
  });
});

import { offlineCapMs } from '../src/core/balance.js';
describe('edge cases', () => {
  it('offlineCapMs handles bad values', () => {
    expect(offlineCapMs({})).toBe(12 * H);
    expect(offlineCapMs({ time: { offlineCapHours: 'x' } })).toBe(12 * H);
    expect(offlineCapMs({ time: { offlineCapHours: -3 } })).toBe(12 * H);
    expect(offlineCapMs({ time: { offlineCapHours: 6 } })).toBe(6 * H);
  });
  it('NaN or future last save gives 0', () => {
    expect(elapsedSince(NaN, 5000, H)).toBe(0);
    expect(elapsedSince(9e12, 5000, H)).toBe(0);
  });
});

import { DEFAULT_BALANCE } from '../src/core/balance.js';
describe('bundled balance', () => {
  it('offlineCapMs works with the bundled default', () => {
    expect(DEFAULT_BALANCE.version).toBeDefined();
    expect(offlineCapMs(DEFAULT_BALANCE)).toBeGreaterThan(0);
    expect(offlineCapMs()).toBeGreaterThan(0);
  });
});
