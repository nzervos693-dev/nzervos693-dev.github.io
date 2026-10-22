/*
 * grid.js - the floor model (pure, no Phaser).
 *
 * WALLS LIVE ON TILE EDGES (GDD section 2: "walls stand on tile edges, they
 * take no tile"). A tile is void (0), floor (1) or stairs (2). Every edge
 * between two tiles (and the outer boundary) holds NONE, WALL, WINDOW or DOOR.
 * An edge is addressed by (x, y, side): side 'N' is the edge above tile (x,y),
 * 'W' the edge left of it; 'S' / 'E' are normalised to the neighbour's N / W.
 * Furniture is a separate per-tile `obstacle` flag: it blocks walking, never
 * sight.
 *
 * Doors (GDD 5.18): state open | closed | jammed | broken, plus an optional
 * `barricade` {own:boolean, hp:number}. Sight is blocked by walls, windows,
 * closed and jammed doors (barricades never block sight).
 * Movement classes (moveClass) are what pathing needs: OPEN, BLOCK (wall /
 * window), CLOSED (hero opens it; zombies bang it), LOCKED (jammed, or a
 * barricade that is not the hero's: nobody passes, zombies bang it), SQUEEZE
 * (the hero's OWN barricade with hp > 0: the hero squeezes through, zombies
 * treat it as LOCKED). A barricade with hp 0 does not exist for anyone.
 *
 * Tile coordinates: x to the right (+x = screen lower right), y down.
 */

export const TILE = Object.freeze({ VOID: 0, FLOOR: 1, STAIRS: 2 });
export const EDGE = Object.freeze({ NONE: 0, WALL: 1, WINDOW: 2, DOOR: 3 });
export const MOVE = Object.freeze({ OPEN: 0, BLOCK: 1, CLOSED: 2, LOCKED: 3, SQUEEZE: 4 });

const SIDE_DELTA = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };

export class Grid {
  /**
   * @param {number} width tiles in x  @param {number} height tiles in y
   * @param {{interiorHp?:number, frontHp?:number}} [doorHp] default door HP (balance doors.*)
   */
  constructor(width, height, doorHp = {}) {
    this.width = width;
    this.height = height;
    this.doorHp = { interior: doorHp.interiorHp ?? 60, front: doorHp.frontHp ?? 120 };
    this.kind = new Uint8Array(width * height).fill(TILE.FLOOR);
    this.obstacle = new Uint8Array(width * height);
    this.hCount = width * (height + 1);
    this.vCount = (width + 1) * height;
    this.edges = new Uint8Array(this.hCount + this.vCount);
    /** @type {Map<number, object>} edge id -> door */
    this.doors = new Map();
    /**
     * Bumped by setKind, setEdge, addDoor, setDoorState, setBarricade and door/
     * barricade damage that changes state. NOT bumped by setObstacle (furniture
     * never affects sight). Vision recompute trigger.
     */
    this.version = 0;
    /** @type {Set<number>} window edges that do NOT stop sight (built glass, broken panes; GDD 5.19). */
    this.seeThrough = new Set();
  }

  // ---- building ----------------------------------------------------------

  /**
   * Build from a generic description.
   * @param {{width:number,height:number,tiles?:string[],edges?:Array<{x:number,y:number,side:string,type:string}>,
   *   doors?:Array<{id?:string,x:number,y:number,side:string,kind?:string,state?:string,hp?:number,barricade?:{own:boolean,hp:number}}>,
   *   obstacles?:Array<[number,number]>}} d tiles: rows of chars '.' floor, '#' void, 'S' stairs
   *   (any other char = floor); edge types 'wall' | 'window'.
   * @param {{interiorHp?:number, frontHp?:number}} [doorHp]
   */
  static fromDescription(d, doorHp) {
    const g = new Grid(d.width, d.height, doorHp);
    if (d.tiles) {
      for (let y = 0; y < d.height; y++) {
        for (let x = 0; x < d.width; x++) {
          const ch = d.tiles[y][x];
          g.kind[y * d.width + x] = ch === '#' ? TILE.VOID : ch === 'S' ? TILE.STAIRS : TILE.FLOOR;
        }
      }
    }
    for (const e of d.edges ?? []) g.setEdge(e.x, e.y, e.side, e.type === 'window' ? EDGE.WINDOW : EDGE.WALL);
    for (const o of d.obstacles ?? []) g.setObstacle(o[0], o[1], true);
    for (const dr of d.doors ?? []) g.addDoor(dr.x, dr.y, dr.side, dr);
    return g;
  }

  /**
   * Build from a double-resolution ASCII drawing, handy for tests and tools.
   * (2h+1) lines of (2w+1) chars. Char at (2x+1, 2y+1) is tile (x,y): '.'
   * floor, '#' void, 'S' stairs. Char at (2x+1, 2y) is the N edge of (x,y);
   * char at (2x, 2y+1) is its W edge. Edge chars: '-' '|' wall, 'w' window,
   * 'D' closed door, 'd' open door, 'J' jammed door, ' ' none. Corners ignored.
   * @param {string[]} lines @param {{interiorHp?:number, frontHp?:number}} [doorHp]
   */
  static fromAscii(lines, doorHp) {
    const w = (lines[0].length - 1) / 2;
    const h = (lines.length - 1) / 2;
    const g = new Grid(w, h, doorHp);
    const edge = (x, y, side, ch) => {
      if (ch === '-' || ch === '|') g.setEdge(x, y, side, EDGE.WALL);
      else if (ch === 'w') g.setEdge(x, y, side, EDGE.WINDOW);
      else if (ch === 'D') g.addDoor(x, y, side, { state: 'closed' });
      else if (ch === 'd') g.addDoor(x, y, side, { state: 'open' });
      else if (ch === 'J') g.addDoor(x, y, side, { state: 'jammed' });
    };
    for (let y = 0; y <= h; y++) {
      for (let x = 0; x < w; x++) edge(x, y, 'N', lines[2 * y][2 * x + 1]);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x <= w; x++) edge(x, y, 'W', lines[2 * y + 1][2 * x]);
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = lines[2 * y + 1][2 * x + 1];
        g.kind[y * w + x] = ch === '#' ? TILE.VOID : ch === 'S' ? TILE.STAIRS : TILE.FLOOR;
      }
    }
    return g;
  }

  // ---- tiles -------------------------------------------------------------

  /** @returns {boolean} true when (x,y) is inside the grid */
  inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** Tile kind (TILE.*); VOID for anything outside the grid. */
  kindAt(x, y) {
    return this.inBounds(x, y) ? this.kind[y * this.width + x] : TILE.VOID;
  }

  /** Set a tile kind. */
  setKind(x, y, k) {
    this.kind[y * this.width + x] = k;
    this.version++;
  }

  /** Floor or stairs (ignores furniture). */
  isFloor(x, y) {
    return this.kindAt(x, y) !== TILE.VOID;
  }

  /** Mark or clear a furniture obstacle on a tile (blocks walking, not sight). */
  setObstacle(x, y, on) {
    this.obstacle[y * this.width + x] = on ? 1 : 0;
  }

  /** Can a body stand here: floor/stairs and no furniture. */
  isWalkable(x, y) {
    return this.isFloor(x, y) && this.obstacle[y * this.width + x] === 0;
  }

  // ---- edges -------------------------------------------------------------

  /**
   * Numeric id of the edge on `side` of tile (x,y). Valid for any tile in
   * bounds, plus the far boundary (e.g. N of (x,height) is the south boundary).
   */
  edgeId(x, y, side) {
    if (side === 'S') return this.edgeId(x, y + 1, 'N');
    if (side === 'E') return this.edgeId(x + 1, y, 'W');
    return side === 'N' ? y * this.width + x : this.hCount + y * (this.width + 1) + x;
  }

  /** Edge id between two orthogonally adjacent tiles (either may be outside). */
  edgeBetween(xa, ya, xb, yb) {
    if (xa !== xb) return this.hCount + ya * (this.width + 1) + Math.max(xa, xb);
    return Math.max(ya, yb) * this.width + xa;
  }

  /** Set an edge type (EDGE.*). Doors go through addDoor. */
  setEdge(x, y, side, type) {
    const eid = this.edgeId(x, y, side);
    this.edges[eid] = type;
    this.seeThrough.delete(eid);
    this.version++;
  }

  /** Type of the edge (EDGE.*). */
  edgeType(x, y, side) {
    return this.edges[this.edgeId(x, y, side)];
  }

  /**
   * Add a door on an edge.
   * @param {number} x @param {number} y @param {'N'|'S'|'E'|'W'} side
   * @param {{id?:string,kind?:'interior'|'front',state?:string,hp?:number,barricade?:{own:boolean,hp:number}}} [o]
   * @returns {object} the door {id, edge, x, y, side(N|W), kind, state, hp, maxHp, barricade}
   */
  addDoor(x, y, side, o = {}) {
    if (side === 'S') { y += 1; side = 'N'; }
    if (side === 'E') { x += 1; side = 'W'; }
    const edge = this.edgeId(x, y, side);
    const kind = o.kind ?? 'interior';
    const maxHp = this.doorHp[kind] ?? this.doorHp.interior;
    const door = {
      id: o.id ?? `d${x}.${y}.${side}`, edge, x, y, side, kind,
      state: o.state ?? 'closed', hp: o.hp ?? maxHp, maxHp, barricade: o.barricade ? { own: !!o.barricade.own, hp: o.barricade.hp } : null,
    };
    this.edges[edge] = EDGE.DOOR;
    this.doors.set(edge, door);
    this.version++;
    return door;
  }

  /**
   * Remove the door on an edge (the edge becomes NONE).
   * @returns {boolean} true if a door was there
   */
  removeDoor(x, y, side) {
    const eid = this.edgeId(x, y, side);
    if (!this.doors.delete(eid)) return false;
    this.edges[eid] = EDGE.NONE;
    this.version++;
    return true;
  }

  /** Mark or clear a WINDOW edge as see-through (glass does not block sight). Bumps version on change. */
  setSeeThrough(x, y, side, on) {
    const eid = this.edgeId(x, y, side);
    if (on && this.edges[eid] !== EDGE.WINDOW) return; // only windows can be see-through
    if (this.seeThrough.has(eid) === !!on) return;
    if (on) this.seeThrough.add(eid); else this.seeThrough.delete(eid);
    this.version++;
  }

  /** Door on a side of tile (x,y), or null. */
  doorAt(x, y, side) {
    return this.doors.get(this.edgeId(x, y, side)) ?? null;
  }

  /** The door with this id, or null. */
  doorById(id) {
    for (const d of this.doors.values()) if (d.id === id) return d;
    return null;
  }

  /** The two tiles a door touches: [tileOnFarSide(N/W), tileOnNearSide]. */
  doorTiles(door) {
    return door.side === 'N'
      ? [{ x: door.x, y: door.y - 1 }, { x: door.x, y: door.y }]
      : [{ x: door.x - 1, y: door.y }, { x: door.x, y: door.y }];
  }

  /** Change a door's state (open|closed|jammed|broken). */
  setDoorState(door, state) {
    if (door.state === state) return;
    door.state = state;
    this.version++;
  }

  /**
   * Set or clear (null) a barricade on a door.
   * @param {object} door @param {{own:boolean,hp:number}|null} barricade
   */
  setBarricade(door, barricade) {
    door.barricade = barricade ? { own: !!barricade.own, hp: barricade.hp } : null;
    this.version++;
  }

  /**
   * Damage a door's barricade; at 0 HP it no longer exists for anyone.
   * @returns {boolean} true if this hit destroyed it
   */
  damageBarricade(door, amount) {
    const b = door.barricade;
    if (!b || b.hp <= 0) return false;
    b.hp = Math.max(0, b.hp - amount);
    if (b.hp === 0) { this.version++; return true; }
    return false;
  }

  /**
   * Damage a door; at 0 HP it becomes broken (permanently open).
   * @returns {boolean} true if this hit broke it
   */
  damageDoor(door, amount) {
    if (door.state === 'broken') return false;
    door.hp = Math.max(0, door.hp - amount);
    if (door.hp === 0) {
      this.setDoorState(door, 'broken');
      return true;
    }
    return false;
  }

  /** True if the edge stops sight: wall, window, closed or jammed door. */
  edgeBlocksSight(eid) {
    const t = this.edges[eid];
    if (t === EDGE.NONE) return false;
    if (t === EDGE.WINDOW) return !this.seeThrough.has(eid);
    if (t !== EDGE.DOOR) return true;
    const s = this.doors.get(eid).state;
    return s === 'closed' || s === 'jammed';
  }

  /** Movement class of an edge: MOVE.OPEN | BLOCK | CLOSED | LOCKED | SQUEEZE. */
  moveClass(eid) {
    const t = this.edges[eid];
    if (t === EDGE.NONE) return MOVE.OPEN;
    if (t !== EDGE.DOOR) return MOVE.BLOCK;
    const d = this.doors.get(eid);
    if (d.state === 'jammed') return MOVE.LOCKED;
    if (d.barricade && d.barricade.hp > 0) return d.barricade.own ? MOVE.SQUEEZE : MOVE.LOCKED;
    if (d.state === 'closed') return MOVE.CLOSED;
    return MOVE.OPEN;
  }

  // ---- stepping ----------------------------------------------------------

  /**
   * Classify a single 8-direction step from (x,y) by (dx,dy), each -1..1.
   * Returns MOVE.BLOCK if the target is not walkable, or a diagonal would
   * cut a corner (any of the four edges in the 2x2 block is not fully OPEN,
   * or an orthogonal neighbour tile is not walkable), else the edge class
   * (OPEN, CLOSED, LOCKED or SQUEEZE door; orthogonal steps only).
   */
  stepClass(x, y, dx, dy) {
    const nx = x + dx;
    const ny = y + dy;
    if (!this.isWalkable(nx, ny)) return MOVE.BLOCK;
    if (dx === 0 || dy === 0) return this.moveClass(this.edgeBetween(x, y, nx, ny));
    if (!this.isWalkable(nx, y) || !this.isWalkable(x, ny)) return MOVE.BLOCK;
    if (this.moveClass(this.edgeBetween(x, y, nx, y)) !== MOVE.OPEN) return MOVE.BLOCK;
    if (this.moveClass(this.edgeBetween(nx, y, nx, ny)) !== MOVE.OPEN) return MOVE.BLOCK;
    if (this.moveClass(this.edgeBetween(x, y, x, ny)) !== MOVE.OPEN) return MOVE.BLOCK;
    if (this.moveClass(this.edgeBetween(x, ny, nx, ny)) !== MOVE.OPEN) return MOVE.BLOCK;
    return MOVE.OPEN;
  }

  /**
   * Nearest walkable tile to (x,y) within `maxDist` tiles (Euclidean), or null.
   * Used by tap forgiveness (controls.tapSnapWalkTiles).
   */
  nearestWalkable(x, y, maxDist) {
    if (this.isWalkable(x, y)) return { x, y };
    let best = null;
    let bd = maxDist * maxDist;
    const r = Math.ceil(maxDist);
    for (let j = y - r; j <= y + r; j++) {
      for (let i = x - r; i <= x + r; i++) {
        if (!this.isWalkable(i, j)) continue;
        const d = (i - x) ** 2 + (j - y) ** 2;
        if (d <= bd && (!best || d < best.d)) best = { x: i, y: j, d };
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  // ---- line queries ------------------------------------------------------

  /**
   * Straight segment from the centre of tile A to the centre of tile B,
   * walked exactly (integer supercover). SIGHT mode (default): blocked by
   * sight-blocking edges and void tiles; passing exactly through a grid
   * corner is blocked if any of the four edges meeting there blocks (GDD
   * 5.17). The edges of the target's far side never matter. WALK mode: every
   * crossed edge must be OPEN (closed doors block) and every entered tile
   * walkable (used for path smoothing; also strict at corners). `blocked`
   * (WALK mode only) is an extra occupancy test for entered tiles.
   * @returns {boolean} true when the segment is clear
   */
  lineClear(x0, y0, x1, y1, walk = false, blocked = null) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const nx = Math.abs(dx);
    const ny = Math.abs(dy);
    const sx = dx < 0 ? -1 : 1;
    const sy = dy < 0 ? -1 : 1;
    let x = x0;
    let y = y0;
    let ix = 0;
    let iy = 0;
    while (ix < nx || iy < ny) {
      const d = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
      let px = x;
      let py = y;
      if (d === 0) {
        px = x + sx;
        py = y + sy;
        if (!this._tileOk(px, y, walk, blocked) || !this._tileOk(x, py, walk, blocked) || !this._tileOk(px, py, walk, blocked)) return false;
        if (this._edgeBlocked(x, y, px, y, walk) || this._edgeBlocked(px, y, px, py, walk) ||
            this._edgeBlocked(x, y, x, py, walk) || this._edgeBlocked(x, py, px, py, walk)) return false;
        ix++;
        iy++;
      } else {
        if (d < 0) { px = x + sx; ix++; } else { py = y + sy; iy++; }
        if (!this._tileOk(px, py, walk, blocked)) return false;
        if (this._edgeBlocked(x, y, px, py, walk)) return false;
      }
      x = px;
      y = py;
    }
    return true;
  }

  /** Line of sight between two tiles (hero, zombie sight, attacks, throws). */
  hasLOS(x0, y0, x1, y1) {
    return this.lineClear(x0, y0, x1, y1, false);
  }

  _tileOk(x, y, walk, blocked) {
    if (walk) return this.isWalkable(x, y) && !(blocked && blocked(x, y));
    return this.isFloor(x, y);
  }

  _edgeBlocked(xa, ya, xb, yb, walk) {
    const e = this.edgeBetween(xa, ya, xb, yb);
    return walk ? this.moveClass(e) !== MOVE.OPEN : this.edgeBlocksSight(e);
  }
}
