/**
 * Top HUD (need bars, floor indicator) and bottom bar (Home, Bag, Sound, Store all).
 * Everything is pinned to the screen and offset by the safe area.
 */
import { getSafeArea, onSafeAreaChange } from '../core/safeArea.js';
import { isMuted, toggleMute, onMuteChange } from '../core/audio.js';
import { NEED_KEYS } from '../gameplay/needs.js';
import { frameOf } from './art.js';
import { button, label, COLORS, CSS, DEPTH } from './ui.js';

const BAR_FRAME = { health: 'bar_health', food: 'bar_food', water: 'bar_water', energy: 'bar_energy', morale: 'bar_morale' };
const BAR_COLOR = { health: 0xc0392b, food: 0xe0a24a, water: 0x4a8fb5, energy: 0xd8d4c8, morale: 0x8a6fb0 };

export default class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} balance
   * @param {{onHome:Function,onBag:Function,onStoreAll:Function}} cb
   */
  constructor(scene, balance, cb) {
    this.scene = scene;
    this.balance = balance;
    this.cb = cb;
    this.bars = {};
    this.last = {};
    this.items = [];
    this.build();
    this.offSafe = onSafeAreaChange(() => this.layout());
    this.offMute = onMuteChange(() => this.updateSound());
    scene.events.once('shutdown', () => { this.offSafe(); this.offMute(); });
  }

  add(o) { o.setScrollFactor?.(0); o.setDepth(DEPTH.hud); this.items.push(o); return o; }

  build() {
    const { scene } = this;
    const w = scene.scale.width;
    this.topBg = this.add(scene.add.rectangle(0, 0, w, 10, COLORS.ink, 0.78).setOrigin(0).setInteractive().setData('dragThrough', true)); // swallows taps, lets drags scroll
    this.bottomBg = this.add(scene.add.rectangle(0, 0, w, 10, COLORS.ink, 0.78).setOrigin(0).setInteractive().setData('dragThrough', true));
    for (const k of NEED_KEYS) {
      const icon = this.add(scene.add.image(0, 0, 'icons', frameOf('icons', BAR_FRAME[k])).setScale(4));
      const back = this.add(scene.add.rectangle(0, 0, 80, 16, COLORS.shadow).setOrigin(0, 0.5).setStrokeStyle(2, COLORS.ink));
      const fill = this.add(scene.add.rectangle(0, 0, 80, 16, BAR_COLOR[k]).setOrigin(0, 0.5));
      this.bars[k] = { icon, back, fill };
    }
    this.floorText = this.add(label(scene, 0, 0, '', 28, CSS.amber).setOrigin(0, 0.5));
    this.hintText = this.add(label(scene, 0, 0, '', 20, CSS.dim).setOrigin(1, 0.5));
    this.homeBtn = this.add(button(scene, { text: 'Home', onTap: () => this.cb.onHome(), size: 22 }));
    this.bagBtn = this.add(button(scene, { text: 'Bag', onTap: () => this.cb.onBag(), size: 22 }));
    this.soundBtn = this.add(button(scene, { text: '', onTap: () => toggleMute(), size: 20 }));
    this.storeBtn = this.add(button(scene, { w: 240, text: 'Store all', onTap: () => this.cb.onStoreAll(), size: 26, fill: COLORS.teal }));
    this.storeBtn.setVisible(false);
    // buttons were added at the HUD depth; keep their children in order
    this.layout();
    this.updateSound();
  }

  /** Position everything from the current safe area. */
  layout() {
    const sa = getSafeArea();
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const left = 16 + sa.left;
    const right = w - 16 - sa.right;
    const colW = (right - left) / NEED_KEYS.length;
    const barY = sa.top + 36;
    NEED_KEYS.forEach((k, i) => {
      const b = this.bars[k];
      const x = left + i * colW;
      b.icon.setPosition(x + 16, barY);
      b.back.setPosition(x + 40, barY).setSize(colW - 52, 16);
      b.fill.setPosition(x + 40, barY);
      b.barW = colW - 52;
    });
    this.topH = sa.top + 100;
    this.topBg.setSize(w, this.topH).input.hitArea.setSize(w, this.topH);
    this.floorText.setPosition(left, sa.top + 78);
    this.hintText.setPosition(right, sa.top + 78);
    const bottomH = 96 + 32 + sa.bottom;
    this.bottomY = h - bottomH;
    this.bottomBg.setPosition(0, this.bottomY).setSize(w, bottomH);
    this.bottomBg.input.hitArea.setSize(w, bottomH);
    const by = this.bottomY + 16 + 48;
    this.homeBtn.setPosition(left + 48 + 8, by);
    this.bagBtn.setPosition(left + 48 + 8 + 120, by);
    this.soundBtn.setPosition(right - 48 - 8, by);
    this.storeBtn.setPosition(w / 2, this.bottomY - 64);
    this.last = {};
  }

  /** Y just above the bottom bar (for toasts). */
  get toastY() { return this.bottomY - 200; }

  updateSound() { this.soundBtn.setLabel(isMuted() ? 'Sound\nOFF' : 'Sound\nON'); }

  /**
   * Refresh bars, floor text and Store all visibility.
   * @param {{needs:object, floor:number, canStore:boolean, hint:string}} s
   */
  update(s) {
    for (const k of NEED_KEYS) {
      const v = Math.round(s.needs[k]);
      if (this.last[k] === v) continue;
      this.last[k] = v;
      const b = this.bars[k];
      b.fill.width = Math.max(0, (b.barW * v) / this.balance.needs.max);
      b.fill.setFillStyle(v < this.balance.needs.onlinePromptThreshold ? COLORS.red : BAR_COLOR[k]);
    }
    if (this.last.floor !== s.floor) {
      this.last.floor = s.floor;
      this.floorText.setText(`FLOOR ${s.floor}`);
    }
    if (this.last.hint !== s.hint) {
      this.last.hint = s.hint;
      this.hintText.setText(s.hint);
    }
    this.storeBtn.setVisible(s.canStore);
  }
}
