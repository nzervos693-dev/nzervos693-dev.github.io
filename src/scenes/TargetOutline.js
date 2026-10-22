/**
 * The target outline (GDD 4, 9): a thin dark outline just outside the target sprite's silhouette. Dark
 * (`controls.target.outline.color`), never coloured, no glow or pulse; it only fades in and out
 * (`fadeSeconds`) when the target changes. Zombies use a slightly stronger outline (zombieWidthPx /
 * zombieAlpha).
 *
 * How: the silhouette is stamped at offsets around the sprite (tint-filled with the outline colour) into a
 * small RenderTexture at full alpha, and the texture is shown behind the sprite at the outline alpha, so
 * overlapping stamps never add up. A texture is only redrawn when the sprite's frame or flip changes; it
 * follows the sprite's position every frame. Two slots alternate so the old outline fades out while the new
 * one fades in. Nothing is allocated per frame.
 */
import Phaser from 'phaser';

const SIZE = 256;
const PAD = 8;
const DEPTH_BELOW = 0.0002;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

const hex = (c) => parseInt(String(c).replace('#', ''), 16);

export default class TargetOutline {
  /** @param {Phaser.Scene} scene @param {{color:string, alpha:number, widthPx:number, zombieAlpha:number, zombieWidthPx:number, fadeSeconds:number}} cfg */
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.color = hex(cfg.color);
    this.stamp = new Phaser.GameObjects.Image(scene, 0, 0, '__DEFAULT', 0).setOrigin(0, 0);
    this.slots = [this.makeSlot(), this.makeSlot()];
    this.active = 0;
    this.sprite = null;
  }

  makeSlot() {
    const rt = this.scene.add.renderTexture(0, 0, SIZE, SIZE).setOrigin(0, 0).setAlpha(0).setVisible(false);
    return { rt, sp: null, tex: '', frame: '', flip: false, cur: 0, want: 0, max: 0, width: 3 };
  }

  /**
   * Outline this sprite (or nothing: null). Calling again with the same sprite does nothing.
   * @param {Phaser.GameObjects.Sprite|Phaser.GameObjects.Image|null} sp @param {boolean} zombie stronger outline
   */
  setTarget(sp, zombie = false) {
    if (sp === this.sprite) return;
    this.sprite = sp;
    const old = this.slots[this.active];
    old.want = 0;
    if (!sp) return;
    this.active ^= 1;
    const s = this.slots[this.active];
    s.sp = sp;
    s.tex = '';
    s.cur = 0;
    s.want = 1;
    s.max = zombie ? this.cfg.zombieAlpha : this.cfg.alpha;
    s.width = zombie ? this.cfg.zombieWidthPx : this.cfg.widthPx;
    s.rt.setVisible(true).setAlpha(0);
  }

  /** Hide at once (panel opened, sleeping): fades like a target change. */
  clear() { this.setTarget(null); }

  /** Per frame. */
  update(dt) {
    const rate = dt / Math.max(0.001, this.cfg.fadeSeconds);
    for (const s of this.slots) {
      if (!s.rt.visible) continue;
      const sp = s.sp;
      const alive = sp && sp.active && sp.visible && sp.alpha > 0.02;
      const want = s.want && alive ? 1 : 0;
      s.cur += Math.max(-rate, Math.min(rate, want - s.cur));
      if (s.cur <= 0 && !s.want) { s.rt.setVisible(false); s.sp = null; continue; }
      if (sp && sp.active) this.follow(s, sp);
      s.rt.setAlpha(s.cur * s.max);
    }
  }

  follow(s, sp) {
    const fr = sp.frame;
    const sx = sp.scaleX;
    const sy = sp.scaleY;
    if (s.tex !== sp.texture.key || s.frame !== fr.name || s.flip !== sp.flipX) {
      s.tex = sp.texture.key;
      s.frame = fr.name;
      s.flip = sp.flipX;
      this.draw(s, sp, sx, sy);
    }
    s.rt.setPosition(Math.round(sp.x - sp.originX * fr.width * sx - PAD), Math.round(sp.y - sp.originY * fr.height * sy - PAD));
    s.rt.setDepth(sp.depth - DEPTH_BELOW);
  }

  draw(s, sp, sx, sy) {
    const st = this.stamp;
    st.setTexture(sp.texture.key, sp.frame.name).setScale(sx, sy).setFlipX(sp.flipX).setTintFill(this.color);
    const w = s.width;
    s.rt.clear();
    s.rt.beginDraw();
    for (const r of [w, w / 2]) {
      for (const [dx, dy] of DIRS) s.rt.batchDraw(st, PAD + dx * r, PAD + dy * r);
    }
    s.rt.endDraw();
  }

  destroy() {
    for (const s of this.slots) s.rt.destroy();
    this.stamp.destroy();
  }
}
