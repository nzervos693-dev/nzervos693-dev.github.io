/**
 * Virtual joystick maths for the iso world (GDD 4, controls.joystick.*). Pure, no Phaser.
 *
 * The finger offset from the stick origin is a SCREEN vector; stickGridDir converts it to a unit vector
 * on the tile grid with the projection helpers (screen up-right = grid NE). stepStickMove then walks the
 * hero continuously through the grid, axis by axis, so a direction that is partly blocked slides along
 * the wall (the two adjacent 8-directions). Closed doors are reported, not walked through.
 */
import { screenDeltaToAngle, angleToGridVec } from '../iso/projection.js';
import { MOVE } from '../iso/grid.js';

/** Defaults used when balance.controls.joystick (or hero.collisionRadiusTiles) is missing. */
export const STICK_DEFAULTS = Object.freeze({
  radiusPx: 120,
  knobRadiusPx: 44,
  deadZone: 0.15,
  creepThreshold: 0.4,
  runThreshold: 0.7,
  zoneWidthFrac: 0.55,
  zoneHeightFrac: 0.55,
  tapMaxSeconds: 0.25,
  fadeInSeconds: 0.1,
  fadeSeconds: 0.3,
  doorPushSeconds: 0.2,
  doorwayAssistTiles: 0.35,
  doorwayAssistMaxAngleDegrees: 60,
  knobRunAlpha: 0.45,
  visual: { ringFillColor: '#0b0c0e', ringFillAlpha: 0.25, ringStrokeColor: '#bdb8ab', ringStrokeAlpha: 0.2, ringStrokePx: 3, knobColor: '#bdb8ab', knobAlpha: 0.3 },
  collisionRadiusTiles: 0.3,
  creepSpeedMult: 0.5,
  knobCreepAlpha: 0.2,
  maxSubstepTiles: 0.3,
});

/** Joystick numbers from balance (GDD 4), with defaults for anything missing. */
export function stickConfig(balance) {
  const j = balance.controls?.joystick ?? {};
  return {
    ...STICK_DEFAULTS, ...j,
    visual: { ...STICK_DEFAULTS.visual, ...(j.visual ?? {}) },
    collisionRadiusTiles: balance.hero?.collisionRadiusTiles ?? STICK_DEFAULTS.collisionRadiusTiles,
    creepSpeedMult: balance.hero?.creepSpeedMult ?? STICK_DEFAULTS.creepSpeedMult,
  };
}

/** Stick side from the saved settings: 'left' (default) or 'right' (left-handed play). */
export const stickSide = (settings) => (settings?.joystickSide === 'right' ? 'right' : 'left');

/**
 * Is a touch-down at (x, y) inside the stick zone: the lower-left (or lower-right when side is 'right')
 * zoneWidthFrac x zoneHeightFrac of the screen, kept above the bottom bar (`bottomLimit`, screen y of its
 * top edge)?
 */
export function inStickZone(cfg, x, y, width, height, bottomLimit = height, side = 'left') {
  const inX = side === 'right' ? x >= width * (1 - cfg.zoneWidthFrac) : x <= width * cfg.zoneWidthFrac;
  return inX && y >= height * (1 - cfg.zoneHeightFrac) && y <= bottomLimit;
}

/**
 * Read the finger offset (dx, dy screen px from the origin).
 * @param {{x:number,y:number,mag:number,ux:number,uy:number,active:boolean,run:boolean}} [out]
 * @returns the knob offset clamped to the radius (x, y), mag 0..1 (of the radius), the unit screen
 *   direction (ux, uy), active (past the dead zone), creep (active, below creepThreshold: slow and quiet)
 *   and run (pushed past runThreshold); between the two is a walk
 */
export function readStick(cfg, dx, dy, out = { x: 0, y: 0, mag: 0, ux: 0, uy: 0, active: false, creep: false, run: false }) {
  const len = Math.hypot(dx, dy);
  const m = Math.min(1, len / cfg.radiusPx);
  out.mag = m;
  out.x = len > 1e-6 ? (dx / len) * m * cfg.radiusPx : 0;
  out.y = len > 1e-6 ? (dy / len) * m * cfg.radiusPx : 0;
  out.ux = len > 1e-6 ? dx / len : 0;
  out.uy = len > 1e-6 ? dy / len : 0;
  out.active = m >= cfg.deadZone;
  out.creep = out.active && m < cfg.creepThreshold;
  out.run = out.active && m >= cfg.runThreshold;
  return out;
}

/**
 * Unit grid direction for a screen direction (screen up-right = grid NE, up = grid NW-ish diagonal).
 * @param {object} iso isoConfig
 * @returns {{x:number,y:number,angle:number}} angle is the grid facing angle in degrees
 */
export function stickGridDir(iso, ux, uy, out = { x: 0, y: 0, angle: 0 }) {
  out.angle = screenDeltaToAngle(iso, ux, uy);
  angleToGridVec(out.angle, out);
  return out;
}

const EPS = 1e-6;
/** Sideways stick component (0-1) above which steering away from a doorway centre cancels the assist. */
const ASSIST_AWAY_MAX = 0.5;
const MOVE_OUT = { code: 0, door: null, moved: false, assistAxis: -1, assistSign: 0 };
/** Result codes of stepStickMove. */
export const STICK = Object.freeze({ MOVING: 0, DOOR: 1, LOCKED: 2, SQUEEZE: 3 });

/**
 * Move the hero `dist` tiles along the unit grid vector (gx, gy). Mutates hero.x / hero.y.
 * @param {{x:number,y:number}} hero
 * @param {{grid:object, isBlocked?:(x:number,y:number)=>boolean, radius:number, doorMin:number, maxStep:number,
 *   assistTiles:number, assistMinCos:number}} env (radius = hero collision radius in tiles)
 * @returns {{code:number, door:object|null, moved:boolean}} scratch object valid until the next call.
 *   DOOR: a closed door blocks the way (open it); LOCKED: jammed/foreign-barricaded door; SQUEEZE: the hero
 *   slipped through his own barricade (the door is returned so the scene can pause him).
 */
export function stepStickMove(hero, gx, gy, dist, env) {
  const out = MOVE_OUT;
  out.code = STICK.MOVING;
  out.door = null;
  out.moved = false;
  out.assistAxis = -1;
  let left = dist;
  while (left > 1e-9) {
    const d = Math.min(left, env.maxStep);
    left -= d;
    const xFirst = Math.abs(gx) >= Math.abs(gy);
    if (xFirst) { moveAxis(hero, 0, gx, d, env, out, gy); moveAxis(hero, 1, gy, d, env, out, gx); } else { moveAxis(hero, 1, gy, d, env, out, gx); moveAxis(hero, 0, gx, d, env, out, gy); }
    if (out.code !== STICK.MOVING && out.code !== STICK.SQUEEZE) break;
  }
  return out;
}

/** `other`: the stick's component on the other axis (for the doorway assist). */
function moveAxis(hero, axis, comp, d, env, out, other) {
  const ac = Math.abs(comp);
  if (ac < 1e-6) return;
  const sign = comp > 0 ? 1 : -1;
  if (out.assistAxis === axis && sign !== out.assistSign) return; // do not undo the doorway assist
  const pos = axis === 0 ? hero.x : hero.y;
  const np = pos + sign * ac * d;
  const c = Math.floor(pos);
  const probe = Math.floor(np + sign * env.radius);
  let result = np;
  if (probe !== c) {
    const cx = Math.floor(hero.x);
    const cy = Math.floor(hero.y);
    const dx = axis === 0 ? sign : 0;
    const dy = axis === 1 ? sign : 0;
    const cls = env.grid.stepClass(cx, cy, dx, dy);
    let pass = cls === MOVE.OPEN;
    if (pass && env.isBlocked?.(cx + dx, cy + dy)) pass = false;
    if (pass && clipsSideways(hero, axis, cx, cy, dx, dy, env)) {
      // a wall corner beside the doorway would clip the hero's circle: ease him toward the doorway centre
      pass = false;
      const lat = axis === 0 ? hero.y : hero.x;
      const off = 0.5 - (lat - Math.floor(lat));
      // no assist when the player steers clearly away from the doorway centre: he means to slide along the wall
      const awayFromCentre = other * off < 0 && Math.abs(other) > ASSIST_AWAY_MAX;
      if (Math.abs(off) <= env.assistTiles && ac >= env.assistMinCos && !awayFromCentre) {
        const nudge = Math.sign(off) * Math.min(Math.abs(off), d);
        out.assistAxis = 1 - axis;
        out.assistSign = Math.sign(off);
        if (axis === 0) hero.y += nudge; else hero.x += nudge;
        out.moved = true;
      }
    }
    if (cls === MOVE.SQUEEZE) {
      pass = true;
      out.code = STICK.SQUEEZE;
      out.door = env.grid.doors.get(env.grid.edgeBetween(cx, cy, cx + dx, cy + dy));
    } else if ((cls === MOVE.CLOSED || cls === MOVE.LOCKED) && ac >= env.doorMin && out.code === STICK.MOVING) {
      out.code = cls === MOVE.CLOSED ? STICK.DOOR : STICK.LOCKED;
      out.door = env.grid.doors.get(env.grid.edgeBetween(cx, cy, cx + dx, cy + dy));
    }
    if (!pass) {
      // stop short of the edge, never backwards
      result = sign > 0 ? Math.max(pos, Math.min(np, c + 1 - env.radius)) : Math.min(pos, Math.max(np, c + env.radius));
    }
  }
  if (result !== pos) out.moved = true;
  if (axis === 0) hero.x = result; else hero.y = result;
}

/**
 * Would the hero's circle clip a wall while crossing from (cx,cy) by (dx,dy)? Only when he stands within
 * the radius of the side edge of his tile (so part of the circle already leans into the lateral tile):
 * then the lateral tile's own crossing edge, and the wall between the target tile and the lateral target
 * tile, must be open. A wall already between him and the lateral tile means nothing leans there.
 */
function clipsSideways(hero, axis, cx, cy, dx, dy, env) {
  const lat = axis === 0 ? hero.y : hero.x;
  const f = lat - Math.floor(lat);
  const ld = f < env.radius - EPS ? -1 : f > 1 - env.radius + EPS ? 1 : 0;
  if (ld === 0) return false;
  const lx = axis === 0 ? 0 : ld;
  const ly = axis === 0 ? ld : 0;
  if (env.grid.stepClass(cx, cy, lx, ly) !== MOVE.OPEN) return false;
  if (env.grid.stepClass(cx + lx, cy + ly, dx, dy) !== MOVE.OPEN) return true;
  return env.grid.stepClass(cx + dx, cy + dy, lx, ly) !== MOVE.OPEN;
}
