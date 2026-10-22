/**
 * Sound choices for the iso world (GDD 10). Pure, no Phaser; pass the rng.
 */

/** Surface of a room type via balance.audio.footstepSurfaceByRoom (concrete when unknown). */
export const surfaceForRoom = (roomType, balance) => balance.audio?.footstepSurfaceByRoom?.[roomType] ?? 'concrete';

/**
 * Footstep sound key `footstep_<surface>_1..3`, never the same variation twice in a row.
 * @param {number} last previous variation index (0-2) or -1  @returns {{key:string, index:number}}
 */
export function footstepKey(surface, rng, last = -1) {
  let i = Math.floor(rng() * 3);
  if (i === last) i = (i + 1 + Math.floor(rng() * 2)) % 3;
  return { key: `footstep_${surface}_${i + 1}`, index: i };
}

const CUPBOARD = new Set(['kitchen_cupboard', 'fridge', 'bathroom_cabinet', 'medicine_cabinet', 'utility_shelf', 'storage_cage', 'wardrobe', 'washing_machine', 'toolbox']);
const DRAWER = new Set(['kitchen_drawer', 'desk', 'filing_cabinet']);
const CLOTH = new Set(['laundry_basket', 'toy_box', 'sofa', 'mattress', 'bed_frame']);

/** Search sound for a container: cupboard / drawer / cloth variants, else the generic rummage. */
export function searchSoundKey(objectId) {
  if (CUPBOARD.has(objectId)) return 'search_cupboard';
  if (DRAWER.has(objectId)) return 'search_drawer';
  if (CLOTH.has(objectId)) return 'search_cloth';
  return 'search';
}

/** The ambient pools (GDD 10): category -> sound keys. Missing files are filtered by the caller. */
export const AMBIENT_POOLS = Object.freeze({
  weather: ['amb_wind', 'amb_rain'],
  building: ['creak_1', 'creak_2', 'creak_3', 'muffled_thud_1', 'muffled_thud_2', 'pipe_knock_1', 'pipe_knock_2', 'door_creak', 'glass_tinkle'],
  outside: [],
});

/**
 * Pick the next ambient one-shot: a category by audio.ambientWeights, then a sound in it, never the same
 * as `last`. Rain-on-window gets weight x windowRainWeightMult near a window, a broken window adds
 * wind x brokenWindowWindWeightMult. Categories without a playable sound are skipped.
 * @param {()=>number} rng
 * @param {object} audio balance.audio
 * @param {{has:(key:string)=>boolean, last?:string|null, nearWindow?:boolean, brokenWindow?:boolean, pools?:object}} o
 * @returns {{key:string, category:string}|null}
 */
export function pickAmbient(rng, audio, o) {
  const pools = o.pools ?? AMBIENT_POOLS;
  const weights = audio.ambientWeights ?? { weather: 3, building: 4, outside: 2 };
  const entries = [];
  for (const [cat, list] of Object.entries(pools)) {
    for (const key of list) {
      if (!o.has(key) || key === o.last) continue;
      let w = (weights[cat] ?? 1) / Math.max(1, list.filter((k) => o.has(k) && k !== o.last).length);
      if (key === 'amb_rain' && o.nearWindow) w *= audio.windowRainWeightMult ?? 3;
      if (key === 'amb_wind' && o.brokenWindow) w *= audio.brokenWindowWindWeightMult ?? 2;
      entries.push({ key, category: cat, w });
    }
  }
  const total = entries.reduce((n, e) => n + e.w, 0);
  if (!(total > 0)) return null;
  let r = rng() * total;
  for (const e of entries) { r -= e.w; if (r <= 0) return { key: e.key, category: e.category }; }
  const e = entries[entries.length - 1];
  return { key: e.key, category: e.category };
}

/** Volume multiplier in audio.ambientVolumeRange. */
export const ambientVolume = (rng, audio) => {
  const [lo, hi] = audio.ambientVolumeRange ?? [0.35, 0.7];
  return lo + rng() * (hi - lo);
};

/** Deterministic hash of a string (zombie variant pick). */
export function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * Sheet key for a zombie: the base sheet or one of its manifest `variants`, picked from the id so it is
 * stable across saves; falls back to the base when the variant is not available.
 * @param {string} base e.g. 'iso_walker' @param {string[]} variants @param {(key:string)=>boolean} has
 */
export function zombieSheet(base, variants, id, has) {
  const usable = [base, ...(variants ?? [])].filter((k) => k === base || has(k));
  return usable[hashId(id) % usable.length];
}
