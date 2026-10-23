import { now } from '../core/clock.js';
import { makeZombie } from '../gameplay/zombies.js';
import { attackState, attackSpec, attackTuning, finishAttack, cueStart } from '../gameplay/attacks.js';
import { dueBeats, cueConfig, isFlickering, landingDip, bangFalloff } from '../gameplay/cue.js';
import { resetBreachLatch, latchBreach } from '../gameplay/barricade.js';
import { daysSurvived } from '../gameplay/death.js';
import { Siege, entryCountForDay, siegeConfig } from '../gameplay/isoSiege.js';
import { attackGoal, heartStandTile } from '../gameplay/isoHeart.js';
import { arrivalTile, syncFrontBarricade } from '../gameplay/isoOffline.js';
import { nextArrivalTile, isInsideHome, HeartLoot } from '../gameplay/isoAttacks.js';
import { loseHeartStack } from '../gameplay/isoStash.js';
import { isHqClaimed } from '../gameplay/isoHq.js';
import { PIECE } from '../gameplay/isoStructures.js';
import { noiseTiles } from '../gameplay/isoActions.js';
import { playSfx } from './sfx.js';

const BANG_SOUNDS = ['stair_bang_1', 'stair_bang_2', 'stair_bang_3'];
const WALL_SOUNDS = ['muffled_thud_1', 'muffled_thud_2'];
/** Seconds between the "is anybody inside / in the heart room" checks of a fight. */
const WATCH_SECONDS = 0.25;
/** The goal follows the hero when the HQ has no bed: how often it is refreshed (seconds). */
const GOAL_SECONDS = 0.5;
/** A bang heard without a line of sight is muffled by audio.occludedVolumeMult, lifted by this so it still carries (as door bangs do). */
const OCCLUDED_BANG_BOOST = 1.6;

/**
 * Online attacks on floor 15 (GDD 5.8 cue and schedule, 5.20 HQ attacks). Phases: idle -> cue -> fight -> idle.
 * There is no banner, countdown, siren or tint: T-15 s distant groans, T-8 s banging and shuffling in the stairwell and a
 * flickering landing light, T-0 the first attacker climbs onto the landing end of the down flight, the rest follow 3 s apart.
 * Attackers path to the heart with structure-aware costs and hit the weakest wall, door or window (gameplay/isoSiege.js);
 * the hits are the fight's bangs. It is over when the banging stops (all attackers dead). Rules live in gameplay/.
 */
export default class IsoAttacks {
  /** @param {import('./IsoGameScene.js').default} scene */
  constructor(scene) {
    this.scene = scene;
    this.phase = 'idle';
    this.enabled = true;
    this.queue = [];
    this.spawnT = 0;
    this.broke = false;
    this.flickerStep = 0;
    this.flickerT = 0;
    this.prevLeft = Infinity;
    this.n = 0;
    this.seq = 0;
    this.siege = new Siege(scene.world.structures, scene.balance);
    this.cfg = siegeConfig(scene.balance);
    this.loot = new HeartLoot(scene.balance.hq.attacks);
    this.watchT = 0;
    this.goalT = 0;
    this.bangT = 0;
    this.edgeScratch = { x: 0, y: 0, side: 'N' };
    this.heartKey = '';
    this.heartTile = null;
    scene.zombies.env.siege = this.siege;
    this.unsub = scene.world.structures.onChange((st, ev) => this.siege.onStructures(ev.structural));
  }

  destroy() { this.unsub?.(); this.unsub = null; }

  /** Attackers currently alive (records flagged siege). */
  aliveCount() {
    let n = 0;
    for (const id in this.scene.state.zombies) {
      const z = this.scene.state.zombies[id];
      if (z.siege && !z.dead) n++;
    }
    return n;
  }

  /** Once a second: start the cue when the next attack is within cueSeconds. */
  check(nowMs) {
    if (!this.enabled || this.phase !== 'idle' || this.scene.gameOver) return;
    const { state, balance } = this.scene;
    const a = attackState(state);
    if (a.current) return; // settled offline by the scene
    const at = cueStart(state, balance);
    if (at == null || nowMs < at) return;
    if (nowMs >= a.nextAt) this.scene.settleDueAttacks(nowMs); // arrival already passed: no cue is possible
    else this.beginCue(a.nextAt);
  }

  beginCue(arrivesAt) {
    this.phase = 'cue';
    this.arrivesAt = arrivesAt;
    this.prevLeft = cueConfig(this.scene.balance).cueSeconds + 1; // so the T-15 beat fires on the first frame
    this.stairOn = false;
    this.flickerT = 0;
    this.scene.bus.emit('attack-cue', { arrivesAt });
  }

  beginFight() {
    const { scene } = this;
    const { state, balance, world } = scene;
    const a = attackState(state);
    const spec = attackSpec(state, balance, a.kind, now());
    resetBreachLatch(state); // GDD 5.2: a new attack re-arms the breach penalty
    this.broke = false;
    this.loot.reset();
    a.current = { kind: spec.kind, strength: spec.strength, total: spec.types.length, killed: 0 };
    this.queue = spec.types.slice();
    this.spawnT = 0;
    this.watchT = 0;
    this.goalT = 0;
    this.bangT = 0;
    this.phase = 'fight';
    state.counters ||= {};
    state.counters.attack = (state.counters.attack || 0) + 1;
    this.n = state.counters.attack;
    this.seq = 0;
    // before the HQ claim they go for the start flat (its front door is the weakest way in); after it, the heart. One entry
    // before the claim, then by day (hq.attacks.entriesByDay)
    const entries = isHqClaimed(state) ? entryCountForDay(this.cfg, daysSurvived(state, now())) : 1;
    this.siege.begin(arrivalTile(world), attackGoal(world, state, balance), entries);
    scene.save();
    scene.bus.emit('attack-start', { kind: spec.kind, strength: spec.strength, total: spec.types.length, entries: this.siege.entries.length });
  }

  /** One attacker climbs onto the landing end of the down flight (or the nearest free tile of the stairwell). */
  spawnOne() {
    const { scene } = this;
    const tile = nextArrivalTile(scene.world, (x, y) => !!scene.zombies.at(x, y) || (Math.floor(scene.hero.x) === x && Math.floor(scene.hero.y) === y));
    if (!tile) return false;
    const type = this.queue.shift();
    const id = `attack:${this.n}:${this.seq++}`;
    const rec = makeZombie(id, type, scene.world.number, tile.x + 0.5, scene.balance, { y: tile.y + 0.5, homeX: tile.x + 0.5, homeY: tile.y + 0.5, facing: 90, siege: true, rsv: -1 });
    scene.state.zombies[id] = rec;
    scene.zombies.addAttacker(rec, this.siege);
    return true;
  }

  /** Per frame. */
  update(dt) {
    if (this.phase === 'idle') return;
    const { scene } = this;
    if (this.phase === 'cue') {
      const left = (this.arrivesAt - now()) / 1000;
      this.cueTick(this.prevLeft, left);
      this.prevLeft = left;
      this.flicker(dt, left);
      if (left <= 0) this.beginFight();
      return;
    }
    this.flicker(dt, 0);
    this.siege.update(dt);
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0 && this.aliveCount() < this.cfg.maxOnFloor) {
      if (this.spawnOne()) this.spawnT = attackTuning(scene.balance).spawnGapSeconds; else this.spawnT = 0.5;
    }
    this.bangT -= dt;
    this.goalT -= dt;
    if (this.goalT <= 0) { this.goalT = GOAL_SECONDS; this.refreshGoal(); }
    this.watchT -= dt;
    if (this.watchT <= 0) { this.watchT = WATCH_SECONDS; this.watch(WATCH_SECONDS); }
    if (!this.queue.length && this.aliveCount() === 0) this.finish();
  }

  /** The heart can move (a bed was dismantled) or be the hero himself when there is no bed: keep the siege goal current. */
  refreshGoal() {
    const { scene } = this;
    const g = this.heart() ?? { x: Math.floor(scene.state.hero.x), y: Math.floor(scene.state.hero.y) };
    this.siege.setGoal(g.x, g.y);
  }

  /** The heart's stand tile, looked up again only when the bed or the structures changed. @returns {{x:number,y:number}|null} */
  heart() {
    const { scene } = this;
    const key = `${scene.state.heart?.bedId ?? ''}|${scene.state.hq.claimed}|${scene.world.structures.revision}`;
    if (key !== this.heartKey) { this.heartKey = key; this.heartTile = heartStandTile(scene.world, scene.state, scene.balance); }
    return this.heartTile;
  }

  /**
   * Someone inside? The first attacker standing inside the home breaches it (morale -10 once, no repel bonus). Attackers in the
   * heart room eat the stash nearest the heart (one stack per attacker per heartLootSecondsPerStack, max heartMaxStacksLost).
   */
  watch(dt) {
    const { scene } = this;
    const { state, balance, world } = scene;
    const st = world.structures;
    const heart = this.heart();
    const room = heart ? st.roomOf(heart.x, heart.y) : -2;
    let inRoom = 0;
    let inside = false;
    const list = scene.zombies.list;
    for (let i = 0; i < list.length; i++) {
      const z = list[i].rec;
      if (!z.siege || z.dead) continue;
      const tx = Math.floor(z.x);
      const ty = Math.floor(z.y);
      if (isInsideHome(world, state, tx, ty)) { inside = true; if (room >= 0 && st.roomOf(tx, ty) === room) inRoom++; }
    }
    if (inside) this.onBreach();
    const n = isHqClaimed(state) ? this.loot.step(dt, inRoom) : 0; // before the claim the stash is not on the line
    const at = heart ?? { x: Math.floor(state.hero.x), y: Math.floor(state.hero.y) };
    for (let k = 0; k < n; k++) loseHeartStack(state, at, scene.rng);
    if (n) scene.panel.refresh();
  }

  /** An attacker got in (or the front-door barricade fell): -10 morale once per attack (the breach latch). */
  onBreach() {
    const { scene } = this;
    if (!this.broke) {
      this.broke = true;
      const cur = attackState(scene.state).current;
      if (cur) cur.broke = true; // persisted: an interrupted fight keeps it
      scene.bus.emit('hq-breached', {});
    }
    if (latchBreach(scene.state)) scene.state.needs.morale = Math.max(0, scene.state.needs.morale + scene.balance.needs.morale.events.barricadeBreached);
  }

  /**
   * An attacker hit an edge (damage already x structures.damageMult). Overlay first, then the piece, through
   * structures.damage; the per-edge redraw, the hit sound (one bang every cue.fightBangGapSeconds) and the shake follow.
   * @param {object} rt attacker runtime @param {{eid:number, damage:number}} hit
   */
  onStructHit(rt, hit) {
    const { scene } = this;
    const st = scene.world.structures;
    const rec = st.recs.get(hit.eid);
    if (!rec) return;
    const door = rec.door ?? null;
    const front = door && door.id === scene.world.home.frontDoor;
    const r = st.damageEid(hit.eid, hit.damage);
    if (r.hit === 'none') return;
    if (front) syncFrontBarricade(scene.world, scene.state);
    const e = st._decode(hit.eid, this.edgeScratch);
    const mid = { x: e.side === 'N' ? e.x + 0.5 : e.x, y: e.side === 'N' ? e.y : e.y + 0.5 };
    if (door) scene.view.rattleDoor(door); else scene.view.rattleEdge(hit.eid);
    let key;
    if (r.destroyed) key = rec.piece === PIECE.WINDOW && r.hit === 'piece' ? 'glass_shatter' : 'barricade_break';
    else if (r.hit === 'overlay') key = 'barricade_hit';
    else key = door ? 'door_bang' : WALL_SOUNDS[Math.floor(scene.rng() * WALL_SOUNDS.length)];
    if (r.destroyed || this.bangT <= 0) {
      const [lo, hi] = cueConfig(scene.balance).fightBangGap;
      if (!r.destroyed) this.bangT = lo + scene.rng() * (hi - lo);
      this.playAt(key, mid);
    }
    if (r.noise) scene.noise(mid.x, mid.y, r.noise, noiseTiles(r.noise, scene.balance), `break:${hit.eid}`); // glass shatters Loud
    scene.soundEvent(`hit:${hit.eid}`, { x: Math.floor(mid.x), y: Math.floor(mid.y) }, 'loud', scene.balance.audio.doorBangHearTiles);
    // the front-door barricade falling is a breach before the claim (GDD 5.2); built doors / walls turning into gaps need nothing more
    if (r.destroyed && r.hit === 'overlay' && front && !isHqClaimed(scene.state)) this.onBreach();
    if (r.destroyed) {
      scene.bus.emit('structure-broken', { eid: hit.eid, piece: rec.piece });
      scene.updateVision(true);
      scene.save();
    }
  }

  /** A sound at a point of the floor: falls off with the hero's distance in tiles (cue.bangFalloff), muffled without a line of sight. */
  playAt(key, p) {
    const { scene } = this;
    const h = scene.hero;
    const dist = Math.hypot(p.x - h.x, p.y - h.y);
    const fall = bangFalloff(dist, scene.balance);
    const los = scene.grid.hasLOS(Math.floor(h.x), Math.floor(h.y), Math.floor(p.x), Math.floor(p.y));
    const sx = (p.x - p.y) - (h.x - h.y);
    playSfx(scene, key, { volume: fall * (los ? 1 : scene.balance.audio.occludedVolumeMult * OCCLUDED_BANG_BOOST), pan: Math.max(-1, Math.min(1, (sx * 48) / scene.balance.audio.panWidthPx)) });
  }

  /**
   * Fire the sound beat that was crossed between two frames (timings from balance.attacks.cue). If a late
   * start crossed several, only the latest one sounds, so there is no burst.
   */
  cueTick(prev, left) {
    const { scene } = this;
    const c = cueConfig(scene.balance);
    if (!this.stairOn && left <= c.stairwellAt) {
      this.stairOn = true;
      scene.soundscape.startStairwell();
      scene.bus.emit('attack-stairwell', { arrivesAt: this.arrivesAt }); // wakes a napper
    }
    const due = dueBeats(prev, left, scene.balance);
    const beat = due[due.length - 1];
    if (!beat) return;
    if (beat.kind === 'groan') scene.soundscape.groan();
    else scene.soundscape.bang(BANG_SOUNDS[Math.min(beat.index, BANG_SOUNDS.length - 1)]);
  }

  /** Landing light dips (a few frames dark, mostly steady) from T-8 s until the banging stops. */
  flicker(dt, left) {
    const { scene } = this;
    if (!isFlickering(left, scene.balance)) return;
    this.flickerT -= dt;
    if (this.flickerT > 0) return;
    this.flickerT = cueConfig(scene.balance).flickerSeconds;
    scene.view.setLandingDip(landingDip(++this.flickerStep));
  }

  /** A zombie died: count it for the persisted attack. */
  onKilled(rec) {
    if (!rec.siege) return;
    const cur = attackState(this.scene.state).current;
    if (cur) cur.killed += 1;
  }

  /** All attackers are dead: the banging stops and that is the only sign. */
  finish() {
    const { scene } = this;
    const { state, balance } = scene;
    const a = attackState(state);
    const kind = a.current?.kind || a.kind;
    const repelled = !this.broke;
    if (repelled) {
      const gain = balance.needs.morale.events.attackRepelled;
      state.needs.morale = Math.min(balance.needs.max, state.needs.morale + gain); // silent
    }
    finishAttack(state, balance, now(), scene.rng);
    this.siege.end();
    this.stopCue();
    this.phase = 'idle';
    scene.bus.emit('attack-end', { kind, repelled });
    scene.save();
  }

  /** Quiet the stairwell: light steady, shuffling fades out. */
  stopCue() {
    this.scene.view.setLandingDip(0);
    this.scene.soundscape.stopStairwell();
  }

  /**
   * App hidden: the fight stops (attackers leave, kills so far stay counted) and the rest of the attack
   * is settled offline on return; a cue just ends.
   */
  onHide() {
    if (this.phase === 'idle') return;
    this.stopCue();
    if (this.phase === 'fight') { this.scene.zombies.removeAttackers(); this.siege.end(); }
    this.phase = 'idle';
    this.queue = [];
  }
}
