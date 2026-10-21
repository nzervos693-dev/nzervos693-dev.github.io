/**
 * Moodle column (GDD 5.2, 9): small icons at the top right that appear only when something is wrong.
 * 48 game px icons with 96 px hit areas, worst first, no numbers. Tap one for a one-line card and
 * at most one action. Uses the `moodles` art sheet (frame_1..4 backgrounds + `${id}_${level}` glyphs)
 * and draws simple placeholder pictograms when the sheet or a frame is missing.
 * Rules live in gameplay/moodles.js.
 */
import { getSafeArea, onSafeAreaChange } from '../core/safeArea.js';
import { frameOf, hasFrame, hasSheet } from './art.js';
import { button, label, COLORS, CSS, DEPTH } from './ui.js';
import { playSfx } from './sfx.js';
import { MOODLE_CUE_SOUND } from '../gameplay/moodles.js';

/** Severity colours (GDD 9): L1..L4. */
const LEVEL_COLORS = [0x7d7350, 0x8a6a3a, 0x7a4630, 0x5e2422];
const HIT = 96;
const CARD_W = 380;
const CARD_TEXT_H = 72;
const EDGE = 16;
const OFF_WHITE = 0xbdb8ab;

export default class MoodleView {
  /**
   * @param {import('./GameScene.js').default} scene
   * @param {object} balance
   * @param {{getAction:(id:string)=>({label:string}|null), hint:(id:string)=>string, onAction:(id:string)=>void}} cb
   */
  constructor(scene, balance, cb) {
    this.scene = scene;
    this.balance = balance;
    this.cb = cb;
    this.iconPx = balance.moodles.iconPx;
    this.sheet = hasSheet('moodles_l') ? 'moodles_l' : 'moodles'; // 24 px art at 3x = 72, else the 16 px sheet scaled up
    this.wobbleMs = balance.moodles.levelChangeWobbleSeconds * 1000;
    this.slots = [];
    this.list = [];
    this.levels = {};
    this.open = null; // id of the moodle whose card is open
    this.card = null;
    for (let i = 0; i < balance.moodles.maxShown; i++) this.slots.push(this.makeSlot(i));
    this.layout();
    this.offSafe = onSafeAreaChange(() => this.layout());
    scene.events.once('shutdown', () => this.offSafe());
  }

  makeSlot(i) {
    const { scene } = this;
    const c = scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.hud).setVisible(false);
    const bg = scene.add.image(0, 0, this.sheet, 0).setDisplaySize(this.iconPx, this.iconPx).setScrollFactor(0);
    const glyph = scene.add.image(0, 0, this.sheet, 0).setDisplaySize(this.iconPx, this.iconPx).setScrollFactor(0);
    const art = scene.add.graphics().setScrollFactor(0);
    const hit = scene.add.rectangle(0, 0, HIT, HIT, 0x000000, 0.001).setScrollFactor(0).setInteractive();
    c.add([bg, glyph, art, hit]);
    hit.on('pointerup', () => this.tap(i));
    return { c, bg, glyph, art, hit, id: null, level: 0 };
  }

  get isCardOpen() { return !!this.card; }

  layout() {
    const sa = getSafeArea();
    const w = this.scene.scale.width;
    this.x = w - EDGE - sa.right - HIT / 2;
    this.y0 = sa.top + EDGE + HIT / 2;
    this.slots.forEach((s, i) => s.c.setPosition(this.x, this.y0 + i * HIT));
    if (this.open) this.showCard(this.open);
  }

  /** Show the given moodles ([{id, level, text}], worst first). Call when the list changes. */
  update(list) {
    this.list = list;
    const seen = new Set();
    this.slots.forEach((s, i) => {
      const m = list[i];
      if (!m) { s.c.setVisible(false); s.id = null; return; }
      seen.add(m.id);
      const changed = this.levels[m.id] !== m.level;
      const redraw = s.id !== m.id || s.level !== m.level;
      s.id = m.id;
      s.level = m.level;
      s.c.setVisible(true);
      if (redraw) this.draw(s, m);
      if (changed) this.wobble(s, m);
    });
    for (const id of Object.keys(this.levels)) if (!seen.has(id)) delete this.levels[id];
    for (const m of list) this.levels[m.id] = m.level;
    if (this.open && !seen.has(this.open)) this.closeCard();
    else if (this.open) this.showCard(this.open);
  }

  draw(s, m) {
    const sh = this.sheet;
    const sheet = hasFrame(sh, `${m.id}_${m.level}`);
    s.bg.setVisible(sheet && hasFrame(sh, `frame_${m.level}`));
    s.glyph.setVisible(sheet);
    s.art.clear();
    if (sheet) {
      if (s.bg.visible) s.bg.setFrame(frameOf(sh, `frame_${m.level}`));
      s.glyph.setFrame(frameOf(sh, `${m.id}_${m.level}`));
      return;
    }
    // placeholder: severity square with a simple pictogram
    const h = this.iconPx / 2;
    s.art.fillStyle(LEVEL_COLORS[m.level - 1], 1).fillRect(-h, -h, h * 2, h * 2);
    s.art.lineStyle(2, COLORS.ink, 1).strokeRect(-h, -h, h * 2, h * 2);
    this.pictogram(s.art, m.id, h);
  }

  /** Off-white pictograms: plate, drop, closed eye, bandage, cloud, wide eye. */
  pictogram(g, id, h) {
    g.fillStyle(OFF_WHITE, 1).lineStyle(3, OFF_WHITE, 1);
    const r = h * 0.55;
    switch (id) {
      case 'hungry': g.strokeCircle(0, 0, r).strokeCircle(0, 0, r * 0.5); break;
      case 'thirsty': g.fillTriangle(0, -r, -r * 0.7, r * 0.3, r * 0.7, r * 0.3).fillCircle(0, r * 0.3, r * 0.7); break;
      case 'tired': g.lineBetween(-r, 0, r, 0).lineBetween(-r * 0.8, 0, -r * 0.5, r * 0.5).lineBetween(r * 0.8, 0, r * 0.5, r * 0.5); break;
      case 'injured': g.fillRect(-r, -r * 0.35, r * 2, r * 0.7).fillStyle(LEVEL_COLORS[0], 1).fillRect(-r * 0.15, -r * 0.35, r * 0.3, r * 0.7); break;
      case 'depressed': g.fillCircle(-r * 0.5, r * 0.1, r * 0.5).fillCircle(r * 0.5, r * 0.1, r * 0.5).fillCircle(0, -r * 0.3, r * 0.6); break;
      default: g.strokeEllipse(0, 0, r * 2.2, r * 1.4).fillCircle(0, 0, r * 0.35); break;
    }
  }

  wobble(s, m) {
    const { scene } = this;
    scene.tweens.killTweensOf(s.c);
    s.c.setAngle(0);
    scene.tweens.add({ targets: s.c, angle: { from: -9, to: 9 }, yoyo: true, repeat: 1, duration: this.wobbleMs / 4, onComplete: () => s.c.setAngle(0) });
    playSfx(scene, MOODLE_CUE_SOUND[m.id]); // a soft body cue
  }

  tap(i) {
    const m = this.list[i];
    if (!m) return;
    if (this.open === m.id) { this.closeCard(); return; }
    this.showCard(m.id);
  }

  showCard(id) {
    this.card?.destroy();
    const m = this.list.find((x) => x.id === id);
    const i = this.list.indexOf(m);
    if (!m) { this.card = null; this.open = null; return; }
    this.open = id;
    const { scene } = this;
    const action = this.cb.getAction(id);
    const hint = this.cb.hint(id);
    const hasBtn = !!action;
    const h = CARD_TEXT_H + (hasBtn ? HIT + 8 : 0);
    const cx = this.x - HIT / 2 - 8 - CARD_W / 2;
    const top = this.y0 + i * HIT - HIT / 2;
    const c = scene.add.container(0, 0).setScrollFactor(0).setDepth(DEPTH.hud + 20);
    const bg = scene.add.rectangle(cx, top + h / 2, CARD_W, h, COLORS.ink, 0.9).setStrokeStyle(2, COLORS.wall).setScrollFactor(0).setInteractive();
    const text = label(scene, cx, top + CARD_TEXT_H / 2, hint ? `${m.text}. ${hint}` : `${m.text}.`, 26, CSS.text);
    c.add([bg, text]);
    if (hasBtn) {
      c.add(button(scene, { x: cx, y: top + CARD_TEXT_H + 4 + HIT / 2, w: CARD_W - 24, h: HIT, text: action.label, size: 22, fill: COLORS.teal, onTap: () => this.cb.onAction(id) }));
    }
    this.card = c;
  }

  closeCard() {
    this.card?.destroy();
    this.card = null;
    this.open = null;
  }
}
