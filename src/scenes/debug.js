/**
 * Debug switches. Hooks exist only in dev builds or builds made with VITE_DEBUG_HOOKS=1 (the e2e build).
 *   ?debug            expose scenes on window.__floor15 / window.__scenes and skip title, intro, tutorial and attacks
 *   ?debug&story      the real flow: title, intro, tutorial, attacks (used by tests/e2e/story.mjs)
 *   ?debug&attacks    skip the front end and tutorial but keep attacks running
 */
export const DEBUG_BUILD = import.meta.env.DEV || import.meta.env.VITE_DEBUG_HOOKS === '1';

const params = () => new URLSearchParams(location.search);

/** Debug mode is on (debug build and ?debug). */
export const debugOn = () => DEBUG_BUILD && params().has('debug');

/** ?debug&story: run the full title -> intro -> tutorial -> attacks flow. */
export const storyMode = () => debugOn() && params().has('story');

/** Skip title, intro and tutorial (plain ?debug). */
export const skipFrontEnd = () => debugOn() && !storyMode();

/** Attacks run unless plain ?debug. */
export const attacksOn = () => !skipFrontEnd() || params().has('attacks');

/** Expose a scene for e2e tests: window.__scenes[key]. */
export function exposeScene(scene) {
  if (!debugOn()) return;
  (window.__scenes ||= {})[scene.scene.key] = scene;
}
