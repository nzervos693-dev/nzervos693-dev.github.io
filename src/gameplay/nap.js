/**
 * Quick nap at the hero bed (GDD 5.2). Pure, no Phaser.
 * The cooldown is one timer per save: state.lastNapAt (Date.now() ms, or null).
 */
const HOUR_MS = 3600 * 1000;

/** @returns {{durationSeconds:number, energy:number, foodCost:number, waterCost:number, morale:number, cooldownHours:number}} */
export const napConfig = (balance) => balance.needs.energy.nap;

/**
 * Cooldown left in ms, clamped to 0..cooldown (a clock set backward never gives more than the cooldown).
 * @param {{lastNapAt?:number|null}} state
 */
export function napRemainingMs(state, nowMs, balance) {
  const last = state.lastNapAt;
  if (!Number.isFinite(last) || !Number.isFinite(nowMs)) return 0;
  const cd = napConfig(balance).cooldownHours * HOUR_MS;
  return Math.min(cd, Math.max(0, cd - (nowMs - last)));
}

/** "Nap 2h10m" / "Nap 45m" (short: fits one line in a 96 px button): remaining time rounded up to the minute. */
export function napCooldownLabel(remainingMs) {
  const mins = Math.max(1, Math.ceil(remainingMs / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 1) return `Nap ${m}m`;
  return m ? `Nap ${h}h${m}m` : `Nap ${h}h`;
}

/**
 * Button state for the Nap action.
 * @param {{unsafe?:boolean}} ctx unsafe = attack warning/fight, or a zombie on the floor is aggroed
 * @returns {{kind:'nap', label:string, enabled:boolean, reason?:string}}
 */
export function napAction(state, nowMs, balance, ctx = {}) {
  const left = napRemainingMs(state, nowMs, balance);
  if (left > 0) return { kind: 'nap', label: napCooldownLabel(left), enabled: false, reason: 'Not tired yet' };
  if (ctx.unsafe) return { kind: 'nap', label: 'Nap (not safe)', enabled: false, reason: 'Not safe' };
  if (state.needs.energy >= balance.needs.max) return { kind: 'nap', label: 'Nap (rested)', enabled: false, reason: 'Rested' };
  return { kind: 'nap', label: 'Nap', enabled: true };
}

/** Is the nap button currently usable? */
export const canNap = (state, nowMs, balance, ctx) => napAction(state, nowMs, balance, ctx).enabled;

/**
 * A nap finished: energy up, food/water down, morale up, cooldown starts.
 * @returns {{energy:number}} energy actually gained
 */
export function completeNap(state, nowMs, balance) {
  const n = napConfig(balance);
  const max = balance.needs.max;
  const needs = state.needs;
  const before = needs.energy;
  needs.energy = Math.min(max, needs.energy + n.energy);
  needs.food = Math.max(0, needs.food - n.foodCost);
  needs.water = Math.max(0, needs.water - n.waterCost);
  needs.morale = Math.min(max, needs.morale + n.morale);
  state.lastNapAt = nowMs;
  return { energy: needs.energy - before };
}
