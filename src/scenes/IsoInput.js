/**
 * Touch input for the iso world (GDD 4): the floating virtual joystick only. The world itself takes no
 * touches (no taps, no drags); action buttons, the top bar, moodles and panels are interactive objects of
 * their own. Phaser pointer events; pointers are tracked by id so the stick finger and a button finger
 * coexist.
 *
 * - A touch that goes down in the stick zone (lower-left, mirrored for Stick: Right) and not on UI is the
 *   STICK finger. It reports a screen-space vector (readStick).
 * - A touch released within tapMaxSeconds that never left the dead zone is a tap; two such taps close
 *   together (DoubleTapDetector) are a double tap = turn around (onDoubleTap).
 */
import { inStickZone, readStick, DoubleTapDetector } from '../gameplay/isoStick.js';

export default class IsoInput {
  /**
   * @param {Phaser.Scene} scene
   * @param {{stick:object, bottomLimit:()=>number, side:()=>'left'|'right', canGesture:()=>boolean,
   *   onStick:(v:object, s:object, first:boolean)=>void, onStickEnd:()=>void, onDoubleTap:()=>void}} o
   */
  constructor(scene, o) {
    this.scene = scene;
    this.o = o;
    this.cfg = o.stick;
    this.s = null; // stick finger
    this.taps = new DoubleTapDetector(this.cfg);
    this.vec = readStick(this.cfg, 0, 0);
    scene.input.on('pointerdown', (p, over) => this.down(p, over));
    scene.input.on('pointermove', (p) => this.move(p));
    scene.input.on('pointerup', (p) => this.up(p));
    scene.input.on('pointerupoutside', (p) => this.up(p));
  }

  /** Is the stick finger down? */
  get sticking() { return !!this.s; }

  /** Abandon every gesture (panel opened, app hidden). */
  cancel() {
    this.taps.reset();
    this.endStick();
  }

  endStick() {
    if (!this.s) return;
    this.s = null;
    this.o.onStickEnd();
  }

  down(p, over) {
    if (over.length || !this.o.canGesture() || this.s) return; // UI always wins over the stick zone
    const { width, height } = this.scene.scale;
    if (!inStickZone(this.cfg, p.x, p.y, width, height, this.o.bottomLimit(), this.o.side())) return;
    this.s = { id: p.id, ox: p.x, oy: p.y, travel: 0 };
    this.taps.down(performance.now() / 1000, p.x, p.y);
    readStick(this.cfg, 0, 0, this.vec);
    this.o.onStick(this.vec, this.s, true);
  }

  move(p) {
    const s = this.s;
    if (!p.isDown || !s || s.id !== p.id) return;
    s.travel = Math.max(s.travel, Math.hypot(p.x - s.ox, p.y - s.oy));
    readStick(this.cfg, p.x - s.ox, p.y - s.oy, this.vec);
    this.o.onStick(this.vec, s, false);
  }

  /** Call every frame: drops the stick when a panel opens. */
  update() {
    if (this.s && !this.o.canGesture()) this.cancel();
  }

  up(p) {
    const s = this.s;
    if (!s || s.id !== p.id) return;
    const left = s.travel > this.cfg.deadZone * this.cfg.radiusPx;
    this.endStick();
    if (this.taps.up(performance.now() / 1000, left) === 'double') this.o.onDoubleTap();
  }
}
