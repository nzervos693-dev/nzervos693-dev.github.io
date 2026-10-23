/*
 * camera.js - iso camera model (pure, no Phaser): follow with look-ahead,
 * dead zone, drag pan with momentum, bounds clamp, fixed zoom (GDD section 2,
 * controls.*). The scene reads `x`/`y` (view centre in world pixels) each
 * frame and sets its camera scroll to (x - viewW/2, y - viewH/2).
 *
 * Calm follow (Project Zomboid style), all frame-rate independent:
 *  - look-ahead is based on the hero's actual smoothed screen velocity, not
 *    his facing, so turning in place does not move the camera;
 *  - the look-ahead offset eases exponentially AND its speed is capped
 *    (camera.lookAheadMaxPxPerSecond), so a 180 degree turn drifts the view
 *    across over seconds instead of whipping it;
 *  - the view eases to hero + offset with time constant followSmoothSeconds.
 * Exponential smoothing uses k = 1 - exp(-dt / tau).
 */

/** Used when controls.cameraDragFrictionPerSecond is absent from balance. */
export const DEFAULT_DRAG_FRICTION = 5;
/** A finger that stopped moving this long before release leaves no momentum. */
export const STALE_DRAG_SECONDS = 0.08;

/** Defaults for balance `camera.*` keys that are missing (balance.json overrides these). */
export const CAMERA_DEFAULTS = Object.freeze({
  lookAheadPx: 45,
  lookAheadFullSpeedPx: 120,
  lookAheadMinSpeedPx: 25,
  lookAheadSmoothSeconds: 0.7,
  lookAheadMaxPxPerSecond: 40,
  lookAheadReverseRateMult: 4,
  lookAheadMaxAccel: 300,
  velocitySmoothSeconds: 0.3,
  followSmoothSeconds: 0.3,
  softClampStartFrac: 0.4,
  softClampTightness: 0.45,
  teleportSpeedPx: 1500,
});

/**
 * Camera settings from balance (`camera.*` over CAMERA_DEFAULTS, plus controls.*).
 * @param {object} balance
 */
export function cameraConfig(balance) {
  const c = balance.controls;
  const k = { ...CAMERA_DEFAULTS, ...(balance.camera ?? {}) };
  return {
    lookAheadPx: k.lookAheadPx,
    lookAheadFullSpeedPx: k.lookAheadFullSpeedPx,
    lookAheadMinSpeedPx: k.lookAheadMinSpeedPx,
    lookAheadSmoothSeconds: k.lookAheadSmoothSeconds,
    lookAheadMaxPxPerSecond: k.lookAheadMaxPxPerSecond,
    lookAheadReverseRateMult: k.lookAheadReverseRateMult,
    lookAheadMaxAccel: k.lookAheadMaxAccel,
    velocitySmoothSeconds: k.velocitySmoothSeconds,
    followSmoothSeconds: k.followSmoothSeconds,
    softClampStartFrac: k.softClampStartFrac,
    softClampTightness: k.softClampTightness,
    teleportSpeedPx: k.teleportSpeedPx,
    deadzone: c.cameraDeadzonePx,
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

/**
 * Exact discrete step of x' = (T - x) / tau when the target T moves at constant speed vT over dt
 * and ends at tNew. Frame-rate independent.
 */
function ramp(x, tNew, vT, dt, tau) {
  const e = Math.exp(-dt / tau);
  return tNew - vT * tau - (tNew - vT * dt - vT * tau - x) * e;
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
    this.lookVX = 0; // look-ahead offset velocity (px/s)
    this.lookVY = 0;
    this.lookX = 0; // smoothed look-ahead offset (px)
    this.lookY = 0;
    this.velX = 0; // smoothed hero screen velocity (px/s)
    this.velY = 0;
    this._rvx = 0; // raw hero velocity this frame (px/s)
    this._rvy = 0;
    this._prevX = 0;
    this._prevY = 0;
    this._hasPrev = false;
    this.sinceDrag = 0;
  }

  /** Replace the clamp box (floor change). */
  setBounds(b) {
    this.bounds = b;
    this._clamp();
  }

  /** Jump to the hero (floor change, scene start). Look-ahead restarts from zero. */
  snapTo(heroSx, heroSy) {
    this.x = heroSx;
    this.y = heroSy;
    this.vx = this.vy = 0;
    this.lookX = this.lookY = this.velX = this.velY = this.lookVX = this.lookVY = 0;
    this._hasPrev = false;
    this._clamp();
  }

  /** Is follow currently paused (after a drag)? */
  get followPaused() {
    return this.dragging || this.followPause > 0;
  }

  /** Re-enable follow at once (a walk/run tap, Home button). */
  resumeFollow() {
    this.followPause = 0;
    this.vx = this.vy = 0;
    this._hasPrev = false;
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
   */
  update(dt, hero) {
    this.sinceDrag += dt;
    if (this.dragging) { this._hasPrev = false; return; }
    if (this.followPause > 0) {
      this.followPause = Math.max(0, this.followPause - dt);
      this._hasPrev = false;
      this._momentum(dt);
      return;
    }
    this.vx = this.vy = 0;
    if (!hero || !(dt > 0)) return;
    this._trackLook(dt, hero);
    const cfg = this.cfg;
    const hw = cfg.deadzone[0] / 2;
    const hh = cfg.deadzone[1] / 2;
    // The target moves linearly during the frame (hero velocity + look-ahead velocity); the exact
    // first-order response to a ramp keeps the camera velocity steady even when frame times jitter.
    this.x = ramp(this.x, hero.x + this.lookX, this._rvx + this.lookVX, dt, this._followTau(hero.x - this.x, hw));
    this.y = ramp(this.y, hero.y + this.lookY, this._rvy + this.lookVY, dt, this._followTau(hero.y - this.y, hh));
    // Last-resort hard clamp: the hero never leaves the dead-zone rect around the view centre.
    this.x = Math.max(hero.x - hw, Math.min(hero.x + hw, this.x));
    this.y = Math.max(hero.y - hh, Math.min(hero.y + hh, this.y));
    this._clamp();
  }

  /**
   * Follow time constant for one axis. Past softClampStartFrac of the half dead zone it shrinks
   * smoothly (up to softClampTightness) so the camera catches up gradually instead of hitting the hard clamp.
   */
  _followTau(offset, half) {
    const cfg = this.cfg;
    const start = cfg.softClampStartFrac * half;
    const push = Math.min(1, Math.max(0, (Math.abs(offset) - start) / Math.max(1e-6, half - start)));
    return cfg.followSmoothSeconds * (1 - cfg.softClampTightness * push * push);
  }

  /** Update smoothed hero velocity and the rate-limited look-ahead offset (no allocation). */
  _trackLook(dt, hero) {
    const cfg = this.cfg;
    let rvx = 0;
    let rvy = 0;
    if (this._hasPrev) {
      rvx = (hero.x - this._prevX) / dt;
      rvy = (hero.y - this._prevY) / dt;
      if (Math.hypot(rvx, rvy) > cfg.teleportSpeedPx) rvx = rvy = 0; // jump (floor change), not walking
    }
    this._rvx = rvx;
    this._rvy = rvy;
    this._prevX = hero.x;
    this._prevY = hero.y;
    this._hasPrev = true;
    const kv = 1 - Math.exp(-dt / cfg.velocitySmoothSeconds);
    this.velX += (rvx - this.velX) * kv;
    this.velY += (rvy - this.velY) * kv;
    // Look-ahead target: along the velocity, scaled up from 0 at the min speed to full at the full speed.
    const speed = Math.hypot(this.velX, this.velY);
    let tx = 0;
    let ty = 0;
    if (speed > cfg.lookAheadMinSpeedPx) {
      const span = Math.max(1, cfg.lookAheadFullSpeedPx - cfg.lookAheadMinSpeedPx);
      const f = Math.min(1, (speed - cfg.lookAheadMinSpeedPx) / span) * cfg.lookAheadPx / speed;
      tx = this.velX * f;
      ty = this.velY * f;
    }
    // Look-ahead velocity: head for the target at (gap / tau), capped (faster when it opposes the
    // new heading, so a reversal unwinds quickly), and with bounded acceleration (no velocity steps).
    const gx = tx - this.lookX;
    const gy = ty - this.lookY;
    const opposing = this.lookX * this.velX + this.lookY * this.velY < 0;
    const cap = cfg.lookAheadMaxPxPerSecond * (opposing ? cfg.lookAheadReverseRateMult : 1);
    let dvx = gx / cfg.lookAheadSmoothSeconds;
    let dvy = gy / cfg.lookAheadSmoothSeconds;
    const dl = Math.hypot(dvx, dvy);
    if (dl > cap) { dvx *= cap / dl; dvy *= cap / dl; }
    let ax = dvx - this.lookVX;
    let ay = dvy - this.lookVY;
    const maxDv = cfg.lookAheadMaxAccel * dt;
    const al = Math.hypot(ax, ay);
    if (al > maxDv) { ax *= maxDv / al; ay *= maxDv / al; }
    this.lookVX += ax;
    this.lookVY += ay;
    this.lookX += this.lookVX * dt;
    this.lookY += this.lookVY * dt;
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
