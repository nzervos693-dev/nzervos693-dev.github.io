/**
 * Edge structures of one iso floor (GDD 5.19 / 5.20, Stage C2). Pure, no Phaser.
 *
 * The Grid (src/iso/grid.js) only knows NONE / WALL / WINDOW / DOOR per edge. This module adds what
 * building needs on top of it: an edge KIND (exterior, shaft, perimeter, gate, block, partition, open),
 * a piece TIER, hit points, an optional OVERLAY (boards / plating) and a damage STAGE. Every change goes
 * through Grid methods, so Grid.version bumps and the VisionMap / path search see it at once (the A*
 * reads the grid directly and caches nothing). Rooms are recomputed here after every change.
 *
 * Door state, door HP and barricades stay on the Grid's door objects (existing banging code); a door
 * record only points at its door. All other HP lives on the record.
 *
 * Keys come from balance.json: structures.* (incl. damageStages), hq.*.
 */
import { EDGE, TILE } from '../iso/grid.js';

/** Edge kinds (GDD 5.19 table). */
export const EDGE_KIND = Object.freeze({
  EXTERIOR: 'exterior', SHAFT: 'shaft', VOID: 'void', PERIMETER: 'perimeter', GATE: 'gate', BLOCK: 'block', PARTITION: 'partition', OPEN: 'open', NONE: 'none',
});

/** Piece names. A gap is the absence of a piece. */
export const PIECE = Object.freeze({ WALL: 'wall', DOOR: 'door', WINDOW: 'window', GAP: 'gap' });

const OPPOSITE = { N: 'S', S: 'N', E: 'W', W: 'E' };

/** @returns {{x:number,y:number,side:'N'|'W'}} canonical edge (S and E map onto the neighbour's N / W) */
export function normEdge(x, y, side) {
  if (side === 'S') return { x, y: y + 1, side: 'N' };
  if (side === 'E') return { x: x + 1, y, side: 'W' };
  return { x, y, side };
}

/** Canonical save key "<x>.<y>.N|W" (GDD 5.19 Save). */
export function edgeKey(x, y, side) {
  const e = normEdge(x, y, side);
  return `${e.x}.${e.y}.${e.side}`;
}

/** Inverse of edgeKey. @returns {{x:number,y:number,side:'N'|'W'}|null} */
export function parseEdgeKey(key) {
  const m = /^(-?\d+)\.(-?\d+)\.([NW])$/.exec(String(key));
  return m ? { x: +m[1], y: +m[2], side: m[3] } : null;
}

/** The two tiles an edge separates: [tile on the N / W side, tile on the S / E side]. */
export function edgeTiles(e) {
  return e.side === 'N' ? [{ x: e.x, y: e.y - 1 }, { x: e.x, y: e.y }] : [{ x: e.x - 1, y: e.y }, { x: e.x, y: e.y }];
}

/**
 * Damage stage 0..3 from the HP fraction. 0 = undamaged. Each threshold crossed adds one stage
 * (balance structures.damageStages, the same for every piece and overlay). Capped at 3 (art: dmg_*_1..3).
 * @param {number} hp @param {number} maxHp @param {number[]} thresholds descending fractions
 * @returns {0|1|2|3}
 */
export function damageStage(hp, maxHp, thresholds) {
  if (!(maxHp > 0) || hp >= maxHp) return 0;
  const f = hp / maxHp;
  let stage = 0;
  for (const t of thresholds) if (t > 0 && f <= t) stage++;
  return Math.min(3, stage);
}

/** Generated door tier from the Grid door kind. */
const generatedDoorTier = (door) => (door.kind === 'front' ? 'generated_front' : 'generated_interior');

/** Definition (hp, cost, yield, ...) of a piece record from balance.structures. */
export function pieceDef(balance, rec) {
  const s = balance.structures;
  if (rec.piece === PIECE.WALL) return s.walls[rec.tier];
  if (rec.piece === PIECE.DOOR) return s.doors[rec.tier];
  if (rec.piece === PIECE.WINDOW) return s.windows[rec.tier === 'exterior' ? 'glass' : rec.tier];
  return null;
}

/**
 * The structure model of one floor.
 * @property {number} revision bumps on every change (renderers re-bake the wall layer on change)
 */
export class Structures {
  /**
   * @param {object} floor model from loadIsoFloor ({number, grid, rooms?, roomAt?, doors, objects})
   * @param {object} balance full balance
   */
  constructor(floor, balance) {
    this.floor = floor;
    this.grid = floor.grid;
    this.balance = balance;
    /** @type {Map<number, object>} eid -> record {eid,x,y,side,piece,tier,hp,maxHp,overlay,broken,door} */
    this.recs = new Map();
    /** @type {Map<number, string>} eid -> signature of the generated layout */
    this.base = new Map();
    this.kinds = new Map();
    this.revision = 0;
    this.passRev = 0; // bumps when a window's cover changes (attackers mid-climb re-check their step)
    this.listeners = [];
    this._ev = { structural: true, eid: -1 };
    this._tmpEdge = { x: 0, y: 0, side: 'N' };
    const perim = new Set(balance.hq?.perimeterEdges ?? []);
    const gate = new Set(balance.hq?.gateEdges ?? []);
    this.perimeter = floor.number === balance.hq?.floor ? perim : new Set();
    this.gate = floor.number === balance.hq?.floor ? gate : new Set();
    this._scan();
    for (const [eid, r] of this.recs) this.base.set(eid, this._sig(r));
    this.roomId = new Int32Array(this.grid.width * this.grid.height);
    this.roomCount = 0;
    this.recomputeRooms();
  }

  // ---- queries -----------------------------------------------------------

  /** Is this (normalised) edge inside the grid's edge range? */
  validEdge(x, y, side) {
    const e = normEdge(x, y, side);
    const g = this.grid;
    return e.side === 'N' ? e.x >= 0 && e.x < g.width && e.y >= 0 && e.y <= g.height : e.x >= 0 && e.x <= g.width && e.y >= 0 && e.y < g.height;
  }

  /** Record of the edge, or null for a gap / no edge / out of range. */
  rec(x, y, side) {
    if (!this.validEdge(x, y, side)) return null;
    return this.recs.get(this.grid.edgeId(x, y, side)) ?? null;
  }

  /** @returns {string} EDGE_KIND of the edge (fixed by the plan, never saved) */
  kindOf(x, y, side) {
    if (!this.validEdge(x, y, side)) return EDGE_KIND.NONE;
    const e = normEdge(x, y, side);
    const eid = this.grid.edgeId(e.x, e.y, e.side);
    let k = this.kinds.get(eid);
    if (k === undefined) { k = this._deriveKind(e); this.kinds.set(eid, k); }
    return k;
  }

  /** Edge kinds the player can never remove or alter (apart from overlays on exterior windows). */
  isImmutableKind(kind) {
    return kind === EDGE_KIND.EXTERIOR || kind === EDGE_KIND.SHAFT || kind === EDGE_KIND.VOID;
  }

  /**
   * Full description of an edge for UI and rules.
   * @returns {{x:number,y:number,side:'N'|'W',eid:number,kind:string,piece:string,tier:string|null,hp:number,maxHp:number,
   *   stage:number,broken:boolean,overlay:object|null,overlayStage:number,rec:object|null,inBounds:boolean}}
   */
  describe(x, y, side) {
    const e = normEdge(x, y, side);
    const g = this.grid;
    const tiles = edgeTiles(e);
    const inBounds = this.validEdge(e.x, e.y, e.side);
    const eid = inBounds ? g.edgeId(e.x, e.y, e.side) : -1;
    const base = { ...e, eid, inBounds, tiles };
    if (!inBounds || (!g.isFloor(tiles[0].x, tiles[0].y) && !g.isFloor(tiles[1].x, tiles[1].y))) {
      return { ...base, kind: EDGE_KIND.NONE, piece: PIECE.GAP, tier: null, hp: 0, maxHp: 0, stage: 0, broken: false, overlay: null, overlayStage: 0, rec: null };
    }
    const rec = this.recs.get(eid) ?? null;
    const kind = this.kindOf(e.x, e.y, e.side);
    if (!rec) return { ...base, kind, piece: PIECE.GAP, tier: null, hp: 0, maxHp: 0, stage: 0, broken: false, overlay: null, overlayStage: 0, rec: null };
    const hp = this.hpOf(rec);
    const maxHp = this.maxHpOf(rec);
    const overlay = rec.overlay ?? this.barricadeView(rec);
    return {
      ...base, kind, piece: rec.piece, tier: rec.tier, hp, maxHp, stage: this.stageOf(rec), broken: !!rec.broken || (rec.door?.state === 'broken'),
      overlay, overlayStage: overlay ? damageStage(overlay.hp, overlay.maxHp, this._thresholds('overlay')) : 0, rec,
    };
  }

  /**
   * The barricade on a door as an overlay view { kind:'barricade', level, hp, maxHp }, or null. Barricades live on the Grid's
   * door (movement, the workbench front-door barricade and the saved door record all use it); the structure model reads them
   * through this view so "overlay first" and "one overlay per edge" cover them too.
   */
  barricadeView(rec) {
    const b = rec.door?.barricade;
    if (!b) return null;
    const level = b.level ?? 1;
    const lv = this.balance.barricade.levels.find((l) => l.level === level);
    return { kind: 'barricade', level, hp: b.hp, maxHp: lv?.hp ?? b.hp };
  }

  /** Kind of the edge with this id (cached; same as kindOf without the coordinates). */
  kindOfEid(eid) {
    let k = this.kinds.get(eid);
    if (k === undefined) { k = this._deriveKind(this._decode(eid)); this.kinds.set(eid, k); }
    return k;
  }

  hpOf(rec) { return rec.door ? rec.door.hp : rec.hp; }

  maxHpOf(rec) { return rec.door ? rec.door.maxHp : rec.maxHp; }

  /** Damage stage 0..3 of the piece itself (overlay has its own, see describe). */
  stageOf(rec) {
    return damageStage(this.hpOf(rec), this.maxHpOf(rec), this._thresholds(rec.piece));
  }

  /** Room index of a tile after the changes so far (-1 for void). A room = 4-connected tiles not split by a wall, door or window. */
  roomOf(x, y) {
    return this.grid.inBounds(x, y) ? this.roomId[y * this.grid.width + x] : -1;
  }

  /** All floor-15 style tiles in the room of (x, y). @returns {{x:number,y:number}[]} */
  roomTiles(x, y) {
    const id = this.roomOf(x, y);
    const out = [];
    if (id < 0) return out;
    for (let j = 0; j < this.grid.height; j++) for (let i = 0; i < this.grid.width; i++) if (this.roomId[j * this.grid.width + i] === id) out.push({ x: i, y: j });
    return out;
  }

  /**
   * Call `fn(structures, ev)` after every change. `ev` is ONE reused object { structural, eid }:
   *   structural true  an edge gained / lost its piece (place): rooms, sight and paths changed, re-bake the wall layer;
   *   structural false only one edge's tier, HP, damage stage or overlay changed (`eid` = that edge, -1 = unknown):
   *                    update that edge's sprites, nothing else.
   * Do not keep `ev` after the call. @returns {() => void} unsubscribe */
  onChange(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter((f) => f !== fn); };
  }

  // ---- mutations (used by isoBuild; each keeps Grid, records, rooms in step) --

  /**
   * Replace whatever is on the edge with a new piece (or a gap).
   * @param {{x:number,y:number,side:string}} edge
   * @param {{piece:string, tier?:string, hp?:number, overlay?:object|null, state?:string, broken?:boolean}} spec
   * @returns {object|null} the new record, null for a gap
   */
  place(edge, spec) {
    const e = normEdge(edge.x, edge.y, edge.side);
    const g = this.grid;
    const eid = g.edgeId(e.x, e.y, e.side);
    const old = this.recs.get(eid);
    if (old?.door) {
      g.removeDoor(e.x, e.y, e.side);
      const i = this.floor.doors.indexOf(old.door);
      if (i >= 0) this.floor.doors.splice(i, 1);
    }
    g.setSeeThrough(e.x, e.y, e.side, false);
    this.recs.delete(eid);
    let rec = null;
    const piece = spec.piece;
    if (piece === PIECE.GAP) {
      g.setEdge(e.x, e.y, e.side, EDGE.NONE);
    } else {
      const overlay = spec.overlay ? { ...spec.overlay } : null;
      rec = { eid, x: e.x, y: e.y, side: e.side, piece, tier: spec.tier ?? null, genTier: spec.genTier ?? null, hp: 0, maxHp: 0, overlay, broken: !!spec.broken, door: null };
      const def = pieceDef(this.balance, rec);
      const maxHp = def?.hp ?? 1;
      if (piece === PIECE.DOOR) {
        const door = g.addDoor(e.x, e.y, e.side, { id: spec.doorId ?? `b${e.x}.${e.y}.${e.side}`, state: spec.state ?? 'closed', hp: spec.hp ?? maxHp });
        door.maxHp = maxHp;
        door.tier = rec.tier;
        door.hp = Math.min(maxHp, spec.hp ?? maxHp);
        if (spec.keep) { door.kind = spec.keep.kind; door.unit = spec.keep.unit; } else door.built = true; // fitted by the player: removed with the sledgehammer in build mode, not dismantled with a crowbar
        rec.door = door;
        this.floor.doors.push(door);
      } else {
        rec.maxHp = maxHp;
        rec.hp = Math.min(maxHp, spec.hp ?? maxHp);
        g.setEdge(e.x, e.y, e.side, piece === PIECE.WINDOW ? EDGE.WINDOW : EDGE.WALL);
      }
      this.recs.set(eid, rec);
      this.syncSight(rec);
    }
    this._changed(true, eid);
    return rec;
  }

  /**
   * Move a wall / door record to another tier in place (upgrade): HP becomes the new tier's full HP,
   * overlay, door state and barricade stay.
   */
  retier(rec, tier) {
    rec.tier = tier;
    const def = pieceDef(this.balance, rec);
    if (rec.door) { rec.door.tier = tier; rec.door.maxHp = def.hp; rec.door.hp = def.hp; this.grid.version++; } else { rec.maxHp = def.hp; rec.hp = def.hp; }
    this._changed(false, rec.eid);
  }

  /** Set or clear the overlay of a record: {kind:'boards'|'plating', hp, maxHp}. */
  setOverlay(rec, overlay) {
    if (rec.piece === PIECE.WINDOW) this.passRev++; // boards or plating on / off a window change who can climb through
    rec.overlay = overlay ? { ...overlay } : null;
    this.syncSight(rec);
    this.grid.version++; // overlay changes can change sight (boarded window)
    this._changed(false, rec.eid);
  }

  /** Set HP of a record (no side effects; use damage() for gameplay hits). */
  setHp(rec, hp) {
    if (rec.door) rec.door.hp = hp; else rec.hp = hp;
    this._changed(false, rec.eid);
  }

  /**
   * A hit on a structure: overlay first, then the piece. At 0 HP the piece becomes a gap (built doors, walls),
   * a generated door breaks (Grid.damageDoor), a glass window shatters into a broken window. Immutable edges take nothing.
   * @returns {{hit:'overlay'|'piece'|'none', destroyed:boolean, noise:string|null}}
   */
  damage(edge, amount) {
    if (!this.validEdge(edge.x, edge.y, edge.side)) return { hit: 'none', destroyed: false, noise: null };
    const e = normEdge(edge.x, edge.y, edge.side);
    const rec = this.rec(e.x, e.y, e.side);
    if (!rec) return { hit: 'none', destroyed: false, noise: null };
    const kind = this.kindOf(e.x, e.y, e.side);
    if (this.isImmutableKind(kind)) return { hit: 'none', destroyed: false, noise: null };
    const bar = rec.door?.barricade;
    if (bar && bar.hp > 0 && !rec.overlay) { // a door barricade is the overlay (stays at 0 HP, broken, until repaired or demolished)
      const broke = this.grid.damageBarricade(rec.door, amount);
      this._changed(false, rec.eid);
      return { hit: 'overlay', destroyed: broke, noise: null };
    }
    if (rec.overlay && rec.overlay.hp > 0) {
      rec.overlay.hp = Math.max(0, rec.overlay.hp - amount);
      const gone = rec.overlay.hp === 0;
      if (gone) this.setOverlay(rec, null); else this._changed(false, rec.eid);
      return { hit: 'overlay', destroyed: gone, noise: null };
    }
    if (rec.piece === PIECE.WINDOW) {
      if (rec.broken) return { hit: 'none', destroyed: false, noise: null };
      rec.hp = Math.max(0, rec.hp - amount);
      if (rec.hp === 0) {
        rec.broken = true;
        this.syncSight(rec);
        this.grid.version++;
        this._changed(false, rec.eid);
        return { hit: 'piece', destroyed: true, noise: this.balance.structures.windows.glass.breakNoise ?? 'loud' };
      }
      this._changed(false, rec.eid);
      return { hit: 'piece', destroyed: false, noise: null };
    }
    if (rec.piece === PIECE.DOOR) {
      const generated = rec.tier === 'generated_interior' || rec.tier === 'generated_front';
      if (generated) {
        const broke = this.grid.damageDoor(rec.door, amount);
        this._changed(false, rec.eid);
        return { hit: 'piece', destroyed: broke, noise: null };
      }
      rec.door.hp = Math.max(0, rec.door.hp - amount);
      if (rec.door.hp === 0) { this.place(e, { piece: PIECE.GAP }); return { hit: 'piece', destroyed: true, noise: null }; }
      this._changed(false, rec.eid);
      return { hit: 'piece', destroyed: false, noise: null };
    }
    rec.hp = Math.max(0, rec.hp - amount);
    if (rec.hp === 0) { this.place(e, { piece: PIECE.GAP }); return { hit: 'piece', destroyed: true, noise: null }; }
    this._changed(false, rec.eid);
    return { hit: 'piece', destroyed: false, noise: null };
  }

  /** damage() by edge id (zombies hit edges they know by id); no allocation. */
  damageEid(eid, amount) {
    return this.damage(this._decode(eid, this._tmpEdge), amount);
  }

  /** Make the Grid's sight and climb flags of a window match its pane: glass and broken panes pass sight, boards / plating stop it; a broken pane with nothing over it can be climbed. */
  syncSight(rec) {
    if (rec.piece !== PIECE.WINDOW) return;
    const covered = !!rec.overlay;
    const see = !covered && (rec.tier === 'glass' || rec.broken);
    this.grid.setSeeThrough(rec.x, rec.y, rec.side, see);
    this.grid.setClimbable(rec.x, rec.y, rec.side, !covered && !!rec.broken); // a broken pane with nothing over it: climb / vault through
  }

  // ---- rooms -------------------------------------------------------------

  /**
   * Recompute rooms: 4-connected floor tiles not separated by a wall, door or window piece (gaps do not
   * separate). Light and surface stay per tile (GDD), so only this table changes.
   * @returns {number} room count
   */
  recomputeRooms() {
    const g = this.grid;
    const W = g.width;
    const ids = this.roomId;
    ids.fill(-1);
    let n = 0;
    const stack = [];
    for (let s = 0; s < ids.length; s++) {
      const sx = s % W;
      const sy = (s / W) | 0;
      if (ids[s] !== -1 || !g.isFloor(sx, sy)) continue;
      ids[s] = n;
      stack.push(s);
      while (stack.length) {
        const c = stack.pop();
        const cx = c % W;
        const cy = (c / W) | 0;
        for (const [dx, dy] of NEIGH) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (!g.isFloor(nx, ny) || ids[ny * W + nx] !== -1) continue;
          if (g.edges[g.edgeBetween(cx, cy, nx, ny)] !== EDGE.NONE) continue;
          ids[ny * W + nx] = n;
          stack.push(ny * W + nx);
        }
      }
      n++;
    }
    this.roomCount = n;
    return n;
  }

  // ---- save: overrides ---------------------------------------------------

  /**
   * Only the edges that differ from the generated layout (GDD 5.19 Save).
   * @returns {Object<string, {piece:string,tier:string|null,hp:number,overlay:object|null,door:{state:string}|null,broken?:boolean}>}
   */
  exportOverrides() {
    const out = {};
    const eids = new Set([...this.base.keys(), ...this.recs.keys()]);
    for (const eid of eids) {
      const rec = this.recs.get(eid) ?? null;
      const cur = rec ? this._sig(rec) : 'gap';
      if (cur === (this.base.get(eid) ?? 'gap')) continue;
      const at = this._decode(eid);
      const key = `${at.x}.${at.y}.${at.side}`;
      if (!rec) { out[key] = { piece: PIECE.GAP, tier: null, hp: 0, overlay: null, door: null }; continue; }
      out[key] = {
        piece: rec.piece, tier: rec.tier, hp: this.hpOf(rec), overlay: rec.overlay ? { ...rec.overlay } : null,
        door: rec.door ? { state: rec.door.state } : null, ...(rec.broken ? { broken: true } : {}),
      };
    }
    return out;
  }

  /**
   * Apply saved overrides onto a freshly generated floor. Bad entries are skipped.
   * @param {Object<string, object>} map
   * @returns {number} entries applied
   */
  applyOverrides(map) {
    let n = 0;
    if (!map || typeof map !== 'object') return 0;
    for (const [key, v] of Object.entries(map)) {
      const e = parseEdgeKey(key);
      if (!e || !v || typeof v !== 'object') continue;
      if (!this.grid.inBounds(e.x, e.y) && !(e.side === 'N' ? e.y === this.grid.height : e.x === this.grid.width)) continue;
      const d = this.describe(e.x, e.y, e.side);
      if (d.kind === EDGE_KIND.NONE || d.kind === EDGE_KIND.SHAFT || d.kind === EDGE_KIND.VOID) continue;
      // exterior and perimeter edges: HP, tier and overlay of the generated piece are restored (an exterior window keeps its
      // boards / plating and damage, a perimeter door its HP); only a piece CHANGE the rules forbid is refused. A perimeter
      // wall may be broken to a gap or rebuilt; nothing else ever changes on an exterior edge.
      const cur = this.recs.get(d.eid);
      if (d.kind === EDGE_KIND.EXTERIOR && v.piece !== cur?.piece) continue;
      if (d.kind === EDGE_KIND.PERIMETER && v.piece !== PIECE.WALL && v.piece !== PIECE.GAP && v.piece !== cur?.piece) continue;
      if (v.piece === PIECE.GAP) { this.place(e, { piece: PIECE.GAP }); n++; continue; }
      if (![PIECE.WALL, PIECE.DOOR, PIECE.WINDOW].includes(v.piece) || typeof v.tier !== 'string') continue;
      // sanitise: an exterior edge keeps its generated tier, is never broken and only a window takes an overlay
      const exterior = d.kind === EDGE_KIND.EXTERIOR;
      const tier = exterior ? cur.tier : v.tier;
      const probe = { piece: v.piece, tier };
      const def = pieceDef(this.balance, probe);
      if (!def) continue;
      const od = v.overlay && typeof v.overlay === 'object' ? this.balance.structures.overlays[v.overlay.kind] : null;
      const overlayOk = !!od && Array.isArray(od.on) && od.on.includes(v.piece) && Number.isFinite(v.overlay.hp) && (!exterior || v.piece === PIECE.WINDOW);
      const ov = overlayOk ? { kind: v.overlay.kind, hp: Math.max(1, Math.min(od.hp, v.overlay.hp)), maxHp: od.hp } : null;
      const hpOk = Number.isFinite(v.hp) && (!exterior || v.piece === PIECE.WINDOW);
      const wasDoor = cur?.door;
      this.place(e, {
        piece: v.piece, tier, hp: hpOk ? Math.max(1, Math.min(def.hp ?? v.hp, v.hp)) : undefined, overlay: ov, broken: exterior ? false : !!v.broken,
        state: ['open', 'closed', 'jammed', 'broken'].includes(v.door?.state) ? v.door.state : 'closed',
        doorId: wasDoor?.id, keep: wasDoor ? { kind: wasDoor.kind, unit: wasDoor.unit } : null, genTier: cur?.genTier ?? null,
      });
      n++;
    }
    return n;
  }

  // ---- internals ---------------------------------------------------------

  _thresholds() {
    return this.balance.structures.damageStages ?? [];
  }

  /**
   * Announce a change made outside this class (a door's HP or barricade changed in the Grid by the zombie code).
   * @param {number} [eid] the edge, when known (-1: unknown, listeners refresh doors)
   */
  touch(eid = -1) { this._changed(false, eid); }

  /** Announce a change. Rooms are recomputed only for structural changes (a piece appeared or went). */
  _changed(structural = true, eid = -1) {
    this.revision++;
    if (structural) this.recomputeRooms();
    const ev = this._ev;
    ev.structural = structural;
    ev.eid = eid;
    for (const fn of this.listeners) fn(this, ev);
  }

  _sig(rec) {
    const ov = rec.overlay ? `${rec.overlay.kind}:${rec.overlay.hp}` : '-';
    // generated doors keep hp / state in state.doors (existing save path); only structure counts here
    return rec.door && (rec.tier === 'generated_interior' || rec.tier === 'generated_front')
      ? `${rec.piece}:${rec.tier}:${ov}` : `${rec.piece}:${rec.tier}:${this.hpOf(rec)}:${ov}:${rec.broken ? 1 : 0}`;
  }

  _decode(eid, out = {}) {
    const g = this.grid;
    if (eid < g.hCount) { out.x = eid % g.width; out.y = (eid / g.width) | 0; out.side = 'N'; return out; }
    const k = eid - g.hCount;
    out.x = k % (g.width + 1); out.y = (k / (g.width + 1)) | 0; out.side = 'W';
    return out;
  }

  _unitOfTile(t) {
    const f = this.floor;
    if (!f.roomAt || !f.rooms) return undefined;
    const ri = f.roomAt(t.x, t.y);
    return ri < 0 ? null : f.rooms[ri]?.unit ?? null;
  }

  _deriveKind(e) {
    const g = this.grid;
    const key = `${e.x}.${e.y}.${e.side}`;
    if (this.gate.has(key)) return EDGE_KIND.GATE;
    if (this.perimeter.has(key)) return EDGE_KIND.PERIMETER;
    const [a, b] = edgeTiles(e);
    const fa = g.isFloor(a.x, a.y);
    const fb = g.isFloor(b.x, b.y);
    if (!fa && !fb) return EDGE_KIND.NONE;
    if (!g.inBounds(a.x, a.y) || !g.inBounds(b.x, b.y)) return EDGE_KIND.EXTERIOR;
    if (!fa || !fb) return EDGE_KIND.VOID; // onto a void tile (e.g. the landing's east side): like a shaft edge
    if (g.kindAt(a.x, a.y) === TILE.STAIRS || g.kindAt(b.x, b.y) === TILE.STAIRS) return EDGE_KIND.SHAFT;
    const f = this.floor;
    if (!f.roomAt) return EDGE_KIND.PARTITION;
    const ra = f.roomAt(a.x, a.y);
    const rb = f.roomAt(b.x, b.y);
    if (ra === rb) return EDGE_KIND.OPEN;
    const ua = this._unitOfTile(a);
    const ub = this._unitOfTile(b);
    return ua && ua === ub ? EDGE_KIND.PARTITION : EDGE_KIND.BLOCK;
  }

  _scan() {
    const g = this.grid;
    const W = g.width;
    const H = g.height;
    const add = (x, y, side) => {
      const eid = g.edgeId(x, y, side);
      const type = g.edges[eid];
      if (type === EDGE.NONE) return;
      const kind = this.kindOf(x, y, side);
      const rec = { eid, x, y, side, piece: PIECE.WALL, tier: null, genTier: null, hp: 0, maxHp: 0, overlay: null, broken: false, door: null };
      if (type === EDGE.DOOR) {
        const door = g.doors.get(eid);
        rec.piece = PIECE.DOOR;
        rec.tier = door.tier ?? generatedDoorTier(door);
        door.tier = rec.tier;
        rec.door = door;
      } else if (type === EDGE.WINDOW) {
        rec.piece = PIECE.WINDOW;
        rec.tier = kind === EDGE_KIND.EXTERIOR ? 'exterior' : 'glass';
        rec.maxHp = this.balance.structures.windows.glass.hp;
        rec.hp = rec.maxHp;
      } else {
        rec.tier = kind === EDGE_KIND.PARTITION ? 'partition'
          : kind === EDGE_KIND.OPEN || kind === EDGE_KIND.GATE ? 'wood' : 'block';
        rec.maxHp = this.balance.structures.walls[rec.tier].hp;
        rec.hp = rec.maxHp;
      }
      rec.genTier = rec.tier; // art: a piece still at its generated tier keeps its generated look
      this.recs.set(eid, rec);
    };
    for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) add(x, y, 'N');
    for (let y = 0; y < H; y++) for (let x = 0; x <= W; x++) add(x, y, 'W');
  }
}

const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Side opposite to `side` (N<->S, E<->W). */
export const oppositeSide = (side) => OPPOSITE[side];

/**
 * Build the structure model of a floor and attach it as `floor.structures`.
 * @param {object} floor from loadIsoFloor @param {object} balance
 * @returns {Structures}
 */
export function createStructures(floor, balance) {
  floor.structures = new Structures(floor, balance);
  return floor.structures;
}
