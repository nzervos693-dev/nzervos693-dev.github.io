/**
 * One-thumb gestures for the iso world (GDD 4): tap, drag to pan, hold (0.4 s) to look. Double tap is
 * detected by the scene from consecutive taps (runPolicy in gameplay/running.js). Phaser pointer events
 * only; the first pointer drives a gesture, others are ignored. A gesture that starts on UI (an object
 * that is interactive and not flagged `dragThrough`) is ignored; one that starts on a dragThrough UI
 * object (the bottom bar background) may pan but never taps.
 */
export default class IsoInput {
  /**
   * @param {Phaser.Scene} scene
   * @param {{controls:object, camera:import('../iso/camera.js').IsoCamera,
   *   canGesture:()=>boolean, onTap:(wx:number,wy:number,sx:number,sy:number)=>void,
   *   onDragStart?:()=>void, onLookStart:()=>void, onLook:(wx:number,wy:number)=>void, onLookEnd:()=>void}} o
   */
  constructor(scene, o) {
    this.scene = scene;
    this.o = o;
    this.thr = o.controls.dragThresholdPx;
    this.holdMs = o.controls.lookHoldSeconds * 1000;
    this.g = null;
    scene.input.on('pointerdown', (p, over) => this.down(p, over));
    scene.input.on('pointermove', (p) => this.move(p));
    scene.input.on('pointerup', (p, over) => this.up(p, over));
    scene.input.on('pointerupoutside', (p) => this.up(p, []));
  }

  /** Is a look (hold) in progress? */
  get looking() { return !!this.g?.hold; }

  /** Abandon the current gesture (panel opened, app hidden). */
  cancel() {
    const g = this.g;
    if (!g) return;
    if (g.moved) this.o.camera.endDrag();
    if (g.hold) this.o.onLookEnd();
    this.g = null;
  }

  down(p, over) {
    if (this.g) return;
    const blocked = over.filter((x) => !x.getData?.('dragThrough')).length > 0;
    if (blocked || !this.o.canGesture()) return;
    this.g = {
      id: p.id, sx: p.x, sy: p.y, lx: p.x, ly: p.y, lt: performance.now(), t0: performance.now(),
      moved: false, hold: false, swallow: over.length > 0, p,
    };
  }

  move(p) {
    const g = this.g;
    if (!g || g.id !== p.id || !p.isDown) return;
    if (!g.moved && !g.hold && Math.hypot(p.x - g.sx, p.y - g.sy) > this.thr) {
      g.moved = true;
      this.o.camera.beginDrag();
      this.o.onDragStart?.();
    }
    if (g.moved) {
      const t = performance.now();
      const dt = Math.max(0.001, (t - g.lt) / 1000);
      this.o.camera.dragBy(p.x - g.lx, p.y - g.ly, dt);
      g.lx = p.x; g.ly = p.y; g.lt = t;
    } else if (g.hold) {
      const cam = this.scene.cameras.main;
      this.o.onLook(p.x + cam.scrollX, p.y + cam.scrollY);
    }
  }

  /** Call every frame: starts the look when the finger has rested for the hold time. */
  update() {
    const g = this.g;
    if (!g || g.moved || g.hold || g.swallow) return;
    if (performance.now() - g.t0 < this.holdMs) return;
    g.hold = true;
    this.o.onLookStart();
    const cam = this.scene.cameras.main;
    this.o.onLook(g.p.x + cam.scrollX, g.p.y + cam.scrollY);
  }

  up(p, over) {
    const g = this.g;
    if (!g || g.id !== p.id) return;
    this.g = null;
    if (g.moved) { this.o.camera.endDrag(); return; }
    if (g.hold) { this.o.onLookEnd(); return; }
    if (g.swallow || over.length) return;
    const cam = this.scene.cameras.main;
    this.o.onTap(p.x + cam.scrollX, p.y + cam.scrollY, p.x, p.y);
  }
}
