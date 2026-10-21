import { getSafeArea } from '../core/safeArea.js';
import { button, label, backdrop, COLORS, CSS, DEPTH } from './ui.js';
import { frameOf } from './art.js';

const CELL = 96;
const GAP = 8;
const PANEL_W = 672;
const PAD = 24;
const BAG_COLS = 4;
const STOCK_COLS = 6;
/** Stockpile rows per page; more slots (M2 shelves) page instead of growing the panel. */
const STOCK_ROWS = 5;

/**
 * Compact modal: Bag tab (carry slots) and Stockpile tab (home storage, paged).
 * Rules live in GameScene; this is only view + taps. The cell objects are built
 * once per tab/page; `refresh()` only updates the cells and detail row in place.
 *
 * ctrl: { bag(): slots, stock(): slots,
 *         describe(slot, tab): {name, effect, canUse, useLabel?, canStore, canTake},
 *         badge?(slot, index, tab): string|null (replaces the count under the icon, e.g. "E" for equipped),
 *         onUse(tab, i), onStore(i), onTake(i), onClose() }
 */
export default class InventoryPanel {
  constructor(scene, ctrl) {
    this.scene = scene;
    this.ctrl = ctrl;
    this.c = null;
    this.tab = 'bag';
    this.page = 0;
    this.selected = -1;
    this.bottomY = 0;
  }

  get isOpen() { return !!this.c; }

  slots() { return this.tab === 'bag' ? this.ctrl.bag() : this.ctrl.stock(); }

  open(tab = this.tab) {
    this.tab = tab;
    this.page = 0;
    this.selected = -1;
    this.build();
  }

  close() {
    this.c?.destroy();
    this.c = null;
    this.ctrl.onClose?.();
  }

  /** Update cells in place (rebuild only if the slot count changed). */
  refresh() {
    if (!this.c) return;
    if (this.slots().length !== this.builtLength) { this.build(); return; }
    this.update();
  }

  build() {
    this.c?.destroy();
    const { scene } = this;
    const w = scene.scale.width;
    const sa = getSafeArea();
    const slots = this.slots();
    this.builtLength = slots.length;
    const cols = this.tab === 'bag' ? BAG_COLS : STOCK_COLS;
    const perPage = this.tab === 'bag' ? slots.length : cols * STOCK_ROWS;
    this.pages = Math.max(1, Math.ceil(slots.length / perPage));
    this.page = Math.min(this.page, this.pages - 1);
    const first = this.page * perPage;
    const count = Math.min(perPage, slots.length - first);
    const rows = Math.ceil(count / cols);
    const gridW = cols * CELL + (cols - 1) * GAP;
    const gridH = rows * CELL + (rows - 1) * GAP;
    const top = sa.top + 120;
    const gridTop = top + 20 + CELL + 16;
    const pagerH = this.pages > 1 ? CELL + 12 : 0;
    const panelH = gridTop - top + gridH + 16 + pagerH + 24 + CELL + 24;
    this.bottomY = top + panelH;

    const c = scene.add.container(0, 0).setDepth(DEPTH.panel).setScrollFactor(0);
    const add = (o) => { o.setScrollFactor(0); c.add(o); return o; };
    add(backdrop(scene, 0.55, () => this.close()));
    add(scene.add.rectangle(w / 2, top + panelH / 2, PANEL_W, panelH, COLORS.shadow).setStrokeStyle(4, COLORS.ink).setInteractive());

    const left = (w - PANEL_W) / 2 + PAD;
    this.tabButtons = [['bag', 'Bag'], ['stock', 'Stockpile']].map(([id, text], i) => {
      const b = add(button(scene, {
        x: left + 100 + i * 212, y: top + 20 + 48, w: 200, h: CELL, text, size: 22, skin: false,
        onTap: () => { this.tab = id; this.page = 0; this.selected = -1; this.build(); },
      }));
      b.tabId = id;
      return b;
    });
    add(button(scene, { x: w / 2 + PANEL_W / 2 - PAD - 48, y: top + 20 + 48, text: 'Close', size: 22, onTap: () => this.close() }));

    const gx = (w - gridW) / 2;
    this.cells = [];
    for (let k = 0; k < count; k++) {
      const i = first + k;
      const b = add(button(scene, {
        x: gx + (k % cols) * (CELL + GAP) + CELL / 2,
        y: gridTop + Math.floor(k / cols) * (CELL + GAP) + CELL / 2,
        text: '', size: 20, icon: { key: 'icons', name: 'wood', scale: 5 },
        onTap: () => { if (!this.slots()[i]) return; this.selected = this.selected === i ? -1 : i; this.update(); },
      }));
      b.slotIndex = i;
      this.cells.push(b);
    }

    if (this.pages > 1) {
      const py = gridTop + gridH + 16 + CELL / 2;
      add(button(scene, { x: w / 2 - 150, y: py, w: 120, text: 'Prev', size: 22, onTap: () => this.turn(-1) }));
      this.pageText = add(label(scene, w / 2, py, '', 24, CSS.text));
      add(button(scene, { x: w / 2 + 150, y: py, w: 120, text: 'Next', size: 22, onTap: () => this.turn(1) }));
    } else this.pageText = null;

    const dy = gridTop + gridH + 16 + pagerH;
    this.nameText = add(label(scene, left + 4, dy + 10, '', 26, CSS.amber).setOrigin(0, 0.5));
    this.effectText = add(label(scene, left + 4, dy + 44, '', 20, CSS.text).setOrigin(0, 0.5));
    this.actionFns = [null, null, null];
    this.actionButtons = [0, 1, 2].map((n) => add(button(scene, {
      x: w / 2 + PANEL_W / 2 - PAD - 48 - n * 104, y: dy + 24 + CELL / 2, text: '', size: 22, fill: COLORS.teal,
      onTap: () => this.actionFns[n]?.(),
    })));
    this.c = c;
    this.update();
  }

  turn(d) {
    this.page = (this.page + d + this.pages) % this.pages;
    this.selected = -1;
    this.build();
  }

  /** Refresh cell icons/counts, tab highlight and the detail row without rebuilding. */
  update() {
    const slots = this.slots();
    const bag = this.ctrl.bag();
    this.tabButtons.forEach((b) => {
      b.bg.setFillStyle(b.tabId === this.tab ? COLORS.teal : COLORS.wall);
      if (b.tabId === 'bag') b.setLabel(`Bag ${bag.filter(Boolean).length}/${bag.length}`);
    });
    for (const cell of this.cells) {
      const s = slots[cell.slotIndex];
      const sel = cell.slotIndex === this.selected;
      cell.img.setVisible(!!s);
      if (s) cell.img.setFrame(frameOf('icons', s.id));
      const badge = s ? this.ctrl.badge?.(s, cell.slotIndex, this.tab) : null;
      cell.setLabel(s ? (badge ?? (s.qty > 1 ? `${s.qty}` : s.uses != null ? `${s.uses}` : '')) : '');
      cell.bg.setFillStyle(s ? (sel ? COLORS.rust : COLORS.wall) : COLORS.ink, s ? 1 : 0.6);
      cell.bg.setStrokeStyle(sel ? 4 : 3, sel ? COLORS.amber : s ? COLORS.ink : COLORS.wall);
    }
    this.pageText?.setText(`${this.page + 1}/${this.pages}`);
    let sel = slots[this.selected];
    if (!sel) this.selected = -1;
    this.actionFns = [null, null, null];
    this.actionButtons.forEach((b) => b.setVisible(false));
    if (!sel) {
      this.nameText.setText('');
      this.effectText.setText(slots.some(Boolean) ? 'Tap an item' : 'Empty');
      return;
    }
    const d = this.ctrl.describe(sel, this.tab);
    this.nameText.setText(d.name);
    this.effectText.setText(d.effect || '');
    const acts = [];
    if (d.canUse) acts.push([d.useLabel || 'Use', () => this.ctrl.onUse(this.tab, this.selected)]);
    if (d.canStore) acts.push(['Store', () => this.ctrl.onStore(this.selected)]);
    if (d.canTake) acts.push(['Take', () => this.ctrl.onTake(this.selected)]);
    acts.forEach(([text, fn], n) => {
      this.actionButtons[n].setVisible(true).setLabel(text);
      this.actionFns[n] = fn;
    });
  }
}
