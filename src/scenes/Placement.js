import { spotCenterY } from '../gameplay/layout.js';
import { button, label, COLORS, CSS, DEPTH } from './ui.js';

const SPOT_W = 96;
const SPOT_H = 96;
const HIT_HALF_W = SPOT_W / 2;
const HIT_HALF_H = SPOT_H / 2 + 8;
const SPOT_DEPTH = 35;
const PULSE_MS = 600;

/**
 * Placement mode: highlights the valid build spots (96x96, tower space) and waits for a tap on one.
 * Taps arrive through GameScene.onWorldTap -> handleTap, so dragging still scrolls the camera.
 * Nothing is paid before a spot is picked: cancelling costs nothing.
 */
export default class Placement {
  /** @param {import('./GameScene.js').default} scene */
  constructor(scene) {
    this.scene = scene;
    this.spots = [];
    this.objs = [];
    this.ui = null;
    this.onPick = null;
    this.onCancel = null;
    this.title = '';
  }

  get active() { return this.ui !== null; }

  /**
   * @param {string} title shown in the banner
   * @param {{key:string, kind:string, floor:number, x:number}[]} spots free valid spots
   * @param {(key:string)=>void} onPick
   * @param {()=>void} [onCancel]
   */
  start(title, spots, onPick, onCancel) {
    this.stop();
    const { scene } = this;
    this.spots = spots.map((s) => ({ ...s, cy: spotCenterY(scene.tower, s.floor, s.kind) }));
    this.onPick = onPick;
    this.onCancel = onCancel;
    for (const s of this.spots) {
      const box = scene.add.rectangle(s.x, s.cy, SPOT_W, SPOT_H, COLORS.amber, 0.18)
        .setStrokeStyle(4, COLORS.amber).setDepth(SPOT_DEPTH);
      const plus = label(scene, s.x, s.cy, '+', 56, CSS.amber, false).setDepth(SPOT_DEPTH + 1);
      scene.tweens.add({ targets: [box, plus], alpha: 0.45, yoyo: true, repeat: -1, duration: PULSE_MS });
      this.objs.push(box, plus);
    }
    const w = scene.scale.width;
    const y = scene.hud.topH + 56;
    const ui = scene.add.container(0, 0).setDepth(DEPTH.menu).setScrollFactor(0);
    const bg = scene.add.rectangle(w / 2, y, w - 48, 72, COLORS.ink, 0.88).setScrollFactor(0);
    const text = label(scene, 260, y, title, 22, CSS.text);
    text.setWordWrapWidth(440);
    const cancel = button(scene, { x: w - 24 - 100, y, w: 160, h: 96, text: 'Cancel', size: 22, onTap: () => this.cancel() });
    ui.add([bg, text, cancel]);
    this.ui = ui;
    scene.following = true;
    scene.jumpCameraToHero();
  }

  /** A world tap while placing. @returns {boolean} always true (taps never reach the world) */
  handleTap(wx, wy) {
    let best = null;
    let bestD = Infinity;
    for (const s of this.spots) {
      const dx = Math.abs(wx - s.x);
      if (dx > HIT_HALF_W || Math.abs(wy - s.cy) > HIT_HALF_H) continue;
      if (dx < bestD) { bestD = dx; best = s; }
    }
    if (best) {
      const pick = this.onPick;
      this.stop();
      pick(best.key);
    } else this.scene.toast.show('Tap a glowing spot, or Cancel.', 1600);
    return true;
  }

  /** Leave placement mode without placing anything. */
  cancel() {
    if (!this.active) return;
    const cb = this.onCancel;
    this.stop();
    cb?.();
  }

  /** Remove the highlights and banner. */
  stop() {
    for (const o of this.objs) { this.scene.tweens.killTweensOf(o); o.destroy(); }
    this.objs.length = 0;
    this.ui?.destroy();
    this.ui = null;
    this.spots = [];
  }
}
