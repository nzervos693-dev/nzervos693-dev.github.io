/**
 * Soundscape for the iso world: the shared beds and one-shots of Soundscape, with positional zombie
 * sounds in tiles (GDD 5.17): every living zombie within audio.zombieHearRadiusTiles on the hero's
 * floor shuffles or breathes every audio.zombieSoundGapSeconds, panned by its screen x and muffled
 * (x audio.occludedVolumeMult, slower) when the hero has no line of sight to it. At most
 * audio.maxZombieVoices voices sound at once (breaths, shuffles and aggro groans share the cap).
 * The attack cue (GDD 5.8): the stairwell shuffling and the T-8 / T-5 / T-2.5 bangs are positional at the landing and fall off
 * with the hero's distance in tiles (cue.bangFalloff); fight bangs are the structure hits themselves (IsoAttacks).
 */
import Soundscape from './Soundscape.js';
import { playSfx, playSwell, hasSfx } from './sfx.js';
import { pickAmbient, ambientVolume } from '../gameplay/isoAudio.js';
import { bangFalloff } from '../gameplay/cue.js';
import { arrivalTile } from '../gameplay/isoOffline.js';

/** How long a weather swell plays at most (seconds): GDD 10 gives each ambient one-shot 2-15 s. */
const SWELL_SECONDS = [8, 15];

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

  /** Tiles from the hero to the landing (where the cue is heard from). */
  landingTile() { return (this.landing ??= arrivalTile(this.scene.world)); }

  landingDistance() {
    const h = this.scene.state.hero;
    const l = this.landingTile();
    return Math.hypot(l.x + 0.5 - h.x, l.y + 0.5 - h.y);
  }

  stairLevel() { return super.stairLevel() * bangFalloff(this.landingDistance(), this.scene.balance); }

  /** Cue bang from the stairwell: positional at the landing, quieter with distance. */
  bang(name) {
    const { scene } = this;
    if (!hasSfx(scene, name)) return;
    const v = super.stairLevel() * bangFalloff(this.landingDistance(), scene.balance);
    if (v <= 0) return;
    const h = scene.state.hero;
    const l = this.landingTile();
    const sx = (l.x - l.y) - (h.x - h.y);
    playSfx(scene, name, { volume: v, rate: 0.97 + this.rng() * 0.06, pan: Math.max(-1, Math.min(1, (sx * 48) / scene.balance.audio.panWidthPx)) });
  }

  /** No separate fight bangs: the hits on the structures are the bangs. */
  randomBang() { /* see IsoAttacks.onStructHit */ }

  /** Weather is one-shots now (GDD 10), never looped gusts. */
  updateRain() { /* see ambient() */ }

  updateGust() { /* no looped beds */ }

  /** Nearest window edge to the hero: { dist, sx } (sx = screen-x offset in game px) or null. */
  nearestWindow() {
    const { scene } = this;
    const h = scene.state.hero;
    let best = null;
    for (const w of scene.world.windows) {
      const wx = w.edge.side === 'N' ? w.edge.x + 0.5 : w.edge.x;
      const wy = w.edge.side === 'N' ? w.edge.y : w.edge.y + 0.5;
      const d = Math.hypot(wx - h.x, wy - h.y);
      if (!best || d < best.dist) best = { dist: d, sx: ((wx - wy) - (h.x - h.y)) * 48 };
    }
    return best;
  }

  /**
   * One ambient one-shot (GDD 10): a category by audio.ambientWeights, a random volume in
   * audio.ambientVolumeRange, a random pan; near a window the rain-on-window sound is likelier and plays
   * from the window's direction. Wind and rain swell and fade; nothing loops.
   */
  ambient() {
    const { scene } = this;
    const a = scene.balance.audio;
    const win = this.nearestWindow();
    const near = !!win && win.dist <= a.windowRainTiles;
    const pick = pickAmbient(this.rng, a, { has: (k) => hasSfx(scene, k), last: this.lastAmbientKey, nearWindow: near });
    if (!pick) return;
    this.lastAmbientKey = pick.key;
    const volume = ambientVolume(this.rng, a);
    const fromWindow = pick.key === 'amb_rain' && near;
    const pan = fromWindow ? Math.max(-1, Math.min(1, win.sx / a.panWidthPx)) : (this.rng() * 2 - 1) * 0.6;
    if (pick.category === 'weather') {
      const [lo, hi] = SWELL_SECONDS;
      playSwell(scene, pick.key, { volume, pan, seconds: lo + this.rng() * (hi - lo) });
    } else playSfx(scene, pick.key, { volume, pan, rate: 0.95 + this.rng() * 0.1 });
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
