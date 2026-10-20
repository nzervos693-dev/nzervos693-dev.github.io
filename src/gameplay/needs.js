/**
 * Hero needs simulation. Pure, no Phaser. Rates are per real hour (balance.needs).
 */

export const NEED_KEYS = ['health', 'food', 'water', 'energy', 'morale'];

/** Starting needs from balance. */
export function initNeeds(balance) {
  const n = balance.needs;
  return Object.fromEntries(NEED_KEYS.map((k) => [k, n[k].start]));
}

const clamp = (v, max) => Math.max(0, Math.min(max, v));

/**
 * Advance needs by dt seconds (mutates).
 * @param {object} needs {health, food, water, energy, morale}
 * @param {number} dt seconds
 * @param {{sleeping?:boolean, offline?:boolean}} mode offline = app closed (asleep at home)
 * @param {object} balance
 */
export function tickNeeds(needs, dt, mode, balance) {
  const b = balance.needs;
  const h = dt / 3600;
  const max = b.max;
  const prevHealth = needs.health;

  needs.food = clamp(needs.food - b.food.drain * h, max);
  needs.water = clamp(needs.water - b.water.drain * h, max);
  needs.morale = clamp(needs.morale - b.morale.drain * h, max);

  if (mode.offline) {
    needs.energy = clamp(needs.energy + b.energy.offlineRegen * h, max);
  } else if (mode.sleeping) {
    needs.energy = clamp(needs.energy + b.energy.sleepRegen * h, max);
  } else {
    const mult = needs.morale < b.morale.lowThreshold ? b.morale.lowEnergyDrainMult : 1;
    needs.energy = clamp(needs.energy - b.energy.drain * mult * h, max);
  }

  const empty = ['food', 'water', 'energy'].filter((k) => needs[k] <= 0).length;
  if (empty > 0) {
    needs.health -= b.emptyNeedDamage * empty * h;
  } else if (
    needs.food > b.health.regenMinFoodWater &&
    needs.water > b.health.regenMinFoodWater &&
    needs.energy > b.health.regenMinEnergy
  ) {
    needs.health += b.health.regen * h;
  }
  needs.health = clamp(needs.health, max);
  if (mode.offline) needs.health = Math.max(needs.health, Math.min(prevHealth, b.offlineHealthFloor));
}

/**
 * Effect of using an item, or null if it is not usable.
 * Mara's Steady hands: ctx.bandageMult (floored).
 * @returns {{food:number, water:number, health:number, morale:number}|null}
 */
export function itemEffect(itemId, balance, ctx = {}) {
  const e = { food: 0, water: 0, health: 0, morale: 0 };
  const c = balance.consumables?.[itemId];
  if (c) {
    e.food = c.food || 0;
    e.water = c.water || 0;
    e.health = c.health || 0;
    e.morale = c.morale || 0;
    if (itemId === 'bandage' && ctx.bandageMult) e.health = Math.floor(e.health * ctx.bandageMult);
    return e;
  }
  const w = balance.water;
  if (w && itemId === w.dirty.id) {
    e.water = w.dirty.water;
    e.health = -w.dirtyHealthCost;
    return e;
  }
  if (w && itemId === w.clean.id) {
    e.water = w.clean.water;
    return e;
  }
  return null;
}

/**
 * Use an item on the needs (mutates on success).
 * @returns {{ok:boolean, reason?:string, effect?:object}}
 */
export function applyItem(needs, itemId, balance, ctx = {}, offline = false) {
  const e = itemEffect(itemId, balance, ctx);
  if (!e) return { ok: false, reason: 'Cannot use' };
  const max = balance.needs.max;
  const useful =
    (e.food > 0 && needs.food < max) ||
    (e.water > 0 && needs.water < max) ||
    (e.health > 0 && needs.health < max) ||
    (e.morale > 0 && needs.morale < max);
  if (!useful) return { ok: false, reason: 'Not needed now' };
  const prev = needs.health;
  needs.food = clamp(needs.food + e.food, max);
  needs.water = clamp(needs.water + e.water, max);
  needs.morale = clamp(needs.morale + e.morale, max);
  needs.health = clamp(needs.health + e.health, max);
  if (offline) needs.health = Math.max(needs.health, Math.min(prev, balance.needs.offlineHealthFloor));
  return { ok: true, effect: e };
}

/** Energy below lowThreshold: speed and damage penalty applies. */
export const isLowEnergy = (needs, balance) => needs.energy < balance.needs.energy.lowThreshold;

/** Multiplier on walk speed from low energy. */
export const speedMult = (needs, balance) =>
  isLowEnergy(needs, balance) ? 1 - balance.needs.energy.lowPenalty : 1;
