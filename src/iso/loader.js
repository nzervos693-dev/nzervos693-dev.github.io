/*
 * loader.js - floors_iso.json -> Grid + rooms + walls + objects + zombies (pure, no Phaser).
 *
 * Format (see the "format" block of public/data/levels/floors_iso.json):
 *  - rows/legend give a room id per tile ('#' = void); walls are DERIVED on every
 *    edge whose two sides have different room ids (void and outside count as different);
 *  - listed doors / windows / doorways REPLACE the derived wall of their edge;
 *  - edge sides in the data are GRID sides (N = -y, E = +x, S = +y, W = -x); Grid
 *    normalises S/E onto the neighbour's N/W edge itself;
 *  - facings in the data are GRID directions (N=270 deg, E=0, S=90, W=180), NOT the
 *    screen compass of projection.js FACINGS.
 */
import { Grid, TILE, EDGE } from './grid.js';

/** Data facing letter -> grid angle (degrees, 0 = +x, 90 = +y). */
export const GRID_FACING = Object.freeze({ N: 270, NE: 315, E: 0, SE: 45, S: 90, SW: 135, W: 180, NW: 225 });

/** Grid angle for a data facing (letter or number). */
export const gridFacing = (f) => (typeof f === 'number' ? f : GRID_FACING[f] ?? 90);

/** Unit step (dx, dy) for a data facing letter N/E/S/W. */
export const FACING_STEP = Object.freeze({ N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] });

/** Wall finish per room type (iso_walls note); the visible face belongs to the south/east room. */
export const FINISH_BY_TYPE = Object.freeze({
  corridor: 'concrete', stairwell: 'concrete', storage: 'concrete', janitor: 'concrete', utility: 'concrete',
  hallway: 'plaster', laundry: 'plaster', office: 'plaster',
  living: 'wallp_a', bedroom: 'wallp_a', kids_room: 'wallp_a', studio: 'wallp_a',
  kitchen: 'wallp_b', break_room: 'wallp_b', bathroom: 'tile',
});

/** Floor art frame family per room type (iso_floor names). */
export const FLOOR_BY_TYPE = Object.freeze({
  corridor: 'corridor', stairwell: 'landing', hallway: 'hallway', living: 'living', kitchen: 'kitchen',
  bedroom: 'bedroom', kids_room: 'bedroom', studio: 'bedroom', bathroom: 'bathroom', laundry: 'laundry',
  janitor: 'storage', storage: 'storage', office: 'office', break_room: 'office', utility: 'storage', reception: 'office',
});

/** Convert a data edge (x, y, grid side) to Grid's canonical {x, y, side:'N'|'W'}. */
export function canonicalEdge(x, y, side) {
  if (side === 'S') return { x, y: y + 1, side: 'N' };
  if (side === 'E') return { x: x + 1, y, side: 'W' };
  return { x, y, side };
}

/**
 * Footprint tiles of an object ([x, y] + span).
 * @returns {Array<{x:number,y:number}>}
 */
export function footprintOf(tile, span = [1, 1]) {
  const out = [];
  for (let j = 0; j < span[1]; j++) for (let i = 0; i < span[0]; i++) out.push({ x: tile[0] + i, y: tile[1] + j });
  return out;
}

/**
 * Parse one floor of floors_iso.json.
 * @param {object} data parsed floors_iso.json
 * @param {number} number floor number (e.g. 15)
 * @param {object} [balance] used for door HP and the corridor window grey tiles
 * @returns {object} floor model (see the code for fields)
 */
export function loadIsoFloor(data, number, balance = {}) {
  const f = data.floors.find((x) => x.number === number);
  if (!f || !f.rows) throw new Error(`floors_iso.json: floor ${number} is not authored`);
  const W = f.grid.w;
  const H = f.grid.d;
  const grid = new Grid(W, H, { interiorHp: balance.doors?.interiorHp, frontHp: balance.doors?.frontHp });

  // ---- rooms ---------------------------------------------------------------
  const roomIds = [];
  const roomOfId = new Map();
  const roomIndex = new Int16Array(W * H).fill(-1);
  const rooms = [];
  for (let y = 0; y < H; y++) {
    if (f.rows[y].length !== W) throw new Error(`floors_iso.json: row ${y} has ${f.rows[y].length} chars, want ${W}`);
    for (let x = 0; x < W; x++) {
      const ch = f.rows[y][x];
      const rid = f.legend[ch];
      if (rid === undefined) throw new Error(`floors_iso.json: char '${ch}' at ${x},${y} is not in the legend`);
      if (rid === 'void') { grid.kind[y * W + x] = TILE.VOID; continue; }
      let idx = roomOfId.get(rid);
      if (idx === undefined) {
        idx = rooms.length;
        const def = f.rooms[rid] ?? {};
        rooms.push({ id: rid, index: idx, type: def.type ?? 'hallway', light: def.light ?? 'dim', unit: def.unit ?? null, tiles: 0 });
        roomOfId.set(rid, idx);
        roomIds.push(rid);
      }
      roomIndex[y * W + x] = idx;
      rooms[idx].tiles++;
    }
  }
  const roomAt = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? roomIndex[y * W + x] : -1);
  grid.roomOf = roomAt; // room index of a tile (-1 void/outside)

  // ---- stairs --------------------------------------------------------------
  const stairs = { down: [], up: [] };
  const sw = f.stairwell ?? {};
  for (const [key, list] of [['down', sw.downFlight?.tiles], ['up', sw.upFlight?.tiles]]) {
    for (const [x, y] of list ?? []) {
      grid.kind[y * W + x] = TILE.STAIRS;
      grid.obstacle[y * W + x] = 1; // Stage A: both flights are blocked
      stairs[key].push({ x, y });
    }
  }

  // ---- derived walls ---------------------------------------------------------
  const wallEdges = new Map(); // eid -> wall record
  const addWall = (x, y, side) => {
    const a = side === 'N' ? { x, y: y - 1 } : { x: x - 1, y };
    const b = { x, y };
    const ra = roomAt(a.x, a.y);
    const rb = roomAt(b.x, b.y);
    if (ra === rb) return;
    if (ra < 0 && rb < 0) return;
    grid.edges[grid.edgeId(x, y, side)] = EDGE.WALL;
    wallEdges.set(grid.edgeId(x, y, side), { x, y, side, axis: side === 'N' ? 'x' : 'y', a, b, roomA: ra, roomB: rb, kind: 'wall' });
  };
  for (let y = 0; y <= H; y++) for (let x = 0; x < W; x++) addWall(x, y, 'N');
  for (let y = 0; y < H; y++) for (let x = 0; x <= W; x++) addWall(x, y, 'W');

  // ---- doors, windows, doorways ----------------------------------------------
  const wallAt = (e) => {
    const eid = grid.edgeId(e.x, e.y, e.side);
    const w = wallEdges.get(eid);
    if (!w) throw new Error(`floors_iso.json: edge ${e.x},${e.y},${e.side} has no wall to replace`);
    return w;
  };
  const doors = [];
  for (const d of f.edges?.doors ?? []) {
    const e = canonicalEdge(d.x, d.y, d.side);
    const w = wallAt(e);
    const door = grid.addDoor(e.x, e.y, e.side, { id: d.id, kind: d.type === 'front' ? 'front' : 'interior', state: d.state });
    door.unit = d.unit ?? null;
    w.kind = 'door';
    w.doorId = d.id;
    doors.push(door);
  }
  const windows = [];
  for (const wn of f.edges?.windows ?? []) {
    const e = canonicalEdge(wn.x, wn.y, wn.side);
    const w = wallAt(e);
    grid.edges[grid.edgeId(e.x, e.y, e.side)] = EDGE.WINDOW;
    w.kind = 'window';
    w.windowId = wn.id;
    w.curtains = !!wn.curtains;
    windows.push({ ...wn, edge: e, eid: grid.edgeId(e.x, e.y, e.side) });
  }
  const doorways = [];
  for (const dw of f.edges?.doorways ?? []) {
    const e = canonicalEdge(dw.x, dw.y, dw.side);
    const w = wallAt(e);
    if (dw.kind === 'elevator_door_dead') { w.kind = 'elevator'; doorways.push({ ...dw, edge: e, blocks: true }); continue; }
    grid.edges[grid.edgeId(e.x, e.y, e.side)] = EDGE.NONE;
    wallEdges.delete(grid.edgeId(e.x, e.y, e.side));
    doorways.push({ ...dw, edge: e, blocks: false });
  }
  grid.version++;

  // ---- light per tile ----------------------------------------------------------
  const greyN = balance.grid?.corridorWindowGreyTiles ?? 3;
  const light = new Array(W * H).fill('dark');
  for (let i = 0; i < W * H; i++) if (roomIndex[i] >= 0) light[i] = rooms[roomIndex[i]].light;
  for (const wn of windows) {
    const ri = roomAt(wn.x, wn.y);
    if (ri < 0 || rooms[ri].type !== 'corridor') continue;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (roomIndex[y * W + x] === ri && Math.abs(x - wn.x) < greyN) light[y * W + x] = 'grey';
    }
  }

  // ---- objects -----------------------------------------------------------------
  const objects = [];
  const zombies = [];
  const units = [];
  const buildSpots = {};
  for (const u of f.units ?? []) {
    units.push({ id: u.id, slot: u.slot, name: u.name, flavour: u.flavour, rect: u.rect, home: !!u.home, condition: u.condition, template: u.template });
    if (u.buildSpots) buildSpots[u.id] = u.buildSpots;
    for (const o of u.objects ?? []) {
      const span = o.span ?? [1, 1];
      const tiles = footprintOf(o.tile, span);
      const rec = {
        ...o, span, unit: u.id, tiles, facingAngle: gridFacing(o.facing), mounted: !!o.mounted,
        blocks: !o.mounted, roomIndex: roomAt(o.tile[0], o.tile[1]),
      };
      if (rec.blocks) for (const t of tiles) grid.setObstacle(t.x, t.y, true);
      objects.push(rec);
    }
    for (const z of u.zombies ?? []) {
      zombies.push({ id: z.id, type: z.type, x: z.tile[0], y: z.tile[1], facing: gridFacing(z.facing), room: z.room, unit: u.id });
    }
  }
  // the stash (home.stash): a pile of bags and boxes on its own tile, a fixture that blocks walking
  const st = f.home?.stash;
  if (st) {
    objects.push({
      id: 'stash', objectId: 'toolbox', tile: st.tile, span: [1, 1], facing: 'S', unit: f.home.unit, tiles: [{ x: st.tile[0], y: st.tile[1] }],
      facingAngle: gridFacing('S'), mounted: false, blocks: true, fixture: true, stash: true, slots: st.slots, roomIndex: roomAt(st.tile[0], st.tile[1]),
    });
    grid.setObstacle(st.tile[0], st.tile[1], true);
  }
  // the workbench fixture is not a salvage object (no balance.objects entry)
  const objectById = new Map(objects.map((o) => [o.id, o]));

  const home = f.home ? {
    ...f.home,
    heroStart: { x: f.home.heroStart.tile[0], y: f.home.heroStart.tile[1], facing: gridFacing(f.home.heroStart.facing) },
    unitRect: (f.units.find((u) => u.id === f.home.unit) ?? {}).rect,
  } : null;

  return {
    number, width: W, height: H, grid, rooms, roomIndex, roomAt, light,
    walls: [...wallEdges.values()], doors, windows, doorways, objects, objectById, zombies, units,
    scriptedSpawns: f.scriptedSpawns ?? [], home, stairwell: f.stairwell ?? null, stairs, buildSpots,
  };
}
