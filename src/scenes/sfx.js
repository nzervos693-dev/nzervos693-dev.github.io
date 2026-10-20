import { isAudioUnlocked } from '../core/audio.js';

/**
 * Play a sound if it was loaded and audio is unlocked. No-op until the
 * audio-designer's files exist, so call sites can be wired already.
 */
export function playSfx(scene, key, config) {
  if (!isAudioUnlocked() || !scene.cache.audio.exists(key)) return;
  scene.sound.play(key, config);
}
