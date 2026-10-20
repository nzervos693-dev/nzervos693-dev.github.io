/*
 * save.js - versioned localStorage save. Never throws.
 *
 *   import { loadSave, writeSave, getSave, updateSave } from './core/save.js';
 *   const data = loadSave();            // call once at boot; returns data (defaults if none/corrupt)
 *   getSave().settings.muted            // read current in-memory data
 *   updateSave({ floor: 3 });           // SHALLOW merge of top-level keys + write (replaces
 *                                       // whole `settings`/`game` objects; mutate getSave().x then writeSave() instead)
 *   writeSave();                        // write current data (stamps lastSaveTime = Date.now())
 *
 * Add new persisted fields to defaultSave(). When the shape changes, bump
 * SAVE_VERSION and add a step to MIGRATIONS (key = version migrated FROM).
 * writeSave() does nothing until loadSave() has run. A corrupt save is copied to
 * SAVE_KEY + '.bak' before defaults replace it; a save from a newer version is
 * kept untouched (writes refused).
 * If localStorage is unavailable, data lives in memory only and writes
 * return false. Tests can inject a storage with setStorage(fake).
 */
export const SAVE_KEY = 'floor15.save';
export const SAVE_VERSION = 1;

export const defaultSave = () => ({
  version: SAVE_VERSION,
  lastSaveTime: 0, // epoch ms of last write; 0 = never saved
  settings: { muted: false },
  game: {}, // gameplay-programmer owns the contents
});

// MIGRATIONS[n] upgrades a version-n save to version n+1.
export const MIGRATIONS = {
  // 1: (d) => ({ ...d, version: 2, newField: 0 }),
};

let storage = undefined; // undefined = resolve lazily
let current = defaultSave();
let loaded = false; // writeSave is a no-op until loadSave() has run
let readOnly = false; // true when the stored save is from a newer game version

function getStorage() {
  if (storage !== undefined) return storage;
  try {
    storage = globalThis.localStorage ?? null;
  } catch {
    storage = null;
  }
  return storage;
}

export function setStorage(s) {
  storage = s;
}

export function migrate(data) {
  let d = data;
  while (d.version < SAVE_VERSION) {
    const step = MIGRATIONS[d.version];
    if (!step) return null;
    const next = step(d);
    if (!next || !(next.version > d.version)) return null; // step must bump version
    d = next;
  }
  return d;
}

function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (!Number.isInteger(raw.version) || raw.version < 1 || raw.version > SAVE_VERSION) return null;
  const migrated = migrate(raw);
  if (!migrated) return null;
  const def = defaultSave();
  return {
    ...def,
    ...migrated,
    settings: { ...def.settings, ...(migrated.settings || {}) },
    game: migrated.game && typeof migrated.game === 'object' ? migrated.game : {},
  };
}

export function loadSave() {
  let parsed = null;
  readOnly = false;
  let text = null;
  try {
    text = getStorage()?.getItem(SAVE_KEY);
    if (text) {
      const raw = JSON.parse(text);
      if (raw && Number.isInteger(raw.version) && raw.version > SAVE_VERSION) readOnly = true;
      parsed = normalize(raw);
    }
  } catch {
    parsed = null;
  }
  if (text && !parsed) {
    try { getStorage()?.setItem(SAVE_KEY + '.bak', text); } catch { /* ignore */ }
  }
  current = parsed ?? defaultSave();
  loaded = true;
  return current;
}

export function getSave() {
  return current;
}

export function writeSave(now = Date.now()) {
  if (!loaded || readOnly) return false;
  current.lastSaveTime = now;
  try {
    const s = getStorage();
    if (!s) return false;
    s.setItem(SAVE_KEY, JSON.stringify(current));
    return true;
  } catch {
    return false;
  }
}

export function updateSave(patch) {
  Object.assign(current, patch);
  return writeSave();
}

export function deleteSave() {
  current = defaultSave();
  readOnly = false;
  try {
    getStorage()?.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}
