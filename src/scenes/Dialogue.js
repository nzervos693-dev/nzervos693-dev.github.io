import { getSafeArea } from '../core/safeArea.js';
import { label, backdrop, COLORS, CSS, DEPTH } from './ui.js';
import { playSfx } from './sfx.js';

/**
 * Short tappable text cards: one line at a time in a box, tap anywhere for the next, the last tap closes.
 * Used for survivor dialogue (with a blip per line) and the pass the torch card. Never lasts long.
 */
export default class Dialogue {
  constructor(scene) { this.scene = scene; this.c = null; this.lines = []; this.i = 0; this.opts = null; }

  get isOpen() { return !!this.c; }

  /**
   * @param {{speaker?:string, lines:string[], blip?:boolean, onDone?:Function, big?:boolean}} opts
   *   big = a centered title card (no speaker) such as "You carry on as Mara."
   */
  show(opts) {
    this.close();
    this.opts = opts;
    this.lines = opts.lines;
    this.i = 0;
    const { scene } = this;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const sa = getSafeArea();
    const boxH = 300;
    const cy = Math.min(h / 2 + 80, h - sa.bottom - 260 - boxH / 2);
    const c = scene.add.container(0, 0).setDepth(DEPTH.panel + 150).setScrollFactor(0);
    const add = (o) => { o.setScrollFactor(0); c.add(o); return o; };
    add(backdrop(scene, opts.big ? 0.75 : 0.35, () => this.next()));
    add(scene.add.rectangle(w / 2, cy, 640, boxH, COLORS.shadow).setStrokeStyle(4, COLORS.ink).setInteractive().on('pointerup', () => this.next()));
    if (opts.speaker) add(label(scene, w / 2, cy - boxH / 2 + 36, opts.speaker, 30, CSS.amber));
    this.text = add(label(scene, w / 2, cy + (opts.speaker ? 8 : -10), '', opts.big ? 38 : 28, CSS.text));
    this.text.setWordWrapWidth(580).setLineSpacing(8);
    this.hint = add(label(scene, w / 2, cy + boxH / 2 - 34, 'Tap to continue', 20, CSS.dim));
    this.c = c;
    this.showLine();
  }

  showLine() {
    this.text.setText(this.lines[this.i]);
    this.hint.setText(this.i >= this.lines.length - 1 ? 'Tap to close' : 'Tap to continue');
  }

  next() {
    if (!this.c) return;
    this.i += 1;
    if (this.i >= this.lines.length) {
      const done = this.opts.onDone;
      this.close();
      done?.();
    } else this.showLine();
  }

  close() {
    this.c?.destroy();
    this.c = null;
  }
}
