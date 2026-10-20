/**
 * Sound effects from public/assets/audio/manifest.json (ogg only). Nothing plays before the first
 * tap (core/audio.js unlocks it) and the global mute applies. Volumes come from the manifest.
 */
import audioManifest from '../../public/assets/audio/manifest.json';
import { isAudioUnlocked } from '../core/audio.js';

const loops = new Map();

/** Queue every sound in the audio manifest on a scene's loader. */
export function queueAudio(scene) {
  const base = `${import.meta.env.BASE_URL}assets/audio/`;
  for (const [key, def] of Object.entries(audioManifest.sounds)) {
    scene.load.audio(key, def.files.filter((f) => f.endsWith('.ogg')).map((f) => base + f));
  }
}

/**
 * Play a sound if it is loaded and audio is unlocked.
 * @param {Phaser.Scene} scene
 * @param {string} key manifest key
 * @param {{volume?:number, loop?:boolean, rate?:number}} [opts] volume multiplies the manifest volume;
 *   a loop starts once (calling again while it plays does nothing) and ends with stopSfx(key)
 * @returns {Phaser.Sound.BaseSound|null}
 */
export function playSfx(scene, key, opts = {}) {
  if (!isAudioUnlocked() || !scene.cache.audio.exists(key)) return null;
  const def = audioManifest.sounds[key];
  const volume = (def?.volume ?? 1) * (opts.volume ?? 1);
  if (opts.loop ?? false) {
    let s = loops.get(key);
    if (s && !s.pendingRemove && s.manager) { if (!s.isPlaying) s.play(); return s; }
    s = scene.sound.add(key, { volume, loop: true });
    loops.set(key, s);
    s.play();
    return s;
  }
  scene.sound.play(key, { volume, rate: opts.rate ?? 1 });
  return null;
}

/** Stop a looping sound started with playSfx(..., {loop:true}). */
export function stopSfx(key) {
  const s = loops.get(key);
  if (s) { s.stop(); }
}
