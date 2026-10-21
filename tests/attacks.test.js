import { describe, it, expect } from 'vitest';
import balance from '../public/data/balance.json';
import floorsData from '../public/data/levels/floors.json';
import { buildTower } from '../src/gameplay/layout.js';
import { createGameState } from '../src/gameplay/gameState.js';
import { seededRng } from '../src/gameplay/rng.js';
import { addItem } from '../src/gameplay/inventory.js';
import { buildBarricade } from '../src/gameplay/barricade.js';
import { catchUp } from '../src/gameplay/offline.js';
import { reportLines } from '../src/gameplay/report.js';
import { getDefense } from '../src/gameplay/defense.js';
import {
  attackStrength, attackSpec, startAttackClock, scheduleNext, finishAttack, resolveOffline, makeAttackHook,
  settleInterrupted, dropLostAttackTime, attackTuning, cueStart, attackState,
} from '../src/gameplay/attacks.js';

const tower = buildTower(floorsData, balance);
const T0 = 1_000_000;
const HOUR = 3600 * 1000;
const fresh = () => createGameState(balance, tower, T0);
const A = balance.attacks;

describe('attack strength and spec', () => {
  it('is 25 + 3 per day, capped at 150', () => {
    expect(attackStrength(0, balance)).toBe(25);
    expect(attackStrength(4, balance)).toBe(37);
    expect(attackStrength(1000, balance)).toBe(150);
  });
  it('scheduled attacks are ceil(A/10) walkers', () => {
    const s = fresh();
    const spec = attackSpec(s, balance, 'scheduled', T0 + 2 * 24 * HOUR);
    expect(spec.strength).toBe(31);
    expect(spec.types).toHaveLength(4);
    expect(new Set(spec.types)).toEqual(new Set(['walker']));
  });
  it('the scripted attack is fixed (balance.attacks.scripted), whatever the day', () => {
    const spec = attackSpec(fresh(), balance, 'scripted', T0 + 99 * 24 * HOUR);
    const want = Object.entries(A.scripted.zombies).flatMap(([t, n]) => Array(n).fill(t)).sort();
    expect(spec.strength).toBe(A.scripted.strength);
    expect([...spec.types].sort()).toEqual(want);
  });
});

describe('scheduling', () => {
  it('no attack is scheduled until the tutorial ends; then the scripted one is 10 min later', () => {
    const s = fresh();
    expect(attackState(s).nextAt).toBeNull();
    startAttackClock(s, balance, T0);
    expect(attackState(s).nextAt).toBe(T0 + 10 * 60 * 1000);
    expect(attackState(s).kind).toBe('scripted');
    expect(cueStart(s, balance)).toBe(T0 + 10 * 60 * 1000 - 15 * 1000); // the diegetic cue starts 15 s before
  });
  it('starting the clock twice does not move it', () => {
    const s = fresh();
    startAttackClock(s, balance, T0);
    startAttackClock(s, balance, T0 + 5000);
    expect(attackState(s).nextAt).toBe(T0 + 10 * 60 * 1000);
  });
  it('finishing the scripted attack schedules the first scheduled one 8 h +/- 2 h later', () => {
    for (const r of [0, 0.5, 0.999]) {
      const s = fresh();
      startAttackClock(s, balance, T0);
      finishAttack(s, balance, T0 + 1000, () => r);
      const a = attackState(s);
      expect(a.scriptedDone).toBe(true);
      expect(a.kind).toBe('scheduled');
      const h = (a.nextAt - (T0 + 1000)) / HOUR;
      expect(h).toBeGreaterThanOrEqual(6);
      expect(h).toBeLessThanOrEqual(10);
    }
  });
  it('scheduleNext jitter is symmetric', () => {
    const s = fresh();
    scheduleNext(s, balance, 0, () => 0);
    expect(attackState(s).nextAt).toBe(6 * HOUR);
    scheduleNext(s, balance, 0, () => 0.5);
    expect(attackState(s).nextAt).toBe(8 * HOUR);
  });
  it('time lost beyond the offline cap moves an overdue attack forward', () => {
    const s = fresh();
    startAttackClock(s, balance, T0);
    dropLostAttackTime(s, balance, T0 + 13 * HOUR, seededRng(1));
    expect(attackState(s).nextAt).toBe(T0 + 13 * HOUR + 10 * 60 * 1000);
  });
});

describe('offline resolution', () => {
  it('Lv1 barricade + character (D = 20) repels the scripted attack and loses A x ratio barricade HP', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    const spec = attackSpec(s, balance, 'scripted', T0);
    expect(getDefense(s, balance).total).toBe(20);
    const m0 = s.needs.morale;
    const r = resolveOffline(s, balance, spec, seededRng(1));
    expect(r.repelled).toBe(true);
    const loss = A.scripted.strength * A.repelBarricadeLossRatio;
    expect(s.build.barricade.hp).toBe(balance.barricade.levels[0].hp - loss);
    expect(r.barricadeLoss).toBe(loss);
    expect(s.needs.morale).toBe(m0 + balance.needs.morale.events.attackRepelled);
  });
  it('day 0 fairness: Lv1 + character + one Secured floor (D = 25) holds A = 25', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    s.floorStates[16] = 'Secured';
    const r = resolveOffline(s, balance, attackSpec(s, balance, 'scheduled', T0), seededRng(1));
    expect(r.defense).toBe(25);
    expect(r.repelled).toBe(true);
  });
  it('a breach zeroes the barricade, hurts residents with the health floor, loses stacks, morale -10 once', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    s.survivors.mara = { recruited: true, dead: false, job: null, health: 40 };
    for (let i = 0; i < 6; i++) s.stockpile[i] = { id: i % 2 ? 'wood' : 'metal', qty: 3 };
    s.needs.health = 12;
    const m0 = s.needs.morale;
    const r = resolveOffline(s, balance, { kind: 'scheduled', strength: 70, types: [] }, seededRng(3));
    expect(r.repelled).toBe(false);
    expect(r.shortfall).toBe(50); // D = 20
    expect(s.build.barricade.hp).toBe(0);
    expect(s.needs.health).toBe(10); // 12 - 25 floors at 10
    expect(s.survivors.mara.health).toBe(15); // 40 - 25
    expect(r.lost).toHaveLength(5); // 50 / 10 stacks
    expect(s.stockpile.filter(Boolean)).toHaveLength(1);
    expect(s.needs.morale).toBe(m0 + balance.needs.morale.events.barricadeBreached);
  });
  it('a breach with a broken barricade already at 0 HP has no second morale penalty', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    s.build.barricade.hp = 0;
    const m0 = s.needs.morale;
    resolveOffline(s, balance, { kind: 'scheduled', strength: 70, types: [] }, seededRng(1));
    expect(s.needs.morale).toBe(m0);
  });
  it('a Guard adds +15 defense; a dead or active Guard does not', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    s.survivors.mara = { recruited: true, dead: false, job: 'guard', health: 100 };
    expect(getDefense(s, balance).total).toBe(35);
    s.activeId = 'mara';
    expect(getDefense(s, balance).total).toBe(20);
    s.activeId = 'hero';
    s.survivors.mara.dead = true;
    expect(getDefense(s, balance).total).toBe(20);
  });
});

describe('catch-up hook', () => {
  const run = (s, hours, extra = {}) => {
    const hook = makeAttackHook(s, balance, seededRng(5), T0);
    return catchUp({ needs: s.needs, stockpile: s.stockpile, ctx: {} }, hours * HOUR, balance, { startMs: T0, stepHooks: [hook], ...extra });
  };
  it('nothing happens before the tutorial ends', () => {
    const s = fresh();
    const rep = run(s, 12);
    expect(rep.attacks).toEqual([]);
  });
  it('resolves the scripted attack then scheduled ones, at most 2 per catch-up', () => {
    const s = fresh();
    buildBarricade(s, balance, 2);
    startAttackClock(s, balance, T0);
    const rep = run(s, 12);
    expect(rep.attacks.length).toBeGreaterThanOrEqual(1);
    expect(rep.attacks.length).toBeLessThanOrEqual(A.maxOfflineResolves);
    expect(rep.attacks[0].kind).toBe('scripted');
    expect(rep.attacks.slice(1).every((a) => a.kind === 'scheduled')).toBe(true);
    expect(attackState(s).scriptedDone).toBe(true);
    expect(attackState(s).nextAt).toBeGreaterThan(T0);
  });
  it('caps the resolves per catch-up and skips the rest', () => {
    const s = fresh();
    buildBarricade(s, balance, 2);
    startAttackClock(s, balance, T0);
    const bal = { ...balance, attacks: { ...A, intervalHours: 1, jitterHours: 0, maxOfflineResolves: 2 } };
    const hook = makeAttackHook(s, bal, seededRng(5), T0);
    const rep = catchUp({ needs: s.needs, stockpile: s.stockpile, ctx: {} }, 12 * HOUR, bal, { startMs: T0, stepHooks: [hook] });
    expect(rep.attacks).toHaveLength(2);
    expect(attackState(s).nextAt).toBeGreaterThan(T0 + 11 * HOUR); // rescheduled, not a pile-up
  });
  it('the health floor still holds through a breach', () => {
    const s = fresh();
    startAttackClock(s, balance, T0);
    s.needs.health = 30;
    s.needs.food = 100; s.needs.water = 100;
    const rep = run(s, 1);
    expect(rep.attacks[0].repelled).toBe(false); // no barricade: D = 10 < 20
    expect(s.needs.health).toBeGreaterThanOrEqual(balance.needs.offlineHealthFloor);
  });
  it('report lines describe each attack in prose, with no strength, defense or HP numbers', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    startAttackClock(s, balance, T0);
    const rep = run(s, 1);
    const lines = reportLines(rep, balance);
    expect(lines.some((l) => /beat on the door.*It held\./.test(l))).toBe(true);
    expect(lines.join(' ')).not.toMatch(/strength|defense|HP|->/i);
  });
  it('breach report says they got in, who is hurt and what was lost', () => {
    const s = fresh();
    startAttackClock(s, balance, T0);
    addItem(s.stockpile, 'wood', 5, balance);
    const rep = run(s, 1);
    const lines = reportLines(rep, balance);
    expect(lines.some((l) => l.includes('They got in.'))).toBe(true);
    expect(lines.some((l) => l === 'You are hurt.')).toBe(true);
  });
});

describe('interrupted fights', () => {
  it('settle with the strength of the attackers that were left', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    startAttackClock(s, balance, T0);
    attackState(s).current = { kind: 'scripted', strength: 20, total: 2, killed: 1 };
    const r = settleInterrupted(s, balance, T0 + 1000, seededRng(1));
    expect(r.interrupted).toBe(true);
    expect(r.strength).toBe(10);
    expect(r.repelled).toBe(true);
    expect(attackState(s).current).toBeNull();
    expect(attackState(s).scriptedDone).toBe(true);
    expect(settleInterrupted(s, balance, T0, seededRng(1))).toBeNull();
  });
});

describe('interrupted fights: latch, broke flag, cap', () => {
  it('an interrupted fight keeps the breach latch and gives no +5 when the barricade broke', () => {
    const s = fresh();
    buildBarricade(s, balance, 1);
    s.build.barricade.hp = 0;
    s.build.breachLatched = true; // the -10 was already paid in the fight
    attackState(s).current = { kind: 'scheduled', strength: 25, total: 3, killed: 2, broke: true };
    const m0 = s.needs.morale;
    const r = settleInterrupted(s, balance, T0, seededRng(1));
    expect(r.repelled).toBe(true);
    expect(s.needs.morale).toBe(m0);
    expect(s.build.breachLatched).toBe(true);
  });
  it('the hook settles an interrupted fight first and it counts toward the cap', () => {
    const s = fresh();
    buildBarricade(s, balance, 2);
    attackState(s).current = { kind: 'scheduled', strength: 25, total: 3, killed: 0 };
    attackState(s).scriptedDone = true;
    attackState(s).nextAt = T0 + HOUR;
    const bal = { ...balance, attacks: { ...A, maxOfflineResolves: 1 } };
    const hook = makeAttackHook(s, bal, seededRng(2), T0);
    const report = { attacks: [] };
    hook.settle(T0, report);
    hook(null, 600, T0 + 2 * HOUR, report);
    expect(report.attacks).toHaveLength(1);
    expect(report.attacks[0].interrupted).toBe(true);
    expect(attackState(s).nextAt).toBeGreaterThan(T0 + 2 * HOUR - 1); // skipped and rescheduled
  });
  it('arrivalXRange feeds the spawn range', () => {
    const t = attackTuning(balance);
    expect([t.spawnXMin, t.spawnXMax]).toEqual(A.tuning.arrivalXRange);
  });
});
