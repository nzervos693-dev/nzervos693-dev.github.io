/**
 * Camera maths for wide floors (GDD 4): axis-locked drag, horizontal follow with a dead zone, bounds.
 * Pure numbers, no Phaser, no allocation per call.
 */

/**
 * Lock the drag axis once the touch has moved past the threshold: |dx| > |dy| = horizontal, else vertical.
 * @returns {'x'|'y'|null} null while the touch has not moved `threshold` px yet
 */
export function lockAxis(dx, dy, threshold) {
  if (Math.hypot(dx, dy) <= threshold) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

/**
 * Scroll x that keeps the hero inside a dead zone of +/- `deadzone` px around the screen centre.
 * Inside the zone the camera stays where it is.
 * @param {number} scrollX current camera left edge
 * @param {number} heroX hero world x
 * @param {number} viewW view width in game px
 * @param {number} deadzone half width of the dead zone
 */
export function deadZoneTarget(scrollX, heroX, viewW, deadzone) {
  const offset = heroX - (scrollX + viewW / 2);
  if (offset > deadzone) return heroX - deadzone - viewW / 2;
  if (offset < -deadzone) return heroX + deadzone - viewW / 2;
  return scrollX;
}

/**
 * Frame-rate independent lerp: `lerp` is the fraction per frame at 60 fps (balance controls.cameraLerp).
 * @returns {number} fraction to move this frame, 0..1
 */
export const lerpFactor = (lerp, dt) => 1 - (1 - lerp) ** (dt * 60);

/**
 * Clamp the camera's left edge to the world, with `pad` px (balance controls.cameraEdgePadPx) of extra room past each edge so the
 * outermost slots are not under the Android back-swipe zone. A view wider than the padded world is centred.
 */
export function clampScrollX(x, viewW, worldW, pad = 0) {
  const lo = -pad;
  const hi = worldW + pad - viewW;
  if (hi < lo) return (lo + hi) / 2;
  return Math.min(hi, Math.max(lo, x));
}

/** Camera left edge that centres a world x (clamped). */
export const centerScrollX = (x, viewW, worldW, pad = 0) => clampScrollX(x - viewW / 2, viewW, worldW, pad);
