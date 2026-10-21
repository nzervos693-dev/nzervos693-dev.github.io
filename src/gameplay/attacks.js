/**
 * Attacks (GDD 5.8). Pure, no Phaser.
 *
 * State: state.attacks = {
 *   scriptedDone: boolean,       the scripted first attack has resolved
 *   nextAt: number|null,         epoch ms the next attack arrives (null until the tutorial ends)
 *   kind: 'scripted'|'scheduled' what nextAt is
 *   current: null | {kind, strength, total, killed}   an attack being fought online (persisted so a
 *                                closed app settles it offline)
 * }
 * No scheduled attack exists before the scripted one resolved: scheduleNext only runs from finishAttack.
 */
import { daysSurvived } from './death.js';
import { getDefense } from './defense.js';
import { barricadeOf, latchBreach, resetBreachLatch } from './barricade.js';
import { cueStartAt } from './cue.js';

const HOUR_MS = 3600 * 1000;

/** Tunables the GDD gives no numbers for. Override via balance.attacks.tuning.<key>. */
export const ATTACK_TUNE_DEFAULTS = {
  spawnGapSeconds: 3, // between attackers arriving from the stairs
  spawnXMin: 16, // arrival offset from the stairs (stairwell.entryX) toward the home door, px
  spawnXMax: 70,
  flickerSeconds: 0.09, // how often the landing light changes during the cue
};

/** Tuning with balance.attacks.tuning applied; arrivalXRange [min, max] becomes spawnXMin / spawnXMax. */
export function attackTuning(balance) {
  const t = { ...ATTACK_TUNE_DEFAULTS, ...(balance.attacks?.tuning || {}) };
  const r = balance.attacks?.tuning?.arrivalXRange;
  if (Array.isArray(r) && r.length === 2) { t.spawnXMin = r[0]; t.spawnXMax = r[1]; }
  return t;
}

/** The attacks record (created on demand). */
export function attackState(state) {
  return (state.attacks ||= { scriptedDone: false, nextAt: null, kind: 'scripted', current: null });
}

/** Clamp a need change into 0..max. */
const bump = (needs, key, delta, balance) => {
  needs[key] = Math.max(0, Math.min(balance.needs.max, needs[key] + delta));
};

/** Attack strength A = base + perDay x days, capped (multipliers arrive with the generator/night). */
export function attackStrength(days, balance) {
  const a = balance.attacks;
  return Math.min(a.cap, a.baseStrength + a.perDay * Math.max(0, days));
}

/**
 * What an attack of a kind looks like when it arrives at `atMs`.
 * @returns {{kind:string, strength:number, types:string[]}} types = one zombie type per attacker
 */
export function attackSpec(state, balance, kind, atMs) {
  const a = balance.attacks;
  if (kind === 'scripted') {
    const types = [];
    for (const [type, n] of Object.entries(a.scripted.zombies)) for (let i = 0; i < n; i++) types.push(type);
    return { kind, strength: a.scripted.strength, types };
  }
  const strength = attackStrength(daysSurvived(state, atMs), balance);
  const n = Math.ceil(strength / a.strengthPerZombie);
  return { kind, strength, types: Array.from({ length: n }, () => a.scheduledZombieType) };
}

/** The tutorial ended: the scripted attack arrives firstAttackDelayMinutes later. */
export function startAttackClock(state, balance, nowMs) {
  const a = attackState(state);
  if (a.nextAt != null || a.scriptedDone) return;
  a.kind = 'scripted';
  a.nextAt = nowMs + balance.attacks.firstAttackDelayMinutes * 60 * 1000;
}

/** Next scheduled attack: intervalHours +/- jitterHours after `fromMs`. */
export function scheduleNext(state, balance, fromMs, rng) {
  const a = attackState(state);
  const { intervalHours, jitterHours } = balance.attacks;
  const hours = intervalHours + (rng() * 2 - 1) * jitterHours;
  a.kind = 'scheduled';
  a.nextAt = fromMs + hours * HOUR_MS;
}

/** An attack ended (fought or auto-resolved): the scripted one is done, the next one is scheduled. */
export function finishAttack(state, balance, endMs, rng) {
  const a = attackState(state);
  a.scriptedDone = true;
  a.current = null;
  scheduleNext(state, balance, endMs, rng);
}

/** When the diegetic cue starts (epoch ms, cueSeconds before the attack), or null when none is scheduled. */
export function cueStart(state, balance) {
  return cueStartAt(attackState(state).nextAt, balance);
}

/**
 * Time that passed unseen beyond the offline cap: an attack still due in the past moves forward so the
 * player gets a full warning (like dropLostWanderTime).
 */
export function dropLostAttackTime(state, balance, nowMs, rng) {
  const a = attackState(state);
  if (a.nextAt == null || a.nextAt >= nowMs) return;
  if (a.kind === 'scripted') a.nextAt = nowMs + balance.attacks.firstAttackDelayMinutes * 60 * 1000;
  else scheduleNext(state, balance, nowMs, rng);
}

/** Characters that take breach damage: the active character and living recruited survivors. */
function residents(state) {
  const out = [{ id: 'active', get: () => state.needs.health, set: (v) => { state.needs.health = v; } }];
  for (const [id, s] of Object.entries(state.survivors || {})) {
    if (!s || !s.recruited || s.dead || id === state.activeId) continue;
    out.push({ id, get: () => s.health, set: (v) => { s.health = v; } });
  }
  return out;
}

/**
 * Auto-resolve an attack against the home defense (GDD 5.8, offline). Mutates state.
 * Repelled: barricade loses A x repelBarricadeLossRatio HP, morale +5.
 * Breached: barricade HP -> 0, each resident takes shortfall x breachDamageRatio (health floor), shortfall /
 * breachStackDivisor random stockpile stacks are lost, morale -10 once (breach latch).
 * @param {{keepLatch?:boolean, bonus?:boolean}} [opts] keepLatch: a fight that was already running keeps its breach latch;
 *   bonus false: no +attackRepelled morale (the barricade broke during the fight)
 * @returns {{kind:string, strength:number, defense:number, repelled:boolean, barricadeLoss:number,
 *   shortfall:number, hurt:{id:string, damage:number}[], lost:{id:string, qty:number}[]}}
 */
export function resolveOffline(state, balance, spec, rng, opts = {}) {
  const a = balance.attacks;
  const defense = getDefense(state, balance).total;
  const res = { kind: spec.kind, strength: spec.strength, defense, repelled: defense >= spec.strength, barricadeLoss: 0, shortfall: 0, hurt: [], lost: [] };
  const b = barricadeOf(state);
  const before = b.hp;
  if (!opts.keepLatch) resetBreachLatch(state); // a new attack re-arms the -10 (GDD 5.2)
  const events = balance.needs.morale.events;
  if (res.repelled) {
    if (b.level > 0) b.hp = Math.max(0, b.hp - spec.strength * a.repelBarricadeLossRatio);
    res.barricadeLoss = before - b.hp;
    if (opts.bonus !== false) bump(state.needs, 'morale', events.attackRepelled, balance);
  } else {
    res.shortfall = spec.strength - defense;
    b.hp = 0;
    res.barricadeLoss = before;
    const floor = balance.needs.offlineHealthFloor;
    for (const r of residents(state)) {
      const was = r.get();
      const dmg = res.shortfall * a.breachDamageRatio;
      r.set(Math.max(was - dmg, Math.min(was, floor)));
      if (was - r.get() > 0) res.hurt.push({ id: r.id, damage: was - r.get() });
    }
    const n = Math.floor(res.shortfall / a.breachStackDivisor);
    const idx = state.stockpile.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < n && idx.length; k++) {
      const pick = idx.splice(Math.floor(rng() * idx.length), 1)[0];
      res.lost.push({ id: state.stockpile[pick].id, qty: state.stockpile[pick].qty });
      state.stockpile[pick] = null;
    }
  }
  if (before > 0 && b.hp <= 0 && b.level > 0 && latchBreach(state)) bump(state.needs, 'morale', events.barricadeBreached, balance);
  return res;
}

/**
 * A fight that was interrupted (app closed or hidden mid-attack) settles offline with the strength
 * of the attackers that were left. Clears state.attacks.current.
 * @returns {object|null} resolveOffline result (+ interrupted: true), or null when nothing was running
 */
export function settleInterrupted(state, balance, nowMs, rng) {
  const a = attackState(state);
  const cur = a.current;
  if (!cur) return null;
  const left = Math.max(0, cur.total - cur.killed);
  const spec = { kind: cur.kind, strength: left * balance.attacks.strengthPerZombie, types: [] }; // GDD 5.8: A = attackers left x 10
  a.kind = cur.kind;
  const res = { ...resolveOffline(state, balance, spec, rng, { keepLatch: true, bonus: !cur.broke }), interrupted: true, atMs: nowMs };
  finishAttack(state, balance, nowMs, rng);
  return res;
}

/**
 * catchUp step hook that resolves due attacks (GDD 5.8: at most attacks.maxOfflineResolves per catch-up).
 * Results are pushed to report.attacks as { ...resolveOffline result, atMs, offsetMs }.
 * @param {object} state the game state (catchUp passes its own sim object to hooks, so close over this)
 * @param {() => number} rng
 * @param {number} startMs where the catch-up starts (for offsetMs)
 * The hook also has hook.settle(nowMs, report): settles an interrupted fight first; it counts toward the same cap.
 * @returns {((sim:object, seconds:number, atMs:number, report:object) => void) & {settle:Function}}
 */
export function makeAttackHook(state, balance, rng, startMs = 0) {
  let resolved = 0;
  const hook = (_sim, _seconds, atMs, report) => {
    const a = attackState(state);
    const list = (report.attacks ||= []);
    while (a.nextAt != null && atMs >= a.nextAt) {
      if (resolved >= balance.attacks.maxOfflineResolves) {
        scheduleNext(state, balance, atMs, rng); // the rest are skipped
        break;
      }
      const at = a.nextAt;
      const spec = attackSpec(state, balance, a.kind, at);
      list.push({ ...resolveOffline(state, balance, spec, rng), atMs: at, offsetMs: Math.max(0, at - startMs) });
      resolved++;
      finishAttack(state, balance, at, rng);
    }
  };
  hook.settle = (nowMs, report) => {
    const r = settleInterrupted(state, balance, nowMs, rng);
    if (r) { (report.attacks ||= []).push(r); resolved++; }
    return r;
  };
  return hook;
}
