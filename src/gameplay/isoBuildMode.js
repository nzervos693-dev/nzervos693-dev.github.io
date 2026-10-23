/**
 * Build mode glue (GDD 5.19 "Build mode"): which edge the hero's facing points at, whether it is a target, what
 * Main / Secondary show for it, the seal-in warning, the piece list, ghost frames and result toasts.
 * Pure, no Phaser. The rules themselves are in isoBuild.js.
 */
import { EDGE, TILE } from '../iso/grid.js';
import { EDGE_KIND, PIECE } from './isoStructures.js';
import { mainAction, secondaryAction } from './isoBuild.js';
import { isHqClaimed, isHqTile } from './isoHq.js';
import { heartStandTile } from './isoHeart.js';
import { countItem } from './inventory.js';
import { lightTimeMult } from './isoActions.js';

/** Pieces the rules cannot place yet and the picker hides. None now: barricades on any HQ door arrived with the attack piece (5.20). */
export const UNSUPPORTED_PIECES = Object.freeze([]);

/** action_icons frame of each selectable piece (the Quick-use button in build mode, the picker cells). */
export const PIECE_ICON = Object.freeze({
  wall: 'build_wall', door: 'fit_door', window: 'fit_window', boards: 'board_window', plating: 'plate_window', barricade: 'barricade',
});

const FALLBACK_REASON = "Can't do that.";

const PIECE_CACHE = new WeakMap(); // balance -> piece list (no allocation per call)

/** Pieces shown in the picker, in balance order. @param {object} balance @returns {string[]} */
export function buildPieces(balance) {
  let list = PIECE_CACHE.get(balance);
  if (!list) { list = Object.freeze((balance.build?.pieces ?? ['wall']).filter((p) => !UNSUPPORTED_PIECES.includes(p))); PIECE_CACHE.set(balance, list); }
  return list;
}

/** The saved selection, or the default when it is missing / unknown / unsupported. */
export function selectedPiece(state, balance) {
  const list = buildPieces(balance);
  const s = state.build?.selectedPiece;
  return list.includes(s) ? s : list.includes(balance.build?.defaultPiece) ? balance.build.defaultPiece : list[0];
}

/** Choose a piece (saved as state.build.selectedPiece). @returns {boolean} changed */
export function selectPiece(state, balance, id) {
  if (!buildPieces(balance).includes(id)) return false;
  state.build = state.build || {};
  const changed = state.build.selectedPiece !== id;
  state.build.selectedPiece = id;
  return changed;
}

/** Picker cells: [{ id, icon, selected }]. */
export function pieceCells(state, balance) {
  const cur = selectedPiece(state, balance);
  return buildPieces(balance).map((id) => ({ id, icon: PIECE_ICON[id], selected: id === cur }));
}

// ---- edge cursor ---------------------------------------------------------------------------------

const SIDE_ANGLE = { E: 0, S: 90, W: 180, N: 270 };
const SIDES = ['E', 'S', 'W', 'N'];

const angleDiff = (a, b) => { let d = (b - a) % 360; if (d > 180) d -= 360; else if (d < -180) d += 360; return Math.abs(d); };

/**
 * The grid side the hero faces, snapped to N / E / S / W (N = -y, E = +x, S = +y, W = -x). The previous side is
 * kept until the facing is more than 45 + hysteresis degrees from it (GDD 5.19, build.facingSnapHysteresisDegrees).
 * @param {'N'|'E'|'S'|'W'|null} prev @param {number} facingDeg grid angle @param {number} [hysteresis]
 */
export function snapSide(prev, facingDeg, hysteresis = 10) {
  if (prev && angleDiff(facingDeg, SIDE_ANGLE[prev]) <= 45 + hysteresis) return prev;
  let best = 'E';
  let bd = Infinity;
  for (const s of SIDES) { const d = angleDiff(facingDeg, SIDE_ANGLE[s]); if (d < bd) { bd = d; best = s; } }
  return best;
}

/**
 * The canonical edge on `side` of tile (tx, ty), written into `out` ({x, y, side: 'N'|'W'}). No allocation.
 */
export function edgeInFront(tx, ty, side, out) {
  if (side === 'N') { out.x = tx; out.y = ty; out.side = 'N'; } else if (side === 'W') { out.x = tx; out.y = ty; out.side = 'W'; } else if (side === 'S') { out.x = tx; out.y = ty + 1; out.side = 'N'; } else { out.x = tx + 1; out.y = ty; out.side = 'W'; }
  return out;
}

/**
 * Does the edge cursor target this edge? No target on shaft, void or exterior edges, except an exterior
 * window (its overlay actions), and none where there is no floor on either side.
 * @param {import('./isoStructures.js').Structures} st
 */
export function isEdgeTargetable(st, x, y, side) {
  const kind = st.kindOf(x, y, side);
  if (kind === EDGE_KIND.NONE || kind === EDGE_KIND.SHAFT || kind === EDGE_KIND.VOID) return false;
  if (kind === EDGE_KIND.EXTERIOR) return st.rec(x, y, side)?.piece === PIECE.WINDOW;
  return true;
}

const BUILD_TOOLS = Object.freeze(['hammer', 'sledgehammer', 'fire_axe']);

/**
 * Is build mode available now (the Build icon shows)? Inside the claimed HQ, or carrying a hammer,
 * sledgehammer or fire axe (build.buildIconShownWhen).
 */
export function buildModeAvailable(state, balance, st, hero) {
  for (let i = 0; i < BUILD_TOOLS.length; i++) if (countItem(state.inventory, BUILD_TOOLS[i]) > 0) return true;
  return isHqClaimed(state) && !!st && isHqTile(st, Math.floor(hero.x), Math.floor(hero.y));
}

// ---- Main / Secondary slots ----------------------------------------------------------------------

/** Icon of a Main act: the action's pictogram; a refusal shows the selected piece's icon. */
export function mainIcon(act, selected) {
  switch (act.action) {
    case 'repair': return 'trowel';
    case 'build': return 'build_wall';
    case 'upgrade': return 'upgrade';
    case 'fit': return selected === 'window' ? 'fit_window' : 'fit_door';
    case 'overlay': return PIECE_ICON[selected] ?? 'plate_window';
    default: return PIECE_ICON[selected] ?? 'build_wall';
  }
}

/**
 * A button slot (as in isoButtons.js) for an act { action, result, perform }.
 * Greyed slots carry the refusal message as `reason`.
 */
export function slotOfAct(id, icon, act) {
  const r = act.result;
  return { id, icon, enabled: !!r.ok, reason: r.ok ? undefined : r.message || FALLBACK_REASON, confirm: false, act };
}

/**
 * Main and Secondary for the edge cursor target (GDD 5.19 rules 1-7 and Demolish).
 * @param {{balance:object, structures:object, state:object, characters?:object[]}} bctx isoBuild context
 * @param {{x:number,y:number,side:string}} edge @param {string} selected selected piece
 * @returns {{main:object, secondary:object}}
 */
export function edgeSlots(bctx, edge, selected) {
  const m = mainAction(bctx, edge, selected);
  const s = secondaryAction(bctx, edge);
  return { main: slotOfAct('edgeMain', mainIcon(m, selected), m), secondary: slotOfAct('edgeSecondary', 'demolish', s) };
}

// ---- timing and results -------------------------------------------------------------------------

/** Seconds of a timed edge action: the result's seconds x the light multiplier of the hero's tile (Dim x1.5, Dark x2). */
export const actionSeconds = (result, light, balance) => result.seconds * lightTimeMult(light, balance);

/**
 * The thought / toast after an edge action completed (or failed at completion).
 * @param {object} result from act.perform()
 * @param {object} balance
 */
export function resultToast(result, balance) {
  if (!result.ok) return result.message || FALLBACK_REASON;
  const name = (id) => (balance.items?.[id]?.name ?? balance.materials?.[id]?.name ?? id).toLowerCase();
  const list = (items) => items.map((e) => `${e.qty} ${name(e.id)}`).join(', ');
  const base = {
    build: 'Wall built.', upgrade: 'Stronger.', fit: result.toTier === 'glass' ? 'Window fitted.' : 'Door fitted.', repair: 'Patched up.',
    overlay: result.toTier === 'boards' ? 'Boarded up.' : result.toTier === 'barricade' ? 'Barricaded.' : 'Plated.', demolish: 'Knocked out.',
  }[result.action] ?? 'Done.';
  const parts = [base];
  if (result.salvage?.length) parts.push(`+${list(result.salvage)}`);
  if (result.dropped?.length) parts.push('Bag full: the rest is on the floor.');
  if (result.toolBroke) parts.push(`Your ${name(result.toolBroke)} broke.`);
  return parts.join(' ');
}

// ---- ghost ---------------------------------------------------------------------------------------

/** Tint of the ghost (art manifest: valid). A ghost only shows where Main would build, so there is no blocked tint. */
export const GHOST_TINT = 0x88ff88;

/**
 * iso_walls frame of the ghost, or null. GDD 5.19: only a GAP shows a ghost (of the wall Main would build there);
 * existing pieces get the target outline instead, and refused acts show nothing.
 * @param {{action:string, result:object}} act @param {'x'|'y'} axis @param {boolean} stub low (cutaway) version
 * @param {string} selected selected piece
 */
export function ghostFrame(act, axis, stub) {
  const r = act.result;
  if (!r.ok) return null;
  if (act.action !== 'build' || r.piece !== PIECE.GAP) return null;
  return `wall_${axis}_${stub ? 'stub' : 'full'}_wood`;
}

// ---- sealing yourself in ------------------------------------------------------------------------

/** Can the hero walk from tile (sx, sy) to the landing? Doors (any state) and gaps pass; walls and windows do not. */
function routeToLanding(st, sx, sy, blockedEdge) {
  const g = st.grid;
  const W = g.width;
  const f = st.floor;
  const isLanding = (x, y) => {
    if (g.kindAt(x, y) === TILE.STAIRS || !f.roomAt || !f.rooms) return false;
    const ri = f.roomAt(x, y);
    return ri >= 0 && f.rooms[ri].type === 'stairwell';
  };
  const seen = new Uint8Array(W * g.height);
  const stack = [sy * W + sx];
  seen[sy * W + sx] = 1;
  const blockedEid = blockedEdge ? g.edgeId(blockedEdge.x, blockedEdge.y, blockedEdge.side) : -1;
  while (stack.length) {
    const c = stack.pop();
    const cx = c % W;
    const cy = (c / W) | 0;
    if (isLanding(cx, cy)) return true;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!g.isFloor(nx, ny) || seen[ny * W + nx] || !g.isWalkable(nx, ny)) continue;
      const eid = g.edgeBetween(cx, cy, nx, ny);
      if (eid === blockedEid) continue;
      const t = g.edges[eid];
      if (t !== EDGE.NONE && t !== EDGE.DOOR) continue;
      seen[ny * W + nx] = 1;
      stack.push(ny * W + nx);
    }
  }
  return false;
}

/**
 * Would this act leave the hero with no passable route to the landing (GDD 5.19 "Sealing yourself in")? Only a
 * wall built on a gap can; an upgrade or a fit keeps the edge as blocked (or more open) as it was. The route is
 * measured from the heart (the bed last slept in) when the HQ has one, else from the hero's tile. Warn only: false when he is
 * already sealed in.
 * @param {{structures:object, state?:object, balance?:object}} bctx @param {{action:string, result:object}} act @param {{x:number,y:number}} hero
 */
export function sealsIn(bctx, act, hero) {
  if (!act || act.action !== 'build' || !act.result.ok) return false;
  const st = bctx.structures;
  const heart = bctx.state && bctx.balance && isHqClaimed(bctx.state) ? heartStandTile(st.floor, bctx.state, bctx.balance) : null;
  const sx = heart ? heart.x : Math.floor(hero.x);
  const sy = heart ? heart.y : Math.floor(hero.y);
  if (!st.grid.isFloor(sx, sy) || !routeToLanding(st, sx, sy, null)) return false;
  return !routeToLanding(st, sx, sy, act.result.edge);
}
