/**
 * The context action buttons (GDD 4 "Action buttons" and "HUD layout"): Main (120 px), Attack (96),
 * Secondary (88) and Quick-use (80) plates in an arc by the right thumb (mirrored by the Stick: Right
 * setting), plus the quick-use picker. Icons only; the one text is the quick-use count.
 *
 * View only: which action a button shows is decided in gameplay/isoButtons.js and handed in each frame via
 * update(). A button fires on RELEASE over the same button (a finger that slid off does nothing). Holding
 * Attack (or Main while it shows Attack) calls onHold every frame once held past tapMaxSeconds; the scene
 * repeats the swing on its cooldown. Long-pressing Quick-use opens the picker.
 *
 * Art: `button_plates` (plate_40/32/30/28 + _pressed/_disabled) and `action_icons`; simple code-drawn
 * fallbacks are used when a sheet or frame is missing.
 */
import { getSafeArea, onSafeAreaChange } from '../core/safeArea.js';
import { getBalance } from '../core/balance.js';
import { frameOf, hasFrame, hasSheet } from './art.js';
import { playSfx } from './sfx.js';
import { label, hex, DEPTH, CSS } from './ui.js';

/** Plate diameter (game px) -> button_plates frame base. */
const PLATE_FRAME = { 120: 'plate_40', 96: 'plate_32', 88: 'plate_30', 80: 'plate_28' };
const ICON_SCALE = { main: 4, secondary: 3, attack: 3, quick: 3 };
const ITEM_ICON_SCALE = 6;
const PICK_CELL = 96;
const PICK_GAP = 8;
const NAMES = ['main', 'secondary', 'attack', 'quick'];

export default class ActionButtons {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} balance
   * @param {{onMain:Function, onSecondary:Function, onAttack:Function, onQuick:Function, onHold:(name:string)=>void,
   *   onPick:(id:string|null)=>void, pickerItems:()=>{id:string|null, count:number}[], longPressSeconds:number, holdSeconds:number}} cb
   */
  constructor(scene, balance, cb) {
    this.scene = scene;
    this.cfg = balance.controls.buttons;
    this.cb = cb;
    this.side = 'left';
    this.visible = true;
    this.picker = null;
    this.btn = {};
    const spec = { main: this.cfg.main, attack: this.cfg.attack, secondary: this.cfg.secondary, quick: this.cfg.quickUse };
    for (const name of NAMES) this.btn[name] = this.make(name, spec[name]);
    this.count = label(scene, 0, 0, '', 22, CSS.text).setDepth(DEPTH.hud + 2).setVisible(false);
    scene.input.on('pointerdown', (p, over) => { if (this.picker && !over.some((o) => o.getData?.('picker'))) this.closePicker(); });
    this.layout();
    this.offSafe = onSafeAreaChange(() => this.layout());
    scene.events.once('shutdown', () => { this.offSafe(); });
  }

  make(name, spec) {
    const { scene } = this;
    const size = spec.sizePx;
    const b = {
      name, size, hitPx: spec.hitPx, off: spec.offsetPx, x: 0, y: 0, down: -1, heldT: 0, longFired: false, holding: false,
      shown: '', shownItem: '', slot: null, fade: 1, plateKey: '', pressed: false,
    };
    const depth = DEPTH.hud + 1;
    b.plate = hasSheet('button_plates') ? scene.add.image(0, 0, 'button_plates', 0).setDisplaySize(size, size) : null;
    b.fallback = scene.add.graphics();
    b.ring = scene.add.graphics();
    b.iconA = scene.add.image(0, 0, 'action_icons', 0).setVisible(false);
    b.iconB = scene.add.image(0, 0, 'action_icons', 0).setVisible(false);
    b.glyph = scene.add.text(0, 0, '', { fontFamily: 'monospace', fontSize: '40px', color: this.cfg.iconColor }).setOrigin(0.5).setVisible(false);
    b.hit = scene.add.circle(0, 0, b.hitPx / 2, 0x000000, 0.001).setInteractive();
    const parts = [b.plate, b.fallback, b.iconA, b.iconB, b.glyph, b.ring, b.hit].filter(Boolean);
    for (const o of parts) o.setScrollFactor(0).setDepth(depth);
    b.parts = parts;
    b.hit.on('pointerdown', (p) => { if (!this.visible) return; b.down = p.id; b.heldT = 0; b.longFired = false; b.holding = false; });
    b.hit.on('pointerout', () => { b.down = -1; b.holding = false; });
    b.hit.on('pointerup', (p) => {
      if (b.down !== p.id) return;
      b.down = -1;
      if (!this.visible || b.longFired || b.holding) return;
      this.fire(name);
    });
    return b;
  }

  fire(name) {
    const { cb } = this;
    if (name === 'main') cb.onMain();
    else if (name === 'secondary') cb.onSecondary();
    else if (name === 'attack') cb.onAttack();
    else cb.onQuick();
  }

  /** Mirror the arc for the Stick: Right setting. */
  setSide(side) {
    if (side === this.side) return;
    this.side = side;
    this.layout();
  }

  /** Show or hide the arc (full panels hide it); hidden buttons ignore touches. */
  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    for (const b of Object.values(this.btn)) {
      for (const o of b.parts) o.setVisible(v && (o !== b.iconA && o !== b.iconB && o !== b.glyph));
      b.hit.input.enabled = v;
      b.down = -1;
      b.shown = '\u0000'; // force an icon redraw when shown again
    }
    if (!v) { this.closePicker(); this.count.setVisible(false); }
  }

  /** Position the four buttons from the safe area and the side. */
  layout() {
    const sa = getSafeArea();
    const W = this.scene.scale.width;
    const H = this.scene.scale.height;
    for (const b of Object.values(this.btn)) {
      b.x = this.side === 'right' ? sa.left + b.off[0] : W - sa.right - b.off[0];
      b.y = H - sa.bottom - b.off[1];
      for (const o of b.parts) o.setPosition(b.x, b.y);
      b.glyph.setPosition(b.x, b.y);
    }
    const q = this.btn.quick;
    this.count.setPosition(q.x + q.size * 0.32, q.y + q.size * 0.3);
    if (this.picker) this.openPicker();
  }

  /** Forget every finger on the buttons (app hidden, a panel opened). */
  releaseAll() {
    for (const b of Object.values(this.btn)) { b.down = -1; b.holding = false; b.longFired = false; }
  }

  /** Centre of a button (game px), for tests and the picker. */
  centre(name) { const b = this.btn[name]; return { x: b.x, y: b.y }; }

  // ------------------------------------------------------------ per-frame

  /**
   * @param {number} dt seconds
   * @param {{main:object|null, secondary:object|null, attack:{icon:string}, quick:{itemId:string|null, icon:string|null, count:number, armed:boolean},
   *   cd:{main:number, secondary:number, attack:number, quick:number}, sleeping:boolean}} v slots as in isoButtons.js, cooldown fractions 0..1
   */
  update(dt, v) {
    if (!this.visible) return;
    const q = this.btn.quick;
    this.drawButton(this.btn.main, dt, v.main, v.cd.main, false);
    this.drawButton(this.btn.secondary, dt, v.secondary, v.cd.secondary, false);
    this.drawButton(this.btn.attack, dt, { icon: v.attack.icon, enabled: !v.sleeping }, v.cd.attack, false);
    const qs = v.quick.icon ? { icon: v.quick.icon, item: v.quick.itemId, enabled: v.quick.count > 0 } : null;
    this.drawButton(q, dt, qs, v.cd.quick, v.quick.armed);
    this.count.setVisible(!!v.quick.itemId).setText(v.quick.itemId ? String(v.quick.count) : '');
    for (const name of NAMES) {
      const b = this.btn[name];
      if (b.down < 0) continue;
      b.heldT += dt;
      if (name === 'quick') {
        if (!b.longFired && b.heldT >= this.cb.longPressSeconds) { b.longFired = true; b.down = -1; this.openPicker(); }
      } else if ((name === 'attack' || (name === 'main' && v.main?.id === 'attack')) && b.heldT >= this.cb.holdSeconds) {
        b.holding = true;
        this.cb.onHold(name);
      }
    }
  }

  plateFrame(b, state) {
    const base = PLATE_FRAME[b.size];
    if (!base) return null;
    const name = state === 'normal' ? base : `${base}_${state}`;
    return hasFrame('button_plates', name) ? frameOf('button_plates', name) : null;
  }

  drawButton(b, dt, slot, cd, armed) {
    const cfg = this.cfg;
    const empty = !slot;
    const disabled = !empty && slot.enabled === false;
    const pressed = b.down >= 0 || armed;
    const state = empty ? 'normal' : disabled ? 'disabled' : pressed ? 'pressed' : 'normal';
    const ic = slot?.icon ?? '';
    const it = slot?.item ?? '';
    if (ic !== b.shown || it !== b.shownItem) { this.swapIcon(b, slot); b.shown = ic; b.shownItem = it; }
    // plate
    const frame = b.plate ? this.plateFrame(b, state) : null;
    if (b.plate && frame != null) { b.plate.setFrame(frame).setVisible(true).setAlpha(empty ? cfg.emptyPlateAlpha : 1); b.fallback.clear(); } else {
      if (b.plate) b.plate.setVisible(false);
      b.fallback.clear();
      b.fallback.fillStyle(hex(cfg.plateColor), empty ? cfg.emptyPlateAlpha : pressed ? cfg.pressedAlpha * 0.6 : cfg.plateAlpha).fillCircle(b.x, b.y, b.size / 2);
      b.fallback.lineStyle(3, hex(cfg.iconColor), 0.2).strokeCircle(b.x, b.y, b.size / 2 - 1);
    }
    // icons: cross-fade over iconSwapFadeSeconds
    const target = empty ? 0 : disabled ? cfg.disabledIconAlpha : pressed ? cfg.pressedAlpha : cfg.iconAlpha;
    if (b.fade < 1) b.fade = Math.min(1, b.fade + dt / Math.max(0.001, cfg.iconSwapFadeSeconds));
    b.iconA.setAlpha(b.fadeOld ? (1 - b.fade) * b.oldAlpha : 0).setVisible(!!b.fadeOld && b.fade < 1);
    b.iconB.setAlpha(b.fade * target).setVisible(!empty);
    b.glyph.setAlpha(b.fade * target);
    b.oldAlpha = target;
    // cooldown sweep
    b.ring.clear();
    if (cd > 0.001) {
      b.ring.lineStyle(5, hex(cfg.iconColor), 0.8).beginPath().arc(b.x, b.y, b.size / 2 - 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * cd, false).strokePath();
    }
  }

  /** The shown icon changed: the old one fades out, the new one fades in. */
  swapIcon(b, slot) {
    // move the current (B) image into A for the fade
    b.iconA.setTexture(b.iconB.texture.key, b.iconB.frame.name).setScale(b.iconB.scaleX);
    b.fadeOld = b.iconB.visible && b.iconB.alpha > 0.01;
    b.fade = 0;
    if (!slot) { b.iconB.setVisible(false); b.glyph.setVisible(false); return; }
    const itemFrame = slot.item && hasFrame('icons', slot.item);
    if (itemFrame) b.iconB.setTexture('icons', frameOf('icons', slot.item)).setScale(ITEM_ICON_SCALE).setVisible(true);
    else if (hasSheet('action_icons') && hasFrame('action_icons', slot.icon)) b.iconB.setTexture('action_icons', frameOf('action_icons', slot.icon)).setScale(ICON_SCALE[b.name]).setVisible(true);
    else { b.iconB.setVisible(false); b.glyph.setText(String(slot.icon).replace(/_/g, ' ').slice(0, 2).toUpperCase()).setVisible(true); return; }
    b.glyph.setVisible(false);
  }

  // ------------------------------------------------------------ picker

  get pickerOpen() { return !!this.picker; }

  /** Open the quick-use picker above the arc: one 96 px cell per carried eligible type plus an empty cell. */
  openPicker() {
    this.closePicker();
    const items = this.cb.pickerItems();
    if (!items.length) { this.cb.onNothing?.(); return; }
    const { scene } = this;
    const q = this.btn.quick;
    const n = items.length;
    const rowW = n * PICK_CELL + (n - 1) * PICK_GAP;
    const W = scene.scale.width;
    const sa = getSafeArea();
    const y = q.y - q.size / 2 - 12 - PICK_CELL / 2;
    // the row ends at the arc's outer edge and grows toward the screen centre
    let x0 = this.side === 'right' ? Math.max(sa.left + 16, q.x - 48) : Math.min(W - sa.right - 16, q.x + 48) - rowW;
    x0 = Math.max(sa.left + 8, Math.min(W - sa.right - 8 - rowW, x0));
    const parts = [];
    items.forEach((it, i) => {
      const cx = x0 + PICK_CELL / 2 + i * (PICK_CELL + PICK_GAP);
      const bg = scene.add.rectangle(cx, y, PICK_CELL, PICK_CELL, hex(this.cfg.plateColor), 0.85).setStrokeStyle(2, hex(this.cfg.iconColor), 0.3).setScrollFactor(0).setDepth(DEPTH.hud + 5).setInteractive().setData('picker', true);
      bg.on('pointerup', () => { playSfx(scene, 'ui_tap', { volume: getBalance().audio?.uiVolume ?? 0.2 }); this.closePicker(); this.cb.onPick(it.id); });
      parts.push(bg);
      if (it.id) {
        const fr = hasFrame('icons', it.id);
        const img = fr ? scene.add.image(cx, y - 8, 'icons', frameOf('icons', it.id)).setScale(ITEM_ICON_SCALE) : label(scene, cx, y - 8, it.id.slice(0, 2), 28, CSS.text, false);
        img.setScrollFactor(0).setDepth(DEPTH.hud + 6).setAlpha(this.cfg.iconAlpha + 0.2);
        const cnt = label(scene, cx + 28, y + 30, String(it.count), 22, CSS.text).setDepth(DEPTH.hud + 7);
        parts.push(img, cnt);
      } else {
        parts.push(scene.add.line(0, 0, cx - 18, y - 18, cx + 18, y + 18, hex(this.cfg.iconColor), 0.6).setOrigin(0).setLineWidth(3).setScrollFactor(0).setDepth(DEPTH.hud + 6));
      }
    });
    this.picker = parts;
  }

  closePicker() {
    if (!this.picker) return;
    for (const o of this.picker) o.destroy();
    this.picker = null;
  }
}
