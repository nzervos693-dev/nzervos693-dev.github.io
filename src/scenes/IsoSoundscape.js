/**
 * Soundscape for the iso world: the shared beds and one-shots of Soundscape, with positional zombie
 * sounds in tiles (GDD 5.17): every living zombie within audio.zombieHearRadiusTiles on the hero's
 * floor shuffles or breathes every audio.zombieSoundGapSeconds, panned by its screen x and muffled
 * (x audio.occludedVolumeMult, slower) when the hero has no line of sight to it. At most
 * audio.maxZombieVoices voices sound at once (breaths, shuffles and aggro groans share the cap).
 * No stairwell cue (no attacks in Stage A).
 */
import Soundscape from './Soundscape.js';
import { playSfx } from './sfx.js';

/** Seconds between zombie sound checks. */
const ZOMBIE_TICK = 0.5;
/** playSfx multiplies this by the sound's manifest volume (0.3 for breaths): 1.6 -> about 0.5 at point blank. */
const VOICE_GAIN_NEAR = 1.6;
/** Gain at the edge of the hearing radius (never silent inside it). */
const VOICE_GAIN_FAR = 0.35;
/** How long one voice counts against audio.maxZombieVoices. */
const VOICE_SECONDS = 1.5;
/** Rate of a muffled voice (a lower pitch reads as "through a wall"). */
const MUFFLED_RATE = 0.85;

export default class IsoSoundscape extends Soundscape {
  constructor(scene) {
    super(scene);
    this.cand = [];
    this.voices = [];
  }

  cameraFloor() { return this.scene.state.hero.floor; }

  updateStair() { /* no attacks in Stage A */ }

  updateRain(dt) {
    this.updateGust('amb_rain', dt, this.gustCfg.rain, this.scene.heroInCorridor() ? 0.3 : 1);
  }

  /** Is there a free zombie voice slot right now? */
  voiceFree() {
    const t = this.scene.time.now;
    let n = 0;
    for (let i = 0; i < this.voices.length; i++) if (this.voices[i] > t) this.voices[n++] = this.voices[i];
    this.voices.length = n;
    return n < this.scene.balance.audio.maxZombieVoices;
  }

  /**
   * Play one zombie sound with distance falloff, pan from its screen x and muffling without line of sight.
   * @returns {boolean} played (false when out of range or all voice slots are busy)
   */
  zombieVoice(rt, key, extra = 1) {
    const { scene } = this;
    const a = scene.balance.audio;
    const h = scene.state.hero;
    const dist = Math.hypot(rt.rec.x - h.x, rt.rec.y - h.y);
    if (dist > a.zombieHearRadiusTiles || !this.voiceFree()) return false;
    const los = scene.world.grid.hasLOS(Math.floor(h.x), Math.floor(h.y), Math.floor(rt.rec.x), Math.floor(rt.rec.y));
    const fall = 1 - Math.max(0, dist - a.fullVolumeTiles) / (a.zombieHearRadiusTiles - a.fullVolumeTiles);
    const gain = (VOICE_GAIN_FAR + (VOICE_GAIN_NEAR - VOICE_GAIN_FAR) * Math.min(1, fall)) * (los ? 1 : a.occludedVolumeMult) * extra;
    const sx = (rt.rec.x - rt.rec.y) - (h.x - h.y);
    this.voices.push(scene.time.now + VOICE_SECONDS * 1000);
    playSfx(scene, key, {
      volume: gain,
      pan: Math.max(-1, Math.min(1, (sx * 48) / a.panWidthPx)),
      rate: (los ? 1 : MUFFLED_RATE) * (0.95 + this.rng() * 0.1),
    });
    return true;
  }

  zombieSounds() {
    const { scene } = this;
    if (scene.dead) return;
    const a = scene.balance.audio;
    const h = scene.state.hero;
    const cand = this.cand;
    cand.length = 0;
    const list = scene.zombies.list;
    for (let i = 0; i < list.length; i++) {
      const rt = list[i];
      if (rt.dying) continue;
      const d = Math.hypot(rt.rec.x - h.x, rt.rec.y - h.y);
      if (d > a.zombieHearRadiusTiles) continue;
      rt.ai.sndT -= ZOMBIE_TICK;
      if (rt.ai.sndT > 0) continue;
      rt.ai.sndT = a.zombieSoundGapSeconds[0] + this.rng() * (a.zombieSoundGapSeconds[1] - a.zombieSoundGapSeconds[0]);
      rt.sndDist = d;
      cand.push(rt);
    }
    cand.sort((p, q) => p.sndDist - q.sndDist); // nearest first
    for (let i = 0; i < cand.length; i++) {
      const rt = cand[i];
      const key = rt.ai.moving ? 'zombie_shuffle' : (this.rng() < 0.5 ? 'zombie_breath_1' : 'zombie_breath_2');
      if (!this.zombieVoice(rt, key)) break;
    }
  }
}
