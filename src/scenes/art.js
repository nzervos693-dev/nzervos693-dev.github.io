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

/**
 * Sprite sheet + frame + native size (art px) for a salvage object id.
 * @returns {{key:string, frame:number, size:number}|null}
 */
export function propSprite(objectId) {
  if (hasFrame('props_s', objectId)) return { key: 'props_s', frame: frameOf('props_s', objectId), size: 16 };
  if (hasFrame('props_l', objectId)) return { key: 'props_l', frame: frameOf('props_l', objectId), size: 32 };
  return null;
}

/** Frame size of a sheet in the manifest: {frameWidth, frameHeight} or null. */
export const sheetDef = (key) => {
  const f = files.get(key);
  return f ? { frameWidth: f.frameWidth, frameHeight: f.frameHeight } : null;
};

/** Variant sheet keys listed on a base sheet's manifest entry (`variants`), or []. */
export const sheetVariants = (key) => files.get(key)?.variants ?? [];
