import balance from '../../public/data/balance.json';
import floorsIso from '../../public/data/levels/floors_iso.json';
import { loadIsoFloor } from '../../src/iso/loader.js';
import { createIsoState } from '../../src/gameplay/isoState.js';
import { createStructures } from '../../src/gameplay/isoStructures.js';
import { addItem, newStack } from '../../src/gameplay/inventory.js';

export { balance };

/** Fresh floor 15 + state + ctx (HQ claimed by default, no characters in the way). */
export function hqWorld({ claimed = true } = {}) {
  const floor = loadIsoFloor(floorsIso, 15, balance);
  const state = createIsoState(balance, floor, 0);
  const structures = createStructures(floor, balance);
  if (claimed) state.hq = { claimed: true, claimedAt: 1 };
  const ctx = { balance, structures, state, characters: [] };
  return { floor, state, structures, ctx, grid: floor.grid };
}

/** Put materials into the carried bag. */
export function stock(state, items, where = 'inventory') {
  for (const [id, qty] of Object.entries(items)) {
    const left = addItem(state[where], id, qty, balance);
    if (left) throw new Error(`test stock: ${left} ${id} did not fit`);
  }
}

/** Put a tool into the bag (sledgehammer gets build.sledgehammerUses). */
export function giveTool(state, id) {
  const i = state.inventory.findIndex((s) => !s);
  state.inventory[i] = newStack(id, 1, balance);
}

export const have = (state, id) => [...state.inventory, ...state.stockpile].reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);

/** First edge of the structure model matching a predicate. */
export function findEdge(structures, pred) {
  const g = structures.grid;
  for (let y = 0; y <= g.height; y++) for (let x = 0; x <= g.width; x++) for (const side of ['N', 'W']) {
    if (side === 'N' && x >= g.width) continue;
    if (side === 'W' && y >= g.height) continue;
    const d = structures.describe(x, y, side);
    if (pred(d)) return { x, y, side };
  }
  return null;
}
