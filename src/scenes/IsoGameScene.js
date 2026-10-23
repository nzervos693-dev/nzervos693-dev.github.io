import Phaser from 'phaser';
import floorsIso from '../../public/data/levels/floors_iso.json';
import lootData from '../../public/data/levels/loot.json';
import { getBalance, offlineCapMs } from '../core/balance.js';
import { getSave, writeSave } from '../core/save.js';
import { now, elapsedInfo } from '../core/clock.js';
import { lifecycle } from '../core/lifecycle.js';
import { loadIsoFloor } from '../iso/loader.js';
import { restoreStructures, snapshotStructures, canClaimFloor, claimFloor, clearedThought, rememberHq, isHqClaimed, isHqTile } from '../gameplay/isoHq.js';
import { mainAction, secondaryAction } from '../gameplay/isoBuild.js';
import {
  buildModeAvailable, selectedPiece, selectPiece, pieceCells, PIECE_ICON, actionSeconds, resultToast, sealsIn,
} from '../gameplay/isoBuildMode.js';
import { isoConfig, depthKey, LAYER, angleDiff, normalizeAngle } from '../iso/projection.js';
import { VisionMap, visionConfig, coneAngle, viewRange, soundRipple } from '../iso/vision.js';
import { IsoCamera, cameraConfig, floorBounds } from '../iso/camera.js';
import {
  createIsoState, normalizeIsoState, applyDoorsToGrid, snapshotDoors, buildIsoTower, homeFrontDoor, updateIsoFloorState,
  isStaleSave, ISO_WORLD,
} from '../gameplay/isoState.js';
import { planWalk, stepWalk, turnToward, bestStandTile, standCandidates, angleTo, WALK } from '../gameplay/isoHero.js';
import { FACING_STEP } from '../iso/loader.js';
import { tickNeeds, applyItem, itemEffect, speedMult } from '../gameplay/needs.js';
import { activeMoodles, moodleKey, moodleAction, moodleHint, makePanic, stepPanic } from '../gameplay/moodles.js';
import { canRun, stepRun, runConfig } from '../gameplay/running.js';
import { stickConfig, stickSide, stickGridDir, stepStickMove, STICK } from '../gameplay/isoStick.js';
import { describeTarget, inspectLine, attackIcon } from '../gameplay/isoButtons.js';
import { doorEdgeRect } from '../gameplay/isoTarget.js';
import { QuickUseController, quickState, autoFill, chooseQuick, carriedEligible, quickCount, throwAim, quickConfig, spendQuick } from '../gameplay/isoQuickUse.js';
import { shoveConfig, inShoveRange, ShoveCooldown } from '../gameplay/isoCombat.js';
import { footstepKey, surfaceForRoom, searchSoundKey } from '../gameplay/isoAudio.js';
import { wearWord, itemWords } from '../gameplay/words.js';
import { BARRICADE_WORDS, barricadeStage, barricadeMaxHp, latchBreach } from '../gameplay/barricade.js';
import { EMPTY_LINES } from '../gameplay/storyText.js';
import { catchUp } from '../gameplay/offline.js';
import { makeAttackHook, dropLostAttackTime } from '../gameplay/attacks.js';
import { makeIsoResolver, syncFrontBarricade } from '../gameplay/isoOffline.js';
import { canSleepIn, setHeart, heartBed } from '../gameplay/isoHeart.js';
import { createMergedStashes, ensureMergedStashes, applyStashesToFloor, stashSections } from '../gameplay/isoStash.js';
import { heroCtx, objState, takeFromPile } from '../gameplay/gameState.js';
import { moveAll, addItem, maxUses } from '../gameplay/inventory.js';
import {
  heroWeapon, equipSlot, unequip, isEquipped, isEquippable, damageHero, swingDamage, spendSwingEnergy, spendWeaponUse,
} from '../gameplay/combat.js';
import { isAware } from '../gameplay/zombies.js';
import { hitSoundKey, isSmallHit } from '../gameplay/hitfx.js';
import { daysSurvived, gameOverStats } from '../gameplay/death.js';
import { listActions, buildSpec, completeAction, heroHasTool } from '../gameplay/actions.js';
import { pastKeepThreshold, spendToolUse, energyTimeMult } from '../gameplay/salvage.js';
import { napAction, completeNap, napConfig } from '../gameplay/nap.js';
import { getSafeArea } from '../core/safeArea.js';
import { reportLines, attackLines } from '../gameplay/report.js';
import {
  recipeRows, useNames, craftCheck, costLines, effectText, performCraft, recipeKind,
} from '../gameplay/crafting.js';
import { tickProducers } from '../gameplay/producers.js';
import { noiseTiles, lightTimeMult, jamHit } from '../gameplay/isoActions.js';
import IsoWorldView, { isoDepth } from './IsoWorldView.js';
import IsoActors from './IsoActors.js';
import IsoInput from './IsoInput.js';
import IsoStickView from './IsoStickView.js';
import IsoTargeting from './IsoTargeting.js';
import ActionButtons from './ActionButtons.js';
import IsoHud from './IsoHud.js';
import IsoThrow from './IsoThrow.js';
import IsoZombies from './IsoZombies.js';
import IsoAttacks from './IsoAttacks.js';
import IsoSoundscape from './IsoSoundscape.js';
import { makeVignette, SoundRipples } from './IsoFx.js';
import InventoryPanel from './InventoryPanel.js';
import Popup from './Popup.js';
import Toast from './Toast.js';
import MoodleView from './MoodleView.js';
import MenuPanel from './MenuPanel.js';
import GameOverPanel from './GameOverPanel.js';
import CraftPanel from './CraftPanel.js';
import { debugOn, skipFrontEnd, attacksOn, exposeScene } from './debug.js';
import { label, COLORS, CSS, DEPTH } from './ui.js';
import { playSfx } from './sfx.js';

const LONG_GAP_MS = 30000;
const SWING_ANIM_MS = 280;
const STEP_SECONDS = 0.45;
const CANT_RUN_COOLDOWN_MS = 20000;
/** Thoughts shown on bumps ("It's stuck.", "The stairs are blocked.") use the normal thought cooldown. */
const THOUGHT_COOLDOWN_MS = 20000;
/** Ignore repeated barricade squeezes this long (the hero is still crossing the same one). */
const SQUEEZE_REPEAT_MS = 1500;
/** How far past the hero's circle the stairs bump probe looks (tiles). */
const STAIRS_PROBE_TILES = 0.15;
/** Footstep tuning (candidates for balance.json): volumes, run rate and run interval factor. */
const STEP_WALK_VOLUME = 0.7;
const STEP_RUN_VOLUME = 1.6;
const STEP_RUN_RATE = 0.85;
const STEP_RUN_INTERVAL_MULT = 0.6;
/** A door is pushed only when the stick points at least this much into it (0-1 of the unit grid vector). */
const DOOR_PUSH_MIN_COMPONENT = 0.35;
const BAR_W = 120;
const TOAST_PANEL_GAP = 45;
const OCCLUSION_EVERY = 0.1;
const BLOCKED_GIVE_UP = 0.6;
const FLOOR = 15;
/** Quick-use plate icon by item type (the item sheet icon is preferred when it exists). */
const QUICK_ICON = { consumable: 'eat', water: 'drink', throwable: 'throw_molotov' };
/** Seconds between button/weapon refreshes that do not depend on an event. */
const PULSE_SECONDS = 0.1;

/**
 * Isometric play scene (Stage A: floor 15 only). Orchestrates the iso core (grid, vision, camera), the
 * views (IsoWorldView, IsoActors), input (IsoInput), zombies (IsoZombies) and the shared systems
 * (needs, inventory, loot, crafting, save).
 *
 * Events on `this.bus`: 'noise' {x, y, radius, level, source} (tile units, radius Infinity = whole floor),
 * 'action-start' / 'action-done' / 'action-cancel', 'door-opened' {id}, 'door-closed' {id}, 'door-broken' {id},
 * 'zombie-killed' {id, type}, 'floor-cleared', 'hero-dead', 'crafted', 'barricade-built', and the attack's 'attack-cue',
 * 'attack-stairwell', 'attack-start', 'attack-end', 'hq-breached', 'structure-broken' {eid, piece}.
 */
export default class IsoGameScene extends Phaser.Scene {
  constructor() { super('IsoGame'); }

  create() {
    const balance = getBalance();
    this.balance = balance;
    this.world = loadIsoFloor(floorsIso, FLOOR, balance);
    this.grid = this.world.grid;
    this.tower = buildIsoTower(this.world);
    this.tables = lootData.tables;
    this.rng = Math.random;
    this.bus = new Phaser.Events.EventEmitter();
    this.iso = isoConfig(balance);
    this.vcfg = visionConfig(balance);

    const save = getSave();
    const t0 = now();
    let state = isStaleSave(save.game) || !save.game?.started ? null : normalizeIsoState(save.game, balance, this.world, t0);
    const fresh = !state;
    if (fresh) state = createIsoState(balance, this.world, t0);
    this.state = state;
    save.game = state;
    restoreStructures(state, this.world, balance); // built / demolished edges first, then door states
    applyStashesToFloor(state, this.world); // the stashes of merged HQ units (GDD 5.19)
    ensureMergedStashes(state, this.world, balance); // a claimed save from before they existed gets them now
    applyDoorsToGrid(state, this.world);
    this.hero = state.hero;

    this.vision = new VisionMap(this.world.width, this.world.height);
    if (fresh) {
      const r = this.world.home.unitRect;
      this.vision.markSeenRect(r[0], r[1], r[2], r[3]);
    } else this.vision.deserialize(state.seen[FLOOR]);
    this.lightAt = (x, y) => this.world.light[y * this.world.width + x] ?? 'dim';
    this.visView = { x: 0, y: 0, facing: 0, lightAt: this.lightAt, lightVersion: 0, panicLevel: 0, tiredLevel: 0 };

    this.walk = null;
    this.pending = null;
    this.action = null;
    this.sleeping = false;
    this.run = null;
    this.stick = { down: false, active: false, turn: false, creep: false, run: false, ux: 0, uy: 0, mag: 0 };
    this.stickDir = { x: 0, y: 0, angle: 0 };
    this.stickEngaged = false;
    this.doorPush = { door: null, t: 0 };
    this.thoughtAt = {};
    this.squeezeAt = -Infinity;
    this.lastHomeTap = 0;
    this.faceTarget = null;
    this.stepIdx = -1;
    this.weaponNow = null;
    this.buttonsDirty = true;
    this.btnT = 0;
    this.slots = { main: null, secondary: null };
    this.confirm = { id: null, t: 0 };
    this.placing = null;
    this.buildMode = false;
    this.buildCtx = { balance, structures: this.world.structures, state };
    this.nap = { enabled: false };
    this.vault = null;
    this.camHero = { x: 0, y: 0 };
    this.tFlags = { held: false, locked: false, suppress: false };
    this.btnView = { main: null, secondary: null, attack: { icon: 'attack_fists' }, quick: { itemId: null, icon: null, count: 0, armed: false }, cd: { main: 0, secondary: 0, attack: 0, quick: 0 }, sleeping: false };
    this.panic = makePanic();
    this.tiredLevel = 0;
    this.moodleKey = '';
    this.dead = false;
    this.gameOver = false;
    this.swingUntil = 0;
    this.stepT = 0;
    this.stepFlip = false;
    this.pulseAt = 0;
    this.occT = 0;
    this.blockedT = 0;
    this.pauseT = 0;
    this.combat = { cd: 0, cdMax: 0.4, buffered: false, held: 0, lastHit: {} };
    this.shoveCfg = shoveConfig(balance);
    this.shoveCd = new ShoveCooldown(this.shoveCfg);
    this.quick = new QuickUseController(balance);
    this.aim = { x: 0, y: 0 };
    this.lastFrameAt = performance.now();
    this.heroSp = { x: 0, y: 0 };
    this.occActors = Array.from({ length: 10 }, () => ({ x: 0, y: 0, depth: 0 }));

    this.cameras.main.setBackgroundColor('#0b0c0e');
    this.camera = new IsoCamera(cameraConfig(balance), this.iso, floorBounds(this.iso, this.world.width, this.world.height, balance.controls.cameraIsoEdgePadPx));
    this.view = new IsoWorldView(this, { floor: this.world, state, balance, vision: this.vision, iso: this.iso });
    this.actors = new IsoActors(this, { iso: this.iso, balance, vision: this.vision, worldView: this.view });
    this.actors.createHero(this.hero);
    this.zzz = label(this, 0, 0, 'Zzz', 30, CSS.text, false).setDepth(920).setVisible(false);
    this.barBg = this.add.rectangle(0, 0, BAR_W + 8, 22, COLORS.ink).setDepth(921).setVisible(false);
    this.barFill = this.add.rectangle(0, 0, BAR_W, 14, COLORS.amber).setOrigin(0, 0.5).setDepth(922).setVisible(false);
    this.napFade = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 1).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.menu - 1).setAlpha(0).setVisible(false);
    this.vignette = makeVignette(this, balance.vision.vignette);
    this.ripples = new SoundRipples(this, this.vcfg.soundRipple);

    this.hud = new IsoHud(this, balance, {
      home: () => this.onHomeButton(),
      bag: () => { this.cancelPlacement(); this.toggleBag(); },
      workbench: () => { this.cancelPlacement(); this.moodles.closeCard(); this.craftPanel.isOpen ? this.craftPanel.close() : this.craftPanel.open(); },
      survivors: () => this.toast.show('Nobody else is here yet.', 1600),
      build: () => this.toggleBuildMode(),
      menu: () => { this.cancelPlacement(); this.moodles.closeCard(); this.menuPanel.isOpen ? this.menuPanel.close() : this.menuPanel.open(); },
    });
    this.toast = new Toast(this, this.hud.toastY);
    this.popup = new Popup(this);
    this.panel = new InventoryPanel(this, {
      bag: () => this.state.inventory,
      stock: () => this.state.stockpile,
      describe: (slot, tab) => this.describeItem(slot, tab),
      onUse: (tab, i) => this.useItem(tab, i),
      onStore: (i) => this.moveOne('bag', i),
      onTake: (i) => this.moveOne('stock', i),
      onClose: () => { this.buttonsDirty = true; },
      stockLabel: () => (isHqClaimed(this.state) ? 'HQ' : 'Stockpile'),
      sections: () => stashSections(this.state).map((e) => ({ offset: e.offset, slots: e.slots, name: this.world.units.find((u) => u.id === e.unit)?.name ?? 'Stash' })),
      badge: (slot, i, tab) => (tab === 'bag' && isEquipped(this.state, i) ? 'E' : slot.uses != null ? ' ' : null),
    });
    this.craftPanel = new CraftPanel(this, { rows: () => this.craftRows(), onCraft: (id) => this.onCraftTap(id), onClose: () => {} });
    this.stickSide = stickSide(getSave().settings);
    this.menuPanel = new MenuPanel(this, {
      day: () => daysSurvived(this.state, now()) + 1,
      stickSide: () => this.stickSide,
      onToggleStickSide: () => {
        this.stickSide = this.stickSide === 'right' ? 'left' : 'right';
        getSave().settings.joystickSide = this.stickSide;
        writeSave();
        this.buttons?.setSide(this.stickSide);
      },
    });
    this.gameOverPanel = new GameOverPanel(this);
    this.soundscape = new IsoSoundscape(this);
    this.zombies = new IsoZombies(this);
    this.attacks = new IsoAttacks(this);
    this.attacks.enabled = attacksOn(); // plain ?debug turns attacks off (GDD 11.3 is for real games)
    this.resolver = makeIsoResolver(this.world);
    this.moodles = new MoodleView(this, balance, {
      getAction: (id) => moodleAction(id, this.state, this.balance, this.inHome()),
      hint: (id) => moodleHint(id),
      onAction: (id) => this.onMoodleAction(id),
    });
    this.bus.on('noise', (n) => this.zombies.onNoise(n));
    this.bus.on('floor-cleared', () => this.checkClearedThought());
    this.bus.on('attack-stairwell', () => { if (this.action?.spec.kind === 'nap') { this.cancelAction(); this.toast.show('Nap interrupted!', 1600); } }); // GDD 5.2: the banging wakes a napper
    this.stickCfg = stickConfig(balance);
    this.stickView = new IsoStickView(this, this.stickCfg);
    this.stickEnv = { grid: this.grid, isBlocked: this.zombieAt, radius: this.stickCfg.collisionRadiusTiles, doorMin: DOOR_PUSH_MIN_COMPONENT, maxStep: this.stickCfg.maxSubstepTiles,
      assistTiles: this.stickCfg.doorwayAssistTiles, assistMinCos: Math.cos((this.stickCfg.doorwayAssistMaxAngleDegrees * Math.PI) / 180) };
    const bcfg = balance.controls.buttons;
    this.buttons = new ActionButtons(this, balance, {
      onMain: () => this.pressSlot('main'),
      onSecondary: () => this.pressSlot('secondary'),
      onAttack: () => this.attackPress(false),
      onQuick: () => this.onQuickTap(),
      onHold: (name) => this.attackPress(true, name),
      onPick: (id) => this.onQuickPick(id),
      pickerItems: () => this.pickerItems(),
      onNothing: () => this.toast.show('Nothing to keep at hand.', 1800),
      longPressSeconds: quickConfig(balance).longPressSeconds,
      holdSeconds: this.stickCfg.tapMaxSeconds,
    });
    this.buttons.setSide(this.stickSide);
    this.targeting = new IsoTargeting(this);
    this.throw = new IsoThrow(this);
    this.isoInput = new IsoInput(this, {
      stick: this.stickCfg,
      bottomLimit: () => this.scale.height - getSafeArea().bottom,
      side: () => this.stickSide,
      canGesture: () => !this.gameOver && !this.dead && !this.anyPanelOpen(),
      onStick: (v, s, first) => this.onStick(v, s, first),
      onStickEnd: () => this.onStickEnd(),
      onDoubleTap: () => this.turnAround(),
    });
    this.setupLifecycle();

    this.syncBarricadeToDoor();
    this.snapCamera();
    this.applyCamera();
    this.updateVision(true);
    this.view.refreshObjects();
    this.view.refreshPiles();
    this.refreshMoodles();
    this.autosaveEvent = this.time.addEvent({ delay: balance.time.autosaveSeconds * 1000, loop: true, callback: () => this.save() });

    if (fresh) {
      if (!state.thoughts.darkInHere) { state.thoughts.darkInHere = true; this.time.delayedCall(700, () => this.toast.show('Dark in here.', 2600)); }
      this.save();
    } else {
      const info = elapsedInfo(state.times.lastTickAt, now(), offlineCapMs(balance));
      this.applyOffline(info.elapsedMs, info.capped);
    }
    if (state.flags.heroDead) this.showGameOver();
    this.time.delayedCall(1500, () => this.checkClearedThought()); // an already Cleared save: the thought fires once, here
    if (debugOn()) window.__floor15 = this;
    exposeScene(this);
  }

  // ---------------------------------------------------------------- setup helpers

  anyPanelOpen() {
    return this.popup.isOpen || this.panel.isOpen || this.craftPanel.isOpen || this.menuPanel.isOpen;
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
      this.soundscape.stopAll();
      this.targeting?.destroy();
      this.zombies?.destroy();
      this.attacks?.destroy();
      this.view?.destroy();
      this.bus.removeAllListeners();
      this.game.events.off('floor15:hide', onHide);
      lifecycle.off('resume', onResume);
    });
  }

  heroTile() { return { x: Math.floor(this.hero.x), y: Math.floor(this.hero.y) }; }

  heroLight() { return this.lightAt(Math.floor(this.hero.x), Math.floor(this.hero.y)); }

  heroInCorridor() {
    const r = this.world.roomAt(Math.floor(this.hero.x), Math.floor(this.hero.y));
    const t = r >= 0 ? this.world.rooms[r].type : '';
    return t === 'corridor' || t === 'stairwell';
  }

  /** Is the hero inside the start flat (stash access, Store all)? */
  inHome() {
    const r = this.world.home.unitRect;
    const x = Math.floor(this.hero.x);
    const y = Math.floor(this.hero.y);
    if (x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3]) return true;
    return isHqClaimed(this.state) && isHqTile(this.world.structures, x, y); // the claimed HQ is one home (GDD 5.19)
  }

  zombieAt = (x, y) => this.zombies.at(x, y) !== null;

  // ---------------------------------------------------------------- vision and camera

  updateVision(force = false) {
    const v = this.visView;
    v.x = this.hero.x;
    v.y = this.hero.y;
    v.facing = this.hero.facing;
    v.panicLevel = this.panic.level;
    v.tiredLevel = this.tiredLevel;
    const ran = this.vision.maybeUpdate(this.grid, this.vcfg, v, performance.now(), force);
    if (ran || this.view.lastRevision !== this.vision.revision) {
      this.view.onVision(this.heroTile());
      this.view.refreshObjects();
    }
  }

  applyCamera() {
    const cam = this.cameras.main;
    cam.setScroll(Math.round(this.camera.x - this.scale.width / 2), Math.round(this.camera.y - this.scale.height / 2));
  }

  // ---------------------------------------------------------------- input

  /** Joystick finger moved (or went down: `first`). */
  onStick(v, s, first) {
    const st = this.stick;
    if (first) {
      st.down = true;
      this.stickView.show(s.ox, s.oy);
      this.moodles.closeCard();
    }
    this.stickView.setKnob(v.x, v.y, v.run ? 2 : v.creep || v.turn ? 0 : 1);
    st.active = v.active;
    st.turn = v.turn;
    st.creep = v.creep;
    st.run = v.run;
    st.mag = v.mag;
    st.ux = v.ux;
    st.uy = v.uy;
  }

  onStickEnd() {
    const st = this.stick;
    st.down = false;
    st.active = false;
    st.turn = false;
    st.run = false;
    this.stickView.release();
    this.stickEngaged = false;
    this.doorPush.door = null;
    this.run = null; // release: the hero stops at once and keeps his facing
  }

  /** Double tap in the stick zone: turn around (180 degrees in controls.turnAroundSeconds). Silent; never cancels an action. */
  turnAround() {
    if (this.sleeping || this.dead || this.gameOver) return;
    this.faceTarget = { angle: normalizeAngle(this.hero.facing + 180), rate: 180 / this.balance.controls.turnAroundSeconds };
  }

  /** Snap the camera to the hero (hero at the anchor). */
  snapCamera() {
    const hs = this.actors.toScreen(this.hero.x, this.hero.y, { x: 0, y: 0 });
    this.camera.snapTo(hs.x, hs.y + this.anchorDy());
  }

  /**
   * The camera keeps the hero above the control band (camera.heroScreenYFrac, GDD 2): the camera centre sits
   * (0.5 - frac) x the visible (safe-area) height below him.
   */
  anchorDy() {
    const sa = getSafeArea();
    const visible = this.scale.height - sa.top - sa.bottom;
    return (0.5 - (this.balance.camera?.heroScreenYFrac ?? 0.5)) * visible;
  }

  // ---------------------------------------------------------------- walking

  /** Plan a walk to a tile; `pending` runs on arrival. @returns {boolean} a path exists */
  goToTile(tx, ty, pending = null, run = false) {
    const plan = planWalk(this.grid, this.hero, { x: tx, y: ty }, { run, balance: this.balance, isBlocked: this.zombieAt });
    if (!plan) return false;
    if (run && !canRun(this.state.needs.energy, this.balance)) { plan.run = false; this.cantRun(); }
    this.walk = plan;
    this.pending = pending;
    this.run = plan.run ? { noiseT: undefined } : null;
    this.faceTarget = null;
    this.camera.resumeFollow();
    return true;
  }

  /** Walk to the best tile to stand on to use something, then run `pending` (see onArrive). */
  goToStand(tiles, front, pending, extraCandidates = null) {
    let cands = standCandidates(this.grid, tiles, front);
    if (extraCandidates) cands = [...extraCandidates, ...cands];
    const from = this.heroTile();
    const best = bestStandTile(this.grid, from, cands, this.balance, this.zombieAt);
    if (!best) return false;
    pending.stand = best;
    return this.goToTile(best.x, best.y, pending, false);
  }

  /** Walk to a stand tile next to an object (the front tile first); `pending` runs on arrival (Home only). */
  goToObject(o, pending) {
    pending.obj = o;
    const step = FACING_STEP[o.facing] ?? [0, 1];
    const own = o.mounted ? o.tiles.map((t) => ({ x: t.x, y: t.y })) : null; // mounted objects leave their tile free
    if (!this.goToStand(o.tiles, step, pending, own)) this.toast.show('Cannot get there.', 1200);
  }

  cantRun() {
    const t = performance.now();
    if (t - (this.cantRunAt ?? -Infinity) < CANT_RUN_COOLDOWN_MS) return;
    this.cantRunAt = t;
    this.toast.show("I can't run anymore.", 1800);
  }

  /** Footstep on the surface of the hero's room (audio.footstepSurfaceByRoom), three variations, small pitch spread. */
  footstep(dt, running, creeping = false) {
    this.stepT += dt;
    if (this.stepT < (running ? STEP_SECONDS * STEP_RUN_INTERVAL_MULT : creeping ? this.balance.audio.footstepCreepIntervalSeconds : (this.balance.audio.footstepWalkIntervalSeconds ?? STEP_SECONDS))) return;
    this.stepT = 0;
    const room = this.world.roomAt(Math.floor(this.hero.x), Math.floor(this.hero.y));
    const surface = surfaceForRoom(room >= 0 ? this.world.rooms[room].type : '', this.balance);
    const k = footstepKey(surface, this.rng, this.stepIdx);
    this.stepIdx = k.index;
    const [lo, hi] = this.balance.audio.footstepPitchRange ?? [0.95, 1.05];
    const pitch = lo + this.rng() * (hi - lo);
    const opts = running ? { volume: STEP_RUN_VOLUME, rate: STEP_RUN_RATE * pitch } : { volume: creeping ? STEP_WALK_VOLUME * this.balance.audio.footstepCreepVolumeMult : STEP_WALK_VOLUME, rate: pitch };
    playSfx(this, k.key, opts);
  }

  updateHero(dt) {
    const h = this.hero;
    const b = this.balance;
    this.moving = false;
    this.creeping = false;
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    if (this.vault) { this.updateVault(dt); return; }
    if (this.faceTarget && !this.walk) {
      h.facing = turnToward(h.facing, this.faceTarget.angle, this.faceTarget.rate, dt);
      if (Math.abs(angleDiff(h.facing, this.faceTarget.angle)) < 0.5) this.faceTarget = null;
    }
    if (!this.stick.active) this.stickEngaged = false;
    else if (this.stick.turn) { this.stickTurn(dt); return; }
    else if (this.beginStickMove()) { this.updateStick(dt); return; }
    if (this.sleeping || this.action) return;
    const w = this.walk;
    if (!w) { this.run = null; return; }
    const tps = (this.run ? b.hero.runTilesPerSecond : b.hero.walkTilesPerSecond) * speedMult(this.state.needs, b);
    const env = this.walkEnv || (this.walkEnv = { grid: this.grid, speed: 0, turnRate: b.controls.walkTurnDegreesPerSecond, isBlocked: this.zombieAt });
    env.speed = tps;
    const r = stepWalk(h, w, dt, env);
    this.moving = true;
    if (this.run) this.stepRunning(dt);
    this.footstep(dt, !!this.run);
    switch (r.code) {
      case WALK.MOVING: this.blockedT = 0; break;
      case WALK.ARRIVED: this.walk = null; this.moving = false; this.onArrive(); break;
      case WALK.OPEN_DOOR: this.moving = false; this.beginDoorOpen(r.door, true); break;
      case WALK.LOCKED: this.moving = false; this.onLockedDoor(r.door); break;
      case WALK.SQUEEZE:
        if (r.door.state === 'closed') this.grid.setDoorState(r.door, 'open');
        this.pauseT = b.doors.barricadeSqueezeSeconds;
        break;
      case WALK.BLOCKED:
        this.moving = false;
        this.blockedT += dt;
        if (this.blockedT > BLOCKED_GIVE_UP) { this.walk = null; this.pending = null; this.blockedT = 0; }
        break;
      default:
    }
  }

  /**
   * The hero pushes into a broken window: he vaults over it in structures.brokenWindowVaultSeconds.hero (1.0 s), a straight
   * slide to the middle of the tile across (GDD 5.20). Nothing else moves him meanwhile.
   */
  beginVault(dx, dy) {
    if (this.vault || this.action) return;
    const h = this.hero;
    const tx = Math.floor(h.x) + dx;
    const ty = Math.floor(h.y) + dy;
    if (!this.grid.isWalkable(tx, ty) || this.zombieAt(tx, ty)) return;
    this.vault = { t: 0, dur: this.balance.structures.brokenWindowVaultSeconds.hero, x0: h.x, y0: h.y, x1: tx + 0.5, y1: ty + 0.5 };
    h.facing = angleTo(h.x, h.y, tx + 0.5, ty + 0.5);
    this.walk = null;
    this.run = null;
    playSfx(this, 'glass_tinkle', { volume: 0.6 });
  }

  updateVault(dt) {
    const v = this.vault;
    v.t += dt;
    const k = Math.min(1, v.t / v.dur);
    this.hero.x = v.x0 + (v.x1 - v.x0) * k;
    this.hero.y = v.y0 + (v.y1 - v.y0) * k;
    this.moving = true;
    if (k >= 1) this.vault = null;
  }

  /**
   * Stick in the turn band (GDD 4, d 0.15 to below turnOnlyThreshold): turn on the spot toward the stick
   * direction, no step, silent. Cancels a Home auto-walk and wakes a sleeper or napper; never cancels a
   * timed action (he keeps facing his target).
   */
  stickTurn(dt) {
    if (!this.stickEngaged) { this.walk = null; this.pending = null; this.stickEngaged = true; }
    if (this.sleeping) { this.wake(); return; }
    if (this.action) {
      if (this.action.spec.kind === 'nap') this.cancelAction();
      return;
    }
    this.run = null;
    const dir = stickGridDir(this.iso, this.stick.ux, this.stick.uy, this.stickDir);
    this.hero.facing = turnToward(this.hero.facing, dir.angle, this.balance.controls.walkTurnDegreesPerSecond, dt);
  }

  /**
   * The stick is pushed: cancel auto-walks (once per gesture), wake / drop a cancellable action.
   * @returns {boolean} the hero may move this frame (false while an uncancellable action runs, e.g. a
   * door opening or a search past half way; he moves on when it finishes if the stick is still held).
   */
  beginStickMove() {
    if (!this.stickEngaged) {
      this.walk = null;
      this.pending = null;
      this.stickEngaged = true;
    }
    if (this.sleeping) { this.wake(); return false; }
    const a = this.action;
    if (a) {
      if (a.spec.kind === 'door-open') return false;
      if (a.spec.kind === 'nap') { this.cancelAction(); return false; }
      if (pastKeepThreshold(a.elapsed / a.duration, this.balance)) return false;
      this.cancelAction();
    }
    return true;
  }

  /** Continuous joystick movement: walk, or run when pushed far (energy rules as for a run). */
  updateStick(dt) {
    const b = this.balance;
    const st = this.stick;
    const h = this.hero;
    let running = st.run;
    if (running && !canRun(this.state.needs.energy, b)) { running = false; this.cantRun(); }
    if (running && !this.run) this.run = { noiseT: undefined };
    if (!running) this.run = null;
    const dir = stickGridDir(this.iso, st.ux, st.uy, this.stickDir);
    h.facing = turnToward(h.facing, dir.angle, b.controls.walkTurnDegreesPerSecond, dt);
    this.creeping = !this.run && st.creep;
    const gait = this.run ? b.hero.runTilesPerSecond : b.hero.walkTilesPerSecond * (st.creep ? this.stickCfg.creepSpeedMult : 1);
    const tps = gait * speedMult(this.state.needs, b);
    const px = h.x;
    const py = h.y;
    const r = stepStickMove(h, dir.x, dir.y, tps * dt, this.stickEnv);
    this.moving = r.moved;
    // blocked = moved less than half the intended step (a tiny sideways slide along the stairs still counts)
    const slid = Math.hypot(h.x - px, h.y - py) < 0.5 * tps * dt;
    if (slid && r.code === STICK.MOVING && this.bumpedStairs(dir.x, dir.y)) this.thought('stairs', 'The stairs are blocked.');
    if (this.run && r.moved) this.stepRunning(dt); // run noise and energy only while actually moving
    if (r.moved) this.footstep(dt, !!this.run, st.creep);
    const push = this.doorPush;
    if (r.code !== STICK.DOOR) push.door = null;
    switch (r.code) {
      case STICK.DOOR:
        this.moving = false;
        if (push.door !== r.door) { push.door = r.door; push.t = 0; }
        push.t += dt;
        // GDD 4: a push of doorPushSeconds opens it; running into it bursts it open at once
        if (this.run) { push.door = null; this.applyDoorOpen(r.door); } // bursts open at once, noisily
        else if (push.t >= this.stickCfg.doorPushSeconds) { push.door = null; this.beginDoorOpen(r.door, true); }
        break;
      case STICK.LOCKED:
        this.moving = false;
        this.onLockedDoor(r.door, true);
        break;
      case STICK.CLIMB:
        this.beginVault(r.dx, r.dy);
        break;
      case STICK.SQUEEZE:
        if (performance.now() - this.squeezeAt < SQUEEZE_REPEAT_MS) break; // still crossing the same barricade
        this.squeezeAt = performance.now();
        if (r.door.state === 'closed') this.grid.setDoorState(r.door, 'open');
        this.pauseT = b.doors.barricadeSqueezeSeconds;
        break;
      default:
    }
  }

  stepRunning(dt) {
    const r = stepRun(this.run, this.state.needs, dt, this.balance);
    if (r.noise) this.noise(this.hero.x, this.hero.y, 'noisy', this.balance.hero.runNoiseRadiusTiles, 'run');
    if (r.stopped) { this.run = null; if (this.walk) this.walk.run = false; this.cantRun(); }
  }

  /** A sound on the floor (tile units). Zombies hear it through walls. */
  noise(x, y, level, radius, source) {
    if (!radius) return;
    this.bus.emit('noise', { x, y, level, radius, source });
  }

  // ---------------------------------------------------------------- target and action buttons

  /** The weapon in hand (cached; refreshWeapon() after equip, wear or break). */
  currentWeapon() { return this.weaponNow ?? this.refreshWeapon(); }

  refreshWeapon() {
    this.weaponNow = heroWeapon(this.state, this.balance);
    this.buttonsDirty = true;
    return this.weaponNow;
  }

  objectDef(o) { return this.balance.objects[o.objectId]; }

  /** Can the hero sleep / nap in this bed? The start flat's bed, and after the HQ claim any bed in the HQ (GDD 5.19). */
  isHomeBed(o) { return canSleepIn(this.world, this.state, this.balance, o); }

  /**
   * Is something in the doorway (the door cannot close)? A zombie whose centre is on one of the door's two
   * tiles, or the hero if his circle reaches the door's edge (standing beside it is fine: GDD note in the report).
   */
  doorOccupied(door) {
    const [a, b] = this.grid.doorTiles(door);
    if (this.zombies.at(a.x, a.y) || this.zombies.at(b.x, b.y)) return true;
    const r = doorEdgeRect(door);
    const px = Math.min(Math.max(this.hero.x, r.x0), r.x1);
    const py = Math.min(Math.max(this.hero.y, r.y0), r.y1);
    return Math.hypot(this.hero.x - px, this.hero.y - py) < this.stickCfg.collisionRadiusTiles;
  }

  /** Recompute what Main and Secondary show for the current target. */
  refreshSlots() {
    const c = this.slotCtx || (this.slotCtx = {
      balance: this.balance, state: this.state, hasTool: (id) => heroHasTool(this.state, id), doorOccupied: (d) => this.doorOccupied(d),
      isHomeBed: (o) => this.isHomeBed(o), nap: { enabled: false }, canStoreAll: false, weapon: null, shove: { ready: false, inRange: false },
    });
    const t = this.targeting.target;
    c.weapon = this.currentWeapon();
    c.canStoreAll = this.canStoreAll();
    c.buildCtx = this.buildCtx;
    c.selectedPiece = selectedPiece(this.state, this.balance);
    if (t?.kind === 'claim') c.claim = canClaimFloor(this.state, this.balance, FLOOR);
    if (t?.kind === 'object' && this.isHomeBed(t.obj)) c.nap = this.napButton();
    if (t?.kind === 'zombie') {
      c.shove.ready = this.shoveCd.ready;
      c.shove.inRange = !!t.rt && inShoveRange(this.hero, t.rt.rec, this.shoveCfg);
    }
    const next = describeTarget(t, c);
    this.slots = next;
  }

  /** Tap on Main or Secondary: acts on the CURRENT target (a tap during an icon fade acts on the new one). */
  pressSlot(which) {
    if (this.gameOver || this.dead) return;
    this.quick.disarm();
    this.moodles.closeCard();
    if (this.sleeping) { this.wake(); return; }
    if (this.action) return; // Main and Secondary do nothing during a timed action
    this.refreshSlots();
    const slot = this.slots[which];
    const t = this.targeting.target;
    if (!slot || !t) return;
    if (!slot.enabled) { if (slot.reason) this.toast.show(slot.reason, 1800); return; }
    if (slot.confirm && !this.confirmTap(slot.id)) return;
    this.perform(slot.id, t, slot);
    this.buttonsDirty = true;
  }

  /** Confirm taps (GDD 4): a second tap on the same action within controls.buttons.confirmSeconds. */
  confirmTap(id, message = 'Tap again to leave this place.') {
    const now = performance.now();
    if (this.confirm.id === id && now - this.confirm.t < this.balance.controls.buttons.confirmSeconds * 1000) { this.confirm.id = null; return true; }
    this.confirm.id = id;
    this.confirm.t = now;
    this.toast.show(message, 1800);
    return false;
  }

  /** Run an action by id on a target (see gameplay/isoButtons.js). */
  perform(id, t, slot = null) {
    switch (id) {
      case 'edgeMain': case 'edgeSecondary': this.pressEdge(slot, t.edge); break;
      case 'claim': this.beginClaim(); break;
      case 'attack': this.attackPress(false); break;
      case 'shove': this.shovePress(t); break;
      case 'open': this.openPress(t.door); break;
      case 'close': this.closeDoor(t.door); break;
      case 'force': this.forceDoor(t.door); break;
      case 'dismantle': if (t.kind === 'door') this.beginDoorDismantle(t.door); else this.startObjectAction(t.obj, 'dismantle'); break;
      case 'search': case 'take': case 'drain': this.startObjectAction(t.obj, id); break;
      case 'sleep': this.faceObject(t.obj); this.markHeart(t.obj); this.startSleep(); break;
      case 'nap': this.faceObject(t.obj); this.startNap(t.obj); break;
      case 'craft': this.craftPanel.open(); break;
      case 'stash': this.panel.open('stock'); break;
      case 'storeAll': this.storeAll(); break;
      case 'pickup': this.takePile(t.pile); break;
      case 'inspect': this.toast.show(inspectLine(t.door, this.state, this.balance), 2200); break;
      case 'place': this.placeNow(); break;
      case 'cancel': this.cancelPlacement(); break;
      default:
    }
  }

  /** Turn to face an object (540 deg/s while its timer already runs). */
  faceObject(o) {
    const cx = o.tile[0] + o.span[0] / 2;
    const cy = o.tile[1] + o.span[1] / 2;
    this.faceTarget = { angle: angleTo(this.hero.x, this.hero.y, cx, cy), rate: this.balance.controls.walkTurnDegreesPerSecond };
  }

  startObjectAction(o, kind) {
    this.faceObject(o);
    this.beginAction(o, kind);
  }

  /** Main on a door: open it, or try the handle of a stuck / barricaded one. */
  openPress(door) {
    if (door.state === 'jammed' || (door.barricade && door.barricade.hp > 0 && !door.barricade.own)) {
      const barricaded = door.barricade?.hp > 0;
      this.toast.show(barricaded ? 'Barricaded from the inside.' : "It's stuck.", 2000);
      this.view.rattleDoor(door);
      playSfx(this, 'door_hit', { volume: 0.5 });
      return;
    }
    if (door.state === 'closed') this.beginDoorOpen(door);
  }

  // ---------------------------------------------------------------- quick-use

  onQuickTap() {
    if (this.gameOver || this.dead) return;
    if (this.sleeping) { this.wake(); return; }
    this.moodles.closeCard();
    if (this.buildMode) { // build mode: Quick-use is the piece selector (GDD 5.19); items can't be used
      if (this.buttons.pickerOpen) this.buttons.closePicker(); else this.buttons.openPicker();
      return;
    }
    if (this.quick.armed) this.updateAim();
    const r = this.quick.tap(this.state, this.balance);
    switch (r.type) {
      case 'toast': this.toast.show(r.reason, 1600); break;
      case 'used': {
        const water = this.balance.consumables?.[r.id]?.water || r.id.endsWith('water');
        const med = this.balance.consumables?.[r.id]?.health && !water;
        playSfx(this, water ? 'drink' : med ? 'pickup' : 'eat');
        this.panel.refresh();
        this.refreshMoodles();
        this.save();
        break;
      }
      case 'throw':
        if (spendQuick(this.state)) {
          this.throw.launch(this.aim.x, this.aim.y);
          this.heroAnimNow = null;
          this.swingUntil = this.time.now + SWING_ANIM_MS;
          playSfx(this, 'swing');
          this.panel.refresh();
          this.save();
        }
        this.throw.hideAim();
        break;
      default:
    }
    this.buttonsDirty = true;
  }

  /** The picker's choice: a type, or null to clear the slot. */
  onQuickPick(id) {
    if (this.buildMode) {
      if (selectPiece(this.state, this.balance, id)) this.save();
      this.buttonsDirty = true;
      return;
    }
    this.quick.disarm();
    chooseQuick(this.state, id);
    this.buttonsDirty = true;
    this.save();
  }

  /** Picker cells: one per carried eligible type plus the empty cell (nothing carried: no picker). */
  pickerItems() {
    if (this.buildMode) return pieceCells(this.state, this.balance);
    const list = carriedEligible(this.state, this.balance);
    return list.length ? [...list.map((e) => ({ id: e.id, count: e.count })), { id: null, count: 0 }] : [];
  }

  /** Aim point of an armed throw, recomputed every frame (walking or turning re-aims). */
  updateAim() {
    const q = quickConfig(this.balance);
    const zs = this.aimZombies || (this.aimZombies = []);
    zs.length = 0;
    for (const rt of this.zombies.list) if (rt.visible && !rt.dying) zs.push(rt.rec);
    const o = this.aimOpts || (this.aimOpts = {
      rangeTiles: this.balance.throw.rangeTiles, coneDegrees: q.throwAimConeDegrees, defaultTiles: q.throwDefaultTiles,
      isWalkable: (x, y) => this.grid.isWalkable(x, y), los: (ax, ay, bx, by) => this.grid.hasLOS(ax, ay, bx, by),
    });
    throwAim(this.hero, zs, o, this.aim);
  }

  // ---------------------------------------------------------------- placement (GDD 5.6)

  /**
   * Crafting a barricade enters placement mode: the panel closes, the hero walks to the front door (the only
   * spot in Stage A), the targeted door shows a ghost barricade; Main = Place (the cost is taken now),
   * Secondary = Cancel (free; opening any panel also cancels).
   */
  startPlacement(recipeId) {
    const door = homeFrontDoor(this.world);
    if (!door) { this.finishCraft(recipeId, {}); return; }
    this.craftPanel.close();
    this.panel.close();
    const spot = { id: `spot:${door.id}`, kind: 'thing', ...doorEdgeRect(door), tiles: this.grid.doorTiles(door), spot: true, target: { kind: 'spot', door, recipeId } };
    this.placing = { recipeId, door };
    this.targeting.setPlacement([spot]);
    this.buttonsDirty = true;
    this.toast.show('Walk to the front door, then Place.', 2600);
  }

  cancelPlacement() {
    if (!this.placing) return;
    this.placing = null;
    this.view.setGhost(null, 0);
    this.targeting.setPlacement(null);
    this.buttonsDirty = true;
  }

  placeNow() {
    const p = this.placing;
    if (!p) return;
    this.cancelPlacement();
    this.finishCraft(p.recipeId, {});
  }

  // ---------------------------------------------------------------- build mode and the HQ (GDD 5.19)

  /** The Build icon: turn build mode on (if possible) or off. Off by itself on sleep, nap, death, placement. */
  toggleBuildMode(force) {
    if (this.gameOver || this.dead) return;
    const on = force ?? !this.buildMode;
    if (on === this.buildMode) return;
    if (on) {
      if (this.sleeping || !buildModeAvailable(this.state, this.balance, this.world.structures, this.hero)) return;
      this.cancelPlacement();
      this.quick.disarm();
      this.throw.hideAim();
    } else this.view.setEdgeGhost(null);
    this.buildMode = on;
    this.targeting.setBuildMode(on);
    this.buttons.closePicker();
    this.confirm.id = null;
    this.buttonsDirty = true;
  }

  /** Per frame: the Build icon shows while build mode is possible; build mode ends when it no longer is. */
  updateBuildMode() {
    const avail = buildModeAvailable(this.state, this.balance, this.world.structures, this.hero);
    if (this.buildMode && (!avail || this.sleeping || this.dead || this.placing || this.action?.spec.kind === 'nap')) this.toggleBuildMode(false);
    this.hud.setBuildState(avail, this.buildMode);
  }

  /** Tap on Main / Secondary with the edge cursor as the target: start the timed action (or explain the refusal). */
  pressEdge(slot, edge) {
    if (!slot?.act) return;
    // check again now (the slot may be up to 0.1 s old): refuse at once if it no longer works
    const selected = selectedPiece(this.state, this.balance);
    const act = slot.id === 'edgeMain' ? mainAction(this.buildCtx, edge, selected) : secondaryAction(this.buildCtx, edge);
    if (!act.result.ok) { this.toast.show(resultToast(act.result, this.balance), 1800); this.buttonsDirty = true; return; }
    if (sealsIn(this.buildCtx, act, this.hero) && !this.confirmTap(`seal:${edge.x}.${edge.y}.${edge.side}`, 'That seals you in.')) return;
    this.beginEdgeAction(act, edge);
  }

  /**
   * Build / upgrade / fit / cover / repair / demolish an edge as a timed action under the section 4 rules: the
   * time is result.seconds x the light multiplier, nothing is paid until it completes (perform() checks again),
   * moving or an interrupt cancels it for free. The noise is made when the hammering starts.
   */
  beginEdgeAction(act, edge) {
    const r = act.result;
    const seconds = actionSeconds(r, this.heroLight(), this.balance);
    const spec = { kind: 'build', id: r.action, seconds, energy: r.energy, tool: r.tool, noise: r.noise };
    this.action = { spec, edgeAct: act, edge: { x: edge.x, y: edge.y, side: edge.side }, elapsed: 0, duration: seconds };
    this.bus.emit('action-start', { spec });
    if (r.noiseTiles) {
      const mx = edge.side === 'N' ? edge.x + 0.5 : edge.x;
      const my = edge.side === 'N' ? edge.y : edge.y + 0.5;
      this.noise(mx, my, r.noise, r.noiseTiles, `build:${edge.x}.${edge.y}.${edge.side}`);
    }
    playSfx(this, this.buildSound(r));
    this.heroAnimNow = 'attack';
  }

  /** Hammering sound: metal and stone for the heavy materials, wood otherwise. */
  buildSound(r) {
    const heavy = ['sheet_metal', 'block', 'reinforced', 'metal', 'plating'];
    const mats = [...(r.salvage || []), ...(r.cost || [])].some((e) => e.id === 'concrete_block' || e.id === 'sheet_metal');
    return mats || heavy.includes(r.toTier) ? 'dismantle_metal' : 'dismantle_wood';
  }

  finishEdgeAction() {
    const { edgeAct } = this.action;
    this.action = null;
    this.hideBar();
    this.heroAnimNow = null;
    const r = edgeAct.perform(); // checks the rules again, then takes the materials and changes the edge
    if (r.ok) {
      this.state.needs.energy = Math.max(0, this.state.needs.energy - (r.energy || 0));
      if (r.toolBroke) this.refreshWeapon();
      autoFill(this.state, this.balance);
      this.view.refreshPiles();
      this.panel.refresh();
      this.updateVision(true);
      this.bus.emit('action-done', { spec: { kind: 'build', id: r.action }, result: r });
    }
    this.buttonsDirty = true;
    this.toast.show(resultToast(r, this.balance), 2400);
    this.save();
  }

  /** Main on the stairwell fire door: Claim the floor (5 s, quiet). */
  beginClaim() {
    const c = canClaimFloor(this.state, this.balance, FLOOR);
    if (!c.ok) { this.toast.show(c.message, 1800); return; }
    const spec = { kind: 'claim', id: 'claim', seconds: c.seconds, energy: 0, tool: null, noise: 'quiet' };
    const gx = this.balance.hq.gateEdges.map((k) => +k.split('.')[0]);
    const gy = +this.balance.hq.gateEdges[0].split('.')[1];
    this.faceTarget = { angle: angleTo(this.hero.x, this.hero.y, (Math.min(...gx) + Math.max(...gx) + 1) / 2, gy), rate: this.balance.controls.walkTurnDegreesPerSecond };
    this.action = { spec, elapsed: 0, duration: spec.seconds };
    this.bus.emit('action-start', { spec });
  }

  finishClaim() {
    this.action = null;
    this.hideBar();
    const r = claimFloor(this.state, this.balance, FLOOR, now());
    if (!r.ok) { this.toast.show(r.message, 1800); return; }
    rememberHq(this.world.structures, this.vision.seen); // every HQ tile becomes Remembered
    for (const m of createMergedStashes(this.state, this.world, this.balance)) { // every merged unit without one gets a stash; they pool (GDD 5.19)
      if (m.object) { this.view.addProp(m.object); this.targeting.addObject(m.object); }
    }
    this.panel.refresh();
    this.updateVision(true);
    this.bus.emit('hq-claimed', {});
    this.buttonsDirty = true;
    this.toast.show(r.thought, 3000);
    this.save();
  }

  /** "This whole floor could be mine." the first time floor 15 is Cleared (also when a Cleared save loads). Fires once. */
  checkClearedThought() {
    const t = clearedThought(this.state, this.balance, FLOOR);
    if (!t) return;
    this.toast.show(t, 3200);
    this.save();
  }

  // ---------------------------------------------------------------- doors

  /** Face the door and open it (0.4 s). `onWalk`: the hero opens it on the way and keeps walking (Home auto-walk). */
  beginDoorOpen(door, onWalk = false) {
    const mid = this.view.doorMid(door);
    this.faceDoor(door);
    const spec = { kind: 'door-open', id: door.id, seconds: this.balance.doors.openSeconds, energy: 0, tool: null, noise: 'quiet' };
    this.action = { spec, door, elapsed: 0, duration: spec.seconds, onWalk, mid };
    this.bus.emit('action-start', { spec });
  }

  faceDoor(door) {
    const [a, b] = this.grid.doorTiles(door);
    const mx = (a.x + b.x) / 2 + 0.5;
    const my = (a.y + b.y) / 2 + 0.5;
    this.hero.facing = angleTo(this.hero.x, this.hero.y, mx, my);
  }

  finishDoorOpen() {
    const { door, onWalk } = this.action;
    this.action = null;
    this.hideBar();
    this.applyDoorOpen(door);
    if (!onWalk) this.walk = null;
  }

  /** The door opens now (after its 0.4 s action, or at once when the hero runs into it). */
  applyDoorOpen(door) {
    this.grid.setDoorState(door, 'open');
    playSfx(this, this.creeping ? 'door_creak' : 'door_open'); // creeping eases it open: the slow hinge
    if (this.run) this.noise(door.x + 0.5, door.y + 0.5, 'noisy', this.balance.doors.runOpenNoiseTiles, 'door-run'); // bursts open
    this.bus.emit('door-opened', { id: door.id });
    this.view.refreshDoors(true);
    this.updateVision(true);
    this.save();
  }

  onLockedDoor(door, bump = false) {
    const p = this.pending;
    this.walk = null;
    if (p?.kind === 'door-force' && p.door === door) { this.onArrive(p); return; }
    this.pending = null;
    const barricaded = door.barricade?.hp > 0;
    if (bump) this.thought(barricaded ? 'barricaded' : 'stuck', barricaded ? 'Barricaded from the inside.' : "It's stuck.");
    else this.toast.show(barricaded ? 'Barricaded from the inside.' : "It's stuck.", 2000);
  }

  /** A thought on a bump: shown once, then not again for THOUGHT_COOLDOWN_MS (per kind). */
  thought(key, text) {
    const t = performance.now();
    if (t - (this.thoughtAt[key] ?? -Infinity) < THOUGHT_COOLDOWN_MS) return;
    this.thoughtAt[key] = t;
    this.toast.show(text, 2000);
  }

  /** Is the hero pushing into a stair flight? (Stage A: stairs are blocked.) */
  bumpedStairs(dirX, dirY) {
    const reach = this.stickCfg.collisionRadiusTiles + STAIRS_PROBE_TILES;
    const tx = Math.floor(this.hero.x + dirX * reach);
    const ty = Math.floor(this.hero.y + dirY * reach);
    const { down, up } = this.world.stairs;
    return down.some((s) => s.x === tx && s.y === ty) || up.some((s) => s.x === tx && s.y === ty);
  }

  closeDoor(door) {
    if (this.doorOccupied(door)) { this.toast.show("Something's in the way.", 1800); return; }
    this.faceDoor(door);
    const spec = { kind: 'door-close', id: door.id, seconds: this.balance.doors.closeSeconds, energy: 0, tool: null, noise: 'quiet' };
    this.action = { spec, door, elapsed: 0, duration: spec.seconds };
  }

  finishDoorClose() {
    const { door } = this.action;
    this.action = null;
    this.hideBar();
    const [a, b] = this.grid.doorTiles(door);
    if (this.zombies.at(a.x, a.y) || this.zombies.at(b.x, b.y)) { this.toast.show("Something's in the way.", 1800); return; }
    this.grid.setDoorState(door, 'closed');
    playSfx(this, 'door_close');
    this.bus.emit('door-closed', { id: door.id });
    this.view.refreshDoors(true);
    this.updateVision(true);
    this.save();
  }

  /** Force a jammed door: a crowbar pops it in 1 s, otherwise queued hits (GDD 5.3). */
  forceDoor(door) {
    if (heroHasTool(this.state, 'crowbar')) {
      const spec = { kind: 'pry', id: door.id, seconds: this.balance.world.jammedDoorCrowbarSeconds, energy: 0, tool: 'crowbar', noise: 'noisy' };
      this.faceDoor(door);
      this.action = { spec, door, elapsed: 0, duration: spec.seconds };
      return;
    }
    // no crowbar: one Noisy hit per tap (three open it)
    if (this.combat.cd > 0) return;
    this.swing(null, door, this.currentWeapon());
  }

  finishPry() {
    const { spec, door } = this.action;
    this.action = null;
    this.hideBar();
    const r = spendToolUse(this.state.inventory, spec.tool);
    this.noise(door.x + 0.5, door.y + 0.5, 'noisy', this.balance.salvage.noiseRadiusTiles, door.id);
    this.grid.setDoorState(door, 'open');
    door.hits = 0;
    this.toast.show(r?.broke ? 'The door pops open. Your crowbar broke.' : 'The door pops open.');
    playSfx(this, 'door_open');
    this.view.refreshDoors(true);
    this.updateVision(true);
    this.save();
  }

  /** One hit on a jammed door (from the swing). */
  applyDoorHit(door) {
    const r = jamHit(door, this.balance.world.jammedDoorHits);
    playSfx(this, 'door_hit');
    this.view.rattleDoor(door);
    this.noise(door.x + 0.5, door.y + 0.5, 'noisy', this.balance.salvage.noiseRadiusTiles, door.id);
    if (r.opened) {
      this.grid.setDoorState(door, 'open');
      this.toast.show('The door gives way.');
      playSfx(this, 'door_open');
      this.view.refreshDoors(true);
      this.updateVision(true);
      this.save();
    } else this.toast.show('The door is stuck.');
  }

  /** A zombie bangs on a door (damage already x0.4). Rattles, makes noise for the ripple, may break it. */
  onZombieDoorHit(rt, hit) {
    const door = hit.door;
    const mid = { x: door.x + 0.5, y: door.y + 0.5 };
    this.view.rattleDoor(door);
    const dist = Math.hypot(mid.x - this.hero.x, mid.y - this.hero.y);
    const audible = dist <= this.balance.audio.doorBangHearTiles;
    let broke = false;
    let sound = 'door_bang'; // a zombie pounding the door from outside
    if (!hit.jammed) {
      // every door takes its damage through the structure model (cover first, per-edge redraw): a generated door breaks open, a
      // fitted one at 0 HP becomes a gap, a barricade stays broken until repaired (GDD 5.20)
      const covered = door.barricade && door.barricade.hp > 0;
      const r = this.world.structures.damageEid(door.edge, hit.damage);
      if (door.id === this.world.home.frontDoor) syncFrontBarricade(this.world, this.state);
      if (covered) {
        broke = r.destroyed;
        sound = broke ? 'barricade_break' : 'barricade_hit';
        if (broke && door.id === this.world.home.frontDoor && latchBreach(this.state)) this.state.needs.morale = Math.max(0, this.state.needs.morale + this.balance.needs.morale.events.barricadeBreached);
      } else if (r.destroyed) {
        broke = true;
        sound = 'barricade_break';
        this.bus.emit('door-broken', { id: door.id });
      }
    }
    if (audible) {
      const vol = Math.max(0.25, 1 - dist / this.balance.audio.doorBangHearTiles);
      const sx = (mid.x - mid.y) - (this.hero.x - this.hero.y);
      const los = this.grid.hasLOS(Math.floor(this.hero.x), Math.floor(this.hero.y), Math.floor(mid.x), Math.floor(mid.y));
      playSfx(this, sound, { volume: vol * (los ? 1 : this.balance.audio.occludedVolumeMult * 1.6), pan: Math.max(-1, Math.min(1, (sx * 48) / this.balance.audio.panWidthPx)) });
    }
    this.soundEvent(door.id, { x: Math.floor(mid.x), y: Math.floor(mid.y) }, 'loud', this.balance.audio.doorBangHearTiles);
    // not forced: a door the hero cannot see keeps the state he last saw
    this.view.refreshDoors();
    if (broke) { this.updateVision(true); this.save(); }
  }

  /**
   * A sound the hero did not make: draws a sound ripple if it is Noisy/Loud, in range and unseen.
   * @param {string} id source id (cooldown per source) @param {{x:number,y:number}} tile
   */
  soundEvent(id, tile, noiseLevel, hearRange) {
    const h = this.hero;
    const light = this.heroLight();
    const hero = { x: h.x, y: h.y, facing: h.facing, coneAngle: coneAngle(this.vcfg, light, this.panic.level), range: viewRange(this.vcfg, light, this.tiredLevel) };
    const info = soundRipple(this.vcfg, hero, { x: tile.x + 0.5, y: tile.y + 0.5 }, { hearRange, noise: noiseLevel, visionMap: this.vision });
    if (info) this.ripples.trigger(id, tile, info);
  }

  // ---------------------------------------------------------------- arrival and actions

  /** The Home auto-walk arrived: face the bed. */
  onArrive(p = this.pending) {
    this.pending = null;
    if (!p) return;
    const o = p.obj;
    if (o) {
      const cx = o.tile[0] + o.span[0] / 2;
      const cy = o.tile[1] + o.span[1] / 2;
      this.hero.facing = angleTo(this.hero.x, this.hero.y, cx, cy);
    }
  }

  beginAction(o, kind) {
    const { state, balance } = this;
    const def = this.objectDef(o);
    const acts = listActions(def, o.id, state, balance);
    const act = acts.find((a) => a.kind === kind);
    if (!act) return;
    if (!act.enabled) { this.toast.show(act.reason || 'Cannot do that'); return; }
    const spec = buildSpec(kind, def, o.id, state, balance);
    spec.seconds *= lightTimeMult(this.heroLight(), balance);
    this.action = { spec, o, elapsed: 0, duration: spec.seconds };
    this.bus.emit('action-start', { spec, target: o });
    const rad = noiseTiles(spec.noise, balance);
    if (spec.kind === 'dismantle' && rad) this.noise(o.tile[0] + 0.5, o.tile[1] + 0.5, spec.noise, rad, o.id);
    playSfx(this, this.actionSound(spec, def, o));
    this.heroAnimNow = kind === 'dismantle' ? 'attack' : 'idle';
    if (spec.seconds <= 0) this.finishAction();
  }

  beginDoorDismantle(door) {
    const o = { id: door.id, objectId: 'interior_door' };
    if (this.state.objects[door.id]?.dismantled) return;
    let def = this.balance.objects.interior_door;
    // a broken door is only splinters: no tool needed, yields doors.brokenYield
    if (door.state === 'broken') def = { ...def, tool: null, noise: 'quiet', yield: this.balance.doors.brokenYield, chanceYield: [] };
    else if (def.tool && !heroHasTool(this.state, def.tool)) { this.toast.show(`Needs ${def.tool}`); return; }
    const spec = buildSpec('dismantle', def, door.id, this.state, this.balance);
    spec.seconds *= lightTimeMult(this.heroLight(), this.balance);
    this.faceDoor(door);
    this.action = { spec, o, door, def, elapsed: 0, duration: spec.seconds };
    this.noise(door.x + 0.5, door.y + 0.5, spec.noise, noiseTiles(spec.noise, this.balance), door.id);
    playSfx(this, 'dismantle_wood');
    this.heroAnimNow = 'attack';
  }

  actionSound(spec, def, o) {
    if (spec.kind === 'search') return searchSoundKey(o.objectId); // cupboard / drawer / cloth
    if (spec.kind === 'drain') return 'drain';
    if (spec.kind === 'take') return 'pickup';
    const y = def.yield || {};
    return (y.metal || 0) > 0 && (y.metal || 0) >= (y.wood || 0) ? 'dismantle_metal' : 'dismantle_wood';
  }

  updateAction(dt) {
    const a = this.action;
    if (!a) return;
    a.elapsed += dt;
    const p = Math.min(1, a.duration > 0 ? a.elapsed / a.duration : 1);
    if (a.spec.kind !== 'door-open' && a.spec.kind !== 'door-close') {
      const y = this.heroSp.y - 112;
      this.barBg.setPosition(this.heroSp.x, y).setVisible(true);
      this.barFill.setPosition(this.heroSp.x - BAR_W / 2, y).setVisible(true);
      this.barFill.width = BAR_W * p;
    }
    if (a.spec.kind === 'nap') this.napFade.setVisible(true).setAlpha(1 - Math.abs(2 * p - 1));
    if (a.elapsed >= a.duration) this.finishAction();
  }

  hideBar() { this.barBg.setVisible(false); this.barFill.setVisible(false); }

  cancelAction() {
    if (!this.action) return;
    this.bus.emit('action-cancel', { spec: this.action.spec });
    this.action = null;
    this.hideBar();
    this.napFade.setVisible(false);
    this.heroAnimNow = null;
  }

  finishAction() {
    const kind = this.action.spec.kind;
    if (kind === 'nap') { this.finishNap(); return; }
    if (kind === 'pry') { this.finishPry(); return; }
    if (kind === 'build') { this.finishEdgeAction(); return; }
    if (kind === 'claim') { this.finishClaim(); return; }
    if (kind === 'door-open') { this.finishDoorOpen(); return; }
    if (kind === 'door-close') { this.finishDoorClose(); return; }
    const { spec, o, door, def: actionDef } = this.action;
    this.action = null;
    this.hideBar();
    this.heroAnimNow = null;
    const def = actionDef ?? this.objectDef(o);
    const unit = this.world.units.find((u) => u.id === o.unit) ?? null;
    const tile = this.heroTile();
    const res = completeAction(this.state, spec, o, def, {
      balance: this.balance, tables: this.tables, rng: this.rng, loc: { floor: FLOOR, x: tile.x, y: tile.y }, apt: unit,
    });
    if (spec.kind === 'dismantle') {
      if (door) this.grid.setDoorState(door, 'broken');
      else if (!o.mounted) for (const t of o.tiles) this.grid.setObstacle(t.x, t.y, false);
    }
    if (updateIsoFloorState(this.state, FLOOR)) this.bus.emit('floor-cleared', { floor: FLOOR });
    this.view.refreshObjects();
    this.view.refreshPiles();
    if (door) { this.view.refreshDoors(true); this.updateVision(true); }
    this.bus.emit('action-done', { spec, result: res, target: o });
    if (res.gained.length) playSfx(this, 'pickup');
    autoFill(this.state, this.balance);
    this.buttonsDirty = true;
    const parts = [];
    if (res.gained.length) parts.push(this.itemList(res.gained, '+'));
    else if (spec.kind === 'search') parts.push(EMPTY_LINES[Math.floor(this.rng() * EMPTY_LINES.length)]);
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

  takePile(pile) {
    const taken = takeFromPile(this.state, pile, this.balance);
    this.view.refreshPiles();
    if (taken.length) { playSfx(this, 'pickup'); this.toast.show(this.itemList(taken, '+')); } else this.toast.show('Bag full. Make room first.');
    this.save();
  }

  // ---------------------------------------------------------------- sleep and nap

  startSleep() {
    this.sleeping = true;
    this.zzz.setVisible(true);
    this.toast.show('Sleeping. Push the stick to wake up.');
  }

  /** The bed just slept or napped in becomes the heart (the attack target, GDD 5.19); the first change thinks "I'll sleep here now." */
  markHeart(o) {
    if (!setHeart(this.world, this.state, this.balance, o)) return;
    this.buttonsDirty = true;
    if (!this.state.thoughts.sleepHere) {
      this.state.thoughts.sleepHere = true;
      this.time.delayedCall(1800, () => this.toast.show("I'll sleep here now.", 2400));
    }
  }

  napButton() { return napAction(this.state, now(), this.balance, { unsafe: this.napUnsafe() }); }

  napUnsafe() {
    return this.attacks.phase === 'fight' || this.zombies.list.some((rt) => !rt.dying && (rt.ai.mode === 'chase' || rt.ai.mode === 'attack'));
  }

  startNap(o) {
    const nb = this.napButton();
    if (!nb.enabled) { this.toast.show(nb.reason); return; }
    const spec = { kind: 'nap', id: 'bed', seconds: napConfig(this.balance).durationSeconds, energy: 0, tool: null, noise: 'quiet' };
    this.action = { spec, o, elapsed: 0, duration: spec.seconds };
    this.bus.emit('action-start', { spec, target: o });
    this.markHeart(o);
  }

  finishNap() {
    this.action = null;
    this.hideBar();
    this.napFade.setVisible(false);
    const r = completeNap(this.state, now(), this.balance);
    this.bus.emit('nap-done', r);
    this.toast.show('You feel a little better.');
    this.save();
  }

  wake() {
    this.sleeping = false;
    this.zzz.setVisible(false);
  }

  // ---------------------------------------------------------------- combat

  weaponRange(w) { return this.balance.combat.weapons[w.id].rangeTiles; }

  inReach(rt, w) {
    const h = this.hero;
    const z = rt.rec;
    if (Math.hypot(z.x - h.x, z.y - h.y) > this.weaponRange(w)) return false;
    return this.grid.hasLOS(Math.floor(h.x), Math.floor(h.y), Math.floor(z.x), Math.floor(z.y));
  }

  /**
   * Attack button, or Main while it shows Attack (GDD 4): swing at the zombie target, or (while an action
   * locks the target) at the best zombie candidate; with no zombie in reach swing at the air. A tap during
   * the weapon cooldown is buffered (one); holding repeats the swing every cooldown.
   * @param {boolean} hold called every frame while the button is held
   */
  attackPress(hold) {
    if (this.gameOver || this.dead) return;
    if (this.sleeping) { if (!hold) this.wake(); return; }
    this.quick.disarm();
    this.moodles.closeCard();
    const a = this.action;
    if (a) {
      // Attack cancels a timed action (past 50% the swing is dropped and the action completes)
      if (a.spec.kind === 'door-open' || (a.duration > 0 && pastKeepThreshold(a.elapsed / a.duration, this.balance))) return;
      this.cancelAction();
    }
    if (this.combat.cd > 0) { if (!hold) this.combat.buffered = true; return; }
    this.doSwing();
  }

  /** Resolve one Attack: zombie, jammed door (same as Force), or air. */
  doSwing() {
    const w = this.currentWeapon();
    const t = this.targeting.target;
    let rt = t?.kind === 'zombie' ? t.rt : null;
    if (!rt) rt = this.targeting.zombieCandidate()?.rt ?? null;
    if (rt && !rt.dying) {
      this.hero.facing = angleTo(this.hero.x, this.hero.y, rt.rec.x, rt.rec.y);
      if (this.inReach(rt, w)) { this.swing(rt, null, w); return; }
    } else if (t?.kind === 'door' && t.door.state === 'jammed') {
      this.faceDoor(t.door);
      this.swing(null, t.door, w);
      return;
    }
    this.swing(null, null, w); // a whoosh at the air in his facing
  }

  /** Secondary on a zombie: push it back, stun it, cancel its wind-up (GDD 5.4). */
  shovePress(t) {
    const rt = t?.rt;
    if (!rt || rt.dying) return;
    if (!this.shoveCd.ready) { this.toast.show('Not yet.', 1200); return; }
    if (!inShoveRange(this.hero, rt.rec, this.shoveCfg)) { this.toast.show('Too far.', 1200); return; }
    this.hero.facing = angleTo(this.hero.x, this.hero.y, rt.rec.x, rt.rec.y);
    this.state.needs.energy = Math.max(0, this.state.needs.energy - this.shoveCfg.energy);
    this.zombies.shove(rt, this.hero);
    this.shoveCd.start();
    this.swingUntil = this.time.now + SWING_ANIM_MS;
  }

  updateCombat(dt) {
    const c = this.combat;
    if (c.cd > 0) c.cd = Math.max(0, c.cd - dt);
    if (c.buffered && c.cd <= 0 && !this.sleeping && !this.action) {
      c.buffered = false;
      this.doSwing();
    }
  }

  /** One swing: `rt` a zombie, `door` a jammed door, neither = the air (energy only: no durability, no noise). */
  swing(rt, door, weapon) {
    const { state, balance } = this;
    const w = weapon || this.currentWeapon();
    this.combat.cd = w.cooldown;
    this.combat.cdMax = w.cooldown;
    spendSwingEnergy(state.needs, balance);
    this.swingUntil = this.time.now + SWING_ANIM_MS;
    playSfx(this, 'swing');
    if (door) this.applyDoorHit(door);
    else if (rt) {
      const dmg = swingDamage(w, state.needs, balance, { unaware: !isAware(rt.ai), panic: this.panic.level });
      playSfx(this, hitSoundKey(w.id, this.combat.lastHit));
      const killed = this.zombies.hurt(rt, dmg, isSmallHit(w.id));
      const wear = spendWeaponUse(state, balance);
      if (wear?.broke) { this.toast.show(`Your ${balance.combat.weapons[wear.id].name.toLowerCase()} broke. Back to fists.`); playSfx(this, 'weapon_break'); }
      if (wear) this.refreshWeapon();
      if (killed || wear?.broke) this.save();
    }
  }

  onZombieAggro(rt, byNoise) {
    // the groan has distance, pan and wall muffling like every zombie voice, and shares the voice cap
    this.soundscape.zombieVoice(rt, this.rng() < 0.5 ? 'zombie_groan_1' : 'zombie_groan_2');
    this.soundEvent(rt.rec.id, { x: Math.floor(rt.rec.x), y: Math.floor(rt.rec.y) }, 'noisy', this.balance.audio.zombieHearRadiusTiles); // a Visible source never ripples
    if (!byNoise) this.interruptAction();
  }

  onZombieBite(rt, damage) {
    if (this.dead || this.gameOver) return;
    // the bite lands only with a clear line (checked by the AI); apply
    const r = damageHero(this.state.needs, damage * 1);
    playSfx(this, 'zombie_hit');
    if (this.sleeping) this.wake();
    this.heroHurt(r.damage);
    this.interruptAction();
    if (r.dead) this.onHeroDeath();
  }

  heroHurt(damage) {
    this.actors.hero.setTintFill(0xff5544);
    this.time.delayedCall(120, () => { if (!this.dead) this.actors.hero.clearTint(); });
    if (damage > 0) playSfx(this, 'hero_hurt');
  }

  interruptAction() {
    const a = this.action;
    if (!a) return;
    if (a.spec.kind === 'door-open' || a.spec.kind === 'door-close') return;
    if (a.spec.kind === 'nap') { this.cancelAction(); this.toast.show('Nap interrupted!', 1600); return; }
    if (a.duration > 0 && pastKeepThreshold(a.elapsed / a.duration, this.balance)) this.finishAction();
    else { this.cancelAction(); this.toast.show('Interrupted!', 1600); }
  }

  onZombieKilled(rt) {
    const z = rt.rec;
    this.state.stats.zombiesKilled += 1;
    this.bus.emit('zombie-killed', { id: z.id, type: z.type });
    this.attacks.onKilled(z);
    if (z.siege) delete this.state.zombies[z.id]; // attackers leave no record; authored zombies stay dead
    if (updateIsoFloorState(this.state, FLOOR)) this.bus.emit('floor-cleared', { floor: FLOOR });
    this.save();
  }

  onHeroDeath() {
    if (this.dead) return;
    this.dead = true;
    this.cancelAction();
    this.vault = null;
    this.walk = null;
    this.wake();
    this.cancelPlacement();
    this.quick.disarm();
    this.throw.hideAim();
    this.buttons.closePicker();
    this.isoInput.cancel();
    const key = `iso_hero_death_${this.actors.heroAnim.split('_').pop()}`;
    if (this.anims.exists(key)) this.actors.hero.clearTint().play(key);
    this.bus.emit('hero-dead', {});
    this.state.flags.heroDead = true;
    this.save();
    this.time.delayedCall(900, () => this.showGameOver());
  }

  showGameOver() {
    this.soundscape.stopAll();
    this.gameOver = true;
    this.dead = true;
    this.panel.close();
    this.popup.close();
    this.craftPanel.close();
    this.gameOverPanel.show(gameOverStats(this.state, now()), () => this.newGame());
  }

  /** New game: clear the game data (settings stay) and restart. */
  newGame() {
    getSave().game = {};
    writeSave();
    this.scene.start(skipFrontEnd() ? 'IsoGame' : 'Intro');
  }

  // ---------------------------------------------------------------- inventory

  toggleBag() {
    if (this.panel.isOpen) this.panel.close(); else this.panel.open('bag');
  }

  canStoreAll() {
    return this.inHome() && this.state.inventory.some((s) => s && this.balance.items[s.id]?.type !== 'quest');
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
    let words;
    if (e) words = itemWords(e);
    else if (slot.uses != null) words = wearWord(slot.uses, maxUses(slot.id, balance) ?? balance.salvage.toolUses);
    else words = it.type === 'material' ? 'Crafting material.' : '';
    const home = this.inHome();
    if (it.type === 'weapon' && isEquippable(slot, balance)) {
      const w = balance.combat.weapons[slot.id];
      const idx = tab === 'bag' ? this.state.inventory.indexOf(slot) : -1;
      const on = idx >= 0 && isEquipped(this.state, idx);
      return { name: it.name, canStore: tab === 'bag' && home, canTake: tab === 'stock' && home, effect: `A weapon. ${wearWord(slot.uses ?? w.durability, w.durability) || 'Never wears out.'}`, canUse: tab === 'bag', useLabel: on ? 'Unequip' : 'Equip' };
    }
    return { name: it.name, effect: words, canUse: !!e && (tab === 'bag' || home), canStore: tab === 'bag' && home && it.type !== 'quest', canTake: tab === 'stock' && home };
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
    if (type === 'throwable') return; // throwables arrive in Stage B
    const r = applyItem(this.state.needs, s.id, this.balance, heroCtx(this.state, this.balance));
    if (!r.ok) { this.toast.show(r.reason); return; }
    s.qty -= 1;
    if (s.qty <= 0) { slots[i] = null; this.panel.selected = -1; }
    playSfx(this, this.balance.consumables?.[s.id]?.water || s.id.endsWith('water') ? 'drink' : 'eat');
    this.panel.refresh();
    this.save();
  }

  onMoodleAction(id) {
    const a = moodleAction(id, this.state, this.balance, this.inHome());
    this.moodles.closeCard();
    if (!a) return;
    const slots = a.from === 'bag' ? this.state.inventory : this.state.stockpile;
    const i = slots.findIndex((x) => x && x.id === a.itemId);
    if (i >= 0) this.useItem(a.from, i);
    this.moodleKey = '';
    this.refreshMoodles();
  }

  // ---------------------------------------------------------------- crafting

  craftRows() {
    const { balance, state, tower } = this;
    return recipeRows(balance).map((r) => {
      if (r.type === 'group') return { type: 'group', name: useNames(balance)[r.use] || r.use };
      const rec = balance.recipes[r.id];
      const costs = costLines(state, rec.cost).map((l) => ({ ...l, name: balance.items[l.id]?.name || l.id }));
      return {
        type: 'recipe',
        entry: {
          id: r.id, name: rec.name, kind: recipeKind(rec), check: craftCheck(state, tower, balance, r.id), costs,
          shortCost: costs.map((l) => `${l.need} ${l.name.toLowerCase()}`).join(', '),
          effect: effectText(balance, r.id), outputId: Object.keys(rec.output || {})[0] || null,
        },
      };
    });
  }

  onCraftTap(id) {
    const check = craftCheck(this.state, this.tower, this.balance, id);
    if (!check.ok) { this.toast.show(check.reason); return; }
    if (check.kind === 'barricade') { this.startPlacement(id); return; } // placement mode: walk to the door, press Place
    this.finishCraft(id, check.kind === 'secure' ? { floor: FLOOR } : {});
    autoFill(this.state, this.balance);
    this.buttonsDirty = true;
  }

  finishCraft(id, target) {
    const { state, tower, balance } = this;
    const tile = this.heroTile();
    const res = performCraft(state, tower, balance, id, { ...target, loc: { floor: FLOOR, x: tile.x, y: tile.y } });
    if (!res.ok) { this.toast.show(res.reason); return; }
    const rec = balance.recipes[id];
    playSfx(this, 'craft');
    let msg = `Made: ${rec.name}`;
    if (res.kind === 'item') {
      msg = `Made: ${this.itemList(res.items)}`;
      if (res.gained.stock.length) msg += '\nBag full: it went to the stockpile.';
      if (res.gained.piled.length) msg += '\nBag and stockpile full: it is on the floor.';
    } else if (res.kind === 'repair') msg = 'You patch up the barricade.';
    else if (res.kind === 'barricade') { msg = `${rec.name} built.`; this.bus.emit('barricade-built', { level: rec.effect.level }); } else if (res.kind === 'secure') msg = 'The floor is sealed.';
    this.syncBarricadeToDoor();
    this.bus.emit('crafted', { id, kind: res.kind });
    this.view.refreshPiles();
    this.panel.refresh();
    this.toast.show(msg, 2400);
    this.save();
    if (this.craftPanel.isOpen) this.craftPanel.refresh(msg.split('\n')[0]);
  }

  /** The built barricade (state.build.barricade) lives on the start flat's front door in the grid (home.barricadeSpot). */
  syncBarricadeToDoor() {
    const door = homeFrontDoor(this.world);
    if (!door) return;
    const b = this.state.build.barricade;
    if (b.level > 0) { this.grid.setBarricade(door, { own: true, hp: b.hp }); door.barricade.level = b.level; } else if (door.barricade) this.grid.setBarricade(door, null);
    this.view.refreshDoors(true);
  }

  // ---------------------------------------------------------------- needs and time

  tickClock() {
    const { state, balance } = this;
    if (state.flags.heroDead) return;
    const t = now();
    const gap = t - state.times.lastTickAt;
    if (gap < 0) { state.times.lastTickAt = t; return; }
    if (gap < balance.time.tickSeconds * 1000) return;
    if (gap > LONG_GAP_MS) {
      const info = elapsedInfo(state.times.lastTickAt, t, offlineCapMs(balance));
      this.applyOffline(info.elapsedMs, info.capped, true);
      return;
    }
    state.times.lastTickAt = t;
    tickNeeds(state.needs, gap / 1000, { sleeping: this.sleeping }, balance);
    tickProducers(state, balance, gap / 1000);
    this.attacks.check(t);
    if (this.sleeping && state.needs.energy >= balance.needs.max) { this.wake(); this.toast.show('Rested.'); }
    this.refreshMoodles();
    if (state.needs.health <= 0 && !this.dead) this.onHeroDeath();
  }

  countHunters() {
    if (this.dead) return 0;
    const range = this.balance.moodles.panic.aggroedWithinTiles;
    let n = 0;
    for (const rt of this.zombies.list) {
      if (rt.dying || !isAware(rt.ai) || !rt.visible) continue;
      if (Math.hypot(rt.rec.x - this.hero.x, rt.rec.y - this.hero.y) <= range) n++;
    }
    return n;
  }

  refreshMoodles() {
    const list = activeMoodles(this.state.needs, this.panic.level, this.balance);
    this.tiredLevel = list.find((m) => m.id === 'tired')?.level ?? 0;
    const key = moodleKey(list);
    if (key === this.moodleKey) return;
    this.moodleKey = key;
    this.moodles.update(list);
  }

  /**
   * Offline catch-up on launch, resume or a long frame gap: needs, production and attacks, in 10-minute steps. An attack cut
   * short by closing the app settles first. Attacks resolve against floor 15 (gameplay/isoOffline.js): the structures on the
   * cheapest path to the heart wear or break, and the report says what held and what broke.
   */
  applyOffline(elapsedMs, capped, awake = false) {
    const { state, balance } = this;
    if (state.flags.heroDead || this.gameOver) return;
    const t = now();
    this.attacks.onHide(); // a fight cut short by a long gap settles below
    const startMs = state.times.lastTickAt;
    const attackResults = [];
    const hook = makeAttackHook(state, balance, this.rng, startMs, this.resolver);
    hook.settle(startMs, { attacks: attackResults }); // an interrupted fight first (it counts toward the cap)
    let report = null;
    if (elapsedMs > 0) {
      const sim = { needs: state.needs, stockpile: state.stockpile, ctx: heroCtx(state, balance) };
      const produce = (_s, seconds, _at, rep) => tickProducers(state, balance, seconds, rep);
      const hooks = [produce];
      if (this.attacks.enabled) hooks.push(hook);
      report = catchUp(sim, elapsedMs, balance, { startMs, awake, stepHooks: hooks });
      if (capped) dropLostAttackTime(state, balance, t, this.rng);
      attackResults.push(...(report.attacks || []));
      report.attacks = attackResults;
    }
    if (report ? (elapsedMs >= 60000 || attackResults.length) : attackResults.length) {
      this.popup.show('While you were away', report ? reportLines(report, balance, capped) : attackLines(attackResults, balance));
    }
    state.times.lastTickAt = t;
    if (attackResults.length) { this.syncBarricadeToDoor(); this.updateVision(true); }
    this.buttonsDirty = true;
    this.panel.refresh();
    this.refreshMoodles();
    this.save();
  }

  /** An attack came due while the game was not ticking (e.g. the app was open on the title): settle it offline. */
  settleDueAttacks(t) {
    const report = { attacks: [] };
    makeAttackHook(this.state, this.balance, this.rng, t, this.resolver)(null, 0, t, report);
    if (!report.attacks.length) return;
    for (const a of report.attacks) a.missed = true;
    this.popup.show('While you were away', attackLines(report.attacks, this.balance));
    this.syncBarricadeToDoor();
    this.updateVision(true);
    this.panel.refresh();
    this.save();
  }

  onHide() {
    this.soundscape.stopAll();
    this.isoInput.cancel();
    this.craftPanel.close();
    this.cancelAction();
    this.combat.buffered = false;
    this.quick.disarm();
    this.throw.clear();
    this.buttons.closePicker();
    this.buttons.releaseAll();
    this.attacks.onHide();
    this.vault = null;
    this.zombies.resetAll();
    this.ripples.clear();
    this.walk = null;
    this.pending = null;
    this.run = null;
    this.wake();
    this.save();
  }

  save() {
    snapshotDoors(this.state, this.world);
    snapshotStructures(this.state, this.world);
    this.state.seen[FLOOR] = this.vision.serialize();
    writeSave();
  }

  onHomeButton() {
    const t = now();
    const dbl = this.balance.controls.homeDoubleTapSeconds * 1000;
    if (t - this.lastHomeTap <= dbl) {
      this.lastHomeTap = 0;
      if (this.sleeping) this.wake();
      this.cancelAction();
      const bed = heartBed(this.world, this.state, this.balance); // Home goes to the bed last slept in
      this.cancelPlacement();
      if (bed) this.goToObject(bed, { kind: 'walk' });
      this.toast.show('Heading home.');
    } else {
      this.lastHomeTap = t;
      this.hud.pressHome(this.balance.controls.homeDoubleTapSeconds); // the pressed look says "tap again"
      this.camera.resumeFollow();
    }
  }

  // ---------------------------------------------------------------- frame loop

  heroAnim() {
    if (this.dead) return null;
    if (this.time.now < this.swingUntil || this.heroAnimNow === 'attack') return 'attack';
    return this.moving ? 'walk' : 'idle';
  }

  updateOcclusionActors() {
    const a = this.occActors;
    let n = 0;
    a[n].x = this.heroSp.x; a[n].y = this.heroSp.y;
    a[n].depth = depthKey(Math.floor(this.hero.x), Math.floor(this.hero.y), LAYER.CHARACTER);
    n++;
    for (const rt of this.zombies.list) {
      if (!rt.visible || n >= a.length - 1) continue;
      this.actors.toScreen(rt.rec.x, rt.rec.y, a[n]);
      a[n].depth = depthKey(Math.floor(rt.rec.x), Math.floor(rt.rec.y), LAYER.CHARACTER);
      n++;
    }
    const target = this.pending?.stand ?? this.pending?.obj ?? this.action?.o;
    if (target && n < a.length) {
      const tx = target.tile ? target.tile[0] + target.span[0] / 2 : target.x + 0.5;
      const ty = target.tile ? target.tile[1] + target.span[1] / 2 : target.y + 0.5;
      this.actors.toScreen(tx, ty, a[n]);
      a[n].depth = depthKey(Math.floor(tx), Math.floor(ty), LAYER.CHARACTER);
      n++;
    }
    this.view.updateOcclusion(a, n);
  }

  update(time, delta) {
    const realNow = performance.now();
    const dt = Math.min(Math.max((realNow - this.lastFrameAt) / 1000, 0), 0.25);
    this.lastFrameAt = realNow;
    if (this.gameOver) return;
    this.soundscape.update(dt, this.panic.level > 0, now());
    this.soundscape.setHeartbeat(this.state.needs.health < this.balance.moodles.injured.below[2] && !this.dead);
    this.tickClock();
    this.isoInput.update();
    this.stickView.update(dt);
    this.shoveCd.step(dt);
    this.quick.step(dt);
    if (!this.dead) {
      this.updateHero(dt);
      this.updateCombat(dt);
    }
    this.attacks.update(dt);
    this.zombies.update(dt);
    this.updateAction(dt);
    stepPanic(this.panic, this.countHunters(), dt, this.balance);
    this.actors.toScreen(this.hero.x, this.hero.y, this.heroSp);
    const anim = this.heroAnim();
    if (anim) this.actors.syncHero(this.hero, anim, this.run ? 1.6 : 1, this.sleeping);
    this.zzz.setPosition(this.heroSp.x + 20, this.heroSp.y - 100);
    this.updateVision();
    this.camHero.x = this.heroSp.x;
    this.camHero.y = this.heroSp.y + this.anchorDy();
    this.camera.update(dt, this.camHero);
    this.applyCamera();
    this.view.update(dt);
    this.actors.update(dt);
    this.ripples.update(dt, this.hero, (x, y) => this.vision.isVisible(x, y));
    this.occT += dt;
    if (this.occT >= OCCLUSION_EVERY) { this.occT = 0; this.updateOcclusionActors(); }
    if (time - this.pulseAt > PULSE_SECONDS * 1000) {
      this.pulseAt = time;
      this.refreshMoodles();
      this.refreshWeapon();
      autoFill(this.state, this.balance);
    }
    this.throw.update(dt);
    this.hud.update();
    this.updateTargetAndButtons(dt);
    const modalBottom = this.craftPanel.isOpen ? this.craftPanel.bottomY : this.panel.isOpen ? this.panel.bottomY : 0;
    this.toast.setY(modalBottom ? modalBottom + TOAST_PANEL_GAP : this.hud.toastY);
  }

  /** Target selection, the outline, the placement ghost and the button HUD (once per frame). */
  updateTargetAndButtons(dt) {
    const panels = this.anyPanelOpen();
    if (this.placing && panels) this.cancelPlacement();
    if (panels) { this.quick.disarm(); this.buttons.closePicker(); }
    this.updateBuildMode();
    const tf = this.tFlags;
    tf.held = this.stick.down;
    tf.locked = !!this.action && this.action.spec.kind !== 'nap';
    tf.suppress = panels || this.sleeping || this.dead || this.gameOver || !!this.action?.spec.kind.startsWith('nap');
    this.targeting.update(dt, tf);
    const t = this.targeting.target;
    if (this.placing) this.view.setGhost(t?.kind === 'spot' ? t.door : null, this.targeting.cfg.ghostAlpha);
    // ghost of what Main would put on the targeted edge (while available and during the action)
    if (this.buildMode) {
      const m = this.slots.main;
      const show = t?.kind === 'edge' && m?.enabled && m.act;
      this.view.setEdgeGhost(show ? t.edge : null, show ? m.act : null, selectedPiece(this.state, this.balance), this.targeting.cfg.ghostAlpha);
    }
    // aim ellipse of an armed throw
    if (this.quick.armed) { this.updateAim(); this.throw.showAim(this.aim.x, this.aim.y); } else this.throw.hideAim();
    this.btnT -= dt;
    if (this.targeting.version !== this.lastTargetVersion || this.buttonsDirty || this.btnT <= 0) {
      this.lastTargetVersion = this.targeting.version;
      this.buttonsDirty = false;
      this.btnT = PULSE_SECONDS;
      this.refreshSlots();
    }
    const v = this.btnView;
    const q = quickState(this.state);
    const w = this.currentWeapon();
    v.main = this.slots.main;
    v.secondary = this.slots.secondary;
    v.attack.icon = attackIcon(w.id);
    v.quick.itemId = q.id;
    v.quick.count = quickCount(this.state);
    v.quick.icon = q.id ? QUICK_ICON[this.balance.items[q.id]?.type] ?? 'eat' : null;
    if (q.id === 'bandage' || q.id === 'medkit') v.quick.icon = 'bandage';
    v.quick.armed = this.quick.armed;
    if (this.buildMode) { // Quick-use shows the selected piece (tap = picker)
      const piece = selectedPiece(this.state, this.balance);
      v.quick.itemId = null;
      v.quick.icon = PIECE_ICON[piece];
      v.quick.count = 1;
      v.quick.armed = this.buttons.pickerOpen;
    }
    v.sleeping = this.sleeping;
    const cd = v.cd;
    cd.attack = this.combat.cdMax > 0 ? this.combat.cd / this.combat.cdMax : 0;
    cd.main = v.main?.id === 'attack' ? cd.attack : 0;
    cd.secondary = v.secondary?.id === 'shove' ? this.shoveCd.left / this.shoveCfg.cooldownSeconds : 0;
    cd.quick = this.buildMode ? 0 : this.quick.cooldownFrac;
    this.buttons.setVisible(!panels);
    this.buttons.update(dt, v);
  }

  // ---------------------------------------------------------------- debug (?debug builds)

  /** Client (CSS) coordinates of a tile centre raised by `raise` px, for synthetic touches in e2e. */
  debugTileToClient(tx, ty, raise = 0) {
    const cam = this.cameras.main;
    const wx = (tx - ty) * 48;
    const wy = (tx + ty + 1) * 24 - raise;
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / this.scale.width;
    return { x: rect.left + (wx - cam.scrollX) * k, y: rect.top + (wy - cam.scrollY) * k };
  }

  /** Client (CSS) coordinates of an action button ('main' | 'secondary' | 'attack' | 'quick'), for synthetic touches in e2e. */
  debugButton(name) {
    const c = this.buttons.centre(name);
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / this.scale.width;
    return { x: rect.left + c.x * k, y: rect.top + c.y * k };
  }

  /** Client (CSS) coordinates of a top-bar button ('home' | 'bag' | 'workbench' | 'survivors' | 'menu'). */
  debugBar(id) {
    const b = this.hud.buttons[id];
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / this.scale.width;
    return { x: rect.left + b.x * k, y: rect.top + b.y * k };
  }

  /** Move the hero (testing). */
  debugGoto(tx, ty) {
    this.walk = null;
    this.targeting?.tracker.reset(); // a teleport is a new situation: no kept target
    this.hero.x = tx + 0.5;
    this.hero.y = ty + 0.5;
    this.updateVision(true);
    this.snapCamera();
  }

  /** Make the next attack arrive in `seconds` (testing; needs ?debug&attacks). */
  debugAttackIn(seconds, kind = 'scheduled') {
    const a = this.state.attacks;
    a.kind = kind;
    a.nextAt = now() + seconds * 1000;
    a.current = null;
  }

  /** Add items to the bag (testing). */
  debugGive(id, qty = 1) {
    if (!this.balance.items[id]) return false;
    const left = addItem(this.state.inventory, id, qty, this.balance);
    autoFill(this.state, this.balance);
    this.panel.refresh();
    this.save();
    return left === 0;
  }
}
