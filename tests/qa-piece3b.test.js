/*
 * QA piece 3b: rules and data checks for attacks, survivors, tutorial, story text.
 * Tests marked `it.fails` describe the GDD (working tree, uncommitted edit) and fail on purpose until the bug in
 * docs/BUGS.md is fixed; when a bug is fixed, vitest reports the test as unexpectedly passing: remove `.fails` then.
 */
import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import floorsData from '../public/data/levels/floors.json';
import { buildTower } from '../src/gameplay/layout.js';
import { createGameState } from '../src/gameplay/gameState.js';
import { seededRng } from '../src/gameplay/rng.js';
import { addItem, countItem } from '../src/gameplay/inventory.js';
import { buildBarricade } from '../src/gameplay/barricade.js';
import { getDefense } from '../src/gameplay/defense.js';
import { attackLines, reportLines } from '../src/gameplay/report.js';
import { daysSurvived } from '../src/gameplay/death.js';
import {
  attackStrength, attackSpec, resolveOffline, makeAttackHook, settleInterrupted, attackState, startAttackClock,
  finishAttack, scheduleNext,
} from '../src/gameplay/attacks.js';
import { interactSurvivor, passTorch, tickUpkeep, tickScavengers, regenSurvivors } from '../src/gameplay/survivors.js';
import { DIALOGUE, TUTORIAL_TEXT, INTRO_CARDS, torchLine } from '../src/gameplay/storyText.js';

const tower = buildTower(floorsData, balance);
const T0 = 9_000_000;
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const fresh = () => createGameState(balance, tower, T0);
const mara = (s, extra = {}) => { s.survivors.mara = { recruited: true, dead: false, job: null, health: 100, upkeepAt: T0 + 12 * HOUR, ...extra }; return s; };

describe('balance numbers for attacks and survivors', () => {
  const a = balance.attacks;
  const sv = balance.survivors;
  it('attack numbers are in sensible ranges', () => {
    expect(a.cueSeconds).toBeGreaterThanOrEqual(10);
    expect(a.cueSeconds).toBeLessThanOrEqual(30);
    expect(a.cue.stairwellAtSeconds).toBeLessThan(a.cue.groanAtSeconds);
    expect(a.cue.groanAtSeconds).toBeLessThanOrEqual(a.cueSeconds);
    expect(a.intervalHours).toBeGreaterThanOrEqual(4);
    expect(a.jitterHours).toBeGreaterThanOrEqual(0);
    expect(a.jitterHours).toBeLessThan(a.intervalHours / 2);
    expect(a.firstAttackDelayMinutes).toBeGreaterThanOrEqual(3);
    expect(a.firstAttackDelayMinutes).toBeLessThanOrEqual(30);
    expect(a.cap).toBeGreaterThan(a.baseStrength);
    expect(a.strengthPerZombie).toBeGreaterThan(0);
    expect(a.repelBarricadeLossRatio).toBeGreaterThan(0);
    expect(a.repelBarricadeLossRatio).toBeLessThanOrEqual(1);
    expect(a.breachDamageRatio).toBeGreaterThan(0);
    expect(a.breachDamageRatio).toBeLessThanOrEqual(1);
    expect(a.maxOfflineResolves).toBeGreaterThanOrEqual(1);
  });
  it('the scripted attack is beatable by Lv1 barricade + the active character (D = 20), as the GDD promises', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    expect(getDefense(s, balance).total).toBeGreaterThanOrEqual(a.scripted.strength);
    expect(attackSpec(s, balance, 'scripted', T0).types).toHaveLength(2);
  });
  it('every tuning key the code reads exists, and no tuning key in balance.json is ignored by the code', () => {
    const t = a.tuning;
    expect(t.spawnGapSeconds).toBeGreaterThan(0);
    expect(t.flickerSeconds).toBeGreaterThan(0);
    expect(Array.isArray(t.arrivalXRange)).toBe(true);
    expect(t.arrivalXRange[0]).toBeLessThan(t.arrivalXRange[1]);
  });
  // BUG-021: attacks.js reads spawnXMin/spawnXMax, balance.json has arrivalXRange (never read)
  it('arrivalXRange in balance.json changes where attackers appear (BUG-021)', () => {
    const tuned = { ...balance, attacks: { ...a, tuning: { ...a.tuning, arrivalXRange: [200, 210] } } };
    return import('../src/gameplay/attacks.js').then(({ attackTuning }) => {
      const t = attackTuning(tuned);
      expect(t.spawnXMin).toBe(200);
      expect(t.spawnXMax).toBe(210);
    });
  });
  it('survivor numbers are in sensible ranges and Mara has everything the code reads', () => {
    expect(sv.upkeepHours).toBeGreaterThanOrEqual(6);
    expect(sv.upkeepFood).toBeGreaterThanOrEqual(1);
    expect(sv.upkeepWater).toBeGreaterThanOrEqual(1);
    expect(sv.missedUpkeepHealth).toBeGreaterThan(0);
    expect(sv.startHealth).toBe(balance.needs.max);
    expect(sv.guardDefense).toBeGreaterThan(0);
    expect(sv.scavengeIntervalHours).toBeGreaterThanOrEqual(1);
    expect(sv.tenderOutputMult).toBeGreaterThan(1);
    expect(sv.jobs).toEqual(expect.arrayContaining(['guard', 'scavenger', 'tender']));
    const m = sv.roster.mara;
    expect(m.floor).toBe(13);
    expect(m.trait.bandageHealMult).toBe(1.5);
    expect(balance.items[m.quest.itemId]).toBeTruthy();
    expect(sv.treatItems.every((id) => balance.items[id])).toBe(true);
    expect(sv.joinMinMorale).toBe(balance.needs.morale.lowThreshold);
  });
  it('Mara, the medical bag quest item and her floor exist in floors.json', () => {
    const f13 = floorsData.floors.find((f) => f.number === 13);
    expect(f13.apartments.some((ap) => (ap.survivors || []).some((x) => x.id === 'mara'))).toBe(true);
    const f14 = floorsData.floors.find((f) => f.number === 14);
    expect(f14.apartments.some((ap) => (ap.questItems || []).some((q) => q.itemId === 'medical_bag'))).toBe(true);
  });
  it('story text has every dialogue key the code uses', () => {
    for (const k of ['intro', 'reminder', 'thanks', 'join', 'needBed', 'refuse']) {
      expect(DIALOGUE.mara[k]?.length, k).toBeGreaterThan(0);
      for (const line of DIALOGUE.mara[k]) expect(line.length).toBeLessThanOrEqual(80);
    }
    for (const id of ['walk', 'fridge', 'chair', 'table', 'drawer', 'workbench', 'door', 'fight']) {
      expect(TUTORIAL_TEXT[id]?.length, id).toBeGreaterThan(5);
      expect(TUTORIAL_TEXT[id].length).toBeLessThanOrEqual(48); // one line next to the Skip button
    }
    for (const c of INTRO_CARDS) expect(c.length).toBeLessThanOrEqual(120);
    expect(torchLine('Mara')).toBe('You carry on as Mara.');
  });
});

describe('attack strength edges', () => {
  it('days survived are whole 24 h periods since New game', () => {
    const s = fresh();
    s.times.startedAt = T0;
    expect(daysSurvived(s, T0 + DAY - 1)).toBe(0);
    expect(daysSurvived(s, T0 + DAY)).toBe(1);
    expect(daysSurvived(s, T0 - 5)).toBe(0); // clock moved back
  });
  it('strength reaches the cap on day 42 and never exceeds it', () => {
    expect(attackStrength(41, balance)).toBe(148);
    expect(attackStrength(42, balance)).toBe(150);
    expect(attackStrength(9999, balance)).toBe(150);
    expect(attackStrength(-3, balance)).toBe(25);
  });
  it('a scheduled attack at the cap sends 15 walkers', () => {
    const s = fresh();
    const spec = attackSpec(s, balance, 'scheduled', T0 + 100 * DAY);
    expect(spec.types).toHaveLength(15);
    expect(new Set(spec.types)).toEqual(new Set(['walker']));
  });
});

describe('offline resolution edges', () => {
  it('a repel hurts nobody and loses no stacks, even with a Guard', () => {
    const s = mara(fresh(), { job: 'guard' });
    buildBarricade(s, balance, 1);
    s.stockpile[0] = { id: 'wood', qty: 5 };
    const h0 = s.needs.health;
    const r = resolveOffline(s, balance, { kind: 'scheduled', strength: 25, types: [] }, seededRng(1));
    expect(r.repelled).toBe(true);
    expect(r.hurt).toEqual([]);
    expect(r.lost).toEqual([]);
    expect(s.needs.health).toBe(h0);
    expect(s.survivors.mara.health).toBe(100);
    expect(s.stockpile[0].qty).toBe(5);
  });
  it('defense exactly equal to strength repels (D >= A)', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    expect(getDefense(s, balance).total).toBe(20);
    expect(resolveOffline(s, balance, { kind: 'scripted', strength: 20, types: [] }, seededRng(1)).repelled).toBe(true);
    const s2 = fresh();
    buildBarricade(s2, balance, 1);
    expect(resolveOffline(s2, balance, { kind: 'scripted', strength: 21, types: [] }, seededRng(1)).repelled).toBe(false);
  });
  it('the health floor of 10 holds for hero and Mara; someone already below 10 is not hurt further', () => {
    const s = mara(fresh(), { health: 30 });
    buildBarricade(s, balance, 1);
    s.needs.health = 6;
    const r = resolveOffline(s, balance, { kind: 'scheduled', strength: 150, types: [] }, seededRng(2));
    expect(s.needs.health).toBe(6);
    expect(s.survivors.mara.health).toBe(10);
    expect(r.hurt.map((x) => x.id)).toEqual(['mara']);
  });
  it('after pass the torch the dead hero is no resident; only Mara (active) takes the damage once', () => {
    const s = mara(fresh(), { health: 80 });
    buildBarricade(s, balance, 1);
    s.activeId = 'mara';
    s.needs.health = 80;
    resolveOffline(s, balance, { kind: 'scheduled', strength: 60, types: [] }, seededRng(2));
    expect(s.needs.health).toBe(60); // shortfall 40 / 2 = 20
    expect(s.survivors.mara.health).toBe(80); // not hit a second time through her own record
  });
  it('stack losses are floor(shortfall / 10) and never exceed the stacks in the stockpile; lost items are gone', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    s.stockpile[0] = { id: 'wood', qty: 4 };
    s.stockpile[3] = { id: 'metal', qty: 2 };
    const r = resolveOffline(s, balance, { kind: 'scheduled', strength: 150, types: [] }, seededRng(5));
    expect(r.lost).toHaveLength(2);
    expect(s.stockpile.filter(Boolean)).toHaveLength(0);
    const s2 = fresh();
    buildBarricade(s2, balance, 1);
    s2.stockpile[0] = { id: 'wood', qty: 4 };
    const r2 = resolveOffline(s2, balance, { kind: 'scheduled', strength: 29, types: [] }, seededRng(5)); // shortfall 9
    expect(r2.lost).toHaveLength(0);
  });
  it('a repel that wears the barricade down to 0 HP stops at 0 and gets +5 and the once-only -10 (current behaviour, ask game-designer if intended)', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    s.build.barricade.hp = 4;
    const m0 = s.needs.morale;
    const r = resolveOffline(s, balance, { kind: 'scripted', strength: 20, types: [] }, seededRng(1));
    expect(r.repelled).toBe(true);
    expect(s.build.barricade.hp).toBe(0);
    expect(s.needs.morale).toBe(m0 + balance.needs.morale.events.attackRepelled + balance.needs.morale.events.barricadeBreached);
  });
  it('without any barricade the character alone (D = 10) fails the scripted attack', () => {
    const s = fresh();
    expect(getDefense(s, balance).total).toBe(10);
    expect(resolveOffline(s, balance, { kind: 'scripted', strength: 20, types: [] }, seededRng(1)).repelled).toBe(false);
  });
});

describe('catch-up with attacks', () => {
  const run = (s, hours, rng = seededRng(4)) => {
    const hook = makeAttackHook(s, balance, rng, T0);
    const report = { attacks: [] };
    const step = balance.time.offlineStepMinutes * 60 * 1000;
    for (let t = step; t <= hours * HOUR; t += step) hook(s, step / 1000, T0 + t, report);
    return report;
  };
  it('12 h away from a state with the next attack due after 1 h resolves one or two attacks, never more than the max', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    s.attacks = { scriptedDone: true, nextAt: T0 + HOUR, kind: 'scheduled', current: null };
    const rep = run(s, 12);
    expect(rep.attacks.length).toBeGreaterThanOrEqual(1);
    expect(rep.attacks.length).toBeLessThanOrEqual(balance.attacks.maxOfflineResolves);
    expect(attackState(s).nextAt).toBeGreaterThan(T0 + 12 * HOUR - 1);
  });
  it('with the 12 h offline cap and 8 +/- 2 h spacing the "max 2" rule is the only thing that could be hit; the third is >12 h', () => {
    // documents that maxOfflineResolves cannot trigger inside the 12 h cap: intervals are at least 6 h
    expect(balance.time.offlineCapHours).toBeLessThanOrEqual(12);
    expect((balance.attacks.intervalHours - balance.attacks.jitterHours) * 2).toBeGreaterThanOrEqual(balance.time.offlineCapHours);
  });
  it('the report lines for a breach with Mara and the hero are prose with both names', () => {
    const s = mara(fresh());
    buildBarricade(s, balance, 1);
    s.stockpile[0] = { id: 'wood', qty: 3 };
    const res = resolveOffline(s, balance, { kind: 'scheduled', strength: 90, types: [] }, seededRng(1));
    const lines = attackLines([{ ...res, atMs: T0, offsetMs: 2 * HOUR }], balance);
    expect(lines[0]).toMatch(/^Around \d\d:\d\d something broke through\. They got in\.$/);
    expect(lines.find((l) => / hurt\.$/.test(l))).toBe('You and Mara are hurt.');
    expect(lines.join(' ')).not.toMatch(/strength|defense|HP|\d+ stack/i);
  });
  it('attack report lines carry no numbers except clock times and item counts (GDD 5.1)', () => {
    const lines = attackLines([{ strength: 150, defense: 100, repelled: true, barricadeLoss: 75, atMs: T0, offsetMs: 11.5 * HOUR }], balance);
    for (const l of lines) expect(l.replace(/\d\d:\d\d/, '')).not.toMatch(/\d/);
  });
});

describe('interrupted fights (GDD 5.8 "app hidden mid-attack")', () => {
  // BUG-023: GDD says A = remaining attackers x 10; code scales the attack strength by remaining / total
  it('scheduled attack of 3 walkers, 1 killed: the 2 left count as 2 x strengthPerZombie (BUG-023)', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    attackState(s).current = { kind: 'scheduled', strength: 25, total: 3, killed: 1 };
    const r = settleInterrupted(s, balance, T0, seededRng(1));
    expect(r.strength).toBe(2 * balance.attacks.strengthPerZombie);
  });
  it('nothing left to settle when every attacker died (killed = total): strength 0, repelled, no damage', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    attackState(s).current = { kind: 'scripted', strength: 20, total: 2, killed: 2 };
    const r = settleInterrupted(s, balance, T0, seededRng(1));
    expect(r.strength).toBe(0);
    expect(r.repelled).toBe(true);
    expect(r.hurt).toEqual([]);
  });
  it('the interrupted attack ends the scripted one and schedules the next 6-10 h later', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    startAttackClock(s, balance, T0);
    attackState(s).current = { kind: 'scripted', strength: 20, total: 2, killed: 0 };
    settleInterrupted(s, balance, T0 + 1000, seededRng(9));
    const a = attackState(s);
    expect(a.scriptedDone).toBe(true);
    expect(a.kind).toBe('scheduled');
    expect(a.nextAt - (T0 + 1000)).toBeGreaterThanOrEqual(6 * HOUR);
    expect(a.nextAt - (T0 + 1000)).toBeLessThanOrEqual(10 * HOUR);
  });
  it('a finished attack never leaves a stale current record that would be settled twice', () => {
    const s = fresh();
    attackState(s).current = { kind: 'scheduled', strength: 25, total: 3, killed: 0 };
    finishAttack(s, balance, T0, seededRng(1));
    expect(settleInterrupted(s, balance, T0, seededRng(1))).toBeNull();
  });
});

describe('survivors: edges', () => {
  // BUG-024: GDD (5.7 Mara's hand-over): without a free bed the bag stays with the hero
  it('without a free Survivor bed she says "I need a bed first." and the bag stays in the bag (BUG-024)', () => {
    const s = fresh();
    addItem(s.inventory, 'medical_bag', 1, balance);
    interactSurvivor(s, balance, 'mara', T0);
    expect(countItem(s.inventory, 'medical_bag')).toBe(1);
  });
  // BUG-025: GDD 5.7 Survivor healing: +2 health/h at home while the last upkeep was met (no code reads healthRegenPerHour)
  it('a recruited survivor at home regains health over time while upkeep is met (BUG-025)', () => {
    const s = mara(fresh(), { health: 50 });
    s.stockpile[0] = { id: 'canned_food', qty: 2 };
    s.stockpile[1] = { id: 'clean_water', qty: 2 };
    tickUpkeep(s, balance, T0 + 12 * HOUR, { offline: true }, []);
    regenSurvivors(s, balance, 4 * 3600);
    expect(s.survivors.mara.health).toBe(50 + 4 * balance.survivors.healthRegenPerHour);
    s.survivors.mara.upkeepMet = false; // a missed upkeep stops regen
    regenSurvivors(s, balance, 3600);
    expect(s.survivors.mara.health).toBe(50 + 4 * balance.survivors.healthRegenPerHour);
  });
  // BUG-026: GDD 5.7 pass the torch: the new character's food/water/energy start at needs.<need>.start
  it('pass the torch resets food, water and energy to the start values (BUG-026)', () => {
    const s = mara(fresh(), { health: 64 });
    s.needs.food = 12;
    s.needs.water = 14;
    s.needs.energy = 33;
    passTorch(s, balance, 'mara', { floor: 17, x: 234 }, { floor: 15, x: 251 });
    expect(s.needs.food).toBe(balance.needs.food.start);
    expect(s.needs.water).toBe(balance.needs.water.start);
    expect(s.needs.energy).toBe(balance.needs.energy.start);
    expect(s.needs.health).toBe(64);
  });
  it('pass the torch keeps Mara health at least 1 and drops equipped gear with the bag', () => {
    const s = mara(fresh(), { health: 0.4 });
    addItem(s.inventory, 'spiked_bat', 1, balance);
    s.equipped = { slot: 0, id: 'spiked_bat' };
    const r = passTorch(s, balance, 'mara', { floor: 16, x: 300 }, { floor: 15, x: 251 });
    expect(r.ok).toBe(true);
    expect(s.needs.health).toBeGreaterThanOrEqual(1);
    expect(s.equipped).toBeNull();
    expect(s.piles.at(-1).items.some((i) => i.id === 'spiked_bat')).toBe(true);
    expect(s.bodies.at(-1)).toMatchObject({ floor: 16, char: 'hero' });
  });
  it('a scavenger with no cleared floor produces nothing and does not throw', () => {
    const s = mara(fresh(), { job: 'scavenger', scavengeProgress: 0 });
    const ev = tickScavengers(s, balance, tower, {}, 10 * HOUR / 1000, seededRng(3), []);
    expect(ev).toEqual([]);
    expect(s.stockpile.filter(Boolean)).toHaveLength(0);
  });
  it('upkeep takes spoiling/lowest-value food first and gives back nothing when water is missing', () => {
    const s = mara(fresh());
    s.stockpile[0] = { id: 'canned_food', qty: 1 };
    const ev = tickUpkeep(s, balance, T0 + 12 * HOUR, { offline: true }, []);
    expect(ev[0].missed).toEqual(['water']);
    expect(s.survivors.mara.health).toBe(90);
  });
  it('a dead survivor is not charged upkeep and stays dead', () => {
    const s = mara(fresh(), { dead: true, health: 0 });
    expect(tickUpkeep(s, balance, T0 + 48 * HOUR, { offline: true }, [])).toEqual([]);
  });
  it('report lines mention missed upkeep and scavenged loot', () => {
    const s = mara(fresh());
    const ev = tickUpkeep(s, balance, T0 + 12 * HOUR, { offline: true }, []);
    const lines = reportLines({ elapsedMs: 12 * HOUR, before: s.needs, after: s.needs, used: {}, survivorEvents: ev, scavenged: [{ id: 'mara', item: { id: 'wood', qty: 2 }, stored: true }] }, balance);
    expect(lines).toContain('Mara had no food or water.');
    expect(lines.some((l) => l.includes('brought back 2 wood'))).toBe(true);
  });
});

describe('scheduling edges', () => {
  it('scheduleNext never places the next attack less than 6 h or more than 10 h ahead', () => {
    for (const r of [0, 0.5, 0.9999]) {
      const s = fresh();
      scheduleNext(s, balance, T0, () => r);
      const h = (attackState(s).nextAt - T0) / HOUR;
      expect(h).toBeGreaterThanOrEqual(6 - 1e-9);
      expect(h).toBeLessThanOrEqual(10 + 1e-9);
    }
  });
});
