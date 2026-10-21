/**
 * Art loading by manifest (public/assets/art/manifest.json). Frames are looked up by name.
 */
import manifest from '../../public/assets/art/manifest.json';

const files = new Map(manifest.files.map((f) => [f.key, f]));

/** Queue every spritesheet in the manifest on a scene's loader. */
export function queueArt(scene) {
  const base = import.meta.env.BASE_URL;
  for (const f of manifest.files) {
    scene.load.spritesheet(f.key, base + f.path, { frameWidth: f.frameWidth, frameHeight: f.frameHeight });
  }
}

/** Frame index for a named frame, or -1. */
export function frameOf(key, name) {
  return files.get(key)?.names.indexOf(name) ?? -1;
}

/** Is this sheet in the art manifest at all? (Optional sheets fall back to placeholders in code.) */
export const hasSheet = (key) => files.has(key);

/** Does this sheet contain this frame name? */
export const hasFrame = (key, name) => frameOf(key, name) >= 0;

/** Create the manifest's animations as `${key}_${name}` (once). */
export function registerAnimations(scene) {
  for (const f of manifest.files) {
    for (const a of f.animations || []) {
      const k = `${f.key}_${a.name}`;
      if (scene.anims.exists(k)) continue;
      scene.anims.create({
        key: k,
        frames: scene.anims.generateFrameNumbers(f.key, { frames: a.frames }),
        frameRate: a.fps,
        repeat: a.repeat,
      });
    }
  }
}

const PROP_SHEETS = [['props_s', 16], ['props_l', 32], ['props_s2', 16], ['props_l2', 32]];

/**
 * Sprite sheet + frame + native size (art px) for a salvage object id, plus the frame of its "searched/ajar"
 * variant (`<id>_open`) when the art has one.
 * @param {string} objectId
 * @param {{charredSmall?:boolean}} [opts] charredSmall: a burned small object (charred_small frame)
 * @returns {{key:string, frame:number, openFrame:number, size:number}|null}
 */
export function propSprite(objectId, opts = {}) {
  const name = objectId === 'charred_debris' && opts.charredSmall ? 'charred_small' : objectId;
  for (const [key, size] of PROP_SHEETS) {
    if (hasFrame(key, name)) return { key, frame: frameOf(key, name), openFrame: frameOf(key, `${name}_open`), size };
  }
  return null;
}
