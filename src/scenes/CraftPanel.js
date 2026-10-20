import { getSafeArea } from '../core/safeArea.js';
import { paginateRows } from '../gameplay/crafting.js';
import { button, label, backdrop, COLORS, CSS, DEPTH, FONT } from './ui.js';
import { frameOf, hasFrame } from './art.js';

const PANEL_W = 672;
const PAD = 16;
const ROW_H = 96;
const GROUP_H = 36;
const GAP = 6;
const LIST_H = 450;
const NAV_W = 120;
const ICON_PX = 56;
const COST_W = 150;

/**
 * Craft panel: recipes grouped by use, paged like the inventory. View and taps only; rules live in
 * gameplay/crafting.js and GameScene. Tap a recipe to select it, then tap the Craft button.
 *
 * ctrl: { rows(): {type:'group',use,name}|{type:'recipe',entry}[]   (entry: see GameScene.craftEntry)
 *         onCraft(id), onClose() }
 * entry: { id, name, kind, check:{ok,reason}, costs:[{id,name,need,have,ok}], effect, outputId }
 */
export default class CraftPanel {
  constructor(scene, ctrl) {
    this.scene = scene;
    this.ctrl = ctrl;
    this.c = null;
    this.page = 0;
    this.selected = null;
    this.status = '';
    this.bottomY = 0;
  }

  get isOpen() { return !!this.c; }

  open() {
    this.page = 0;
    this.status = '';
    const first = this.ctrl.rows().find((r) => r.type === 'recipe');
    this.selected = first?.entry.id ?? null;
    this.build();
  }

  close() {
    if (!this.c) return;
    this.c.destroy();
    this.c = null;
    this.ctrl.onClose?.();
  }

  /** Re-read the recipe states and redraw (cheap: runs on taps only). */
  refresh(status) {
    if (status !== undefined) this.status = status;
    if (this.c) this.build();
  }

  /** Frame to draw for a recipe: its build sprite, else its output icon, else wood. */
  iconFor(entry) {
    if (hasFrame('build', entry.id)) return { key: 'build', frame: frameOf('build', entry.id), px: 32 };
    const icon = hasFrame('icons', entry.outputId) ? entry.outputId : 'wood';
    return { key: 'icons', frame: frameOf('icons', icon), px: 8 };
  }

  build() {
    this.c?.destroy();
    const { scene } = this;
    const w = scene.scale.width;
    const sa = getSafeArea();
    const rows = this.ctrl.rows();
    const pages = paginateRows(rows, LIST_H, { group: GROUP_H, recipe: ROW_H, gap: GAP });
    if (this.page >= pages.length) this.page = 0;
    this.pages = pages.length;
    this.craftBtn = null;
    const top = sa.top + 110;
    const left = (w - PANEL_W) / 2 + PAD;
    const innerW = PANEL_W - PAD * 2;
    const listTop = top + PAD + ROW_H + 12;
    const pagerY = listTop + LIST_H + 6;
    const detailTop = pagerY + ROW_H + 10;
    const panelH = detailTop - top + 272;
    this.bottomY = top + panelH;

    const c = scene.add.container(0, 0).setDepth(DEPTH.panel).setScrollFactor(0);
    const add = (o) => { o.setScrollFactor(0); c.add(o); return o; };
    add(backdrop(scene, 0.55, () => this.close()));
    add(scene.add.rectangle(w / 2, top + panelH / 2, PANEL_W, panelH, COLORS.shadow).setStrokeStyle(4, COLORS.ink).setInteractive());
    add(label(scene, left + 4, top + PAD + 48, 'Workbench', 32, CSS.amber).setOrigin(0, 0.5));
    add(button(scene, { x: left + innerW - 48, y: top + PAD + 48, text: 'Close', size: 22, onTap: () => this.close() }));

    this.rowPos = new Map();
    this.nextBtn = null;
    let y = listTop;
    for (const r of pages[this.page] || []) {
      if (r.type === 'group') {
        add(label(scene, left + 4, y + GROUP_H / 2, r.name.toUpperCase(), 20, CSS.dim).setOrigin(0, 0.5));
        y += GROUP_H + GAP;
      } else {
        this.addRow(add, r.entry, left, y, innerW);
        y += ROW_H + GAP;
      }
    }

    if (this.pages > 1) {
      const cy = pagerY + ROW_H / 2;
      add(button(scene, { x: w / 2 - 150, y: cy, w: NAV_W, text: 'Prev', size: 22, onTap: () => this.turn(-1) }));
      add(label(scene, w / 2, cy, `${this.page + 1}/${this.pages}`, 24, CSS.text));
      this.nextBtn = add(button(scene, { x: w / 2 + 150, y: cy, w: NAV_W, text: 'Next', size: 22, onTap: () => this.turn(1) }));
    }
    this.addDetail(add, rows, left, detailTop, innerW);
    this.c = c;
  }

  addRow(add, entry, left, y, innerW) {
    const { scene } = this;
    this.rowPos.set(entry.id, { x: left + innerW / 2, y: y + ROW_H / 2 });
    const sel = entry.id === this.selected;
    const ok = entry.check.ok;
    const bg = add(scene.add.rectangle(left + innerW / 2, y + ROW_H / 2, innerW, ROW_H, sel ? COLORS.rust : COLORS.wall)
      .setStrokeStyle(sel ? 4 : 3, sel ? COLORS.amber : COLORS.ink).setInteractive());
    bg.setAlpha(ok ? 1 : 0.6);
    bg.on('pointerup', () => { this.selected = entry.id; this.status = ''; this.build(); });
    const ic = this.iconFor(entry);
    add(scene.add.image(left + 16 + ICON_PX / 2, y + ROW_H / 2, ic.key, ic.frame).setDisplaySize(ICON_PX, ICON_PX).setAlpha(ok ? 1 : 0.5));
    add(label(scene, left + 16 + ICON_PX + 16, y + 26, entry.name, 24, ok ? CSS.text : CSS.dim).setOrigin(0, 0.5));
    const sub = ok ? entry.shortCost : entry.check.reason;
    add(label(scene, left + 16 + ICON_PX + 16, y + 64, sub, 18, ok ? CSS.dim : CSS.red).setOrigin(0, 0.5));
  }

  addDetail(add, rows, left, dy, innerW) {
    const { scene } = this;
    const entry = rows.find((r) => r.type === 'recipe' && r.entry.id === this.selected)?.entry;
    if (!entry) { add(label(scene, left + 4, dy + 30, 'Tap a recipe', 22, CSS.dim).setOrigin(0, 0.5)); return; }
    add(label(scene, left + 4, dy + 16, entry.name, 28, CSS.amber).setOrigin(0, 0.5));
    let x = left + 4;
    for (const l of entry.costs) {
      add(scene.add.image(x + 16, dy + 62, 'icons', frameOf('icons', l.id)).setScale(4));
      add(label(scene, x + 40, dy + 62, `${l.have}/${l.need}`, 24, l.ok ? CSS.text : CSS.red).setOrigin(0, 0.5));
      x += COST_W;
    }
    add(scene.add.text(left + 4, dy + 92, entry.effect, { fontFamily: FONT, fontSize: '18px', color: CSS.dim, wordWrap: { width: innerW - 8 } }));
    if (this.status) {
      add(scene.add.text(left + 4, dy + 134, this.status, { fontFamily: FONT, fontSize: '18px', color: CSS.amber, wordWrap: { width: innerW - 240 } }));
    }
    if (!entry.check.ok) {
      add(scene.add.text(left + 4, dy + 164, entry.check.reason, { fontFamily: FONT, fontSize: '18px', color: CSS.red, wordWrap: { width: innerW - 240 } }));
    }
    const verb = entry.kind === 'place' || entry.kind === 'barricade' ? 'Build' : entry.kind === 'secure' ? 'Secure' : entry.kind === 'repair' ? 'Repair' : 'Craft';
    const b = this.craftBtn = add(button(scene, {
      x: left + innerW - 100, y: dy + 200, w: 200, h: ROW_H, text: verb, size: 28, fill: COLORS.teal,
      onTap: () => this.ctrl.onCraft(entry.id),
    }));
    b.setEnabled(entry.check.ok);
  }

  turn(d) {
    this.page = (this.page + d + this.pages) % this.pages;
    this.selected = null; // never keep a recipe selected that is on another page
    this.status = '';
    this.build();
  }
}
