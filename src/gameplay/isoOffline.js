/**
 * Offline attack resolution on floor 15 (GDD 5.20 "Offline resolution with HQ"; before the HQ claim the same rule runs
 * against the start flat). Pure, no Phaser.
 *
 * The cheapest structure-cost path from the stairwell landing to the heart is found with the same cost field as the online
 * attack (isoSiege.js; lures ignored). Path defense = sum over every structure crossed of (piece defense + overlay defense)
 * x HP / max HP, plus guards, secured floors and the character, against the attack strength A:
 *   D >= A  repelled: the structures on the path lose A x repelBarricadeLossRatio HP in total, outermost first, none below 1 HP;
 *   D <  A  breached: every structure on the path goes to 0 (overlay first; walls and built doors become gaps, generated
 *           doors break, glass becomes a broken window); the shortfall hurts residents (health floor) and costs stash stacks.
 * It never kills. The result carries what held and what broke for the prose report (gameplay/report.js).
 */
import { MOVE } from '../iso/grid.js';
import { CostField, siegeConfig, edgeCrossCost, traceRoute } from './isoSiege.js';
import { EDGE_KIND, PIECE, edgeTiles, pieceDef } from './isoStructures.js';
import { attackGoal } from './isoHeart.js';
import { isHqClaimed, isHqTile } from './isoHq.js';
import { guardCount, securedFloors } from './defense.js';
import { latchBreach, resetBreachLatch } from './barricade.js';

const bump = (needs, key, delta, balance) => { needs[key] = Math.max(0, Math.min(balance.needs.max, needs[key] + delta)); };

/** The tile attackers arrive on: the landing end of the down flight. @returns {{x:number,y:number}} */
export function arrivalTile(floor) {
  const e = floor.stairwell?.downFlight?.landingEnd?.[0];
  return e ? { x: e[0], y: e[1] } : { x: floor.home.heroStart.x, y: floor.home.heroStart.y };
}

/** Level of a door's barricade (the workbench barricade of the front door carries state.build.barricade.level). */
const barricadeLevel = (door, state) => door.barricade?.level ?? state.build?.barricade?.level ?? 1;

/** The cost field (no entries, no slot penalties) from the heart, for a path search outside a running attack. */
export function planField(floor, st, state, balance) {
  const cfg = siegeConfig(balance);
  const f = new CostField(floor.grid);
  for (let eid = 0; eid < f.cost.length; eid++) f.cost[eid] = edgeCrossCost(st, cfg, eid);
  const goal = attackGoal(floor, state, balance);
  f.compute(goal.x, goal.y);
  return { field: f, goal, cfg };
}

/** Defense of one structure crossing: (piece + overlay) defense scaled by HP / max HP (hq.attacks.offline.defenseScalesWithHp). */
function crossingDefense(st, balance, state, rec) {
  const scale = balance.hq.attacks.offline.defenseScalesWithHp !== false;
  const frac = (hp, max) => (scale && max > 0 ? Math.max(0, Math.min(1, hp / max)) : 1);
  let d = 0;
  if (!(rec.piece === PIECE.WINDOW && rec.broken)) {
    const def = pieceDef(balance, rec);
    d += (def?.defense ?? 0) * frac(st.hpOf(rec), st.maxHpOf(rec));
  }
  if (rec.overlay) d += (balance.structures.overlays[rec.overlay.kind]?.defense ?? 0) * frac(rec.overlay.hp, rec.overlay.maxHp);
  const bar = rec.door?.barricade;
  if (bar && bar.hp > 0) {
    const lv = balance.barricade.levels.find((l) => l.level === barricadeLevel(rec.door, state));
    d += (lv?.defense ?? 0) * frac(bar.hp, lv?.hp ?? bar.hp);
  }
  return d;
}

const SIDES = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];

/**
 * Words for an edge in the report (GDD 5.20 "Naming"): "the <side> <wall|door|window>", the side being the 8-way compass
 * direction from the heart to the edge's midpoint (north = -y). The gate is "the stairwell door" (as a gap or wall: "the
 * stairwell side"). No numbers, no tiers.
 * @param {{x:number,y:number}} heart
 */
export function edgeLabel(floor, st, eid, heart) {
  const e = st._decode(eid);
  const rec = st.recs.get(eid);
  if (st.kindOfEid(eid) === EDGE_KIND.GATE) return rec?.piece === PIECE.DOOR ? 'the stairwell door' : 'the stairwell side';
  const mx = e.side === 'N' ? e.x + 0.5 : e.x;
  const my = e.side === 'N' ? e.y : e.y + 0.5;
  const ang = Math.atan2(my - (heart.y + 0.5), mx - (heart.x + 0.5));
  const side = SIDES[(Math.round(ang / (Math.PI / 4)) + 8) % 8];
  return `the ${side} ${rec?.piece ?? PIECE.WALL}`;
}

/**
 * The cheapest route from the landing to the heart and what is on it.
 * @returns {{found:boolean, goal:{x:number,y:number}, defense:number, crossings:{eid:number, rec:object, label:string, defense:number}[]}}
 */
export function planOfflineRoute(floor, st, state, balance) {
  const { field, goal } = planField(floor, st, state, balance);
  const from = arrivalTile(floor);
  const r = traceRoute(field, from.x, from.y);
  const crossings = [];
  let defense = 0;
  for (const c of r.crossings) {
    if (c.climb || field.grid.moveClass(c.eid) === MOVE.CLIMB) continue; // a climb through a broken pane stops nobody
    const rec = st.recs.get(c.eid);
    if (!rec) continue;
    const d = crossingDefense(st, balance, state, rec);
    defense += d;
    crossings.push({ eid: c.eid, rec, label: edgeLabel(floor, st, c.eid, goal), defense: d });
  }
  return { found: r.found, goal, defense, crossings };
}

/** Is the active character at home (inside the start flat, or the HQ once claimed)? */
export function heroAtHome(floor, state) {
  const x = Math.floor(state.hero.x);
  const y = Math.floor(state.hero.y);
  const r = floor.home.unitRect;
  if (x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3]) return true;
  return isHqClaimed(state) && !!floor.structures && isHqTile(floor.structures, x, y);
}

/** Keep the workbench front-door barricade record in step with the door's barricade (HP and level). */
export function syncFrontBarricade(floor, state) {
  const door = floor.doors.find((d) => d.id === floor.home.frontDoor);
  const b = state.build?.barricade;
  if (!door || !b || b.level <= 0 || !door.barricade) return;
  b.hp = door.barricade.hp;
}

/** Take `amount` HP off a structure's cover first, then the piece, never below `floorHp` (hq.attacks.offline.repelHpFloor). @returns {number} HP actually taken */
function wear(st, rec, amount, floorHp = 1) {
  let left = amount;
  const bar = rec.door?.barricade;
  if (bar && bar.hp > floorHp) {
    const t = Math.min(left, bar.hp - floorHp);
    bar.hp -= t; left -= t;
    st.touch(rec.eid);
  } else if (rec.overlay && rec.overlay.hp > floorHp) {
    const t = Math.min(left, rec.overlay.hp - floorHp);
    rec.overlay.hp -= t; left -= t;
    st.setOverlay(rec, rec.overlay);
  }
  const hp = st.hpOf(rec);
  if (left > 0 && hp > floorHp && !(rec.piece === PIECE.WINDOW && rec.broken)) {
    const t = Math.min(left, hp - floorHp);
    st.setHp(rec, hp - t); left -= t;
  }
  return amount - left;
}

/** Residents that take breach damage: the active character and living recruited survivors. */
function residents(state) {
  const out = [{ id: 'active', get: () => state.needs.health, set: (v) => { state.needs.health = v; } }];
  for (const [id, s] of Object.entries(state.survivors || {})) {
    if (!s || !s.recruited || s.dead || id === state.activeId) continue;
    out.push({ id, get: () => s.health, set: (v) => { s.health = v; } });
  }
  return out;
}

/**
 * Resolve an attack that happened while nobody watched. Same call shape as attacks.js resolveOffline, so the existing
 * hook (makeAttackHook / settleInterrupted) can take it as a resolver. Mutates the state and the structures.
 * @param {{floor:object}} ctx floor model with .structures
 * @param {{keepLatch?:boolean, bonus?:boolean}} [opts] as attacks.js resolveOffline
 * @returns {{kind:string, strength:number, defense:number, repelled:boolean, barricadeLoss:number, shortfall:number,
 *   hurt:{id:string,damage:number}[], lost:{id:string,qty:number}[], where:string|null, broke:string[], named:string[]}}
 */
export function resolveOfflineHq(ctx, state, balance, spec, rng, opts = {}) {
  const a = balance.attacks;
  const { floor } = ctx;
  const st = floor.structures;
  const route = planOfflineRoute(floor, st, state, balance);
  const securedN = securedFloors(state).length + (isHqClaimed(state) && balance.hq.countsAsSecured && !securedFloors(state).includes(floor.number) ? 1 : 0);
  const defense = route.defense + guardCount(state) * balance.survivors.guardDefense + securedN * a.securedFloorDefense + (heroAtHome(floor, state) ? a.characterDefense : 0);
  const res = {
    kind: spec.kind, strength: spec.strength, defense, repelled: defense >= spec.strength, barricadeLoss: 0, shortfall: 0, hurt: [], lost: [],
    where: route.crossings[0]?.label ?? null, broke: [],
    named: [...new Set([route.crossings[0]?.label, route.crossings[route.crossings.length - 1]?.label].filter(Boolean))], // the entry and the last structure before the heart room (GDD 5.20)
  };
  if (!opts.keepLatch) resetBreachLatch(state);
  const events = balance.needs.morale.events;
  if (res.repelled) {
    let left = spec.strength * a.repelBarricadeLossRatio; // outermost first, none below 1 HP
    const hpFloor = balance.hq.attacks.offline.repelHpFloor ?? 1;
    for (const c of route.crossings) { if (left <= 0) break; left -= wear(st, c.rec, left, hpFloor); }
    res.barricadeLoss = spec.strength * a.repelBarricadeLossRatio - Math.max(0, left);
    if (opts.bonus !== false) bump(state.needs, 'morale', events.attackRepelled, balance);
  } else {
    res.shortfall = spec.strength - defense;
    for (const c of route.crossings) {
      res.broke.push(c.label);
      breakAll(st, c.eid);
    }
    syncFrontBarricade(floor, state);
    const floorHp = balance.needs.offlineHealthFloor;
    for (const r of residents(state)) {
      const was = r.get();
      r.set(Math.max(was - res.shortfall * a.breachDamageRatio, Math.min(was, floorHp)));
      if (was - r.get() > 0) res.hurt.push({ id: r.id, damage: was - r.get() });
    }
    const n = Math.floor(res.shortfall / a.breachStackDivisor);
    const idx = state.stockpile.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    for (let k = 0; k < n && idx.length; k++) {
      const pick = idx.splice(Math.floor(rng() * idx.length), 1)[0];
      res.lost.push({ id: state.stockpile[pick].id, qty: state.stockpile[pick].qty });
      state.stockpile[pick] = null;
    }
    if (latchBreach(state)) bump(state.needs, 'morale', events.barricadeBreached, balance);
  }
  syncFrontBarricade(floor, state);
  return res;
}

/** Is there cover (an overlay or a standing barricade) over the piece? */
const hasCover = (rec) => !!rec.overlay || (rec.door?.barricade?.hp ?? 0) > 0;

/** Take a structure all the way down: its cover first, then the piece (walls and built doors become gaps). */
function breakAll(st, eid) {
  for (let i = 0; i < 3; i++) {
    const rec = st.recs.get(eid);
    if (!rec || (isGone(st, rec) && !hasCover(rec))) return;
    st.damageEid(eid, 1e9);
  }
}

/** Is the structure on this record already gone (a gap, a broken door or a broken pane)? */
function isGone(st, rec) {
  if (rec.door) return rec.door.state === 'broken' || !st.recs.has(rec.eid);
  if (rec.piece === PIECE.WINDOW) return !!rec.broken;
  return !st.recs.has(rec.eid);
}

/**
 * A resolver for attacks.js makeAttackHook / settleInterrupted that resolves against floor 15.
 * @param {object} floor floor model with .structures @returns {(state:object, balance:object, spec:object, rng:()=>number, opts?:object)=>object}
 */
export const makeIsoResolver = (floor) => (state, balance, spec, rng, opts) => resolveOfflineHq({ floor }, state, balance, spec, rng, opts);

