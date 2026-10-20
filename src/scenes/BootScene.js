import Phaser from 'phaser';
import { loadBalance } from '../core/balance.js';

// Loads balance (save is loaded in main.js), builds placeholder textures, then starts GameScene.
export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    // 96x96 amber placeholder button texture (96 game px ~ 48 CSS px minimum tap target)
    const g = this.add.graphics();
    g.fillStyle(0xffb020).fillRect(0, 0, 96, 96);
    g.lineStyle(4, 0x14110f).strokeRect(2, 2, 92, 92);
    g.generateTexture('placeholder-button', 96, 96);
    g.destroy();

    loadBalance().finally(() => this.scene.start('Game'));
  }
}
