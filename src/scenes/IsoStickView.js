/**
 * Code-drawn floating joystick visual (GDD 4): a dark translucent ring and a knob, no text. Fades in on
 * touch, fades out after release; the knob brightens past the run threshold. Pinned to the screen, below
 * the HUD. Near a screen edge only the drawing shifts inward; the logic keeps the touch-down point.
 */
import { DEPTH } from './ui.js';

const hex = (c) => parseInt(c.replace('#', ''), 16);

export default class IsoStickView {
  /** @param {Phaser.Scene} scene @param {ReturnType<import('../gameplay/isoStick.js').stickConfig>} cfg */
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.alpha = 0;
    this.want = 0;
    this.ox = 0;
    this.oy = 0;
    const v = cfg.visual;
    this.ring = scene.add.circle(0, 0, cfg.radiusPx, hex(v.ringFillColor), v.ringFillAlpha).setStrokeStyle(v.ringStrokePx, hex(v.ringStrokeColor), v.ringStrokeAlpha);
    this.knob = scene.add.circle(0, 0, cfg.knobRadiusPx, hex(v.knobColor), v.knobAlpha);
    for (const o of [this.ring, this.knob]) o.setScrollFactor(0).setDepth(DEPTH.hud - 1).setVisible(false);
    this.mode = 1;
  }

  /** Touch down: show the ring where the thumb landed (drawing kept on screen). */
  show(x, y) {
    const { width, height } = this.scene.scale;
    const r = this.cfg.radiusPx;
    this.ox = Math.min(Math.max(x, r), width - r);
    this.oy = Math.min(Math.max(y, r), height - r);
    this.ring.setPosition(this.ox, this.oy);
    this.knob.setPosition(this.ox, this.oy);
    this.want = 1;
  }

  /** Move the knob to an offset (screen px, already clamped to the radius); `mode` 0 creep (dimmer), 1 walk, 2 run (brighter). */
  setKnob(dx, dy, mode = 1) {
    this.knob.setPosition(this.ox + dx, this.oy + dy);
    this.mode = mode;
  }

  /** Released: the knob returns to the centre and everything fades out. */
  release() {
    this.want = 0;
    this.mode = 1;
    this.knob.setPosition(this.ox, this.oy);
  }

  /** Per frame. */
  update(dt) {
    const v = this.cfg.visual;
    const mult = this.mode === 2 ? this.cfg.knobRunAlpha / v.knobAlpha : this.mode === 0 ? this.cfg.knobCreepAlpha / v.knobAlpha : 1;
    if (this.alpha === this.want) { if (this.alpha > 0) this.knob.setAlpha(Math.min(1, this.alpha * mult)); return; }
    const step = dt / (this.want ? this.cfg.fadeInSeconds : this.cfg.fadeSeconds);
    this.alpha = this.want ? Math.min(1, this.alpha + step) : Math.max(0, this.alpha - step);
    this.ring.setAlpha(this.alpha).setVisible(this.alpha > 0);
    this.knob.setAlpha(Math.min(1, this.alpha * mult)).setVisible(this.alpha > 0);
  }
}
