/**
 * Top-left icon bar (GDD 4 "HUD layout", 8): Home, Bag, Workbench, Survivors, Menu. Icons only: a 72 px
 * plate in a 96 px hit area (ui.topBar.*), offset by the safe area. The moodle column stays top-right.
 * Also owns the Y of the thought / toast line: its bottom edge sits ui.hudTextBottomPx above the safe-area
 * bottom, just above the control band.
 */
import { getSafeArea, onSafeAreaChange } from '../core/safeArea.js';
import { plateButton, uiConfig, DEPTH } from './ui.js';

const FRAMES = { home: 'house', bag: 'bag', workbench: 'hammer', survivors: 'two_heads', menu: 'dots' };

export default class IsoHud {
  /**
   * @param {Phaser.Scene} scene @param {object} balance
   * @param {Record<'home'|'bag'|'workbench'|'survivors'|'menu', Function>} cb tap handlers
   */
  constructor(scene, balance, cb) {
    this.scene = scene;
    this.balance = balance;
    this.order = balance.ui?.topBar?.order ?? ['home', 'bag', 'workbench', 'survivors', 'menu'];
    this.buttons = {};
    this.visible = true;
    for (const id of this.order) {
      const b = plateButton(scene, { icon: FRAMES[id], onTap: () => { if (this.visible) cb[id]?.(); } });
      b.setDepth(DEPTH.hud);
      this.buttons[id] = b;
    }
    this.layout();
    this.offSafe = onSafeAreaChange(() => this.layout());
    scene.events.once('shutdown', () => this.offSafe());
  }

  layout() {
    const sa = getSafeArea();
    const hit = uiConfig().bar.hitAreaPx;
    /** Space kept free at the top for the moodle column. */
    this.topH = sa.top + 100;
    this.order.forEach((id, i) => this.buttons[id].setPosition(sa.left + 16 + hit / 2 + i * hit, sa.top + 16 + hit / 2));
    this.bottomY = this.scene.scale.height - sa.bottom;
  }

  /** Show the pressed look of the Home plate (first tap of the double tap) for `seconds`. */
  pressHome(seconds) {
    this.homeUntil = this.scene.time.now + seconds * 1000;
    this.update();
  }

  /** Per frame: keeps the Home plate pressed while its double-tap window is open. */
  update() {
    const b = this.buttons.home;
    const on = this.scene.time.now < (this.homeUntil ?? 0);
    if (on !== this.homeOn) {
      this.homeOn = on;
      b.img.setAlpha(on ? this.balance.ui.topBar.pressedAlpha : this.balance.ui.topBar.iconAlpha);
    } else if (on) b.img.setAlpha(this.balance.ui.topBar.pressedAlpha);
  }

  /** Hide (and disable) the bar. */
  setVisible(v) { this.visible = v; for (const b of Object.values(this.buttons)) b.setVisible(v); }

  /** Centre Y of a one-line toast: its bottom edge sits `ui.hudTextBottomPx` above the safe-area bottom. */
  get toastY() {
    return this.scene.scale.height - getSafeArea().bottom - (this.balance.ui?.hudTextBottomPx ?? 440) - 32;
  }
}
