import { button, label, CSS, DEPTH } from './ui.js';
import { hasFrame } from './art.js';

/**
 * Up to two 96x96 buttons above (or below) an object, in tower space.
 * Disabled buttons are greyed with the reason shown under them.
 */
export default class ActionMenu {
  constructor(scene) {
    this.scene = scene;
    this.c = null;
  }

  get isOpen() { return !!this.c; }

  /**
   * @param {{x:number, topY:number, bottomY:number, screenTop:number, screenBottom:number}} anchor world coords of the object
   * @param {{kind:string,label:string,enabled:boolean,reason?:string}[]} actions
   * @param {(kind:string)=>void} onPick
   */
  open(anchor, actions, onPick) {
    this.close();
    const { scene } = this;
    const gap = 8;
    const total = actions.length * 96 + (actions.length - 1) * gap;
    const w = scene.scale.width;
    const sx = scene.cameras.main.scrollX; // the anchor is in tower space; keep the menu inside the visible screen
    const cx = Math.max(sx + total / 2 + 12, Math.min(sx + w - total / 2 - 12, anchor.x));
    const above = anchor.topY - 56 - 6 > anchor.screenTop;
    let cy = above ? anchor.topY - 56 : anchor.bottomY + 56;
    // keep the whole menu (with its reason text) above the bottom bar
    cy = Math.min(cy, (anchor.screenBottom ?? Infinity) - 56 - 30);
    const c = scene.add.container(0, 0).setDepth(DEPTH.menu);
    // every button greyed for the same reason (a padlocked cage without a crowbar): say it once under the row (BUG-040)
    const reasons = actions.filter((a) => !a.enabled && a.reason).map((a) => a.reason);
    const shared = actions.length > 1 && reasons.length === actions.length && reasons.every((r) => r === reasons[0]) ? reasons[0] : null;
    actions.forEach((a, i) => {
      const x = cx - total / 2 + 48 + i * (96 + gap);
      const b = button(scene, {
        x, y: cy, text: a.label, fixed: false, size: 16,
        frame: hasFrame('buttons', a.kind === 'take' ? 'search' : a.kind) ? { key: 'buttons', name: a.kind === 'take' ? 'search' : a.kind } : undefined,
        onTap: () => { this.close(); onPick(a.kind); },
      });
      b.setEnabled(a.enabled);
      c.add(b);
      if (!a.enabled && a.reason && !shared) {
        const reason = label(scene, x, cy + 66, a.reason, 16, CSS.red, false).setStroke('#0d0f12', 4);
        reason.x = Math.max(sx + reason.width / 2 + 8, Math.min(sx + w - reason.width / 2 - 8, x)); // keep the text on screen
        c.add(reason);
      }
    });
    if (shared) {
      const reason = label(scene, cx, cy + 66, shared, 16, CSS.red, false).setStroke('#0d0f12', 4);
      reason.x = Math.max(sx + reason.width / 2 + 8, Math.min(sx + w - reason.width / 2 - 8, cx));
      c.add(reason);
    }
    this.c = c;
  }

  close() {
    this.c?.destroy();
    this.c = null;
  }
}
