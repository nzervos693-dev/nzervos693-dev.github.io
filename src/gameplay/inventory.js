/**
 * Inventory slot logic (carry slots and home stockpile). Pure, no Phaser.
 * A slots array has fixed length; each entry is null or
 * { id, qty, uses? } (uses = remaining tool uses / weapon durability).
 */

/** @returns {(null)[]} */
export const createSlots = (n) => Array.from({ length: n }, () => null);

/**
 * Max quantity per slot for an item id, from balance.items + balance.inventory.
 * @param {string} id
 * @param {object} balance
 */
export function stackLimit(id, balance) {
  const kind = balance.items?.[id]?.stack;
  const inv = balance.inventory;
  if (kind === 'material') return inv.materialStack;
  if (kind === 'item') return inv.itemStack;
  if (kind === 'heavy') return inv.heavyStack ?? inv.toolStack;
  return inv.toolStack;
}

/** Full uses of a tool / durability of a weapon (the sledgehammer has its own count), or null for other items. */
export function maxUses(id, balance) {
  if (id === 'sledgehammer' && balance.build?.sledgehammerUses) return balance.build.sledgehammerUses;
  const type = balance.items?.[id]?.type;
  if (type === 'tool') return balance.salvage.toolUses;
  if (type === 'weapon') return balance.combat?.weapons?.[id]?.durability ?? null;
  return null;
}

/** Fresh stack with tool uses / weapon durability filled in. */
export function newStack(id, qty, balance) {
  const s = { id, qty };
  const u = maxUses(id, balance);
  if (u != null) s.uses = u;
  return s;
}

/** Total quantity of an item id. */
export const countItem = (slots, id) =>
  slots.reduce((n, s) => n + (s && s.id === id ? s.qty : 0), 0);

export const freeSlotCount = (slots) => slots.reduce((n, s) => n + (s ? 0 : 1), 0);

/**
 * How many of `qty` would fit (no mutation).
 */
export function fitCount(slots, id, qty, balance) {
  const lim = stackLimit(id, balance);
  let room = 0;
  for (const s of slots) {
    if (!s) room += lim;
    else if (s.id === id) room += lim - s.qty;
  }
  return Math.min(qty, room);
}

/**
 * Add items; returns the quantity that did NOT fit.
 * @returns {number} leftover
 */
export function addItem(slots, id, qty, balance) {
  const lim = stackLimit(id, balance);
  let left = qty;
  for (const s of slots) {
    if (left <= 0) break;
    if (s && s.id === id && s.qty < lim) {
      const put = Math.min(lim - s.qty, left);
      s.qty += put;
      left -= put;
    }
  }
  for (let i = 0; i < slots.length && left > 0; i++) {
    if (!slots[i]) {
      const put = Math.min(lim, left);
      slots[i] = newStack(id, put, balance);
      left -= put;
    }
  }
  return left;
}

/** Add a list of {id, qty}; returns leftovers as a list. */
export function addAll(slots, list, balance) {
  const out = [];
  for (const e of list) {
    const left = addItem(slots, e.id, e.qty, balance);
    if (left > 0) out.push({ id: e.id, qty: left });
  }
  return out;
}

/**
 * Remove up to qty of an item (emptiest stacks first). Returns removed qty.
 */
export function removeItem(slots, id, qty) {
  let left = qty;
  const idx = slots.map((s, i) => i).filter((i) => slots[i] && slots[i].id === id)
    .sort((a, b) => slots[a].qty - slots[b].qty);
  for (const i of idx) {
    if (left <= 0) break;
    const take = Math.min(slots[i].qty, left);
    slots[i].qty -= take;
    left -= take;
    if (slots[i].qty <= 0) slots[i] = null;
  }
  return qty - left;
}

/**
 * Move every movable stack from one slot array to another.
 * Quest items never move. Whatever does not fit stays in `from`.
 * @returns {number} number of items moved
 */
export function moveAll(from, to, balance) {
  let moved = 0;
  for (let i = 0; i < from.length; i++) {
    const s = from[i];
    if (!s || balance.items?.[s.id]?.type === 'quest') continue;
    moved += moveStack(from, i, to, balance);
  }
  return moved;
}

/**
 * Move one slot's stack to another array. Returns quantity moved.
 */
export function moveStack(from, index, to, balance) {
  const s = from[index];
  if (!s) return 0;
  if (s.uses != null) {
    // unique stack (tool/weapon): needs a free slot, keeps its uses
    const j = to.findIndex((t) => !t);
    if (j < 0) return 0;
    to[j] = s;
    from[index] = null;
    return s.qty;
  }
  const left = addItem(to, s.id, s.qty, balance);
  const moved = s.qty - left;
  if (left <= 0) from[index] = null;
  else s.qty = left;
  return moved;
}

/**
 * Rebuild a loaded slot array. Never trims filled slots: the result is at least
 * `n` long and long enough for the last filled slot. Corrupt entries and unknown
 * item ids (when `items` registry given) are dropped with a console.warn.
 * @param {any} raw
 * @param {number} n wanted capacity
 * @param {object} [items] balance.items registry
 */
export function normalizeSlots(raw, n, items) {
  const src = Array.isArray(raw) ? raw : [];
  const out = createSlots(Math.max(n, src.length));
  src.forEach((s, i) => {
    if (!s || typeof s.id !== 'string' || !(s.qty > 0)) return;
    if (items && !items[s.id]) { console.warn(`Dropping unknown item "${s.id}" from save`); return; }
    out[i] = s;
  });
  // trim only trailing empties beyond the wanted capacity
  while (out.length > n && out[out.length - 1] === null) out.pop();
  return out;
}
