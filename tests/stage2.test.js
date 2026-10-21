import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { towerData, templates, makeTower } from './helpers/tower.js';
import { buildTower, slotX, edgeX, insideSign, homeSpot } from '../src/gameplay/layout.js';
import {
  lockAxis, deadZoneTarget, lerpFactor, clampScrollX, centerScrollX,
} from '../src/gameplay/camera.js';
import { createGameState, normalizeGameState, isStaleGame, STATE_VERSION } from '../src/gameplay/gameState.js';
import { limitWalk, doorStopX, DOOR_STOP_MARGIN } from '../src/gameplay/routing.js';
import { rollLoot } from '../src/gameplay/loot.js';
import { listActions, completeAction } from '../src/gameplay/actions.js';
import { doorDistanceFactor } from '../src/gameplay/cue.js';
import { makeZombie, makeAi, stepZombie, zombieTuning, startChase, STEP_BARRICADE, STEP_ATTACK, barrierBetween } from '../src/gameplay/zombies.js';
import { seededRng } from '../src/gameplay/rng.js';

const tower = makeTower(balance);
const c = balance.controls;
const PAD = balance.controls.cameraEdgePadPx;

describe('camera: axis lock', () => {
  it('stays undecided inside the 16 px threshold', () => {
    expect(lockAxis(10, 10, c.dragThresholdPx)).toBeNull(); // 14.1 px
    expect(lockAxis(0, 16, c.dragThresholdPx)).toBeNull();
  });
  it('locks horizontal when |dx| > |dy|, vertical otherwise (a tie is vertical)', () => {
    expect(lockAxis(20, 5, c.dragThresholdPx)).toBe('x');
    expect(lockAxis(-30, 20, c.dragThresholdPx)).toBe('x');
    expect(lockAxis(5, 20, c.dragThresholdPx)).toBe('y');
    expect(lockAxis(15, 15, c.dragThresholdPx)).toBe('y');
    expect(lockAxis(0, -40, c.dragThresholdPx)).toBe('y');
  });
});

describe('camera: dead zone follow', () => {
  const view = 720;
  const dz = c.cameraDeadzoneXPx;
  it('does not move while the hero is inside +/-160 px of the screen centre', () => {
    expect(deadZoneTarget(1000, 1000 + 360 + 159, view, dz)).toBe(1000);
    expect(deadZoneTarget(1000, 1000 + 360 - 159, view, dz)).toBe(1000);
  });
  it('moves just enough to keep the hero on the dead zone edge', () => {
    expect(deadZoneTarget(1000, 1000 + 360 + 300, view, dz)).toBe(1000 + 300 - dz);
    expect(deadZoneTarget(1000, 1000 + 360 - 300, view, dz)).toBe(1000 - 300 + dz);
  });
  it('target puts the hero exactly on the edge of the zone', () => {
    const right = deadZoneTarget(1000, 2000, view, dz);
    expect(2000 - (right + view / 2)).toBe(dz);
    const left = deadZoneTarget(1000, 1100, view, dz);
    expect(1100 - (left + view / 2)).toBe(-dz);
  });
  it('lerp is frame-rate independent: 1 s of frames reaches the same point at 30, 60 and 120 fps', () => {
    const run = (fps) => {
      let x = 0;
      for (let i = 0; i < fps; i++) x += (1000 - x) * lerpFactor(c.cameraLerp, 1 / fps);
      return x;
    };
    expect(run(30)).toBeCloseTo(run(60), 3);
    expect(run(120)).toBeCloseTo(run(60), 3);
    expect(lerpFactor(c.cameraLerp, 1 / 60)).toBeCloseTo(c.cameraLerp, 6);
  });
  it('bounds: 0..3120 plus the back-swipe margin; a world narrower than the view centres', () => {
    expect(clampScrollX(-500, view, 3120, PAD)).toBe(-PAD);
    expect(clampScrollX(9999, view, 3120, PAD)).toBe(3120 + PAD - view);
    expect(clampScrollX(500, view, 3120, PAD)).toBe(500);
    expect(clampScrollX(40, view, 500, 0)).toBe(-110);
    expect(centerScrollX(1560, view, 3120, PAD)).toBe(1200);
    expect(centerScrollX(72, view, 3120, PAD)).toBe(-PAD);
  });
});

describe('layout parsing', () => {
  it('slot x formula: left x = 1440 - d, right x = 1680 + d, d = module*240 + 240*floor(k/2) + 72/168', () => {
    expect(slotX('left', 0, 0, balance)).toBe(1368);
    expect(slotX('left', 0, 1, balance)).toBe(1272);
    expect(slotX('left', 1, 2, balance)).toBe(888); // d = 240 + 240 + 72
    expect(slotX('right', 0, 0, balance)).toBe(1752);
    expect(slotX('right', 5, 1, balance)).toBe(3048);
    expect(slotX('right', 5, 0, balance)).toBe(2952);
    expect(slotX('left', 5, 1, balance)).toBe(72);
  });
  it('every authored object x equals the formula of its room and slot', () => {
    for (const { placement: o, apt } of tower.objects.values()) {
      if (o.door) continue;
      const room = apt.rooms.find((r) => r.id === o.room);
      const k = Number(/\d+$/.exec(o.slot)[0]);
      expect(o.x, o.id).toBe(slotX(apt.side, room.startModule, k, balance));
    }
  });
  it('rooms get x spans from their modules; a unit spans one wing', () => {
    const f15 = tower.apartments.get('f15L');
    expect(f15.xMin).toBe(0);
    expect(f15.xMax).toBe(1440);
    expect(f15.doorX).toBe(1440);
    const living = f15.rooms.find((r) => r.id === 'living');
    expect([living.xMin, living.xMax]).toEqual([720, 1200]);
    const r = tower.apartments.get('f15R');
    expect([r.xMin, r.xMax, r.doorX]).toEqual([1680, 3120, 1680]);
    expect(edgeX('right', 1440, balance)).toBe(3120);
    expect(insideSign('left')).toBe(-1);
    expect(insideSign('right')).toBe(1);
  });
  it('indexes floors, doors, windows and the workbench fixture', () => {
    expect([...tower.floors.keys()]).toEqual([13, 14, 15, 16, 17]);
    expect(tower.floorWidth).toBe(3120);
    expect(tower.stairwell.entryX).toBe(1560);
    expect(tower.home.fixtures.map((f) => f.kind)).toEqual(['workbench']);
    expect(tower.objects.has('f15L-1-wall2')).toBe(false); // fixtures are not salvage objects
    expect(tower.apartments.get('f13L').rooms.find((x) => x.id === 'living').window).toBe(true);
    expect(tower.apartments.get('f13L').rooms.find((x) => x.id === 'bathroom').window).toBe(false);
    expect(tower.homeBedId).toBe('f15L-3-floor0');
    expect(homeSpot(tower)).toEqual({ floor: 15, x: 408 });
  });
  it('interior doors become doors and salvage objects with their state; front doors carry frontDoor', () => {
    const d = tower.doors.get('f13L-door3');
    expect(d).toMatchObject({ kind: 'interior', x: 240, state: 'jammed', floor: 13 });
    expect(tower.objects.get('f13L-door3').placement.objectId).toBe('interior_door');
    expect(tower.doors.get('f13L').state).toBe('jammed');
    expect(tower.doors.get('f15L').state).toBe('open');
    expect(tower.floors.get(13).doors.length).toBeGreaterThan(4);
  });
  it('note texts come from templates.json', () => {
    const o = tower.objects.get('f13L-3-floor1').placement;
    expect(o.foundNote.text).toBe(templates.notes.find((n) => n.id === 'note_knock').text);
    expect(tower.objects.get('f15L-2-wall0').placement.foundNote.text).toBe('A tin of nails.');
    expect(tower.objects.get('f13L-4-wall0').placement.foundNote.text).toMatch(/bag/);
  });
  it('without templates the window rooms fall back to the known types', () => {
    const t = buildTower(towerData, balance);
    expect(t.apartments.get('f15L').rooms.find((r) => r.id === 'kitchen').window).toBe(true);
  });
});

describe('interior and front doors block like M1 jammed doors', () => {
  const doors = { f13L: { state: 'jammed' }, 'f13L-door3': { state: 'jammed' } };
  it('the hero stops 42 px short of Mara\'s jammed bathroom door, from either side', () => {
    const r = limitWalk(tower, doors, 13, 600, 100);
    expect(r.blockedDoor.id).toBe('f13L-door3');
    expect(r.x).toBe(240 + DOOR_STOP_MARGIN);
    const back = limitWalk(tower, doors, 13, 100, 600);
    expect(back.x).toBe(240 - DOOR_STOP_MARGIN);
    expect(doorStopX(tower.doors.get('f13L-door3'), 600)).toBe(282);
  });
  it('the landing side of a jammed front door stops the hero at 1482', () => {
    const r = limitWalk(tower, doors, 13, 1560, 900);
    expect(r.blockedDoor.id).toBe('f13L');
    expect(r.x).toBe(1440 + DOOR_STOP_MARGIN);
  });
  it('sight and zombies respect an interior door', () => {
    expect(barrierBetween(tower, doors, 13, 200, 300)).toBe(true);
    expect(barrierBetween(tower, { 'f13L-door3': { state: 'open' } }, 13, 200, 300)).toBe(false);
  });
});

describe('front-door barricade (home rule until stage 3)', () => {
  const bar = { up: true, floor: 15, x: tower.barricadeX, inside: tower.barricadeInside };
  const mk = () => ({
    tower, doors: {}, heroFloor: 15, heroX: 1300, heroRoom: null, types: balance.zombies.types, sightRadius: 200, attackRange: balance.zombies.attackRange,
    tune: zombieTuning(balance), rng: seededRng(3), bounds: { min: 0, max: 0 }, barricade: bar,
  });
  it('attackers that come from the stairs walk left to the door and bite the barricade', () => {
    const env = mk();
    const z = makeZombie('attack:1:0', 'walker', 15, 1590, balance, { siege: true });
    const ai = makeAi(-1);
    startChase(ai, env.tune);
    let hits = 0;
    let bites = 0;
    for (let i = 0; i < 1200; i++) {
      const f = stepZombie(z, ai, env, 0.05);
      if (f & STEP_BARRICADE) hits++;
      if (f & STEP_ATTACK) bites++;
    }
    expect(z.x).toBeCloseTo(1452, 0);
    expect(hits).toBeGreaterThan(3);
    expect(bites).toBe(0);
  });
  it('a zombie inside the flat is never pushed out: it keeps to the inside', () => {
    const env = mk();
    const z = makeZombie('in', 'walker', 15, 1300, balance);
    const ai = makeAi(1);
    startChase(ai, env.tune);
    for (let i = 0; i < 600; i++) stepZombie(z, ai, { ...env, heroX: 1560 }, 0.05);
    expect(z.x).toBeLessThanOrEqual(1440 - 12 + 0.01);
  });
  it('arrival x for attackers is on the stairs side of the door', () => {
    // attackers appear 16-70 px from the stairs toward the home door, and walk to it
    expect(tower.stairwell.entryX + tower.barricadeInside * 16).toBeGreaterThan(tower.barricadeX);
    expect(tower.stairwell.entryX + tower.barricadeInside * 70).toBeGreaterThan(tower.barricadeX);
    expect(tower.stairwell.entryX + tower.barricadeInside * 70).toBeLessThan(tower.stairwell.entryX);
  });
});

describe('loot: empty containers and padlocks', () => {
  const tables = { desk: { entries: [{ id: 'duct_tape', qtyMin: 1, qtyMax: 1, weight: 1 }] } };
  const def = balance.objects.desk;
  it('an `empty` container gives nothing, even with rolls', () => {
    expect(rollLoot({ empty: true }, def, tables, balance, () => 0.1)).toEqual([]);
  });
  it('fixedLoot is never empty', () => {
    expect(rollLoot({ empty: true, fixedLoot: [{ id: 'canned_food', qty: 1 }] }, def, tables, balance, () => 0.1)).toEqual([{ id: 'canned_food', qty: 1 }]);
  });
  it('a normal unit rolls the GDD empty chance; ransacked and burned units rely on the authored flag', () => {
    const tables = { kitchen_drawer: { entries: [{ id: 'metal', qtyMin: 1, qtyMax: 1, weight: 1 }] } };
    const def = balance.objects.kitchen_drawer;
    const place = { id: 'x', objectId: 'kitchen_drawer', rolls: [1, 1] };
    const run = (cond, flag) => {
      const s = createGameState(balance, tower, 1);
      const spec = { kind: 'search', id: 'x', seconds: 0, energy: 0, tool: null, noise: 'quiet' };
      return completeAction(s, spec, flag ? { ...place, empty: true } : place, def, { balance, tables, rng: () => 0.1, loc: { floor: 15, x: 1 }, apt: { condition: cond } }).gained;
    };
    expect(run('normal')).toEqual([]); // rng 0.1 < 0.3: empty
    expect(run(undefined)).toEqual([]);
    expect(run('ransacked')).toEqual([{ id: 'metal', qty: 1 }]); // no second roll
    expect(run('burned')).toEqual([{ id: 'metal', qty: 1 }]);
    expect(run('ransacked', true)).toEqual([]);
  });
  it('a storage cage cannot be searched without a crowbar', () => {
    const s = createGameState(balance, tower, 1);
    const acts = listActions(balance.objects.storage_cage, 'x', s, balance);
    expect(acts[0]).toMatchObject({ kind: 'search', enabled: false, reason: 'Needs crowbar' });
  });
});

describe('save version 2', () => {
  it('a newer save is not stale (never deleted by an older build)', () => {
    expect(isStaleGame({ started: true, v: STATE_VERSION + 1 })).toBe(false);
  });
  it('an M1 / stage 1 game (v1) is stale and would be deleted; a stage 2 game is not', () => {
    expect(STATE_VERSION).toBe(2);
    expect(isStaleGame({ started: true, v: 1, hero: { floor: 15, x: 200 } })).toBe(true);
    expect(isStaleGame({ started: true })).toBe(true);
    expect(isStaleGame(createGameState(balance, tower, 1))).toBe(false);
    expect(isStaleGame({})).toBe(false);
    expect(isStaleGame(undefined)).toBe(false);
  });
  it('new games start in the start flat with doors from the data and the tutorial', () => {
    const s = createGameState(balance, tower, 1);
    expect(s.hero).toEqual({ floor: 15, x: 408 });
    expect(Object.keys(s.doors).length).toBe(tower.doors.size);
    expect(normalizeGameState(JSON.parse(JSON.stringify(s)), balance, tower, 5).v).toBe(2);
  });
});

describe('stairwell banging gets quieter down the wing', () => {
  it('full near the home door, 30% far away, linear between', () => {
    expect(doorDistanceFactor(1440, 1440, balance)).toBe(1);
    expect(doorDistanceFactor(1440 + 480, 1440, balance)).toBe(1);
    expect(doorDistanceFactor(-200, 1440, balance)).toBeCloseTo(0.3, 5);
    const mid = doorDistanceFactor(1440 - 990, 1440, balance);
    expect(mid).toBeGreaterThan(0.3);
    expect(mid).toBeLessThan(1);
  });
});
