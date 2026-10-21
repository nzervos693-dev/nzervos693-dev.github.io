import Phaser from 'phaser';
import floorsData from '../../public/data/levels/floors.json';
import lootData from '../../public/data/levels/loot.json';
import { getBalance } from '../core/balance.js';
import { getSave, writeSave, deleteSave } from '../core/save.js';
import { now, elapsedInfo } from '../core/clock.js';
import { offlineCapMs } from '../core/balance.js';
import { lifecycle } from '../core/lifecycle.js';
import {
  buildTower, floorAtY, floorTopY, floorLineY, roomAt, homeSpot, worldHeight,
} from '../gameplay/layout.js';
import { createGameState, normalizeGameState, enterRoom, heroCtx, takeFromPile, objState } from '../gameplay/gameState.js';
import { tickNeeds, applyItem, itemEffect, speedMult } from '../gameplay/needs.js';
import { catchUp, pickAutoUseItem } from '../gameplay/offline.js';
import { addPile } from '../gameplay/gameState.js';
import { addItem, moveAll } from '../gameplay/inventory.js';
import { heroWeapon, equipSlot, unequip, isEquipped, isEquippable, damageHero } from '../gameplay/combat.js';
import { makeZombie, isWanderer, isAttacker } from '../gameplay/zombies.js';
import { updateFloorStates } from '../gameplay/floorState.js';
import { spawnDueWanderers, dropLostWanderTime } from '../gameplay/wanderers.js';
import { livingSurvivors, gameOverStats } from '../gameplay/death.js';
import {
  recruitedAlive, residentsAtHome, interactSurvivor, setJob, talkTo, talkWaitMs, tickUpkeep, tickScavengers,
  dropLostSurvivorTime, passTorch, killActiveSurvivor, activeId, isActive, jobInfo, regenSurvivors, treatOptions, treatSurvivor,
} from '../gameplay/survivors.js';
import { makeAttackHook, settleInterrupted, dropLostAttackTime } from '../gameplay/attacks.js';
import {
  currentStep, shouldOpenDoor, checkTutorialDone, skipTutorial, tutorialActive, TUTORIAL_TRIGGER,
} from '../gameplay/tutorial.js';
import { torchLine } from '../gameplay/storyText.js';
import { limitWalk, planRoute, stairSeconds, stepToward, hitJammedDoor, doorStopX } from '../gameplay/routing.js';
import { napAction, completeNap, napConfig } from '../gameplay/nap.js';
import { listActions, buildSpec, noiseFor, completeAction, heroHasTool } from '../gameplay/actions.js';
import { pastKeepThreshold, spendToolUse, energyTimeMult } from '../gameplay/salvage.js';
import { reportLines, attackLines, formatDuration } from '../gameplay/report.js';
import {
  recipeRows, USE_NAMES, craftCheck, costLines, effectText, performCraft, recipeKind,
} from '../gameplay/crafting.js';
import {
  freeSpots, secureCandidates, builtActions, useBuilt, removeObject, dismantleRefund, deliver,
} from '../gameplay/building.js';
import { tickProducers } from '../gameplay/producers.js';
import { barricadeMaxHp, damageBarricade, barricadeLevel, latchBreach } from '../gameplay/barricade.js';
import { getDefense } from '../gameplay/defense.js';
import { atHome } from '../gameplay/buildSpots.js';
import TowerView from './TowerView.js';
import Hud from './Hud.js';
import ActionMenu from './ActionMenu.js';
import InventoryPanel from './InventoryPanel.js';
import Popup from './Popup.js';
import Toast from './Toast.js';
import NeedPrompt from './NeedPrompt.js';
import Zombies from './Zombies.js';
import Combat from './Combat.js';
import Throwing from './Throwing.js';
import GameOverPanel from './GameOverPanel.js';
import CraftPanel from './CraftPanel.js';
import FloorPicker from './FloorPicker.js';
import Placement from './Placement.js';
import Dialogue from './Dialogue.js';
import SurvivorsPanel from './SurvivorsPanel.js';
import TutorialView from './TutorialView.js';
import AttackDirector from './AttackDirector.js';
import { debugOn, skipFrontEnd, attacksOn, exposeScene } from './debug.js';
import { label, COLORS, CSS, DEPTH } from './ui.js';
import { playSfx, stopSfx } from './sfx.js';
import { isAudioUnlocked } from '../core/audio.js';

const HERO_DEPTH = 20;
const BAR_W = 120;
/** A frame gap longer than this (s) without a lifecycle resume is treated as time passed. */
const LONG_GAP_MS = 30000;
const HERO_FEET_TO_HEAD = 100;
const FLOAT_TEXT_RISE = 40;
const DOOR_SHAKE_PX = 4;
const MENU_BOTTOM_MARGIN = 8;
const SWING_ANIM_MS = 280;
const STEP_SECONDS = 0.3;
/** Pause before the pass the torch card so the death animation plays. */
const TORCH_DELAY_MS = 1200;
/** Distance the hero must walk before the tutorial counts "walk" as done, px. */
const TUTORIAL_WALK_PX = 40;
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
 *   'crafted' {id, kind}  'object-placed' {id, key}  'built-dismantled' {id, key}  'built-used' {id, key, collected, loaded}
 *   'barricade-built' {level}  'barricade-hit' {hp, zombie}  'barricade-broken'  'floor-secured' {floor}
 *   'hero-dead' {survivors, handled}  'item-used' {id}
 *   'attack-warning' {arrivesAt}  'attack-start' {kind, strength, total}  'attack-end' {kind, repelled}
 *   'survivor-recruited' {id}  'survivor-died' {id}  'torch-passed' {id}  'tutorial-done'
 *   'floor-cleared' {floor}      'zombie-killed' {id, type, floor}
 *   'tutorial_open_door' (and any floors.json scriptedSpawns trigger): emit it on `bus` to spawn that
 *   scripted zombie. Death: listeners of 'hero-dead' that run pass the torch set `payload.handled = true`.
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
    this.gameOver = false;
    this.swingAnimUntil = 0;
    this.hudCombat = { weapon: { id: 'fists', name: 'Fists', uses: null }, canThrow: false };
    this.lastFrameAt = performance.now();
    this.stepT = 0;
    this.stepFlip = false;
    this.ambient = false;
    this.attacksEnabled = attacksOn();
    this.walkStartX = this.state.hero.x;
    this.crewCount = recruitedAlive(this.state).length;
    this.tutorialAt = 0;

    this.cameras.main.setBackgroundColor('#0d0f12');
    this.view = new TowerView(this, this.tower, this.state, balance);
    this.createHero();
    this.createActionBar();

    this.hud = new Hud(this, balance, {
      onHome: () => this.onHomeButton(),
      onBag: () => this.toggleBag(),
      onStoreAll: () => this.storeAll(),
      onThrow: () => this.onThrowButton(),
      onCrew: () => this.openCrew(),
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
      badge: (slot, i, tab) => (tab === 'bag' && isEquipped(this.state, i) ? `E${slot.uses ?? ''}` : null),
    });
    this.craftPanel = new CraftPanel(this, {
      rows: () => this.craftRows(),
      onCraft: (id) => this.onCraftTap(id),
      onClose: () => {},
    });
    this.floorPicker = new FloorPicker(this);
    this.placement = new Placement(this);
    this.gameOverPanel = new GameOverPanel(this);
    this.zombies = new Zombies(this);
    this.combat = new Combat(this);
    this.throwing = new Throwing(this);
    this.dialogue = new Dialogue(this);
    this.crewPanel = new SurvivorsPanel(this, {
      rows: () => this.crewRows(),
      onJob: (id, job) => this.onCrewJob(id, job),
      onTalk: (id) => this.onCrewTalk(id),
      onTreat: (id) => this.onCrewTreat(id),
      onClose: () => {},
    });
    this.tutorialView = new TutorialView(this, () => this.onSkipTutorial());
    this.tutorialView.layout(this.hud.topH);
    this.attacks = new AttackDirector(this);
    this.attacks.enabled = this.attacksEnabled;
    this.bus.on('noise', (n) => this.zombies.onNoise(n));
    this.bus.on('attack-warning', () => { if (this.action?.spec.kind === 'nap') this.cancelAction(); });
    this.bus.on('hero-dead', (p) => this.offerTorch(p));
    for (const f of this.tower.floors.values()) {
      for (const sp of f.scriptedSpawns || []) this.bus.on(sp.trigger, () => this.spawnScripted(sp.trigger));
    }

    this.setupInput();
    this.setupLifecycle();
    this.jumpCameraToHero();
    this.placeHero();
    this.view.refresh();

    this.applyDebugGive();
    this.checkFloorStates();
    this.autosaveEvent = this.time.addEvent({
      delay: balance.time.autosaveSeconds * 1000, loop: true, callback: () => this.save(),
    });

    if (fresh) {
      if (skipFrontEnd()) skipTutorial(this.state, balance, t0); // plain ?debug: no tutorial
      this.save();
    } else {
      // measured from the last game tick, not the save stamp: hiding on the title screen also writes the save
      const info = elapsedInfo(this.state.times.lastTickAt, now(), offlineCapMs(balance));
      this.applyOffline(info.elapsedMs, info.capped);
    }

    if (this.state.flags.heroDead) this.showGameOver();
    if (debugOn()) window.__floor15 = this;
    exposeScene(this);
  }

  // ---------------------------------------------------------------- setup

  createHero() {
    const key = this.charKey();
    this.heroSprite = this.add.sprite(0, 0, key, 0).setOrigin(0.5, 1).setScale(3).setDepth(HERO_DEPTH);
    this.heroSprite.play(`${key}_idle`);
    this.heroSprite.on('animationcomplete', (anim) => {
      if (anim.key.endsWith('_attack') && this.action?.spec.kind === 'dismantle') this.heroSprite.play(anim.key);
    });
    this.zzz = label(this, 0, 0, 'Zzz', 30, CSS.text, false).setDepth(HERO_DEPTH + 1).setVisible(false);
  }

  /** Sprite/texture key of the character you play: 'hero', or a survivor id after pass the torch. */
  charId() { return activeId(this.state); }

  /** Playable sprite sheet of the active character: 'hero' or `${survivorId}_play` (walk and swing frames). */
  charKey() {
    const id = this.charId();
    return id === 'hero' ? 'hero' : (this.textures.exists(`${id}_play`) ? `${id}_play` : id);
  }

  createActionBar() {
    this.napFade = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.menu - 1).setAlpha(0).setVisible(false);
    this.barBg = this.add.rectangle(0, 0, BAR_W + 8, 22, COLORS.ink).setDepth(40).setVisible(false);
    this.barFill = this.add.rectangle(0, 0, BAR_W, 14, COLORS.amber).setOrigin(0, 0.5).setDepth(41).setVisible(false);
  }

  setupLifecycle() {
    const onHide = () => this.onHide();
    const onResume = () => {
      const info = elapsedInfo(this.state.times.lastTickAt, now(), offlineCapMs(this.balance));
      this.applyOffline(info.elapsedMs, info.capped);
    };
    this.game.events.on('floor15:hide', onHide);
    lifecycle.on('resume', onResume);
    this.events.once('shutdown', () => {
      stopSfx('heartbeat');
      stopSfx('siren');
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
    if (name !== 'attack' && this.time.now < this.swingAnimUntil) return; // let a swing finish
    const k = this.charKey();
    let key = `${k}_${name}`;
    if (!this.anims.exists(key)) key = `${k}_idle`; // survivors only have an idle animation
    if (this.heroSprite.anims.currentAnim?.key !== key) this.heroSprite.play(key);
  }

  /** Alternating footstep sounds while walking. */
  footstep(dt) {
    this.stepT += dt;
    if (this.stepT < STEP_SECONDS) return;
    this.stepT = 0;
    this.stepFlip = !this.stepFlip;
    playSfx(this, this.stepFlip ? 'step_1' : 'step_2');
  }

  /** Ambience after the first tap; heartbeat while health is low. */
  updateAudio() {
    if (!isAudioUnlocked()) return;
    if (!this.ambient) { this.ambient = true; playSfx(this, 'amb_tower', { loop: true }); }
    const low = this.state.needs.health < this.balance.needs.onlinePromptThreshold && !this.dead;
    if (low) playSfx(this, 'heartbeat', { loop: true }); else stopSfx('heartbeat');
  }

  /** Toast with the denied sound. */
  deny(msg, ms) {
    playSfx(this, 'error');
    this.toast.show(msg, ms);
  }

  /** One-shot swing animation (weapon swing, door hit, throw). */
  playSwingAnim() {
    this.swingAnimUntil = this.time.now + SWING_ANIM_MS;
    const key = `${this.charKey()}_attack`;
    if (this.anims.exists(key)) { this.heroSprite.play(key); return; }
    const lean = this.heroSprite.flipX ? -0.2 : 0.2; // no swing frames: a quick lean
    this.tweens.add({ targets: this.heroSprite, rotation: lean, yoyo: true, duration: 90 });
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
    if (this.combat.order) return; // Combat walks the hero into weapon range
    const step = this.route[0];
    if (!step) { this.setHeroAnim('idle'); return; }
    if (step.type === 'stairs') {
      this.route.shift();
      playSfx(this, 'stairs');
      this.stair = { from: step.from, to: step.to, t: 0, dur: Math.max(0.01, stairSeconds(step.from, step.to, this.balance)) };
      return;
    }
    const lim = limitWalk(this.tower, this.state.doors, h.floor, h.x, step.x);
    const speed = this.balance.hero.walkSpeed * speedMult(this.state.needs, this.balance);
    const nx = stepToward(h.x, lim.x, speed, dt);
    if (nx !== h.x) {
      this.heroSprite.setFlipX(nx < h.x);
      this.setHeroAnim('walk');
      this.footstep(dt);
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
    if (this.gameOver || this.dead || this.popup.isOpen || this.panel.isOpen || this.craftPanel.isOpen || this.floorPicker.isOpen || this.crewPanel.isOpen || this.dialogue.isOpen) return;
    if (this.placement.active) {
      const zt = this.zombies.hitTest(wx, wy); // you can still fight while placing
      if (zt) this.attackZombie(zt); else this.placement.handleTap(wx, wy);
      return;
    }
    if (this.sleeping) { this.wake(); return; }
    this.menu.close();
    if (this.action) {
      const progress = this.action.elapsed / this.action.duration;
      if (this.action.spec.kind !== 'nap' && pastKeepThreshold(progress, this.balance)) {
        this.queuedTap = { wx, wy }; // past 50%: it completes, then this tap runs
        return;
      }
      this.cancelAction();
    }
    if (this.throwing.armed && this.throwing.handleTap(wx, wy)) return;
    const zt = this.zombies.hitTest(wx, wy);
    if (zt) { this.attackZombie(zt); return; }
    this.combat.clear();
    const t = this.view.hitTest(wx, wy);
    if (t) this.handleTarget(t, wx, wy);
    else this.handleGround(wx, wy);
  }

  /** Tap on a zombie: swing now if in range, else walk up to it and swing once. */
  attackZombie(rt) {
    this.route.length = 0;
    this.pending = null;
    const z = rt.rec;
    if (this.stair || z.floor !== this.state.hero.floor) {
      this.combat.clear();
      this.goTo(z.floor, z.x, { t: { x: z.x }, kind: 'attack', zid: z.id });
      return;
    }
    this.combat.orderZombie(rt);
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

  handleTarget(t, wx, wy) {
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
        if (t.id === 'bed') {
          this.openMenu(t, [{ kind: 'sleep', label: 'Sleep', enabled: true }, this.napButton()]);
          break;
        }
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
      case 'built':
        this.openMenu(t, builtActions(state, balance, state.build.spots[t.id]), 'build-');
        break;
      case 'barricade': {
        const b = state.build.barricade;
        const lv = barricadeLevel(balance, b.level);
        this.toast.show(b.hp > 0 ? `Barricade Lv${b.level}: ${Math.ceil(b.hp)}/${lv.hp} HP, defense +${lv.defense}. Repair it at the workbench.` : `Barricade Lv${b.level} is broken. Repair it at the workbench.`, 3000);
        this.handleGround(wx, wy); // the hero also walks there: his own barricade is no obstacle
        break;
      }
      case 'door':
        this.goTo(t.floor, doorStopX(t.apt), { t, kind: 'door' });
        break;
      default:
    }
  }

  openMenu(t, actions, kindPrefix = '') {
    const img = t.sp.img;
    const cam = this.cameras.main;
    this.menu.open(
      { x: t.x, topY: img.y - img.displayHeight, bottomY: img.y, screenTop: cam.scrollY + this.hud.topH + 8, screenBottom: cam.scrollY + this.hud.bottomY - MENU_BOTTOM_MARGIN },
      actions,
      (kind) => this.goTo(t.floor, t.x, { t, kind: kindPrefix + kind }),
    );
  }

  // ---------------------------------------------------------------- arrival and actions

  onBlockedByDoor(apt) {
    const p = this.pending;
    if (p?.kind === 'door' && p.t.apt === apt) this.onArrive();
    else { this.pending = null; this.deny('The door is jammed. Tap it to force it open.'); }
  }

  onArrive() {
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    const { t, kind } = p;
    this.heroSprite.setFlipX(t.x < this.state.hero.x ? true : t.x > this.state.hero.x ? false : this.heroSprite.flipX);
    switch (kind) {
      case 'sleep': this.startSleep(); break;
      case 'nap': this.startNap(t); break;
      case 'workbench':
        this.bus.emit('workbench-open');
        this.openCraft();
        break;
      case 'build-use': this.useBuiltObject(t); break;
      case 'build-dismantle': this.beginBuildDismantle(t); break;
      case 'survivor': this.onSurvivorTap(t.id); break;
      case 'quest': this.takeQuestItem(t); break;
      case 'pile': this.takePile(t.pile); break;
      case 'door': this.interactDoor(t.apt); break;
      case 'attack': {
        const rt = this.zombies.get(p.zid);
        if (rt) this.combat.orderZombie(rt);
        break;
      }
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
    if (!act.enabled) { this.deny(act.reason || 'Cannot do that'); return; }
    const spec = buildSpec(kind, def, t.id, state, balance);
    this.action = { spec, t, elapsed: 0, duration: spec.seconds };
    this.bus.emit('action-start', { spec, target: t });
    const noise = noiseFor(spec, balance);
    if (noise) {
      this.bus.emit('noise', { floor: t.floor, x: t.x, ...noise, source: t.id });
      this.floatText(t.x, t.cy - 70, '!', CSS.red);
    }
    playSfx(this, this.actionSound(spec, def));
    this.setHeroAnim(kind === 'dismantle' ? 'attack' : 'idle');
    if (spec.seconds <= 0) this.finishAction();
  }

  /** Sound key for the start of an action; dismantles sound like their main material. */
  actionSound(spec, def) {
    if (spec.kind === 'search') return 'search';
    if (spec.kind === 'drain') return 'drain';
    if (spec.kind === 'take') return 'pickup';
    const y = def.yield || {};
    return (y.metal || 0) > 0 && (y.metal || 0) >= (y.wood || 0) ? 'dismantle_metal' : 'dismantle_wood';
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
    if (a.spec.kind === 'nap') this.napFade.setVisible(true).setAlpha(1 - Math.abs(2 * p - 1));
    if (a.elapsed >= a.duration) this.finishAction();
  }

  hideBar() { this.barBg.setVisible(false); this.barFill.setVisible(false); }

  cancelAction() {
    if (!this.action) return;
    this.bus.emit('action-cancel', { spec: this.action.spec });
    this.action = null;
    this.queuedTap = null;
    this.hideBar();
    this.napFade.setVisible(false);
  }

  runQueuedTap() {
    const q = this.queuedTap;
    this.queuedTap = null;
    if (q) this.onWorldTap(q.wx, q.wy);
  }

  finishAction() {
    if (this.action.spec.kind === 'nap') { this.finishNap(); return; }
    if (this.action.spec.kind === 'pry') { this.finishPry(); return; }
    if (this.action.spec.build) { this.finishBuildDismantle(); return; }
    const { spec, t } = this.action;
    this.action = null;
    this.hideBar();
    const placement = t.sp.placement;
    const def = this.balance.objects[placement.objectId];
    const res = completeAction(this.state, spec, placement, def, {
      balance: this.balance, tables: this.tables, rng: this.rng, loc: { floor: t.floor, x: t.x },
    });
    const cleared = updateFloorStates(this.tower, this.state, this.balance, now());
    this.view.refresh();
    if (spec.kind === 'dismantle') this.view.playDismantle(t.id);
    this.bus.emit('action-done', { spec, result: res, target: t });
    if (res.gained.length) playSfx(this, 'pickup');
    this.setHeroAnim('idle');
    this.runQueuedTap();

    const parts = [];
    if (res.gained.length) parts.push(this.itemList(res.gained, '+'));
    else if (spec.kind === 'search') parts.push('Nothing useful.');
    if (res.piled.length) parts.push('Bag full: the rest is on the floor.');
    else if (res.kept.length) parts.push('Bag full: the rest stays inside.');
    if (res.toolBroke) parts.push(`Your ${this.balance.items[res.toolBroke].name.toLowerCase()} broke.`);
    if (res.note) parts.push(`Note: "${res.note.text}"`);
    for (const n of cleared) { parts.push(`Floor ${n} cleared!`); this.bus.emit('floor-cleared', { floor: n }); }
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
      this.deny('Bag full. Make room first.');
      return;
    }
    os.taken = true;
    this.view.refresh();
    playSfx(this, 'pickup');
    this.toast.show(`Picked up: ${name}`);
    this.save();
  }

  takePile(pile) {
    const taken = takeFromPile(this.state, pile, this.balance);
    this.view.refresh();
    if (taken.length) { playSfx(this, 'pickup'); this.toast.show(this.itemList(taken, '+')); } else this.deny('Bag full. Make room first.');
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
   * Hit a jammed door: queued like any attack, so it follows the weapon cooldown, costs
   * combat.energyPerSwing and holds one buffered tap. The hit itself lands in applyDoorHit.
   */
  hitDoor(apt) { this.combat.orderDoor(apt); }

  /** The door takes one hit (called by Combat when the swing happens). */
  applyDoorHit(apt) {
    const r = hitJammedDoor(this.state.doors[apt.id], this.balance);
    const sprite = this.view.doorSprites.get(apt.id);
    this.tweens.add({ targets: sprite, x: apt.doorX + DOOR_SHAKE_PX, yoyo: true, duration: 60, repeat: 1, onComplete: () => sprite.setX(apt.doorX) });
    playSfx(this, 'door_hit');
    this.bus.emit('door-hit', { aptId: apt.id, hits: r.hits, needed: r.needed });
    this.toast.show(r.opened ? 'The door gives way.' : `The door is stuck (${r.hits}/${r.needed}). Hit it again.`);
    if (r.opened) this.afterDoorOpened(apt);
  }

  afterDoorOpened(apt) {
    this.view.refresh();
    playSfx(this, 'door_open');
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

  /** Nap button state for the hero bed (GDD 5.2). */
  napButton() {
    return napAction(this.state, now(), this.balance, { unsafe: this.napUnsafe() });
  }

  /** Attack warning or fight, or any zombie on the home floor is chasing or biting. */
  napUnsafe() {
    if (this.attacks.phase !== 'idle') return true;
    const home = this.tower.homeFloor;
    return this.zombies.list.some((rt) => !rt.dying && !rt.rec.dead && rt.rec.floor === home
      && (rt.ai.mode === 'chase' || rt.ai.mode === 'attack'));
  }

  startNap(t) {
    const nb = this.napButton();
    if (!nb.enabled) { this.deny(nb.reason); return; }
    const spec = { kind: 'nap', id: 'bed', seconds: napConfig(this.balance).durationSeconds, energy: 0, tool: null, noise: 'quiet' };
    this.action = { spec, t, elapsed: 0, duration: spec.seconds };
    this.bus.emit('action-start', { spec, target: t });
    this.setHeroAnim('idle');
  }

  finishNap() {
    this.action = null;
    this.hideBar();
    this.napFade.setVisible(false);
    const r = completeNap(this.state, now(), this.balance);
    this.setHeroAnim('idle');
    this.bus.emit('nap-done', r);
    this.toast.show(`Quick nap: +${Math.round(r.energy)} energy.`);
    this.save();
  }

  wake() {
    this.sleeping = false;
    this.heroSprite.setAlpha(1);
    this.zzz.setVisible(false);
  }

  // ---------------------------------------------------------------- needs and time

  tickClock() {
    const { state, balance } = this;
    if (state.flags.heroDead) return;
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
    tickProducers(state, balance, gap / 1000);
    this.view.refreshBuilt();
    this.tickWanderers(t);
    this.tickSurvivors(t, gap / 1000);
    this.attacks.check(t);
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
    if (needs.health <= 0 && !this.dead) this.onHeroDeath();
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
    this.deny(need === 'food' ? 'Nothing to eat.' : 'Nothing to drink.');
  }

  /**
   * Offline catch-up on launch, resume, or a long frame gap: needs, wanderers, production, survivors
   * (upkeep, scavengers) and attacks, in 10-minute steps. An attack interrupted by closing the app settles first.
   */
  applyOffline(elapsedMs, capped, awake = false) {
    const { state, balance } = this;
    if (state.flags.heroDead || this.gameOver) return;
    const t = now();
    this.attacks.onHide(); // a fight cut short by a long gap settles below
    const startMs = state.times.lastTickAt;
    let report = null;
    const attackResults = [];
    const attackHook = makeAttackHook(state, balance, this.rng, startMs);
    attackHook.settle(startMs, { attacks: attackResults }); // an interrupted fight first (counts toward the cap)
    if (elapsedMs > 0) {
      const sim = { needs: state.needs, stockpile: state.stockpile, ctx: heroCtx(state, balance) };
      const wander = (_sim, _seconds, atMs) => spawnDueWanderers(state, this.tower, balance, atMs, this.rng, { hero: homeSpot(this.tower) });
      const produce = (_sim, seconds, _atMs, rep) => tickProducers(state, balance, seconds, rep);
      const crew = (_sim, seconds, atMs, rep) => {
        tickUpkeep(state, balance, atMs, { offline: true }, (rep.survivorEvents ||= [])); // health floor always applies
        regenSurvivors(state, balance, seconds);
        tickScavengers(state, balance, this.tower, this.tables, seconds, this.rng, (rep.scavenged ||= []));
      };
      const hooks = [wander, produce, crew];
      if (this.attacksEnabled) hooks.push(attackHook);
      report = catchUp(sim, elapsedMs, balance, { startMs, awake, stepHooks: hooks });
      if (capped) {
        dropLostWanderTime(state, t, balance);
        dropLostSurvivorTime(state, balance, t);
        dropLostAttackTime(state, balance, t, this.rng);
      }
      attackResults.push(...(report.attacks || []));
      report.attacks = attackResults;
    }
    this.zombies.syncRecords();
    if (report ? (elapsedMs >= 60000 || attackResults.length || report.survivorEvents?.length) : attackResults.length) {
      const lines = report ? reportLines(report, balance, capped) : attackLines(attackResults, balance);
      this.popup.show('While you were away', lines);
    }
    state.times.lastTickAt = t;
    this.refreshCrewCount();
    this.view.refresh();
    this.panel.refresh();
    this.save();
  }

  /** An attack came due while the game was not ticking (e.g. the app was open on the title): settle it offline. */
  settleDueAttacks(t) {
    const report = { attacks: [] };
    makeAttackHook(this.state, this.balance, this.rng, t)(null, 0, t, report);
    if (!report.attacks.length) return;
    for (const a of report.attacks) a.missed = true;
    this.popup.show('While you were away', attackLines(report.attacks, this.balance));
    this.refreshCrewCount();
    this.view.refresh();
    this.save();
  }

  refreshCrewCount() { this.crewCount = recruitedAlive(this.state).length; }

  onHide() {
    this.closeBuildUi();
    this.cancelAction();
    this.combat.clear();
    const inFlight = this.throwing.reset();
    if (inFlight && addItem(this.state.inventory, inFlight.id, 1, this.balance) > 0) {
      // bag full: the bottle waits on the floor at home
      const home = homeSpot(this.tower);
      addPile(this.state, home.floor, home.x, [{ id: inFlight.id, qty: 1 }]);
    }
    this.attacks.onHide();
    this.crewPanel.close();
    this.zombies.resetAll();
    this.route.length = 0;
    this.pending = null;
    this.stair = null;
    this.wake();
    this.menu.close();
    if (!this.dead) { // a dead hero stays where he fell until the torch is passed
      const spot = homeSpot(this.tower);
      this.state.hero.floor = spot.floor;
      this.state.hero.x = spot.x;
    }
    this.placeHero();
  }

  save() { writeSave(); }

  // ---------------------------------------------------------------- inventory

  /** At home: f15_left, plus f15_right once it is cleared (GDD 5.3). */
  inHome() { const h = this.state.hero; return atHome(this.tower, this.state, this.balance, h.floor, h.x); }

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
    const extra = this.combatItemInfo(slot, tab);
    if (extra) return { name: it.name, canStore: tab === 'bag' && home, canTake: tab === 'stock' && home, ...extra };
    return {
      name: it.name,
      effect: bits.join(', '),
      canUse: !!e && (tab === 'bag' || home),
      canStore: tab === 'bag' && home && it.type !== 'quest',
      canTake: tab === 'stock' && home,
    };
  }

  /** Describe a weapon or throwable for the bag panel, or null for other items. */
  combatItemInfo(slot, tab) {
    const { balance, state } = this;
    const it = balance.items[slot.id];
    if (it.type === 'weapon' && isEquippable(slot, balance)) {
      const w = balance.combat.weapons[slot.id];
      const max = w.durability;
      const idx = tab === 'bag' ? state.inventory.indexOf(slot) : -1;
      const on = idx >= 0 && isEquipped(state, idx);
      const wear = max == null ? 'no wear' : `${slot.uses ?? max}/${max} hits`;
      return { effect: `${w.damage} dmg, reach ${w.rangePx}, ${wear}`, canUse: tab === 'bag', useLabel: on ? 'Unequip' : 'Equip' };
    }
    if (it.type === 'throwable') {
      const m = balance.molotov;
      return { effect: `Fire ${m.seconds}s, ${m.zombieDps} dmg/s. Loud.`, canUse: tab === 'bag' && !this.stair, useLabel: 'Throw' };
    }
    return null;
  }

  useItem(tab, i) {
    const slots = tab === 'bag' ? this.state.inventory : this.state.stockpile;
    const s = slots[i];
    if (!s) return;
    const type = this.balance.items[s.id]?.type;
    if (type === 'weapon') {
      if (tab !== 'bag') return;
      if (isEquipped(this.state, i)) { unequip(this.state); this.toast.show('Fists ready.'); } else if (equipSlot(this.state, i, this.balance)) this.toast.show(`Equipped ${this.balance.items[s.id].name.toLowerCase()}.`);
      this.panel.refresh();
      this.save();
      return;
    }
    if (type === 'throwable') {
      if (tab !== 'bag') return;
      this.panel.close();
      this.throwing.arm(s.id);
      this.toast.show('Tap inside the circle to throw. Tap Throw to cancel.', 3000);
      return;
    }
    const r = applyItem(this.state.needs, s.id, this.balance, heroCtx(this.state, this.balance));
    if (!r.ok) { this.deny(r.reason); return; }
    s.qty -= 1;
    if (s.qty <= 0) { slots[i] = null; this.panel.selected = -1; }
    this.bus.emit('item-used', { id: s.id });
    playSfx(this, this.balance.consumables?.[s.id]?.water || s.id.endsWith('water') ? 'drink' : 'eat');
    this.toast.show(`Used ${this.balance.items[s.id].name}`);
    this.panel.refresh();
    this.save();
  }

  // ---------------------------------------------------------------- HUD buttons

  onHomeButton() {
    this.throwing.disarm();
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

  // ---------------------------------------------------------------- zombies and combat

  /** Floor the zombies can hurt the hero on (null while on the stairs or dead). */
  zombieTargetFloor() {
    return this.stair || this.dead || this.gameOver ? null : this.state.hero.floor;
  }

  /**
   * An interrupt (zombie noticed you, bite, fire). GDD: progress is lost unless the work is past
   * salvage.keepProgressRatio, in which case it completes now.
   */
  interruptAction() {
    const a = this.action;
    if (!a) return;
    if (a.spec.kind === 'nap') { this.cancelAction(); this.toast.show('Nap interrupted!', 1600); return; }
    if (a.duration > 0 && pastKeepThreshold(a.elapsed / a.duration, this.balance)) this.finishAction();
    else {
      this.cancelAction();
      this.toast.show('Interrupted!', 1600);
    }
  }

  /**
   * A zombie noticed the hero (sight interrupts the current action; noise only alerts).
   * @param {boolean} [byNoise]
   */
  onZombieAggro(rt, byNoise = false) {
    if (rt.rec.floor !== this.state.hero.floor) return;
    this.floatText(rt.rec.x, rt.y - 90, '!', CSS.red);
    playSfx(this, this.rng() < 0.5 ? 'zombie_groan_1' : 'zombie_groan_2');
    if (!byNoise) { playSfx(this, 'alert_sting'); this.interruptAction(); }
  }

  /** A zombie bite landed. */
  onZombieBite(rt, damage) {
    if (this.dead || this.gameOver) return;
    const r = damageHero(this.state.needs, damage);
    playSfx(this, 'zombie_hit');
    if (this.sleeping) this.wake();
    this.heroHurtFx(r.damage);
    this.interruptAction();
    if (r.dead) this.onHeroDeath();
  }

  /** Fire damage over time on the hero. */
  burnHero(amount) {
    if (this.dead || this.gameOver) return;
    const r = damageHero(this.state.needs, amount);
    this.interruptAction();
    if (this.time.now > (this.burnFxAt || 0)) { this.burnFxAt = this.time.now + 400; this.heroHurtFx(0); }
    if (r.dead) this.onHeroDeath();
  }

  heroHurtFx(damage) {
    this.heroSprite.setTintFill(0xff5544);
    this.time.delayedCall(120, () => { if (!this.dead) this.heroSprite.clearTint(); });
    if (damage > 0) {
      this.floatText(this.state.hero.x, this.heroLineY() - HERO_FEET_TO_HEAD - 20, `-${Math.round(damage)}`, CSS.red);
      playSfx(this, 'hero_hurt');
    }
  }

  /** A zombie died (weapon or fire). */
  onZombieKilled(rt) {
    const z = rt.rec;
    this.state.stats.zombiesKilled += 1;
    this.bus.emit('zombie-killed', { id: z.id, type: z.type, floor: z.floor });
    this.attacks.onKilled(z);
    if (isWanderer(z.id) || isAttacker(z.id)) delete this.state.zombies[z.id]; // wanderers and attackers leave no record; authored and scripted ones stay dead
    const cleared = updateFloorStates(this.tower, this.state, this.balance, now());
    this.view.refresh();
    for (const n of cleared) {
      this.toast.show(`Floor ${n} cleared!`, 3000);
      this.bus.emit('floor-cleared', { floor: n });
    }
    this.save();
  }

  /** Promote floors that are already clear (launch, data change). */
  checkFloorStates() {
    updateFloorStates(this.tower, this.state, this.balance, now());
    this.view.refreshFloorLabels();
  }

  /** Online wanderer arrivals (runs every clock tick). */
  tickWanderers(t) {
    const h = this.state.hero;
    const made = spawnDueWanderers(this.state, this.tower, this.balance, t, this.rng, { hero: { floor: h.floor, x: h.x } });
    if (!made.length) return;
    this.zombies.syncRecords();
    this.toast.show(`Something wanders onto floor ${made[0].floor}.`, 2600);
    this.save();
  }

  /** Spawn the scripted zombie(s) of a trigger (e.g. 'tutorial_open_door'); once each. */
  spawnScripted(trigger) {
    for (const f of this.tower.floors.values()) {
      for (const sp of f.scriptedSpawns || []) {
        const id = `scripted:${sp.id}`;
        if (sp.trigger !== trigger || this.state.zombies[id] || !this.balance.zombies.types[sp.type]) continue;
        const rec = makeZombie(id, sp.type, f.number, sp.x, this.balance);
        this.state.zombies[id] = rec;
        this.zombies.add(rec, true);
      }
    }
    this.save();
  }

  /** The active character's health hit 0 while playing. */
  onHeroDeath() {
    if (this.dead) return;
    this.dead = true;
    this.deathSpot = { floor: this.stair ? this.stair.to : this.state.hero.floor, x: this.stair ? this.tower.stairwell.entryX : this.state.hero.x };
    this.cancelAction();
    this.combat.clear();
    this.throwing.reset();
    this.route.length = 0;
    this.pending = null;
    this.wake();
    this.menu.close();
    this.needPrompt.hide();
    this.heroDeathAnim();
    killActiveSurvivor(this.state); // a survivor you played is gone for good
    const payload = { survivors: livingSurvivors(this.state), handled: false };
    this.bus.emit('hero-dead', payload);
    if (payload.handled) return;
    this.state.flags.heroDead = true;
    this.save();
    this.showGameOver();
  }

  /** 'hero-dead' listener: with someone left, show the pass the torch card (GDD 5.7) instead of game over. */
  offerTorch(payload) {
    if (!payload.survivors.length) return;
    payload.handled = true;
    this.time.delayedCall(TORCH_DELAY_MS, () => this.askTorch(payload.survivors));
  }

  /** Pick who to continue as (one survivor: just the card). */
  askTorch(ids) {
    const names = ids.map((id) => this.balance.survivors.roster[id]?.name || id);
    if (ids.length === 1) {
      this.dialogue.show({ lines: [torchLine(names[0])], big: true, onDone: () => this.takeOver(ids[0]) });
      return;
    }
    const rows = ids.map((id, i) => ({ floor: i, text: `Carry on as ${names[i]}` }));
    this.floorPicker.open('Who carries on?', rows, (i) => {
      this.dialogue.show({ lines: [torchLine(names[i])], big: true, onDone: () => this.takeOver(ids[i]) });
    }, () => this.askTorch(ids));
  }

  /** The chosen survivor becomes the character you play; the dead body and bag stay where they fell. */
  takeOver(id) {
    const { state, balance, tower } = this;
    const spot = this.deathSpot || { floor: state.hero.floor, x: state.hero.x };
    const r = passTorch(state, balance, id, spot, homeSpot(tower));
    if (!r.ok) { this.state.flags.heroDead = true; this.showGameOver(); return; }
    this.stair = null;
    this.refreshCrewCount();
    this.clearDeathState();
    this.promptArmed = { food: true, water: true };
    this.view.refresh();
    this.panel.refresh();
    this.placeHero();
    this.jumpCameraToHero();
    this.following = true;
    this.bus.emit('torch-passed', { id });
    this.toast.show(`${balance.survivors.roster[id].name} carries on. Your bag lies where you fell.`, 3600);
    this.save();
  }

  /** Death one-shot (last frame stays). */
  heroDeathAnim() {
    const k = this.charId();
    this.heroSprite.clearTint().setTexture(`${k}_death`, 0);
    this.heroSprite.play(`${k}_death_death`);
  }

  /** Undo the dead state after a successful pass the torch. */
  clearDeathState() {
    this.dead = false;
    this.state.flags.heroDead = false;
    const k = this.charKey();
    this.heroSprite.clearTint().setTexture(k, 0);
    this.heroSprite.play(`${k}_idle`);
  }

  showGameOver() {
    stopSfx('heartbeat');
    stopSfx('amb_tower');
    this.gameOver = true;
    this.dead = true;
    this.panel.close();
    this.popup.close();
    this.closeBuildUi();
    const dk = `${this.charId()}_death`;
    if (this.heroSprite.texture.key !== dk) this.heroSprite.setTexture(dk, 2);
    this.gameOverPanel.show(gameOverStats(this.state, now()), () => this.newGame());
  }

  /** New game: delete the save and restart the scene from scratch. */
  newGame() {
    deleteSave();
    this.scene.start(skipFrontEnd() ? 'Game' : 'Intro');
  }

  // ---------------------------------------------------------------- crafting, building, barricade

  /** Home defense D for attacks (piece 3b): barricade + secured floors + guards + the character. */
  defense() { return getDefense(this.state, this.balance); }

  /** Close the craft panel, floor picker and placement mode (hide, death). */
  closeBuildUi() {
    this.craftPanel.close();
    this.floorPicker.close();
    this.placement.stop();
  }

  openCraft() {
    this.menu.close();
    this.craftPanel.open();
  }

  /** Rows for the Craft panel: group headers and recipe entries with their live state. */
  craftRows() {
    const { balance, state, tower } = this;
    return recipeRows(balance).map((r) => {
      if (r.type === 'group') return { type: 'group', name: USE_NAMES[r.use] || r.use };
      const rec = balance.recipes[r.id];
      const costs = costLines(state, rec.cost).map((l) => ({ ...l, name: balance.items[l.id]?.name || l.id }));
      return {
        type: 'recipe',
        entry: {
          id: r.id,
          name: rec.name,
          kind: recipeKind(rec),
          check: craftCheck(state, tower, balance, r.id),
          costs,
          shortCost: costs.map((l) => `${l.need} ${l.name.toLowerCase()}`).join(', '),
          effect: effectText(balance, r.id),
          outputId: Object.keys(rec.output || {})[0] || null,
        },
      };
    });
  }

  /** Craft button. Placeables ask for a spot first and Secure floor for a floor; nothing is paid before that. */
  onCraftTap(id) {
    const { state, tower, balance } = this;
    const check = craftCheck(state, tower, balance, id);
    if (!check.ok) { this.deny(check.reason); return; }
    const rec = balance.recipes[id];
    if (check.kind === 'place') {
      const spots = freeSpots(state, tower, balance, rec.buildSpot);
      this.craftPanel.close();
      this.placement.start(`Place ${rec.name}: tap a glowing spot`, spots, (key) => this.finishCraft(id, { spot: key }), () => {
        this.toast.show('Cancelled. Nothing was used.', 1800);
      });
    } else if (check.kind === 'secure') {
      const floors = secureCandidates(state).map((f) => ({ floor: f.floor, text: f.ok ? `Floor ${f.floor}` : `Floor ${f.floor}: ${f.reason}`, enabled: f.ok }));
      this.floorPicker.open('Secure which floor?', floors, (n) => this.finishCraft(id, { floor: n }));
    } else this.finishCraft(id, {});
  }

  /** Pay and apply a craft, then play the feedback. */
  finishCraft(id, target) {
    const { state, tower, balance } = this;
    const h = state.hero;
    const res = performCraft(state, tower, balance, id, { ...target, loc: { floor: h.floor, x: h.x } });
    if (!res.ok) { this.deny(res.reason); return; }
    const rec = balance.recipes[id];
    playSfx(this, 'craft');
    let msg = `Made: ${rec.name}`;
    if (res.kind === 'item') {
      msg = `Made: ${this.itemList(res.items)}`;
      if (res.gained.stock.length) msg += '\nBag full: it went to the stockpile.';
      if (res.gained.piled.length) msg += '\nBag and stockpile full: it is on the floor.';
    } else if (res.kind === 'repair') {
      const b = state.build.barricade;
      msg = `Barricade +${res.restored} HP (${Math.ceil(b.hp)}/${barricadeMaxHp(state, balance)})`;
    } else if (res.kind === 'barricade') {
      msg = `${rec.name} built.`;
      this.bus.emit('barricade-built', { level: rec.effect.level });
    } else if (res.kind === 'secure') {
      msg = `Floor ${target.floor} is Secured. Defense +${balance.attacks.securedFloorDefense}.`;
      this.bus.emit('floor-secured', { floor: target.floor });
    } else if (res.kind === 'place') {
      msg = `${rec.name} placed.`;
      if (rec.effect?.type === 'survivor_bed' && this.state.survivors.mara?.quest === 'asked' && !this.state.survivors.mara.recruited) msg += '\nMara can join now: bring her the bag.';
      this.bus.emit('object-placed', { id, key: target.spot });
    }
    this.bus.emit('crafted', { id, kind: res.kind });
    this.view.refresh();
    this.panel.refresh();
    this.toast.show(msg, 2400);
    this.save();
    if (this.craftPanel.isOpen) this.craftPanel.refresh(msg.split('\n')[0]);
  }

  /** Use on a placed producer: collect what it holds (and load dirty water into the filter). */
  useBuiltObject(t) {
    const { state, balance } = this;
    const p = state.build.spots[t.id];
    if (!p) return;
    const h = state.hero;
    const r = useBuilt(state, balance, p, { floor: h.floor, x: h.x });
    const parts = [];
    if (r.collected) parts.push(this.itemList([r.collected], '+'));
    if (r.loaded) parts.push(`Loaded ${r.loaded} ${balance.items[balance.recipes[p.id].effect.input].name.toLowerCase()}`);
    if (r.full) parts.push('Bag and stockpile full: the rest stays inside.');
    if (r.firstHarvest) {
      const gain = balance.needs.morale.events.firstPlanterHarvest;
      state.needs.morale = Math.min(balance.needs.max, state.needs.morale + gain);
      parts.push(`First harvest! +${gain} morale`);
    }
    if (!parts.length) { this.toast.show('Nothing to collect yet.'); return; }
    playSfx(this, r.collected ? 'pickup' : 'craft');
    this.bus.emit('built-used', { id: p.id, key: t.id, collected: r.collected, loaded: r.loaded });
    this.view.refreshBuilt();
    this.panel.refresh();
    this.toast.show(parts.join('\n'), 2400);
    this.save();
  }

  /** Dismantle a crafted placeable: quiet, small time and energy, refunds salvage.refundRatio of the cost. */
  beginBuildDismantle(t) {
    const { state, balance } = this;
    if (!state.build.spots[t.id]) return;
    const small = balance.salvage;
    const spec = {
      kind: 'dismantle', id: t.id, build: true, tool: null, noise: 'quiet',
      seconds: small.time.small * energyTimeMult(state.needs.energy, balance), energy: small.energy.small,
    };
    this.action = { spec, t, elapsed: 0, duration: spec.seconds };
    this.bus.emit('action-start', { spec, target: t });
    playSfx(this, 'dismantle_wood');
    this.setHeroAnim('attack');
  }

  finishBuildDismantle() {
    const { spec, t } = this.action;
    this.action = null;
    this.hideBar();
    const { state, balance } = this;
    const p = removeObject(state, t.id);
    this.setHeroAnim('idle');
    if (p) {
      const items = dismantleRefund(p, balance);
      const h = state.hero;
      const res = deliver(state, balance, items, { floor: h.floor, x: h.x });
      state.needs.energy = Math.max(0, state.needs.energy - spec.energy);
      this.bus.emit('built-dismantled', { id: p.id, key: t.id });
      const parts = [items.length ? this.itemList(items, '+') : 'Nothing left to salvage.'];
      if (res.stock.length) parts.push('Bag full: some went to the stockpile.');
      if (res.piled.length) parts.push('Bag full: the rest is on the floor.');
      this.toast.show(parts.join('\n'), 2600);
      if (items.length) playSfx(this, 'pickup');
    }
    this.view.refresh();
    this.panel.refresh();
    this.save();
    this.runQueuedTap();
  }

  /** A zombie hit the home barricade (called by Zombies). */
  onBarricadeHit(rt, damage) {
    const { state, balance } = this;
    const r = damageBarricade(state, damage);
    playSfx(this, 'barricade_hit');
    this.view.shakeBarricade();
    this.bus.emit('barricade-hit', { hp: r.hp, zombie: rt.rec.id });
    if (r.broken) {
      playSfx(this, 'barricade_break');
      if (latchBreach(state)) { // -10 once; re-armed by a full repair or a new attack (3b: resetBreachLatch)
        const pen = balance.needs.morale.events.barricadeBreached;
        state.needs.morale = Math.max(0, Math.min(balance.needs.max, state.needs.morale + pen));
      }
      this.toast.show('The barricade broke! Repair it at the workbench.', 3200);
      this.bus.emit('barricade-broken', {});
    }
    this.view.refreshBarricade();
    if (r.broken) this.save();
  }

  // ---------------------------------------------------------------- survivors, tutorial

  /** Once a second: survivor upkeep (and scavengers, only if balance.survivors.scavengeOnline is set; GDD: offline only). */
  tickSurvivors(t, seconds) {
    const { state, balance } = this;
    this.refreshCrewCount();
    if (!this.crewCount) return;
    const events = tickUpkeep(state, balance, t, { offline: false });
    regenSurvivors(state, balance, seconds);
    if (balance.survivors.scavengeOnline) tickScavengers(state, balance, this.tower, this.tables, seconds, this.rng);
    for (const e of events) {
      const name = balance.survivors.roster[e.id]?.name || e.id;
      if (e.died) {
        this.bus.emit('survivor-died', { id: e.id });
        this.view.refresh();
        this.toast.show(`${name} died. Morale ${balance.needs.morale.events.survivorDies}.`, 4000);
      } else {
        this.toast.show(`${name} had no ${e.missed.join(' or ')}${Math.round(e.healthLost) > 0 ? `: -${Math.round(e.healthLost)} health` : ''}. Stock the stockpile.`, 4000);
      }
    }
    if (events.length) { this.crewPanel.refresh(); this.save(); }
  }

  /** Tap on a survivor: the recruit quest talk (not yet home) or the Crew screen (at home). */
  onSurvivorTap(id) {
    const { state, balance } = this;
    this.bus.emit('survivor-tap', { id });
    if (state.survivors[id]?.recruited) { this.openCrew(); return; }
    const name = balance.survivors.roster[id].name;
    const r = interactSurvivor(state, balance, id, now());
    this.dialogue.show({ speaker: name, lines: r.lines, blip: true });
    if (r.gaveBag) {
      this.bus.emit('quest-done', { id });
      this.floatText(state.hero.x, this.heroLineY() - HERO_FEET_TO_HEAD - 20, `+${balance.needs.morale.events.questDone} morale`, CSS.amber);
    }
    if (r.recruited) {
      this.bus.emit('survivor-recruited', { id });
      playSfx(this, 'craft');
    }
    this.refreshCrewCount();
    this.view.refresh();
    this.panel.refresh();
    this.save();
  }

  openCrew() {
    this.menu.close();
    if (this.crewPanel.isOpen) { this.crewPanel.close(); return; }
    this.panel.close();
    this.crewPanel.open();
  }

  /** Rows for the Crew screen. */
  crewRows() {
    const { state, balance } = this;
    const sv = balance.survivors;
    const ev = balance.needs.morale.events;
    const t = now();
    return recruitedAlive(state).map((id) => {
      const def = sv.roster[id];
      const s = state.survivors[id];
      const active = isActive(state, id);
      const wait = talkWaitMs(state, balance, id, t);
      const mult = def.trait?.bandageHealMult;
      return {
        id,
        name: def.name,
        role: def.role,
        health: active ? state.needs.health : s.health,
        maxHealth: balance.needs.max,
        trait: def.trait ? `${def.trait.name}: bandages heal +${Math.round((mult - 1) * 100)}%` : '',
        upkeep: `Meal in ${formatDuration(Math.max(0, (s.upkeepAt ?? t) - t))} (${sv.upkeepFood} food, ${sv.upkeepWater} water)`,
        jobs: jobInfo(balance).map((j) => ({ ...j, on: s.job === j.id })),
        active,
        treat: this.treatState(s),
        talk: { label: wait > 0 ? `Talk again in ${formatDuration(wait)}` : `Talk (+${ev.talkToSurvivor} morale)`, enabled: wait === 0 },
      };
    });
  }

  /** Treat button state: medicine on a survivor, only while the active character is home (GDD 5.7). */
  treatState(s) {
    if (s.health >= this.balance.needs.max) return { label: 'Full health', enabled: false };
    if (!this.inHome()) return { label: 'Treat (go home)', enabled: false };
    if (!treatOptions(this.state, this.balance).length) return { label: 'No medicine', enabled: false };
    return { label: 'Treat', enabled: true };
  }

  /** Pick a medicine item to use on a survivor. */
  onCrewTreat(id) {
    const opts = treatOptions(this.state, this.balance);
    if (!opts.length || !this.inHome()) { this.crewPanel.refresh(); return; }
    const rows = opts.map((o, i) => ({ floor: i, text: `${o.name} +${o.heal} (${o.qty}${o.from === 'stock' ? ', stockpile' : ''})` }));
    this.floorPicker.open('Treat with', rows, (i) => {
      const o = opts[i];
      const r = treatSurvivor(this.state, this.balance, id, o.id, o.from);
      if (r.ok) {
        playSfx(this, 'eat');
        this.toast.show(`${this.balance.survivors.roster[id].name} +${Math.round(r.healed)} health`, 2400);
        this.panel.refresh();
        this.save();
      } else this.deny(r.reason);
      this.crewPanel.refresh();
    });
  }

  onCrewJob(id, job) {
    const r = setJob(this.state, this.balance, id, job);
    if (r.ok) {
      const name = this.balance.survivors.roster[id].name;
      const info = jobInfo(this.balance).find((j) => j.id === r.job);
      this.toast.show(r.job ? `${name} is now a ${info.name} (${info.sub}).` : `${name} has no job.`, 2400);
      this.view.refreshBuilt();
      this.save();
    }
    this.crewPanel.refresh();
  }

  onCrewTalk(id) {
    const r = talkTo(this.state, this.balance, id, now());
    if (r.ok) {
      playSfx(this, 'survivor_blip');
      this.toast.show(`You talk with ${this.balance.survivors.roster[id].name}. +${r.gain} morale`, 2400);
      this.save();
    }
    this.crewPanel.refresh();
  }

  /** World position the tutorial arrow points at for a step, or null. */
  tutorialTarget(step) {
    const t = step.target;
    if (!t) return null;
    const line = floorLineY(this.tower, this.tower.homeFloor);
    if (t.object || t.fixture) {
      const sp = this.view.sprites.get(t.object || `fixture:${t.fixture}`);
      return sp ? { x: sp.cx, y: sp.cy - 52 } : null;
    }
    if (t.door) return { x: this.tower.home.doorX, y: line - 110 };
    if (t.crawler) {
      const z = this.state.zombies['scripted:tutorial_crawler'];
      return z && !z.dead ? { x: z.x, y: line - 100 } : null;
    }
    return null;
  }

  /** ~10 times a second: tutorial progress, the door trigger and the hint bar. */
  updateTutorial() {
    const { state, balance } = this;
    if (!tutorialActive(state)) { if (this.tutorialView.shown) this.tutorialView.update(null, null); return; }
    const story = state.story;
    const h = state.hero;
    if (!story.walked && Math.abs(h.x - this.walkStartX) >= TUTORIAL_WALK_PX) story.walked = true;
    if (!story.doorOpened && shouldOpenDoor(state, h, this.tower.homeFloor, this.tower.home.doorX)) {
      story.doorOpened = true;
      this.bus.emit(TUTORIAL_TRIGGER, {});
      this.toast.show('Something is out there!', 2400);
    }
    if (checkTutorialDone(state, balance, now())) {
      this.tutorialView.update(null, null);
      this.bus.emit('tutorial-done', {});
      this.toast.show('That is the start. Build, scavenge, and hold the tower.', 4000);
      this.save();
      return;
    }
    const step = currentStep(state);
    this.tutorialView.update(step, step && !this.dead ? this.tutorialTarget(step) : null);
  }

  onSkipTutorial() {
    skipTutorial(this.state, this.balance, now());
    this.tutorialView.update(null, null);
    this.toast.show('Tutorial skipped.', 1800);
    this.save();
  }

  // ---------------------------------------------------------------- debug (?debug)

  /** Add items to the bag (testing). @returns {boolean} everything fit */
  debugGive(id, qty = 1) {
    if (!this.balance.items[id]) return false;
    const left = addItem(this.state.inventory, id, qty, this.balance);
    this.panel.refresh();
    this.save();
    return left === 0;
  }

  /** `?debug&give=molotov:3,kitchen_knife` grants items on load. */
  applyDebugGive() {
    if (!debugOn()) return;
    const params = new URLSearchParams(location.search);
    const give = params.get('give');
    if (!give) return;
    params.delete('give'); // grant once, not again on reload
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
    for (const part of give.split(',')) {
      const [id, qty] = part.split(':');
      this.debugGive(id.trim(), Math.max(1, parseInt(qty, 10) || 1));
    }
  }

  /** Move the hero (testing). */
  debugGoto(floor, x) {
    this.combat.clear();
    this.route.length = 0;
    this.stair = null;
    this.state.hero.floor = floor;
    this.state.hero.x = x;
    this.checkRoomEntry();
    this.placeHero();
    this.jumpCameraToHero();
  }

  /** Toast when the Throw button is tapped. */
  onThrowButton() {
    if (this.sleeping) this.wake();
    const id = this.throwing.tapButton();
    this.toast.show(id ? `${this.balance.items[id].name} armed. Tap inside the circle.` : 'Throw cancelled.', 1800);
  }

  // ---------------------------------------------------------------- frame loop

  update(time, delta) {
    // Game time = real time: measure the frame ourselves (Phaser clamps/smooths `delta` at start and after a stall).
    const realNow = performance.now();
    const dt = Math.min(Math.max((realNow - this.lastFrameAt) / 1000, 0), 0.25);
    this.lastFrameAt = realNow;
    if (this.gameOver) return;
    this.updateAudio();
    this.tickClock();
    this.updateHero(dt);
    this.combat.update(dt);
    this.zombies.update(dt);
    this.throwing.update(dt);
    this.updateAction(dt);
    this.attacks.update(dt);
    this.placeHero();
    this.updateCamera(dt);
    if (time - this.pulseAt > 100) {
      this.pulseAt = time;
      this.view.update(time);
      this.updateTutorial();
      const w = heroWeapon(this.state, this.balance);
      this.hudCombat = { weapon: { id: w.id, name: w.name, uses: w.uses }, canThrow: this.throwing.ids().length > 0 };
    }

    const h = this.state.hero;
    const r = roomAt(this.tower, h.floor, h.x);
    this.hud.update({
      needs: this.state.needs,
      floor: this.stair ? this.stair.to : h.floor,
      canStore: this.canStoreAll() && !this.panel.isOpen && !this.craftPanel.isOpen && !this.popup.isOpen,
      hint: r ? r.apt.name : 'Stairwell',
      weapon: this.hudCombat.weapon,
      canThrow: this.hudCombat.canThrow,
      armed: !!this.throwing.armed,
      crew: this.crewCount > 0,
    });
    const modalBottom = this.craftPanel.isOpen ? this.craftPanel.bottomY : this.panel.isOpen ? this.panel.bottomY : this.crewPanel.isOpen ? this.crewPanel.bottomY : 0;
    this.toast.setY(modalBottom ? modalBottom + TOAST_PANEL_GAP : this.hud.toastY - (this.needPrompt.isOpen ? TOAST_PROMPT_LIFT : 0));
  }
}
