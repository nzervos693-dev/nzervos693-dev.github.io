import Phaser from 'phaser';
import { getSave, deleteSave } from '../core/save.js';
import { isMuted, toggleMute, onMuteChange } from '../core/audio.js';
import { getSafeArea } from '../core/safeArea.js';
import { button, label, COLORS, CSS } from './ui.js';
import { exposeScene } from './debug.js';

/**
 * Title screen (GDD 8.1): logo, Continue (when a game is saved), New game (asks first when a save
 * exists) and a sound toggle. The first tap here also unlocks audio.
 */
export default class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const w = this.scale.width;
    const h = this.scale.height;
    const sa = getSafeArea();
    const game = getSave().game;
    const canContinue = !!game?.started && !game.flags?.heroDead; // a dead save cannot be continued, so no delete warning either
    const hasSave = canContinue;
    this.cameras.main.setBackgroundColor('#0d0f12');
    this.add.rectangle(w / 2, h / 2, w, h, COLORS.ink);
    label(this, w / 2, 330 + sa.top / 2, 'FLOOR 15', 96, CSS.amber);
    label(this, w / 2, 430 + sa.top / 2, 'Everything in this tower is salvage.', 24, CSS.dim);

    this.buttons = {};
    let y = 640;
    if (canContinue) {
      this.buttons.continue = button(this, { x: w / 2, y, w: 440, h: 96, text: 'Continue', size: 32, fill: COLORS.teal, onTap: () => this.scene.start('Game') });
      y += 128;
    }
    this.buttons.newGame = button(this, {
      x: w / 2, y, w: 440, h: 96, text: 'New game', size: 32, fill: canContinue ? COLORS.wall : COLORS.teal,
      onTap: () => (hasSave ? this.askNewGame() : this.startNew()),
    });
    this.buttons.sound = button(this, { x: w / 2, y: h - 130 - sa.bottom, w: 260, h: 96, text: '', size: 26, onTap: () => toggleMute() });
    const upSound = () => this.buttons.sound.setLabel(isMuted() ? 'Sound: OFF' : 'Sound: ON');
    upSound();
    const off = onMuteChange(upSound);
    this.events.once('shutdown', off);
    exposeScene(this);
  }

  /** Confirm before a save is deleted. */
  askNewGame() {
    const w = this.scale.width;
    const h = this.scale.height;
    const c = this.add.container(0, 0).setDepth(100);
    const add = (o) => { c.add(o); return o; };
    add(this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.85).setInteractive());
    add(this.add.rectangle(w / 2, h / 2, 600, 440, COLORS.shadow).setStrokeStyle(4, COLORS.ink));
    add(label(this, w / 2, h / 2 - 140, 'Start over?', 40, CSS.amber));
    add(label(this, w / 2, h / 2 - 70, 'Your saved game will be deleted.', 24, CSS.text));
    this.buttons.confirm = add(button(this, { x: w / 2, y: h / 2 + 20, w: 440, h: 96, text: 'Delete and start', size: 28, fill: COLORS.rust, onTap: () => this.startNew() }));
    this.buttons.cancel = add(button(this, { x: w / 2, y: h / 2 + 140, w: 440, h: 96, text: 'Cancel', size: 28, onTap: () => c.destroy() }));
  }

  startNew() {
    if (this.starting) return;
    this.starting = true;
    deleteSave();
    this.scene.start('Intro');
  }
}
