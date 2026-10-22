import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { describeTarget, attackIcon, inspectLine } from '../src/gameplay/isoButtons.js';

const mkState = (extra = {}) => ({ objects: {}, inventory: [], build: { barricade: { level: 0, hp: 0 } }, ...extra });
const ctx = (o = {}) => ({
  balance, state: mkState(), weapon: { id: 'fists' }, hasTool: () => false, doorOccupied: () => false, isHomeBed: () => false,
  nap: { enabled: true }, canStoreAll: true, shove: { ready: true, inRange: true }, ...o,
});
const door = (state, extra = {}) => ({ id: 'd1', kind: 'interior', state, hp: 60, barricade: null, ...extra });
const obj = (objectId, id = 'o1') => ({ id, objectId });
const slots = (t, c) => { const d = describeTarget(t, c); return [d.main && `${d.main.id}${d.main.enabled ? '' : '!'}`, d.secondary && `${d.secondary.id}${d.secondary.enabled ? '' : '!'}`]; };

describe('Main and Secondary by target (GDD 4 table)', () => {
  it('no target: both empty', () => expect(describeTarget(null, ctx())).toEqual({ main: null, secondary: null }));

  it('zombie: Attack on Main with the weapon icon, Shove on Secondary (greyed on cooldown / too far)', () => {
    const z = { kind: 'zombie', id: 'z' };
    expect(slots(z, ctx())).toEqual(['attack', 'shove']);
    expect(describeTarget(z, ctx({ weapon: { id: 'spiked_bat' } })).main.icon).toBe('attack_bat');
    const cd = describeTarget(z, ctx({ shove: { ready: false, inRange: true } })).secondary;
    expect(cd).toMatchObject({ enabled: false, reason: 'Not yet.' });
    expect(describeTarget(z, ctx({ shove: { ready: true, inRange: false } })).secondary.reason).toBe('Too far.');
  });
  it('attack icons per weapon, fists by default', () => {
    expect(attackIcon('fists')).toBe('attack_fists');
    expect(attackIcon('kitchen_knife')).toBe('attack_knife');
    expect(attackIcon('???')).toBe('attack_fists');
  });

  it('interior door: Open / Dismantle (greyed without a crowbar)', () => {
    const d = describeTarget({ kind: 'door', door: door('closed') }, ctx());
    expect(d.main).toMatchObject({ id: 'open', icon: 'open_door', enabled: true });
    expect(d.secondary).toMatchObject({ id: 'dismantle', enabled: false, reason: 'Needs crowbar' });
    expect(describeTarget({ kind: 'door', door: door('closed') }, ctx({ hasTool: () => true })).secondary.enabled).toBe(true);
  });
  it('open door: Close, greyed while something is in the way', () => {
    expect(slots({ kind: 'door', door: door('open') }, ctx())).toEqual(['close', 'dismantle!']);
    const g = describeTarget({ kind: 'door', door: door('open') }, ctx({ doorOccupied: () => true })).main;
    expect(g).toMatchObject({ id: 'close', enabled: false, reason: "Something's in the way." });
  });
  it('broken door: Dismantle moves up to Main', () => {
    expect(slots({ kind: 'door', door: door('broken') }, ctx())).toEqual(['dismantle', null]);
  });
  it('jammed door: Open tries the handle, Force on Secondary', () => {
    expect(slots({ kind: 'door', door: door('jammed', { kind: 'front' }) }, ctx())).toEqual(['open', 'force']);
  });
  it('front doors have no Dismantle; a door barricaded from the other side only tries the handle', () => {
    expect(slots({ kind: 'door', door: door('closed', { kind: 'front' }) }, ctx())).toEqual(['open', null]);
    expect(slots({ kind: 'door', door: door('closed', { barricade: { own: false, hp: 50 } }) }, ctx())).toEqual(['open', null]);
  });
  it("the hero's own barricade: Inspect on Main", () => {
    const d = door('closed', { kind: 'front', barricade: { own: true, hp: 120 } });
    expect(describeTarget({ kind: 'door', door: d }, ctx()).main).toMatchObject({ id: 'inspect' });
    const st = mkState({ build: { barricade: { level: 1, hp: 120 } } });
    expect(inspectLine(d, st, balance)).toBe("It'll hold.");
    d.barricade.hp = 1;
    expect(inspectLine(d, st, balance)).toBe("One more push and it's gone.");
  });

  it('container: Search, then Take when loot is left, then Search greyed "Nothing left."', () => {
    const t = { kind: 'object', obj: obj('kitchen_cupboard') };
    expect(slots(t, ctx())).toEqual(['search', 'dismantle']);
    expect(slots(t, ctx({ state: mkState({ objects: { o1: { searched: true, leftover: [{ id: 'wood', qty: 1 }] } } }) }))).toEqual(['take', 'dismantle']);
    const empty = describeTarget(t, ctx({ state: mkState({ objects: { o1: { searched: true } } }) }));
    expect(empty.main).toMatchObject({ id: 'search', icon: 'search_empty', enabled: false, reason: 'Nothing left.' });
    expect(empty.secondary.id).toBe('dismantle');
  });
  it('padlocked cage: Search greyed "Needs crowbar"', () => {
    expect(describeTarget({ kind: 'object', obj: obj('storage_cage') }, ctx()).main).toMatchObject({ enabled: false, reason: 'Needs crowbar' });
  });
  it('drainable: Drain (needs wrench), then Empty.', () => {
    const t = { kind: 'object', obj: obj('water_heater') };
    expect(describeTarget(t, ctx()).main).toMatchObject({ id: 'drain', enabled: false, reason: 'Needs wrench' });
    expect(describeTarget(t, ctx({ hasTool: () => true })).main.enabled).toBe(true);
    expect(describeTarget(t, ctx({ hasTool: () => true, state: mkState({ objects: { o1: { drained: true } } }) })).main.reason).toBe('Empty.');
  });
  it('no main action: Dismantle moves up and Secondary is empty', () => {
    expect(slots({ kind: 'object', obj: obj('chair') }, ctx())).toEqual(['dismantle', null]);
  });
  it('beds: home bed Sleep / Nap (greyed with its reason); elsewhere Sleep greyed + Dismantle', () => {
    const t = { kind: 'object', obj: obj('bed_frame') };
    expect(describeTarget(t, ctx({ isHomeBed: () => true })).main.id).toBe('sleep');
    expect(describeTarget(t, ctx({ isHomeBed: () => true, nap: { enabled: false, reason: 'Rested' } })).secondary).toMatchObject({ id: 'nap', enabled: false, reason: 'Rested' });
    const away = describeTarget(t, ctx());
    expect(away.main).toMatchObject({ id: 'sleep', enabled: false, reason: 'Not here. Not yet.' });
    expect(away.secondary.id).toBe('dismantle');
  });
  it('workbench, stash, pile, placement spot', () => {
    expect(slots({ kind: 'workbench' }, ctx())).toEqual(['craft', null]);
    expect(slots({ kind: 'stash' }, ctx())).toEqual(['stash', 'storeAll']);
    expect(describeTarget({ kind: 'stash' }, ctx({ canStoreAll: false })).secondary.enabled).toBe(false);
    expect(slots({ kind: 'pile' }, ctx())).toEqual(['pickup', null]);
    const sp = describeTarget({ kind: 'spot' }, ctx());
    expect([sp.main.id, sp.main.icon, sp.secondary.id, sp.secondary.icon]).toEqual(['place', 'place', 'cancel', 'cancel']);
  });
  it('dismantled things offer nothing', () => {
    expect(describeTarget({ kind: 'object', obj: obj('chair') }, ctx({ state: mkState({ objects: { o1: { dismantled: true } } }) }))).toEqual({ main: null, secondary: null });
  });
});
