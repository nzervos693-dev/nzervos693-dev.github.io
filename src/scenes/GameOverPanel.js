import { getSafeArea } from '../core/safeArea.js';
import { button, label, COLORS, CSS, DEPTH } from './ui.js';

/**
 * Game over screen (GDD 5.9): days survived, floors reclaimed, zombies killed, objects salvaged,
 * and a New game button. It cannot be dismissed any other way.
 */
export default class GameOverPanel {
  constructor(scene) { this.scene = scene; this.c = null; this.used = false; }

  get isOpen() { return !!this.c; }

  /**
   * @param {{days:number,floors:number,zombies:number,salvaged:number}} stats
   * @param {Function} onNewGame
   */
  show(stats, onNewGame) {
    this.close();
    this.used = false;
    const { scene } = this;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const sa = getSafeArea();
    const lines = [
      `Days survived: ${stats.days}`,
      `Floors reclaimed: ${stats.floors}`,
      `Zombies killed: ${stats.zombies}`,
      `Objects salvaged: ${stats.salvaged}`,
    ];
    const panelW = 600;
    const panelH = 190 + lines.length * 44 + 130;
    const cy = Math.max(sa.top + 140 + panelH / 2, h / 2);
    const c = scene.add.container(0, 0).setDepth(DEPTH.toast + 100).setScrollFactor(0);
    const add = (o) => { o.setScrollFactor(0); c.add(o); return o; };
    add(scene.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.8).setInteractive()); // swallows every tap
    add(scene.add.rectangle(w / 2, cy, panelW, panelH, COLORS.shadow).setStrokeStyle(4, COLORS.ink));
    add(label(scene, w / 2, cy - panelH / 2 + 60, 'You died', 44, CSS.red));
    add(label(scene, w / 2, cy - panelH / 2 + 118, 'The tower is quiet again.', 22, CSS.dim));
    lines.forEach((l, i) => add(label(scene, w / 2, cy - panelH / 2 + 180 + i * 44, l, 26, CSS.text)));
    add(button(scene, { x: w / 2, y: cy + panelH / 2 - 76, w: 280, h: 96, text: 'New game', size: 30, fill: COLORS.teal, onTap: () => { if (this.used) return; this.used = true; onNewGame(); } }));
    this.c = c;
  }

  close() {
    this.c?.destroy();
    this.c = null;
  }
}
