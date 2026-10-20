/*
 * safeArea.js - notch / gesture-bar insets.
 *
 *   initSafeArea(game)          // once, from main.js
 *   getSafeArea()               // { top, right, bottom, left } in GAME px (720x1280 space)
 *   getSafeAreaCss()            // same in CSS px
 *   onSafeAreaChange(fn)        // fn(gameInsets) on resize/rotation; returns unsubscribe
 *
 * Offset HUD with e.g. y = 16 + getSafeArea().top. Re-read after resize.
 */
let cssInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let gameInsets = { top: 0, right: 0, bottom: 0, left: 0 };
let probe = null;
const listeners = new Set();

function measure(game) {
  const cs = getComputedStyle(probe);
  cssInsets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  // Canvas is scaled to fit; convert CSS px to game px.
  const rect = game.canvas.getBoundingClientRect();
  const k = rect.width > 0 ? game.config.width / rect.width : 1;
  // Only the part of the inset that actually overlaps the canvas matters.
  const over = (inset, edge, size, viewport) => {
    const gap = edge === 'start' ? size : viewport - size;
    return Math.max(0, inset - gap);
  };
  const vw = window.innerWidth, vh = window.innerHeight;
  gameInsets = {
    top: over(cssInsets.top, 'start', rect.top, vh) * k,
    left: over(cssInsets.left, 'start', rect.left, vw) * k,
    bottom: over(cssInsets.bottom, 'end', rect.bottom, vh) * k,
    right: over(cssInsets.right, 'end', rect.right, vw) * k,
  };
  listeners.forEach((fn) => fn(gameInsets));
}

export function initSafeArea(game) {
  probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;left:0;top:0;width:0;height:0;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const update = () => measure(game);
  game.scale.on('resize', update);
  window.addEventListener('orientationchange', update);
  update();
}

export const getSafeArea = () => gameInsets;
export const getSafeAreaCss = () => cssInsets;
export function onSafeAreaChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
