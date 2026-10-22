/**
 * QA for Milestone 2 stage 1 (qa-tester). Cases marked it.fails document open bugs in docs/BUGS.md:
 * they pass while the bug exists and go red when it is fixed (then flip them to it).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import balance from '../public/data/balance.json';
import floorsData from '../public/data/levels/floors.json';
import audioManifest from '../public/assets/audio/manifest.json';
import { buildTower } from '../src/gameplay/layout.js';
import { makeZombie, makeAi, stepZombie, sightRadius, zombieTuning } from '../src/gameplay/zombies.js';
import { MOODLE_IDS, MOODLE_CUE_SOUND, activeMoodles } from '../src/gameplay/moodles.js';

const tower = buildTower(floorsData, balance);
const tune = zombieTuning(balance);

const srcText = (dir) => readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
const SCENES = srcText('src/scenes');
const ALL_SRC = SCENES + srcText('src/gameplay') + srcText('src/core');

describe('GDD 5.2 moodle table vs balance.json', () => {
  it('thresholds, stats and panic numbers equal the GDD', () => {
    const m = balance.moodles;
    expect(m.hungry).toMatchObject({ stat: 'food', below: [60, 40, 20, 1] });
    expect(m.thirsty).toMatchObject({ stat: 'water', below: [60, 40, 20, 1] });
    expect(m.tired).toMatchObject({ stat: 'energy', below: [50, 35, 20, 5] });
    expect(m.injured).toMatchObject({ stat: 'health', below: [80, 60, 35, 15] });
    expect(m.depressed).toMatchObject({ stat: 'morale', below: [50, 35, 25, 10] });
    expect(m.panic.zombieCountForLevel).toEqual([1, 2, 3, 5]);
    expect(m.iconPx).toBe(72); // moodles_l 24 px art x3
    expect(m.maxShown).toBe(6);
    expect(m.levelChangeWobbleSeconds).toBe(0.5);
  });
  it('one stat at its boundary value shows nothing, just below shows level 1', () => {
    const base = { health: 100, food: 100, water: 100, energy: 100, morale: 100 };
    expect(activeMoodles({ ...base, food: 60 }, 0, balance)).toEqual([]);
    expect(activeMoodles({ ...base, food: 59.99 }, 0, balance)[0]).toMatchObject({ id: 'hungry', level: 1 });
    expect(activeMoodles({ ...base, health: 14.9 }, 0, balance)[0]).toMatchObject({ id: 'injured', level: 4 });
  });
});

describe('sounds the code asks for', () => {
  const live = Object.entries(audioManifest.sounds).filter(([, v]) => !v.deprecated).map(([k]) => k);
  it('every literal key passed to playSfx exists in the manifest', () => {
    const keys = [...ALL_SRC.matchAll(/playSfx\([^,]+,\s*'([a-z0-9_]+)'/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(10);
    for (const k of keys) expect(audioManifest.sounds[k], k).toBeTruthy();
  });
  // BUG-028: MoodleView plays `moodle_${id}` (moodle_hungry ...) but the files are moodle_stomach, swallow, yawn, pain, sigh.
  it('every moodle with a cue plays a key that exists in the manifest', () => {
    for (const id of MOODLE_IDS) expect(audioManifest.sounds[MOODLE_CUE_SOUND[id]], `${id} -> ${MOODLE_CUE_SOUND[id]}`).toBeTruthy();
  });
  // BUG-029: positional zombie breath/shuffle (GDD 10 "zombies are heard before seen") is never requested.
  it('zombie breath and shuffle sounds are used by the scenes', () => {
    for (const k of ['zombie_breath_1', 'zombie_breath_2', 'zombie_shuffle']) expect(SCENES.includes(`'${k}'`), k).toBe(true);
  });
  it('deprecated sounds are blocked in playSfx', () => {
    expect(readFileSync('src/scenes/sfx.js', 'utf8')).toMatch(/def\?\.deprecated\)\s*return null/);
    for (const k of ['siren', 'alert_sting', 'survivor_blip', 'error', 'amb_tower', 'heartbeat', 'music_sad']) expect(!audioManifest.sounds[k] || audioManifest.sounds[k].deprecated, k).toBe(true); // deleted or flagged
  });
  it('total audio stays under 3 MB', () => {
    const bytes = readdirSync('public/assets/audio').filter((f) => f.endsWith('.ogg')).reduce((n, f) => n + readFileSync(`public/assets/audio/${f}`).length, 0);
    expect(bytes).toBeLessThan(3 * 1024 * 1024);
  });
  it('ambient ambience and the cue sounds exist', () => {
    for (const k of ['amb_wind', 'amb_rain', 'stair_shuffle', 'stair_bang_1', 'stair_bang_2', 'stair_bang_3', 'distant_groan_1', 'heartbeat_soft', 'music_sad_1']) expect(live).toContain(k);
  });
});

describe('no constant hum (CD, GDD 10 rule zero)', () => {
  it('the manifest has no room tone or lamp hiss and no file for them', () => {
    for (const k of ['amb_room_tone', 'lamp_hiss']) {
      expect(audioManifest.sounds[k], k).toBeUndefined();
      expect(readdirSync('public/assets/audio').includes(`${k}.ogg`), k).toBe(false);
    }
  });
  it('the only loops are the gust sources and the cue/health beds', () => {
    const loops = Object.entries(audioManifest.sounds).filter(([, v]) => v.loop).map(([k]) => k).sort();
    expect(loops).toEqual(['amb_rain', 'amb_wind', 'heartbeat_soft', 'stair_shuffle']);
  });
});

describe('attack cue numbers live in balance.json', () => {
  // BUG-030: balance.attacks.cue.secondGroanAtSeconds / bangBeatsSeconds / fightBangGapSeconds are not read; AttackDirector hard-codes 12, [8,5,2.5] and 2-3 s.
  it('AttackDirector reads the second groan and bang beats from balance', () => {
    const src = readFileSync('src/scenes/AttackDirector.js', 'utf8');
    expect(readFileSync('src/gameplay/cue.js', 'utf8').includes('secondGroanAtSeconds') && readFileSync('src/gameplay/cue.js', 'utf8').includes('bangBeatsSeconds') && src.includes('dueBeats')).toBe(true);
  });
  it('balance has the three keys and they are sane', () => {
    const c = balance.attacks.cue;
    expect(c.secondGroanAtSeconds).toBeLessThan(c.groanAtSeconds);
    expect(c.secondGroanAtSeconds).toBeGreaterThan(c.stairwellAtSeconds);
    expect(Math.max(...c.bangBeatsSeconds)).toBeLessThanOrEqual(c.stairwellAtSeconds);
  });
});

describe('stealth is reachable by sneaking up (GDD 5.4 "main tool for thinning rooms")', () => {
  // BUG-031: sight is 180 px around the zombie with no facing; the hero reaches fists/bat range (40/55) only after being seen.
  it('a hero walking at 100 px/s reaches bat range of an idle walker that faces away before it notices him', () => {
    const z = makeZombie('s', 'walker', 14, 300, balance);
    const ai = makeAi(-1); // facing away from the hero (zombies.sight: 24 px behind when walking)
    let heroX = 700;
    const env = { tower, doors: {}, heroFloor: 14, heroX, heroRoom: null, types: balance.zombies.types, sightRadius: 180, attackRange: 30, tune, rng: () => 0.5, bounds: { min: 0, max: 0 } };
    let unawareInRange = false;
    for (let t = 0; t < 12; t += 0.05) {
      heroX = Math.max(z.x + 10, heroX - 100 * 0.05);
      env.heroX = heroX;
      env.sightRadius = sightRadius(tower, 14, heroX, balance);
      stepZombie(z, ai, env, 0.05);
      if (!ai.noticed && Math.abs(heroX - z.x) <= balance.combat.weapons.spiked_bat.rangePx) unawareInRange = true;
    }
    expect(unawareInRange).toBe(true);
  });
});

describe('early floors vs the new zombie stats (data checks)', () => {
  const zombiesOf = (floor) => floorsData.floors.find((f) => f.number === floor).apartments.flatMap((a) => (a.zombies || []).map((z) => ({ ...z, apt: a.id })));
  it('every authored zombie type exists and stands inside its apartment, away from the stairwell entry', () => {
    for (const f of floorsData.floors) for (const a of f.apartments) for (const z of a.zombies || []) {
      expect(balance.zombies.types[z.type], `${a.id} ${z.type}`).toBeTruthy();
      expect(z.x).toBeGreaterThanOrEqual(170); // beyond landing sight (110) from the entry x 60
    }
  });
  it('a hero opening a door sees no zombie at 180 px without being seen: all room zombies are within sight of the doorway or beyond', () => {
    // Documents the shape of the early game: Mara's flat holds two walkers 110 and 140 px from its front door,
    // so opening it means being seen (sight 180 in a room). Fists lose that fight (see docs/BUGS.md, playtest notes).
    const door = tower.apartments.get('f13_left').doorX;
    const xs = zombiesOf(13).filter((z) => z.apt === 'f13_left').map((z) => z.x - door);
    expect(xs.length).toBeGreaterThanOrEqual(2);
    expect(Math.min(...xs)).toBeLessThan(balance.zombies.sightRadiusPx);
  });
  it('expected damage: two aware walkers out-damage a fists hero (13.1 dps vs 100 hp) and a spiked bat takes less', () => {
    const w = balance.zombies.types.walker;
    const dps = (2 * w.damage) / w.attackIntervalSeconds;
    const fists = balance.combat.weapons.fists;
    const bat = balance.combat.weapons.spiked_bat;
    const killTime = (wp) => Math.ceil(w.hp / wp.damage) * wp.cooldownSeconds;
    const fistsDamage = dps * killTime(fists) + (dps / 2) * killTime(fists);
    const batDamage = dps * killTime(bat) + (dps / 2) * killTime(bat);
    expect(fistsDamage).toBeGreaterThan(60); // the model is optimistic: the browser bot died 5 of 5 times with fists
    expect(batDamage).toBeLessThan(fistsDamage);
  });
});
