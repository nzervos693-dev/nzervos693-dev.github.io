import { describe, it, expect } from 'vitest';
import { decideUpdate, SAFE_SCENES } from '../src/core/updateDecision.js';

describe('decideUpdate', () => {
  it('does nothing when no update is ready', () => {
    expect(decideUpdate({ updateReady: false, sceneKey: 'Title' })).toBe('none');
    expect(decideUpdate({ updateReady: false, sceneKey: 'IsoGame', resumed: true })).toBe('none');
  });
  it('reloads at once on boot and title', () => {
    for (const k of SAFE_SCENES) expect(decideUpdate({ updateReady: true, sceneKey: k })).toBe('reload-now');
    expect(decideUpdate({ updateReady: true, sceneKey: null })).toBe('defer');
  });
  it('defers mid-game and in the intro', () => {
    expect(decideUpdate({ updateReady: true, sceneKey: 'IsoGame' })).toBe('defer');
    expect(decideUpdate({ updateReady: true, sceneKey: 'Intro' })).toBe('defer');
  });
  it('reloads on app resume even mid-game (save was written on hide)', () => {
    expect(decideUpdate({ updateReady: true, sceneKey: 'IsoGame', resumed: true })).toBe('reload-now');
  });
});
