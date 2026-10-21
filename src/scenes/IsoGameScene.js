import Phaser from 'phaser';
import floorsIso from '../../public/data/levels/floors_iso.json';
import lootData from '../../public/data/levels/loot.json';
import { getBalance, offlineCapMs } from '../core/balance.js';
import { getSave, writeSave } from '../core/save.js';
import { now, elapsedInfo } from '../core/clock.js';
import { lifecycle } from '../core/lifecycle.js';
import { loadIsoFloor } from '../iso/loader.js';
import { isoConfig, screenToTile, depthKey, LAYER, angleDiff, screenDeltaToAngle, normalizeAngle } from '../iso/projection.js';
import { VisionMap, visionConfig, coneAngle, viewRange, soundRipple } from '../iso/vision.js';
import { IsoCamera, cameraConfig, floorBounds } from '../iso/camera.js';
import {
  createIsoState, normalizeIsoState, applyDoorsToGrid, snapshotDoors, buildIsoTower, homeFrontDoor, updateIsoFloorState,
  isStaleSave, ISO_WORLD,
} from '../gameplay/isoState.js';
import { planWalk, stepWalk, turnToward, bestStandTile, standCandidates, angleTo, WALK } from '../gameplay/isoHero.js';
import { resolveTap } from '../gameplay/isoTap.js';
import { FACING_STEP } from '../iso/loader.js';
import { tickNeeds, applyItem, itemEffect, speedMult } from '../gameplay/needs.js';
import { activeMoodles, moodleKey, moodleAction, moodleHint, makePanic, stepPanic } from '../gameplay/moodles.js';
import { isRunTap, canRun, stepRun, runConfig } from '../gameplay/running.js';
import { wearWord, itemWords } from '../gameplay/words.js';
import { BARRICADE_WORDS, barricadeStage, barricadeMaxHp, latchBreach } from '../gameplay/barricade.js';
import { EMPTY_LINES } from '../gameplay/storyText.js';
import { catchUp } from '../gameplay/offline.js';
import { heroCtx, objState, takeFromPile } from '../gameplay/gameState.js';
import { moveAll, addItem } from '../gameplay/inventory.js';
import {
  heroWeapon, equipSlot, unequip, isEquipped, isEquippable, damageHero, swingDamage, spendSwingEnergy, spendWeaponUse,
} from '../gameplay/combat.js';
import { isAware } from '../gameplay/zombies.js';
import { hitSoundKey, isSmallHit } from '../gameplay/hitfx.js';
import { daysSurvived, gameOverStats } from '../gameplay/death.js';
import { listActions, buildSpec, completeAction, heroHasTool } from '../gameplay/actions.js';
import { pastKeepThreshold, spendToolUse, energyTimeMult } from '../gameplay/salvage.js';
import { napAction, completeNap, napConfig } from '../gameplay/nap.js';
import { reportLines } from '../gameplay/report.js';
import {
  recipeRows, USE_NAMES, craftCheck, costLines, effectText, performCraft, recipeKind,
} from '../gameplay/crafting.js';
import { tickProducers } from '../gameplay/producers.js';
import { noiseTiles, lightTimeMult, jamHit } from '../gameplay/isoActions.js';
import IsoWorldView, { isoDepth } from './IsoWorldView.js';
import IsoActors from './IsoActors.js';
import IsoInput from './IsoInput.js';
import IsoZombies from './IsoZombies.js';
import IsoSoundscape from './IsoSoundscape.js';
import { makeVignette, SoundRipples } from './IsoFx.js';
import Hud from './Hud.js';
import ActionMenu from './ActionMenu.js';
import InventoryPanel from './InventoryPanel.js';
import Popup from './Popup.js';
import Toast from './Toast.js';
import MoodleView from './MoodleView.js';
import MenuPanel from './MenuPanel.js';
import GameOverPanel from './GameOverPanel.js';
import CraftPanel from './CraftPanel.js';
import { debugOn, skipFrontEnd, exposeScene } from './debug.js';
import { frameAlphaAt } from './spriteAlpha.js';
import { label, COLORS, CSS, DEPTH } from './ui.js';
import { playSfx } from './sfx.js';

const LONG_GAP_MS = 30000;
const SWING_ANIM_MS = 280;
const STEP_SECONDS = 0.45;
const CANT_RUN_COOLDOWN_MS = 20000;
const BAR_W = 120;
const MENU_BOTTOM_MARGIN = 8;
const TOAST_PANEL_GAP = 45;
const OCCLUSION_EVERY = 0.1;
const BLOCKED_GIVE_UP = 0.6;
const APPROACH_REPLAN = 0.4;
const FLOOR = 15;
/** Half width (px) of the strip over a door's art that always counts as the door when tapped. */
const DOOR_TAP_HALF_W = 22;

/**
 * Isometric play scene (Stage A: floor 15 only). Orchestrates the iso core (grid, vision, camera), the
 * views (IsoWorldView, IsoActors), input (IsoInput), zombies (IsoZombies) and the shared systems
 * (needs, inventory, loot, crafting, save).
 *
 * Events on `this.bus`: 'noise' {x, y, radius, level, source} (tile units, radius Infinity = whole floor),
 * 'action-start' / 'action-done' / 'action-cancel', 'door-opened' {id}, 'door-closed' {id}, 'door-broken' {id},
 * 'zombie-killed' {id, type}, 'floor-cleared', 'hero-dead', 'crafted', 'barricade-built'.
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
    this.lastGroundTap = null;
    this.lastHomeTap = 0;
    this.queuedTap = null;
    this.faceTarget = null;
    this.looking = false;
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
    this.combat = { cd: 0, order: null, replanT: 0, lastHit: {} };
    this.lastFrameAt = performance.now();
    this.hudCombat = { weapon: { id: 'fists', name: 'Fists', uses: null } };
    this.heroSp = { x: 0, y: 0 };
    this.cands = [];
    this.zCands = [];
    this.tapCtx = { zombies: this.zCands, hero: { id: 'hero', kind: 'hero', x: 0, y: 0, w: 96, h: 96, depth: 0 }, interactables: this.cands, stairTiles: [...this.world.stairs.down, ...this.world.stairs.up], grid: this.grid, pixelHit: (c, px, py) => this.pixelHit(c, px, py) };
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

    this.hud = new Hud(this, balance, {
      onAnyTap: () => { if (this.action?.spec.kind === 'nap') this.cancelAction(); },
      onHome: () => this.onHomeButton(),
      onBag: () => this.toggleBag(),
      onStoreAll: () => this.storeAll(),
      onThrow: () => {},
      onCrew: () => {},
      onMenu: () => { this.menu.close(); this.moodles.closeCard(); this.menuPanel.isOpen ? this.menuPanel.close() : this.menuPanel.open(); },
    });
    this.toast = new Toast(this, this.hud.toastY);
    this.menu = new ActionMenu(this);
    this.popup = new Popup(this);
    this.panel = new InventoryPanel(this, {
      bag: () => this.state.inventory,
      stock: () => this.state.stockpile,
      describe: (slot, tab) => this.describeItem(slot, tab),
      onUse: (tab, i) => this.useItem(tab, i),
      onStore: (i) => this.moveOne('bag', i),
      onTake: (i) => this.moveOne('stock', i),
      onClose: () => {},
      badge: (slot, i, tab) => (tab === 'bag' && isEquipped(this.state, i) ? 'E' : slot.uses != null ? ' ' : null),
    });
    this.craftPanel = new CraftPanel(this, { rows: () => this.craftRows(), onCraft: (id) => this.onCraftTap(id), onClose: () => {} });
    this.menuPanel = new MenuPanel(this, { day: () => daysSurvived(this.state, now()) + 1 });
    this.gameOverPanel = new GameOverPanel(this);
    this.soundscape = new IsoSoundscape(this);
    this.zombies = new IsoZombies(this);
    this.moodles = new MoodleView(this, balance, {
      getAction: (id) => moodleAction(id, this.state, this.balance, this.inHome()),
      hint: (id) => moodleHint(id),
      onAction: (id) => this.onMoodleAction(id),
    });
    this.bus.on('noise', (n) => this.zombies.onNoise(n));
    this.isoInput = new IsoInput(this, {
      controls: balance.controls,
      camera: this.camera,
      canGesture: () => !this.gameOver && !this.dead && !this.anyPanelOpen(),
      onTap: (wx, wy, sx, sy) => this.onWorldTap(wx, wy, sx, sy),
      onDragStart: () => this.menu.close(),
      onLookStart: () => this.onLookStart(),
      onLook: (wx, wy) => this.onLook(wx, wy),
      onLookEnd: () => this.onLookEnd(),
    });
    this.setupLifecycle();

    this.syncBarricadeToDoor();
    const hs = this.actors.toScreen(this.hero.x, this.hero.y, { x: 0, y: 0 });
    this.camera.snapTo(hs.x, hs.y, this.hero.facing);
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
    return x >= r[0] && y >= r[1] && x < r[0] + r[2] && y < r[1] + r[3];
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

  onLookStart() {
    if (this.sleeping || this.gameOver) return;
    this.looking = true;
    this.walk = null;
    this.pending = null;
    this.run = null;
    this.combat.order = null;
    this.menu.close();
  }

  onLook(wx, wy) {
    const hs = this.heroSp;
    this.faceTarget = { angle: screenDeltaToAngle(this.iso, wx - hs.x, wy - hs.y), rate: this.balance.controls.lookTurnDegreesPerSecond };
  }

  onLookEnd() {
    this.looking = false;
    this.faceTarget = null; // he keeps that facing
  }

  /** Tap the hero: turn around (180 degrees in controls.heroTapTurnSeconds). */
  turnAround() {
    this.faceTarget = { angle: normalizeAngle(this.hero.facing + 180), rate: 180 / this.balance.controls.heroTapTurnSeconds };
  }

  buildTapCandidates() {
    const { zCands } = this;
    zCands.length = 0;
    const tmp = { x: 0, y: 0 };
    for (const rt of this.zombies.list) {
      if (!rt.visible || rt.dying) continue;
      this.actors.toScreen(rt.rec.x, rt.rec.y, tmp);
      zCands.push({ id: rt.rec.id, kind: 'zombie', x: tmp.x, y: tmp.y - this.iso.bodyRaise, w: 96, h: 96, depth: depthKey(Math.floor(rt.rec.x), Math.floor(rt.rec.y), LAYER.CHARACTER), rt });
    }
    const h = this.tapCtx.hero;
    h.x = this.heroSp.x;
    h.y = this.heroSp.y - this.iso.bodyRaise;
    this.view.interactables(this.cands);
  }

  /** Is a visible pixel of the candidate's sprite (or, for doors, the door's art area) under the point? */
  pixelHit(c, px, py) {
    // a door is also solid over its door strip (a cut door shows only a low stub, but its leaf is tapped where it was)
    if (c.kind === 'door' && Math.abs(px - c.x) <= DOOR_TAP_HALF_W && py >= c.y - 60 && py <= c.y + 50) return true;
    if (c.kind === 'pile') return Math.abs(px - c.x) <= 36 && Math.abs(py - c.y) <= 30;
    const sp = c.sp;
    if (!sp) return false;
    const fw = sp.frame.width;
    const fh = sp.frame.height;
    let lx = (px - sp.x) / 3 + c.origin[0] * fw;
    const ly = (py - sp.y) / 3 + c.origin[1] * fh;
    if (sp.flipX) lx = fw - lx;
    if (lx < 0 || ly < 0 || lx >= fw || ly >= fh) return false;
    return frameAlphaAt(this, sp.texture.key, sp.frame.name, Math.floor(lx), Math.floor(ly)) > 20;
  }

  onWorldTap(wx, wy, sx, sy) {
    if (this.gameOver || this.dead || this.anyPanelOpen()) return;
    if (this.sleeping) { this.wake(); return; }
    this.menu.close();
    this.moodles.closeCard();
    this.combat.order = null; // a new tap cancels a queued attack or door bash
    if (this.action) {
      const progress = this.action.elapsed / this.action.duration;
      if (this.action.spec.kind !== 'nap' && this.action.spec.kind !== 'door-open' && pastKeepThreshold(progress, this.balance)) {
        this.queuedTap = { wx, wy, sx, sy };
        return;
      }
      this.cancelAction();
    }
    this.buildTapCandidates();
    const res = resolveTap(this.iso, this.tapCtx, wx, wy);
    switch (res.type) {
      case 'zombie': this.attackZombie(res.target.rt); break;
      case 'hero': this.turnAround(); break;
      case 'interact': this.handleInteract(res.target); break;
      case 'stairs': this.toast.show('The stairs are blocked.', 2000); break;
      case 'floor': this.handleGround(res.x, res.y, sx, sy); break;
      default:
    }
  }

  handleGround(tx, ty, sx, sy) {
    const tap = { t: performance.now(), x: sx, y: sy };
    const run = isRunTap(this.lastGroundTap, tap, this.balance);
    this.lastGroundTap = run ? null : tap;
    this.combat.order = null;
    this.goToTile(tx, ty, null, run);
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

  cantRun() {
    const t = performance.now();
    if (t - (this.cantRunAt ?? -Infinity) < CANT_RUN_COOLDOWN_MS) return;
    this.cantRunAt = t;
    this.toast.show("I can't run anymore.", 1800);
  }

  footstep(dt, running) {
    this.stepT += dt;
    if (this.stepT < (running ? STEP_SECONDS * 0.6 : STEP_SECONDS)) return;
    this.stepT = 0;
    this.stepFlip = !this.stepFlip;
    playSfx(this, this.stepFlip ? 'step_1' : 'step_2', running ? { volume: 1.6, rate: 0.85 } : { volume: 0.7 });
  }

  updateHero(dt) {
    const h = this.hero;
    const b = this.balance;
    this.moving = false;
    if (this.pauseT > 0) { this.pauseT -= dt; return; }
    if (this.faceTarget && !this.walk) {
      h.facing = turnToward(h.facing, this.faceTarget.angle, this.faceTarget.rate, dt);
      if (!this.looking && Math.abs(angleDiff(h.facing, this.faceTarget.angle)) < 0.5) this.faceTarget = null;
    }
    if (this.sleeping || this.action || this.looking) return;
    if (this.combat.order) { this.updateCombatApproach(dt); }
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

  // ---------------------------------------------------------------- interaction targets

  handleInteract(t) {
    switch (t.kind) {
      case 'door': this.handleDoor(t.door); break;
      case 'object': this.handleObject(t); break;
      case 'workbench': this.goToObject(t.obj, { kind: 'workbench' }); break;
      case 'stash': this.goToObject(t.obj, { kind: 'stash' }); break;
      case 'pile': this.goToTile(Math.floor(t.pile.x), Math.floor(t.pile.y), { kind: 'pile', pile: t.pile }); break;
      default:
    }
  }

  objectDef(o) { return this.balance.objects[o.objectId]; }

  isHomeBed(o) { return o.id === this.world.home.bed; }

  handleObject(t) {
    const o = t.obj;
    const def = this.objectDef(o);
    if (!def) return;
    if (this.isHomeBed(o)) {
      this.openMenu(t, [{ kind: 'sleep', label: 'Sleep', enabled: true }, this.napButton()], o);
      return;
    }
    const actions = listActions(def, o.id, this.state, this.balance);
    if (!actions.length) return;
    if (actions.length === 1 && actions[0].enabled) this.goToObject(o, { kind: actions[0].kind });
    else this.openMenu(t, actions, o);
  }

  /** Walk to a stand tile next to an object (the front tile first) and act on arrival. */
  goToObject(o, pending) {
    pending.obj = o;
    const step = FACING_STEP[o.facing] ?? [0, 1];
    // mounted objects leave their tile free: standing on it is fine
    const own = o.mounted ? o.tiles.map((t) => ({ x: t.x, y: t.y })) : null;
    if (!this.goToStand(o.tiles, step, pending, own)) this.toast.show('Cannot get there.', 1200);
  }

  openMenu(t, actions, o, onPick = null) {
    const cam = this.cameras.main;
    const top = t.y - t.h / 2 - cam.scrollY;
    const bottom = t.y + t.h / 2 - cam.scrollY;
    this.menu.open(
      { x: t.x - cam.scrollX, topY: top, bottomY: bottom, screenTop: this.hud.topH + 8, screenBottom: this.hud.bottomY - MENU_BOTTOM_MARGIN, fixed: true },
      actions,
      onPick || ((kind) => this.goToObject(o, { kind })),
    );
  }

  // ---------------------------------------------------------------- doors

  handleDoor(door) {
    const t = this.view.interactables([]).find((c) => c.id === door.id);
    if (!t) return;
    if (door.state === 'closed') { this.goToDoor(door, 'open'); return; }
    if (door.state === 'jammed') {
      this.openMenu(t, [{ kind: 'force', label: 'Force', enabled: true }], null, () => this.goToDoor(door, 'force'));
      return;
    }
    const acts = [];
    if (door.state === 'open') acts.push({ kind: 'close', label: 'Close', enabled: true });
    if (door.kind === 'interior' && !this.state.objects[door.id]?.dismantled) {
      const def = this.balance.objects.interior_door;
      const need = door.state !== 'broken' && def.tool && !heroHasTool(this.state, def.tool);
      acts.push({ kind: 'dismantle', label: 'Dismantle', enabled: !need, reason: need ? `Needs ${def.tool}` : undefined });
    }
    if (!acts.length) return;
    this.openMenu(t, acts, null, (kind) => this.goToDoor(door, kind));
  }

  /** Walk to the nearer tile touching the door and act on arrival. */
  goToDoor(door, kind) {
    const [a, b] = this.grid.doorTiles(door);
    const from = this.heroTile();
    const best = bestStandTile(this.grid, from, [a, b], this.balance, this.zombieAt);
    if (!best) { this.toast.show('Cannot get there.', 1200); return; }
    const pending = { kind: `door-${kind}`, door, stand: best };
    this.goToTile(best.x, best.y, pending, false);
  }

  /** Face the door and open it (0.4 s). `onWalk`: the hero opens it on the way and keeps walking. */
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
    this.grid.setDoorState(door, 'open');
    playSfx(this, 'door_open');
    if (this.run) this.noise(door.x + 0.5, door.y + 0.5, 'noisy', this.balance.doors.runOpenNoiseTiles, 'door-run'); // bursts open
    this.bus.emit('door-opened', { id: door.id });
    this.view.refreshDoors(true);
    this.updateVision(true);
    this.save();
    this.runQueuedTap();
    if (!onWalk) this.walk = null;
  }

  onLockedDoor(door) {
    const p = this.pending;
    this.walk = null;
    if (p?.kind === 'door-force' && p.door === door) { this.onArrive(p); return; }
    this.pending = null;
    this.toast.show(door.barricade?.hp > 0 ? 'Barricaded from the inside.' : "It's stuck.", 2000);
  }

  closeDoor(door) {
    const [a, b] = this.grid.doorTiles(door);
    if (this.zombies.at(a.x, a.y) || this.zombies.at(b.x, b.y)) { this.toast.show("Something's in the way.", 1800); return; }
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
    playSfx(this, 'door_open', { rate: 0.85 });
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
    this.combat.order = { type: 'door', door };
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
    this.runQueuedTap();
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
    let sound = 'door_hit';
    if (!hit.jammed) {
      if (door.barricade && door.barricade.hp > 0) {
        broke = this.grid.damageBarricade(door, hit.damage);
        this.state.build.barricade.hp = door.barricade.hp;
        sound = broke ? 'barricade_break' : 'barricade_hit';
        if (broke && latchBreach(this.state)) this.state.needs.morale = Math.max(0, this.state.needs.morale + this.balance.needs.morale.events.barricadeBreached);
      } else if (this.grid.damageDoor(door, hit.damage)) {
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

  onArrive(p = this.pending) {
    this.pending = null;
    if (!p) return;
    const o = p.obj;
    if (o) {
      const cx = o.tile[0] + o.span[0] / 2;
      const cy = o.tile[1] + o.span[1] / 2;
      this.hero.facing = angleTo(this.hero.x, this.hero.y, cx, cy);
    }
    switch (p.kind) {
      case 'sleep': this.startSleep(); break;
      case 'nap': this.startNap(o); break;
      case 'workbench': this.craftPanel.open(); break;
      case 'stash': this.panel.open('stock'); break;
      case 'pile': this.takePile(p.pile); break;
      case 'door-open': if (p.door.state === 'closed') this.beginDoorOpen(p.door); break;
      case 'door-close': this.closeDoor(p.door); break;
      case 'door-force': this.forceDoor(p.door); break;
      case 'door-dismantle': this.beginDoorDismantle(p.door); break;
      case 'attack': { const rt = this.zombies.get(p.zid); if (rt) this.combat.order = { type: 'zombie', id: p.zid }; break; }
      case 'walk': break;
      default: this.beginAction(o, p.kind);
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
    playSfx(this, this.actionSound(spec, def));
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
    this.queuedTap = null;
    this.hideBar();
    this.napFade.setVisible(false);
    this.heroAnimNow = null;
  }

  runQueuedTap() {
    const q = this.queuedTap;
    this.queuedTap = null;
    if (q) this.onWorldTap(q.wx, q.wy, q.sx, q.sy);
  }

  finishAction() {
    const kind = this.action.spec.kind;
    if (kind === 'nap') { this.finishNap(); return; }
    if (kind === 'pry') { this.finishPry(); return; }
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
    this.runQueuedTap();
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
    this.toast.show('Sleeping. Tap anywhere to wake up.');
  }

  napButton() { return napAction(this.state, now(), this.balance, { unsafe: this.napUnsafe() }); }

  napUnsafe() {
    return this.zombies.list.some((rt) => !rt.dying && (rt.ai.mode === 'chase' || rt.ai.mode === 'attack'));
  }

  startNap(o) {
    const nb = this.napButton();
    if (!nb.enabled) { this.toast.show(nb.reason); return; }
    const spec = { kind: 'nap', id: 'bed', seconds: napConfig(this.balance).durationSeconds, energy: 0, tool: null, noise: 'quiet' };
    this.action = { spec, o, elapsed: 0, duration: spec.seconds };
    this.bus.emit('action-start', { spec, target: o });
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

  /** Tap on a zombie: swing now if in range with a clear line, otherwise walk into range and swing once. */
  attackZombie(rt) {
    this.walk = null;
    this.pending = null;
    this.combat.order = { type: 'zombie', id: rt.rec.id };
    this.combat.replanT = 0;
    this.camera.resumeFollow();
  }

  weaponRange(w) { return this.balance.combat.weapons[w.id].rangeTiles; }

  inReach(rt, w) {
    const h = this.hero;
    const z = rt.rec;
    if (Math.hypot(z.x - h.x, z.y - h.y) > this.weaponRange(w)) return false;
    return this.grid.hasLOS(Math.floor(h.x), Math.floor(h.y), Math.floor(z.x), Math.floor(z.y));
  }

  updateCombatApproach(dt) {
    const o = this.combat.order;
    if (!o || o.type !== 'zombie') return;
    const rt = this.zombies.get(o.id);
    if (!rt || rt.dying) { this.combat.order = null; return; }
    const w = heroWeapon(this.state, this.balance);
    if (this.inReach(rt, w)) { this.walk = null; this.run = null; return; }
    this.combat.replanT -= dt;
    if (this.walk && this.combat.replanT > 0) return;
    this.combat.replanT = APPROACH_REPLAN;
    const z = rt.rec;
    const R = this.weaponRange(w) - 0.25;
    const zx = Math.floor(z.x);
    const zy = Math.floor(z.y);
    const cands = [];
    const r = Math.ceil(R);
    for (let y = zy - r; y <= zy + r; y++) {
      for (let x = zx - r; x <= zx + r; x++) {
        if (!this.grid.isWalkable(x, y) || (x === zx && y === zy) || this.zombies.at(x, y)) continue;
        if (Math.hypot(x + 0.5 - z.x, y + 0.5 - z.y) > R) continue;
        if (!this.grid.hasLOS(x, y, zx, zy)) continue;
        cands.push({ x, y, d: (x + 0.5 - this.hero.x) ** 2 + (y + 0.5 - this.hero.y) ** 2 });
      }
    }
    cands.sort((a, b) => a.d - b.d);
    const best = bestStandTile(this.grid, this.heroTile(), cands.slice(0, 6), this.balance, this.zombieAt);
    if (!best) { this.combat.order = null; this.toast.show('Cannot reach it.', 1400); return; }
    this.run = null;
    const plan = planWalk(this.grid, this.hero, best, { run: false, balance: this.balance, isBlocked: this.zombieAt });
    if (plan) this.walk = plan; else this.combat.order = null;
  }

  updateCombat(dt) {
    const c = this.combat;
    if (c.cd > 0) c.cd = Math.max(0, c.cd - dt);
    const o = c.order;
    if (!o || this.sleeping || this.action || this.looking) return;
    if (o.type === 'door') {
      if (o.door.state !== 'jammed') { c.order = null; return; }
      const [a, b] = this.grid.doorTiles(o.door);
      const t = this.heroTile();
      if (!((t.x === a.x && t.y === a.y) || (t.x === b.x && t.y === b.y))) { c.order = null; return; }
      this.faceDoor(o.door);
      if (c.cd <= 0) { c.order = null; this.swing(null, o.door); if (o.door.state === 'jammed') c.order = o; } // keep bashing until it gives way
      return;
    }
    const rt = this.zombies.get(o.id);
    if (!rt || rt.dying) { c.order = null; return; }
    const w = heroWeapon(this.state, this.balance);
    if (!this.inReach(rt, w)) return;
    this.hero.facing = angleTo(this.hero.x, this.hero.y, rt.rec.x, rt.rec.y);
    if (c.cd <= 0) { c.order = null; this.swing(rt, null, w); }
  }

  swing(rt, door, weapon) {
    const { state, balance } = this;
    const w = weapon || heroWeapon(state, balance);
    this.combat.cd = w.cooldown;
    spendSwingEnergy(state.needs, balance);
    this.swingUntil = this.time.now + SWING_ANIM_MS;
    playSfx(this, 'swing');
    if (!door) {
      const dmg = swingDamage(w, state.needs, balance, { unaware: !isAware(rt.ai), panic: this.panic.level });
      playSfx(this, hitSoundKey(w.id, this.combat.lastHit));
      const killed = this.zombies.hurt(rt, dmg, isSmallHit(w.id));
      const wear = spendWeaponUse(state, balance);
      if (wear?.broke) { this.toast.show(`Your ${balance.combat.weapons[wear.id].name.toLowerCase()} broke. Back to fists.`); playSfx(this, 'weapon_break'); }
      if (killed || wear?.broke) this.save();
    } else this.applyDoorHit(door);
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
    if (updateIsoFloorState(this.state, FLOOR)) this.bus.emit('floor-cleared', { floor: FLOOR });
    this.save();
  }

  onHeroDeath() {
    if (this.dead) return;
    this.dead = true;
    this.cancelAction();
    this.walk = null;
    this.combat.order = null;
    this.wake();
    this.menu.close();
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
    this.menu.close();
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
    else if (slot.uses != null) words = wearWord(slot.uses, balance.salvage.toolUses);
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
      if (r.type === 'group') return { type: 'group', name: USE_NAMES[r.use] || r.use };
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
    this.finishCraft(id, {});
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
    if (b.level > 0) this.grid.setBarricade(door, { own: true, hp: b.hp }); else if (door.barricade) this.grid.setBarricade(door, null);
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

  applyOffline(elapsedMs, capped, awake = false) {
    const { state, balance } = this;
    if (state.flags.heroDead || this.gameOver) return;
    const t = now();
    let report = null;
    if (elapsedMs > 0) {
      const sim = { needs: state.needs, stockpile: state.stockpile, ctx: heroCtx(state, balance) };
      const produce = (_s, seconds, _at, rep) => tickProducers(state, balance, seconds, rep);
      report = catchUp(sim, elapsedMs, balance, { startMs: state.times.lastTickAt, awake, stepHooks: [produce] });
      report.attacks = [];
    }
    if (report && elapsedMs >= 60000) this.popup.show('While you were away', reportLines(report, balance, capped));
    state.times.lastTickAt = t;
    this.panel.refresh();
    this.refreshMoodles();
    this.save();
  }

  onHide() {
    this.soundscape.stopAll();
    this.isoInput.cancel();
    this.craftPanel.close();
    this.cancelAction();
    this.combat.order = null;
    this.zombies.resetAll();
    this.ripples.clear();
    this.walk = null;
    this.pending = null;
    this.run = null;
    this.wake();
    this.menu.close();
    this.save();
  }

  save() {
    snapshotDoors(this.state, this.world);
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
      const bed = this.world.objectById.get(this.world.home.bed);
      if (bed) this.goToObject(bed, { kind: 'walk' });
      this.toast.show('Heading home.');
    } else {
      this.lastHomeTap = t;
      this.camera.resumeFollow();
      const hs = this.actors.toScreen(this.hero.x, this.hero.y, { x: 0, y: 0 });
      this.camera.snapTo(hs.x, hs.y, this.hero.facing);
      this.toast.show('Tap Home again to walk home.', 1400);
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
    if (!this.dead) {
      this.updateHero(dt);
      this.updateCombat(dt);
    }
    this.zombies.update(dt);
    this.updateAction(dt);
    stepPanic(this.panic, this.countHunters(), dt, this.balance);
    this.actors.toScreen(this.hero.x, this.hero.y, this.heroSp);
    const anim = this.heroAnim();
    if (anim) this.actors.syncHero(this.hero, anim, this.run ? 1.6 : 1, this.sleeping);
    this.zzz.setPosition(this.heroSp.x + 20, this.heroSp.y - 100);
    this.updateVision();
    this.camera.update(dt, this.heroSp, this.hero.facing);
    this.applyCamera();
    this.view.update(dt);
    this.actors.update(dt);
    this.ripples.update(dt, this.hero, (x, y) => this.vision.isVisible(x, y));
    this.occT += dt;
    if (this.occT >= OCCLUSION_EVERY) { this.occT = 0; this.updateOcclusionActors(); }
    if (time - this.pulseAt > 100) {
      this.pulseAt = time;
      this.refreshMoodles();
      const w = heroWeapon(this.state, this.balance);
      this.hudCombat = { weapon: { id: w.id, name: w.name, uses: w.uses } };
    }
    this.hud.update({
      canStore: this.canStoreAll() && !this.anyPanelOpen(),
      weapon: this.hudCombat.weapon, canThrow: false, armed: false, crew: false,
    });
    const modalBottom = this.craftPanel.isOpen ? this.craftPanel.bottomY : this.panel.isOpen ? this.panel.bottomY : 0;
    this.toast.setY(modalBottom ? modalBottom + TOAST_PANEL_GAP : this.hud.toastY);
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

  /** Client (CSS) coordinates of a door / object / pile / zombie by id, for synthetic touches in e2e. */
  debugClientOf(id) {
    this.buildTapCandidates();
    const c = this.cands.find((x) => x.id === id) ?? this.zCands.find((x) => x.id === id);
    if (!c) return null;
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / this.scale.width;
    return { x: rect.left + (c.x - cam.scrollX) * k, y: rect.top + (c.y - cam.scrollY) * k };
  }

  /** Client coordinates of the i-th action menu button. */
  debugMenuButton(i) {
    const b = this.menu.c?.list[i];
    if (!b) return null;
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / this.scale.width;
    return { x: rect.left + b.x * k, y: rect.top + b.y * k };
  }

  /** Move the hero (testing). */
  debugGoto(tx, ty) {
    this.walk = null;
    this.hero.x = tx + 0.5;
    this.hero.y = ty + 0.5;
    this.updateVision(true);
    const hs = this.actors.toScreen(this.hero.x, this.hero.y, { x: 0, y: 0 });
    this.camera.snapTo(hs.x, hs.y, this.hero.facing);
  }

  /** Add items to the bag (testing). */
  debugGive(id, qty = 1) {
    if (!this.balance.items[id]) return false;
    const left = addItem(this.state.inventory, id, qty, this.balance);
    this.panel.refresh();
    this.save();
    return left === 0;
  }
}
