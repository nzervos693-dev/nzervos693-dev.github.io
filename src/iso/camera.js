/*
 * camera.js - iso camera model (pure, no Phaser): follow with look-ahead,
 * dead zone, drag pan with momentum, bounds clamp, fixed zoom (GDD section 2,
 * controls.*). The scene reads `x`/`y` (view centre in world pixels) each
 * frame and sets its camera scroll to (x - viewW/2, y - viewH/2).
 *
 * Frame-rate independence: lerp 0.12 per 60 Hz frame is converted to
 * 1 - (1 - 0.12)^(dt * 60) so 30/60/120 fps give the same feel.
 */
import { angleToScreenVec } from './projection.js';

/** Used when controls.cameraDragFrictionPerSecond is absent from balance. */
export const DEFAULT_DRAG_FRICTION = 5;
/** A finger that stopped moving this long before release leaves no momentum. */
export const STALE_DRAG_SECONDS = 0.08;

/**
 * Camera settings from balance (controls.cameraDragFrictionPerSecond if present).
 * @param {object} balance
 */
export function cameraConfig(balance) {
  const c = balance.controls;
  return {
    lookAheadPx: c.cameraLookAheadPx,
    deadzone: c.cameraDeadzonePx,
    lerp: c.cameraLerp,
    edgePad: c.cameraIsoEdgePadPx,
    followPauseSeconds: c.cameraFollowPauseSeconds,
    zoom: c.zoom.default,
    friction: c.cameraDragFrictionPerSecond ?? DEFAULT_DRAG_FRICTION,
    staleDragSeconds: STALE_DRAG_SECONDS,
  };
}

/**
 * Iso bounding box of a floor in world pixels, padded.
 * @param {{halfW:number,halfH:number}} iso projection cfg
 * @returns {{minX:number,maxX:number,minY:number,maxY:number}}
 */
export function floorBounds(iso, widthTiles, heightTiles, pad) {
  return {
    minX: -heightTiles * iso.halfW - pad,
    maxX: widthTiles * iso.halfW + pad,
    minY: -pad,
    maxY: (widthTiles + heightTiles) * iso.halfH + pad,
  };
}

export class IsoCamera {
  /**
   * @param {ReturnType<typeof cameraConfig>} cfg
   * @param {object} iso projection config (isoConfig)
   * @param {{minX:number,maxX:number,minY:number,maxY:number}} bounds clamp box for the view CENTRE
   */
  constructor(cfg, iso, bounds) {
    this.cfg = cfg;
    this.iso = iso;
    this.bounds = bounds;
    this.x = 0;
    this.y = 0;
    this.zoom = cfg.zoom; // fixed 1.0 (CD decision); no setter on purpose
    this.vx = 0;
    this.vy = 0;
    this.dragging = false;
    this.followPause = 0;
    this._dir = { x: 0, y: 0 };
    this._t = { x: 0, y: 0 };
    this.sinceDrag = 0;
  }

  /** Replace the clamp box (floor change). */
  setBounds(b) {
    this.bounds = b;
    this._clamp();
  }

  /** Jump to the hero (floor change, scene start). */
  snapTo(heroSx, heroSy, facingAngle = null) {
    const t = this._target(heroSx, heroSy, facingAngle);
    this.x = t.x;
    this.y = t.y;
    this.vx = this.vy = 0;
    this._clamp();
  }

  /** Point the camera aims at (scratch object, valid until the next call): hero position plus look-ahead. */
  _target(heroSx, heroSy, facingAngle) {
    const t = this._t;
    if (facingAngle === null) { t.x = heroSx; t.y = heroSy; return t; }
    const v = angleToScreenVec(this.iso, facingAngle, this._dir);
    t.x = heroSx + v.x * this.cfg.lookAheadPx;
    t.y = heroSy + v.y * this.cfg.lookAheadPx;
    return t;
  }

  /** Is follow currently paused (after a drag)? */
  get followPaused() {
    return this.dragging || this.followPause > 0;
  }

  /** Re-enable follow at once (a walk/run tap, Home button). */
  resumeFollow() {
    this.followPause = 0;
    this.vx = this.vy = 0;
  }

  /** Finger went down and moved past the drag threshold. */
  beginDrag() {
    this.dragging = true;
    this.vx = this.vy = 0;
  }

  /**
   * Pan by a finger delta in screen px (the world follows the finger, so the
   * camera moves the opposite way). Pass dt (s) to estimate release momentum.
   */
  dragBy(dsx, dsy, dt = 0) {
    this.x -= dsx / this.zoom;
    this.y -= dsy / this.zoom;
    this.sinceDrag = 0;
    if (dt > 0) {
      this.vx = -dsx / dt / this.zoom;
      this.vy = -dsy / dt / this.zoom;
    }
    this._clamp();
  }

  /** Finger lifted: momentum continues, follow pauses for followPauseSeconds. */
  endDrag() {
    this.dragging = false;
    if (this.sinceDrag > this.cfg.staleDragSeconds) this.vx = this.vy = 0;
    this.followPause = this.cfg.followPauseSeconds;
  }

  /**
   * Advance one frame.
   * @param {number} dt seconds
   * @param {{x:number,y:number}|null} hero hero screen position (null = no follow)
   * @param {number|null} facingAngle hero facing, grid degrees (look-ahead)
   */
  update(dt, hero, facingAngle = null) {
    this.sinceDrag += dt;
    if (this.dragging) return;
    if (this.followPause > 0) {
      this.followPause = Math.max(0, this.followPause - dt);
      this._momentum(dt);
      return;
    }
    this.vx = this.vy = 0;
    if (!hero) return;
    const t = this._target(hero.x, hero.y, facingAngle);
    // Always ease toward the look-ahead target (frame-rate independent), then
    // hard-clamp so the hero never leaves the dead-zone rect around the view
    // centre; the look-ahead therefore really shifts the view toward his facing.
    const k = 1 - Math.pow(1 - this.cfg.lerp, dt * 60);
    this.x += (t.x - this.x) * k;
    this.y += (t.y - this.y) * k;
    const hw = this.cfg.deadzone[0] / 2;
    const hh = this.cfg.deadzone[1] / 2;
    this.x = Math.max(hero.x - hw, Math.min(hero.x + hw, this.x));
    this.y = Math.max(hero.y - hh, Math.min(hero.y + hh, this.y));
    this._clamp();
  }

  _momentum(dt) {
    if (this.vx === 0 && this.vy === 0) return;
    const f = this.cfg.friction;
    const decay = Math.exp(-f * dt);
    const travel = (1 - decay) / f; // exact integral of v0 * e^(-f t)
    this.x += this.vx * travel;
    this.y += this.vy * travel;
    this.vx *= decay;
    this.vy *= decay;
    if (Math.abs(this.vx) < 1 && Math.abs(this.vy) < 1) this.vx = this.vy = 0;
    this._clamp();
  }

  _clamp() {
    const b = this.bounds;
    this.x = Math.max(b.minX, Math.min(b.maxX, this.x));
    this.y = Math.max(b.minY, Math.min(b.maxY, this.y));
  }

  /** World px to viewport px. */
  worldToView(wx, wy, viewW, viewH, out = { x: 0, y: 0 }) {
    out.x = (wx - this.x) * this.zoom + viewW / 2;
    out.y = (wy - this.y) * this.zoom + viewH / 2;
    return out;
  }

  /** Viewport px (a tap) to world px. */
  viewToWorld(vx, vy, viewW, viewH, out = { x: 0, y: 0 }) {
    out.x = (vx - viewW / 2) / this.zoom + this.x;
    out.y = (vy - viewH / 2) / this.zoom + this.y;
    return out;
  }
}
