/**
 * Plain-words descriptions that replace numbers in the UI (GDD 5.2, 8: no HP, percent or stat numbers).
 * Pure, no Phaser.
 */
import { levelFor, MOODLE_TEXT } from './moodles.js';

/** Condition of a survivor for the Crew screen. */
export function conditionWord(health, balance) {
  const level = levelFor(health, balance.moodles.injured.below);
  return level === 0 ? 'Well' : MOODLE_TEXT.injured[level - 1];
}

/** How worn a weapon or tool is, from uses left. */
export function wearWord(uses, max) {
  if (uses == null || !(max > 0)) return '';
  const r = uses / max;
  if (r > 0.66) return 'Sturdy.';
  if (r > 0.33) return 'Worn.';
  return 'Falling apart.';
}

/** What using a consumable does, in words: {food, water, health, morale} effect -> sentence. */
export function itemWords(e) {
  const parts = [];
  if (e.food > 0) parts.push('Something to eat.');
  if (e.water > 0 && e.health < 0) parts.push('Dirty water. It will hurt.');
  else if (e.water > 0) parts.push('Something to drink.');
  if (e.health > 0) parts.push('Patches you up.');
  if (e.morale > 0) parts.push('A small comfort.');
  return parts.join(' ');
}
