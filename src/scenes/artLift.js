/**
 * Brightens the isometric world sheets once at boot (BUG-044). The placeholder art is very dark, and a
 * tint can only multiply (never above 1), so the visible/remembered brightness of vision.js would always
 * read as near black. The sheets are re-created from a canvas with every colour channel multiplied by
 * `gain` (alpha untouched); IsoWorldView then darkens them again per tile state (isoView.shade).
 * Safe to call twice: a lifted canvas is marked and skipped.
 */
import { sheetDef } from './art.js';

/** World sheets that get lifted (characters and effects keep their own brightness). */
export const LIFTED_SHEETS = ['iso_floor', 'iso_walls', 'iso_props', 'iso_props_l', 'iso_stairs'];

/** Default gain of the lift, also the measure used in the readability tests. */
export const LIFT_GAIN = 2.2;

/**
 * @param {Phaser.Scene} scene @param {string[]} keys @param {number} gain
 */
export function liftSheets(scene, keys = LIFTED_SHEETS, gain = LIFT_GAIN) {
  for (const key of keys) {
    const def = sheetDef(key);
    if (!def || !scene.textures.exists(key)) continue;
    const src = scene.textures.get(key).getSourceImage();
    if (src.__lifted) continue;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      d[i] = Math.min(255, d[i] * gain);
      d[i + 1] = Math.min(255, d[i + 1] * gain);
      d[i + 2] = Math.min(255, d[i + 2] * gain);
    }
    ctx.putImageData(img, 0, 0);
    c.__lifted = true;
    scene.textures.remove(key);
    scene.textures.addSpriteSheet(key, c, def);
  }
}
