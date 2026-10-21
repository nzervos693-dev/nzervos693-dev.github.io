/**
 * Survivors (GDD 5.7): recruit quest, jobs, upkeep, scavenging, talk, pass the torch. Pure, no Phaser.
 *
 * state.survivors[id] = { quest: 'none'|'asked'|'delivered', recruited, dead, job: null|'guard'|'scavenger'|'tender',
 *   health, upkeepAt (epoch ms), talkAt (epoch ms of the last talk), scavengeProgress (s), order }
 * state.activeId = 'hero' | survivor id (who the player controls). state.bodies = [{floor, x, char}].
 */
import { countItem, removeItem, addAll } from './inventory.js';
import { pickAutoUseItem } from './offline.js';
import { rollTable } from './loot.js';
import { survivorBeds, homeSpots, builtOf, spotKey } from './building.js';
import { itemEffect } from './needs.js';
import { heroCtx } from './gameState.js';
import { homeSpot } from './layout.js';
import { addPile } from './gameState.js';
import { DIALOGUE } from './storyText.js';

const HOUR_MS = 3600 * 1000;
const MAX_LOOPS = 60;

const bump = (needs, key, delta, balance) => {
  needs[key] = Math.max(0, Math.min(balance.needs.max, needs[key] + delta));
};

/** The survivor record (created on demand). */
export function survivorOf(state, id) {
  state.survivors = state.survivors || {};
  return (state.survivors[id] ||= { quest: 'none', recruited: false, dead: false, job: null });
}

/** Ids of recruited, living survivors. */
export const recruitedAlive = (state) =>
  Object.entries(state.survivors || {}).filter(([, s]) => s && s.recruited && !s.dead).map(([id]) => id);

/** Survivor beds not yet used by a recruited, living survivor. */
export const freeBeds = (state, balance) => survivorBeds(state, balance) - recruitedAlive(state).length;

/** Id of the character the player controls. */
export const activeId = (state) => state.activeId || 'hero';

/** Is a survivor currently the player's character (after pass the torch)? */
export const isActive = (state, id) => activeId(state) === id;

/** Display name of the active character. */
export const activeName = (state, balance) =>
  (isActive(state, 'hero') ? 'You' : balance.survivors.roster[activeId(state)]?.name || 'You');

/** Survivors that live at home and can be tapped or assigned: recruited, alive, not the active character. */
export const residentsAtHome = (state) => recruitedAlive(state).filter((id) => !isActive(state, id));

/**
 * Where a recruited survivor stands at home: their survivor bed, else near the hero's bed.
 * @returns {{floor:number, x:number}}
 */
export function survivorHomeSpot(state, tower, balance, id) {
  const order = residentsAtHome(state).indexOf(id);
  const beds = builtOf(state, 'survivor_bed');
  const bed = beds[Math.max(0, order)] || beds[0];
  if (bed) {
    const sp = homeSpots(tower, balance).find((s) => s.key === spotKey(bed.floor, bed.spot));
    if (sp) return { floor: sp.floor, x: sp.x };
  }
  const h = homeSpot(tower);
  return { floor: h.floor, x: h.x - 60 };
}

/** Bring a survivor home: bed needed. Returns true if recruited. */
function tryRecruit(state, balance, id, nowMs) {
  if (freeBeds(state, balance) <= 0) return false;
  const s = survivorOf(state, id);
  s.recruited = true;
  s.dead = false;
  s.job = null;
  s.health = balance.survivors.startHealth;
  s.upkeepAt = nowMs + balance.survivors.upkeepHours * HOUR_MS;
  s.scavengeProgress = 0;
  s.order = recruitedAlive(state).length;
  bump(state.needs, 'morale', balance.needs.morale.events.survivorRecruited, balance);
  return true;
}

/**
 * Tap on a survivor who is not recruited yet (the quest, GDD 5.7). Mutates state.
 *   first talk -> intro, quest asked; carrying the bag: with a free Survivor bed and morale of at least
 *   survivors.joinMinMorale the bag is handed over (quest done +10 morale) and she joins (+15 morale);
 *   otherwise she says why and the bag stays with the hero.
 * @returns {{kind:'intro'|'reminder'|'refuse'|'needs_bed'|'recruited', lines:string[], gaveBag:boolean, recruited:boolean}}
 */
export function interactSurvivor(state, balance, id, nowMs) {
  const def = balance.survivors.roster[id];
  const text = DIALOGUE[id];
  const s = survivorOf(state, id);
  const out = { kind: 'reminder', lines: [], gaveBag: false, recruited: false };
  if (s.quest === 'none') {
    s.quest = 'asked';
    out.kind = 'intro';
    out.lines.push(...text.intro);
  }
  const hasBag = countItem(state.inventory, def.quest.itemId) > 0;
  if (!hasBag) {
    if (out.kind !== 'intro') out.lines.push(...text.reminder);
    return out;
  }
  // she only takes the bag when she can join: a free bed and morale of joinMinMorale or more (GDD 5.7)
  if (freeBeds(state, balance) <= 0) {
    out.kind = 'needs_bed';
    out.lines.push(...text.needBed);
    return out;
  }
  if (state.needs.morale < (balance.survivors.joinMinMorale ?? balance.needs.morale.lowThreshold)) {
    out.kind = 'refuse';
    out.lines.push(...text.refuse);
    return out;
  }
  removeItem(state.inventory, def.quest.itemId, 1);
  s.quest = 'delivered';
  out.gaveBag = true;
  bump(state.needs, 'morale', balance.needs.morale.events.questDone, balance);
  out.recruited = tryRecruit(state, balance, id, nowMs);
  out.kind = 'recruited';
  out.lines.push(...text.thanks, ...text.join);
  return out;
}

/**
 * Pick a job (tap the selected one again to clear it). Guards add defense, Tenders speed up producers,
 * Scavengers bring loot while you are away.
 * @returns {{ok:boolean, job:string|null}}
 */
export function setJob(state, balance, id, job) {
  const s = state.survivors?.[id];
  if (!s || !s.recruited || s.dead || isActive(state, id)) return { ok: false, job: s?.job ?? null };
  if (job != null && !balance.survivors.jobs.includes(job)) return { ok: false, job: s.job };
  s.job = s.job === job ? null : job;
  s.scavengeProgress = 0;
  return { ok: true, job: s.job };
}

/** Milliseconds until a survivor can be talked to again for morale (0 = ready). */
export function talkWaitMs(state, balance, id, nowMs) {
  const s = state.survivors?.[id];
  const cd = balance.needs.morale.events.talkCooldownHours * HOUR_MS;
  if (!s || s.talkAt == null) return 0;
  return Math.max(0, s.talkAt + cd - nowMs);
}

/**
 * Talk to a recruited survivor: +talkToSurvivor morale, once per talkCooldownHours each.
 * @returns {{ok:boolean, gain:number, waitMs:number}}
 */
export function talkTo(state, balance, id, nowMs) {
  const s = state.survivors?.[id];
  if (!s || !s.recruited || s.dead) return { ok: false, gain: 0, waitMs: 0 };
  const wait = talkWaitMs(state, balance, id, nowMs);
  if (wait > 0) return { ok: false, gain: 0, waitMs: wait };
  const gain = balance.needs.morale.events.talkToSurvivor;
  bump(state.needs, 'morale', gain, balance);
  s.talkAt = nowMs;
  return { ok: true, gain, waitMs: 0 };
}

/** Pick `qty` best stockpile items for a need and remove them. @returns {string[]|null} ids, null if not enough */
function takeUpkeep(stockpile, need, qty, balance) {
  const taken = [];
  for (let i = 0; i < qty; i++) {
    const id = pickAutoUseItem(stockpile, need, balance);
    if (!id || countItem(stockpile, id) <= 0) { for (const t of taken) addAll(stockpile, [{ id: t, qty: 1 }], balance); return null; }
    removeItem(stockpile, id, 1);
    taken.push(id);
  }
  return taken;
}

/**
 * Upkeep: every survivors.upkeepHours each living, recruited survivor eats and drinks from the stockpile.
 * Missing food or water: -missedUpkeepHealth health and -missedUpkeepMorale morale (once per upkeep).
 * Online a survivor at 0 health dies (morale survivorDies); offline health floors at needs.offlineHealthFloor.
 * @param {{offline?:boolean}} [opts]
 * @param {object[]} [events] receives { id, at, missed: string[], healthLost, died }
 * @returns {object[]} events
 */
export function tickUpkeep(state, balance, atMs, opts = {}, events = []) {
  const sv = balance.survivors;
  for (const [id, s] of Object.entries(state.survivors || {})) {
    if (!s || !s.recruited || s.dead || isActive(state, id)) continue;
    if (s.upkeepAt == null) s.upkeepAt = atMs + sv.upkeepHours * HOUR_MS;
    for (let guard = 0; atMs >= s.upkeepAt && guard < MAX_LOOPS; guard++) {
      const at = s.upkeepAt;
      s.upkeepAt += sv.upkeepHours * HOUR_MS;
      const food = takeUpkeep(state.stockpile, 'food', sv.upkeepFood, balance);
      const water = takeUpkeep(state.stockpile, 'water', sv.upkeepWater, balance);
      const missed = [];
      if (!food) missed.push('food');
      if (!water) missed.push('water');
      s.upkeepMet = !missed.length; // regen only follows a met upkeep (GDD 5.7)
      if (!missed.length) continue;
      const was = s.health;
      s.health -= sv.missedUpkeepHealth;
      if (opts.offline) s.health = Math.max(s.health, Math.min(was, balance.needs.offlineHealthFloor));
      bump(state.needs, 'morale', -sv.missedUpkeepMorale, balance);
      const ev = { id, at, missed, healthLost: was - Math.max(0, s.health), died: false };
      if (s.health <= 0) {
        s.health = 0;
        s.dead = true;
        s.job = null;
        bump(state.needs, 'morale', balance.needs.morale.events.survivorDies, balance);
        ev.died = true;
      }
      events.push(ev);
    }
  }
  return events;
}

/** Time lost beyond the offline cap: overdue upkeep moves to one interval from now (no pile-up of misses). */
export function dropLostSurvivorTime(state, balance, nowMs) {
  for (const s of Object.values(state.survivors || {})) {
    if (s && s.recruited && !s.dead && s.upkeepAt != null && s.upkeepAt < nowMs) s.upkeepAt = nowMs + balance.survivors.upkeepHours * HOUR_MS;
  }
}

/** Containers on Cleared or Secured floors that can give loot: [{floor, table}]. */
function lootSources(state, tower, balance, tables) {
  const out = [];
  for (const e of tower.objects.values()) {
    if (e.quest) continue;
    const st = state.floorStates?.[e.floor];
    if (st !== 'Cleared' && st !== 'Secured') continue;
    const primary = balance.objects[e.placement.objectId]?.primary;
    if (primary?.type === 'search' && tables?.[primary.lootTable]) out.push(tables[primary.lootTable]);
  }
  return out;
}

/**
 * Scavengers (GDD 5.7): every survivors.scavengeIntervalHours of time they have been working, one loot
 * roll from a random container of a Cleared or Secured floor goes to the stockpile.
 * @param {number} seconds time passed
 * @param {object[]} [events] receives { id, item: {id, qty}, stored }
 */
export function tickScavengers(state, balance, tower, tables, seconds, rng, events = []) {
  const interval = balance.survivors.scavengeIntervalHours * 3600;
  let sources = null;
  for (const [id, s] of Object.entries(state.survivors || {})) {
    if (!s || !s.recruited || s.dead || s.job !== 'scavenger' || isActive(state, id)) continue;
    s.scavengeProgress = (s.scavengeProgress || 0) + seconds;
    for (let guard = 0; s.scavengeProgress >= interval && guard < MAX_LOOPS; guard++) {
      s.scavengeProgress -= interval;
      sources ||= lootSources(state, tower, balance, tables);
      if (!sources.length) continue;
      const item = rollTable(sources[Math.floor(rng() * sources.length)], rng);
      if (!item) continue;
      const left = addAll(state.stockpile, [item], balance);
      events.push({ id, item, stored: left.length === 0 });
    }
  }
  return events;
}

/**
 * Pass the torch (GDD 5.7): the dead character's carried items drop as a bag at the death spot (the body
 * stays), and a living survivor becomes the active character with their health.
 * @param {{floor:number, x:number}} deathSpot
 * @param {{floor:number, x:number}} home where the new character appears
 * @returns {{ok:boolean, dropped:{id:string, qty:number}[]}}
 */
export function passTorch(state, balance, id, deathSpot, home) {
  const s = state.survivors?.[id];
  if (!s || !s.recruited || s.dead) return { ok: false, dropped: [] };
  const dropped = [];
  for (let i = 0; i < state.inventory.length; i++) {
    const slot = state.inventory[i];
    if (slot) { dropped.push({ id: slot.id, qty: slot.qty }); state.inventory[i] = null; }
  }
  if (dropped.length) addPile(state, deathSpot.floor, deathSpot.x, dropped);
  state.equipped = null;
  (state.bodies ||= []).push({ floor: deathSpot.floor, x: deathSpot.x, char: activeId(state) });
  state.activeId = id;
  s.job = null;
  s.scavengeProgress = 0;
  state.needs.health = Math.max(1, s.health ?? balance.survivors.startHealth);
  for (const k of ['food', 'water', 'energy']) state.needs[k] = balance.needs[k].start; // GDD 5.7: the new character starts fresh
  state.hero = { floor: home.floor, x: home.x };
  return { ok: true, dropped };
}

/** The active survivor died: mark them dead so the game over check sees nobody left. */
export function killActiveSurvivor(state) {
  const id = activeId(state);
  if (id === 'hero') return;
  const s = state.survivors?.[id];
  if (s) { s.dead = true; s.health = 0; }
}

/**
 * Job picker entries (Guard / Scavenger / Tender) for the balance jobs list.
 * @returns {{id:string, name:string, sub:string}[]}
 */
export function jobInfo(balance) {
  const sv = balance.survivors;
  const info = {
    guard: { name: 'Guard', sub: `+${sv.guardDefense} defense` },
    scavenger: { name: 'Scavenger', sub: 'loot while away' },
    tender: { name: 'Tender', sub: `+${Math.round((sv.tenderOutputMult - 1) * 100)}% output` },
  };
  return sv.jobs.filter((id) => info[id]).map((id) => ({ id, ...info[id] }));
}

/**
 * Survivor healing (GDD 5.7): a recruited survivor who is not the active character regains
 * survivors.healthRegenPerHour while their last upkeep was met (new recruits count as met).
 */
export function regenSurvivors(state, balance, seconds) {
  const rate = balance.survivors.healthRegenPerHour || 0;
  if (rate <= 0 || seconds <= 0) return;
  for (const [id, s] of Object.entries(state.survivors || {})) {
    if (!s || !s.recruited || s.dead || isActive(state, id) || s.upkeepMet === false) continue;
    s.health = Math.min(balance.needs.max, (s.health ?? 0) + (rate * seconds) / 3600);
  }
}

/**
 * Medicine the hero can use on a survivor: survivors.treatItems in the bag, then the stockpile.
 * @returns {{id:string, name:string, heal:number, qty:number, from:'bag'|'stock'}[]}
 */
export function treatOptions(state, balance) {
  const out = [];
  for (const id of balance.survivors.treatItems || []) {
    const heal = itemEffect(id, balance, heroCtx(state, balance))?.health || 0;
    if (heal <= 0) continue;
    for (const [from, slots] of [['bag', state.inventory], ['stock', state.stockpile]]) {
      const qty = countItem(slots, id);
      if (qty > 0) out.push({ id, name: balance.items[id]?.name || id, heal, qty, from });
    }
  }
  return out;
}

/**
 * Use 1 medicine on a survivor (carried first). Steady hands applies through itemEffect.
 * @returns {{ok:boolean, reason?:string, healed?:number}}
 */
export function treatSurvivor(state, balance, id, itemId, from) {
  const s = state.survivors?.[id];
  if (!s || !s.recruited || s.dead || isActive(state, id)) return { ok: false, reason: 'Cannot treat' };
  if (!(balance.survivors.treatItems || []).includes(itemId)) return { ok: false, reason: 'Not medicine' };
  if (s.health >= balance.needs.max) return { ok: false, reason: 'Full health' };
  const slots = from === 'stock' ? state.stockpile : state.inventory;
  if (countItem(slots, itemId) <= 0) return { ok: false, reason: 'No medicine' };
  const heal = itemEffect(itemId, balance, heroCtx(state, balance))?.health || 0;
  removeItem(slots, itemId, 1);
  const before = s.health;
  s.health = Math.min(balance.needs.max, s.health + heal);
  return { ok: true, healed: s.health - before };
}
