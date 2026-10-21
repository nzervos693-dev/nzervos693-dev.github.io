/**
 * Soundscape for the iso world: the shared beds and one-shots of Soundscape, with positional zombie
 * sounds in tiles (GDD 5.17): every living zombie within audio.zombieHearRadiusTiles on the hero's
 * floor shuffles or breathes every audio.zombieSoundGapSeconds, panned by its screen x and muffled
 * (quieter and slower, x audio.occludedVolumeMult) when the hero has no line of sight to it. At most
 * audio.maxZombieVoices voices per check, nearest first. No stairwell cue (no attacks in Stage A).
 */
import Soundscape from './Soundscape.js';
import { playSfx, setLoopVolume } from './sfx.js';

const ZOMBIE_MAX_VOLUME = 0.3;

export default class IsoSoundscape extends Soundscape {
  constructor(scene) {
    super(scene);
    this.cand = [];
  }

  cameraFloor() { return this.scene.state.hero.floor; }

  updateStair() { /* no attacks in Stage A */ }

  updateRain(dt) {
    const target = this.scene.heroInCorridor() ? 0.12 : 0.5;
    this.rain += Math.max(-dt * 0.3, Math.min(dt * 0.3, target - this.rain));
    setLoopVolume('amb_rain', this.rain);
  }

  zombieSounds() {
    const { scene } = this;
    if (scene.dead) return;
    const a = scene.balance.audio;
    const h = scene.state.hero;
    const radius = a.zombieHearRadiusTiles;
    const cand = this.cand;
    cand.length = 0;
    const list = scene.zombies.list;
    for (let i = 0; i < list.length; i++) {
      const rt = list[i];
      if (rt.dying) continue;
      const d = Math.hypot(rt.rec.x - h.x, rt.rec.y - h.y);
      if (d > radius) continue;
      rt.ai.sndT -= 0.5;
      if (rt.ai.sndT > 0) continue;
      rt.ai.sndT = a.zombieSoundGapSeconds[0] + this.rng() * (a.zombieSoundGapSeconds[1] - a.zombieSoundGapSeconds[0]);
      rt.sndDist = d;
      cand.push(rt);
    }
    cand.sort((p, q) => p.sndDist - q.sndDist);
    const n = Math.min(cand.length, a.maxZombieVoices);
    for (let i = 0; i < n; i++) {
      const rt = cand[i];
      const los = scene.world.grid.hasLOS(Math.floor(h.x), Math.floor(h.y), Math.floor(rt.rec.x), Math.floor(rt.rec.y));
      const fall = 1 - Math.max(0, rt.sndDist - a.fullVolumeTiles) / (radius - a.fullVolumeTiles);
      const sx = (rt.rec.x - rt.rec.y) - (h.x - h.y); // screen x offset in tiles * 48 px
      const key = rt.ai.moving ? 'zombie_shuffle' : (this.rng() < 0.5 ? 'zombie_breath_1' : 'zombie_breath_2');
      playSfx(scene, key, {
        volume: ZOMBIE_MAX_VOLUME * fall * (los ? 1 : a.occludedVolumeMult),
        pan: Math.max(-1, Math.min(1, (sx * 48) / a.panWidthPx)),
        rate: (los ? 1 : 0.85) * (0.95 + this.rng() * 0.1),
      });
    }
  }
}
