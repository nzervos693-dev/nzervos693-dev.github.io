/**
 * Side cutaway of the tower (3120 px wide floors): wall modules per room, doorways, doors, props, debris, piles.
 * Stage 2: every room is drawn fully (no Dark state until stage 4). Static scenery lives in per-floor Phaser Layers
 * split into x chunks; cull() hides the chunks outside the camera view (and pauses their rain), so a 3120 px wide
 * floor costs only what is on screen.
 * No highlights: nothing pulses, glows or carries a marker (GDD 9); the barricade shows damage by sprite stage only.
 * Renders from tower_m2.json (via the tower index) and the game state; owns tap hit-testing.
 */
import Phaser from 'phaser';
import { frameOf, hasFrame, hasSheet, propSprite } from './art.js';
import {
  ART_SCALE, FLOOR_LINE, WALL_LIFT, floorTopY, floorLineY, floorAtY, tapFloorAtY, worldHeight,
} from '../gameplay/layout.js';
import { pickTarget } from '../gameplay/hitAreas.js';
import { homeSpots } from '../gameplay/buildSpots.js';
import { barricadeMaxHp, barricadeStage } from '../gameplay/barricade.js';
import { isProducerRecipe } from '../gameplay/producers.js';
import { residentsAtHome, survivorHomeSpot } from '../gameplay/survivors.js';
import { COLORS, CSS, FONT, uiConfig, hex } from './ui.js';

const ROOM_BG = { kitchen: 'wall_tile', bathroom: 'wall_tile', living: 'wall_wallpaper', bedroom: 'wall_wallpaper' };
/** wall_modules frame prefix per room type (types without art of their own borrow a neighbour). */
const MODULE_ART = { studio: 'living', reception: 'office' };
const FIXTURE_FRAME = { bed: 'hero_bed', workbench: 'workbench' };
/** Width of one scenery chunk (a Phaser Layer per floor and chunk) and how far past the view it stays visible, px. */
const CHUNK_W = 780;
const CULL_MARGIN = 200;
const D = { bg: 0, shaft: 1, window: 3, divider: 4, debris: 5, wall: 9, prop: 10, pile: 12, hero: 20, marker: 30, landing: 40 };
/** Window art (window_m, 40x40 art px) sits this far down from the floor top, art px; the glass is at +4,+4. */
const WINDOW_Y = 14;
const WINDOW_GLASS = 4;

export default class TowerView {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} tower from buildTower
   * @param {object} state game state
   * @param {object} balance
   */
  constructor(scene, tower, state, balance) {
    this.scene = scene;
    this.tower = tower;
    this.state = state;
    this.balance = balance;
    this.sprites = new Map(); // placement id -> { img, debris, cx, cy, halfW, floor, placement, def }
    this.doorSprites = new Map(); // door id -> image (front and interior doors)
    this.pileSprites = new Map(); // pile id -> container
    this.built = new Map(); // spot key -> { img, badge, x }
    this.barricade = null; // { img, key }
    this.landingShade = null; // dark overlay on the home landing for the attack cue flicker
    this.landingLight = null; // emergency light overlay on the home landing (stairwell_shaft light_lit / light_unlit)
    this.crew = new Map(); // recruited survivor id -> sprite at home
    this.bodies = []; // sprites of dead characters
    this.chunks = []; // { layer, x0, x1, y0, y1, rain: Sprite[], shown } static scenery per floor and x chunk
    this.build();
    this.refresh();
  }

  /** Is this texture loaded? (New art is optional: placeholders are used when it is missing.) */
  has(key) { return this.scene.textures.exists(key); }

  build() {
    const { scene, tower } = this;
    const s = ART_SCALE;
    const sw = tower.stairwell;
    const fw = tower.floorWidth;
    for (let n = tower.floorMax; n >= tower.floorMin; n--) {
      const top = floorTopY(tower, n);
      const line = floorLineY(tower, n);
      const f = tower.floors.get(n);
      const made = scene.children.list.length; // everything created below is static scenery of this floor
      this.buildShaft(n, top, sw);
      if (n === tower.homeFloor) {
        this.landingShade = scene.add.rectangle(sw.xMin, top, sw.xMax - sw.xMin, tower.floorHeight, 0x000000, 1)
          .setOrigin(0).setDepth(D.landing).setAlpha(0);
      }
      // tower edges (the exterior walls) just outside both ends of the floor
      if (this.has('tower_edge')) {
        scene.add.image(fw, top, 'tower_edge', 0).setOrigin(0).setScale(s).setDepth(D.divider);
        scene.add.image(0, top, 'tower_edge', 0).setOrigin(1, 0).setFlipX(true).setScale(s).setDepth(D.divider);
      }
      for (const apt of f.apartments) {
        this.buildUnitBackground(apt, top);
        const front = apt.front;
        if (this.has('room_dividers')) {
          scene.add.image(front.x, top, 'room_dividers', frameOf('room_dividers', apt.condition === 'burned' ? 'doorway_burned' : 'front_door_frame'))
            .setOrigin(0.5, 0).setScale(s).setDepth(D.divider);
        }
        const door = scene.add.image(front.x, line, 'door', 0).setOrigin(0.5, 1).setScale(s).setDepth(D.prop - 1);
        this.doorSprites.set(front.id, door);
        for (const fx of apt.fixtures || []) {
          // fixtures (the workbench) always stand on the floor line, even when their data slot is a wall slot (BUG-038)
          const img = scene.add.image(fx.x, line, 'build', frameOf('build', FIXTURE_FRAME[fx.kind]))
            .setOrigin(0.5, 1).setScale(s).setDepth(D.prop);
          this.sprites.set(`fixture:${fx.kind}`, { img, cx: fx.x, cy: line - 16 * s, halfW: 48, floor: n, fixture: fx });
        }
        for (const o of apt.objects || []) {
          if (o.door) this.addDoorObject(apt, o, n, line);
          else this.addObject(apt, o, n, line);
        }
        for (const sv of apt.survivors || []) this.addSurvivor(apt, sv, n, line);
      }
      this.chunkFloor(n, top, made);
    }
  }

  /** Move the scenery created since `from` (display list index) into this floor's x-chunk Layers. */
  chunkFloor(n, top, from) {
    const { scene, tower } = this;
    const list = scene.children.list;
    const moving = list.slice(from).filter((o) => o !== this.landingShade);
    const byChunk = new Map();
    for (const o of moving) {
      const cx = o.x + (o.displayWidth || 0) * (0.5 - (o.originX ?? 0.5));
      const i = Math.max(0, Math.min(Math.floor(tower.floorWidth / CHUNK_W) - 1, Math.floor(cx / CHUNK_W)));
      if (!byChunk.has(i)) byChunk.set(i, []);
      byChunk.get(i).push(o);
    }
    for (const [i, objs] of byChunk) {
      const layer = scene.add.layer().setDepth(1);
      layer.add(objs);
      const rain = objs.filter((o) => o.texture?.key === 'rain_window');
      this.chunks.push({ layer, x0: i * CHUNK_W - CULL_MARGIN, x1: (i + 1) * CHUNK_W + CULL_MARGIN, y0: top - CULL_MARGIN, y1: top + tower.floorHeight + CULL_MARGIN, rain, shown: true });
    }
  }

  /**
   * Hide scenery chunks outside the camera view and pause their rain. Cheap (about 20 boxes); call every frame.
   * @param {Phaser.Cameras.Scene2D.Camera} cam
   */
  cull(cam) {
    const vx0 = cam.scrollX;
    const vx1 = cam.scrollX + cam.width;
    const vy0 = cam.scrollY;
    const vy1 = cam.scrollY + cam.height;
    for (const c of this.chunks) {
      const vis = c.x1 > vx0 && c.x0 < vx1 && c.y1 > vy0 && c.y0 < vy1;
      if (vis === c.shown) continue;
      c.shown = vis;
      c.layer.setVisible(vis);
      for (const r of c.rain) { if (vis) r.anims.resume(); else r.anims.pause(); }
    }
  }

  /** The central stairwell shaft of one floor (one 240 px module), its number and the emergency light. */
  buildShaft(n, top, sw) {
    const { scene, tower } = this;
    const s = ART_SCALE;
    if (this.has('stairwell_shaft')) {
      scene.add.image(sw.xMin, top, 'stairwell_shaft', frameOf('stairwell_shaft', 'shaft')).setOrigin(0).setScale(s).setDepth(D.shaft);
      const light = scene.add.image(sw.xMin, top, 'stairwell_shaft', frameOf('stairwell_shaft', 'light_lit')).setOrigin(0).setScale(s).setDepth(D.shaft + 1);
      if (n === tower.homeFloor) this.landingLight = light;
    } else {
      scene.add.image(sw.xMin, top, 'stairwell', 0).setOrigin(0).setScale(s).setDepth(D.shaft);
      scene.add.image(sw.xMin + 120, top, 'stairwell', 0).setOrigin(0).setScale(s).setFlipX(true).setDepth(D.shaft);
    }
    this.paintFloorNumber(n, top, sw);
  }

  /** Walls, windows and dividers of one unit from the wall_modules art (falls back to the M1 floor_bg crops). */
  buildUnitBackground(apt, top) {
    const { scene, tower, balance } = this;
    const s = ART_SCALE;
    const mod = balance.world.moduleWidthPx;
    const modules = this.has('wall_modules');
    const burned = apt.condition === 'burned';
    for (const room of apt.rooms) {
      for (let m = 0; m < room.modules; m++) {
        const j = room.startModule + m; // module index counted from the front door
        const x0 = apt.side === 'left' ? tower.stairwell.xMin - (j + 1) * mod : tower.stairwell.xMax + j * mod;
        const ab = j % 2 === 0 ? 'a' : 'b';
        if (modules) {
          const base = burned ? 'burned' : MODULE_ART[room.kind] || room.kind;
          const name = hasFrame('wall_modules', `${base}_${ab}`) ? `${base}_${ab}` : `hallway_${ab}`;
          scene.add.image(x0, top, 'wall_modules', frameOf('wall_modules', name)).setOrigin(0).setScale(s).setDepth(D.bg);
          if (apt.condition === 'ransacked') {
            scene.add.image(x0, top, 'wall_modules', frameOf('wall_modules', `ransacked_${ab}`)).setOrigin(0).setScale(s).setDepth(D.bg + 1);
          }
        } else {
          scene.add.image(x0, top, 'floor_bg', frameOf('floor_bg', ROOM_BG[room.kind] || 'wall_concrete')).setOrigin(0).setScale(s)
            .setCrop(0, 0, mod / s, 80).setDepth(D.bg);
        }
        if (room.window && this.has('window_m')) this.addWindow(x0 + mod / 2, top, burned, `${apt.id}-${room.index}-${m}`);
      }
      // doorway on the room's far boundary (not at the wing's end wall)
      if (room.index < apt.rooms.length - 1 && this.has('room_dividers')) {
        scene.add.image(room.farX, top, 'room_dividers', frameOf('room_dividers', burned ? 'doorway_burned' : 'doorway_open'))
          .setOrigin(0.5, 0).setScale(s).setDepth(D.divider);
      }
    }
  }

  /** A window in the middle of a module: glass 32x32 at +4,+4 of the 40x40 art, with the rain overlay on top. */
  addWindow(cx, top, burned, key) {
    const { scene } = this;
    const s = ART_SCALE;
    const frame = burned ? 'broken' : (key.length % 2 ? 'a' : 'b');
    const x = cx - (40 * s) / 2;
    const y = top + WINDOW_Y * s;
    scene.add.image(x, y, 'window_m', frameOf('window_m', frame)).setOrigin(0).setScale(s).setDepth(D.window);
    if (!burned && this.has('rain_window') && scene.anims.exists('rain_window_rain')) {
      scene.add.sprite(x + WINDOW_GLASS * s, y + WINDOW_GLASS * s, 'rain_window', 0).setOrigin(0).setScale(s).setDepth(D.window + 1)
        .play({ key: 'rain_window_rain', startFrame: key.length % 3 });
    }
  }

  /**
   * The floor number painted on the stairwell wall like a stencil: stencil_digits at alpha 0.6, 48 px high
   * (balance.ui.floorNumber); muted text if the sheet is missing.
   */
  paintFloorNumber(n, top, sw) {
    const { scene } = this;
    const cfg = uiConfig().floorNumber;
    const chars = String(n).split('');
    const midX = (sw.xMin + sw.xMax) / 2;
    if (hasSheet('stencil_digits') && this.has('stencil_digits') && chars.every((c) => hasFrame('stencil_digits', c))) {
      const scale = cfg.heightPx / 16;
      const step = 10 * scale + 3;
      chars.forEach((c, i) => {
        scene.add.image(midX - (chars.length * step - 3) / 2 + i * step, top + 56, 'stencil_digits', frameOf('stencil_digits', c))
          .setOrigin(0).setScale(scale).setAlpha(cfg.alpha).setDepth(D.shaft + 2);
      });
      return;
    }
    scene.add.text(midX, top + 56, `${n}`, { fontFamily: FONT, fontSize: `${cfg.heightPx}px`, color: cfg.color }).setOrigin(0.5, 0).setAlpha(cfg.alpha).setDepth(D.shaft + 2);
  }

  addObject(apt, o, floor, line) {
    const def = this.balance.objects[o.objectId];
    const charredSmall = o.objectId === 'charred_debris' && o.was && this.balance.objects[o.was]?.size === 'small';
    const ps = propSprite(o.objectId, { charredSmall });
    if (!def || !ps || !this.has(ps.key)) return;
    const wall = o.layer === 'wall';
    const bottom = line - (wall ? WALL_LIFT : 0);
    const px = ps.size * ART_SCALE;
    const img = this.scene.add.image(o.x, bottom, ps.key, ps.frame).setOrigin(0.5, 1).setScale(ART_SCALE)
      .setDepth(wall ? D.wall : D.prop);
    const debrisSheet = def.size === 'small' ? 'props_s' : 'props_l';
    const debris = this.scene.add.image(o.x, line, debrisSheet, frameOf(debrisSheet, 'debris'))
      .setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(D.debris).setVisible(false);
    const cy = wall ? line - WALL_LIFT - px / 2 : line - 48;
    this.sprites.set(o.id, { img, debris, cx: o.x, cy, halfW: 48, floor, placement: o, def, ps, shown: ps.frame });
  }

  /** An interior door on a room boundary: a door sprite that is salvage once open (tapped like an object). */
  addDoorObject(apt, o, floor, line) {
    const img = this.scene.add.image(o.x, line, 'door', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(D.prop - 1);
    this.doorSprites.set(o.id, img);
    this.sprites.set(o.id, {
      img, cx: o.x, cy: line - 48, halfW: 48, floor, placement: o, def: this.balance.objects[o.objectId], door: apt.interiorDoors.find((d) => d.id === o.id),
    });
  }

  addSurvivor(apt, sv, floor, line) {
    const img = this.scene.add.sprite(sv.x, line, sv.id, 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(D.prop);
    if (this.scene.anims.exists(`${sv.id}_idle`)) img.play(`${sv.id}_idle`);
    this.sprites.set(`survivor:${sv.id}`, { img, cx: sv.x, cy: line - 48, halfW: 48, floor, survivor: sv });
  }

  /** Re-sync everything visible with the game state. */
  refresh() {
    const { state, tower } = this;
    for (const [id, sp] of this.sprites) {
      if (!sp.img || sp.fixture) continue;
      const os = state.objects[id] || {};
      const gone = !!(sp.survivor ? state.survivors[sp.survivor.id]?.recruited : os.dismantled);
      sp.img.setVisible(!gone);
      sp.debris?.setVisible(!!os.dismantled);
      if (sp.door) sp.img.setFrame(frameOf('door', state.doors[id]?.state === 'jammed' ? 'closed' : 'open'));
      else if (sp.ps && sp.ps.openFrame >= 0) {
        // searched containers (and ransacked ones from the start) show their open frame
        const open = !!os.searched || sp.placement.empty === true;
        const want = open ? sp.ps.openFrame : sp.ps.frame;
        if (sp.shown !== want) { sp.img.setFrame(want); sp.shown = want; }
      }
    }
    for (const apt of tower.apartments.values()) {
      this.doorSprites.get(apt.id)?.setFrame(frameOf('door', state.doors[apt.id]?.state === 'jammed' ? 'closed' : 'open'));
    }
    this.refreshPiles();
    this.refreshBuilt();
    this.refreshCrew();
    this.refreshBodies();
  }

  /** Recruited survivors stand at home (their bed); the one you play as is the hero sprite instead. */
  refreshCrew() {
    const { scene, state, tower, balance } = this;
    const want = new Set(residentsAtHome(state));
    for (const [id, img] of this.crew) {
      if (!want.has(id)) { img.destroy(); this.crew.delete(id); }
    }
    for (const id of want) {
      const sp = survivorHomeSpot(state, tower, balance, id);
      let img = this.crew.get(id);
      if (!img) {
        img = scene.add.sprite(sp.x, floorLineY(tower, sp.floor), id, 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(D.prop + 2);
        if (scene.anims.exists(`${id}_idle`)) img.play(`${id}_idle`);
        this.crew.set(id, img);
      }
      img.setPosition(sp.x, floorLineY(tower, sp.floor));
    }
  }

  /** Dead characters stay where they fell (their bag is a pile beside them). */
  refreshBodies() {
    const { scene, state, tower } = this;
    const list = state.bodies || [];
    for (let i = this.bodies.length; i < list.length; i++) {
      const b = list[i];
      const key = this.scene.textures.exists(`${b.char === 'hero' ? 'hero' : b.char}_death`) ? `${b.char}_death` : 'hero_death';
      this.bodies.push(scene.add.image(b.x, floorLineY(tower, b.floor), key, 2).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(D.pile - 1));
    }
  }

  /** Sync placed objects (rain collector, filter, planter, bed) and the barricade with state.build. */
  refreshBuilt() {
    const { scene, state, tower, balance } = this;
    const spots = state.build.spots;
    for (const [key, e] of this.built) {
      if (spots[key]) continue;
      e.img.destroy();
      e.badge.destroy();
      this.built.delete(key);
    }
    let layout = null;
    for (const key in spots) {
      const p = spots[key];
      let e = this.built.get(key);
      if (!e) {
        layout ||= homeSpots(tower, balance);
        const sp = layout.find((s) => s.key === key);
        if (!sp) continue;
        const wall = sp.kind === 'window';
        const line = floorLineY(tower, sp.floor);
        const bottom = line - (wall ? WALL_LIFT : 0);
        const img = scene.add.image(sp.x, bottom, 'build', frameOf('build', p.id)).setOrigin(0.5, 1).setScale(ART_SCALE)
          .setDepth(wall ? D.wall : D.prop);
        const badge = scene.add.text(sp.x + 40, bottom - 96, '', {
          fontFamily: FONT, fontSize: '20px', color: CSS.amber, backgroundColor: '#0d0f12', padding: { x: 5, y: 2 },
        }).setOrigin(0.5).setDepth(D.marker).setVisible(false);
        e = { img, badge, x: sp.x, floor: sp.floor, wall };
        this.built.set(key, e);
      }
      const text = this.badgeText(p);
      if (e.badge.text !== text) e.badge.setText(text).setVisible(text !== '');
    }
    this.refreshBarricade();
  }

  /** Short status shown on a producer in words (no counts): "ready", "needs water". */
  badgeText(p) {
    const recipe = this.balance.recipes[p.id];
    if (!isProducerRecipe(recipe)) return '';
    if (p.waiting) return 'needs water';
    return p.stored > 0 ? 'ready' : '';
  }

  /**
   * Barricade sprite from the 5 damage stages (barricade_stages sheet, `lv<level>_stage_<0-4>`); without that
   * sheet it falls back to build / build_damaged. No HP label, ever.
   */
  refreshBarricade() {
    const { scene, state, tower, balance } = this;
    const b = state.build.barricade;
    if (!b || b.level <= 0) {
      if (this.barricade) this.barricade.img.setVisible(false);
      return;
    }
    if (!this.barricade) {
      const line = floorLineY(tower, tower.homeFloor);
      const img = scene.add.image(tower.barricadeX, line, 'build', 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(D.prop + 1);
      this.barricade = { img, key: '' };
    }
    const max = barricadeMaxHp(state, balance);
    const stage = barricadeStage(b.hp, max, balance);
    let sheet;
    let frame;
    const staged = `lv${b.level}_stage_${stage}`;
    if (hasFrame('barricade_stages', staged)) { sheet = 'barricade_stages'; frame = frameOf(sheet, staged); } else {
      const damaged = stage >= 2;
      const name = `barricade_lv${b.level}`;
      sheet = damaged ? 'build_damaged' : 'build';
      frame = frameOf(sheet, damaged ? `${name}_damaged` : name);
    }
    const k = `${sheet}:${frame}`;
    if (this.barricade.key !== k) { this.barricade.key = k; this.barricade.img.setTexture(sheet, frame); }
    this.barricade.img.setVisible(true).setAlpha(sheet === 'barricade_stages' || b.hp > 0 ? 1 : 0.5);
  }

  /** Shake the barricade when a zombie hits it. */
  shakeBarricade() {
    const e = this.barricade;
    if (!e || e.shaking) return;
    e.shaking = true;
    const x0 = this.tower.barricadeX;
    this.scene.tweens.add({ targets: e.img, x: x0 + 4, yoyo: true, duration: 50, repeat: 1, onComplete: () => { e.img.setX(x0); e.shaking = false; } });
  }

  /**
   * Where a pile is drawn and tapped: beside a standing floor-layer object at the same x, so the object does
   * not steal the tap (wall and floor objects share slots).
   */
  pileX(p) {
    const shift = p.x + 60 > this.tower.floorWidth - 16 ? -60 : 60;
    for (const sp of this.sprites.values()) {
      if (sp.floor !== p.floor || Math.abs(sp.cx - p.x) >= 60) continue;
      const onFloor = sp.fixture ? sp.fixture.layer === 'floor' : sp.placement?.layer === 'floor';
      if (onFloor && (sp.fixture || sp.img?.visible)) return p.x + shift;
    }
    for (const e of this.built.values()) {
      if (e.floor === p.floor && !e.wall && Math.abs(e.x - p.x) < 60) return p.x + shift;
    }
    return p.x;
  }

  refreshPiles() {
    const live = new Set(this.state.piles.map((p) => p.id));
    for (const [id, c] of this.pileSprites) {
      if (!live.has(id)) { c.destroy(); this.pileSprites.delete(id); }
    }
    for (const p of this.state.piles) {
      let c = this.pileSprites.get(p.id);
      const first = p.items[0];
      if (!c) {
        const line = floorLineY(this.tower, p.floor);
        c = this.scene.add.container(p.x, line).setDepth(D.pile);
        c.add([
          this.scene.add.image(0, 0, 'props_s', frameOf('props_s', 'debris')).setOrigin(0.5, 1).setScale(ART_SCALE),
          this.scene.add.image(0, -6, 'icons', frameOf('icons', first.id)).setOrigin(0.5, 1).setScale(5),
        ]);
        this.pileSprites.set(p.id, c);
      }
      c.list[1].setFrame(frameOf('icons', first.id));
      c.x = this.pileX(p);
    }
  }

  /** Dust puff at an object's spot and swap to debris. */
  playDismantle(id) {
    const sp = this.sprites.get(id);
    if (!sp) return;
    const puff = this.scene.add.sprite(sp.cx, sp.cy + 24, 'fx_dust', 0).setScale(6).setDepth(D.marker);
    puff.play('fx_dust_puff');
    puff.once('animationcomplete', () => puff.destroy());
    this.refresh();
  }

  /** Dim the home landing for the attack cue flicker (0 = steady light, up to ~0.6 = a dip). */
  setLandingDip(alpha) {
    this.landingShade?.setAlpha(alpha);
    if (this.landingLight && this.has('stairwell_shaft')) {
      this.landingLight.setFrame(frameOf('stairwell_shaft', alpha > 0.3 ? 'light_unlit' : 'light_lit'));
    }
  }

  /** Centre y of a floor line (helper for UI placement). */
  lineY(floor) { return floorLineY(this.tower, floor); }

  get height() { return worldHeight(this.tower); }

  /**
   * Interactive things on a floor right now.
   * @returns {{type:string,id:string,floor:number,x:number,cy:number,halfW:number,sp?:object,pile?:object,door?:object}[]}
   */
  targetsOnFloor(floor) {
    const { state, tower } = this;
    const line = floorLineY(tower, floor);
    const out = [];
    /** Tap box data: x, sprite size, wall layer (see gameplay/hitAreas.js). */
    const box = (x, img, wall = false) => ({ w: img.displayWidth, h: img.displayHeight, wall, x });
    for (const [id, sp] of this.sprites) {
      if (sp.floor !== floor) continue;
      if (sp.fixture) {
        out.push({ type: 'fixture', id: sp.fixture.kind, floor, ...box(sp.cx, sp.img), cy: sp.cy, halfW: sp.halfW, sp });
        continue;
      }
      const os = state.objects[id] || {};
      const wall = sp.placement?.layer === 'wall';
      if (sp.survivor) { if (!state.survivors[sp.survivor.id]?.recruited) out.push({ type: 'survivor', id: sp.survivor.id, floor, ...box(sp.cx, sp.img), cy: sp.cy, halfW: sp.halfW, sp }); }
      else if (sp.door && state.doors[id]?.state === 'jammed') out.push({ type: 'door', id, floor, ...box(sp.cx, sp.img), cy: sp.cy, halfW: sp.halfW, door: sp.door });
      else if (!os.dismantled) out.push({ type: 'object', id, floor, ...box(sp.cx, sp.img, wall), cy: sp.cy, halfW: sp.halfW, sp });
    }
    for (const [id, img] of this.crew) {
      if (img.y === line) out.push({ type: 'survivor', id, floor, ...box(img.x, img), cy: img.y - 48, halfW: 48, home: true });
    }
    for (const [key, e] of this.built) {
      if (e.floor === floor) out.push({ type: 'built', id: key, floor, ...box(e.x, e.img, e.wall), cy: e.wall ? line - WALL_LIFT - 48 : line - 48, halfW: 48, sp: { img: e.img } });
    }
    const bar = state.build.barricade;
    if (floor === tower.homeFloor && bar.level > 0) {
      out.push({ type: 'barricade', id: 'barricade', floor, x: tower.barricadeX, w: 96, h: 96, wall: false, cy: line - 48, halfW: 48 });
    }
    for (const p of state.piles) {
      if (p.floor === floor) out.push({ type: 'pile', id: p.id, floor, x: this.pileX(p), w: 48, h: 48, wall: false, cy: line - 48, halfW: 48, pile: p });
    }
    for (const apt of tower.floors.get(floor)?.apartments || []) {
      if (state.doors[apt.id]?.state === 'jammed') {
        out.push({ type: 'door', id: apt.id, floor, x: apt.doorX, w: 48, h: 96, wall: false, cy: line - 48, halfW: 48, door: apt.front });
      }
    }
    return out;
  }

  /**
   * Which interactive thing was tapped (GDD 4, BUG-036): objects take taps only on their sprite band, padded to the
   * 96 px minimum width; the gaps, the wall area and the slab under the floor line are walk taps (null).
   * @returns {object|null} a target from targetsOnFloor
   */
  hitTest(wx, wy) {
    const { tower } = this;
    const cfg = { minWidth: this.balance.controls.minHitAreaPx, wallLift: WALL_LIFT };
    const f1 = floorAtY(tower, wy);
    const f2 = tapFloorAtY(tower, wy);
    for (const f of f1 === f2 ? [f1] : [f1, f2]) {
      if (f == null) continue;
      const t = pickTarget(this.targetsOnFloor(f), wx, wy, floorLineY(tower, f), cfg);
      if (t) return t;
    }
    return null;
  }
}

export { floorAtY, FLOOR_LINE };
