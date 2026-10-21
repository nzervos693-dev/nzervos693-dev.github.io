import Phaser from 'phaser';
import { getSafeArea } from '../core/safeArea.js';
import { INTRO_CARDS } from '../gameplay/storyText.js';
import { button, label, COLORS, CSS } from './ui.js';
import { playSfx } from './sfx.js';
import { exposeScene } from './debug.js';

/**
 * Backstory text cards over the dark apartment (GDD 1 and 8.2): tap anywhere for the next card,
 * Skip goes straight to the game.
 */
export default class IntroScene extends Phaser.Scene {
  constructor() { super('Intro'); }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const sa = getSafeArea();
    this.i = 0;
    this.leaving = false;
    this.cameras.main.setBackgroundColor('#0d0f12');
    this.cameras.main.fadeIn(400, 13, 15, 18);
    this.text = label(this, w / 2, h / 2 - 60, '', 34, CSS.text);
    this.text.setWordWrapWidth(w - 120).setLineSpacing(14);
    this.hint = label(this, w / 2, h / 2 + 140, 'Tap to continue', 22, CSS.dim);
    this.tweens.add({ targets: this.hint, alpha: 0.3, yoyo: true, repeat: -1, duration: 800 });
    // tapping anywhere advances; the Skip button sits on top of it
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0).setInteractive().on('pointerup', () => this.next());
    this.skipBtn = button(this, { x: w / 2, y: h - 130 - sa.bottom, w: 240, h: 96, text: 'Skip', size: 28, onTap: () => this.finish() });
    this.show();
    exposeScene(this);
  }

  show() {
    this.text.setText(INTRO_CARDS[this.i]).setAlpha(0);
    this.tweens.add({ targets: this.text, alpha: 1, duration: 500 });
  }

  next() {
    if (this.leaving) return;
    playSfx(this, 'ui_tap');
    this.i += 1;
    if (this.i >= INTRO_CARDS.length) this.finish();
    else this.show();
  }

  finish() {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start('IsoGame');
  }
}
