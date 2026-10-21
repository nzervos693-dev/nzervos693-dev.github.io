/**
 * The home stairwell barricade (GDD 5.6, 5.8). Pure, no Phaser.
 * State: state.build.barricade = { level, hp }  (level 0 = none).
 * At 0 HP it stays built but gives no defense and zombies pass; Repair still works.
 * The hero always passes his own barricade; only zombies are stopped (see zombies.js movementBounds).
 */

/** Stats of a barricade level from balance.barricade.levels, or null. */
export const barricadeLevel = (balance, level) => balance.barricade.levels.find((l) => l.level === level) || null;

/** The barricade record (created on demand). */
export function barricadeOf(state) {
  state.build = state.build || {};
  return (state.build.barricade ||= { level: 0, hp: 0 });
}

/** Is a barricade standing and unbroken? */
export const barricadeUp = (state) => {
  const b = state.build?.barricade;
  return !!b && b.level > 0 && b.hp > 0;
};

/** Max HP of the built barricade (0 if none). */
export const barricadeMaxHp = (state, balance) => barricadeLevel(balance, state.build?.barricade?.level)?.hp ?? 0;

/** Defense it gives now: its level's defense, or 0 when none/broken. */
export function barricadeDefense(state, balance) {
  const b = state.build?.barricade;
  if (!b || b.hp <= 0) return 0;
  return barricadeLevel(balance, b.level)?.defense ?? 0;
}

/**
 * Build (or upgrade to) a level at full HP. Lv2 replaces Lv1. Does not check or pay the cost.
 * @returns {{level:number, hp:number}} the barricade
 */
export function buildBarricade(state, balance, level) {
  const b = barricadeOf(state);
  b.level = level;
  b.hp = barricadeLevel(balance, level).hp;
  state.build.breachLatched = false;
  return b;
}

/** What a zombie bite does to a barricade: its damage x zombies.barricadeDamageMult (0.4). */
export const barricadeDamage = (zombieDamage, balance) => zombieDamage * (balance.zombies.barricadeDamageMult ?? 1);

/**
 * Damage stage 0 (intact) to 4 (broken) from the HP ratio, using balance.barricade.visualStages
 * [0.75, 0.5, 0.25, 0]: stage 0 at or above 0.75, then 1, 2, 3 while HP is above the next limit, 4 at 0 HP.
 */
export function barricadeStage(hp, maxHp, balance) {
  if (!(hp > 0) || !(maxHp > 0)) return 4;
  const ratio = hp / maxHp;
  const limits = balance.barricade.visualStages || [0.75, 0.5, 0.25, 0];
  for (let i = 0; i < limits.length - 1; i++) if (ratio >= limits[i]) return i;
  return limits.length - 1;
}

/**
 * Short plain words for the barricade's condition (no HP numbers).
 */
export const BARRICADE_WORDS = ['It looks solid.', 'A plank is cracked.', 'Boards are hanging loose.', 'It is barely holding.', 'It is broken.'];

/**
 * Zombie damage to the barricade.
 * @returns {{hp:number, broken:boolean}} broken = it just reached 0
 */
export function damageBarricade(state, amount) {
  const b = state.build?.barricade;
  if (!b || b.hp <= 0) return { hp: b?.hp ?? 0, broken: false };
  b.hp = Math.max(0, b.hp - amount);
  return { hp: b.hp, broken: b.hp === 0 };
}

/**
 * Why a barricade recipe cannot be built, or null.
 * @param {number} level the recipe's level
 */
export function barricadeBlock(state, balance, level) {
  const lv = barricadeLevel(balance, level);
  if (!lv) return 'Not available yet';
  const have = state.build?.barricade?.level || 0;
  if (have >= level) return 'Already built';
  if (have < lv.requiresLevel) return `Build Barricade Lv${lv.requiresLevel} first`;
  return null;
}

/** Why Repair cannot be crafted, or null. */
export function repairBlock(state, balance) {
  const b = state.build?.barricade;
  if (!b || b.level <= 0) return 'No barricade to repair';
  if (b.hp >= barricadeMaxHp(state, balance)) return 'Barricade is holding';
  return null;
}

/**
 * One repair craft: restores balance.barricade.repairHpPerWood HP (capped). Does not pay.
 * @returns {number} HP restored
 */
export function repairBarricade(state, balance) {
  const b = barricadeOf(state);
  const before = b.hp;
  b.hp = Math.min(barricadeMaxHp(state, balance), b.hp + balance.barricade.repairHpPerWood);
  if (b.hp >= barricadeMaxHp(state, balance)) state.build.breachLatched = false; // repaired to full re-arms the breach penalty
  return b.hp - before;
}

/**
 * Breach penalty latch (GDD 5.2): the -10 morale applies when the barricade first drops to 0 HP,
 * then latches until it is repaired to full HP or a new attack begins.
 * @returns {boolean} true if the penalty is due now (and the latch is now set)
 */
export function latchBreach(state) {
  barricadeOf(state);
  if (state.build.breachLatched) return false;
  state.build.breachLatched = true;
  return true;
}

/** A new attack begins: re-arm the breach penalty (piece 3b calls this when an attack starts). */
export function resetBreachLatch(state) {
  if (state.build) state.build.breachLatched = false;
}
