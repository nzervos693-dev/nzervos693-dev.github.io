import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import floorsData from '../public/data/levels/floors.json';
import lootData from '../public/data/levels/loot.json';
import { buildTower } from '../src/gameplay/layout.js';
import { createGameState, heroCtx } from '../src/gameplay/gameState.js';
import { seededRng } from '../src/gameplay/rng.js';
import { addItem, countItem } from '../src/gameplay/inventory.js';
import { performCraft } from '../src/gameplay/crafting.js';
import { placeObject } from '../src/gameplay/building.js';
import { itemEffect } from '../src/gameplay/needs.js';
import { tenderMult, tickProducers } from '../src/gameplay/producers.js';
import { livingSurvivors } from '../src/gameplay/death.js';
import { catchUp } from '../src/gameplay/offline.js';
import { reportLines } from '../src/gameplay/report.js';
import { updateFloorStates } from '../src/gameplay/floorState.js';
import {
  interactSurvivor, setJob, talkTo, talkWaitMs, tickUpkeep, tickScavengers, passTorch, killActiveSurvivor,
  freeBeds, regenSurvivors, treatOptions, treatSurvivor, residentsAtHome, survivorHomeSpot, dropLostSurvivorTime, jobInfo, activeName, recruitedAlive,
} from '../src/gameplay/survivors.js';

const tower = buildTower(floorsData, balance);
const T0 = 5_000_000;
const HOUR = 3600 * 1000;
const fresh = () => createGameState(balance, tower, T0);
const withBed = (s) => { s.build.spots['15:s1'] = { id: 'survivor_bed', floor: 15, spot: 's1' }; };
const withBag = (s) => addItem(s.inventory, 'medical_bag', 1, balance);
const recruited = (s, extra = {}) => {
  withBed(s);
  withBag(s);
  interactSurvivor(s, balance, 'mara', T0);
  Object.assign(s.survivors.mara, extra);
  return s;
};

describe('Mara recruit quest', () => {
  it('first talk gives the intro and starts the quest; without the bag she reminds you', () => {
    const s = fresh();
    const a = interactSurvivor(s, balance, 'mara', T0);
    expect(a.kind).toBe('intro');
    expect(a.lines.length).toBeGreaterThan(1);
    expect(s.survivors.mara.quest).toBe('asked');
    const b = interactSurvivor(s, balance, 'mara', T0);
    expect(b.kind).toBe('reminder');
    expect(s.survivors.mara.recruited).toBe(false);
  });
  it('handing over the bag with a free bed: bag consumed, quest +10 morale, recruited +15, upkeep timer set', () => {
    const s = fresh();
    interactSurvivor(s, balance, 'mara', T0);
    withBed(s);
    withBag(s);
    const m0 = s.needs.morale;
    const r = interactSurvivor(s, balance, 'mara', T0);
    expect(r.gaveBag && r.recruited).toBe(true);
    expect(countItem(s.inventory, 'medical_bag')).toBe(0);
    expect(s.needs.morale).toBe(Math.min(100, m0 + 10 + 15));
    expect(s.survivors.mara).toMatchObject({ recruited: true, dead: false, job: null, health: 100 });
    expect(s.survivors.mara.upkeepAt).toBe(T0 + 12 * HOUR);
    expect(freeBeds(s, balance)).toBe(0);
  });
  it('talking with the bag in the bag on the very first visit hands it over straight away', () => {
    const s = fresh();
    withBed(s);
    withBag(s);
    const r = interactSurvivor(s, balance, 'mara', T0);
    expect(r.recruited).toBe(true);
    expect(r.lines.length).toBeGreaterThan(3);
  });
  it('without a Survivor bed she says so and the bag stays; with one she joins', () => {
    const s = fresh();
    interactSurvivor(s, balance, 'mara', T0);
    withBag(s);
    const m0 = s.needs.morale;
    const r = interactSurvivor(s, balance, 'mara', T0);
    expect(r.kind).toBe('needs_bed');
    expect(r.recruited).toBe(false);
    expect(r.lines).toContain('I need a bed first.');
    expect(s.survivors.mara.quest).toBe('asked');
    expect(countItem(s.inventory, 'medical_bag')).toBe(1);
    expect(s.needs.morale).toBe(m0);
    expect(interactSurvivor(s, balance, 'mara', T0).kind).toBe('needs_bed');
    withBed(s);
    const j = interactSurvivor(s, balance, 'mara', T0 + 1000);
    expect(j.recruited).toBe(true);
    expect(countItem(s.inventory, 'medical_bag')).toBe(0);
    expect(s.survivors.mara.recruited).toBe(true);
  });
  it('she refuses the hand-over while morale is below 25 and keeps the bag', () => {
    const s = fresh();
    interactSurvivor(s, balance, 'mara', T0);
    withBed(s);
    withBag(s);
    s.needs.morale = 20;
    const r = interactSurvivor(s, balance, 'mara', T0);
    expect(r.kind).toBe('refuse');
    expect(countItem(s.inventory, 'medical_bag')).toBe(1);
    expect(s.survivors.mara.recruited).toBe(false);
  });
  it('a real crafted Survivor bed counts', () => {
    const s = fresh();
    s.objects['f15L-01'] = { dismantled: true }; // the chair's slot is free
    addItem(s.inventory, 'wood', 6, balance);
    addItem(s.inventory, 'cloth', 2, balance);
    const r = performCraft(s, tower, balance, 'survivor_bed', { spot: '15:s1', loc: { floor: 15, x: 168 } });
    expect(r.ok).toBe(true);
    expect(freeBeds(s, balance)).toBe(1);
  });
});

describe('Steady hands', () => {
  it('bandage heals 15 -> 22 only while Mara is recruited and alive', () => {
    const s = fresh();
    expect(itemEffect('bandage', balance, heroCtx(s, balance)).health).toBe(15);
    interactSurvivor(s, balance, 'mara', T0); // talking alone does nothing
    expect(itemEffect('bandage', balance, heroCtx(s, balance)).health).toBe(15);
    recruited(fresh()); // another state: untouched
    const r = recruited(s);
    expect(itemEffect('bandage', balance, heroCtx(r, balance)).health).toBe(22);
    r.survivors.mara.dead = true;
    expect(itemEffect('bandage', balance, heroCtx(r, balance)).health).toBe(15);
  });
  it('still applies when Mara is the active character', () => {
    const s = recruited(fresh());
    s.activeId = 'mara';
    expect(itemEffect('bandage', balance, heroCtx(s, balance)).health).toBe(22);
  });
});

describe('jobs and talk', () => {
  it('jobs: pick, switch, tap again to clear; only known jobs; only recruited survivors', () => {
    const s = fresh();
    expect(setJob(s, balance, 'mara', 'guard').ok).toBe(false);
    recruited(s);
    expect(setJob(s, balance, 'mara', 'guard')).toEqual({ ok: true, job: 'guard' });
    expect(setJob(s, balance, 'mara', 'tender').job).toBe('tender');
    expect(setJob(s, balance, 'mara', 'tender').job).toBeNull();
    expect(setJob(s, balance, 'mara', 'medic').ok).toBe(false);
    expect(jobInfo(balance).map((j) => j.id)).toEqual(['guard', 'scavenger', 'tender']);
  });
  it('a Tender speeds producers up by 1.5', () => {
    const s = recruited(fresh());
    expect(tenderMult(s, balance)).toBe(1);
    setJob(s, balance, 'mara', 'tender');
    expect(tenderMult(s, balance)).toBe(1.5);
    s.build.spots['15:w1'] = { id: 'rain_collector', floor: 15, spot: 'w1', stored: 0, progress: 0, queue: 0 };
    const iv = balance.recipes.rain_collector.effect.intervalHours * 3600;
    tickProducers(s, balance, iv / 1.5 + 1);
    expect(s.build.spots['15:w1'].stored).toBe(1);
  });
  it('talking gives +5 morale once per 12 h', () => {
    const s = recruited(fresh());
    s.needs.morale = 50;
    expect(talkTo(s, balance, 'mara', T0)).toMatchObject({ ok: true, gain: 5 });
    expect(s.needs.morale).toBe(55);
    const again = talkTo(s, balance, 'mara', T0 + HOUR);
    expect(again.ok).toBe(false);
    expect(talkWaitMs(s, balance, 'mara', T0 + HOUR)).toBe(11 * HOUR);
    expect(talkTo(s, balance, 'mara', T0 + 12 * HOUR).ok).toBe(true);
    expect(talkTo(fresh(), balance, 'mara', T0).ok).toBe(false);
  });
});

describe('upkeep', () => {
  it('eats 1 food + 1 water every 12 h from the stockpile', () => {
    const s = recruited(fresh());
    addItem(s.stockpile, 'canned_food', 3, balance);
    addItem(s.stockpile, 'water_bottle', 3, balance);
    const ev = tickUpkeep(s, balance, T0 + 12 * HOUR);
    expect(ev).toEqual([]);
    expect(countItem(s.stockpile, 'canned_food')).toBe(2);
    expect(countItem(s.stockpile, 'water_bottle')).toBe(2);
    expect(s.survivors.mara.upkeepAt).toBe(T0 + 24 * HOUR);
    tickUpkeep(s, balance, T0 + 12 * HOUR + 5);
    expect(countItem(s.stockpile, 'canned_food')).toBe(2); // not twice
  });
  it('missing food or water: -10 health and -5 morale, once per upkeep', () => {
    const s = recruited(fresh());
    addItem(s.stockpile, 'canned_food', 1, balance);
    const m0 = s.needs.morale;
    const ev = tickUpkeep(s, balance, T0 + 12 * HOUR);
    expect(ev).toHaveLength(1);
    expect(ev[0].missed).toEqual(['water']);
    expect(s.survivors.mara.health).toBe(90);
    expect(s.needs.morale).toBe(m0 - 5);
    expect(countItem(s.stockpile, 'canned_food')).toBe(0); // she still ate the food she had
  });
  it('several periods pass at once', () => {
    const s = recruited(fresh());
    const ev = tickUpkeep(s, balance, T0 + 36 * HOUR);
    expect(ev).toHaveLength(3);
    expect(s.survivors.mara.health).toBe(70);
  });
  it('offline health floors at 10; online she dies at 0 (morale -20) and frees the bed', () => {
    const s = recruited(fresh());
    s.survivors.mara.health = 12;
    tickUpkeep(s, balance, T0 + 24 * HOUR, { offline: true });
    expect(s.survivors.mara.health).toBe(10);
    expect(s.survivors.mara.dead).toBe(false);
    const m0 = s.needs.morale;
    const ev = tickUpkeep(s, balance, T0 + 36 * HOUR, { offline: false });
    expect(s.survivors.mara.dead).toBe(true);
    expect(ev.at(-1).died).toBe(true);
    expect(s.needs.morale).toBe(m0 - 5 - 20);
    expect(freeBeds(s, balance)).toBe(1);
    expect(recruitedAlive(s)).toEqual([]);
  });
  it('overdue upkeep after a capped catch-up moves forward', () => {
    const s = recruited(fresh());
    dropLostSurvivorTime(s, balance, T0 + 30 * HOUR);
    expect(s.survivors.mara.upkeepAt).toBe(T0 + 42 * HOUR);
  });
});

describe('scavenger', () => {
  const cleared = (s) => { s.floorStates[14] = 'Cleared'; s.floorStates[16] = 'Secured'; };
  it('one loot roll per 2 h of working time into the stockpile, only from Cleared/Secured floors', () => {
    const s = recruited(fresh());
    setJob(s, balance, 'mara', 'scavenger');
    const none = tickScavengers(s, balance, tower, lootData.tables, 10 * 3600, seededRng(1));
    expect(none).toEqual([]);
    cleared(s);
    const ev = tickScavengers(s, balance, tower, lootData.tables, 6 * 3600, seededRng(2));
    expect(ev).toHaveLength(3);
    expect(s.stockpile.filter(Boolean).length).toBeGreaterThan(0);
    expect(tickScavengers(s, balance, tower, lootData.tables, 3599, seededRng(3))).toEqual([]);
  });
  it('only scavengers work; guards and unassigned do not', () => {
    const s = recruited(fresh());
    cleared(s);
    expect(tickScavengers(s, balance, tower, lootData.tables, 10 * 3600, seededRng(1))).toEqual([]);
    setJob(s, balance, 'mara', 'guard');
    expect(tickScavengers(s, balance, tower, lootData.tables, 10 * 3600, seededRng(1))).toEqual([]);
  });
  it('works in offline catch-up steps and shows in the report', () => {
    const s = recruited(fresh());
    cleared(s);
    setJob(s, balance, 'mara', 'scavenger');
    s.needs.food = 100; s.needs.water = 100;
    const hook = (_sim, seconds, atMs, rep) => {
      tickUpkeep(s, balance, atMs, { offline: true }, (rep.survivorEvents ||= []));
      tickScavengers(s, balance, tower, lootData.tables, seconds, seededRng(9), (rep.scavenged ||= []));
    };
    const rep = catchUp({ needs: s.needs, stockpile: s.stockpile, ctx: {} }, 8 * HOUR, balance, { startMs: T0, stepHooks: [hook] });
    expect(rep.scavenged).toHaveLength(4);
    const lines = reportLines(rep, balance);
    expect(lines.some((l) => l.startsWith('Someone brought back'))).toBe(true);
    expect(lines.some((l) => l.includes('Mara had no food or water'))).toBe(false); // the first meal is at 12 h
  });
});

describe('pass the torch', () => {
  it('Mara takes over: her health, bag dropped at the death spot, body recorded, job cleared', () => {
    const s = recruited(fresh());
    setJob(s, balance, 'mara', 'guard');
    s.survivors.mara.health = 64;
    addItem(s.inventory, 'canned_food', 2, balance);
    addItem(s.inventory, 'kitchen_knife', 1, balance);
    s.equipped = { slot: 1, id: 'kitchen_knife' };
    s.needs.health = 0;
    expect(livingSurvivors(s)).toEqual(['mara']);
    const r = passTorch(s, balance, 'mara', { floor: 14, x: 300 }, { floor: 15, x: 250 });
    expect(r.ok).toBe(true);
    expect(s.activeId).toBe('mara');
    expect(s.needs.health).toBe(64);
    expect(s.hero).toEqual({ floor: 15, x: 250 });
    expect(s.survivors.mara.job).toBeNull();
    expect(s.inventory.every((x) => x === null)).toBe(true);
    expect(s.equipped).toBeNull();
    const pile = s.piles.find((p) => p.floor === 14);
    expect(pile.items.map((i) => i.id).sort()).toEqual(['canned_food', 'kitchen_knife']);
    expect(s.bodies).toEqual([{ floor: 14, x: 300, char: 'hero' }]);
    expect(activeName(s, balance)).toBe('Mara');
    expect(residentsAtHome(s)).toEqual([]);
  });
  it('cannot continue as a dead or unrecruited survivor', () => {
    const s = fresh();
    expect(passTorch(s, balance, 'mara', { floor: 15, x: 1 }, { floor: 15, x: 2 }).ok).toBe(false);
    const r = recruited(fresh());
    r.survivors.mara.dead = true;
    expect(passTorch(r, balance, 'mara', { floor: 15, x: 1 }, { floor: 15, x: 2 }).ok).toBe(false);
  });
  it('when Mara (active) dies nobody is left: game over', () => {
    const s = recruited(fresh());
    passTorch(s, balance, 'mara', { floor: 15, x: 1 }, { floor: 15, x: 2 });
    killActiveSurvivor(s);
    expect(s.survivors.mara.dead).toBe(true);
    expect(livingSurvivors(s)).toEqual([]);
  });
  it('killActiveSurvivor does nothing while the hero is active', () => {
    const s = recruited(fresh());
    killActiveSurvivor(s);
    expect(s.survivors.mara.dead).toBe(false);
  });
});

describe('home placement', () => {
  it('Mara stands at her survivor bed, else near the hero bed', () => {
    const s = recruited(fresh());
    expect(survivorHomeSpot(s, tower, balance, 'mara')).toEqual({ floor: 15, x: 168 });
    s.build.spots = {};
    const spot = survivorHomeSpot(s, tower, balance, 'mara');
    expect(spot.floor).toBe(15);
    expect(spot.x).toBeGreaterThan(120);
  });
  it('placeObject finds the real survivor bed spot', () => {
    const s = fresh();
    s.objects['f15L-01'] = { dismantled: true };
    expect(placeObject(s, tower, balance, 'survivor_bed', '15:s1')).not.toBeNull();
    updateFloorStates(tower, s, balance, T0);
  });
});

describe('treat and regen', () => {
  it('regen follows the rate while the last upkeep was met, not for the active character', () => {
    const s = recruited(fresh(), { health: 50 });
    regenSurvivors(s, balance, 3600);
    expect(s.survivors.mara.health).toBe(50 + balance.survivors.healthRegenPerHour);
    s.activeId = 'mara';
    regenSurvivors(s, balance, 3600);
    expect(s.survivors.mara.health).toBe(50 + balance.survivors.healthRegenPerHour);
    s.activeId = 'hero';
    s.survivors.mara.health = 99;
    regenSurvivors(s, balance, 36000);
    expect(s.survivors.mara.health).toBe(100);
  });
  it('a missed upkeep stops regen; a met one restarts it', () => {
    const s = recruited(fresh(), { health: 50 });
    tickUpkeep(s, balance, T0 + 12 * HOUR, { offline: true }, []);
    expect(s.survivors.mara.upkeepMet).toBe(false);
    regenSurvivors(s, balance, 3600);
    expect(s.survivors.mara.health).toBe(40);
    addItem(s.stockpile, 'canned_food', 1, balance);
    addItem(s.stockpile, 'water_bottle', 1, balance);
    tickUpkeep(s, balance, T0 + 24 * HOUR, { offline: true }, []);
    expect(s.survivors.mara.upkeepMet).toBe(true);
  });
  it('treat uses bag items first, Steady hands makes a bandage +22, capped at 100', () => {
    const s = recruited(fresh(), { health: 60 });
    addItem(s.inventory, 'bandage', 1, balance);
    addItem(s.stockpile, 'bandage', 2, balance);
    const opts = treatOptions(s, balance);
    expect(opts.map((o) => o.from)).toEqual(['bag', 'stock']);
    expect(opts[0].heal).toBe(22);
    expect(treatSurvivor(s, balance, 'mara', 'bandage', 'bag')).toMatchObject({ ok: true, healed: 22 });
    expect(countItem(s.inventory, 'bandage')).toBe(0);
    expect(treatSurvivor(s, balance, 'mara', 'bandage', 'bag').reason).toBe('No medicine');
    s.survivors.mara.health = 90;
    expect(treatSurvivor(s, balance, 'mara', 'bandage', 'stock').healed).toBe(10);
    expect(treatSurvivor(s, balance, 'mara', 'bandage', 'stock').reason).toBe('Full health');
    expect(treatSurvivor(s, balance, 'mara', 'canned_food', 'stock').ok).toBe(false);
  });
  it('she needs joinMinMorale to join', () => {
    const s = fresh();
    interactSurvivor(s, balance, 'mara', T0);
    withBed(s);
    withBag(s);
    s.needs.morale = balance.survivors.joinMinMorale - 1;
    expect(interactSurvivor(s, balance, 'mara', T0).kind).toBe('refuse');
    s.needs.morale = balance.survivors.joinMinMorale;
    expect(interactSurvivor(s, balance, 'mara', T0).recruited).toBe(true);
  });
});
