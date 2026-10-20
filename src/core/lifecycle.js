/*
 * lifecycle.js - pause on app hide, save, resume with elapsed time.
 *
 *   import { lifecycle, initLifecycle } from './core/lifecycle.js';
 *   initLifecycle(game, { onHide: () => {...} });   // once, from main.js
 *
 *   lifecycle.on('pause', () => {});                 // app went to background 
 *   lifecycle.on('resume', (elapsedMs, info) => {}); // app returned; elapsedMs capped, >= 0
 *
 * 'resume' fires only for a return from background, not for first launch
 * (use clock.offlineInfo() in BootScene for that). On hide: onHide() called (put your state into getSave().game there), then the save
 * is written. On return the save timestamp is NOT touched; the next save
 * (autosave) moves it forward.
 * Phaser pauses/resumes its own loop on visibility; we do not call game.pause()/resume().
 * Use this lifecycle emitter, NOT game.events 'pause'/'resume'.
 */
import Phaser from 'phaser';
import { writeSave } from './save.js';
import { offlineInfo } from './clock.js';

export const lifecycle = new Phaser.Events.EventEmitter();
let hidden = false;

export function initLifecycle(game, { onHide } = {}) {
  const hide = () => {
    if (hidden) return;
    hidden = true;
    try { onHide?.(); } catch (e) { console.error(e); }
    writeSave();
    lifecycle.emit('pause');
  };
  const show = () => {
    if (!hidden) return;
    hidden = false;
    const info = offlineInfo();
    lifecycle.emit('resume', info.elapsedMs, info);
  };
  document.addEventListener('visibilitychange', () => (document.hidden ? hide() : show()));
  window.addEventListener('pagehide', hide);
  window.addEventListener('pageshow', () => { if (!document.hidden) show(); });
}
