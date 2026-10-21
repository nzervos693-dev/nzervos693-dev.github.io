/**
 * View rules for the iso renderer that need no Phaser: vision brightness, wall cutaway, occluder tests,
 * sprite frame choices. GDD 2 (cutaway, occluder fade), 5.17 (vision overlay), 5.18 (door stages).
 */
import { VIS } from '../iso/vision.js';

/** Brightness (0 = black, 1 = full) of a tile for a vision state. 0 means "do not draw at all" (unknown). */
export function tileBrightness(cfg, vis, seen, light, close) {
  const ov = cfg.overlayAlpha;
  if (vis === VIS.NONE) return seen ? 1 - ov.memory : 0;
  let a = vis === VIS.EDGE ? ov.edge : (ov[light] ?? ov.dim);
  if (close && vis === VIS.FULL) a *= cfg.closeCircleAlphaMult;
  return 1 - a;
}

/** Multiply tint (0xRRGGBB) for a brightness; remembered tiles get a cool, desaturated cast. */
export function tintOf(b, remembered) {
  const v = Math.max(0, Math.min(1, b)) * 255;
  if (!remembered) { const g = Math.round(v); return (g << 16) | (g << 8) | g; }
  const r = Math.round(v * 0.9);
  const g = Math.round(v * 0.97);
  const bl = Math.min(255, Math.round(v * 1.15));
  return (r << 16) | (g << 8) | bl;
}

/**
 * Rooms that count as "active" for the cutaway: the hero's room and every room with a Visible tile.
 * @param {{width:number,height:number,roomIndex:Int16Array,rooms:object[]}} floor
 * @param {{visible:Uint8Array}} vision @param {{x:number,y:number}} heroTile
 * @param {Uint8Array} out one flag per room (reused)
 */
export function activeRooms(floor, vision, heroTile, out) {
  out.fill(0);
  const n = floor.roomIndex.length;
  for (let i = 0; i < n; i++) {
    if (vision.visible[i]) { const r = floor.roomIndex[i]; if (r >= 0) out[r] = 1; }
  }
  const hr = floor.roomAt(heroTile.x, heroTile.y);
  if (hr >= 0) out[hr] = 1;
  return out;
}

/**
 * Is a wall edge cut to a stub? Only walls on the south/east side of an ACTIVE room (the room on the
 * north/west tile of the edge) are cut; north/west walls and walls of void/outside never are.
 * @param {{roomA:number}} wall @param {Uint8Array} active
 */
export const wallIsCut = (wall, active) => wall.roomA >= 0 && active[wall.roomA] === 1;

/** Axis-aligned rect overlap. Rects are {x0,y0,x1,y1}. */
export function rectsOverlap(a, b) {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

/** Door art stage by HP ratio (doors.visualStages [0.66, 0.33]): 0 intact, 1 splintered, 2 hanging. */
export function doorStage(hp, maxHp, stages = [0.66, 0.33]) {
  const r = maxHp > 0 ? hp / maxHp : 0;
  if (r > stages[0]) return 0;
  if (r > stages[1]) return 1;
  return 2;
}

/**
 * Wall-sheet frame name for a door in a given state (iso_walls note). Front doors only have
 * closed/open/jammed art; their damage stages use the interior door frames.
 * @param {{state:string,kind:string,hp:number,maxHp:number}} door
 * @param {'x'|'y'} axis @param {boolean} stub
 */
export function doorFrameName(door, axis, stub, stages) {
  const h = stub ? 'stub' : 'full';
  let st = door.state;
  let front = door.kind === 'front';
  if (st === 'closed') {
    const d = doorStage(door.hp, door.maxHp, stages);
    if (d === 1) { st = 'splintered'; front = false; } else if (d === 2) { st = 'hanging'; front = false; }
  }
  if (st === 'broken') front = false;
  return `${front ? 'frontdoor' : 'door'}_${axis}_${h}_${st}`;
}

/** Barricade art stage 0..2 from the 5-step barricadeStage (0,0,1,2,2). */
export const barricadeArtStage = (stage5) => [0, 0, 1, 2, 2][Math.max(0, Math.min(4, stage5))];

/**
 * Prop frame orientation. Footprints along x use the "a" frame, along y "b"; 1x1 props go by facing:
 * S -> a, E -> b, N -> a mirrored, W -> b mirrored (the art has only the two camera-facing views).
 * @param {number[]} span [w,h] @param {'N'|'E'|'S'|'W'} facing
 * @returns {{suffix:'a'|'b', flip:boolean}}
 */
export function propOrientation(span, facing) {
  const [w, h] = span;
  if (w > h) return { suffix: 'a', flip: false };
  if (h > w) return { suffix: 'b', flip: false };
  if (facing === 'S') return { suffix: 'a', flip: false };
  if (facing === 'E') return { suffix: 'b', flip: false };
  if (facing === 'N') return { suffix: 'a', flip: true };
  return { suffix: 'b', flip: true };
}
