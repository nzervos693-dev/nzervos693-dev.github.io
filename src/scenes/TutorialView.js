import { onSafeAreaChange } from '../core/safeArea.js';
import { button, label, COLORS, CSS, DEPTH } from './ui.js';
import { TUTORIAL_TEXT } from '../gameplay/storyText.js';

const BAR_H = 112;
const SKIP_W = 150;
const ARROW_DEPTH = 45;

/**
 * Tutorial hint bar (one line + Skip) under the top HUD, and a bobbing arrow over the thing to tap.
 * Objects are created once and reused. Rules live in gameplay/tutorial.js.
 */
export default class TutorialView {
  /**
   * @param {import('./GameScene.js').default} scene
   * @param {()=>void} onSkip
   */
  constructor(scene, onSkip) {
    this.scene = scene;
    const w = scene.scale.width;
    this.stepId = null;
    this.bg = scene.add.rectangle(w / 2, 0, w - 32, BAR_H, COLORS.ink, 0.88).setStrokeStyle(3, COLORS.amber).setScrollFactor(0).setDepth(DEPTH.hud + 5).setInteractive(); // swallows taps like the HUD bars
    this.text = label(scene, 0, 0, '', 24, CSS.text).setDepth(DEPTH.hud + 6);
    this.text.setWordWrapWidth(w - 32 - SKIP_W - 48);
    this.skip = button(scene, { x: 0, y: 0, w: SKIP_W - 20, h: 96, text: 'Skip', size: 24, onTap: onSkip });
    this.skip.setDepth(DEPTH.hud + 6);
    this.arrow = scene.add.triangle(0, 0, 0, 0, 44, 0, 22, 34, COLORS.amber).setStrokeStyle(3, COLORS.ink).setDepth(ARROW_DEPTH);
    this.bobBase = 0;
    this.offSafe = onSafeAreaChange(() => this.layout(scene.hud.topH));
    scene.events.once('shutdown', () => this.offSafe());
    this.setVisible(false);
  }

  setVisible(v) {
    for (const o of [this.bg, this.text, this.skip]) o.setVisible(v);
    if (!v) this.arrow.setVisible(false);
    this.shown = v;
  }

  /** Where the hint bar sits (below the top HUD). */
  layout(topY) {
    const w = this.scene.scale.width;
    const y = topY + 8 + BAR_H / 2;
    this.bg.setPosition(w / 2, y);
    this.text.setPosition(16 + (w - 32 - SKIP_W) / 2 + 8, y);
    this.skip.setPosition(w - 16 - SKIP_W / 2 + 4, y);
  }

  /**
   * Show a step (or hide with null). `at` = world position the arrow points at, or null.
   * @param {{id:string}|null} step
   * @param {{x:number,y:number}|null} at arrow tip position
   */
  update(step, at) {
    if (!step) { if (this.shown) this.setVisible(false); return; }
    if (!this.shown) this.setVisible(true);
    if (step.id !== this.stepId) {
      this.stepId = step.id;
      this.text.setText(TUTORIAL_TEXT[step.id] || '');
    }
    if (at) {
      // the tween moves y; keep x/anchor in sync with the target
      this.arrow.setVisible(true).setX(at.x);
      if (Math.abs(this.bobBase - (at.y - 50)) > 1) {
        this.bobBase = at.y - 50;
        this.scene.tweens.killTweensOf(this.arrow);
        this.arrow.setY(this.bobBase);
        this.scene.tweens.add({ targets: this.arrow, y: this.bobBase + 12, yoyo: true, repeat: -1, duration: 450 });
      }
    } else this.arrow.setVisible(false);
  }
}
