import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { napRemainingMs, napCooldownLabel, napAction, completeNap } from '../src/gameplay/nap.js';

const H = 3600000;
const mk = (over = {}) => ({ lastNapAt: null, needs: { energy: 50, food: 80, water: 80, morale: 50, health: 100 }, ...over });

describe('nap', () => {
  it('cooldown counts down and clamps', () => {
    const s = mk({ lastNapAt: 1000 });
    expect(napRemainingMs(s, 1000, balance)).toBe(4 * H);
    expect(napRemainingMs(s, 1000 + 1.5 * H, balance)).toBe(2.5 * H);
    expect(napRemainingMs(s, 1000 + 4 * H, balance)).toBe(0);
    expect(napRemainingMs(s, 1000 + 99 * H, balance)).toBe(0);
    expect(napRemainingMs(s, 1000 - 10 * H, balance)).toBe(4 * H); // clock set backward
    expect(napRemainingMs(mk(), 5, balance)).toBe(0);
    expect(napRemainingMs(mk({ lastNapAt: NaN }), 5, balance)).toBe(0);
  });
  it('labels round up to the minute', () => {
    expect(napCooldownLabel(2 * H + 10 * 60000)).toBe('Nap (2h 10m)');
    expect(napCooldownLabel(45 * 60000)).toBe('Nap (45m)');
    expect(napCooldownLabel(44 * 60000 + 1)).toBe('Nap (45m)');
    expect(napCooldownLabel(2 * H)).toBe('Nap (2h)');
    expect(napCooldownLabel(1)).toBe('Nap (1m)');
  });
  it('button states', () => {
    expect(napAction(mk(), 0, balance)).toMatchObject({ label: 'Nap', enabled: true });
    expect(napAction(mk(), 0, balance, { unsafe: true })).toMatchObject({ enabled: false, reason: 'Not safe' });
    expect(napAction(mk({ needs: { ...mk().needs, energy: 100 } }), 0, balance)).toMatchObject({ enabled: false, reason: 'Rested' });
    const cd = napAction(mk({ lastNapAt: 0 }), 1 * H, balance);
    expect(cd.enabled).toBe(false);
    expect(cd.label).toBe('Nap (3h)');
  });
  it('completes with caps and floors', () => {
    const s = mk({ needs: { energy: 90, food: 3, water: 80, morale: 99, health: 100 } });
    const r = completeNap(s, 777, balance);
    expect(r.energy).toBe(10);
    expect(s.needs).toMatchObject({ energy: 100, food: 0, water: 75, morale: 100 });
    expect(s.lastNapAt).toBe(777);
  });
});
