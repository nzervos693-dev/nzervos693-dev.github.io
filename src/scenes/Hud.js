/**
 * Bottom bar (Home, Bag, Throw, weapon, Crew, Sound, Store all). There is no top HUD: no bars,
 * numbers or floor text (GDD 8.5); the player's condition is shown by moodles (MoodleView).
 * Everything is pinned to the screen and offset by the safe area.
 */
import { getSafeArea, onSafeAreaChange } from '../core/safeArea.js';
import { button, plateButton, uiConfig, hex, COLORS, DEPTH } from './ui.js';

const WEAPON_ICON = { fists: 'hand', kitchen_knife: 'knife', spiked_bat: 'bat' };

/** Dark, low-contrast bottom bar (GDD 8.5). */
const BAR_ALPHA = 0.35;

export default class Hud {
  /**
   * @param {Phaser.Scene} scene
   * @param {object} balance
   * @param {{onHome:Function,onBag:Function,onStoreAll:Function,onThrow:Function,onCrew?:Function}} cb
   */
  constructor(scene, balance, cb) {
    this.scene = scene;
    this.balance = balance;
    this.cb = cb;
    this.last = {};
    this.items = [];
    this.build();
    this.offSafe = onSafeAreaChange(() => this.layout());
    scene.events.once('shutdown', () => this.offSafe());
  }

  add(o) { o.setScrollFactor?.(0); o.setDepth(DEPTH.hud); this.items.push(o); return o; }

  build() {
    const { scene } = this;
    const w = scene.scale.width;
    this.bottomBg = this.add(scene.add.rectangle(0, 0, w, 10, COLORS.ink, BAR_ALPHA).setOrigin(0).setInteractive().setData('dragThrough', true)); // swallows taps, lets drags scroll
    const tap = (fn) => () => { this.cb.onAnyTap?.(); fn(); };
    // icon plates with no text (hud_icons); Menu holds the sound toggle
    this.homeBtn = this.add(plateButton(scene, { icon: 'house', onTap: tap(() => this.cb.onHome()) }));
    this.bagBtn = this.add(plateButton(scene, { icon: 'bag', onTap: tap(() => this.cb.onBag()) }));
    this.throwBtn = this.add(plateButton(scene, { icon: 'bottle', onTap: tap(() => this.cb.onThrow()) }));
    this.throwBtn.setVisible(false);
    // equipped weapon: tap opens the bag
    this.weaponBtn = this.add(plateButton(scene, { icon: 'hand', onTap: tap(() => this.cb.onBag()) }));
    this.crewBtn = this.add(plateButton(scene, { icon: 'two_heads', onTap: tap(() => this.cb.onCrew?.()) }));
    this.crewBtn.setVisible(false);
    this.menuBtn = this.add(plateButton(scene, { icon: 'dots', onTap: tap(() => this.cb.onMenu?.()) }));
    this.storeBtn = this.add(button(scene, { w: 240, text: 'Store all', onTap: () => { this.cb.onAnyTap?.(); (() => this.cb.onStoreAll())(); }, size: 26, fill: COLORS.teal }));
    this.storeBtn.setVisible(false);
    // buttons were added at the HUD depth; keep their children in order
    this.layout();
  }

  /** Position everything from the current safe area. */
  layout() {
    const sa = getSafeArea();
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const left = 16 + sa.left;
    const right = w - 16 - sa.right;
    /** Space kept free at the top for the moodle column and tutorial bar. */
    this.topH = sa.top + 100;
    const bottomH = 96 + 32 + sa.bottom;
    this.bottomY = h - bottomH;
    this.bottomBg.setPosition(0, this.bottomY).setSize(w, bottomH);
    this.bottomBg.input.hitArea.setSize(w, bottomH);
    const by = this.bottomY + 16 + 48;
    // six 96 px buttons spread evenly across the safe width, gaps of at least 16 px
    const slots = [this.homeBtn, this.bagBtn, this.throwBtn, this.weaponBtn, this.crewBtn, this.menuBtn];
    const gap = Math.max(16, (right - left - slots.length * 96) / (slots.length - 1));
    slots.forEach((b, i) => b.setPosition(left + 48 + i * (96 + gap), by));
    this.storeBtn.setPosition(w / 2, this.bottomY - 64);
    this.last = {};
  }

  /** Y just above the bottom bar (for toasts). */
  get toastY() { return this.bottomY - 200; }

  /**
   * Refresh the Store all, Crew, weapon and Throw buttons.
   * @param {{canStore:boolean,
   *   weapon:{id:string,name:string,uses:number|null}, canThrow:boolean, armed:boolean}} s
   */
  update(s) {
    this.storeBtn.setVisible(s.canStore);
    if (this.last.crew !== !!s.crew) {
      this.last.crew = !!s.crew;
      this.crewBtn.setVisible(!!s.crew);
    }
    this.updateCombat(s);
  }

  /** Equipped weapon icon and the Throw button (only redrawn when they change). */
  updateCombat(s) {
    if (this.last.weapon !== s.weapon.id) {
      this.last.weapon = s.weapon.id;
      this.weaponBtn.setIcon(WEAPON_ICON[s.weapon.id] || 'hand');
    }
    if (this.last.canThrow !== s.canThrow) {
      this.last.canThrow = s.canThrow;
      this.throwBtn.setVisible(s.canThrow);
    }
    if (this.last.armed !== s.armed) {
      this.last.armed = s.armed;
      this.throwBtn.bg.setFillStyle(s.armed ? COLORS.rust : hex(uiConfig().bar.plateColor), s.armed ? 0.9 : uiConfig().bar.plateAlpha);
    }
  }
}
