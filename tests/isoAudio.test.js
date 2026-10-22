import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import audioManifest from '../public/assets/audio/manifest.json';
import { surfaceForRoom, footstepKey, searchSoundKey, pickAmbient, ambientVolume, hashId, zombieSheet, AMBIENT_POOLS } from '../src/gameplay/isoAudio.js';

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

describe('footsteps by surface', () => {
  it('room type -> surface via audio.footstepSurfaceByRoom, concrete when unknown', () => {
    expect(surfaceForRoom('bedroom', balance)).toBe('wood');
    expect(surfaceForRoom('kitchen', balance)).toBe('tile');
    expect(surfaceForRoom('office', balance)).toBe('carpet');
    expect(surfaceForRoom('corridor', balance)).toBe('concrete');
    expect(surfaceForRoom('???', balance)).toBe('concrete');
  });
  it('every room type of the surface table has its three recordings in the manifest', () => {
    for (const surface of new Set(Object.values(balance.audio.footstepSurfaceByRoom))) {
      for (let i = 1; i <= 3; i++) expect(audioManifest.sounds[`footstep_${surface}_${i}`]).toBeTruthy();
    }
  });
  it('picks footstep_<surface>_1..3 and never the same variation twice in a row', () => {
    let last = -1;
    const rng = seq(0.1, 0.1, 0.5, 0.9, 0.9, 0.34);
    for (let n = 0; n < 6; n++) {
      const k = footstepKey('wood', rng, last);
      expect(k.key).toMatch(/^footstep_wood_[123]$/);
      expect(k.index).not.toBe(last);
      last = k.index;
    }
  });
});

describe('search sounds', () => {
  it('cupboard, drawer and cloth variants per container, generic otherwise', () => {
    expect(searchSoundKey('kitchen_cupboard')).toBe('search_cupboard');
    expect(searchSoundKey('fridge')).toBe('search_cupboard');
    expect(searchSoundKey('kitchen_drawer')).toBe('search_drawer');
    expect(searchSoundKey('laundry_basket')).toBe('search_cloth');
    expect(searchSoundKey('mystery')).toBe('search');
    for (const k of ['search_cupboard', 'search_drawer', 'search_cloth']) expect(audioManifest.sounds[k]).toBeTruthy();
  });
});

describe('ambient one-shots (GDD 10)', () => {
  const has = () => true;
  it('weighted by category (weather 3, building 4, outside 2), skips categories without sounds', () => {
    const counts = { weather: 0, building: 0 };
    let r = 12345;
    const rng = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };
    for (let i = 0; i < 4000; i++) counts[pickAmbient(rng, balance.audio, { has }).category]++;
    // outside has no sounds yet: 3 : 4 between weather and building
    expect(counts.weather / counts.building).toBeGreaterThan(0.6);
    expect(counts.weather / counts.building).toBeLessThan(0.9);
  });
  it('never the same sound twice in a row', () => {
    for (let i = 0; i < 50; i++) expect(pickAmbient(Math.random, balance.audio, { has, last: 'creak_1' }).key).not.toBe('creak_1');
  });
  it('rain on a window is x3 likelier near a window; wind x2 with a broken one', () => {
    const n = (o, key) => { let c = 0; let r = 7; const rng = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; }; for (let i = 0; i < 5000; i++) if (pickAmbient(rng, balance.audio, { has, ...o }).key === key) c++; return c; };
    expect(n({ nearWindow: true }, 'amb_rain') / n({}, 'amb_rain')).toBeGreaterThan(2);
    expect(n({ brokenWindow: true }, 'amb_wind') / n({}, 'amb_wind')).toBeGreaterThan(1.5);
  });
  it('returns null when nothing can play', () => expect(pickAmbient(Math.random, balance.audio, { has: () => false })).toBeNull());
  it('volume is in audio.ambientVolumeRange', () => {
    for (const v of [0, 0.5, 0.999]) { const x = ambientVolume(() => v, balance.audio); expect(x).toBeGreaterThanOrEqual(0.35); expect(x).toBeLessThanOrEqual(0.7); }
  });
  it('weather sounds exist in the manifest, so they can be played as one-shots', () => {
    for (const list of Object.values(AMBIENT_POOLS)) for (const k of list) expect(audioManifest.sounds[k]).toBeTruthy();
  });
});

describe('zombie sheet variants', () => {
  it('is stable per id, uses variants that exist and falls back to the base sheet', () => {
    const has = (k) => ['iso_walker_b', 'iso_walker_c'].includes(k);
    const a = zombieSheet('iso_walker', ['iso_walker_b', 'iso_walker_c', 'iso_walker_d'], 'f15NW-z1', has);
    expect(a).toBe(zombieSheet('iso_walker', ['iso_walker_b', 'iso_walker_c', 'iso_walker_d'], 'f15NW-z1', has));
    expect(['iso_walker', 'iso_walker_b', 'iso_walker_c']).toContain(a);
    expect(zombieSheet('iso_walker', ['iso_walker_b'], 'x', () => false)).toBe('iso_walker');
    expect(zombieSheet('iso_walker', [], 'x', () => true)).toBe('iso_walker');
    expect(hashId('abc')).toBe(hashId('abc'));
  });
  it('uses several sheets across ids', () => {
    const seen = new Set();
    for (let i = 0; i < 40; i++) seen.add(zombieSheet('iso_walker', ['b', 'c', 'd'], `z${i}`, () => true));
    expect(seen.size).toBeGreaterThan(2);
  });
});
