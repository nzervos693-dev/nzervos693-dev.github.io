import { describe, it, expect } from 'vitest';
import { hitSoundClass, pickVariant, hitSoundKey, wantsDecal, decalAlpha, HIT_FX } from '../src/gameplay/hitfx.js';

describe('hit fx rules', () => {
  it('maps weapons to sound classes with blunt fallback', () => {
    expect(hitSoundClass('kitchen_knife')).toBe('stab');
    expect(hitSoundClass('pipe_spear')).toBe('stab');
    expect(hitSoundClass('fists')).toBe('punch');
    expect(hitSoundClass('spiked_bat')).toBe('blunt');
    expect(hitSoundClass('mystery_weapon')).toBe('blunt');
  });
  it('never repeats the previous variant and stays in range', () => {
    for (let last = 1; last <= 3; last++) {
      for (const r of [0, 0.34, 0.67, 0.999]) {
        const n = pickVariant(3, last, () => r);
        expect(n).not.toBe(last);
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(3);
      }
    }
    let last = 0;
    for (let i = 0; i < 200; i++) { const n = pickVariant(2, last); expect(n).not.toBe(last); last = n; }
  });
  it('builds keys and tracks last variant per class', () => {
    const last = {};
    const a = hitSoundKey('fists', last, () => 0);
    const b = hitSoundKey('fists', last, () => 0);
    expect(a).toMatch(/^hit_punch_[12]$/);
    expect(b).not.toBe(a);
  });
  it('decals: always on kill, chance otherwise, linear fade', () => {
    expect(wantsDecal(true, () => 0.99)).toBe(true);
    expect(wantsDecal(false, () => HIT_FX.decalChance - 0.01)).toBe(true);
    expect(wantsDecal(false, () => HIT_FX.decalChance + 0.01)).toBe(false);
    expect(decalAlpha(0)).toBeCloseTo(0.7);
    expect(decalAlpha(HIT_FX.decalFadeSeconds * 2)).toBe(0);
  });
});
