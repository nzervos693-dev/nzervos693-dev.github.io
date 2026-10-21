/**
 * Small UI builders shared by HUD, menus and panels.
 * `fixed` = true pins objects to the screen (scrollFactor 0); false puts them in the tower.
 */
import Phaser from 'phaser';
import { frameOf } from './art.js';
import { playSfx } from './sfx.js';

export const COLORS = {
  ink: 0x0d0f12, shadow: 0x1f242b, wall: 0x3a4048, light: 0x6b7178,
  rust: 0x6e3b23, red: 0xc0392b, amber: 0xe0a24a, teal: 0x2f5d62,
};
export const CSS = { text: '#d8d4c8', amber: '#e0a24a', red: '#e8604c', dim: '#8d9298' };
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
  bg.on('pointerdown', () => { if (enabled) c.setScale(0.94); });
  bg.on('pointerout', () => c.setScale(1));
  bg.on('pointerup', () => {
    c.setScale(1);
    if (enabled) { playSfx(scene, 'ui_tap'); o.onTap?.(); }
  });
  c.setEnabled = (e) => {
    enabled = e;
    c.setAlpha(e ? 1 : 0.45);
    return c;
  };
  c.setLabel = (s) => { txt.setText(s); return c; };
  c.bg = bg;
  c.img = img;
  c.size = { w, h };
  return c;
}

/** Full-screen invisible blocker that swallows taps (modal backdrop). */
export function backdrop(scene, alpha, onTap) {
  const { width, height } = scene.scale;
  const r = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, alpha).setScrollFactor(0).setInteractive();
  if (onTap) r.on('pointerup', onTap);
  return r;
}

export { Phaser };
