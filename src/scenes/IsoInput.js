/**
 * Touch input for the iso world (GDD 4): a floating virtual joystick, look-by-drag and taps. Phaser
 * pointer events only; pointers are tracked by id so the stick finger and a second finger coexist.
 *
 * - A touch that goes down in the stick zone (lower-left, above the bottom bar) is the STICK finger. It
 *   reports a screen-space vector (readStick); a touch that never leaves the dead zone is a tap on release.
 * - Any other touch is a GESTURE finger: a quick tap acts (onTap); a drag past the threshold is a look
 *   (onLookStart / onLook(dsx,dsy) / onLookEnd), never while the stick is held.
 * A touch that starts on UI (an interactive object not flagged `dragThrough`) is ignored.
 */
import { inStickZone, readStick } from '../gameplay/isoStick.js';

export default class IsoInput {
  /**
   * @param {Phaser.Scene} scene
   * @param {{controls:object, stick:object, bottomLimit:()=>number, side:()=>'left'|'right', canGesture:()=>boolean,
   *   onTap:(wx:number,wy:number,sx:number,sy:number)=>void,
   *   onStick:(s:object)=>void, onStickEnd:()=>void,
   *   onLookStart:()=>void, onLook:(wx:number,wy:number)=>void, onLookEnd:()=>void}} o
   */
  constructor(scene, o) {
    this.scene = scene;
    this.o = o;
    this.thr = o.controls.dragThresholdPx;
    this.cfg = o.stick;
    this.g = null; // tap / look gesture
    this.s = null; // stick finger
    this.vec = readStick(this.cfg, 0, 0);
    scene.input.on('pointerdown', (p, over) => this.down(p, over));
    scene.input.on('pointermove', (p) => this.move(p));
    scene.input.on('pointerup', (p, over) => this.up(p, over));
    scene.input.on('pointerupoutside', (p) => this.up(p, []));
  }

  /** Is a look drag in progress? */
  get looking() { return !!this.g?.look; }

  /** Is the stick finger down? */
  get sticking() { return !!this.s; }

  /** Abandon every gesture (panel opened, app hidden). */
  cancel() {
    if (this.g?.look) this.o.onLookEnd();
    this.g = null;
    this.endStick();
  }

  endStick() {
    if (!this.s) return;
    this.s = null;
    this.o.onStickEnd();
  }

  down(p, over) {
    const blocked = over.some((x) => !x.getData?.('dragThrough'));
    if (blocked || !this.o.canGesture()) return;
    const { width, height } = this.scene.scale;
    if (!this.s && inStickZone(this.cfg, p.x, p.y, width, height, this.o.bottomLimit(), this.o.side())) {
      this.s = { id: p.id, ox: p.x, oy: p.y, t0: performance.now(), travel: 0 };
      if (this.g?.look) { this.o.onLookEnd(); this.g = null; }
      readStick(this.cfg, 0, 0, this.vec);
      this.o.onStick(this.vec, this.s, true);
      return;
    }
    if (this.g || over.length) return; // one gesture finger; the bottom bar swallows taps
    this.g = { id: p.id, sx: p.x, sy: p.y, look: false };
  }

  move(p) {
    if (!p.isDown) return;
    const s = this.s;
    if (s && s.id === p.id) {
      s.travel = Math.max(s.travel, Math.hypot(p.x - s.ox, p.y - s.oy));
      readStick(this.cfg, p.x - s.ox, p.y - s.oy, this.vec);
      this.o.onStick(this.vec, s, false);
      return;
    }
    const g = this.g;
    if (!g || g.id !== p.id) return;
    const dx = p.x - g.sx;
    const dy = p.y - g.sy;
    if (!g.look && !this.s && Math.hypot(dx, dy) > this.thr) {
      g.look = true;
      this.o.onLookStart();
    }
    if (g.look) { const cam = this.scene.cameras.main; this.o.onLook(p.x + cam.scrollX, p.y + cam.scrollY); }
  }

  /** Call every frame: drops gestures when a panel opens. */
  update() {
    if ((this.g || this.s) && !this.o.canGesture()) this.cancel();
  }

  up(p, over) {
    const s = this.s;
    if (s && s.id === p.id) {
      // a touch that never left the dead zone is a tap, however long it lasted
      const quick = s.travel <= this.cfg.deadZone * this.cfg.radiusPx;
      this.endStick();
      if (quick && !over.some((x) => !x.getData?.('dragThrough'))) {
        const cam = this.scene.cameras.main;
        this.o.onTap(p.x + cam.scrollX, p.y + cam.scrollY, p.x, p.y);
      }
      return;
    }
    const g = this.g;
    if (!g || g.id !== p.id) return;
    this.g = null;
    if (g.look) { this.o.onLookEnd(); return; }
    if (over.length) return;
    const cam = this.scene.cameras.main;
    this.o.onTap(p.x + cam.scrollX, p.y + cam.scrollY, p.x, p.y);
  }
}
