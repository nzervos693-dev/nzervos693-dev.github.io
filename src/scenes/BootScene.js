import Phaser from 'phaser';
import { loadBalance } from '../core/balance.js';
import { queueArt, registerAnimations } from './art.js';
import { queueAudio } from './sfx.js';
import { skipFrontEnd } from './debug.js';
import { getSave, writeSave } from '../core/save.js';
import { isStaleGame } from '../gameplay/gameState.js';

/** Registry flag: an old save was deleted on launch; the Title shows "The building has changed." */
export const STALE_SAVE_FLAG = 'staleSaveDeleted';

// Loads art by manifest and balance (save is loaded in main.js), then starts GameScene.
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
    if (isStaleGame(getSave().game)) { // an M1 / stage 1 save: the tower is different now (GDD 11.3)
      const save = getSave();
      save.game = {}; // only the game: settings such as mute stay
      writeSave();
      this.registry.set(STALE_SAVE_FLAG, true);
    }
    loadBalance().finally(() => this.scene.start(skipFrontEnd() ? 'Game' : 'Title'));
  }
}
