import { getSafeArea } from '../core/safeArea.js';
import { button, label, backdrop, COLORS, CSS, DEPTH } from './ui.js';

/** Centered modal with a title, lines and an OK button. Any tap outside also closes it. */
export default class Popup {
  constructor(scene) { this.scene = scene; this.c = null; }

  get isOpen() { return !!this.c; }

  show(title, lines, onClose) {
    this.close(false);
    const { scene } = this;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const sa = getSafeArea();
    const panelW = 600;
    const panelH = 190 + lines.length * 40 + 96;
    const cy = Math.max(sa.top + 140 + panelH / 2, h / 2);
    const c = scene.add.container(0, 0).setDepth(DEPTH.panel + 100).setScrollFactor(0);
    const add = (o) => { o.setScrollFactor(0); c.add(o); return o; };
    const done = () => { this.close(true); onClose?.(); };
    add(backdrop(scene, 0.6, done));
    add(scene.add.rectangle(w / 2, cy, panelW, panelH, COLORS.shadow).setStrokeStyle(4, COLORS.ink).setInteractive());
    add(label(scene, w / 2, cy - panelH / 2 + 56, title, 32, CSS.amber));
    lines.forEach((l, i) => add(label(scene, w / 2, cy - panelH / 2 + 120 + i * 40, l, 24, CSS.text)));
    add(button(scene, { x: w / 2, y: cy + panelH / 2 - 72, w: 200, h: 96, text: 'OK', size: 28, fill: COLORS.teal, onTap: done }));
    this.c = c;
  }

  close() {
    this.c?.destroy();
    this.c = null;
  }
}
