import { button, label, COLORS, CSS, DEPTH } from './ui.js';

/**
 * Small "You're starving / parched" prompt with an Eat/Drink button, above the bottom bar.
 */
export default class NeedPrompt {
  constructor(scene) { this.scene = scene; this.c = null; this.need = null; }

  get isOpen() { return !!this.c; }

  /**
   * @param {'food'|'water'} need
   * @param {number} y screen y of the prompt centre
   * @param {()=>void} onEat
   */
  show(need, y, onEat) {
    this.hide();
    const { scene } = this;
    const w = scene.scale.width;
    const c = scene.add.container(0, 0).setDepth(DEPTH.hud + 10).setScrollFactor(0);
    const add = (o) => { o.setScrollFactor(0); c.add(o); return o; };
    add(scene.add.rectangle(w / 2, y, w - 48, 120, COLORS.ink, 0.92).setStrokeStyle(3, COLORS.red).setInteractive());
    add(label(scene, 40 + 150, y, need === 'food' ? "You're starving." : "You're parched.", 26, CSS.text));
    add(button(scene, { x: w - 24 - 48 - 104, y, text: need === 'food' ? 'Eat' : 'Drink', size: 24, fill: COLORS.teal, onTap: () => { onEat(); } }));
    add(button(scene, { x: w - 24 - 48, y, text: 'Later', size: 20, onTap: () => this.hide() }));
    this.c = c;
    this.need = need;
  }

  hide() { this.c?.destroy(); this.c = null; this.need = null; }
}
