/**
 * Loot rolling. Pure; pass an rng (Math.random or seededRng).
 */
import { randInt, mergeItems } from './rng.js';

/**
 * Pick one table entry by weight.
 * @param {{entries:{id:string,qtyMin:number,qtyMax:number,weight:number}[]}} table
 * @param {() => number} rng
 * @returns {{id:string, qty:number}|null}
 */
export function rollTable(table, rng) {
  const entries = table?.entries || [];
  const total = entries.reduce((n, e) => n + e.weight, 0);
  if (!total) return null;
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r < 0) return { id: e.id, qty: randInt(rng, e.qtyMin, e.qtyMax) };
  }
  const last = entries[entries.length - 1];
  return { id: last.id, qty: last.qtyMin };
}

/** Empty chance of an apartment condition when generator.conditions is missing (normal condition: 30%). */
const DEFAULT_EMPTY_CHANCE = 0.3;

/**
 * Chance that a container of this apartment is empty (GDD 5.5): normal 30%, ransacked 70%, burned 85%
 * (balance.generator.conditions.<c>.emptyChance). Apartments in floors.json have no condition yet: normal.
 * @param {{condition?:string}|null} apt
 */
export function emptyChanceFor(apt, balance) {
  const cond = apt?.condition || 'normal';
  return balance.generator?.conditions?.[cond]?.emptyChance ?? DEFAULT_EMPTY_CHANCE;
}

/** Consumables and water come one at a time (scavenge.consumableQtyCap). */
function capConsumable(entry, balance) {
  const type = balance.items?.[entry.id]?.type;
  const cap = balance.scavenge.consumableQtyCap;
  if ((type === 'consumable' || type === 'water') && Number.isFinite(cap)) return { ...entry, qty: Math.min(entry.qty, cap) };
  return entry;
}

/**
 * Loot for one search of a placed container.
 * fixedLoot present: guaranteed list plus `rolls` [min,max] table rolls (0 if absent).
 * No fixedLoot: balance.scavenge.lootRolls (0-2) rolls from the object's table, but first the
 * container may be empty (opts.emptyChance; never for fixedLoot, which is guaranteed).
 * Consumables come as 1.
 * @param {object} placement  floors.json object entry
 * @param {object} def        balance.objects[objectId]
 * @param {object} tables     loot.json .tables
 * @param {object} balance
 * @param {() => number} rng
 * @param {{emptyChance?:number}} [opts]
 * @returns {{id:string, qty:number}[]}
 */
export function rollLoot(placement, def, tables, balance, rng, opts = {}) {
  const out = [];
  let range;
  if (placement.fixedLoot) {
    for (const f of placement.fixedLoot) out.push({ id: f.id, qty: f.qty });
    range = placement.rolls || [0, 0];
  } else {
    range = placement.rolls || balance.scavenge.lootRolls;
  }
  const empty = !placement.fixedLoot && (opts.emptyChance ?? 0) > 0 && rng() < opts.emptyChance;
  const n = empty ? 0 : randInt(rng, range[0], range[1]);
  const table = tables?.[def?.primary?.lootTable];
  for (let i = 0; i < n && table; i++) {
    const r = rollTable(table, rng);
    if (r) out.push(capConsumable(r, balance));
  }
  return mergeItems(out);
}
