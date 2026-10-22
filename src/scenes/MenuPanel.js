/**
 * Menu (GDD 8.7): the day count (the only place it is shown), the sound toggle, the joystick side
 * (left / right, for left-handed play) and Close.
 * Opened from the three-dots plate in the bottom bar. View and taps only.
 */
import { getSafeArea } from '../core/safeArea.js';
import { isMuted, toggleMute } from '../core/audio.js';
import { button, label, backdrop, COLORS, CSS, DEPTH } from './ui.js';

export default class MenuPanel {
  /** @param {Phaser.Scene} scene @param {{day:()=>number, stickSide?:()=>string, onToggleStickSide?:()=>void, onClose?:()=>void}} ctrl */
  constructor(scene, ctrl) { this.scene = scene; this.ctrl = ctrl; this.c = null; }

  get isOpen() { return !!this.c; }

  open() {
    this.close();
    const { scene } = this;
    const w = scene.scale.width;
    const h = scene.scale.height;
    const sa = getSafeArea();
    const panelW = 520;
    const panelH = 600;
    const cy = Math.max(sa.top + 140 + panelH / 2, h / 2 - 60);
    const c = scene.add.container(0, 0).setDepth(DEPTH.panel).setScrollFactor(0);
    const add = (o) => { o.setScrollFactor(0); c.add(o); return o; };
    add(backdrop(scene, 0.4, () => this.close()));
    add(scene.add.rectangle(w / 2, cy, panelW, panelH, COLORS.shadow, 0.92).setStrokeStyle(2, COLORS.wall).setInteractive());
    add(label(scene, w / 2, cy - panelH / 2 + 60, `Day ${this.ctrl.day()}`, 36, CSS.text));
    this.soundBtn = add(button(scene, { x: w / 2, y: cy - 20, w: 360, h: 96, text: '', size: 26, onTap: () => { toggleMute(); this.refresh(); } }));
    this.sideBtn = add(button(scene, { x: w / 2, y: cy + 100, w: 360, h: 96, text: '', size: 26, onTap: () => { this.ctrl.onToggleStickSide?.(); this.refresh(); } }));
    add(button(scene, { x: w / 2, y: cy + panelH / 2 - 84, w: 360, h: 96, text: 'Close', size: 26, fill: COLORS.rust, onTap: () => this.close() }));
    this.c = c;
    this.refresh();
  }

  refresh() {
    this.soundBtn?.setLabel(isMuted() ? 'Sound: off' : 'Sound: on');
    this.sideBtn?.setLabel(this.ctrl.stickSide?.() === 'right' ? 'Stick: Right' : 'Stick: Left');
  }

  close() {
    if (!this.c) return;
    this.c.destroy();
    this.c = null;
    this.ctrl.onClose?.();
  }
}
