import Phaser from 'phaser';
import { getSafeArea } from '../core/safeArea.js';
import { isMuted, toggleMute } from '../core/audio.js';

// Placeholder: proves rendering, touch and safe area work. gameplay-programmer replaces this.
export default class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  create() {
    const { width, height } = this.scale;
    this.cameras.main.setBackgroundColor('#14110f');
    const top = getSafeArea().top;
    this.add.text(width / 2, 120 + top, 'Floor 15', {
      fontFamily: 'monospace', fontSize: '72px', color: '#ffb020',
    }).setOrigin(0.5);

    const counter = this.add.text(width / 2, height / 2 - 120, 'Taps: 0', {
      fontFamily: 'monospace', fontSize: '40px', color: '#ffffff',
    }).setOrigin(0.5);
    let taps = 0;
    this.add.image(width / 2, height / 2, 'placeholder-button')
      .setInteractive()
      .on('pointerdown', () => counter.setText(`Taps: ${++taps}`));

    const mute = this.add.text(width / 2, height / 2 + 150, '', {
      fontFamily: 'monospace', fontSize: '36px', color: '#ffffff', backgroundColor: '#2b2521',
      fixedWidth: 360, fixedHeight: 96, align: 'center',
    }).setOrigin(0.5).setInteractive();
    const label = () => mute.setText(isMuted() ? 'Sound: OFF' : 'Sound: ON');
    label();
    mute.on('pointerdown', () => { toggleMute(); label(); });
  }
}
