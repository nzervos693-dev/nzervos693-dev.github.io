import { describe, it, expect, beforeEach, vi } from 'vitest';
import { migrate, loadSave, writeSave, getSave, updateSave, setStorage, SAVE_KEY, SAVE_VERSION } from '../src/core/save.js';

const fakeStorage = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m };
};

describe('save', () => {
  let s;
  beforeEach(() => { s = fakeStorage(); setStorage(s); });

  it('round trips', () => {
    loadSave();
    getSave().game.floor = 7;
    getSave().settings.muted = true;
    expect(writeSave(1234)).toBe(true);
    const d = loadSave();
    expect(d.game.floor).toBe(7);
    expect(d.settings.muted).toBe(true);
    expect(d.lastSaveTime).toBe(1234);
    expect(d.version).toBe(SAVE_VERSION);
  });
  it('falls back to defaults on corrupt data', () => {
    s.setItem(SAVE_KEY, '{not json');
    expect(loadSave().version).toBe(SAVE_VERSION);
    s.setItem(SAVE_KEY, '"a string"');
    expect(loadSave().game).toEqual({});
    s.setItem(SAVE_KEY, JSON.stringify({ version: 999 }));
    expect(loadSave().lastSaveTime).toBe(0);
  });
  it('is safe when storage is unavailable or throws', () => {
    setStorage(null);
    loadSave();
    expect(updateSave({ x: 1 })).toBe(false);
    setStorage({ getItem() { throw new Error('no'); }, setItem() { throw new Error('quota'); } });
    expect(loadSave().version).toBe(SAVE_VERSION);
    expect(writeSave()).toBe(false);
  });
});

import { MIGRATIONS, deleteSave } from '../src/core/save.js';
describe('save safety', () => {
  it('backs up corrupt data and refuses to overwrite newer saves', () => {
    const s = fakeStorage(); setStorage(s);
    s.setItem(SAVE_KEY, '{bad');
    loadSave();
    expect(s.getItem(SAVE_KEY + '.bak')).toBe('{bad');
    const newer = JSON.stringify({ version: SAVE_VERSION + 1 });
    s.setItem(SAVE_KEY, newer);
    loadSave();
    expect(writeSave()).toBe(false);
    expect(s.getItem(SAVE_KEY)).toBe(newer);
    deleteSave();
  });
  it('does not write before loadSave', async () => {
    vi.resetModules();
    const fresh = await import('../src/core/save.js');
    const s = fakeStorage(); fresh.setStorage(s);
    expect(fresh.writeSave()).toBe(false);
    expect(s.m.size).toBe(0);
  });
  it('migration that does not bump version is rejected', () => {
    MIGRATIONS[0] = (d) => d;
    expect(migrate({ version: 0 })).toBe(null);
    delete MIGRATIONS[0];
  });
});
