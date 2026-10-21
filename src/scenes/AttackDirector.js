import { now } from '../core/clock.js';
import { makeZombie } from '../gameplay/zombies.js';
import { attackState, attackSpec, attackTuning, finishAttack, cueStart } from '../gameplay/attacks.js';
import { dueBeats, cueConfig, isFlickering, landingDip } from '../gameplay/cue.js';
import { resetBreachLatch } from '../gameplay/barricade.js';

const BANG_SOUNDS = ['stair_bang_1', 'stair_bang_2', 'stair_bang_3'];

/**
 * Online attacks (GDD 5.8): a diegetic cue, then the attackers climb the stairwell one by one and
 * hit the barricade until the player has killed them all. There is no banner, countdown, siren or
 * screen tint: T-15 s distant groans, T-8 s banging and a flickering landing light, T-0 the first
 * attacker. It is over when the banging stops. Rules live in gameplay/attacks.js and gameplay/cue.js.
 * Phases: idle -> cue -> fight -> idle.
 */
export default class AttackDirector {
  /** @param {import('./GameScene.js').default} scene */
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
    scene.bus.on('barricade-broken', () => {
      this.broke = true;
      const cur = attackState(scene.state).current;
      if (cur) cur.broke = true; // persisted: an interrupted fight keeps it
    });
  }

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
    const { state, balance } = scene;
    const a = attackState(state);
    const spec = attackSpec(state, balance, a.kind, now());
    resetBreachLatch(state); // GDD 5.2: a new attack re-arms the breach penalty
    this.broke = false;
    a.current = { kind: spec.kind, strength: spec.strength, total: spec.types.length, killed: 0 };
    this.queue = spec.types.slice();
    this.spawnT = 0;
    this.phase = 'fight';
    state.counters ||= {};
    state.counters.attack = (state.counters.attack || 0) + 1;
    this.n = state.counters.attack;
    this.seq = 0;
    scene.save();
    scene.bus.emit('attack-start', { kind: spec.kind, strength: spec.strength, total: spec.types.length });
  }

  spawnOne() {
    const { scene } = this;
    const t = attackTuning(scene.balance);
    const type = this.queue.shift();
    // arrive from the stairs and walk to the home door: 16-70 px from the stairs toward the home side (the door side)
    const tw = scene.tower;
    const off = Math.round(t.spawnXMin + scene.rng() * (t.spawnXMax - t.spawnXMin));
    const x = tw.stairwell.entryX + tw.barricadeInside * off;
    const id = `attack:${this.n}:${this.seq++}`;
    const rec = makeZombie(id, type, scene.tower.homeFloor, x, scene.balance, { siege: true });
    scene.state.zombies[id] = rec;
    scene.zombies.add(rec, true);
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
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0) {
      this.spawnT = attackTuning(scene.balance).spawnGapSeconds;
      this.spawnOne();
    }
    if (!this.queue.length && this.aliveCount() === 0) this.finish();
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
    if (this.phase === 'fight') this.scene.zombies.removeAttackers();
    this.phase = 'idle';
    this.queue = [];
  }
}
