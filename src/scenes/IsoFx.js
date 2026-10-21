/**
 * Screen-level iso effects: the edge vignette (GDD 5.18, code generated) and the sound-off ripple arcs
 * for loud sounds the hero cannot see (GDD 5.17). View only; the decision whether a sound ripples is
 * soundRipple() in src/iso/vision.js.
 */
import Phaser from 'phaser';
import { frameOf } from './art.js';
import { angleToGridVec } from '../iso/projection.js';

const S = 3;
const VIGNETTE_W = 144;
const VIGNETTE_H = 256;
const VIGNETTE_DEPTH = 950;

/** Radial vignette from innerRadiusRatio of the half-diagonal out to outerAlpha at the corners. */
export function makeVignette(scene, cfg) {
  const key = 'iso_vignette';
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, VIGNETTE_W, VIGNETTE_H);
  const ctx = tex.getContext();
  const img = ctx.createImageData(VIGNETTE_W, VIGNETTE_H);
  const cx = VIGNETTE_W / 2;
  const cy = VIGNETTE_H / 2;
  const diag = Math.hypot(cx, cy);
  const inner = cfg.innerRadiusRatio;
  for (let y = 0; y < VIGNETTE_H; y++) {
    for (let x = 0; x < VIGNETTE_W; x++) {
      const r = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / diag;
      const t = Math.max(0, Math.min(1, (r - inner) / (1 - inner)));
      const a = cfg.outerAlpha * t * t * (3 - 2 * t); // smoothstep
      const i = (y * VIGNETTE_W + x) * 4;
      img.data[i] = 11; img.data[i + 1] = 12; img.data[i + 2] = 14; img.data[i + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  tex.refresh();
  tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
  const w = scene.scale.width;
  const h = scene.scale.height;
  return scene.add.image(w / 2, h / 2, key).setDisplaySize(w, h).setScrollFactor(0).setDepth(VIGNETTE_DEPTH);
}

export class SoundRipples {
  /**
   * @param {Phaser.Scene} scene @param {object} cfg visionConfig(balance).soundRipple
   */
  constructor(scene, cfg) {
    this.scene = scene;
    this.cfg = cfg;
    this.active = [];
    this.pool = [];
    for (let i = 0; i < (cfg.maxActive ?? 2); i++) {
      this.pool.push(scene.add.image(0, 0, 'iso_fx', frameOf('iso_fx', 'ripple_2')).setScale(S * 1.6).setVisible(false).setDepth(940).setTint(0xa09a8c));
    }
    this.lastBySource = new Map();
    this.clock = 0;
    this.gridVec = { x: 0, y: 0 };
  }

  /**
   * Start a ripple. Ignored inside the per-source cooldown; with all slots busy the oldest is replaced.
   * @param {string} source stable id of the sound source (door id, zombie id)
   * @param {{x:number,y:number}} sourceTile @param {{angle:number, radiusTiles:number, alpha:number}} info from soundRipple()
   */
  trigger(source, sourceTile, info) {
    const last = this.lastBySource.get(source);
    if (last !== undefined && this.clock - last < (this.cfg.sameSourceCooldownSeconds ?? 1.5)) return false;
    this.lastBySource.set(source, this.clock);
    let r;
    if (this.active.length >= this.pool.length) r = this.active.shift();
    else r = { sp: this.pool.find((p) => !this.active.some((a) => a.sp === p)) };
    r.t = 0;
    r.dur = this.cfg.durationSeconds ?? 0.9;
    r.fadeIn = this.cfg.fadeInSeconds ?? 0.15;
    r.info = info;
    r.source = sourceTile;
    r.sp.setVisible(true);
    this.active.push(r);
    return true;
  }

  /**
   * @param {number} dt @param {{x:number,y:number}} heroPos continuous tile position
   * @param {(x:number,y:number)=>boolean} sourceVisible a ripple stops early when its source becomes Visible
   */
  update(dt, heroPos, sourceVisible) {
    this.clock += dt;
    const drift = this.cfg.driftTiles ?? 0.5;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const r = this.active[i];
      r.t += dt;
      if (r.t >= r.dur || sourceVisible(r.source.x, r.source.y)) { r.sp.setVisible(false); this.active.splice(i, 1); continue; }
      const k = r.t / r.dur;
      const a = r.t < r.fadeIn ? r.t / r.fadeIn : 1 - (r.t - r.fadeIn) / (r.dur - r.fadeIn);
      angleToGridVec(r.info.angle, this.gridVec);
      const dist = r.info.radiusTiles + drift * k;
      const gx = heroPos.x + this.gridVec.x * dist;
      const gy = heroPos.y + this.gridVec.y * dist;
      r.sp.setPosition((gx - gy) * 48, (gx + gy) * 24 - 24).setAlpha(Math.max(0, a) * r.info.alpha * 2);
    }
  }

  clear() {
    for (const r of this.active) r.sp.setVisible(false);
    this.active.length = 0;
  }
}
