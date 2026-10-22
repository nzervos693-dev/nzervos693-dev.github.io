/**
 * What the Main and Secondary action buttons show for a target (GDD 4, "Main and secondary action by
 * target"). Pure, no Phaser. A slot is { id, icon, enabled, reason?, confirm? }:
 *   id      the action to run (the scene dispatches on it)
 *   icon    frame name in the `action_icons` sheet
 *   reason  toast / thought shown on a tap while the slot is greyed
 *   confirm needs a second tap within controls.buttons.confirmSeconds
 *
 * Targets (built by the scene):
 *   { kind:'zombie', id }
 *   { kind:'door', door }                       a Grid door
 *   { kind:'object', obj }                      a salvage object (container, drainable, bed, ...)
 *   { kind:'workbench' } { kind:'stash' } { kind:'pile', pile }
 *   { kind:'spot', label }                      a placement spot (placement mode)
 */
import { barricadeStage, barricadeMaxHp } from './barricade.js';

/** Weapon id -> action_icons frame. */
export const ATTACK_ICON = Object.freeze({
  fists: 'attack_fists', kitchen_knife: 'attack_knife', spiked_bat: 'attack_bat', crowbar: 'attack_crowbar', lead_pipe: 'attack_pipe', pipe_spear: 'attack_pipe',
});

/** The Attack button icon for the equipped weapon. */
export const attackIcon = (weaponId) => ATTACK_ICON[weaponId] ?? 'attack_fists';

/** Thought by barricade stage 0..4 (GDD 4: Inspect). */
export const INSPECT_LINES = Object.freeze([
  "It'll hold.", "It'll hold.", "It's taken a beating.", 'One more push and it\'s gone.', "There's nothing left of it.",
]);

const slot = (id, icon, enabled = true, reason, confirm = false) => ({ id, icon, enabled, reason, confirm });

/** Greyed slot with a reason. */
const grey = (id, icon, reason) => slot(id, icon, false, reason);

/** "Needs <tool>" text. */
export const needsTool = (tool) => `Needs ${tool}`;

/** Slot for a dismantle of a def (tool check). */
function dismantleSlot(def, c) {
  const need = def.tool && !c.hasTool(def.tool);
  return need ? grey('dismantle', 'dismantle', needsTool(def.tool)) : slot('dismantle', 'dismantle');
}

/**
 * Main and secondary slots for a door.
 * @param {object} door Grid door  @param {object} c context (see describeTarget)
 */
export function doorSlots(door, c) {
  const dismantled = !!c.state.objects[door.id]?.dismantled;
  const barricaded = door.barricade && door.barricade.hp > 0;
  const ownBarricade = barricaded && door.barricade.own;
  const interiorDef = c.balance.objects.interior_door;
  const canDismantle = door.kind === 'interior' && !dismantled;
  const dis = canDismantle ? (door.state === 'broken' ? slot('dismantle', 'dismantle') : dismantleSlot(interiorDef, c)) : null;
  if (dismantled) return { main: null, secondary: null };
  if (door.state === 'broken') return { main: dis, secondary: null };
  if (door.state === 'jammed') return { main: slot('open', 'open_door'), secondary: slot('force', 'force_door') };
  if (barricaded && !ownBarricade) return { main: slot('open', 'open_door'), secondary: null };
  if (ownBarricade) {
    // the hero's barricade: Inspect on Main (the door itself is passed by squeezing through)
    return { main: slot('inspect', 'search'), secondary: null };
  }
  if (door.state === 'closed') return { main: slot('open', 'open_door'), secondary: dis };
  // open
  const blocked = c.doorOccupied(door);
  return { main: blocked ? grey('close', 'close_door', "Something's in the way.") : slot('close', 'close_door'), secondary: dis };
}

/** The thought for Inspect on a hero barricade. */
export function inspectLine(door, state, balance) {
  const st = barricadeStage(door.barricade.hp, barricadeMaxHp(state, balance), balance);
  return INSPECT_LINES[Math.min(INSPECT_LINES.length - 1, st)];
}

/**
 * Main and secondary slots for a salvage object (container, drainable, bed, plain furniture).
 * @param {{id:string, objectId:string}} o
 */
export function objectSlots(o, c) {
  const def = c.balance.objects[o.objectId];
  if (!def) return { main: null, secondary: null };
  const os = c.state.objects[o.id] || {};
  if (os.dismantled) return { main: null, secondary: null };
  if (def.sleepable) return bedSlots(o, def, c);
  const dis = dismantleSlot(def, c);
  const p = def.primary;
  let main = null;
  if (p?.type === 'search') {
    if (os.leftover?.length) main = slot('take', 'take');
    else if (os.searched) main = grey('search', 'search_empty', 'Nothing left.');
    else if (p.tool && !c.hasTool(p.tool)) main = grey('search', 'search', needsTool(p.tool));
    else main = slot('search', 'search');
  } else if (p?.type === 'drain') {
    if (os.drained) main = grey('drain', 'drain', 'Empty.');
    else if (p.tool && !c.hasTool(p.tool)) main = grey('drain', 'drain', needsTool(p.tool));
    else main = slot('drain', 'drain');
  }
  if (!main) return { main: dis, secondary: null }; // no main action: Dismantle moves up
  return { main, secondary: dis };
}

function bedSlots(o, def, c) {
  if (c.isHomeBed(o)) {
    const nap = c.nap;
    return { main: slot('sleep', 'sleep'), secondary: nap.enabled ? slot('nap', 'nap') : grey('nap', 'nap', nap.reason) };
  }
  return { main: grey('sleep', 'sleep', 'Not here. Not yet.'), secondary: dismantleSlot(def, c) };
}

/**
 * Main and secondary slots for a target.
 * @param {object|null} t target
 * @param {{balance:object, state:object, weapon:{id:string}, hasTool:(id:string)=>boolean,
 *   doorOccupied:(door:object)=>boolean, isHomeBed:(o:object)=>boolean, nap:{enabled:boolean,reason?:string},
 *   canStoreAll:boolean, shove:{ready:boolean, inRange:boolean}}} c
 * @returns {{main:object|null, secondary:object|null}}
 */
export function describeTarget(t, c) {
  const none = { main: null, secondary: null };
  if (!t) return none;
  switch (t.kind) {
    case 'zombie': {
      const sh = c.shove;
      const secondary = !sh.ready ? grey('shove', 'shove', 'Not yet.') : !sh.inRange ? grey('shove', 'shove', 'Too far.') : slot('shove', 'shove');
      return { main: slot('attack', attackIcon(c.weapon.id)), secondary };
    }
    case 'door': return doorSlots(t.door, c);
    case 'object': return objectSlots(t.obj, c);
    case 'workbench': return { main: slot('craft', 'craft'), secondary: null };
    case 'stash': return { main: slot('stash', 'store'), secondary: c.canStoreAll ? slot('storeAll', 'store') : grey('storeAll', 'store', 'Nothing to store.') };
    case 'pile': return { main: slot('pickup', 'take'), secondary: null };
    case 'spot': return { main: slot('place', 'place'), secondary: slot('cancel', 'cancel') };
    default: return none;
  }
}

/** Do two slot descriptions look the same (icon and state)? Used to decide whether to cross-fade. */
export const sameSlot = (a, b) => (!a && !b) || (!!a && !!b && a.id === b.id && a.icon === b.icon && a.enabled === b.enabled);
