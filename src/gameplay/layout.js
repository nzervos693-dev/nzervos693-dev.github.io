/**
 * Tower geometry and level-data indexes. Pure, no Phaser.
 * All x/y are game px; every position comes from floors.json / balance.world.
 */

/** 1 art pixel = 3 game px (GDD section 9). */
export const ART_SCALE = 3;
/** Walking line inside a floor, from the art manifest note (y=70 art px). */
export const FLOOR_LINE = 70 * ART_SCALE;
/** Empty world space above the top floor / below the bottom floor (room for HUD). */
export const WORLD_PAD_TOP = 190;
export const WORLD_PAD_BOTTOM = 190;

/**
 * Index floors.json for fast lookup.
 * @param {object} floorsData parsed floors.json
 * @param {object} balance
 */
export function buildTower(floorsData, balance) {
  const w = balance.world;
  const layout = floorsData.layout;
  const floors = new Map();
  const objects = new Map(); // id -> { placement, floor, apt }
  const apartments = new Map();
  let home = null;
  for (const f of floorsData.floors) {
    const apts = f.apartments.map((a) => {
      const apt = {
        ...a,
        floor: f.number,
        doorX: layout.doorX[a.side],
        xMin: a.rooms[0].xMin,
        xMax: a.rooms[a.rooms.length - 1].xMax,
      };
      apartments.set(apt.id, apt);
      for (const o of a.objects || []) objects.set(o.id, { placement: o, floor: f.number, apt });
      for (const q of a.questItems || []) objects.set(q.id, { placement: q, floor: f.number, apt, quest: true });
      if (a.isHome) home = apt;
      return apt;
    });
    floors.set(f.number, { ...f, apartments: apts, stairwell: layout.stairwell });
  }
  return {
    layout,
    stairwell: layout.stairwell,
    floors,
    objects,
    apartments,
    home,
    homeFloor: balance.home.floor,
    floorMin: w.floorMin,
    floorMax: w.floorMax,
    floorWidth: w.floorWidthPx,
    floorHeight: w.floorHeightPx,
  };
}

/** Top y of a floor in world space (floorMax is at the top). */
export const floorTopY = (tower, floor) => WORLD_PAD_TOP + (tower.floorMax - floor) * tower.floorHeight;
/** y of the walking line of a floor. */
export const floorLineY = (tower, floor) => floorTopY(tower, floor) + FLOOR_LINE;
/** Total world height. */
export const worldHeight = (tower) =>
  WORLD_PAD_TOP + WORLD_PAD_BOTTOM + (tower.floorMax - tower.floorMin + 1) * tower.floorHeight;

/** Floor number for a world y, clamped into the tower; null outside floors. */
export function floorAtY(tower, y) {
  const idx = Math.floor((y - WORLD_PAD_TOP) / tower.floorHeight);
  const floor = tower.floorMax - idx;
  if (floor < tower.floorMin || floor > tower.floorMax) return null;
  return floor;
}

/** Apartment containing x on a floor, or null (stairwell). */
export function apartmentAt(tower, floor, x) {
  const f = tower.floors.get(floor);
  return f?.apartments.find((a) => x >= a.xMin && x <= a.xMax) || null;
}

/**
 * Room containing x (boundary x goes to the first room).
 * @returns {{apt:object, room:object}|null}
 */
export function roomAt(tower, floor, x) {
  const apt = apartmentAt(tower, floor, x);
  if (!apt) return null;
  const room = apt.rooms.find((r) => x >= r.xMin && x <= r.xMax);
  return room ? { apt, room } : null;
}

export const roomKey = (apt, room) => `${apt.id}:${room.id}`;

/** Where the hero starts / goes with the Home button. */
export function homeSpot(tower) {
  const apt = tower.home;
  const bed = apt?.fixtures?.find((f) => f.kind === 'bed');
  const x = bed ? Math.round((apt.doorX + bed.x) / 2) : tower.stairwell.entryX;
  return { floor: tower.homeFloor, x };
}

/** Is x on this floor inside the home apartment? */
export const isInHome = (tower, floor, x) =>
  floor === tower.homeFloor && !!tower.home && x >= tower.home.xMin && x <= tower.home.xMax;

/** Wall-layer objects float this far above the floor line (counter height). */
export const WALL_LIFT = 28 * ART_SCALE;
