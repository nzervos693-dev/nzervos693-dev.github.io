/*
 * clock.js - real-clock time source for offline progress.
 *
 *   now()                           // Date.now(), the one place to mock
 *   elapsedSince(last, now, capMs)  // pure: ms elapsed, >= 0, <= capMs
 *   offlineElapsed()                // ms since the saved lastSaveTime, capped by balance
 *   offlineInfo()                   // { elapsedMs, rawMs, capped } for UI ("you were away 12h+")
 *
 * A backwards clock (last > now) or a never-saved game (last <= 0) gives 0.
 * Time beyond the cap is lost by design (GDD section 5).
 */
import { getSave } from './save.js';
import { offlineCapMs } from './balance.js';

export const now = () => Date.now();

export function elapsedInfo(last, nowMs, capMs) {
  if (!Number.isFinite(last) || !Number.isFinite(nowMs) || last <= 0) {
    return { elapsedMs: 0, rawMs: 0, capped: false };
  }
  const rawMs = Math.max(0, nowMs - last);
  const elapsedMs = Math.min(rawMs, capMs);
  return { elapsedMs, rawMs, capped: rawMs > capMs };
}

export const elapsedSince = (last, nowMs, capMs) => elapsedInfo(last, nowMs, capMs).elapsedMs;

export const offlineInfo = (nowMs = now()) =>
  elapsedInfo(getSave().lastSaveTime, nowMs, offlineCapMs());

export const offlineElapsed = (nowMs = now()) => offlineInfo(nowMs).elapsedMs;
