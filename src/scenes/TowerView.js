/**
 * Side cutaway of the tower: backgrounds, doors, props, debris, piles, dark rooms.
 * Renders from floors.json (via the tower index) and the game state; owns tap hit-testing.
 */
import Phaser from 'phaser';
import { frameOf, propSprite } from './art.js';
import {
  ART_SCALE, FLOOR_LINE, WALL_LIFT, floorTopY, floorLineY, floorAtY, roomKey, worldHeight,
} from '../gameplay/layout.js';
import { COLORS, CSS, FONT } from './ui.js';

const ROOM_BG = { kitchen: 'wall_tile', bathroom: 'wall_tile', living: 'wall_wallpaper', bedroom: 'wall_wallpaper' };
const FIXTURE_FRAME = { bed: 'hero_bed', workbench: 'workbench' };
/** Door tap half-width: 96 px minimum hit area (balance.controls.minHitAreaPx / 2). */
const DOOR_HALF_W = 48;
const D = { bg: 0, debris: 5, wall: 9, prop: 10, pile: 12, hero: 20, marker: 30, dark: 50 };

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
    this.pulsing = [];
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
      scene.add.text(14, top + 20, `${n}`, { fontFamily: FONT, fontSize: '28px', color: CSS.amber }).setDepth(D.bg + 2);
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
          this.pulsing.push(img);
        }
        for (const o of apt.objects || []) this.addObject(apt, o, n, line);
        for (const q of apt.questItems || []) this.addQuestItem(apt, q, n, line);
        for (const sv of apt.survivors || []) this.addSurvivor(apt, sv, n, line);
      }
    }
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
    const marker = this.scene.add.circle(o.x + px / 2 - 6, bottom - px + 6, 7, COLORS.amber).setStrokeStyle(2, COLORS.ink)
      .setDepth(D.marker).setVisible(false);
    const key = this.roomOfPlacement(apt, o);
    const cy = wall ? line - WALL_LIFT - px / 2 : line - 48;
    this.sprites.set(o.id, { img, debris, marker, roomKey: key, cx: o.x, cy, halfW: 48, floor, placement: o, def });
    this.roomItems.get(key)?.push(img, debris, marker);
    this.pulsing.push(img);
  }

  addQuestItem(apt, q, floor, line) {
    const img = this.scene.add.image(q.x, line, 'icons', frameOf('icons', q.itemId)).setOrigin(0.5, 1).setScale(6).setDepth(D.pile);
    const key = this.roomOfPlacement(apt, q);
    this.sprites.set(q.id, { img, roomKey: key, cx: q.x, cy: line - 48, halfW: 48, floor, placement: q, quest: true });
    this.roomItems.get(key)?.push(img);
    this.pulsing.push(img);
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
      const gone = !!(sp.quest ? os.taken : os.dismantled);
      sp.img.setVisible(entered && !gone);
      sp.debris?.setVisible(entered && !!os.dismantled);
      sp.marker?.setVisible(entered && !gone && !!os.leftover?.length);
    }
    for (const apt of tower.apartments.values()) {
      this.doorSprites.get(apt.id)?.setFrame(frameOf('door', state.doors[apt.id]?.state === 'jammed' ? 'closed' : 'open'));
    }
    this.refreshPiles();
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

  /** Subtle amber pulse on tappable things. Call a few times per second. */
  update(time) {
    const p = 0.5 + 0.5 * Math.sin(time / 600);
    const g = Math.round(255 - 36 * p);
    const b = Math.round(255 - 110 * p);
    const tint = (255 << 16) | (g << 8) | b;
    const cam = this.scene.cameras.main;
    const y0 = cam.scrollY - 100;
    const y1 = cam.scrollY + cam.height + 100;
    for (const img of this.pulsing) {
      if (!img.visible || img.y < y0 || img.y - img.displayHeight > y1) continue;
      img.setTint(tint);
    }
  }

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
      if (sp.survivor) out.push({ type: 'survivor', id: sp.survivor.id, floor, x: sp.cx, cy: sp.cy, halfW: sp.halfW, sp });
      else if (sp.quest) { if (!os.taken) out.push({ type: 'quest', id, floor, x: sp.cx, cy: sp.cy, halfW: sp.halfW, sp }); }
      else if (!os.dismantled) out.push({ type: 'object', id, floor, x: sp.cx, cy: sp.cy, halfW: sp.halfW, sp });
    }
    for (const p of state.piles) {
      if (p.floor === floor) out.push({ type: 'pile', id: p.id, floor, x: p.x, cy: floorLineY(tower, floor) - 48, halfW: 48, pile: p });
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
