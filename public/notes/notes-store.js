// Pure note logic (no DOM) so it can be unit-tested.

export const COLORS = ['', 'yellow', 'green', 'blue', 'pink', 'purple', 'gray'];
export const SORTS = { updated: 'Last edited', created: 'Date created', title: 'Title A–Z' };
const VERSION = 1;

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function createNote(now = Date.now()) {
  return { id: newId(), title: '', body: '', pinned: false, color: '', created: now, updated: now };
}

export function isBlank(note) {
  return !note.title.trim() && !note.body.trim();
}

/** Coerce anything loaded from storage or a backup file into a valid note, or null. */
export function sanitize(n) {
  if (!n || typeof n !== 'object' || typeof n.id !== 'string' || !n.id) return null;
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const created = num(n.created, Date.now());
  return {
    id: n.id.slice(0, 64),
    title: typeof n.title === 'string' ? n.title : '',
    body: typeof n.body === 'string' ? n.body : '',
    pinned: n.pinned === true,
    color: COLORS.includes(n.color) ? n.color : '',
    created,
    updated: num(n.updated, created),
  };
}

export function parseStored(text) {
  try {
    const data = JSON.parse(text);
    const list = Array.isArray(data) ? data : data && Array.isArray(data.notes) ? data.notes : null;
    if (!list) return null;
    return list.map(sanitize).filter(Boolean);
  } catch {
    return null;
  }
}

export function serialize(notes) {
  return JSON.stringify({ app: 'notes', version: VERSION, exported: Date.now(), notes });
}

/** Merge imported notes: new ids are added, existing ids keep whichever was edited last. */
export function merge(current, incoming) {
  const byId = new Map(current.map((n) => [n.id, n]));
  let added = 0, updated = 0;
  for (const n of incoming) {
    const old = byId.get(n.id);
    if (!old) { byId.set(n.id, n); added++; }
    else if (n.updated > old.updated) { byId.set(n.id, n); updated++; }
  }
  return { notes: [...byId.values()], added, updated };
}

export function matches(note, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (note.title + '\n' + note.body).toLowerCase().includes(q);
}

export function sortNotes(notes, mode = 'updated') {
  const cmp = {
    updated: (a, b) => b.updated - a.updated,
    created: (a, b) => b.created - a.created,
    title: (a, b) => (a.title || a.body).localeCompare(b.title || b.body, undefined, { sensitivity: 'base' }),
  }[mode] || ((a, b) => b.updated - a.updated);
  return [...notes].sort(cmp);
}

/** Notes to show: filtered by query, split into pinned and others, each sorted. */
export function view(notes, query = '', mode = 'updated') {
  const shown = sortNotes(notes.filter((n) => matches(n, query)), mode);
  return { pinned: shown.filter((n) => n.pinned), others: shown.filter((n) => !n.pinned) };
}

export function formatDate(ts, now = Date.now()) {
  const d = new Date(ts), today = new Date(now);
  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}
