/**
 * Salvage / search / drain rules. Pure.
 */
import { mergeItems } from './rng.js';

/** Time multiplier at low energy (balance.salvage.lowEnergySlow = 0.5 -> x1.5). */
export function energyTimeMult(energy, balance) {
  return energy < balance.needs.energy.lowThreshold ? 1 + balance.salvage.lowEnergySlow : 1;
}

/**
 * Search spec.
 * @returns {{seconds:number, energy:number}}
 */
export function searchSpec(energy, balance) {
  return {
    seconds: balance.scavenge.searchSeconds * energyTimeMult(energy, balance),
    energy: balance.scavenge.searchEnergy,
  };
}

/** Drain spec: small time and energy. */
export function drainSpec(energy, balance) {
  return {
    seconds: balance.salvage.time.small * energyTimeMult(energy, balance),
    energy: balance.salvage.energy.small,
  };
}

/**
 * Dismantle spec. An unsearched container is searched first (+search time/energy).
 * @param {object} def balance.objects entry
 * @param {number} energy current hero energy
 * @param {boolean} searchFirst
 */
export function dismantleSpec(def, energy, searchFirst, balance) {
  let seconds = balance.salvage.time[def.size];
  let en = balance.salvage.energy[def.size];
  if (searchFirst) {
    seconds += balance.scavenge.searchSeconds;
    en += balance.scavenge.searchEnergy;
  }
  return { seconds: seconds * energyTimeMult(energy, balance), energy: en };
}

/**
 * Noise radius in px: 0 quiet, balance.salvage.noiseRadius noisy, Infinity loud (whole floor).
 */
export function noiseRadius(noise, balance) {
  if (noise === 'loud') return Infinity;
  if (noise === 'noisy') return balance.salvage.noiseRadius;
  return 0;
}

/**
 * Fixed yield plus chance yields.
 * @returns {{id:string, qty:number}[]}
 */
export function resolveYield(def, rng) {
  const out = Object.entries(def.yield || {}).map(([id, qty]) => ({ id, qty }));
  for (const c of def.chanceYield || []) {
    if (rng() < c.chance) out.push({ id: c.id, qty: c.qty });
  }
  return mergeItems(out);
}

/**
 * Whether an interruption keeps the work done (progress ratio >= keepProgressRatio).
 */
export const pastKeepThreshold = (progress, balance) => progress >= balance.salvage.keepProgressRatio;

/**
 * Spend one use of a carried tool/weapon stack.
 * @returns {{broke:boolean, usesLeft:number}|null} null if the tool is not carried
 */
export function spendToolUse(slots, toolId) {
  const i = slots.findIndex((s) => s && s.id === toolId);
  if (i < 0) return null;
  const s = slots[i];
  if (s.uses == null) return { broke: false, usesLeft: Infinity };
  s.uses -= 1;
  if (s.uses <= 0) {
    slots[i] = null;
    return { broke: true, usesLeft: 0 };
  }
  return { broke: false, usesLeft: s.uses };
}
