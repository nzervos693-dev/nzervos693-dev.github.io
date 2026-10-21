/**
 * Moodles (GDD 5.2): small icons that replace need bars. Pure, no Phaser.
 * A moodle has 4 severity levels; level N shows when the stat is below the N-th value of its
 * `below` array (balance.moodles.<id>.below). Level 0 = hidden. Panic is driven by the number of
 * aggroed zombies near the hero and decays one level at a time.
 */
import { pickAutoUseItem } from './offline.js';
import { countItem } from './inventory.js';

/** Moodle ids in display-sheet order (also the order of the art sheet). */
export const MOODLE_IDS = ['hungry', 'thirsty', 'tired', 'injured', 'depressed', 'panic'];

/** Card text per level (GDD 5.2 table). Plain words, no numbers. */
export const MOODLE_TEXT = {
  hungry: ['Peckish', 'Hungry', 'Very hungry', 'Starving'],
  thirsty: ['Thirsty', 'Very thirsty', 'Parched', 'Dying of thirst'],
  tired: ['Tired', 'Very tired', 'Exhausted', 'Can barely stand'],
  injured: ['Hurt', 'Injured', 'Badly hurt', 'Close to death'],
  depressed: ['Low', 'Unhappy', 'Depressed', 'Hopeless'],
  panic: ['Uneasy', 'Scared', 'Panicked', 'Terrified'],
};

/**
 * Level 0-4 for a stat value: the highest N whose threshold the value is below.
 * @param {number} value
 * @param {number[]} below ascending severity thresholds, e.g. [60, 40, 20, 1]
 */
export function levelFor(value, below) {
  let level = 0;
  for (let i = 0; i < below.length; i++) if (value < below[i]) level = i + 1;
  return level;
}

/** Panic level 0-4 for a count of aggroed zombies near the hero (zombieCountForLevel: [1,2,3,5]). */
export function panicTarget(count, balance) {
  const need = balance.moodles.panic.zombieCountForLevel;
  let level = 0;
  for (let i = 0; i < need.length; i++) if (count >= need[i]) level = i + 1;
  return level;
}

/** Fresh panic state. */
export const makePanic = () => ({ level: 0, t: 0 });

/**
 * Advance panic by dt seconds: it rises at once to the target and falls one level per
 * moodles.panic.decaySecondsPerLevel. Mutates and returns the level.
 */
export function stepPanic(panic, count, dt, balance) {
  const target = panicTarget(count, balance);
  if (target >= panic.level) { panic.level = target; panic.t = 0; return panic.level; }
  panic.t += dt;
  const per = balance.moodles.panic.decaySecondsPerLevel;
  while (panic.t >= per && panic.level > target) { panic.t -= per; panic.level -= 1; }
  return panic.level;
}

/** Damage multiplier from panic (moodles.panic.damagePenalty: damage -0/-10/-20/-30%). */
export function panicDamageMult(level, balance) {
  const p = balance.moodles.panic.damagePenalty[level - 1];
  return level > 0 && Number.isFinite(p) ? 1 - p : 1;
}

/**
 * Moodles to show, worst level first (ties keep sheet order), at most moodles.maxShown.
 * @param {{health:number,food:number,water:number,energy:number,morale:number}} needs
 * @param {number} panicLevel
 * @param {object} balance
 * @returns {{id:string, level:number, text:string}[]}
 */
export function activeMoodles(needs, panicLevel, balance) {
  const out = [];
  for (const id of MOODLE_IDS) {
    const level = id === 'panic' ? panicLevel : levelFor(needs[balance.moodles[id].stat], balance.moodles[id].below);
    if (level > 0) out.push({ id, level, text: MOODLE_TEXT[id][level - 1] });
  }
  out.sort((a, b) => b.level - a.level);
  return out.slice(0, balance.moodles.maxShown);
}

/** Signature of a moodle list, to detect changes cheaply. */
export const moodleKey = (list) => list.map((m) => `${m.id}${m.level}`).join(',');

/**
 * The one action on a moodle card, or null. Food/water: the smallest fitting item, carried first,
 * then the stash when `atHome`; comfort items only when nothing else fits (current 0 forces the
 * last-resort rule of pickAutoUseItem). Injured: a bandage, else a medkit.
 * @returns {{label:string, itemId:string, from:'bag'|'stock'}|null}
 */
export function moodleAction(id, state, balance, atHome) {
  const TREAT = balance.survivors?.treatItems || ['bandage', 'medkit'];
  const name = (item) => balance.items[item]?.name || item;
  if (id === 'hungry' || id === 'thirsty') {
    const need = id === 'hungry' ? 'food' : 'water';
    const sources = [['bag', state.inventory]];
    if (atHome) sources.push(['stock', state.stockpile]);
    for (const [from, slots] of sources) {
      const item = pickAutoUseItem(slots, need, balance, 0);
      if (item) return { label: `${need === 'food' ? 'Eat' : 'Drink'}: ${name(item)}`, itemId: item, from };
    }
    return null;
  }
  if (id === 'injured') {
    const sources = [['bag', state.inventory]];
    if (atHome) sources.push(['stock', state.stockpile]);
    for (const [from, slots] of sources) {
      const item = TREAT.find((t) => countItem(slots, t) > 0);
      if (item) return { label: `Use: ${name(item)}`, itemId: item, from };
    }
  }
  return null;
}

/** Sound key of the soft body cue each moodle plays when it appears or changes level. */
export const MOODLE_CUE_SOUND = {
  hungry: 'moodle_stomach', thirsty: 'moodle_swallow', tired: 'moodle_yawn',
  injured: 'moodle_pain', depressed: 'moodle_sigh', panic: 'moodle_panic',
};

/** Extra line on the card with no button (Tired: "Find a bed."). */
export const moodleHint = (id) => (id === 'tired' ? 'Find a bed.' : '');
