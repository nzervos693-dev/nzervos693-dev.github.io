/* updateDecision.js - pure reload-now / defer decision (no Phaser import, unit-testable). See update.js. */
export const SAFE_SCENES = ['Boot', 'Title'];

/**
 * Pure decision. @param {{updateReady:boolean, sceneKey:?string, resumed?:boolean}} s
 * @returns {'none'|'reload-now'|'defer'}
 */
export function decideUpdate({ updateReady, sceneKey, resumed = false }) {
  if (!updateReady) return 'none';
  if (resumed || SAFE_SCENES.includes(sceneKey)) return 'reload-now';
  return 'defer';
}
