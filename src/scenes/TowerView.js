/**
 * Side cutaway of the tower: backgrounds, doors, props, debris, piles, dark rooms.
 * No highlights: nothing pulses, glows or carries a marker (GDD 9); the barricade shows damage by sprite stage only.
 * Renders from floors.json (via the tower index) and the game state; owns tap hit-testing.
 */
import Phaser from 'phaser';
import { frameOf, hasFrame, hasSheet, propSprite } from './art.js';
import {
  ART_SCALE, FLOOR_LINE, WALL_LIFT, floorTopY, floorLineY, floorAtY, roomKey, worldHeight,
} from '../gameplay/layout.js';
import { homeSpots } from '../gameplay/buildSpots.js';
import { barricadeMaxHp, barricadeStage } from '../gameplay/barricade.js';
import { isProducerRecipe } from '../gameplay/producers.js';
import { residentsAtHome, survivorHomeSpot } from '../gameplay/survivors.js';
import { COLORS, CSS, FONT, uiConfig, hex } from './ui.js';

const ROOM_BG = { kitchen: 'wall_tile', bathroom: 'wall_tile', living: 'wall_wallpaper', bedroom: 'wall_wallpaper' };
const FIXTURE_FRAME = { bed: 'hero_bed', workbench: 'workbench' };
/** Door tap half-width: 96 px minimum hit area (balance.controls.minHitAreaPx / 2). */
const DOOR_HALF_W = 48;
const D = { bg: 0, debris: 5, wall: 9, prop: 10, pile: 12, hero: 20, marker: 30, landing: 40, dark: 50 };

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
    this.sprites = new Map(); // placement id -> { img, marker, debris, roomKey, cx, cy, halfW }
    this.dark = new Map(); // roomKey -> rectangle
    this.roomItems = new Map(); // roomKey -> display objects hidden until entered
    this.doorSprites = new Map(); // aptId -> image
    this.pileSprites = new Map(); // pile id -> container
    this.built = new Map(); // spot key -> { img, badge, x }
    this.barricade = null; // { img, key }
    this.landingShade = null; // dark overlay on the home landing for the attack cue flicker
    this.crew = new Map(); // recruited survivor id -> sprite at home
    this.bodies = []; // sprites of dead characters
    this.build();
    this.refresh();
  }

  build() {
    const { scene, tower, balance } = this;
    const s = ART_SCALE;
    for (let n = tower.floorMax; n >= tower.floorMin; n--) {
      const top = floorTopY(tower, n);
      const line = floorLineY(tower, n);
      const f = tower.floors.get(n);
      const crop = (frame, x0, x1) =>
        scene.add.image(0, top, 'floor_bg', frameOf('floor_bg', frame)).setOrigin(0).setScale(s)
          .setCrop(x0 / s, 0, (x1 - x0) / s, 80).setDepth(D.bg);
      crop('wall_concrete', 0, tower.stairwell.xMax);
      scene.add.image(0, top, 'stairwell', 0).setOrigin(0).setScale(s).setDepth(D.bg + 1);
      this.paintFloorNumber(n, top);
      if (n === tower.homeFloor) {
        this.landingShade = scene.add.rectangle(0, top, tower.stairwell.xMax, tower.floorHeight, 0x000000, 1)
          .setOrigin(0).setDepth(D.landing).setAlpha(0);
      }
      for (const apt of f.apartments) {
        for (const room of apt.rooms) {
          crop(ROOM_BG[room.kind] || 'wall_concrete', room.xMin, room.xMax);
          const key = roomKey(apt, room);
          const veil = scene.add.rectangle(room.xMin, top, room.xMax - room.xMin, tower.floorHeight, COLORS.ink, 0.96)
            .setOrigin(0).setDepth(D.dark);
          this.dark.set(key, veil);
          this.roomItems.set(key, []);
        }
        const door = scene.add.image(apt.doorX, line, 'door', 0).setOrigin(0.5, 1).setScale(s).setDepth(D.prop - 1);
        this.doorSprites.set(apt.id, door);
        for (const fx of apt.fixtures || []) {
          const img = scene.add.image(fx.x, line - (fx.layer === 'wall' ? WALL_LIFT : 0), 'build', frameOf('build', FIXTURE_FRAME[fx.kind]))
            .setOrigin(0.5, 1).setScale(s).setDepth(fx.layer === 'wall' ? D.wall : D.prop);
          const cy = fx.layer === 'wall' ? line - WALL_LIFT - 16 * s : line - 16 * s;
          this.sprites.set(`fixture:${fx.kind}`, { img, cx: fx.x, cy, halfW: 48, floor: n, fixture: fx });
        }
        for (const o of apt.objects || []) this.addObject(apt, o, n, line);
        for (const q of apt.questItems || []) this.addQuestItem(apt, q, n, line);
        for (const sv of apt.survivors || []) this.addSurvivor(apt, sv, n, line);
      }
    }
  }

  /**
   * The floor number painted on the stairwell wall like a stencil: stencil_digits at alpha 0.6, 48 px high
   * (balance.ui.floorNumber); muted text if the sheet is missing.
   */
  paintFloorNumber(n, top) {
    const { scene } = this;
    const cfg = uiConfig().floorNumber;
    const chars = String(n).split('');
    if (hasSheet('stencil_digits') && chars.every((c) => hasFrame('stencil_digits', c))) {
      const scale = cfg.heightPx / 16;
      chars.forEach((c, i) => {
        scene.add.image(18 + i * (10 * scale + 3), top + 20, 'stencil_digits', frameOf('stencil_digits', c))
          .setOrigin(0).setScale(scale).setAlpha(cfg.alpha).setDepth(D.bg + 2);
      });
      return;
    }
    scene.add.text(14, top + 20, `${n}`, { fontFamily: FONT, fontSize: `${cfg.heightPx}px`, color: cfg.color }).setAlpha(cfg.alpha).setDepth(D.bg + 2);
  }

  roomOfPlacement(apt, p) {
    return roomKey(apt, apt.rooms.find((r) => r.id === p.room) || apt.rooms[0]);
  }

  addObject(apt, o, floor, line) {
    const def = this.balance.objects[o.objectId];
    const ps = propSprite(o.objectId);
    if (!def || !ps) return;
    const wall = o.layer === 'wall';
    const bottom = line - (wall ? WALL_LIFT : 0);
    const px = ps.size * ART_SCALE;
    const img = this.scene.add.image(o.x, bottom, ps.key, ps.frame).setOrigin(0.5, 1).setScale(ART_SCALE)
      .setDepth(wall ? D.wall : D.prop);
    const debris = this.scene.add.image(o.x, line, def.size === 'small' ? 'props_s' : 'props_l',
      frameOf(def.size === 'small' ? 'props_s' : 'props_l', 'debris'))
      .setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(D.debris).setVisible(false);
    const key = this.roomOfPlacement(apt, o);
    const cy = wall ? line - WALL_LIFT - px / 2 : line - 48;
    this.sprites.set(o.id, { img, debris, roomKey: key, cx: o.x, cy, halfW: 48, floor, placement: o, def });
    this.roomItems.get(key)?.push(img, debris);
  }

  addQuestItem(apt, q, floor, line) {
    const img = this.scene.add.image(q.x, line, 'icons', frameOf('icons', q.itemId)).setOrigin(0.5, 1).setScale(6).setDepth(D.pile);
    const key = this.roomOfPlacement(apt, q);
    this.sprites.set(q.id, { img, roomKey: key, cx: q.x, cy: line - 48, halfW: 48, floor, placement: q, quest: true });
    this.roomItems.get(key)?.push(img);
  }

  addSurvivor(apt, sv, floor, line) {
    const img = this.scene.add.sprite(sv.x, line, sv.id, 0).setOrigin(0.5, 1).setScale(ART_SCALE).setDepth(D.prop);
    if (this.scene.anims.exists(`${sv.id}_idle`)) img.play(`${sv.id}_idle`);
    const key = this.roomOfPlacement(apt, sv);
    this.sprites.set(`survivor:${sv.id}`, { img, roomKey: key, cx: sv.x, cy: line - 48, halfW: 48, floor, survivor: sv });
    this.roomItems.get(key)?.push(img);
  }

  /** Re-sync everything visible with the game state. */
  refresh() {
    const { state, tower } = this;
    for (const [key, veil] of this.dark) {
      const entered = !!state.rooms[key];
      const items = this.roomItems.get(key);
      if (entered && veil.visible && !veil.fading) {
        veil.fading = true;
        this.scene.tweens.add({ targets: veil, alpha: 0, duration: 350, onComplete: () => veil.setVisible(false) });
      } else if (!entered) {
        veil.setVisible(true).setAlpha(0.96);
        veil.fading = false;
      }
      items.forEach((i) => i.setData('hiddenByDark', !entered));
    }
    for (const [id, sp] of this.sprites) {
      if (!sp.img) continue;
      const entered = !sp.roomKey || !!state.rooms[sp.roomKey];
      if (sp.fixture) continue;
      const os = state.objects[id] || {};
      const gone = !!(sp.survivor ? state.survivors[sp.survivor.id]?.recruited : sp.quest ? os.taken : os.dismantled);
      sp.img.setVisible(entered && !gone);
      sp.debris?.setVisible(entered && !!os.dismantled);
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
  setLandingDip(alpha) { this.landingShade?.setAlpha(alpha); }

  /** Centre y of a floor line (helper for UI placement). */
  lineY(floor) { return floorLineY(this.tower, floor); }

  get height() { return worldHeight(this.tower); }

  /**
   * Interactive things on a floor right now (entered rooms only).
   * @returns {{type:string,id:string,floor:number,x:number,cy:number,halfW:number,sp?:object,pile?:object,apt?:object}[]}
   */
  targetsOnFloor(floor) {
    const { state, tower } = this;
    const out = [];
    for (const [id, sp] of this.sprites) {
      if (sp.floor !== floor) continue;
      if (sp.fixture) {
        out.push({ type: 'fixture', id: sp.fixture.kind, floor, x: sp.cx, cy: sp.cy, halfW: sp.halfW, sp });
        continue;
      }
      if (sp.roomKey && !state.rooms[sp.roomKey]) continue;
      const os = state.objects[id] || {};
      if (sp.survivor) { if (!state.survivors[sp.survivor.id]?.recruited) out.push({ type: 'survivor', id: sp.survivor.id, floor, x: sp.cx, cy: sp.cy, halfW: sp.halfW, sp }); }
      else if (sp.quest) { if (!os.taken) out.push({ type: 'quest', id, floor, x: sp.cx, cy: sp.cy, halfW: sp.halfW, sp }); }
      else if (!os.dismantled) out.push({ type: 'object', id, floor, x: sp.cx, cy: sp.cy, halfW: sp.halfW, sp });
    }
    for (const [id, img] of this.crew) {
      if (img.y === floorLineY(tower, floor)) out.push({ type: 'survivor', id, floor, x: img.x, cy: img.y - 48, halfW: 48, home: true });
    }
    for (const [key, e] of this.built) {
      if (e.floor === floor) out.push({ type: 'built', id: key, floor, x: e.x, cy: e.wall ? floorLineY(tower, floor) - WALL_LIFT - 48 : floorLineY(tower, floor) - 48, halfW: 48, sp: { img: e.img } });
    }
    const bar = state.build.barricade;
    if (floor === tower.homeFloor && bar.level > 0) {
      // narrow on purpose: taps beside the sprite are plain walking taps (the stairwell landing)
      out.push({ type: 'barricade', id: 'barricade', floor, x: tower.barricadeX, cy: floorLineY(tower, floor) - 48, halfW: 24 });
    }
    for (const p of state.piles) {
      if (p.floor === floor) out.push({ type: 'pile', id: p.id, floor, x: this.pileX(p), cy: floorLineY(tower, floor) - 48, halfW: 48, pile: p });
    }
    for (const apt of tower.floors.get(floor)?.apartments || []) {
      if (state.doors[apt.id]?.state === 'jammed') {
        out.push({ type: 'door', id: apt.id, floor, x: apt.doorX, cy: floorLineY(tower, floor) - 48, halfW: DOOR_HALF_W, apt });
      }
    }
    return out;
  }

  /**
   * Which interactive thing was tapped (96x96 hit areas, nearest centre wins).
   * @returns {object|null} a target from targetsOnFloor
   */
  hitTest(wx, wy) {
    const floor = floorAtY(this.tower, wy);
    if (floor == null) return null;
    let best = null;
    let bestD = Infinity;
    for (const t of this.targetsOnFloor(floor)) {
      const dx = Math.abs(wx - t.x);
      const dy = Math.abs(wy - t.cy);
      if (dx > t.halfW || dy > 48) continue;
      const d = Math.hypot(dx, dy);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }
}

export { floorAtY, FLOOR_LINE };
