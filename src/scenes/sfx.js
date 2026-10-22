/**
 * Sound effects from public/assets/audio/manifest.json (ogg only). Nothing plays before the first
 * tap (core/audio.js unlocks it) and the global mute applies. Volumes come from the manifest.
 */
import audioManifest from '../../public/assets/audio/manifest.json';
import { isAudioUnlocked } from '../core/audio.js';

const loops = new Map();
const swells = new Set();

/** Queue every sound in the audio manifest on a scene's loader. */
export function queueAudio(scene) {
  const base = `${import.meta.env.BASE_URL}assets/audio/`;
  for (const [key, def] of Object.entries(audioManifest.sounds)) {
    if (def.deprecated) continue; // never played, so never downloaded
    scene.load.audio(key, def.files.filter((f) => f.endsWith('.ogg')).map((f) => base + f));
  }
}

/**
 * Play a sound if it is loaded and audio is unlocked.
 * @param {Phaser.Scene} scene
 * @param {string} key manifest key
 * Keys the manifest marks "deprecated" (siren, alert_sting, survivor_blip, error, amb_tower, heartbeat)
 * never play. Missing keys (a sound not generated yet) are skipped silently.
 * @param {{volume?:number, loop?:boolean, rate?:number, pan?:number}} [opts] volume multiplies the manifest volume;
 *   a loop starts once (calling again while it plays does nothing) and ends with stopSfx(key)
 * @returns {Phaser.Sound.BaseSound|null}
 */
export function playSfx(scene, key, opts = {}) {
  if (!isAudioUnlocked() || !scene.cache.audio.exists(key)) return null;
  const def = audioManifest.sounds[key];
  if (def?.deprecated) return null;
  const volume = (def?.volume ?? 1) * (opts.volume ?? 1);
  if (opts.loop ?? false) {
    let s = loops.get(key);
    if (s && !s.pendingRemove && s.manager) { if (!s.isPlaying) s.play(); return s; }
    s = scene.sound.add(key, { volume, loop: true });
    loops.set(key, s);
    s.play();
    return s;
  }
  const cfg = { volume, rate: opts.rate ?? 1 };
  if (opts.pan != null) cfg.pan = opts.pan;
  scene.sound.play(key, cfg);
  return null;
}

/** Does a playable (loaded, not deprecated) sound exist under this key? */
export const hasSfx = (scene, key) => scene.cache.audio.exists(key) && !audioManifest.sounds[key]?.deprecated;

/** Stop a looping sound started with playSfx(..., {loop:true}). */
export function stopSfx(key) {
  const s = loops.get(key);
  if (s) { s.stop(); s.setVolume?.(audioManifest.sounds[key]?.volume ?? 1); }
}

/** Set the volume of a running loop to `volume` x its manifest volume (fades are done by the caller). */
export function setLoopVolume(key, volume) {
  const s = loops.get(key);
  if (s && s.isPlaying) s.setVolume((audioManifest.sounds[key]?.volume ?? 1) * volume);
}

/**
 * Play a recorded sound once as a natural swell: it fades in, plays `seconds` (or its whole length, whichever
 * is shorter) and fades out, then stops. Used for the weather one-shots, which are never looped (GDD 10).
 * @param {{volume?:number, seconds?:number, fade?:number, pan?:number}} [opts] volume multiplies the manifest volume
 * @returns {Phaser.Sound.BaseSound|null}
 */
export function playSwell(scene, key, opts = {}) {
  if (!isAudioUnlocked() || !scene.cache.audio.exists(key)) return null;
  const def = audioManifest.sounds[key];
  if (def?.deprecated) return null;
  const peak = (def?.volume ?? 1) * (opts.volume ?? 1);
  const s = scene.sound.add(key, { volume: 0, loop: false });
  swells.add(s);
  if (opts.pan != null) s.setPan?.(opts.pan);
  const total = Math.min(opts.seconds ?? Infinity, def?.duration ?? opts.seconds ?? 8);
  const fade = Math.min(opts.fade ?? 2, total / 2);
  let t = 0;
  const timer = scene.time.addEvent({
    delay: 50, loop: true,
    callback: () => {
      t += 0.05;
      const env = Math.max(0, Math.min(1, t / fade, (total - t) / fade));
      if (s.manager && !s.pendingRemove) s.setVolume(peak * env);
      if (t >= total || !s.isPlaying) { timer.remove(); swells.delete(s); if (s.manager) s.destroy(); }
    },
  });
  s.once('complete', () => { timer.remove(); swells.delete(s); s.destroy(); });
  s.play();
  return s;
}

/** Stop every weather swell still playing (game over, app hidden, scene shutdown). */
export function stopSwells() {
  for (const s of swells) { if (s.manager && !s.pendingRemove) { s.stop(); s.destroy(); } }
  swells.clear();
}
