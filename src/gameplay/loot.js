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

/**
 * Loot for one search of a placed container.
 * fixedLoot present: guaranteed list plus `rolls` [min,max] table rolls (0 if absent).
 * No fixedLoot: balance.scavenge.lootRolls rolls from the object's table.
 * @param {object} placement  floors.json object entry
 * @param {object} def        balance.objects[objectId]
 * @param {object} tables     loot.json .tables
 * @param {object} balance
 * @param {() => number} rng
 * @returns {{id:string, qty:number}[]}
 */
export function rollLoot(placement, def, tables, balance, rng) {
  const out = [];
  let range;
  if (placement.fixedLoot) {
    for (const f of placement.fixedLoot) out.push({ id: f.id, qty: f.qty });
    range = placement.rolls || [0, 0];
  } else {
    range = placement.rolls || balance.scavenge.lootRolls;
  }
  const n = randInt(rng, range[0], range[1]);
  const table = tables?.[def?.primary?.lootTable];
  for (let i = 0; i < n && table; i++) {
    const r = rollTable(table, rng);
    if (r) out.push(r);
  }
  return mergeItems(out);
}
