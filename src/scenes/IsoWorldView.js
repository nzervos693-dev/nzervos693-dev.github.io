/**
 * Renders the isometric floor: tiles, derived walls with cutaway, doors, windows, props, piles and the
 * vision "darkness" (per-sprite tint by tile state, see below). View only: rules live in src/iso and
 * src/gameplay/isoView.js.
 *
 * Vision is drawn by TINTING every sprite with the brightness of its tile(s) instead of laying a
 * diamond overlay on the floor: tall walls and props then darken correctly, unknown tiles are simply not
 * drawn (the background is the unknown colour #0b0c0e) and remembered tiles get a cool dim tint. Per-tile
 * brightness eases toward its target over vision.overlayCrossFadeSeconds, and sprites are only re-tinted
 * while something is easing or when the vision revision changed.
 *
 * Draw order: depth = core depth key / 1000 so the whole world stays below the HUD (depth 1000+).
 */
import { frameOf, hasFrame } from './art.js';
import { LAYER, depthKey, wallDepthKey, footprintDepthKey } from '../iso/projection.js';
import { FLOOR_BY_TYPE, FINISH_BY_TYPE } from '../iso/loader.js';
import { VIS } from '../iso/vision.js';
import {
  tileBrightness, tintOf, shade, activeRooms, wallIsCut, doorFrameName, barricadeArtStage, propOrientation,
} from '../gameplay/isoView.js';
import { barricadeStage, barricadeMaxHp } from '../gameplay/barricade.js';

const S = 3; // 1 art px = 3 game px
export const DEPTH_DIV = 1000;
/** Depth for iso keys: keeps world sprites below the HUD. */
export const isoDepth = (key) => key / DEPTH_DIV;
const PROP_ORIGIN = [0.5, 48 / 56];
const BIG_ORIGIN = [0.5, 52 / 72];
const DOOR_ORIGIN = [0, 0];
const WALL_H = 120; // game px (40 art px)
const EPS = 0.004;

export default class IsoWorldView {
  /**
   * @param {Phaser.Scene} scene
   * @param {{floor:object, state:object, balance:object, vision:import('../iso/vision.js').VisionMap, iso:object}} ctx
   */
  constructor(scene, ctx) {
    this.scene = scene;
    this.floor = ctx.floor;
    this.state = ctx.state;
    this.balance = ctx.balance;
    this.vision = ctx.vision;
    this.iso = ctx.iso;
    const W = this.floor.width;
    const H = this.floor.height;
    this.n = W * H;
    this.target = new Float32Array(this.n);
    this.bright = new Float32Array(this.n);
    this.remembered = new Uint8Array(this.n);
    this.active = new Uint8Array(this.floor.rooms.length);
    this.vcfg = this.balance.vision;
    this.fadeRate = 1 / (this.vcfg.overlayCrossFadeSeconds || 0.15);
    this.cutRate = 1 / this.balance.iso.cutawayFadeSeconds;
    this.occAlpha = this.balance.iso.occluderFadeAlpha;
    this.tall = new Set(this.balance.iso.tallObjects);
    this.stages = this.balance.doors.visualStages;
    this.entries = []; // everything tinted by tile brightness: {sprites:[], tiles:[], b, rem, hidden, forceHide}
    this.walls = [];
    this.doors = new Map(); // door id -> entry
    this.props = [];
    this.propById = new Map();
    this.pileSprites = [];
    this.blood = [];
    this.dirty = true;
    this.occludedKey = '';
    this.lastRevision = -1;
    this.buildFloors();
    this.buildWalls();
    this.buildProps();
    this.buildStairs();
    this.buildStencil();
    this.refreshObjects();
  }

  // ---------------------------------------------------------------- helpers

  img(key, name, x, y, ox, oy, depth) {
    const im = this.scene.add.image(x, y, key, frameOf(key, name)).setOrigin(ox, oy).setScale(S).setDepth(depth);
    return im;
  }

  /** Register sprites to be tinted by the best brightness of `tiles`. */
  track(sprites, tiles) {
    const e = { sprites, tiles, b: -1, rem: false, hidden: false, forceHide: false, fh: false };
    this.entries.push(e);
    return e;
  }

  tileIdx(x, y) { return y * this.floor.width + x; }

  // ---------------------------------------------------------------- build

  buildFloors() {
    const f = this.floor;
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const ri = f.roomIndex[y * f.width + x];
        if (ri < 0) continue;
        const type = f.rooms[ri].type;
        const fam = FLOOR_BY_TYPE[type] ?? 'hallway';
        const variant = ((x * 7 + y * 13) >> 1) & 1;
        const name = `${f.grid.kindAt(x, y) === 2 ? 'landing' : fam}_${variant}`;
        const im = this.img('iso_floor', name, (x - y) * 48, (x + y + 1) * 24, 0.5, 0.5, isoDepth(depthKey(x, y, LAYER.FLOOR)));
        this.track([im], [y * f.width + x]);
      }
    }
  }

  wallFrame(w, stub) {
    const h = stub ? 'stub' : 'full';
    const f = this.floor;
    if (w.kind === 'window') return `wall_${w.axis}_${h}_window`;
    if (w.kind === 'elevator') return `door_${w.axis}_${h}_closed`;
    let ri = w.roomB >= 0 ? w.roomB : w.roomA;
    let finish = FINISH_BY_TYPE[f.rooms[ri].type] ?? 'plaster';
    if (w.roomB < 0 || w.roomA < 0) finish = w.roomB < 0 ? 'concrete' : finish;
    return `wall_${w.axis}_${h}_${finish}`;
  }

  buildWalls() {
    const f = this.floor;
    for (const w of f.walls) {
      const vx = (w.x - w.y) * 48;
      const vy = (w.x + w.y) * 24;
      const px = w.axis === 'x' ? vx : vx - 48;
      const py = vy - WALL_H;
      const depth = isoDepth(wallDepthKey(w.x, w.y, w.side));
      const rec = {
        w, cut: false, fullA: 1, stubA: 0, fullT: 1, stubT: 0, occ: false, full: null, stub: null, door: null, bar: null,
        vx, vy, tiles: [], tintFull: 0xffffff,
      };
      const tiles = [];
      if (w.roomA >= 0) tiles.push(this.tileIdx(w.a.x, w.a.y));
      if (w.roomB >= 0) tiles.push(this.tileIdx(w.b.x, w.b.y));
      rec.tiles = tiles;
      if (w.kind === 'door') {
        const door = f.grid.doors.get(f.grid.edgeId(w.x, w.y, w.side));
        rec.door = door;
        const [ta, tb] = f.grid.doorTiles(door);
        const e = { door, w, rec, shown: null, ia: this.tileIdx(ta.x, ta.y), ib: this.tileIdx(tb.x, tb.y) };
        this.doors.set(door.id, e);
        rec.doorEntry = e;
      }
      const nameFull = rec.door ? doorFrameName(rec.door, w.axis, false, this.stages) : this.wallFrame(w, false);
      const nameStub = rec.door ? doorFrameName(rec.door, w.axis, true, this.stages) : this.wallFrame(w, true);
      rec.full = this.img('iso_walls', nameFull, px, py, 0, 0, depth);
      const cuttable = w.roomA >= 0;
      const sprites = [rec.full];
      if (cuttable) {
        rec.stub = this.img('iso_walls', nameStub, px, py, 0, 0, depth).setAlpha(0);
        sprites.push(rec.stub);
      }
      if (w.kind === 'door' && f.home && w.doorId === f.home.frontDoor) rec.hasBarricadeSpot = true;
      if (rec.door) {
        rec.bar = this.img('iso_walls', 'barricade_' + w.axis + '_lv1_0', px, py, 0, 0, depth + EPS).setVisible(false);
        sprites.push(rec.bar);
      }
      rec.px = px;
      rec.py = py;
      rec.depth = depth;
      rec.entry = this.track(sprites, tiles);
      this.walls.push(rec);
      if (w.kind === 'window' && w.curtains) this.addCurtains(w, tiles);
    }
    this.refreshDoors(true);
  }

  addCurtains(w, tiles) {
    if (!hasFrame('iso_props', 'curtains_a')) return;
    const f = this.floor;
    // curtains hang on north/west walls only: on south/east walls they would stand in front of the room (those walls are cut)
    if (w.roomB < 0) return;
    const t = w.b;
    const flip = false;
    const name = w.axis === 'x' ? 'curtains_a' : 'curtains_b';
    const im = this.img('iso_props', name, (t.x - t.y) * 48, (t.x + t.y + 1) * 24, PROP_ORIGIN[0], PROP_ORIGIN[1], isoDepth(depthKey(t.x, t.y, LAYER.OBJECT)) - EPS).setFlipX(flip);
    this.track([im], [this.tileIdx(t.x, t.y)]);
  }

  propFrame(o) {
    const objectId = o.fixture ? o.objectId : (o.id === this.floor.home?.bed ? 'hero_bed' : o.objectId);
    const { suffix, flip } = propOrientation(o.span, o.facing);
    const big = hasFrame('iso_props_l', `${objectId}_a`);
    const key = big ? 'iso_props_l' : 'iso_props';
    return { key, big, flip, name: `${objectId}_${suffix}`, openName: `${objectId}_open_${suffix}`, objectId };
  }

  buildProps() {
    const f = this.floor;
    const mk = (o) => {
      const pf = this.propFrame(o);
      if (!hasFrame(pf.key, pf.name)) return null;
      const cx = o.tile[0] + o.span[0] / 2;
      const cy = o.tile[1] + o.span[1] / 2;
      const org = pf.big ? BIG_ORIGIN : PROP_ORIGIN;
      const depth = isoDepth(footprintDepthKey(o.tile[0], o.tile[1], o.span[0], o.span[1], LAYER.OBJECT));
      const sp = this.img(pf.key, pf.name, (cx - cy) * 48, (cx + cy) * 24, org[0], org[1], depth).setFlipX(pf.flip);
      const tiles = o.tiles.map((t) => this.tileIdx(t.x, t.y));
      const tall = this.tall.has(o.objectId);
      const rec = { o, sp, pf, tiles, tall, a: 1, aT: 1, depth, cx: sp.x, cy: sp.y, big: pf.big };
      rec.entry = this.track([sp], tiles);
      this.props.push(rec);
      this.propById.set(o.id, rec);
      return rec;
    };
    for (const o of f.objects) mk(o);
  }

  buildStairs() {
    const f = this.floor;
    if (!f.stairwell) return;
    const place = (flight, frameBase) => {
      const tiles = flight.tiles;
      const minX = Math.min(...tiles.map((t) => t[0]));
      const minY = Math.min(...tiles.map((t) => t[1]));
      const maxY = Math.max(...tiles.map((t) => t[1]));
      // 2x2 pieces from the landing end (south) toward the north; the odd row stays flat landing
      for (let y = maxY - 2; y >= minY; y -= 2) {
        const sp = this.img('iso_stairs', frameBase, (minX - y) * 48, (minX + y + 2) * 24, 0.5, 44 / 64, isoDepth(depthKey(minX + 1, y + 1, LAYER.OBJECT)));
        this.track([sp], [this.tileIdx(minX, y), this.tileIdx(minX + 1, y + 1)]);
      }
    };
    place(f.stairwell.downFlight, 'stairs_down_ne');
    place(f.stairwell.upFlight, 'stairs_up_ne');
  }

  /** The floor number stencilled on the landing's north wall: always visible, never cut. */
  buildStencil() {
    const sn = this.floor.stairwell?.floorNumber;
    if (!sn || !hasFrame('stencil_digits', '1')) return;
    const text = String(sn.text);
    const vx = (sn.x - sn.y) * 48; // north edge of tile (x,y): x frames start at the edge's vertex
    const vy = (sn.x + sn.y) * 24;
    const total = text.length * 30 + (text.length - 1) * 6;
    // centre on the 2-tile elevator door gap: wall midpoint (x+1) along the edge
    const mx = vx + 48; // edge runs lower-right: midpoint of 2 tiles
    const my = vy + 24 - 70;
    for (let i = 0; i < text.length; i++) {
      const x = mx - total / 2 + 15 + i * 36; // flat on screen: a simple stencil
      const im = this.scene.add.image(x, my, 'stencil_digits', frameOf('stencil_digits', text[i])).setScale(S).setAlpha(0.6).setDepth(isoDepth(wallDepthKey(sn.x, sn.y, 'N')) + EPS * 2);
      const tiles = [this.tileIdx(sn.x, sn.y), this.tileIdx(sn.x + 1, sn.y)];
      this.track([im], tiles);
    }
  }

  // ---------------------------------------------------------------- state refresh

  /** Doors (state, damage stage, barricade) as last seen: a door is redrawn only while one of its tiles is Visible. */
  refreshDoors(force = false) {
    const g = this.floor.grid;
    const bar = this.state.build.barricade;
    for (const e of this.doors.values()) {
      const seen = this.vision.visible[e.ia] !== 0 || this.vision.visible[e.ib] !== 0;
      if (!seen && !force) continue;
      const d = e.door;
      const key = `${d.state}|${Math.round(d.hp)}|${d.barricade ? Math.round(d.barricade.hp) : -1}`;
      if (key === e.shown) continue;
      e.shown = key;
      const rec = e.rec;
      const ax = rec.w.axis;
      rec.full.setFrame(frameOf('iso_walls', doorFrameName(d, ax, false, this.stages)));
      rec.stub?.setFrame(frameOf('iso_walls', doorFrameName(d, ax, true, this.stages)));
      const hasBar = d.barricade && d.barricade.hp > 0;
      if (hasBar) {
        const lvl = bar.level >= 2 ? 2 : 1;
        const st = barricadeArtStage(barricadeStage(d.barricade.hp, barricadeMaxHp(this.state, this.balance), this.balance));
        rec.bar.setFrame(frameOf('iso_walls', `barricade_${ax}_lv${lvl}_${st}`));
      }
      rec.barOn = !!hasBar;
      rec.bar.setVisible(false);
      this.dirty = true;
    }
  }

  /** Props: searched ones show their open frame, dismantled ones disappear. */
  refreshObjects() {
    for (const rec of this.props) {
      if (rec.o.stash) continue;
      const os = this.state.objects[rec.o.id];
      rec.gone = !!os?.dismantled;
      const open = !!os?.searched && hasFrame(rec.pf.key, rec.pf.openName);
      const want = open ? rec.pf.openName : rec.pf.name;
      if (rec.frame !== want) { rec.frame = want; rec.sp.setFrame(frameOf(rec.pf.key, want)); }
      if (rec.entry.forceHide !== rec.gone) { rec.entry.forceHide = rec.gone; this.dirty = true; }
    }
  }

  /** Piles on the floor (pooled sprites). */
  refreshPiles() {
    const piles = this.state.piles;
    while (this.pileSprites.length < piles.length) {
      const sp = this.img('iso_props', 'debris_clothes', 0, 0, PROP_ORIGIN[0], PROP_ORIGIN[1], 0);
      this.pileSprites.push({ sp, entry: null });
    }
    for (let i = 0; i < this.pileSprites.length; i++) {
      const ps = this.pileSprites[i];
      const p = piles[i];
      if (!p) { ps.sp.setVisible(false); if (ps.entry) ps.entry.forceHide = true; continue; }
      const tx = Math.floor(p.x);
      const ty = Math.floor(p.y);
      ps.sp.setPosition((tx - ty) * 48, (tx + ty + 1) * 24).setDepth(isoDepth(depthKey(tx, ty, LAYER.OBJECT, 5)));
      ps.pile = p;
      if (!ps.entry) { ps.entry = this.track([ps.sp], [this.tileIdx(tx, ty)]); } else ps.entry.tiles[0] = this.tileIdx(tx, ty);
      ps.entry.forceHide = false;
    }
    this.dirty = true;
  }

  // ---------------------------------------------------------------- vision

  /** Recompute per-tile targets and wall cuts after a vision update. @param {{x:number,y:number}} heroTile */
  onVision(heroTile) {
    const v = this.vision;
    const f = this.floor;
    const hx = heroTile.x;
    const hy = heroTile.y;
    for (let y = 0; y < f.height; y++) {
      for (let x = 0; x < f.width; x++) {
        const i = y * f.width + x;
        const vis = v.visible[i];
        const seen = v.seen[i] === 1;
        const close = (x - hx) * (x - hx) + (y - hy) * (y - hy) <= 2.25;
        this.target[i] = tileBrightness(this.vcfg, vis, seen, f.light[i], close);
        this.remembered[i] = vis === VIS.NONE ? 1 : 0;
      }
    }
    activeRooms(f, v, heroTile, this.active);
    for (const w of this.walls) {
      const cut = wallIsCut(w.w, this.active);
      if (cut !== w.cut) w.cut = cut;
      this.setWallTargets(w);
    }
    this.refreshDoors();
    this.dirty = true;
    this.lastRevision = v.revision;
  }

  setWallTargets(w) {
    w.fullT = w.cut ? 0 : w.occ ? this.occAlpha : 1;
    w.stubT = w.cut ? 1 : 0;
  }

  /**
   * Per-frame: ease tile brightness and wall alphas, then re-tint what changed.
   * @param {number} dt seconds
   */
  update(dt) {
    let moving = this.dirty;
    const step = this.fadeRate * dt;
    for (let i = 0; i < this.n; i++) {
      const t = this.target[i];
      const c = this.bright[i];
      if (c === t) continue;
      moving = true;
      this.bright[i] = c < t ? Math.min(t, c + step) : Math.max(t, c - step);
    }
    const cs = this.cutRate * dt;
    for (let k = 0; k < this.walls.length; k++) {
      const w = this.walls[k];
      if (w.fullA !== w.fullT) { moving = true; w.fullA = w.fullA < w.fullT ? Math.min(w.fullT, w.fullA + cs) : Math.max(w.fullT, w.fullA - cs); }
      if (w.stubA !== w.stubT) { moving = true; w.stubA = w.stubA < w.stubT ? Math.min(w.stubT, w.stubA + cs) : Math.max(w.stubT, w.stubA - cs); }
    }
    for (let k = 0; k < this.props.length; k++) {
      const p = this.props[k];
      if (p.a !== p.aT) { moving = true; p.a = p.a < p.aT ? Math.min(p.aT, p.a + cs) : Math.max(p.aT, p.a - cs); }
    }
    if (!moving) return;
    this.dirty = false;
    this.applyTints();
  }

  applyTints() {
    const br = this.bright;
    const rem = this.remembered;
    const es = this.entries;
    for (let k = 0; k < es.length; k++) {
      const e = es[k];
      let b = 0;
      let isRem = true;
      const t = e.tiles;
      for (let j = 0; j < t.length; j++) {
        const v = br[t[j]];
        if (v > b) b = v;
        if (!rem[t[j]]) isRem = false;
      }
      const hide = e.forceHide || b < 0.012;
      const s = e.sprites;
      if (hide) {
        if (!e.hidden) { e.hidden = true; for (let m = 0; m < s.length; m++) s[m].setVisible(false); }
        e.b = -1;
        continue;
      }
      // only re-tint what changed
      if (!e.hidden && Math.abs(b - e.b) < 0.002 && isRem === e.rem) continue;
      e.hidden = false;
      const tint = tintOf(shade(b, isRem), isRem);
      for (let m = 0; m < s.length; m++) s[m].setTint(tint).setVisible(true);
      e.b = b;
      e.rem = isRem;
    }
    // wall alphas and barricade visibility (override visibility set above)
    for (let k = 0; k < this.walls.length; k++) {
      const w = this.walls[k];
      if (w.entry.hidden) continue;
      w.full.setAlpha(w.fullA).setVisible(w.fullA > 0.01);
      if (w.stub) w.stub.setAlpha(w.stubA).setVisible(w.stubA > 0.01);
      if (w.bar) {
        const ghost = w.ghost > 0 && !w.barOn; // placement ghost of a barricade not built yet
        w.bar.setVisible(!!w.barOn || ghost).setAlpha(ghost ? w.ghost : w.cut ? w.stubA : w.fullA);
        if (w.barOn || ghost) { if (w.cut) w.bar.setCrop(0, 28, 16, 20); else w.bar.setCrop(); }
      }
    }
    for (let k = 0; k < this.props.length; k++) {
      const p = this.props[k];
      if (!p.entry.hidden) p.sp.setAlpha(p.a);
    }
  }

  // ---------------------------------------------------------------- occluders

  /**
   * Fade full walls and tall props that cover an actor. Actors are screen feet points + depth keys.
   * @param {{x:number,y:number,depth:number}[]} actors feet position (world px) and iso depth (not divided)
   * @param {number} count
   */
  updateOcclusion(actors, count) {
    for (let k = 0; k < this.walls.length; k++) {
      const w = this.walls[k];
      let occ = false;
      if (!w.cut && w.fullT > 0 || w.occ) {
        for (let a = 0; a < count && !occ; a++) occ = this.coversActor(w, actors[a]);
      }
      if (occ !== w.occ) { w.occ = occ; this.setWallTargets(w); }
    }
    for (let k = 0; k < this.props.length; k++) {
      const p = this.props[k];
      if (!p.tall) continue;
      let occ = false;
      for (let a = 0; a < count && !occ; a++) occ = this.propCovers(p, actors[a]);
      p.aT = occ ? this.occAlpha : 1;
    }
  }

  /** Does wall rec `w` (full height, drawn after the actor) overlap the actor's body? */
  coversActor(w, a) {
    if (w.depth <= a.depth / DEPTH_DIV) return false;
    const x = a.x;
    const u = w.w.axis === 'x' ? (x - w.vx) / 48 : (w.vx - x) / 48;
    if (u < -0.15 || u > 1.15) return false;
    const base = w.vy + 24 * Math.max(0, Math.min(1, u));
    // three points up the body (feet, waist, head) must fall inside the wall's parallelogram
    for (let h = 8; h <= 88; h += 40) {
      const y = a.y - h;
      if (y <= base && y >= base - WALL_H) return true;
    }
    return false;
  }

  propCovers(p, a) {
    if (p.depth <= a.depth / DEPTH_DIV) return false;
    const w = (p.big ? 64 : 32) * S * 0.5;
    const top = p.sp.y - 40 * S;
    return Math.abs(a.x - p.cx) < w * 0.7 && a.y - 90 < p.cy && a.y > top;
  }

  /**
   * Show (alpha > 0) or hide a ghost of the Lv1 barricade over a door while the hero targets it in placement mode
   * (GDD 5.6; alpha = controls.target.ghostAlpha). Pass null to remove it.
   */
  setGhost(door, alpha) {
    const id = door ? door.id : null;
    if (id === this.ghostId && (alpha > 0) === (this.ghostAlpha > 0)) return;
    const old = this.ghostId ? this.doors.get(this.ghostId)?.rec : null;
    if (old) old.ghost = 0;
    this.ghostId = id;
    this.ghostAlpha = alpha;
    const rec = id ? this.doors.get(id)?.rec : null;
    if (rec) {
      rec.ghost = alpha;
      if (!rec.barOn) rec.bar.setFrame(frameOf('iso_walls', `barricade_${rec.w.axis}_lv1_0`));
    }
    this.dirty = true;
  }

  // ---------------------------------------------------------------- queries

  /** Door midpoint in world px. */
  doorMid(door) {
    const x = door.side === 'N' ? door.x + 0.5 : door.x;
    const y = door.side === 'N' ? door.y : door.y + 0.5;
    return { x: (x - y) * 48, y: (x + y) * 24 };
  }

  /** Best vision state of a list of tile indices: 'visible' | 'remembered' | 'unknown'. */
  stateOfTiles(tiles) {
    let best = 'unknown';
    for (const t of tiles) {
      if (this.vision.visible[t]) return 'visible';
      if (this.vision.seen[t]) best = 'remembered';
    }
    return best;
  }

  /** Shake a door sprite pair (zombie banging, jammed hit). */
  rattleDoor(door) {
    const e = this.doors.get(door.id);
    if (!e) return;
    const targets = [e.rec.full, e.rec.stub, e.rec.bar].filter(Boolean);
    this.scene.tweens.add({ targets, x: '+=4', yoyo: true, duration: 50, repeat: 2, onComplete: () => { for (const t of targets) t.x = e.rec.px; } });
  }
}
