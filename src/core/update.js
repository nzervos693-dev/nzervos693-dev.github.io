/*
 * update.js - safe service-worker updates + build stamp.
 *
 *   import { initUpdates, notifySafePoint, BUILD_STAMP } from './core/update.js';
 *   initUpdates(game, registerSW);   // once, from main.js (registerSW from 'virtual:pwa-register')
 *   notifySafePoint();               // TitleScene.create() calls this: a pending update reloads here
 *   BUILD_STAMP                      // "build 4c42a07 · 24 Oct" (or "dev"), injected by Vite define
 *
 * Flow: the SW checks for a new version on launch, on return to foreground and every 30 min while
 * visible. When a new version is downloaded it waits. decideUpdate() then picks:
 *   'reload-now'  active scene is Boot or Title (no run in progress): activate and reload at once.
 *   'defer'       mid-game: keep playing the old version; apply on the next app resume (the save was
 *                 already written when the app went to the background) or the next visit to Title.
 * Progress is never lost: before any reload writeSave() runs.
 */
import { lifecycle } from './lifecycle.js';
import { writeSave } from './save.js';
import { decideUpdate, SAFE_SCENES } from './updateDecision.js';
export { decideUpdate, SAFE_SCENES };

/* global __BUILD_STAMP__ */
export const BUILD_STAMP = typeof __BUILD_STAMP__ === 'string' ? __BUILD_STAMP__ : 'dev';
export const CHECK_INTERVAL_MS = 30 * 60 * 1000;

let ready = false;
let applying = false; // we sent SKIP_WAITING and expect the controller change to reload the page
let applyResumed = false;
let apply = null;
let currentScene = () => null;

function attempt(resumed) {
  const d = decideUpdate({ updateReady: ready, sceneKey: currentScene(), resumed });
  if (d !== 'reload-now') return d;
  ready = false;
  try { writeSave(); } catch (e) { console.error(e); }
  applying = true;
  applyResumed = resumed;
  // if the new SW never takes over (went redundant), stop expecting a reload so a later controller
  // change (another tab's update) cannot reload us mid-game
  setTimeout(() => { applying = false; }, 30000);
  apply?.(true);
  return d;
}

/** Reload only if it is still a safe moment; the decision is re-checked at reload time. */
function reloadIfStillSafe() {
  if (!applying) return;
  applying = false;
  if (decideUpdate({ updateReady: true, sceneKey: currentScene(), resumed: applyResumed }) === 'reload-now') location.reload();
}

/** Call when a safe moment begins (Title shown). */
export function notifySafePoint() { return attempt(false); }

/** @param game Phaser.Game  @param registerSW the function from 'virtual:pwa-register' */
export function initUpdates(game, registerSW) {
  currentScene = () => game.scene.getScenes(true)[0]?.scene.key ?? null;
  let reg = null;
  const check = () => { try { reg?.update().catch(() => {}); } catch { /* offline or no SW */ } };
  apply = registerSW({
    immediate: true,
    onNeedRefresh() { ready = true; attempt(false); },
    onNeedReload: reloadIfStillSafe,
    onRegisteredSW(_url, r) { reg = r; }, // the browser already checks for a new sw.js on launch
  });
  lifecycle.on('resume', () => { check(); attempt(true); });
  setInterval(() => { if (!document.hidden) check(); }, CHECK_INTERVAL_MS);
}
