import {
  COLORS, SORTS, createNote, isBlank, parseStored, serialize, merge, view, formatDate,
} from './notes-store.js';

const KEY = 'notes.v1';
const PREFS = 'notes.prefs';
const $ = (id) => document.getElementById(id);

// ---------- storage ----------
let notes = [];
let prefs = { sort: 'updated' };
try { notes = parseStored(localStorage.getItem(KEY) || '[]') || []; } catch { notes = []; }
try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch { /* defaults */ }
if (!SORTS[prefs.sort]) prefs.sort = 'updated';

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    snack('Could not save — storage is full');
  }
}
function savePrefs() {
  try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch { /* not critical */ }
}
navigator.storage?.persist?.().catch(() => {});

// ---------- list ----------
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function highlight(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return safe.replace(re, (m) => `<mark>${m}</mark>`);
}

function card(n, q) {
  const b = document.createElement('button');
  b.className = 'card';
  b.dataset.id = n.id;
  if (n.color) b.dataset.color = n.color;
  const title = n.title.trim();
  const body = n.body.trim().slice(0, 600);
  b.innerHTML =
    (title ? `<h2>${highlight(title, q)}</h2>` : '') +
    (body ? `<p>${highlight(body, q)}</p>` : '') +
    `<time>${formatDate(n.updated)}</time>`;
  b.setAttribute('aria-label', title || body.slice(0, 40) || 'Empty note');
  return b;
}

function renderList() {
  const q = $('search').value.trim();
  const { pinned, others } = view(notes, q, prefs.sort);
  const root = $('notes');
  root.textContent = '';
  const label = (t) => { const l = document.createElement('div'); l.className = 'section-label'; l.textContent = t; root.append(l); };
  if (pinned.length) {
    label('Pinned');
    pinned.forEach((n) => root.append(card(n, q)));
    if (others.length) label('Others');
  }
  others.forEach((n) => root.append(card(n, q)));
  const empty = $('empty');
  empty.hidden = pinned.length + others.length > 0;
  empty.innerHTML = notes.length ? 'No matching notes.' : 'No notes yet.<br />Tap <strong>+</strong> to write one.';
  $('sort-label').textContent = SORTS[prefs.sort];
}

$('search').addEventListener('input', renderList);
$('new-btn').addEventListener('click', () => openEditor(null));
$('notes').addEventListener('click', (e) => {
  const c = e.target.closest('.card');
  if (c) openEditor(c.dataset.id);
});

// ---------- editor ----------
let current = null;     // note being edited
let saveTimer = 0;

function openEditor(id) {
  const n = id ? notes.find((x) => x.id === id) : null;
  current = n || createNote();
  if (!n) notes.push(current);
  $('title').value = current.title;
  $('body').value = current.body;
  paintEditor();
  $('palette').hidden = true;
  $('list-view').hidden = true;
  $('edit-view').hidden = false;
  window.scrollTo(0, 0);
  history.pushState({ note: current.id }, '');
  if (!n) $('body').focus();
}

function paintEditor() {
  const v = $('edit-view');
  if (current.color) v.dataset.color = current.color; else delete v.dataset.color;
  $('pin-btn').setAttribute('aria-pressed', String(current.pinned));
  $('pin-btn').setAttribute('aria-label', current.pinned ? 'Unpin note' : 'Pin note');
  $('meta').textContent = isBlank(current) ? '' : `Edited ${formatDate(current.updated)}`;
}

function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  if (!current) return;
  const title = $('title').value, body = $('body').value;
  if (title !== current.title || body !== current.body) {
    current.title = title;
    current.body = body;
    current.updated = Date.now();
    persist();
    paintEditor();
  }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 400);
}
$('title').addEventListener('input', scheduleSave);
$('body').addEventListener('input', scheduleSave);
$('title').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('body').focus(); }
});

// Leaving the editor (Android back gesture, our back button, or delete).
function closeEditor() {
  if (!current) return;
  flush();
  if (isBlank(current)) {
    notes = notes.filter((n) => n !== current);
    persist();
  }
  current = null;
  document.activeElement?.blur?.();
  $('edit-view').hidden = true;
  $('list-view').hidden = false;
  renderList();
}

window.addEventListener('popstate', () => {
  if (!$('sheet').hidden) { closeSheet(false); return; }
  closeEditor();
});
$('back-btn').addEventListener('click', () => history.back());

$('pin-btn').addEventListener('click', () => {
  current.pinned = !current.pinned;
  current.updated = Date.now();
  persist();
  paintEditor();
});

// colour palette
const pal = $('palette');
for (const c of COLORS) {
  const s = document.createElement('button');
  s.className = 'swatch' + (c ? '' : ' none');
  s.setAttribute('role', 'radio');
  s.setAttribute('aria-label', c || 'Default colour');
  if (c) s.dataset.color = c; else s.style.background = 'var(--surface)';
  s.dataset.value = c;
  pal.append(s);
}
$('color-btn').addEventListener('click', () => {
  pal.hidden = !pal.hidden;
  pal.querySelectorAll('.swatch').forEach((s) => s.setAttribute('aria-checked', String(s.dataset.value === current.color)));
});
pal.addEventListener('click', (e) => {
  const s = e.target.closest('.swatch');
  if (!s) return;
  current.color = s.dataset.value;
  current.updated = Date.now();
  persist();
  paintEditor();
  pal.querySelectorAll('.swatch').forEach((x) => x.setAttribute('aria-checked', String(x === s)));
});

$('delete-btn').addEventListener('click', () => {
  flush();
  const gone = current;
  const wasBlank = isBlank(gone);
  notes = notes.filter((n) => n !== gone);
  persist();
  current = null;
  history.back(); // popstate -> closeEditor (no-op on current) -> list
  $('edit-view').hidden = true;
  $('list-view').hidden = false;
  renderList();
  if (!wasBlank) {
    snack('Note deleted', 'Undo', () => { notes.push(gone); persist(); renderList(); });
  }
});

// Save immediately when the app goes to the background or closes.
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
window.addEventListener('pagehide', flush);

// ---------- menu sheet ----------
function openSheet() {
  $('sheet').hidden = false;
  $('sheet-backdrop').hidden = false;
  history.pushState({ sheet: true }, '');
}
function closeSheet(viaUi = true) {
  $('sheet').hidden = true;
  $('sheet-backdrop').hidden = true;
  if (viaUi) history.back();
}
$('menu-btn').addEventListener('click', openSheet);
$('sheet-backdrop').addEventListener('click', () => closeSheet());
$('sheet').addEventListener('click', (e) => {
  const act = e.target.closest('button')?.dataset.act;
  if (act === 'export') { closeSheet(); exportNotes(); }
  if (act === 'import') { closeSheet(); $('import-file').click(); }
  if (act === 'sort') {
    const keys = Object.keys(SORTS);
    prefs.sort = keys[(keys.indexOf(prefs.sort) + 1) % keys.length];
    savePrefs();
    renderList();
  }
});

async function exportNotes() {
  const live = notes.filter((n) => !isBlank(n));
  const stamp = new Date().toISOString().slice(0, 10);
  const name = `notes-backup-${stamp}.json`;
  const file = new File([serialize(live)], name, { type: 'application/json' });
  // Android: the share sheet lets you save to Drive, email it, etc.
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Notes backup' }); return; }
    catch (err) { if (err.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  snack(`Saved ${live.length} note${live.length === 1 ? '' : 's'} to Downloads`);
}

$('import-file').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  const incoming = parseStored(await f.text());
  if (!incoming) { snack('That file is not a notes backup'); return; }
  const r = merge(notes, incoming);
  notes = r.notes;
  persist();
  renderList();
  snack(`Imported: ${r.added} new, ${r.updated} updated`);
});

// ---------- snackbar ----------
let snackTimer = 0;
function snack(text, action = '', fn = null) {
  const bar = $('snackbar');
  $('snack-text').textContent = text;
  const btn = $('snack-action');
  btn.textContent = action;
  btn.onclick = () => { bar.hidden = true; fn?.(); };
  bar.hidden = false;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => { bar.hidden = true; }, action ? 6000 : 3000);
}

// ---------- start ----------
// Drop any leftover blank notes (e.g. app killed while a new note was empty).
const before = notes.length;
notes = notes.filter((n) => !isBlank(n));
if (notes.length !== before) persist();
history.replaceState({}, '');
renderList();

// Pick up edits made in another tab.
window.addEventListener('storage', (e) => {
  if (e.key !== KEY || current) return;
  notes = parseStored(e.newValue || '[]') || notes;
  renderList();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
}
