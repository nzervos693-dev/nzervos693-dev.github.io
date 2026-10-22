/**
 * Small UI builders shared by HUD, menus and panels.
 * `fixed` = true pins objects to the screen (scrollFactor 0); false puts them in the tower.
 */
import Phaser from 'phaser';
import { frameOf, hasFrame } from './art.js';
import { getBalance } from '../core/balance.js';
import { playSfx } from './sfx.js';

/**
 * Muted UI palette (GDD 9): near-black, greys and one rust for the confirm button. `amber` and `teal`
 * keep their old names so existing screens pick up the new look: amber is now off-white text, teal is
 * the rust confirm colour. No bright orange or teal anywhere in the UI.
 */
export const COLORS = {
  ink: 0x0b0c0e, shadow: 0x16191d, wall: 0x23272c, light: 0x5d6166,
  rust: 0x5a3a2a, red: 0x5e2422, amber: 0xbdb8ab, teal: 0x5a3a2a,
};
export const CSS = { text: '#bdb8ab', amber: '#bdb8ab', red: '#9a6259', dim: '#7d8185' };

/** balance.ui.* with the GDD defaults (so a missing key never breaks a screen). */
export function uiConfig() {
  const u = getBalance().ui || {};
  return {
    bar: { iconPlatePx: 72, hitAreaPx: 96, plateColor: '#0b0c0e', plateAlpha: 0.55, iconColor: '#bdb8ab', iconAlpha: 0.7, pressedAlpha: 0.9, ...(u.bottomBar || {}) },
    panel: { worldDimAlpha: 0.4, bgAlpha: 0.9, ...(u.panel || {}) },
    floorNumber: { color: '#5d6166', alpha: 0.6, heightPx: 48, ...(u.floorNumber || {}) },
  };
}
/** '#rrggbb' to 0xrrggbb. */
export const hex = (css) => parseInt(String(css).replace('#', ''), 16);
export const FONT = 'monospace';
/** Button size in game px (balance.controls.buttonSizePx). */
export const DEPTH = { hud: 1000, menu: 1500, panel: 2000, toast: 3000 };

/** Styled text. */
export function label(scene, x, y, str, size = 22, color = CSS.text, fixed = true) {
  const t = scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, align: 'center' }).setOrigin(0.5);
  if (fixed) t.setScrollFactor(0);
  return t;
}

/**
 * A tappable button. Returns a Container; `.setEnabled(bool)`, `.setLabel(str)` available.
 * @param {Phaser.Scene} scene
 * @param {{x:number,y:number,w?:number,h?:number,text?:string,icon?:{key:string,name:string,scale?:number},
 *   frame?:{key:string,name:string}, onTap:Function, fixed?:boolean, fill?:number, size?:number}} o
 */
export function button(scene, o) {
  const w = o.w ?? 96;
  const h = o.h ?? 96;
  const fixed = o.fixed !== false;
  const c = scene.add.container(o.x, o.y);
  const bg = scene.add.rectangle(0, 0, w, h, o.fill ?? COLORS.wall).setStrokeStyle(3, COLORS.ink);
  const kids = [bg];
  // panel_button skin (grey, or rust for confirm buttons): 9-slice, 4 art px borders, drawn at 3x
  const rust = (o.fill ?? COLORS.wall) === COLORS.rust;
  const skinOn = o.skin !== false && !o.icon && !o.frame && hasFrame('panel_button', 'grey');
  let skin = null;
  if (skinOn) {
    const fr = (n) => frameOf('panel_button', n);
    skin = scene.add.nineslice(0, 0, 'panel_button', fr(rust ? 'rust' : 'grey'), w / 3, h / 3, 4, 4, 4, 4).setScale(3);
    bg.setAlpha(0.001);
    kids.push(skin);
    skin.frames = [fr(rust ? 'rust' : 'grey'), fr(rust ? 'rust_pressed' : 'grey_pressed')];
  }
  let img = null;
  if (o.frame) {
    img = scene.add.image(0, 0, o.frame.key, frameOf(o.frame.key, o.frame.name)).setDisplaySize(w, h);
    kids.push(img);
  } else if (o.icon) {
    img = scene.add.image(0, o.text ? -14 : 0, o.icon.key, frameOf(o.icon.key, o.icon.name)).setScale(o.icon.scale ?? 4);
    kids.push(img);
  }
  const txt = scene.add.text(0, o.icon || o.frame ? h / 2 - 16 : 0, o.text || '', {
    fontFamily: FONT, fontSize: `${o.size ?? 18}px`, color: CSS.text, align: 'center',
    stroke: '#0d0f12', strokeThickness: 4, wordWrap: { width: w - 8 },
  }).setOrigin(0.5);
  kids.push(txt);
  c.add(kids);
  if (fixed) { c.setScrollFactor(0); kids.forEach((k) => k.setScrollFactor(0)); }
  bg.setInteractive();
  let enabled = true;
  bg.on('pointerdown', () => { if (enabled) { c.setScale(0.94); skin?.setFrame(skin.frames[1]); } });
  bg.on('pointerout', () => { c.setScale(1); skin?.setFrame(skin.frames[0]); });
  bg.on('pointerup', () => {
    c.setScale(1);
    skin?.setFrame(skin.frames[0]);
    if (enabled) { playSfx(scene, 'ui_tap', { volume: getBalance().audio?.uiVolume ?? 0.2 }); o.onTap?.(); }
  });
  c.setEnabled = (e) => {
    enabled = e;
    c.setAlpha(e ? 1 : 0.45);
    return c;
  };
  c.setLabel = (s) => { txt.setText(s); return c; };
  c.bg = bg;
  c.skin = skin;
  c.img = img;
  c.size = { w, h };
  return c;
}

/**
 * Bottom-bar icon plate (GDD 8.5): a dark translucent 72 px plate with a muted icon from the hud_icons sheet,
 * no text, on a 96 px hit area. Same surface as button(): setEnabled, setIcon, size, bg (the plate).
 * @param {{x?:number,y?:number,icon:string,onTap:Function}} o icon = hud_icons frame name
 */
export function plateButton(scene, o) {
  const cfg = uiConfig().bar;
  const c = scene.add.container(o.x ?? 0, o.y ?? 0).setScrollFactor(0);
  const bg = scene.add.rectangle(0, 0, cfg.iconPlatePx, cfg.iconPlatePx, hex(cfg.plateColor), cfg.plateAlpha).setScrollFactor(0);
  const hit = scene.add.rectangle(0, 0, cfg.hitAreaPx, cfg.hitAreaPx, 0x000000, 0.001).setScrollFactor(0).setInteractive();
  const img = scene.add.image(0, 0, 'hud_icons', 0).setScale(3).setScrollFactor(0).setTint(hex(cfg.iconColor)).setAlpha(cfg.iconAlpha);
  c.add([bg, img, hit]);
  const setIcon = (name) => {
    const ok = hasFrame('hud_icons', name);
    img.setVisible(ok);
    if (ok) img.setFrame(frameOf('hud_icons', name));
    return c;
  };
  setIcon(o.icon);
  let enabled = true;
  hit.on('pointerdown', () => { if (enabled) img.setAlpha(cfg.pressedAlpha); });
  hit.on('pointerout', () => img.setAlpha(cfg.iconAlpha));
  hit.on('pointerup', () => {
    img.setAlpha(cfg.iconAlpha);
    if (enabled) { playSfx(scene, 'ui_tap', { volume: getBalance().audio?.uiVolume ?? 0.2 }); o.onTap?.(); }
  });
  c.setEnabled = (e) => { enabled = e; c.setAlpha(e ? 1 : 0.45); return c; };
  c.setLabel = () => c; // plates carry no text
  c.setIcon = setIcon;
  c.bg = bg;
  c.img = img;
  c.size = { w: cfg.hitAreaPx, h: cfg.hitAreaPx };
  return c;
}

/** Full-screen invisible blocker that swallows taps (modal backdrop). */
export function backdrop(scene, alpha, onTap) {
  const { width, height } = scene.scale;
  const dim = Math.min(alpha, uiConfig().panel.worldDimAlpha + 0.2); // panels dim the world only a little
  const r = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, dim).setScrollFactor(0).setInteractive();
  if (onTap) r.on('pointerup', onTap);
  return r;
}

export { Phaser };
