import { now } from '../core/clock.js';
import { makeZombie } from '../gameplay/zombies.js';
import {
  attackState, attackSpec, attackTuning, finishAttack, warningStartAt, flickerAlpha, countdownText,
} from '../gameplay/attacks.js';
import { resetBreachLatch } from '../gameplay/barricade.js';
import { label, COLORS, CSS, DEPTH } from './ui.js';
import { playSfx, stopSfx } from './sfx.js';

const BANNER_H = 72;

/**
 * Online attacks (GDD 5.8): 60 s warning (banner + countdown, siren, flickering lights), then the
 * attackers climb the stairwell one by one and hit the barricade until the player has killed them all.
 * Rules and offline resolution live in gameplay/attacks.js. Phases: idle -> warning -> fight -> idle.
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
    const w = scene.scale.width;
    this.tint = scene.add.rectangle(w / 2, scene.scale.height / 2, w, scene.scale.height, 0x8a0f0f, 0)
      .setScrollFactor(0).setDepth(DEPTH.hud - 20);
    this.bg = scene.add.rectangle(w / 2, 0, w - 32, BANNER_H, COLORS.red, 0.9).setStrokeStyle(3, COLORS.ink)
      .setScrollFactor(0).setDepth(DEPTH.toast + 50).setVisible(false);
    this.text = label(scene, w / 2, 0, '', 28, '#ffffff').setDepth(DEPTH.toast + 51).setVisible(false);
    scene.bus.on('barricade-broken', () => {
      this.broke = true;
      const cur = attackState(scene.state).current;
      if (cur) cur.broke = true; // persisted: an interrupted fight keeps it
    });
  }

  /** Banner top y comes from the HUD. */
  layout() {
    const y = this.scene.hud.topH + 12 + BANNER_H / 2;
    this.bg.y = y;
    this.text.y = y;
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

  /** Once a second: start the warning when the next attack is within warningSeconds. */
  check(nowMs) {
    if (!this.enabled || this.phase !== 'idle' || this.scene.gameOver) return;
    const { state, balance } = this.scene;
    const a = attackState(state);
    if (a.current) return; // settled offline by the scene
    const at = warningStartAt(state, balance);
    if (at == null || nowMs < at) return;
    if (nowMs >= a.nextAt) this.scene.settleDueAttacks(nowMs); // arrival already passed: no warning is possible
    else this.beginWarning(a.nextAt);
  }

  beginWarning(arrivesAt) {
    this.phase = 'warning';
    this.arrivesAt = arrivesAt;
    this.layout();
    this.bg.setVisible(true);
    this.text.setVisible(true);
    playSfx(this.scene, 'siren', { loop: true });
    this.scene.bus.emit('attack-warning', { arrivesAt });
  }

  beginFight() {
    const { scene } = this;
    const { state, balance } = scene;
    stopSfx('siren');
    this.tint.setAlpha(0);
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
    scene.toast.show('They are here! Defend the barricade.', 3000);
    scene.save();
    scene.bus.emit('attack-start', { kind: spec.kind, strength: spec.strength, total: spec.types.length });
  }

  spawnOne() {
    const { scene } = this;
    const t = attackTuning(scene.balance);
    const type = this.queue.shift();
    const x = Math.round(t.spawnXMin + scene.rng() * (t.spawnXMax - t.spawnXMin));
    const id = `attack:${this.n}:${this.seq++}`;
    const rec = makeZombie(id, type, scene.tower.homeFloor, x, scene.balance, { siege: true });
    scene.state.zombies[id] = rec;
    scene.zombies.add(rec, true);
    playSfx(scene, scene.rng() < 0.5 ? 'zombie_groan_1' : 'zombie_groan_2');
  }

  /** Per frame. */
  update(dt) {
    if (this.phase === 'idle') return;
    const { scene } = this;
    if (this.phase === 'warning') {
      const left = this.arrivesAt - now();
      this.text.setText(`ATTACK IN ${countdownText(left)}  -  get to the barricade`);
      this.flickerT -= dt;
      if (this.flickerT <= 0) {
        this.flickerT = attackTuning(scene.balance).flickerSeconds;
        this.tint.setAlpha(flickerAlpha(++this.flickerStep));
      }
      if (left <= 0) this.beginFight();
      return;
    }
    this.spawnT -= dt;
    if (this.queue.length && this.spawnT <= 0) {
      this.spawnT = attackTuning(scene.balance).spawnGapSeconds;
      this.spawnOne();
    }
    const alive = this.aliveCount();
    this.text.setText(`DEFEND THE BARRICADE  -  ${alive + this.queue.length} left`);
    if (!this.queue.length && alive === 0) this.finish();
  }

  /** A zombie died: count it for the persisted attack. */
  onKilled(rec) {
    if (!rec.siege) return;
    const cur = attackState(this.scene.state).current;
    if (cur) cur.killed += 1;
  }

  /** All attackers are dead. */
  finish() {
    const { scene } = this;
    const { state, balance } = scene;
    const a = attackState(state);
    const kind = a.current?.kind || a.kind;
    const repelled = !this.broke;
    if (repelled) {
      const gain = balance.needs.morale.events.attackRepelled;
      state.needs.morale = Math.min(balance.needs.max, state.needs.morale + gain);
    }
    finishAttack(state, balance, now(), scene.rng);
    this.hideBanner();
    this.phase = 'idle';
    scene.toast.show(repelled ? `Attack repelled! +${balance.needs.morale.events.attackRepelled} morale` : 'The attack is over. The barricade broke: repair it.', 3600);
    scene.bus.emit('attack-end', { kind, repelled });
    scene.save();
  }

  hideBanner() {
    this.bg.setVisible(false);
    this.text.setVisible(false);
    this.tint.setAlpha(0);
    stopSfx('siren');
  }

  /**
   * App hidden: the fight stops (attackers leave, kills so far stay counted) and the rest of the attack
   * is settled offline on return; a warning just ends.
   */
  onHide() {
    if (this.phase === 'idle') return;
    this.hideBanner();
    if (this.phase === 'fight') this.scene.zombies.removeAttackers();
    this.phase = 'idle';
    this.queue = [];
  }
}
