import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import { towerData, makeTower } from './helpers/tower.js';
import { createGameState, normalizeGameState } from '../src/gameplay/gameState.js';
import { attackState } from '../src/gameplay/attacks.js';
import { INTRO_CARDS, TUTORIAL_TEXT } from '../src/gameplay/storyText.js';
import {
  TUTORIAL_STEPS, TUTORIAL_CRAWLER, currentStep, shouldOpenDoor, checkTutorialDone, skipTutorial, tutorialActive,
} from '../src/gameplay/tutorial.js';

const tower = makeTower(balance);
const T0 = 9_000_000;
const fresh = () => createGameState(balance, tower, T0);
const doorX = tower.home.doorX;

/** Do every step up to (not including) the named one. */
function doUntil(s, id) {
  for (const st of TUTORIAL_STEPS) {
    if (st.id === id) return;
    if (st.id === 'walk') s.story.walked = true;
    else if (st.id === 'fridge') s.objects['f15L-2-floor0'] = { searched: true };
    else if (st.id === 'chair') s.objects['f15L-1-floor0'] = { dismantled: true };
    else if (st.id === 'table') s.objects['f15L-1-floor1'] = { dismantled: true };
    else if (st.id === 'drawer') s.objects['f15L-2-wall0'] = { searched: true };
    else if (st.id === 'workbench') s.build.barricade = { level: 1, hp: 100 };
    else if (st.id === 'door') s.story.doorOpened = true;
    else if (st.id === 'fight') s.zombies[TUTORIAL_CRAWLER] = { dead: true };
  }
}

describe('tutorial steps', () => {
  it('a new game starts on "walk" and has a hint text for every step', () => {
    const s = fresh();
    expect(tutorialActive(s)).toBe(true);
    expect(currentStep(s).id).toBe('walk');
    for (const st of TUTORIAL_STEPS) expect(TUTORIAL_TEXT[st.id], st.id).toBeTruthy();
  });
  it('steps follow the GDD order: walk, fridge, chair, table, drawer, workbench, door, fight', () => {
    const s = fresh();
    const seen = [];
    for (let i = 0; i < 20; i++) {
      const st = currentStep(s);
      if (!st) break;
      seen.push(st.id);
      doUntil(s, TUTORIAL_STEPS[TUTORIAL_STEPS.findIndex((x) => x.id === st.id) + 1]?.id ?? 'zzz');
    }
    expect(seen).toEqual(['walk', 'fridge', 'chair', 'table', 'drawer', 'workbench', 'door', 'fight']);
  });
  it('doing things out of order just skips ahead', () => {
    const s = fresh();
    s.objects['f15L-1-floor0'] = { dismantled: true };
    s.story.walked = true;
    expect(currentStep(s).id).toBe('fridge');
    s.objects['f15L-2-floor0'] = { searched: true };
    expect(currentStep(s).id).toBe('table');
  });
  it('"dismantled" also counts as searched for the fridge and drawer', () => {
    const s = fresh();
    s.story.walked = true;
    s.objects['f15L-2-floor0'] = { dismantled: true };
    expect(currentStep(s).id).toBe('chair');
  });
  it('every target object exists in tower_m2.json', () => {
    for (const st of TUTORIAL_STEPS) if (st.target?.object) expect(tower.objects.has(st.target.object), st.id).toBe(true);
    expect(tower.home.fixtures.some((f) => f.kind === 'workbench')).toBe(true);
    expect(towerData.floors.find((f) => f.number === 15).scriptedSpawns[0].id).toBe('tutorial_crawler');
  });
});

describe('door trigger', () => {
  const side = tower.home.side;
  it('fires only on the door step, when the hero walks up to the front door from inside', () => {
    const s = fresh();
    expect(side).toBe('left');
    expect(shouldOpenDoor(s, { floor: 15, x: doorX - 5 }, 15, doorX, side)).toBe(false); // too early
    doUntil(s, 'door');
    expect(currentStep(s).id).toBe('door');
    expect(shouldOpenDoor(s, { floor: 15, x: 900 }, 15, doorX, side)).toBe(false);
    expect(shouldOpenDoor(s, { floor: 14, x: doorX }, 15, doorX, side)).toBe(false);
    expect(shouldOpenDoor(s, { floor: 15, x: doorX - balance.tutorial.doorTriggerPx }, 15, doorX, side, balance.tutorial.doorTriggerPx)).toBe(true);
    expect(shouldOpenDoor(s, { floor: 15, x: doorX }, 15, doorX, side)).toBe(true);
  });
  it('mirrors for a home in the right wing', () => {
    const s = fresh();
    doUntil(s, 'door');
    expect(shouldOpenDoor(s, { floor: 15, x: 1680 + 20 }, 15, 1680, 'right')).toBe(true);
    expect(shouldOpenDoor(s, { floor: 15, x: 2400 }, 15, 1680, 'right')).toBe(false);
  });
  it('the scripted crawler waits on the landing outside the front door', () => {
    const sp = towerData.floors.find((f) => f.number === 15).scriptedSpawns[0];
    expect(sp.trigger).toBe('tutorial_open_door');
    expect(sp.x).toBeGreaterThan(doorX);
    expect(sp.x).toBeLessThan(tower.stairwell.xMax);
  });
  it('never when the tutorial was skipped', () => {
    const s = fresh();
    skipTutorial(s, balance, T0);
    expect(shouldOpenDoor(s, { floor: 15, x: 1440 }, 15, doorX, side)).toBe(false);
  });
});

describe('ending and skipping', () => {
  it('finishing the last step ends the tutorial and starts the scripted attack clock (10 min)', () => {
    const s = fresh();
    doUntil(s, 'fight');
    expect(checkTutorialDone(s, balance, T0 + 1000)).toBe(false);
    s.zombies[TUTORIAL_CRAWLER] = { dead: true };
    expect(checkTutorialDone(s, balance, T0 + 60_000)).toBe(true);
    expect(s.story.tutorial).toBe('done');
    expect(attackState(s).nextAt).toBe(T0 + 60_000 + 10 * 60 * 1000);
    expect(checkTutorialDone(s, balance, T0 + 90_000)).toBe(false);
  });
  it('skipping counts as ending: the attack clock starts, once', () => {
    const s = fresh();
    skipTutorial(s, balance, T0 + 5000);
    expect(s.story.tutorial).toBe('skipped');
    expect(currentStep(s)).toBeNull();
    expect(attackState(s).nextAt).toBe(T0 + 5000 + 600_000);
    skipTutorial(s, balance, T0 + 99_000);
    expect(attackState(s).nextAt).toBe(T0 + 5000 + 600_000);
  });
  it('progress persists in the state and survives normalize; old saves skip the tutorial and start the clock', () => {
    const s = fresh();
    s.story.walked = true;
    const again = normalizeGameState(JSON.parse(JSON.stringify(s)), balance, tower, T0 + 1);
    expect(again.story).toEqual({ tutorial: 'active', walked: true, doorOpened: false });
    expect(currentStep(again).id).toBe('fridge');
    const old = JSON.parse(JSON.stringify(s));
    delete old.story;
    delete old.attacks;
    const n = normalizeGameState(old, balance, tower, T0 + 2);
    expect(n.story.tutorial).toBe('skipped');
    expect(attackState(n).nextAt).toBe(T0 + 2 + 600_000);
    expect(n.activeId).toBe('hero');
    expect(n.bodies).toEqual([]);
  });
});

describe('story text', () => {
  it('the intro has 2-4 short cards', () => {
    expect(INTRO_CARDS.length).toBeGreaterThanOrEqual(2);
    expect(INTRO_CARDS.length).toBeLessThanOrEqual(4);
    for (const c of INTRO_CARDS) expect(c.length).toBeLessThan(120);
  });
});
