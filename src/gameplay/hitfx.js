/**
 * Hit feedback rules for zombie hits: which sound class a weapon makes, random variant picking
 * without an immediate repeat, and when a blood decal is left. No Phaser here.
 * TODO(game-designer): move WEAPON_HIT_SOUND and the numbers below into balance.json.
 */

/** Weapon id -> sound class. Anything not listed is 'blunt'. */
export const WEAPON_HIT_SOUND = {
  fists: 'punch',
  kitchen_knife: 'stab',
  pipe_spear: 'stab',
  spiked_bat: 'blunt',
  lead_pipe: 'blunt',
  crowbar: 'blunt',
};

/** Variants per sound class: keys are `hit_${class}_${n}`. */
export const HIT_VARIANTS = { stab: 3, blunt: 3, punch: 2 };

export const HIT_FX = {
  decalChance: 0.35,
  dripChance: 0.5,
  dripDelayMs: 450,
  dripVolume: 0.6,
  decalAlpha: 0.7,
  decalFadeSeconds: 600,
  decalMaxPerFloor: 30,
  decalJitterPx: 10,
};

/** @returns {'stab'|'blunt'|'punch'} */
export function hitSoundClass(weaponId) {
  return WEAPON_HIT_SOUND[weaponId] || 'blunt';
}

/**
 * Random variant number 1..count that differs from `last` (when count > 1).
 * @param {number} count
 * @param {number} last previous variant (0 = none)
 * @param {() => number} [rng] 0..1
 */
export function pickVariant(count, last = 0, rng = Math.random) {
  if (count <= 1) return 1;
  let n = 1 + Math.floor(rng() * count);
  if (n > count) n = count;
  if (n === last) n = (n % count) + 1;
  return n;
}

/** Sound key for a weapon hit, e.g. 'hit_stab_2'. `lastByClass` is updated in place. */
export function hitSoundKey(weaponId, lastByClass, rng = Math.random) {
  const cls = hitSoundClass(weaponId);
  const n = pickVariant(HIT_VARIANTS[cls], lastByClass[cls] || 0, rng);
  lastByClass[cls] = n;
  return `hit_${cls}_${n}`;
}

/** Fists use the small spatter. */
export const isSmallHit = (weaponId) => hitSoundClass(weaponId) === 'punch';

/** Leave a decal on this hit? Always on a kill. */
export const wantsDecal = (killed, rng = Math.random) => killed || rng() < HIT_FX.decalChance;

/** Decal alpha after `ageSeconds` (linear fade to 0). */
export function decalAlpha(ageSeconds) {
  return Math.max(0, HIT_FX.decalAlpha * (1 - ageSeconds / HIT_FX.decalFadeSeconds));
}
