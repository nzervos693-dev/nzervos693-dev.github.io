import Phaser from 'phaser';
import { loadBalance } from '../core/balance.js';
import { queueArt, registerAnimations } from './art.js';
import { liftSheets } from './artLift.js';
import { queueAudio } from './sfx.js';
import { skipFrontEnd } from './debug.js';

// Loads art by manifest and balance (save is loaded in main.js), then starts the iso game (IsoGameScene).
export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'Loading...', {
      fontFamily: 'monospace', fontSize: '32px', color: '#d8d4c8',
    }).setOrigin(0.5);
    this.load.on('complete', () => label.destroy());
    queueArt(this);
    queueAudio(this);
  }

  create() {
    registerAnimations(this);
    liftSheets(this);
    loadBalance().finally(() => this.scene.start(skipFrontEnd() ? 'IsoGame' : 'Title'));
  }
}
