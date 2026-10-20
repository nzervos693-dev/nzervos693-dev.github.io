// Entry point. Core systems live in src/core/ (see the header comment of each).
import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import GameScene from './scenes/GameScene.js';
import { initSafeArea } from './core/safeArea.js';
import { initLifecycle } from './core/lifecycle.js';
import { initAudio } from './core/audio.js';
import { loadSave } from './core/save.js';

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

// No long-press context menu, no pinch/gesture zoom (iOS), no double-tap zoom.
window.addEventListener('contextmenu', (e) => e.preventDefault());
['gesturestart', 'gesturechange', 'gestureend'].forEach((t) =>
  document.addEventListener(t, (e) => e.preventDefault()),
);

loadSave(); // must run before any core system touches the save

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  input: { activePointers: 3 },
  fps: { smoothStep: false }, // game time = real time, no delta smoothing
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, GameScene],
});

initSafeArea(game);
initAudio(game);
// Save and reset hero position when the app is hidden (GameScene listens).
initLifecycle(game, { onHide: () => game.events.emit('floor15:hide') });
