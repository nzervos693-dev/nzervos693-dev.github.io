import { label, CSS, COLORS, DEPTH } from './ui.js';

/** One-line message that fades out. Sits above the bottom bar. */
export default class Toast {
  constructor(scene, y) {
    this.scene = scene;
    const w = scene.scale.width;
    this.bg = scene.add.rectangle(w / 2, y, w - 48, 64, COLORS.ink, 0.85).setScrollFactor(0).setDepth(DEPTH.toast).setVisible(false);
    this.text = label(scene, w / 2, y, '', 24, CSS.text).setDepth(DEPTH.toast + 1).setVisible(false);
    this.text.setWordWrapWidth(w - 80);
    this.timer = null;
  }

  /** Show a message for ms milliseconds (replaces the current one). */
  show(msg, ms = 2400) {
    this.text.setText(msg).setVisible(true);
    this.bg.setVisible(true).setSize(this.scene.scale.width - 48, Math.max(64, this.text.height + 24));
    this.timer?.remove();
    this.timer = this.scene.time.delayedCall(ms, () => {
      this.text.setVisible(false);
      this.bg.setVisible(false);
    });
  }

  setY(y) { this.bg.y = y; this.text.y = y; }
}
