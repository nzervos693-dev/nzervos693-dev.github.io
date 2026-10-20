/**
 * Hero combat rules: weapons, swing damage, hits on zombies, hits on the hero. Pure, no Phaser.
 *
 * Equipped weapon rule (GDD is silent): the equipped weapon stays in its bag slot.
 * state.equipped = { slot, id } points at that slot; if the slot no longer holds that
 * weapon (stored, dropped, broken) the hero is back on fists.
 */
import { startChase } from './zombies.js';

export const FISTS = 'fists';

/**
 * Damage multiplier from needs (GDD 5.2): low energy -30%, low morale -20%, high morale +10%.
 */
export function damageMult(needs, balance) {
  const n = balance.needs;
  let m = 1;
  if (needs.energy < n.energy.lowThreshold) m *= 1 - n.energy.lowPenalty;
  if (needs.morale < n.morale.lowThreshold) m *= 1 - n.morale.lowDamagePenalty;
  else if (needs.morale > n.morale.highThreshold) m *= 1 + n.morale.highDamageBonus;
  return m;
}

/**
 * The weapon in hand. Clears a stale `state.equipped`.
 * @returns {{id:string, name:string, damage:number, range:number, cooldown:number, slot:number, uses:number|null}}
 */
export function heroWeapon(state, balance) {
  const eq = state.equipped;
  let id = FISTS;
  let slot = -1;
  let uses = null;
  if (eq) {
    const s = state.inventory[eq.slot];
    if (s && s.id === eq.id && balance.combat.weapons[eq.id]) { id = eq.id; slot = eq.slot; uses = s.uses ?? null; }
    else state.equipped = null;
  }
  const w = balance.combat.weapons[id];
  return { id, name: w.name, damage: w.damage, range: w.rangePx, cooldown: w.cooldownSeconds, slot, uses };
}

/** Is this bag slot a weapon the hero can equip? */
export function isEquippable(slot, balance) {
  return !!slot && balance.items?.[slot.id]?.type === 'weapon' && !!balance.combat.weapons[slot.id];
}

/** Equip the weapon in a bag slot. @returns {boolean} equipped */
export function equipSlot(state, index, balance) {
  const s = state.inventory[index];
  if (!isEquippable(s, balance)) return false;
  state.equipped = { slot: index, id: s.id };
  return true;
}

export function unequip(state) { state.equipped = null; }

/** Is the bag slot the equipped one? */
export const isEquipped = (state, index) =>
  !!state.equipped && state.equipped.slot === index && state.inventory[index]?.id === state.equipped.id;

/**
 * Damage of one swing, rounded, at least 1.
 */
export function swingDamage(weapon, needs, balance) {
  return Math.max(1, Math.round(weapon.damage * damageMult(needs, balance)));
}

/** Spend the swing's energy (never below 0). */
export function spendSwingEnergy(needs, balance) {
  needs.energy = Math.max(0, needs.energy - balance.combat.energyPerSwing);
}

/**
 * Spend one durability point of the equipped weapon after a hit.
 * @returns {{broke:boolean, id:string}|null} null for fists / unbreakable
 */
export function spendWeaponUse(state, balance) {
  const w = heroWeapon(state, balance);
  if (w.slot < 0 || w.uses == null) return null;
  const s = state.inventory[w.slot];
  s.uses -= 1;
  if (s.uses > 0) return { broke: false, id: w.id };
  state.inventory[w.slot] = null;
  state.equipped = null;
  return { broke: true, id: w.id };
}

/** Is a target at tx within reach of a hero at hx? */
export const inReach = (hx, tx, range) => Math.abs(tx - hx) <= range;

/**
 * Deal a weapon hit to a zombie: damage, knockback away from `fromX`, short stun, and it turns on the hero.
 * @param {{min:number,max:number}} bounds walkable range for the zombie
 * @returns {boolean} true if this hit killed it
 */
export function hitZombie(z, ai, damage, fromX, bounds, balance, tune) {
  z.hp = Math.max(0, z.hp - damage);
  if (z.hp <= 0) { z.dead = true; return true; }
  const dir = z.x >= fromX ? 1 : -1;
  z.x = Math.min(bounds.max, Math.max(bounds.min, z.x + dir * balance.combat.knockbackPx));
  ai.stun = tune.hitStunSeconds;
  if (ai.mode !== 'chase' && ai.mode !== 'attack') startChase(ai, tune);
  return false;
}

/** Damage from fire etc.: no knockback, no stun. @returns {boolean} killed */
export function burnZombie(z, amount) {
  z.hp = Math.max(0, z.hp - amount);
  if (z.hp <= 0) z.dead = true;
  return z.dead;
}

/**
 * A zombie bite on the hero (armor arrives in M3).
 * @returns {{damage:number, dead:boolean}}
 */
export function damageHero(needs, amount) {
  const dmg = Math.max(0, amount);
  needs.health = Math.max(0, needs.health - dmg);
  return { damage: dmg, dead: needs.health <= 0 };
}
