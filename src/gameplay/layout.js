/**
 * Tower geometry and level-data indexes. Pure, no Phaser.
 * All x/y are game px; every position comes from tower_m2.json / balance.world.
 */

import { WALK_SLAB_PX } from './hitAreas.js';

/** 1 art pixel = 3 game px (GDD section 9). */
export const ART_SCALE = 3;
/** Walking line inside a floor, from the art manifest note (y=70 art px). */
export const FLOOR_LINE = 70 * ART_SCALE;
/** Empty world space above the top floor / below the bottom floor (room for HUD). */
export const WORLD_PAD_TOP = 190;
export const WORLD_PAD_BOTTOM = 190;
/** Room types that have a window (templates.json roomTypes.<t>.hasWindow); used when no templates are passed. */
const WINDOW_TYPES = new Set(['living', 'kitchen', 'bedroom', 'kids_room', 'studio', 'reception', 'office']);

/**
 * x of module slot k (0-based, counted outward from the room's front-door side) of a room (GDD 5.3):
 * d = startModule*module + module*floor(k/2) + slotOffsets[k%2]; left wing x = wing - d, right wing x = wing + shaft + d.
 * @param {'left'|'right'} side
 * @param {number} startModule module index of the room's first module (0 = at the front door)
 * @param {number} k slot index inside the room
 * @param {object} balance
 */
export function slotX(side, startModule, k, balance) {
  const w = balance.world;
  const d = startModule * w.moduleWidthPx + w.moduleWidthPx * Math.floor(k / 2) + w.slotOffsetsPx[k % 2];
  return side === 'left' ? w.wingWidthPx - d : w.wingWidthPx + w.stairwellWidthPx + d;
}

/** x of a room edge `modules` modules from the front door (distance d). */
export const edgeX = (side, d, balance) => (side === 'left'
  ? balance.world.wingWidthPx - d
  : balance.world.wingWidthPx + balance.world.stairwellWidthPx + d);

/** Which way is "into the unit" from its front door: -1 for the left wing, +1 for the right. */
export const insideSign = (side) => (side === 'left' ? -1 : 1);

/**
 * Index tower_m2.json (authored floors; the stage 3 generator will output the same shape).
 * Each unit becomes an "apartment" with x span, front door, rooms (x spans), slots, interior doors and
 * objects (interior doors are objects on layer 'door'; the workbench is a fixture).
 * @param {object} towerData parsed tower_m2.json
 * @param {object} balance
 * @param {object} [templates] parsed templates.json (room types, note texts)
 */
export function buildTower(towerData, balance, templates = null) {
  const w = balance.world;
  const leftDoorX = w.wingWidthPx;
  const rightDoorX = w.wingWidthPx + w.stairwellWidthPx;
  const noteText = collectNotes(templates);
  const roomTypes = templates?.roomTypes;
  const hasWindow = (type) => (roomTypes ? !!roomTypes[type]?.hasWindow : WINDOW_TYPES.has(type));
  const floors = new Map();
  const objects = new Map(); // id -> { placement, floor, apt }
  const apartments = new Map();
  const doors = new Map(); // id -> door { id, floor, x, kind: 'front'|'interior', apt, state }
  let home = null;
  for (const f of towerData.floors) {
    const st = f.stairwell || {};
    const stairwell = {
      xMin: st.xMin ?? leftDoorX,
      xMax: st.xMax ?? rightDoorX,
      entryX: st.landing?.stairsX ?? (leftDoorX + rightDoorX) / 2,
      landing: st.landing || { xMin: leftDoorX, xMax: rightDoorX },
    };
    const apts = [];
    const floorDoors = [];
    for (const side of ['left', 'right']) {
      const u = f[side];
      if (!u) continue;
      const apt = buildUnit(f.number, side, u, balance, hasWindow, noteText);
      apt.doorX = side === 'left' ? leftDoorX : rightDoorX;
      apt.front = { id: apt.id, floor: f.number, x: apt.doorX, kind: 'front', apt, state: u.frontDoor || 'open' };
      apt.doors = [apt.front, ...apt.interiorDoors];
      apt.countsAsHome = f.number === balance.home.startFloor && side !== balance.home.startWing;
      apt.isHome = !!u.isHome || (f.number === balance.home.startFloor && side === balance.home.startWing);
      apartments.set(apt.id, apt);
      for (const d of apt.doors) { doors.set(d.id, d); floorDoors.push(d); }
      for (const o of apt.objects) objects.set(o.id, { placement: o, floor: f.number, apt });
      if (apt.isHome) home = apt;
      apts.push(apt);
    }
    floors.set(f.number, {
      ...f, left: undefined, right: undefined, apartments: apts, doors: floorDoors, stairwell, startState: f.startState || 'Infested',
    });
  }
  const homeFloor = balance.home.startFloor;
  const homeBed = home?.objects.find((o) => balance.objects[o.objectId]?.sleepable);
  const bs = home?.buildSpots?.barricade;
  return {
    stairwell: floors.get(homeFloor)?.stairwell || { xMin: leftDoorX, xMax: rightDoorX, entryX: (leftDoorX + rightDoorX) / 2 },
    floors,
    objects,
    apartments,
    doors,
    home,
    homeFloor,
    homeBedId: homeBed?.id || null,
    /** x of the home front door barricade (stage 2 rule: the barricade stands on the home front door). */
    barricadeX: bs?.x ?? home?.doorX ?? leftDoorX,
    /** Which side of the barricade is the inside of the home: -1 = lower x, +1 = higher x. */
    barricadeInside: home ? insideSign(home.side) : -1,
    floorMin: w.floorMin,
    floorMax: w.floorMax,
    floorWidth: w.floorWidthPx,
    floorHeight: w.floorHeightPx,
  };
}

/** id -> text for every note in templates.json (notes list, floor overrides, authored start flat). */
function collectNotes(templates) {
  const out = {};
  if (!templates) return out;
  for (const n of templates.notes || []) out[n.id] = n.text;
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (typeof v.id === 'string' && typeof v.text === 'string') out[v.id] = v.text;
    for (const k of Object.keys(v)) walk(v[k]);
  };
  walk(templates.floorOverrides);
  walk(templates.templates);
  return out;
}

function buildUnit(floor, side, u, balance, hasWindow, noteText) {
  const w = balance.world;
  const apt = {
    id: u.id, floor, side, template: u.template, condition: u.condition || 'normal', name: u.name, flavour: u.flavour,
    doorState: u.frontDoor || 'open', buildSpots: u.buildSpots || null, zombies: u.zombies || [], survivors: u.survivors || [],
    questItems: u.questItems || [], rooms: [], slots: [], objects: [], fixtures: [], interiorDoors: [],
  };
  const wing = w.wingWidthPx;
  const a = edgeX(side, 0, balance);
  const b = edgeX(side, wing, balance);
  apt.xMin = Math.min(a, b);
  apt.xMax = Math.max(a, b);
  const byRef = new Map();
  u.rooms.forEach((r, i) => {
    const d0 = r.startModule * w.moduleWidthPx;
    const d1 = (r.startModule + r.modules) * w.moduleWidthPx;
    const x0 = edgeX(side, d0, balance);
    const x1 = edgeX(side, d1, balance);
    const room = {
      id: r.ref, kind: r.type, index: i, modules: r.modules, startModule: r.startModule, doorAfter: r.doorAfter || 'none',
      xMin: Math.min(x0, x1), xMax: Math.max(x0, x1), farX: x1, window: hasWindow(r.type),
    };
    apt.rooms.push(room);
    byRef.set(r.ref, room);
    for (let k = 0; k < r.modules * 2; k++) {
      for (const layer of ['floor', 'wall']) {
        apt.slots.push({ id: `${u.id}-${i}-${layer}${k}`, layer, x: slotX(side, r.startModule, k, balance), room: r.ref, window: room.window });
      }
    }
    if (room.doorAfter !== 'none' && i < u.rooms.length - 1) {
      const id = `${u.id}-door${i}`;
      apt.interiorDoors.push({ id, floor, x: x1, kind: 'interior', apt, room: r.ref, state: room.doorAfter });
      apt.objects.push({ id, objectId: 'interior_door', x: x1, layer: 'door', room: r.ref, door: true });
    }
  });
  for (const o of u.objects || []) {
    if (o.fixture) {
      apt.fixtures.push({ id: o.id, kind: o.objectId, x: o.x, layer: o.layer, room: o.room });
      continue;
    }
    const placement = { ...o };
    if (o.foundNote) placement.foundNote = { ...o.foundNote, text: o.foundNote.text ?? noteText[o.foundNote.id] ?? '' };
    apt.objects.push(placement);
  }
  for (const s of apt.survivors) s.floor = floor;
  return apt;
}

/** Top y of a floor in world space (floorMax is at the top). */
export const floorTopY = (tower, floor) => WORLD_PAD_TOP + (tower.floorMax - floor) * tower.floorHeight;
/** y of the walking line of a floor. */
export const floorLineY = (tower, floor) => floorTopY(tower, floor) + FLOOR_LINE;
/**
 * Floor a walk tap at world y belongs to: like floorAtY, but the zone under the floor line is WALK_SLAB_PX tall
 * (it takes 30 px from the next floor's ceiling), so a thumb tap just under the feet still walks.
 */
export function tapFloorAtY(tower, y) {
  return floorAtY(tower, y - (WALK_SLAB_PX - (tower.floorHeight - FLOOR_LINE)));
}
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

/** Where the hero starts / goes with the Home button: at the home bed (stage 2: the start flat's bed). */
export function homeSpot(tower) {
  const bed = tower.home?.objects.find((o) => o.id === tower.homeBedId);
  const x = bed ? bed.x : tower.stairwell.entryX;
  return { floor: tower.homeFloor, x };
}

/** Is x on this floor inside the home apartment? */
export const isInHome = (tower, floor, x) =>
  floor === tower.homeFloor && !!tower.home && x >= tower.home.xMin && x <= tower.home.xMax;

/** Wall-layer objects float this far above the floor line (counter height). */
export const WALL_LIFT = 28 * ART_SCALE;

/** World y of the centre of a 96 px build-spot target (window spots sit at wall height). */
export const spotCenterY = (tower, floor, kind) => floorLineY(tower, floor) - (kind === 'window' ? WALL_LIFT : 0) - 48;
