/**
 * Milestone 2 stage 1: moodles, diegetic attack cue, soundscape scheduling, stealth, run noise,
 * lose track, barricade damage and stages, scarcer loot.
 */
import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import floorsData from '../public/data/levels/floors.json';
import { buildTower } from '../src/gameplay/layout.js';
import { createGameState } from '../src/gameplay/gameState.js';
import { seededRng } from '../src/gameplay/rng.js';
import { addItem } from '../src/gameplay/inventory.js';
import {
  levelFor, activeMoodles, makePanic, stepPanic, panicTarget, moodleAction, moodleHint, MOODLE_TEXT,
} from '../src/gameplay/moodles.js';
import { cueConfig, dueBeats, crossed, stairVolume, isFlickering, landingDip } from '../src/gameplay/cue.js';
import { attackState, startAttackClock, cueStart } from '../src/gameplay/attacks.js';
import {
  nextGroanGap, nextAmbientGap, pickNoRepeat, musicAllowed,
} from '../src/gameplay/soundscape.js';
import { isRunTap, canRun, stepRun, runConfig } from '../src/gameplay/running.js';
import {
  makeZombie, makeAi, stepZombie, hearNoise, isAware, sightRadius, zombieTuning, parseFacing, spawnFacing, startChase, STEP_AGGRO,
} from '../src/gameplay/zombies.js';
import { swingDamage, hitZombie, heroWeapon, damageMult } from '../src/gameplay/combat.js';
import { barricadeStage, barricadeDamage } from '../src/gameplay/barricade.js';
import { rollLoot, emptyChanceFor } from '../src/gameplay/loot.js';
import { conditionWord, wearWord } from '../src/gameplay/words.js';

const tower = buildTower(floorsData, balance);
const tune = zombieTuning(balance);
const T0 = 1_000_000;
const fresh = () => createGameState(balance, tower, T0);
const needs = (over = {}) => ({ health: 100, food: 80, water: 80, energy: 100, morale: 60, ...over });

describe('moodles', () => {
  it('level N shows below the N-th threshold (4 levels, worst last)', () => {
    const below = balance.moodles.hungry.below; // 60 40 20 1
    expect(levelFor(60, below)).toBe(0);
    expect(levelFor(59, below)).toBe(1);
    expect(levelFor(39, below)).toBe(2);
    expect(levelFor(19, below)).toBe(3);
    expect(levelFor(0, below)).toBe(4);
    expect(levelFor(0.5, below)).toBe(4);
    expect(levelFor(1, below)).toBe(3);
  });
  it('a healthy start shows nothing; only what is wrong appears, worst first', () => {
    expect(activeMoodles(needs(), 0, balance)).toEqual([]);
    const list = activeMoodles(needs({ food: 10, water: 55, energy: 30 }), 0, balance);
    expect(list.map((m) => m.id)).toEqual(['hungry', 'tired', 'thirsty']);
    expect(list[0]).toMatchObject({ id: 'hungry', level: 3, text: 'Very hungry' });
  });
  it('the Tired and Depressed level-3 thresholds equal the M1 low-need thresholds', () => {
    expect(balance.moodles.tired.below[2]).toBe(balance.needs.energy.lowThreshold);
    expect(balance.moodles.depressed.below[2]).toBe(balance.needs.morale.lowThreshold);
  });
  it('every moodle has four card texts and no digits', () => {
    for (const lines of Object.values(MOODLE_TEXT)) {
      expect(lines).toHaveLength(4);
      for (const l of lines) expect(l).not.toMatch(/\d/);
    }
  });
  it('shows at most maxShown moodles', () => {
    const list = activeMoodles(needs({ health: 5, food: 0, water: 0, energy: 0, morale: 0 }), 4, balance);
    expect(list.length).toBeLessThanOrEqual(balance.moodles.maxShown);
    expect(list).toHaveLength(6);
  });
  it('panic rises at once and decays one level per 5 s', () => {
    const p = makePanic();
    expect(panicTarget(0, balance)).toBe(0);
    expect(panicTarget(2, balance)).toBe(2);
    expect(panicTarget(5, balance)).toBe(4);
    stepPanic(p, 3, 0.1, balance);
    expect(p.level).toBe(3);
    stepPanic(p, 0, 4.9, balance);
    expect(p.level).toBe(3);
    stepPanic(p, 0, 0.2, balance);
    expect(p.level).toBe(2);
    stepPanic(p, 0, 11, balance);
    expect(p.level).toBe(0);
  });
  it('panic lowers damage by level', () => {
    const w = heroWeapon({ equipped: null, inventory: [] }, balance);
    expect(damageMult(needs(), balance, 0)).toBeCloseTo(1, 5);
    expect(damageMult(needs(), balance, 4)).toBeCloseTo(0.7, 5);
    expect(swingDamage(w, needs(), balance, { panic: 4 })).toBeLessThan(swingDamage(w, needs(), balance));
  });
  it('card action: smallest fitting food, bag first; tired has only a hint; comfort items last', () => {
    const s = fresh();
    expect(moodleAction('hungry', s, balance, true)).toBeNull();
    addItem(s.stockpile, 'dry_snack', 1, balance);
    expect(moodleAction('hungry', s, balance, false)).toBeNull(); // the stash only counts at home
    expect(moodleAction('hungry', s, balance, true)).toMatchObject({ label: 'Eat: Dry snack', from: 'stock' });
    addItem(s.inventory, 'canned_food', 1, balance);
    expect(moodleAction('hungry', s, balance, true)).toMatchObject({ label: 'Eat: Canned food', from: 'bag' });
    const c = fresh();
    addItem(c.inventory, 'chocolate', 1, balance);
    expect(moodleAction('hungry', c, balance, false)).toMatchObject({ itemId: 'chocolate' }); // nothing else exists
    addItem(c.inventory, 'water_bottle', 1, balance);
    expect(moodleAction('thirsty', c, balance, false)).toMatchObject({ label: 'Drink: Water bottle' });
    addItem(c.inventory, 'bandage', 1, balance);
    expect(moodleAction('injured', c, balance, false)).toMatchObject({ label: 'Use: Bandage' });
    expect(moodleAction('tired', c, balance, true)).toBeNull();
    expect(moodleHint('tired')).toBe('Find a bed.');
  });
  it('crew condition and wear are words', () => {
    expect(conditionWord(100, balance)).toBe('Well');
    expect(conditionWord(30, balance)).toBe('Badly hurt');
    expect(wearWord(50, 50)).toBe('Sturdy.');
    expect(wearWord(5, 50)).toBe('Falling apart.');
  });
});

describe('attack cue', () => {
  it('has no countdown UI numbers: cue 15 s, groans at T-15, stairwell at T-8, flicker from T-8', () => {
    const c = cueConfig(balance);
    expect(c).toMatchObject({ cueSeconds: 15, groanAt: 15, stairwellAt: 8, flickerFrom: 8, audibleFloors: 2 });
  });
  it('the cue starts 15 s before the attack', () => {
    const s = fresh();
    expect(cueStart(s, balance)).toBeNull();
    startAttackClock(s, balance, T0);
    expect(cueStart(s, balance)).toBe(attackState(s).nextAt - 15000);
  });
  it('fires each beat once as time crosses it, and reads its timings from balance', () => {
    const kinds = (a, b) => dueBeats(a, b, balance).map((x) => `${x.kind}@${x.at}`);
    expect(kinds(16, 15.5)).toEqual([]);
    expect(kinds(15.5, 14.9)).toEqual(['groan@15']);
    expect(kinds(14.9, 14.8)).toEqual([]);
    expect(kinds(12.1, 11.9)).toEqual(['groan@12']); // secondGroanAtSeconds
    expect(kinds(8.1, 7.9)).toEqual(['bang@8']);
    expect(kinds(5.1, 4.9)).toEqual(['bang@5']);
    expect(kinds(2.6, 2.4)).toEqual(['bang@2.5']);
    expect(crossed(5.1, 4.9, 5)).toBe(true);
    const custom = { attacks: { ...balance.attacks, cue: { ...balance.attacks.cue, secondGroanAtSeconds: 13, bangBeatsSeconds: [7] } } };
    expect(dueBeats(13.1, 12.9, custom).map((x) => x.kind)).toEqual(['groan']);
    expect(dueBeats(5.1, 4.9, custom)).toEqual([]);
  });
  it('a late start that skips several beats reports them in order so the caller can sound only the last', () => {
    const due = dueBeats(20, 4, balance);
    expect(due.map((x) => x.at)).toEqual([15, 12, 8, 5]);
  });
  it('the landing light flickers only from T-8 s', () => {
    expect(isFlickering(9, balance)).toBe(false);
    expect(isFlickering(8, balance)).toBe(true);
    const dips = Array.from({ length: 40 }, (_, i) => landingDip(i));
    expect(Math.min(...dips)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...dips)).toBeLessThanOrEqual(0.6);
    expect(new Set(dips.map((d) => d.toFixed(2))).size).toBeGreaterThan(3);
  });
  it('stairwell banging is loud on the attacked floor and fades out beyond 2 floors', () => {
    expect(stairVolume(15, 15, balance)).toBe(1);
    expect(stairVolume(16, 15, balance)).toBeLessThan(1);
    expect(stairVolume(17, 15, balance)).toBeLessThan(stairVolume(16, 15, balance));
    expect(stairVolume(17, 15, balance)).toBeGreaterThan(0);
    expect(stairVolume(13, 16, balance)).toBe(0);
  });
});

describe('soundscape scheduling', () => {
  it('distant groans every 45-120 s and ambient one-shots every 20-60 s', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 100; i++) {
      const g = nextGroanGap(rng, balance);
      expect(g).toBeGreaterThanOrEqual(45);
      expect(g).toBeLessThanOrEqual(120);
      const a = nextAmbientGap(rng, balance);
      expect(a).toBeGreaterThanOrEqual(20);
      expect(a).toBeLessThanOrEqual(60);
    }
  });
  it('one-shots never repeat the last pick', () => {
    const rng = seededRng(3);
    let last = -1;
    for (let i = 0; i < 200; i++) {
      const n = pickNoRepeat(rng, 4, last);
      expect(n).not.toBe(last);
      last = n;
    }
  });
  it('music waits for its cooldown and never plays during danger', () => {
    const cd = 10 * 60000;
    expect(musicAllowed(0, null, cd, false)).toBe(true);
    expect(musicAllowed(0, null, cd, true)).toBe(false);
    expect(musicAllowed(5 * 60000, 0, cd, false)).toBe(false);
    expect(musicAllowed(11 * 60000, 0, cd, false)).toBe(true);
  });
});

describe('run on double tap', () => {
  const t0 = { t: 1000, x: 300, y: 500 };
  it('a second tap within 0.3 s and 48 px is a run tap; slower or farther is not', () => {
    expect(isRunTap(null, t0, balance)).toBe(false);
    expect(isRunTap(t0, { t: 1250, x: 330, y: 500 }, balance)).toBe(true);
    expect(isRunTap(t0, { t: 1400, x: 300, y: 500 }, balance)).toBe(false);
    expect(isRunTap(t0, { t: 1100, x: 360, y: 500 }, balance)).toBe(false);
  });
  it('running is faster than walking, loud (250 px), and costs energy', () => {
    const c = runConfig(balance);
    expect(c.speed).toBe(170);
    expect(c.speed).toBeGreaterThan(balance.hero.walkSpeed);
    expect(c.noiseRadius).toBe(250);
    expect(c.energyPerSecond).toBeGreaterThan(0);
  });
  it('fires a noise at once and then once per second, draining energy', () => {
    const run = {};
    const n = needs({ energy: 50 });
    let noises = 0;
    for (let i = 0; i < 100; i++) if (stepRun(run, n, 0.05, balance).noise) noises++; // 5 s
    expect(noises).toBeGreaterThanOrEqual(5);
    expect(noises).toBeLessThanOrEqual(6);
    expect(n.energy).toBeCloseTo(50 - 5 * runConfig(balance).energyPerSecond, 3);
  });
  it('below the minimum energy a double tap falls back to walking, and a running hero stops', () => {
    expect(canRun(4.9, balance)).toBe(false);
    expect(canRun(5, balance)).toBe(true);
    const n = needs({ energy: 5.05 });
    expect(stepRun({}, n, 1, balance).stopped).toBe(true);
  });
});

describe('stealth and sight', () => {
  it('first hit on an unaware zombie deals x3 damage; an aware one takes normal damage', () => {
    const w = heroWeapon({ equipped: null, inventory: [] }, balance);
    const base = swingDamage(w, needs(), balance);
    expect(swingDamage(w, needs(), balance, { unaware: true })).toBe(base * 3);
    expect(isAware(makeAi())).toBe(false);
    const ai = makeAi();
    ai.mode = 'chase';
    ai.noticed = true;
    expect(isAware(ai)).toBe(true);
  });
  it('a zombie only alerted by noise is still unaware; a hit makes it aware', () => {
    const z = makeZombie('n', 'walker', 14, 300, balance);
    const ai = makeAi();
    expect(hearNoise(z, ai, { floor: 14, x: 200, radius: 250 }, tune)).toBe(true);
    expect(ai.mode).toBe('chase');
    expect(ai.lastKnownX).toBe(200);
    expect(isAware(ai)).toBe(false);
    hitZombie(z, ai, 5, 250, { min: 0, max: 700 }, balance, tune);
    expect(isAware(ai)).toBe(true);
  });
  it('a walker dies to one unaware spiked bat hit plus one more', () => {
    const z = makeZombie('s', 'walker', 14, 300, balance);
    const bat = balance.combat.weapons.spiked_bat.damage;
    const first = bat * balance.combat.unawareHitMult;
    expect(first).toBeLessThan(z.hp);
    expect(first + bat).toBeGreaterThanOrEqual(z.hp);
  });
  it('sight radius: landing is Dim (110), a room is Grey in stage 1 (180)', () => {
    expect(sightRadius(tower, 15, 40, balance)).toBe(110);
    expect(sightRadius(tower, 15, 300, balance)).toBe(180);
  });
  it('a noise-alerted zombie walks toward the noise, not the hero, and loses track after 8 s', () => {
    const z = makeZombie('t', 'walker', 14, 600, balance);
    const ai = makeAi();
    const env = {
      tower, doors: {}, heroFloor: 14, heroX: 100, heroRoom: null, types: balance.zombies.types, sightRadius: 110,
      attackRange: 30, tune, rng: () => 0.5, bounds: { min: 0, max: 0 },
    };
    hearNoise(z, ai, { floor: 14, x: 500, radius: 400 }, tune);
    for (let i = 0; i < 400; i++) stepZombie(z, ai, env, 0.05); // 20 s
    expect(z.x).toBeGreaterThanOrEqual(498); // went to the noise only
    expect(ai.mode).not.toBe('chase'); // gave up, shambling home
  });
  it('a zombie that sees the hero chases him and does not lose track while he stays in sight', () => {
    const z = makeZombie('c', 'walker', 14, 400, balance);
    const ai = makeAi(-1);
    const env = {
      tower, doors: {}, heroFloor: 14, heroX: 300, heroRoom: null, types: balance.zombies.types, sightRadius: 180,
      attackRange: 30, tune, rng: () => 0.5, bounds: { min: 0, max: 0 },
    };
    expect(stepZombie(z, ai, env, 0.1) & STEP_AGGRO).toBeTruthy();
    expect(isAware(ai)).toBe(true);
    for (let i = 0; i < 300; i++) stepZombie(z, ai, env, 0.05);
    expect(['chase', 'attack']).toContain(ai.mode);
  });
  it('a hero on another floor loses the chaser after loseTrackSeconds', () => {
    const z = makeZombie('o', 'walker', 14, 400, balance);
    const ai = makeAi();
    ai.mode = 'chase';
    ai.noticed = true;
    const env = {
      tower, doors: {}, heroFloor: 15, heroX: 300, heroRoom: null, types: balance.zombies.types, sightRadius: 180,
      attackRange: 30, tune, rng: () => 0.5, bounds: { min: 0, max: 0 },
    };
    for (let i = 0; i < 100; i++) stepZombie(z, ai, env, 0.05); // 5 s
    expect(ai.mode).toBe('chase');
    for (let i = 0; i < 100; i++) stepZombie(z, ai, env, 0.05); // 10 s
    expect(ai.mode).not.toBe('chase');
  });
});

describe('barricade damage and stages', () => {
  it('zombie damage to a barricade is multiplied by 0.4', () => {
    expect(barricadeDamage(8, balance)).toBeCloseTo(3.2, 5);
    expect(barricadeDamage(14, balance)).toBeCloseTo(5.6, 5);
  });
  it('5 damage stages by HP ratio: intact, cracked, hanging, barely held, broken', () => {
    const max = 120;
    expect(barricadeStage(120, max, balance)).toBe(0);
    expect(barricadeStage(90, max, balance)).toBe(0);
    expect(barricadeStage(89, max, balance)).toBe(1);
    expect(barricadeStage(60, max, balance)).toBe(1);
    expect(barricadeStage(59, max, balance)).toBe(2);
    expect(barricadeStage(30, max, balance)).toBe(2);
    expect(barricadeStage(29, max, balance)).toBe(3);
    expect(barricadeStage(1, max, balance)).toBe(3);
    expect(barricadeStage(0, max, balance)).toBe(4);
  });
});

describe('scarcer loot', () => {
  const table = { entries: [{ id: 'canned_food', qtyMin: 1, qtyMax: 3, weight: 1 }, { id: 'wood', qtyMin: 2, qtyMax: 4, weight: 1 }] };
  const def = { primary: { lootTable: 't' } };
  const place = { id: 'x' };
  it('empty chance follows the unit condition (normal 30%, ransacked 70%, burned 85%)', () => {
    expect(emptyChanceFor({}, balance)).toBe(0.3);
    expect(emptyChanceFor({ condition: 'ransacked' }, balance)).toBe(0.7);
    expect(emptyChanceFor({ condition: 'burned' }, balance)).toBe(0.85);
  });
  it('a container is empty when its empty roll hits, and never when fixedLoot guarantees something', () => {
    const rng = () => 0.1; // < 0.3
    expect(rollLoot(place, def, { t: table }, balance, rng, { emptyChance: 0.3 })).toEqual([]);
    const fixed = { id: 'y', fixedLoot: [{ id: 'canned_food', qty: 1 }] };
    expect(rollLoot(fixed, def, { t: table }, balance, rng, { emptyChance: 0.9 })).toEqual([{ id: 'canned_food', qty: 1 }]);
  });
  it('makes 0-2 rolls and consumables come one at a time', () => {
    const rng = seededRng(11);
    let max = 0;
    for (let i = 0; i < 300; i++) {
      const loot = rollLoot(place, def, { t: table }, balance, rng, { emptyChance: 0.3 });
      for (const e of loot) if (e.id === 'canned_food') expect(e.qty).toBeLessThanOrEqual(2); // 2 rolls x 1
      max = Math.max(max, loot.reduce((n, e) => n + (e.id === 'canned_food' ? 1 : 0), 0));
    }
    expect(balance.scavenge.lootRolls).toEqual([0, 2]);
    expect(max).toBeGreaterThan(0);
  });
  it('a single canned-food roll is exactly 1', () => {
    const only = { entries: [{ id: 'canned_food', qtyMin: 2, qtyMax: 3, weight: 1 }] };
    const pl = { id: 'z', rolls: [1, 1] };
    expect(rollLoot(pl, def, { t: only }, balance, () => 0.5, {})).toEqual([{ id: 'canned_food', qty: 1 }]);
  });
});

describe('zombie facing (GDD 5.4, zombies.sight.*)', () => {
  const env = (over = {}) => ({
    tower, doors: {}, heroFloor: 14, heroX: 400, heroRoom: null, types: balance.zombies.types, sightRadius: 180, heroRunning: false,
    attackRange: 30, tune, rng: () => 0.5, bounds: { min: 0, max: 0 }, ...over,
  });
  it('sees 180 px in front but only 24 px behind when walking and 60 px behind when running', () => {
    const zombieAt = () => makeZombie('f', 'walker', 14, 300, balance);
    // zombie faces left (-1); the hero stands to its right (behind it)
    expect(stepZombie(zombieAt(), makeAi(-1), env({ heroX: 300 + 100 }), 0.05) & STEP_AGGRO).toBe(0);
    expect(stepZombie(zombieAt(), makeAi(-1), env({ heroX: 300 + 30 }), 0.05) & STEP_AGGRO).toBe(0);
    expect(stepZombie(zombieAt(), makeAi(-1), env({ heroX: 300 + 20 }), 0.05) & STEP_AGGRO).toBeTruthy();
    expect(stepZombie(zombieAt(), makeAi(-1), env({ heroX: 300 + 50, heroRunning: true }), 0.05) & STEP_AGGRO).toBeTruthy();
    expect(stepZombie(zombieAt(), makeAi(-1), env({ heroX: 300 + 70, heroRunning: true }), 0.05) & STEP_AGGRO).toBe(0);
    // facing right: the same hero is in front
    expect(stepZombie(zombieAt(), makeAi(1), env({ heroX: 300 + 100 }), 0.05) & STEP_AGGRO).toBeTruthy();
  });
  it('an intact barricade blocks sight both ways; a broken one does not', () => {
    const z = () => makeZombie('b', 'crawler', 15, 40, balance);
    const bar = (up) => ({ up, floor: 15, x: 100 });
    expect(stepZombie(z(), makeAi(1), env({ heroFloor: 15, heroX: 140, barricade: bar(true) }), 0.05) & STEP_AGGRO).toBe(0);
    expect(stepZombie(z(), makeAi(1), env({ heroFloor: 15, heroX: 140, barricade: bar(false) }), 0.05) & STEP_AGGRO).toBeTruthy();
  });
  it('an idle zombie turns round every 4-8 s after a 0.4 s head-turn', () => {
    const z = makeZombie('i', 'walker', 14, 300, balance);
    const ai = makeAi(1);
    ai.pause = 1000; // standing still
    const e = env({ heroFloor: null });
    let turnedAt = null;
    for (let t = 0; t < 12 && turnedAt == null; t += 0.05) {
      stepZombie(z, ai, e, 0.05);
      if (ai.facing === -1) turnedAt = t;
    }
    expect(turnedAt).toBeGreaterThanOrEqual(4);
    expect(turnedAt).toBeLessThanOrEqual(8.6);
  });
  it('spawn facing: authored field wins; otherwise 70% look away from the unit door', () => {
    const apt = { doorX: 130 };
    expect(parseFacing('left')).toBe(-1);
    expect(parseFacing(1)).toBe(1);
    expect(parseFacing(null)).toBeNull();
    expect(spawnFacing({ facing: 'left' }, apt, 300, () => 0, tune)).toBe(-1);
    expect(spawnFacing({}, apt, 300, () => 0.1, tune)).toBe(1); // away from the door (door is on the left)
    expect(spawnFacing({}, apt, 300, () => 0.9, tune)).toBe(-1);
  });
  it('a zombie that gave up is unaware again (a hit on it counts x3)', () => {
    const z = makeZombie('g', 'walker', 14, 400, balance);
    const ai = makeAi();
    startChase(ai, tune);
    ai.noticed = true;
    const e = env({ heroFloor: 15, heroX: 300 });
    for (let i = 0; i < 400; i++) stepZombie(z, ai, e, 0.05);
    expect(ai.noticed).toBe(false);
    expect(isAware(ai)).toBe(false);
  });
});
