/**
 * The quiet soundscape (GDD 10): wind and room tone beds, random one-shots, distant groans,
 * low-health heartbeat, sparse sad music, and the attack cue sounds. Scheduling rules live in
 * gameplay/soundscape.js and gameplay/cue.js. Everything is silent until the first tap and any
 * missing sound file is skipped.
 */
import { isAudioUnlocked } from '../core/audio.js';
import { nextGroanGap, nextAmbientGap, pickNoRepeat, musicAllowed, musicCooldownMs, randBetween } from '../gameplay/soundscape.js';
import { stairVolume, cueConfig } from '../gameplay/cue.js';
import { floorAtY } from '../gameplay/layout.js';
import { roomRefAt } from '../gameplay/zombies.js';
import { playSfx, stopSfx, setLoopVolume, hasSfx } from './sfx.js';

const AMBIENT = ['creak_1', 'creak_2', 'creak_3', 'muffled_thud_1', 'muffled_thud_2', 'glass_tinkle', 'pipe_knock_1', 'pipe_knock_2'];
const GROANS = ['distant_groan_1', 'distant_groan_2', 'distant_groan_3', 'distant_groan_4'];
const BANGS = ['stair_bang_1', 'stair_bang_2', 'stair_bang_3'];
const MUSIC = ['music_sad_1', 'music_sad_2', 'music_sad_3'];
const ZOMBIE_TICK = 0.5; // seconds between zombie sound checks
const ZOMBIE_MAX_VOLUME = 0.25;
const MUSIC_RETRY_MS = 60000; // after an attack: wait up to a minute for the danger to pass
const RAIN_ROOM = 0.5; // amb_rain level inside the rooms (they have windows); the landing is dry
const RAIN_LANDING = 0.12;
const SHUFFLE_FADE_SECONDS = 1.5;
const SHUFFLE_VOLUME = 0.67;
const WIND_INDOORS = 0.4;

export default class Soundscape {
  /** @param {import('./GameScene.js').default} scene */
  constructor(scene) {
    this.scene = scene;
    this.rng = scene.rng;
    this.bedsOn = false;
    this.groanT = nextGroanGap(this.rng, scene.balance);
    this.ambientT = nextAmbientGap(this.rng, scene.balance);
    this.lastAmbient = -1;
    this.lastGroan = -1;
    this.musicAt = null;
    this.musicCooldown = musicCooldownMs(this.rng, scene.balance);
    this.lastMusic = -1;
    this.stair = { on: false, vol: 0, bangT: 0 };
    this.zombieT = 0;
    this.heartbeatOn = false;
    this.musicWantUntil = 0;
    this.rain = 0;
  }

  /** Floor under the middle of the screen (where the player is looking). */
  cameraFloor() {
    const cam = this.scene.cameras.main;
    return floorAtY(this.scene.tower, cam.scrollY + cam.height / 2) ?? this.scene.state.hero.floor;
  }

  /** Play a random sound from a list without repeating the last one; pan/rate vary a little. */
  oneShot(list, which, volume = 1, wide = true) {
    const live = list.filter((k) => hasSfx(this.scene, k));
    if (!live.length) return;
    const i = pickNoRepeat(this.rng, live.length, this[which]);
    this[which] = i;
    playSfx(this.scene, live[i], {
      volume, rate: 0.95 + this.rng() * 0.1, pan: wide ? (this.rng() * 2 - 1) * 0.6 : 0,
    });
  }

  /** A distant groan (random, and also the first beats of the attack cue). */
  groan() { this.oneShot(GROANS, 'lastGroan'); }

  /** Per frame. @param {boolean} danger something is hunting the hero @param {number} nowMs epoch ms */
  update(dt, danger = false, nowMs = 0) {
    if (!isAudioUnlocked() || this.scene.gameOver) return;
    if (!this.bedsOn) {
      this.bedsOn = true;
      playSfx(this.scene, 'amb_room_tone', { loop: true });
      playSfx(this.scene, 'amb_wind', { loop: true });
      setLoopVolume('amb_wind', WIND_INDOORS);
      playSfx(this.scene, 'amb_rain', { loop: true });
    }
    this.groanT -= dt;
    if (this.groanT <= 0) { this.groan(); this.groanT = nextGroanGap(this.rng, this.scene.balance); }
    this.ambientT -= dt;
    if (this.ambientT <= 0) { this.oneShot(AMBIENT, 'lastAmbient'); this.ambientT = nextAmbientGap(this.rng, this.scene.balance); }
    this.updateStair(dt);
    this.updateRain(dt);
    this.zombieT -= dt;
    if (this.zombieT <= 0) { this.zombieT = ZOMBIE_TICK; this.zombieSounds(); }
    if (this.musicWantUntil > nowMs && this.tryMusic(danger, nowMs)) this.musicWantUntil = 0;
  }

  // ---- attack cue

  /** T-8: shuffling fades in and heavy bangs start. */
  startStairwell() {
    this.stair.on = true;
    this.stair.bangT = 0;
    playSfx(this.scene, 'stair_shuffle', { loop: true });
    setLoopVolume('stair_shuffle', 0);
  }

  /** One muffled bang from the stairwell, volume by distance of the camera's floor from the attacked floor. */
  bang(name) {
    const v = stairVolume(this.cameraFloor(), this.scene.tower.homeFloor, this.scene.balance);
    if (v <= 0 || !hasSfx(this.scene, name)) return;
    playSfx(this.scene, name, { volume: v, rate: 0.97 + this.rng() * 0.06 });
  }

  /** Random bang while the stairwell is active (used after the scripted bangs). */
  randomBang() { this.bang(BANGS[Math.floor(this.rng() * BANGS.length)]); }

  /** The banging has stopped: fade the shuffle out; the groan timer restarts so the cue is not a tell. */
  stopStairwell() {
    this.stair.on = false;
    this.groanT = nextGroanGap(this.rng, this.scene.balance);
  }

  updateStair(dt) {
    const st = this.stair;
    const target = st.on ? stairVolume(this.cameraFloor(), this.scene.tower.homeFloor, this.scene.balance) * SHUFFLE_VOLUME : 0;
    const step = dt / SHUFFLE_FADE_SECONDS;
    st.vol += Math.max(-step, Math.min(step, target - st.vol));
    if (st.vol > 0.001) { setLoopVolume('stair_shuffle', st.vol); st.playing = true; } else if (st.playing && !st.on) { stopSfx('stair_shuffle'); st.playing = false; }
    if (st.on && this.scene.attacks.phase === 'fight') {
      st.bangT -= dt;
      if (st.bangT <= 0) { this.randomBang(); st.bangT = randBetween(this.rng, cueConfig(this.scene.balance).fightBangGap); }
    }
  }

  /** Rain is louder inside the rooms (windows) than on the dry landing. */
  updateRain(dt) {
    const h = this.scene.state.hero;
    const inRoom = roomRefAt(this.scene.tower, h.floor, h.x) != null;
    const target = inRoom ? RAIN_ROOM : RAIN_LANDING;
    this.rain += Math.max(-dt * 0.3, Math.min(dt * 0.3, target - this.rain));
    setLoopVolume('amb_rain', this.rain);
  }

  /**
   * Zombies are heard before seen: each living zombie on the hero's floor within audio.zombieHearRadiusPx
   * breathes (standing) or shuffles (walking) now and then, panned by position and softer with distance.
   * It works through walls and in unexplored rooms. No allocations.
   */
  zombieSounds() {
    const { scene } = this;
    const h = scene.state.hero;
    if (scene.stair || scene.dead) return;
    const radius = scene.balance.audio?.zombieHearRadiusPx ?? 600;
    const list = scene.zombies.list;
    for (let i = 0; i < list.length; i++) {
      const rt = list[i];
      if (rt.dying || rt.rec.floor !== h.floor) continue;
      const dx = rt.rec.x - h.x;
      const dist = dx < 0 ? -dx : dx;
      if (dist > radius) continue;
      rt.sndT = (rt.sndT ?? this.rng() * 8) - ZOMBIE_TICK;
      if (rt.sndT > 0) continue;
      rt.sndT = 5 + this.rng() * 10;
      const key = rt.ai.moving ? 'zombie_shuffle' : (this.rng() < 0.5 ? 'zombie_breath_1' : 'zombie_breath_2');
      playSfx(scene, key, { volume: ZOMBIE_MAX_VOLUME * (1 - dist / radius), pan: Math.max(-1, Math.min(1, dx / radius)), rate: 0.95 + this.rng() * 0.1 });
    }
  }

  // ---- heartbeat and music

  /** Soft heartbeat while badly hurt. */
  setHeartbeat(on) {
    if (on === this.heartbeatOn) return;
    this.heartbeatOn = on;
    if (on) playSfx(this.scene, 'heartbeat_soft', { loop: true }); else stopSfx('heartbeat_soft');
  }

  /**
   * Sad music on a moment (attack over, survivor joins, first claim): one of music_sad_1..3 (never the
   * same twice in a row), at most once per audio.musicCooldownMinutes and never during danger.
   */
  moment(danger, nowMs) {
    if (!this.tryMusic(danger, nowMs)) this.musicWantUntil = nowMs + MUSIC_RETRY_MS; // retried each frame for a minute
  }

  /** Play a piece if allowed right now. @returns {boolean} played */
  tryMusic(danger, nowMs) {
    if (!isAudioUnlocked()) return false;
    if (!musicAllowed(nowMs, this.musicAt, this.musicCooldown, danger)) return false;
    const live = MUSIC.filter((k) => hasSfx(this.scene, k));
    if (!live.length) return false;
    this.musicAt = nowMs;
    this.musicCooldown = musicCooldownMs(this.rng, this.scene.balance);
    const i = pickNoRepeat(this.rng, live.length, this.lastMusic);
    this.lastMusic = i;
    playSfx(this.scene, live[i]);
    return true;
  }

  /** Silence everything we started (game over, scene shutdown, app hidden). */
  stopAll() {
    for (const k of ['amb_room_tone', 'amb_wind', 'amb_rain', 'stair_shuffle', 'heartbeat_soft']) stopSfx(k);
    this.heartbeatOn = false;
    this.stair.playing = false;
    this.bedsOn = false;
    this.stair.on = false;
    this.stair.vol = 0;
  }
}
