import { getSafeArea } from '../core/safeArea.js';
import { button, label, backdrop, COLORS, CSS, DEPTH } from './ui.js';

const PANEL_W = 672;
const CARD_H = 660;
const JOB_W = 200;
const BAR_W = 300;

/**
 * Survivors ("Crew") screen: one card per recruited survivor with health, trait, upkeep, a job picker
 * (Guard / Scavenger / Tender) and a Talk button. View and taps only; rules live in gameplay/survivors.js.
 *
 * ctrl: { rows(): {id,name,role,health,maxHealth,trait,upkeep,jobs:[{id,name,sub,on}],job,active,talk:{label,enabled}}[],
 *         onJob(id, job), onTalk(id), onTreat(id), onClose() }
 *   (row.treat: {label, enabled})
 */
export default class SurvivorsPanel {
  constructor(scene, ctrl) { this.scene = scene; this.ctrl = ctrl; this.c = null; this.buttons = {}; this.bottomY = 0; }

  get isOpen() { return !!this.c; }

  open() { this.build(); }

  close() {
    if (!this.c) return;
    this.c.destroy();
    this.c = null;
    this.ctrl.onClose?.();
  }

  refresh() { if (this.c) this.build(); }

  build() {
    this.c?.destroy();
    this.buttons = {};
    const { scene } = this;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const sa = getSafeArea();
    const rows = this.ctrl.rows();
    const panelH = 150 + Math.max(1, rows.length) * (CARD_H + 10) + 120;
    const cy = Math.max(sa.top + 120 + panelH / 2, h / 2 - 40);
    const top = cy - panelH / 2;
    this.bottomY = cy + panelH / 2;
    const c = scene.add.container(0, 0).setDepth(DEPTH.panel).setScrollFactor(0);
    const add = (o) => { o.setScrollFactor(0); c.add(o); return o; };
    add(backdrop(scene, 0.6, () => this.close()));
    add(scene.add.rectangle(w / 2, cy, PANEL_W, panelH, COLORS.shadow).setStrokeStyle(4, COLORS.ink).setInteractive());
    add(label(scene, w / 2, top + 50, 'Crew', 36, CSS.amber));
    if (!rows.length) add(label(scene, w / 2, top + 200, 'Nobody has joined you yet.', 24, CSS.dim));
    rows.forEach((r, i) => this.card(add, r, w / 2, top + 100 + i * (CARD_H + 10) + CARD_H / 2));
    this.buttons.close = add(button(scene, { x: w / 2, y: cy + panelH / 2 - 72, w: 240, h: 96, text: 'Close', size: 28, onTap: () => this.close() }));
    this.c = c;
  }

  card(add, r, cx, cy) {
    const { scene } = this;
    const left = cx - PANEL_W / 2 + 36;
    const top = cy - CARD_H / 2;
    add(scene.add.rectangle(cx, cy, PANEL_W - 40, CARD_H, COLORS.ink, 0.5));
    add(label(scene, cx, top + 34, `${r.name}, ${r.role}`, 30, CSS.text));
    add(label(scene, left + 70, top + 86, 'Health', 22, CSS.dim));
    add(scene.add.rectangle(left + 150, top + 86, BAR_W, 20, COLORS.shadow).setOrigin(0, 0.5).setStrokeStyle(2, COLORS.ink));
    add(scene.add.rectangle(left + 150, top + 86, Math.max(1, (BAR_W * r.health) / r.maxHealth), 20, 0xc0392b).setOrigin(0, 0.5));
    add(label(scene, left + 150 + BAR_W + 60, top + 86, `${Math.round(r.health)}/${r.maxHealth}`, 22, CSS.text));
    add(label(scene, cx, top + 136, r.trait, 22, CSS.amber));
    if (r.active) {
      add(label(scene, cx, top + 260, `You are playing as ${r.name}.`, 26, CSS.text));
      return;
    }
    add(label(scene, cx, top + 178, r.upkeep, 20, CSS.dim));
    add(label(scene, cx, top + 226, 'Job', 22, CSS.dim));
    r.jobs.forEach((j, k) => {
      const b = button(scene, {
        x: cx + (k - 1) * (JOB_W + 12), y: top + 304, w: JOB_W, h: 96, text: `${j.name}\n${j.sub}`, size: 20,
        fill: j.on ? COLORS.teal : COLORS.wall, onTap: () => this.ctrl.onJob(r.id, j.id),
      });
      this.buttons[`job:${j.id}`] = add(b);
    });
    this.buttons.talk = add(button(scene, {
      x: cx, y: top + 440, w: 520, h: 96, text: r.talk.label, size: 24, fill: COLORS.rust,
      onTap: () => this.ctrl.onTalk(r.id),
    }).setEnabled(r.talk.enabled));
    this.buttons.treat = add(button(scene, {
      x: cx, y: top + 552, w: 520, h: 96, text: r.treat.label, size: 24, fill: COLORS.teal,
      onTap: () => this.ctrl.onTreat(r.id),
    }).setEnabled(r.treat.enabled));
  }
}
