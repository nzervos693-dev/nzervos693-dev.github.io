/*
 * audio.js - audio unlock + persisted global mute.
 *
 *   initAudio(game)        // once, from main.js; unlocks on first pointer input
 *   isMuted() / setMuted(bool) / toggleMute()   // persisted in save.settings.muted
 *   onMuteChange(fn)       // fn(muted); returns unsubscribe
 *
 * Play sounds as usual with scene.sound.play(key); mute applies globally.
 * Mobile browsers only allow sound after a tap, so never play before the
 * first tap (check isAudioUnlocked() or wait for a "Tap to start" screen).
 */
import { getSave, writeSave } from './save.js';

let soundManager = null;
let unlocked = false;
const listeners = new Set();

export const isMuted = () => !!getSave().settings.muted;
export const isAudioUnlocked = () => unlocked;

function apply() {
  if (soundManager) soundManager.mute = isMuted();
}

export function setMuted(muted) {
  getSave().settings.muted = !!muted;
  apply();
  writeSave();
  listeners.forEach((fn) => fn(!!muted));
}
export const toggleMute = () => { setMuted(!isMuted()); return isMuted(); };
export function onMuteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function initAudio(game) {
  soundManager = game.sound;
  apply();
  const events = ['pointerdown', 'touchend', 'click'];
  const unlock = () => {
    const ctx = soundManager.context; // undefined with NoAudio / HTML5 audio
    if (!ctx) { unlocked = true; detach(); return; }
    if (ctx.state === 'running') { unlocked = true; detach(); return; }
    ctx.resume().then(() => { if (ctx.state === 'running') { unlocked = true; detach(); } }).catch(() => {});
  };
  const detach = () => events.forEach((t) => window.removeEventListener(t, unlock, { capture: true }));
  // Capture phase on window so it runs on the very first touch/click.
  events.forEach((t) => window.addEventListener(t, unlock, { capture: true, passive: true }));
  // Re-resume after returning from background (browsers suspend the context).
  document.addEventListener('visibilitychange', () => { if (!document.hidden && unlocked && soundManager.context?.state !== 'running') soundManager.context.resume().catch(() => {}); });
}
