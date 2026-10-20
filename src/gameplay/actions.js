/**
 * Object actions: which buttons an object offers, their time/energy, and what
 * happens when they finish. Pure, no Phaser.
 */
import { rollLoot } from './loot.js';
import {
  searchSpec, drainSpec, dismantleSpec, noiseRadius, resolveYield, spendToolUse,
} from './salvage.js';
import { addAll, countItem } from './inventory.js';
import { objState, addPile } from './gameState.js';
import { mergeItems } from './rng.js';

/** Does the hero carry this tool? */
export const heroHasTool = (state, toolId) => countItem(state.inventory, toolId) > 0;

const toolLabel = (id, balance) => balance.salvage.tools?.[id]?.name || balance.items?.[id]?.name || id;

/**
 * Buttons for an object (max 2): primary (search/take/drain) and dismantle.
 * @returns {{kind:'search'|'take'|'drain'|'dismantle', label:string, enabled:boolean, reason?:string}[]}
 */
export function listActions(def, id, state, balance) {
  const os = state.objects[id] || {};
  if (os.dismantled) return [];
  const out = [];
  const p = def.primary;
  if (p?.type === 'search') {
    if (os.leftover?.length) out.push({ kind: 'take', label: 'Take', enabled: true });
    else if (!os.searched) out.push({ kind: 'search', label: 'Search', enabled: true });
  } else if (p?.type === 'drain' && !os.drained) {
    const need = p.tool && !heroHasTool(state, p.tool);
    out.push({
      kind: 'drain', label: 'Drain', enabled: !need,
      reason: need ? `Needs ${toolLabel(p.tool, balance).toLowerCase()}` : undefined,
    });
  }
  const need = def.tool && !heroHasTool(state, def.tool);
  out.push({
    kind: 'dismantle', label: 'Dismantle', enabled: !need,
    reason: need ? `Needs ${toolLabel(def.tool, balance).toLowerCase()}` : undefined,
  });
  return out;
}

/**
 * Timing/noise/tool info for starting an action.
 * @returns {{kind:string, id:string, seconds:number, energy:number, tool:string|null, noise:string}}
 */
export function buildSpec(kind, def, id, state, balance) {
  const energy = state.needs.energy;
  const os = state.objects[id] || {};
  if (kind === 'take') return { kind, id, seconds: 0, energy: 0, tool: null, noise: 'quiet' };
  if (kind === 'search') return { kind, id, ...searchSpec(energy, balance), tool: null, noise: 'quiet' };
  if (kind === 'drain') {
    return { kind, id, ...drainSpec(energy, balance), tool: def.primary.tool || null, noise: 'quiet' };
  }
  const searchFirst = def.primary?.type === 'search' && !os.searched;
  return { kind: 'dismantle', id, ...dismantleSpec(def, energy, searchFirst, balance), tool: def.tool || null, noise: def.noise };
}

/** Noise event data for an action start, or null if quiet. */
export function noiseFor(spec, balance) {
  if (spec.kind !== 'dismantle') return null;
  const radius = noiseRadius(spec.noise, balance);
  return radius ? { level: spec.noise, radius } : null;
}

function foundNote(state, placement) {
  const n = placement.foundNote;
  if (!n || state.notes.includes(n.id)) return null;
  state.notes.push(n.id);
  return n;
}

function give(state, items, loc, balance, result) {
  const left = addAll(state.inventory, items, balance);
  const leftIds = Object.fromEntries(left.map((l) => [l.id, l.qty]));
  result.gained = mergeItems([
    ...result.gained,
    ...items.map((e) => ({ id: e.id, qty: e.qty - (leftIds[e.id] || 0) })),
  ]);
  return left;
}

/**
 * Apply a finished action to the state.
 * @param {object} ctx {balance, tables, rng, loc:{floor,x}}
 * @returns {{kind:string, gained:{id:string,qty:number}[], piled:{id:string,qty:number}[],
 *   kept:{id:string,qty:number}[], toolBroke:string|null, note:object|null}}
 */
export function completeAction(state, spec, placement, def, ctx) {
  const { balance, tables, rng, loc } = ctx;
  const os = objState(state, spec.id);
  const result = { kind: spec.kind, gained: [], piled: [], kept: [], toolBroke: null, note: null };

  if (spec.kind === 'search') {
    const loot = rollLoot(placement, def, tables, balance, rng);
    os.searched = true;
    os.leftover = give(state, loot, loc, balance, result);
    result.kept = os.leftover;
    result.note = foundNote(state, placement);
  } else if (spec.kind === 'take') {
    os.leftover = give(state, os.leftover || [], loc, balance, result);
    result.kept = os.leftover;
  } else if (spec.kind === 'drain') {
    os.drained = true;
    const items = Object.entries(def.primary.yield).map(([id, qty]) => ({ id, qty }));
    result.piled = give(state, items, loc, balance, result);
  } else {
    let items = resolveYield(def, rng);
    if (def.primary?.type === 'search' && !os.searched) {
      os.searched = true;
      items = mergeItems([...items, ...rollLoot(placement, def, tables, balance, rng)]);
      result.note = foundNote(state, placement);
    }
    // loot left inside a full container comes out with the wreckage
    items = mergeItems([...items, ...(os.leftover || [])]);
    os.leftover = [];
    os.dismantled = true;
    state.stats.objectsSalvaged += 1;
    result.piled = give(state, items, loc, balance, result);
  }
  if (result.piled.length) addPile(state, loc.floor, loc.x, result.piled);

  if (spec.tool) {
    const r = spendToolUse(state.inventory, spec.tool);
    if (r?.broke) result.toolBroke = spec.tool;
  }
  state.needs.energy = Math.max(0, state.needs.energy - spec.energy);
  return result;
}
