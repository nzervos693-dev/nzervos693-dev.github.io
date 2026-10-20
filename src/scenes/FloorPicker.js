import { getSafeArea } from '../core/safeArea.js';
import { button, label, backdrop, COLORS, CSS, DEPTH } from './ui.js';

const PANEL_W = 600;
const ROW_H = 96;
const GAP = 10;

/** Modal list of floors (96 px rows) for Secure floor. Tap a floor to pick it; tapping outside cancels. */
export default class FloorPicker {
  constructor(scene) { this.scene = scene; this.c = null; }

  get isOpen() { return !!this.c; }

  /**
   * @param {string} title
   * @param {{floor:number, text:string, enabled?:boolean}[]} floors (disabled rows are greyed and ignore taps)
   * @param {(floor:number)=>void} onPick
   * @param {()=>void} [onCancel]
   */
  open(title, floors, onPick, onCancel) {
    this.close();
    const { scene } = this;
    const w = scene.scale.width;
    const sa = getSafeArea();
    const panelH = 150 + floors.length * (ROW_H + GAP) + 120;
    const cy = Math.max(sa.top + 140 + panelH / 2, scene.scale.height / 2 - 100);
    const c = scene.add.container(0, 0).setDepth(DEPTH.panel + 50).setScrollFactor(0);
    const add = (o) => { o.setScrollFactor(0); c.add(o); return o; };
    const cancel = () => { this.close(); onCancel?.(); };
    add(backdrop(scene, 0.6, cancel));
    add(scene.add.rectangle(w / 2, cy, PANEL_W, panelH, COLORS.shadow).setStrokeStyle(4, COLORS.ink).setInteractive());
    add(label(scene, w / 2, cy - panelH / 2 + 50, title, 30, CSS.amber));
    floors.forEach((f, i) => {
      add(button(scene, {
        x: w / 2, y: cy - panelH / 2 + 110 + ROW_H / 2 + i * (ROW_H + GAP), w: PANEL_W - 48, h: ROW_H,
        text: f.text, size: f.enabled === false ? 22 : 26, onTap: () => { this.close(); onPick(f.floor); },
      }).setEnabled(f.enabled !== false));
    });
    add(button(scene, { x: w / 2, y: cy + panelH / 2 - 70, w: 200, h: ROW_H, text: 'Cancel', size: 26, onTap: cancel }));
    this.c = c;
  }

  close() {
    this.c?.destroy();
    this.c = null;
  }
}
