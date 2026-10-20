/**
 * Offline catch-up: runs elapsed time in fixed steps (balance.time.offlineStepMinutes)
 * with auto-eat/drink from the stockpile. Pure, no Phaser.
 */
import { tickNeeds, applyItem, itemEffect, NEED_KEYS } from './needs.js';
import { removeItem, countItem } from './inventory.js';

/** Items that spoil first (GDD 5.10); the full spoilage system arrives in M2. */
export const SPOILING_ITEMS = ['planter_crop'];

/**
 * Pick the stockpile item to auto-use for a need ('food' | 'water'):
 * spoiling first, then smallest restore, clean water before dirty.
 * Comfort items (morale bonus, e.g. chocolate) are saved for the player unless
 * nothing else is left and the need is critical (below onlinePromptThreshold).
 * @param {number} [current] current value of the need (enables the comfort fallback)
 * @returns {string|null} item id
 */
export function pickAutoUseItem(stockpile, need, balance, current) {
  const ids = new Set(stockpile.filter(Boolean).map((s) => s.id));
  const gather = (comfort) => {
    const cands = [];
    for (const id of ids) {
      const e = itemEffect(id, balance);
      if (!e || !(e[need] > 0) || (e.morale > 0) !== comfort) continue;
      if (need === 'food' && e.water > 0) continue;
      if (need === 'water' && e.food > 0) continue;
      cands.push({
        id,
        spoil: SPOILING_ITEMS.includes(id) ? 0 : 1,
        amount: e[need],
        dirty: id === balance.water.dirty.id ? 1 : 0,
      });
    }
    cands.sort((a, b) => a.spoil - b.spoil || a.amount - b.amount || a.dirty - b.dirty);
    return cands[0]?.id ?? null;
  };
  const normal = gather(false);
  if (normal) return normal;
  const critical = current != null && current < balance.needs.onlinePromptThreshold;
  return critical ? gather(true) : null;
}

/**
 * Auto-eat/drink while a need is below balance.needs.autoUseThreshold.
 * @returns {Object<string,number>} items used
 */
export function autoUse(state, balance, used = {}) {
  const th = balance.needs.autoUseThreshold;
  for (const need of ['food', 'water']) {
    let guard = 20;
    while (state.needs[need] < th && guard-- > 0) {
      const id = pickAutoUseItem(state.stockpile, need, balance, state.needs[need]);
      if (!id || countItem(state.stockpile, id) <= 0) break;
      const r = applyItem(state.needs, id, balance, state.ctx || {}, true);
      if (!r.ok) break;
      removeItem(state.stockpile, id, 1);
      used[id] = (used[id] || 0) + 1;
    }
  }
  return used;
}

/**
 * Run offline time against a state ({needs, stockpile}); mutates it.
 * @param {object} state
 * @param {number} elapsedMs capped elapsed time
 * @param {object} balance
 * @param {{startMs?:number, awake?:boolean, stepHooks?:Function[]}} [opts] awake = the time passed
 *        while the app was running (no sleep regen, no health floor, no auto-use)
 *        stepHooks(state, stepSeconds, atMs, report)
 *        run after each step (production, attacks arrive in later pieces)
 * @returns {{elapsedMs:number, steps:number, before:object, after:object, used:object, healthLost:number}}
 */
export function catchUp(state, elapsedMs, balance, opts = {}) {
  const stepMs = balance.time.offlineStepMinutes * 60 * 1000;
  const before = Object.fromEntries(NEED_KEYS.map((k) => [k, state.needs[k]]));
  const report = { elapsedMs, steps: 0, before, after: null, used: {}, healthLost: 0 };
  let remaining = Math.max(0, elapsedMs);
  let t = opts.startMs ?? 0;
  while (remaining > 0) {
    const ms = Math.min(stepMs, remaining);
    tickNeeds(state.needs, ms / 1000, { offline: !opts.awake }, balance);
    if (!opts.awake) autoUse(state, balance, report.used);
    t += ms;
    for (const hook of opts.stepHooks || []) hook(state, ms / 1000, t, report);
    remaining -= ms;
    report.steps++;
  }
  report.after = Object.fromEntries(NEED_KEYS.map((k) => [k, state.needs[k]]));
  report.healthLost = Math.max(0, before.health - state.needs.health);
  return report;
}
