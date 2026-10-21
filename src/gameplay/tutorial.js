/**
 * Tutorial by doing (GDD 8.3). Pure, no Phaser.
 *
 * state.story = { tutorial: 'active'|'done'|'skipped', walked: boolean, doorOpened: boolean }
 * The current step is the first one whose goal is not met yet, computed from the game state, so doing things
 * in another order just skips ahead. Hints never block play; the player can skip the whole tutorial.
 */
import { startAttackClock } from './attacks.js';

/** Scripted crawler record id (floors.json scriptedSpawns tutorial_crawler on floor 15). */
export const TUTORIAL_CRAWLER = 'scripted:tutorial_crawler';
/** Bus event the scene emits when the player opens the door (floors.json trigger). */
export const TUTORIAL_TRIGGER = 'tutorial_open_door';

const searched = (id) => (s) => !!(s.objects[id]?.searched || s.objects[id]?.dismantled);
const dismantled = (id) => (s) => !!s.objects[id]?.dismantled;

/**
 * Steps in order. `target` says what the arrow points at: an object id, a fixture kind, 'door' or 'crawler'.
 * Object ids come from floors.json (apartment f15_left).
 */
export const TUTORIAL_STEPS = [
  { id: 'walk', target: null, done: (s) => !!s.story.walked },
  { id: 'fridge', target: { object: 'f15L-03' }, done: searched('f15L-03') },
  { id: 'chair', target: { object: 'f15L-01' }, done: dismantled('f15L-01') },
  { id: 'table', target: { object: 'f15L-02' }, done: dismantled('f15L-02') },
  { id: 'drawer', target: { object: 'f15L-05' }, done: searched('f15L-05') },
  { id: 'workbench', target: { fixture: 'workbench' }, done: (s) => (s.build?.barricade?.level || 0) >= 1 },
  { id: 'door', target: { door: true }, done: (s) => !!s.story.doorOpened },
  { id: 'fight', target: { crawler: true }, done: (s) => !!s.zombies[TUTORIAL_CRAWLER]?.dead },
];

/** The story record (created on demand; a missing one counts as a finished tutorial). */
export const storyOf = (state) => (state.story ||= { tutorial: 'skipped', walked: true, doorOpened: true });

/** Is the tutorial running? */
export const tutorialActive = (state) => storyOf(state).tutorial === 'active';

/** The step to show now, or null when the tutorial is not running / complete. */
export function currentStep(state) {
  if (!tutorialActive(state)) return null;
  return TUTORIAL_STEPS.find((st) => !st.done(state)) || null;
}

/**
 * Should the door open now? True on the 'door' step once the hero walks out of the apartment door.
 * @param {{floor:number, x:number}} hero
 * @param {number} homeFloor
 * @param {number} doorX home apartment door x
 */
export function shouldOpenDoor(state, hero, homeFloor, doorX) {
  return currentStep(state)?.id === 'door' && hero.floor === homeFloor && hero.x <= doorX;
}

/**
 * Close the tutorial when every step is done: the scripted attack clock starts (GDD 5.8).
 * @returns {boolean} true if it just finished
 */
export function checkTutorialDone(state, balance, nowMs) {
  if (!tutorialActive(state) || currentStep(state)) return false;
  state.story.tutorial = 'done';
  startAttackClock(state, balance, nowMs);
  return true;
}

/** Skip the tutorial for good (also starts the scripted attack clock, as if it ended). */
export function skipTutorial(state, balance, nowMs) {
  if (!tutorialActive(state)) return;
  state.story.tutorial = 'skipped';
  startAttackClock(state, balance, nowMs);
}

/** Fresh story record for a New game. */
export const newStory = () => ({ tutorial: 'active', walked: false, doorOpened: false });
