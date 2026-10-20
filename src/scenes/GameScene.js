import Phaser from 'phaser';
import floorsData from '../../public/data/levels/floors.json';
import lootData from '../../public/data/levels/loot.json';
import { getBalance } from '../core/balance.js';
import { getSave, writeSave } from '../core/save.js';
import { now, offlineInfo, elapsedInfo } from '../core/clock.js';
import { offlineCapMs } from '../core/balance.js';
import { lifecycle } from '../core/lifecycle.js';
import {
  buildTower, floorAtY, floorTopY, floorLineY, roomAt, homeSpot, isInHome, worldHeight,
} from '../gameplay/layout.js';
import { createGameState, normalizeGameState, enterRoom, heroCtx, takeFromPile, objState } from '../gameplay/gameState.js';
import { tickNeeds, applyItem, itemEffect, speedMult } from '../gameplay/needs.js';
import { catchUp, pickAutoUseItem } from '../gameplay/offline.js';
import { addItem, moveAll } from '../gameplay/inventory.js';
import { limitWalk, planRoute, stairSeconds, stepToward, hitJammedDoor, doorStopX } from '../gameplay/routing.js';
import { listActions, buildSpec, noiseFor, completeAction, heroHasTool } from '../gameplay/actions.js';
import { pastKeepThreshold, spendToolUse } from '../gameplay/salvage.js';
import { reportLines } from '../gameplay/report.js';
import TowerView from './TowerView.js';
import Hud from './Hud.js';
import ActionMenu from './ActionMenu.js';
import InventoryPanel from './InventoryPanel.js';
import Popup from './Popup.js';
import Toast from './Toast.js';
import NeedPrompt from './NeedPrompt.js';
import { label, COLORS, CSS } from './ui.js';
import { playSfx } from './sfx.js';

const HERO_DEPTH = 20;
const BAR_W = 120;
/** A frame gap longer than this (s) without a lifecycle resume is treated as time passed. */
const LONG_GAP_MS = 30000;
const HERO_FEET_TO_HEAD = 100;
const FLOAT_TEXT_RISE = 40;
const DOOR_SHAKE_PX = 4;
const MENU_BOTTOM_MARGIN = 8;
const TOAST_PANEL_GAP = 45;
const TOAST_PROMPT_LIFT = 140;

/**
 * Main play scene: tower cutaway, hero, tap-to-move, object actions, needs, inventory, save.
 *
 * Events on `this.bus` (hooks for later pieces):
 *   'noise' {floor, x, level, radius, source}  radius Infinity = whole floor
 *   'action-start' / 'action-done' / 'action-cancel' {spec, ...}
 *   'floor-changed' {floor}      'room-entered' {apt, room}
 *   'door-hit' {aptId, hits, needed}   'door-opened' {aptId}
 *   'workbench-open'             'survivor-tap' {id}
 *   'hero-dead'                  'item-used' {id}
 */
export default class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    const balance = getBalance();
    this.balance = balance;
    this.tower = buildTower(floorsData, balance);
    this.tables = lootData.tables;
    this.rng = Math.random;
    this.bus = new Phaser.Events.EventEmitter();

    const save = getSave();
    const fresh = !save.game?.started;
    const t0 = now();
    this.state = fresh
      ? createGameState(balance, this.tower, t0)
      : normalizeGameState(save.game, balance, this.tower, t0);
    save.game = this.state;

    this.route = [];
    this.stair = null;
    this.pending = null;
    this.action = null;
    this.sleeping = false;
    this.following = true;
    this.dragPauseUntil = 0;
    this.lastHomeTap = 0;
    this.promptArmed = { food: true, water: true };
    this.dead = false;
    this.queuedTap = null;
    this.drag = null;
    this.vy = 0;
    this.pulseAt = 0;

    this.cameras.main.setBackgroundColor('#0d0f12');
    this.view = new TowerView(this, this.tower, this.state, balance);
    this.createHero();
    this.createActionBar();

    this.hud = new Hud(this, balance, {
      onHome: () => this.onHomeButton(),
      onBag: () => this.toggleBag(),
      onStoreAll: () => this.storeAll(),
    });
    this.toast = new Toast(this, this.hud.toastY);
    this.menu = new ActionMenu(this);
    this.needPrompt = new NeedPrompt(this);
    this.popup = new Popup(this);
    this.panel = new InventoryPanel(this, {
      bag: () => this.state.inventory,
      stock: () => this.state.stockpile,
      describe: (slot, tab) => this.describeItem(slot, tab),
      onUse: (tab, i) => this.useItem(tab, i),
      onStore: (i) => this.moveOne('bag', i),
      onTake: (i) => this.moveOne('stock', i),
      onClose: () => {},
    });

    this.setupInput();
    this.setupLifecycle();
    this.jumpCameraToHero();
    this.placeHero();
    this.view.refresh();

    this.autosaveEvent = this.time.addEvent({
      delay: balance.time.autosaveSeconds * 1000, loop: true, callback: () => this.save(),
    });

    if (fresh) {
      this.save();
      this.toast.show('You wake up. Something is scratching at the door.', 4000);
    } else {
      const info = offlineInfo();
      this.applyOffline(info.elapsedMs, info.capped);
    }

    if (import.meta.env.DEV || location.search.includes('debug')) window.__floor15 = this;
  }

  // ---------------------------------------------------------------- setup

  createHero() {
    this.heroSprite = this.add.sprite(0, 0, 'hero', 0).setOrigin(0.5, 1).setScale(3).setDepth(HERO_DEPTH);
    this.heroSprite.play('hero_idle');
    this.heroSprite.on('animationcomplete', (anim) => {
      if (anim.key === 'hero_attack' && this.action?.spec.kind === 'dismantle') this.heroSprite.play('hero_attack');
    });
    this.zzz = label(this, 0, 0, 'Zzz', 30, CSS.text, false).setDepth(HERO_DEPTH + 1).setVisible(false);
  }

  createActionBar() {
    this.barBg = this.add.rectangle(0, 0, BAR_W + 8, 22, COLORS.ink).setDepth(40).setVisible(false);
    this.barFill = this.add.rectangle(0, 0, BAR_W, 14, COLORS.amber).setOrigin(0, 0.5).setDepth(41).setVisible(false);
  }

  setupLifecycle() {
    const onHide = () => this.onHide();
    const onResume = (ms, info) => this.applyOffline(info.elapsedMs, info.capped);
    this.game.events.on('floor15:hide', onHide);
    lifecycle.on('resume', onResume);
    this.events.once('shutdown', () => {
      this.bus.removeAllListeners();
      this.game.events.off('floor15:hide', onHide);
      lifecycle.off('resume', onResume);
    });
  }

  setupInput() {
    const thr = this.balance.controls.dragThresholdPx;
    const cam = this.cameras.main;
    this.input.on('pointerdown', (p, over) => {
      if (this.drag) return; // second finger: ignore, only the first pointer drives drag/tap
      const blocked = over.filter((o) => !o.getData?.('dragThrough')).length > 0;
      this.drag = blocked ? null : {
        id: p.id, sx: p.x, sy: p.y, scroll0: cam.scrollY, moved: false, lastY: p.y, lastT: performance.now(),
        swallowTap: over.length > 0,
      };
      this.vy = 0;
    });
    this.input.on('pointermove', (p) => {
      const d = this.drag;
      if (!d || d.id !== p.id || !p.isDown) return;
      if (!d.moved && Math.hypot(p.x - d.sx, p.y - d.sy) > thr) {
        d.moved = true;
        this.menu.close();
      }
      if (!d.moved) return;
      this.dragPauseUntil = now() + this.balance.controls.cameraFollowPauseSeconds * 1000;
      this.setScroll(d.scroll0 - (p.y - d.sy));
      const t = performance.now();
      const dt = Math.max(0.001, (t - d.lastT) / 1000);
      this.vy = Phaser.Math.Linear(this.vy, -(p.y - d.lastY) / dt, 0.5);
      d.lastY = p.y;
      d.lastT = t;
    });
    this.input.on('pointerup', (p, over) => {
      const d = this.drag;
      if (d && d.id !== p.id) return;
      this.drag = null;
      if (!d) return;
      if (d.moved) {
        if (performance.now() - d.lastT > 80) this.vy = 0; // finger rested before release
        return;
      }
      if (over.length || d.swallowTap) return;
      this.onWorldTap(p.x + cam.scrollX, p.y + cam.scrollY);
    });
  }

  // ---------------------------------------------------------------- camera

  maxScroll() { return Math.max(0, worldHeight(this.tower) - this.scale.height); }

  setScroll(y) { this.cameras.main.scrollY = Phaser.Math.Clamp(y, 0, this.maxScroll()); }

  heroScrollTarget() {
    return floorTopY(this.tower, this.state.hero.floor) + this.tower.floorHeight / 2 - this.scale.height / 2;
  }

  jumpCameraToHero() { this.setScroll(this.heroScrollTarget()); }

  updateCamera(dt) {
    const cam = this.cameras.main;
    if (Math.abs(this.vy) > 8) {
      this.setScroll(cam.scrollY + this.vy * dt);
      this.vy *= Math.exp(-3.5 * dt);
    } else this.vy = 0;
    const moving = this.route.length > 0 || this.stair;
    if (this.following && now() > this.dragPauseUntil && !this.drag?.moved) {
      const target = Phaser.Math.Clamp(this.heroScrollTarget(), 0, this.maxScroll());
      cam.scrollY += (target - cam.scrollY) * (1 - Math.exp(-6 * dt));
      if (!moving && Math.abs(target - cam.scrollY) < 1) this.following = false;
    }
  }

  // ---------------------------------------------------------------- hero

  heroLineY() { return floorLineY(this.tower, this.state.hero.floor); }

  placeHero() {
    const h = this.state.hero;
    let y = this.heroLineY();
    let x = h.x;
    if (this.stair) {
      const a = floorLineY(this.tower, this.stair.from);
      const b = floorLineY(this.tower, this.stair.to);
      y = a + (b - a) * Math.min(1, this.stair.t / this.stair.dur);
      x = this.tower.stairwell.entryX;
    }
    this.heroSprite.setPosition(x, y);
    this.zzz.setPosition(x + 20, y - 100);
  }

  setHeroAnim(name) {
    const key = `hero_${name}`;
    if (this.heroSprite.anims.currentAnim?.key !== key) this.heroSprite.play(key);
  }

  /** Plan a walk (and stairs) to floor/x; `pending` runs on arrival. */
  goTo(floor, x, pending = null) {
    this.pending = pending;
    const from = this.stair
      ? { floor: this.stair.to, x: this.tower.stairwell.entryX }
      : { floor: this.state.hero.floor, x: this.state.hero.x };
    const steps = planRoute(this.tower, from, { floor, x });
    // while on the stairs, keep the current trip: the new plan starts after it
    this.route = steps;
    this.following = true;
  }

  updateHero(dt) {
    const h = this.state.hero;
    if (this.stair) {
      this.stair.t += dt;
      this.setHeroAnim('walk');
      if (this.stair.t >= this.stair.dur) {
        h.floor = this.stair.to;
        h.x = this.tower.stairwell.entryX;
        const floor = h.floor;
        this.stair = null;
        this.bus.emit('floor-changed', { floor });
        this.save();
      }
      return;
    }
    if (this.sleeping || this.action) return;
    const step = this.route[0];
    if (!step) { this.setHeroAnim('idle'); return; }
    if (step.type === 'stairs') {
      this.route.shift();
      this.stair = { from: step.from, to: step.to, t: 0, dur: Math.max(0.01, stairSeconds(step.from, step.to, this.balance)) };
      return;
    }
    const lim = limitWalk(this.tower, this.state.doors, h.floor, h.x, step.x);
    const speed = this.balance.hero.walkSpeed * speedMult(this.state.needs, this.balance);
    const nx = stepToward(h.x, lim.x, speed, dt);
    if (nx !== h.x) {
      this.heroSprite.setFlipX(nx < h.x);
      this.setHeroAnim('walk');
    }
    h.x = nx;
    this.checkRoomEntry();
    if (nx === lim.x) {
      this.route.shift();
      if (lim.blockedApt && lim.x !== step.x) {
        this.route.length = 0;
        this.onBlockedByDoor(lim.blockedApt);
      } else if (!this.route.length) this.onArrive();
    }
  }

  checkRoomEntry() {
    const h = this.state.hero;
    const r = roomAt(this.tower, h.floor, h.x);
    if (!r || !enterRoom(this.state, r.apt, r.room)) return;
    const firstOfApt = r.apt.rooms.filter((x) => this.state.rooms[`${r.apt.id}:${x.id}`]).length === 1;
    this.view.refresh();
    this.bus.emit('room-entered', r);
    if (firstOfApt && r.apt.flavour && !r.apt.isHome) this.toast.show(`${r.apt.name}: ${r.apt.flavour}`, 3600);
    this.save();
  }

  // ---------------------------------------------------------------- taps

  onWorldTap(wx, wy) {
    if (this.popup.isOpen || this.panel.isOpen) return;
    if (this.sleeping) { this.wake(); return; }
    this.menu.close();
    if (this.action) {
      const progress = this.action.elapsed / this.action.duration;
      if (pastKeepThreshold(progress, this.balance)) {
        this.queuedTap = { wx, wy }; // past 50%: it completes, then this tap runs
        return;
      }
      this.cancelAction();
    }
    const t = this.view.hitTest(wx, wy);
    if (t) this.handleTarget(t);
    else this.handleGround(wx, wy);
  }

  handleGround(wx, wy) {
    const floor = floorAtY(this.tower, wy);
    if (floor == null) return;
    const tw = this.tower;
    let x = Phaser.Math.Clamp(wx, 16, tw.floorWidth - 16);
    if (x <= tw.stairwell.xMax) x = tw.stairwell.entryX;
    const r = roomAt(tw, floor, x);
    if (r && !this.state.rooms[`${r.apt.id}:${r.room.id}`]) {
      // dark room: walk to its door
      x = r.room === r.apt.rooms[0] ? r.apt.doorX : r.room.xMin + 10;
    }
    this.goTo(floor, x);
  }

  handleTarget(t) {
    const { state, balance } = this;
    switch (t.type) {
      case 'object': {
        const def = balance.objects[t.sp.placement.objectId];
        const actions = listActions(def, t.id, state, balance);
        if (!actions.length) return;
        if (actions.length === 1 && actions[0].enabled) this.goTo(t.floor, t.x, { t, kind: actions[0].kind });
        else this.openMenu(t, actions);
        break;
      }
      case 'fixture':
        this.goTo(t.floor, t.x, { t, kind: t.id === 'bed' ? 'sleep' : 'workbench' });
        break;
      case 'quest':
        this.goTo(t.floor, t.x, { t, kind: 'quest' });
        break;
      case 'pile':
        this.goTo(t.floor, t.x, { t, kind: 'pile' });
        break;
      case 'survivor':
        this.goTo(t.floor, t.x, { t, kind: 'survivor' });
        break;
      case 'door':
        this.goTo(t.floor, doorStopX(t.apt), { t, kind: 'door' });
        break;
      default:
    }
  }

  openMenu(t, actions) {
    const img = t.sp.img;
    const cam = this.cameras.main;
    this.menu.open(
      { x: t.x, topY: img.y - img.displayHeight, bottomY: img.y, screenTop: cam.scrollY + this.hud.topH + 8, screenBottom: cam.scrollY + this.hud.bottomY - MENU_BOTTOM_MARGIN },
      actions,
      (kind) => this.goTo(t.floor, t.x, { t, kind }),
    );
  }

  // ---------------------------------------------------------------- arrival and actions

  onBlockedByDoor(apt) {
    const p = this.pending;
    if (p?.kind === 'door' && p.t.apt === apt) this.onArrive();
    else { this.pending = null; this.toast.show('The door is jammed. Tap it to force it open.'); }
  }

  onArrive() {
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    const { t, kind } = p;
    this.heroSprite.setFlipX(t.x < this.state.hero.x ? true : t.x > this.state.hero.x ? false : this.heroSprite.flipX);
    switch (kind) {
      case 'sleep': this.startSleep(); break;
      case 'workbench':
        this.bus.emit('workbench-open');
        this.toast.show('Workbench: crafting is coming soon.');
        break;
      case 'survivor':
        this.bus.emit('survivor-tap', { id: t.id });
        this.toast.show('Someone is hiding here.');
        break;
      case 'quest': this.takeQuestItem(t); break;
      case 'pile': this.takePile(t.pile); break;
      case 'door': this.interactDoor(t.apt); break;
      default: this.beginAction(t, kind);
    }
  }

  beginAction(t, kind) {
    const { state, balance } = this;
    const placement = t.sp.placement;
    const def = balance.objects[placement.objectId];
    const acts = listActions(def, t.id, state, balance);
    const act = acts.find((a) => a.kind === kind);
    if (!act) return;
    if (!act.enabled) { this.toast.show(act.reason || 'Cannot do that'); return; }
    const spec = buildSpec(kind, def, t.id, state, balance);
    this.action = { spec, t, elapsed: 0, duration: spec.seconds };
    this.bus.emit('action-start', { spec, target: t });
    const noise = noiseFor(spec, balance);
    if (noise) {
      this.bus.emit('noise', { floor: t.floor, x: t.x, ...noise, source: t.id });
      this.floatText(t.x, t.cy - 70, '!', CSS.red);
    }
    this.setHeroAnim(kind === 'dismantle' ? 'attack' : 'idle');
    if (spec.seconds <= 0) this.finishAction();
  }

  updateAction(dt) {
    const a = this.action;
    if (!a) return;
    a.elapsed += dt;
    const p = Math.min(1, a.elapsed / a.duration);
    const x = this.state.hero.x;
    const y = this.heroLineY() - HERO_FEET_TO_HEAD;
    this.barBg.setPosition(x, y).setVisible(true);
    this.barFill.setPosition(x - BAR_W / 2, y).setVisible(true);
    this.barFill.width = BAR_W * p;
    if (a.elapsed >= a.duration) this.finishAction();
  }

  hideBar() { this.barBg.setVisible(false); this.barFill.setVisible(false); }

  cancelAction() {
    if (!this.action) return;
    this.bus.emit('action-cancel', { spec: this.action.spec });
    this.action = null;
    this.queuedTap = null;
    this.hideBar();
  }

  runQueuedTap() {
    const q = this.queuedTap;
    this.queuedTap = null;
    if (q) this.onWorldTap(q.wx, q.wy);
  }

  finishAction() {
    if (this.action.spec.kind === 'pry') { this.finishPry(); return; }
    const { spec, t } = this.action;
    this.action = null;
    this.hideBar();
    const placement = t.sp.placement;
    const def = this.balance.objects[placement.objectId];
    const res = completeAction(this.state, spec, placement, def, {
      balance: this.balance, tables: this.tables, rng: this.rng, loc: { floor: t.floor, x: t.x },
    });
    this.view.refresh();
    if (spec.kind === 'dismantle') this.view.playDismantle(t.id);
    this.bus.emit('action-done', { spec, result: res, target: t });
    playSfx(this, spec.kind === 'dismantle' ? 'sfx_wood_crack' : 'sfx_search');
    this.setHeroAnim('idle');
    this.runQueuedTap();

    const parts = [];
    if (res.gained.length) parts.push(this.itemList(res.gained, '+'));
    else if (spec.kind === 'search') parts.push('Nothing useful.');
    if (res.piled.length) parts.push('Bag full: the rest is on the floor.');
    else if (res.kept.length) parts.push('Bag full: the rest stays inside.');
    if (res.toolBroke) parts.push(`Your ${this.balance.items[res.toolBroke].name.toLowerCase()} broke.`);
    if (res.note) parts.push(`Note: "${res.note.text}"`);
    this.toast.show(parts.join('\n'), res.note ? 4800 : 2600);
    this.save();
  }

  itemList(list, sign = '') {
    return list.map((e) => `${sign}${e.qty} ${this.balance.items[e.id]?.name || e.id}`).join(', ');
  }

  takeQuestItem(t) {
    const os = objState(this.state, t.id);
    const { itemId, name } = t.sp.placement;
    if (addItem(this.state.inventory, itemId, 1, this.balance) > 0) {
      this.toast.show('Bag full. Make room first.');
      return;
    }
    os.taken = true;
    this.view.refresh();
    this.toast.show(`Picked up: ${name}`);
    this.save();
  }

  takePile(pile) {
    const taken = takeFromPile(this.state, pile, this.balance);
    this.view.refresh();
    this.toast.show(taken.length ? this.itemList(taken, '+') : 'Bag full. Make room first.');
    this.save();
  }

  // ---------------------------------------------------------------- jammed doors

  interactDoor(apt) {
    const { state, balance } = this;
    const door = state.doors[apt.id];
    if (door.state !== 'jammed') return;
    if (heroHasTool(state, 'crowbar')) {
      const spec = { kind: 'pry', id: apt.id, seconds: balance.world.jammedDoorCrowbarSeconds, energy: 0, tool: 'crowbar', noise: 'noisy' };
      this.action = { spec, t: { floor: apt.floor, x: apt.doorX, cy: floorLineY(this.tower, apt.floor) - 48, apt, door: true }, elapsed: 0, duration: spec.seconds };
      this.setHeroAnim('attack');
      return;
    }
    this.hitDoor(apt);
  }

  /**
   * One hit on a jammed door.
   * TODO(piece 2): route door hits through the weapon cooldown and combat.energyPerSwing
   * (and the 1-tap attack buffer) like any other attack; today a hit is free and unthrottled.
   */
  hitDoor(apt) {
    const r = hitJammedDoor(this.state.doors[apt.id], this.balance);
    this.setHeroAnim('attack');
    this.time.delayedCall(350, () => { if (!this.action && !this.route.length) this.setHeroAnim('idle'); });
    const sprite = this.view.doorSprites.get(apt.id);
    this.tweens.add({ targets: sprite, x: apt.doorX + DOOR_SHAKE_PX, yoyo: true, duration: 60, repeat: 1, onComplete: () => sprite.setX(apt.doorX) });
    this.bus.emit('door-hit', { aptId: apt.id, hits: r.hits, needed: r.needed });
    this.toast.show(r.opened ? 'The door gives way.' : `The door is stuck (${r.hits}/${r.needed}). Hit it again.`);
    if (r.opened) this.afterDoorOpened(apt);
  }

  afterDoorOpened(apt) {
    this.view.refresh();
    this.bus.emit('door-opened', { aptId: apt.id });
    this.save();
  }

  finishPry() {
    const { spec, t } = this.action;
    this.action = null;
    this.hideBar();
    const r = spendToolUse(this.state.inventory, spec.tool);
    this.bus.emit('noise', { floor: t.floor, x: t.x, level: 'noisy', radius: this.balance.salvage.noiseRadius, source: spec.id });
    this.state.doors[spec.id].state = 'open';
    this.toast.show(r?.broke ? 'The door pops open. Your crowbar broke.' : 'The door pops open.');
    this.setHeroAnim('idle');
    this.afterDoorOpened(t.apt);
    this.runQueuedTap();
  }

  // ---------------------------------------------------------------- sleep

  startSleep() {
    this.sleeping = true;
    this.heroSprite.setAlpha(0.55);
    this.setHeroAnim('idle');
    this.zzz.setVisible(true);
    this.toast.show('Sleeping. Tap anywhere to wake up.');
  }

  wake() {
    this.sleeping = false;
    this.heroSprite.setAlpha(1);
    this.zzz.setVisible(false);
  }

  // ---------------------------------------------------------------- needs and time

  tickClock() {
    const { state, balance } = this;
    const t = now();
    const gap = t - state.times.lastTickAt;
    if (gap < 0) { state.times.lastTickAt = t; return; } // clock moved backwards: no time passes
    if (gap < balance.time.tickSeconds * 1000) return;
    if (gap > LONG_GAP_MS) {
      // time passed without a lifecycle resume: capped like offline, but counted as awake time
      const info = elapsedInfo(state.times.lastTickAt, t, offlineCapMs(balance));
      this.applyOffline(info.elapsedMs, info.capped, true);
      return;
    }
    state.times.lastTickAt = t;
    tickNeeds(state.needs, gap / 1000, { sleeping: this.sleeping }, balance);
    if (this.sleeping && state.needs.energy >= balance.needs.max) {
      this.wake();
      this.toast.show('Rested.');
    }
    this.checkNeedPrompts();
  }

  checkNeedPrompts() {
    const { needs } = this.state;
    const th = this.balance.needs.onlinePromptThreshold;
    for (const k of ['food', 'water']) {
      if (needs[k] < th && this.promptArmed[k]) {
        this.promptArmed[k] = false;
        this.needPrompt.show(k, this.hud.bottomY - 200, () => this.eatBest(k));
      } else if (needs[k] > th) {
        this.promptArmed[k] = true;
        if (this.needPrompt.need === k) this.needPrompt.hide();
      }
    }
    if (needs.health <= 0 && !this.dead) {
      this.dead = true;
      this.bus.emit('hero-dead');
      this.toast.show('You collapse. (Death comes in a later update.)', 4000);
    } else if (needs.health > 0) this.dead = false;
  }

  /**
   * Eat/drink the best item for a need using the auto-use rules: bag first, then the
   * stockpile (only at home).
   */
  eatBest(need) {
    const sources = [['bag', this.state.inventory]];
    if (this.inHome()) sources.push(['stock', this.state.stockpile]);
    for (const [tab, slots] of sources) {
      const id = pickAutoUseItem(slots, need, this.balance, this.state.needs[need]);
      if (!id) continue;
      this.useItem(tab, slots.findIndex((s) => s && s.id === id));
      if (this.state.needs[need] >= this.balance.needs.onlinePromptThreshold) this.needPrompt.hide();
      return;
    }
    this.toast.show(need === 'food' ? 'Nothing to eat.' : 'Nothing to drink.');
  }

  /** Offline catch-up on launch, resume, or a long frame gap. */
  applyOffline(elapsedMs, capped, awake = false) {
    const { state, balance } = this;
    const t = now();
    if (elapsedMs > 0) {
      const sim = { needs: state.needs, stockpile: state.stockpile, ctx: heroCtx(state, balance) };
      const report = catchUp(sim, elapsedMs, balance, { startMs: state.times.lastTickAt, awake });
      if (elapsedMs >= 60000) {
        this.popup.show('While you were away', reportLines(report, balance, capped));
      }
    }
    state.times.lastTickAt = t;
    this.view.refresh();
    this.panel.refresh();
    this.save();
  }

  onHide() {
    this.cancelAction();
    this.route.length = 0;
    this.pending = null;
    this.stair = null;
    this.wake();
    this.menu.close();
    const spot = homeSpot(this.tower);
    this.state.hero.floor = spot.floor;
    this.state.hero.x = spot.x;
    this.placeHero();
  }

  save() { writeSave(); }

  // ---------------------------------------------------------------- inventory

  inHome() { const h = this.state.hero; return isInHome(this.tower, h.floor, h.x); }

  canStoreAll() {
    return this.inHome() && this.state.inventory.some((s) => s && this.balance.items[s.id]?.type !== 'quest');
  }

  toggleBag() {
    this.menu.close();
    if (this.panel.isOpen) this.panel.close();
    else this.panel.open('bag');
  }

  storeAll() {
    const before = this.state.inventory.filter(Boolean).length;
    const moved = moveAll(this.state.inventory, this.state.stockpile, this.balance);
    const after = this.state.inventory.filter((s) => s && this.balance.items[s.id]?.type !== 'quest').length;
    this.toast.show(moved ? (after ? 'Stored what fit. Stockpile is full.' : 'Stored everything.') : before ? 'Stockpile is full.' : 'Nothing to store.');
    this.panel.refresh();
    this.save();
  }

  moveOne(tab, i) {
    const from = tab === 'bag' ? this.state.inventory : this.state.stockpile;
    const to = tab === 'bag' ? this.state.stockpile : this.state.inventory;
    if (!from[i] || !this.inHome()) return;
    const single = from.map((x, k) => (k === i ? x : null));
    moveAll(single, to, this.balance);
    from[i] = single[i];
    this.panel.selected = -1;
    this.panel.refresh();
    this.save();
  }

  describeItem(slot, tab) {
    const { balance } = this;
    const it = balance.items[slot.id];
    const e = itemEffect(slot.id, balance, heroCtx(this.state, balance));
    const bits = [];
    if (e) {
      if (e.food) bits.push(`+${e.food} food`);
      if (e.water) bits.push(`+${e.water} water`);
      if (e.health) bits.push(`${e.health > 0 ? '+' : ''}${e.health} health`);
      if (e.morale) bits.push(`+${e.morale} morale`);
    } else if (slot.uses != null) bits.push(`${slot.uses} uses left`);
    else bits.push(it.type === 'material' ? 'Crafting material' : it.type);
    const home = this.inHome();
    return {
      name: it.name,
      effect: bits.join(', '),
      canUse: !!e && (tab === 'bag' || home),
      canStore: tab === 'bag' && home && it.type !== 'quest',
      canTake: tab === 'stock' && home,
    };
  }

  useItem(tab, i) {
    const slots = tab === 'bag' ? this.state.inventory : this.state.stockpile;
    const s = slots[i];
    if (!s) return;
    const r = applyItem(this.state.needs, s.id, this.balance, heroCtx(this.state, this.balance));
    if (!r.ok) { this.toast.show(r.reason); return; }
    s.qty -= 1;
    if (s.qty <= 0) { slots[i] = null; this.panel.selected = -1; }
    this.bus.emit('item-used', { id: s.id });
    playSfx(this, this.balance.consumables?.[s.id]?.water || s.id.endsWith('water') ? 'sfx_drink' : 'sfx_eat');
    this.toast.show(`Used ${this.balance.items[s.id].name}`);
    this.panel.refresh();
    this.save();
  }

  // ---------------------------------------------------------------- HUD buttons

  onHomeButton() {
    const t = now();
    const dbl = this.balance.controls.homeDoubleTapSeconds * 1000;
    if (t - this.lastHomeTap <= dbl) {
      this.lastHomeTap = 0;
      if (this.sleeping) this.wake();
      this.cancelAction();
      const spot = homeSpot(this.tower);
      this.goTo(spot.floor, spot.x);
      this.toast.show('Heading home.');
    } else {
      this.lastHomeTap = t;
      this.following = true;
      this.dragPauseUntil = 0;
      this.jumpCameraToHero();
      this.toast.show('Tap Home again to walk home.', 1400);
    }
  }

  floatText(x, y, str, color) {
    const tx = label(this, x, y, str, 40, color, false).setDepth(60);
    this.tweens.add({ targets: tx, y: y - FLOAT_TEXT_RISE, alpha: 0, duration: 900, onComplete: () => tx.destroy() });
  }

  // ---------------------------------------------------------------- frame loop

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.25);
    this.tickClock();
    this.updateHero(dt);
    this.updateAction(dt);
    this.placeHero();
    this.updateCamera(dt);
    if (time - this.pulseAt > 100) { this.pulseAt = time; this.view.update(time); }

    const h = this.state.hero;
    const r = roomAt(this.tower, h.floor, h.x);
    this.hud.update({
      needs: this.state.needs,
      floor: this.stair ? this.stair.to : h.floor,
      canStore: this.canStoreAll() && !this.panel.isOpen && !this.popup.isOpen,
      hint: r ? r.apt.name : 'Stairwell',
    });
    this.toast.setY(this.panel.isOpen ? this.panel.bottomY + TOAST_PANEL_GAP : this.hud.toastY - (this.needPrompt.isOpen ? TOAST_PROMPT_LIFT : 0));
  }
}
