/**
 * Pixel alpha of spritesheet frames (one ImageData per sheet, read lazily): used for pixel-accurate taps
 * and for the opaque bounds of a prop frame. View helper, no game rules.
 */
const sheets = new Map();
const bounds = new Map();

function sheetData(scene, key) {
  let s = sheets.get(key);
  if (s) return s;
  const src = scene.textures.get(key).getSourceImage();
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0);
  s = { w: c.width, data: ctx.getImageData(0, 0, c.width, c.height).data };
  sheets.set(key, s);
  return s;
}

/** Alpha 0-255 at (lx, ly) in frame coordinates; 0 outside the frame. */
export function frameAlphaAt(scene, key, frameName, lx, ly) {
  const f = scene.textures.getFrame(key, frameName);
  if (lx < 0 || ly < 0 || lx >= f.width || ly >= f.height) return 0;
  const s = sheetData(scene, key);
  return s.data[((f.cutY + ly) * s.w + f.cutX + lx) * 4 + 3];
}

/**
 * Bounding box of the pixels with alpha > 20 inside a frame ({x0, y0, x1, y1}, frame coords, x1/y1 exclusive).
 */
export function opaqueBounds(scene, key, frameName) {
  const id = `${key}#${frameName}`;
  let b = bounds.get(id);
  if (b) return b;
  const f = scene.textures.getFrame(key, frameName);
  const s = sheetData(scene, key);
  b = { x0: f.width, y0: f.height, x1: 0, y1: 0 };
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      if (s.data[((f.cutY + y) * s.w + f.cutX + x) * 4 + 3] > 20) {
        if (x < b.x0) b.x0 = x;
        if (y < b.y0) b.y0 = y;
        if (x + 1 > b.x1) b.x1 = x + 1;
        if (y + 1 > b.y1) b.y1 = y + 1;
      }
    }
  }
  if (b.x1 === 0) b = { x0: 0, y0: 0, x1: f.width, y1: f.height };
  bounds.set(id, b);
  return b;
}
