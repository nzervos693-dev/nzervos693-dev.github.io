// Generates Milestone 1/2 placeholder pixel art into public/assets/art/ plus manifest.json.
// Run: npm run art. Native pixel size (game scales 3x with pixelArt). Palette: GDD section 9.
// Optional: ART_PREVIEW=<dir> also writes 4x upscaled previews there (not part of the game).
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = 'public/assets/art';
mkdirSync(OUT, { recursive: true });

// ---------- PNG encoder (same approach as make-icons.mjs, RGBA) ----------
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, c]);
};
function encodePng(w, h, rgba, scale = 1) {
  const W = w * scale, H = h * scale, stride = W * 4 + 1;
  const raw = Buffer.alloc(stride * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const s = ((Math.floor(y / scale)) * w + Math.floor(x / scale)) * 4;
      const o = y * stride + 1 + x * 4;
      raw[o] = rgba[s]; raw[o + 1] = rgba[s + 1]; raw[o + 2] = rgba[s + 2]; raw[o + 3] = rgba[s + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- palette ----------
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
// M2 palette (GDD section 9): dark, damp, desaturated. Keys kept from M1 so frames keep their meaning.
const P = {
  O: '#0b0c0e', S: '#23272c', W: '#3a3e42', L: '#5d6166', R: '#5a3a2a', B: '#4e1c1a',
  RED: '#8f2e26', A: '#c08a3e', Z: '#5f6650', SK: '#a99886', T: '#34494b', X: '#bdb8ab',
  // extras
  TD: '#28393b', WOOD: '#6e4a30', WOODD: '#33211a', BLUE: '#3f5a64', DIRT: '#5a4e2e', GREEN: '#465a3c',
  CLOTH: '#6e6a5e', METAL: '#82888c', ZD: '#454c3a', SKY: '#4d585d', SKYD: '#363f43', PANT: '#1c2025',
  // M2 additions
  DEEP: '#16191d', PLASTER: '#6e6a5e', WALLP: '#5b5547', LAMP: '#c08a3e', FIRE: '#d07a2c', WINDOW: '#8a9399',
  MD1: '#7d7350', MD2: '#8a6a3a', MD3: '#7a4630', MD4: '#5e2422', PALE: '#d8d2c0',
};
// M1 extra colours: desaturate (cap ~30%) and darken
const adj = (h) => {
  let r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  const gray = (r + g + b) / 3, k = d > 0.3 ? 0.3 / d : 1; // shrink chroma toward grey
  const f = (v) => Math.round(Math.max(0, Math.min(1, (gray + (v - gray) * Math.min(1, k * 1.1)) * 0.86)) * 255).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
};
const M1X = { H4a2a2a: '#4a2a2a', H34393f: '#34393f', H2f343b: '#2f343b', H4a3a36: '#5b5547', H3f322f: '#4c4639', H5a4640: '#665f50', H2e2523: '#2b2622', H62686e: '#62686e', H555b61: '#555b61', H07080a: '#07080a', H14171b: '#14171b', H1a1e24: '#1a1e24', H7d8a82: '#7d8a82', H586860: '#586860', H5f5344: '#5f5344', H3d3a2a: '#3d3a2a', H2a3a3a: '#2a3a3a', Ha8a79d: '#a8a79d', Hc5ccd1: '#c5ccd1', H8a8f80: '#8a8f80', Hd8c27a: '#d8c27a', H5b3a3a: '#5b3a3a', H704747: '#704747', H6a4242: '#6a4242', H4d3030: '#4d3030', Hb8b4a8: '#b8b4a8', H9a978c: '#9a978c', H5f8f9a: '#5f8f9a', H3a2a1c: '#3a2a1c', H8f806c: '#8f806c', H2b3138: '#2b3138' };
for (const [k, v] of Object.entries(M1X)) P[k] = ['H4a3a36', 'H3f322f', 'H5a4640', 'H2e2523'].includes(k) ? v : adj(v);
const C_ = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, hex(v)]));
// icon grid chars
const IC = { o: 'O', s: 'S', w: 'W', l: 'L', r: 'R', b: 'B', R: 'RED', a: 'A', z: 'Z', p: 'SK', t: 'T', x: 'X',
  n: 'WOOD', u: 'BLUE', d: 'DIRT', g: 'GREEN', c: 'CLOTH', y: 'METAL', k: 'WOODD' };

// seeded rng
let seed = 15;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const reseed = (s) => { seed = s; };

class Cv {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Uint8Array(w * h * 4); }
  px(x, y, c) {
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    const col = typeof c === 'string' ? (c[0] === '#' ? hex(c) : C_[c]) : c;
    this.d.set(col, (y * this.w + x) * 4);
  }
  get(x, y) { if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0; return this.d[(y * this.w + x) * 4 + 3]; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); }
  line(x0, y0, x1, y1, c) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  // 1 px near-black outline around opaque pixels (4-neighbour) on transparent pixels
  outline() {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.px(x, y, 'O');
    return this;
  }
  clear(x, y, w, h) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const x0 = x + i, y0 = y + j; if (x0 >= 0 && y0 >= 0 && x0 < this.w && y0 < this.h) this.d.fill(0, (y0 * this.w + x0) * 4, (y0 * this.w + x0) * 4 + 4); } }
  blit(src, dx, dy) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const s = (y * src.w + x) * 4;
      if (src.d[s + 3]) this.d.set(src.d.subarray(s, s + 4), ((dy + y) * this.w + dx + x) * 4);
    }
  }
  grid(rows, ox = 0, oy = 0, scale = 1) {
    rows.forEach((r, y) => {
      if (r.length !== 8) throw new Error('bad icon row: ' + r);
      [...r].forEach((ch, x) => {
        if (ch === '.') return;
        if (!IC[ch]) throw new Error('bad icon char ' + ch);
        this.rect(ox + x * scale, oy + y * scale, scale, scale, IC[ch]);
      });
    });
  }
}

// ---------- sheet building ----------
const files = {}; // key -> manifest entry
function sheet(key, fw, fh, frames, { outline = false, animations = [], note } = {}) {
  const sh = new Cv(fw * frames.length, fh);
  const names = [];
  frames.forEach(([name, fn], i) => {
    const f = new Cv(fw, fh);
    fn(f, i);
    if (outline) f.outline();
    sh.blit(f, i * fw, 0);
    names.push(name);
  });
  const path = `${key}.png`;
  const buf = encodePng(sh.w, sh.h, sh.d);
  writeFileSync(`${OUT}/${path}`, buf);
  if (process.env.ART_PREVIEW) {
    mkdirSync(process.env.ART_PREVIEW, { recursive: true });
    writeFileSync(`${process.env.ART_PREVIEW}/${key}.png`, encodePng(sh.w, sh.h, sh.d, 4));
  }
  files[key] = { key, path: `assets/art/${path}`, frameWidth: fw, frameHeight: fh, frames: frames.length,
    names, animations, ...(note ? { note } : {}), bytes: buf.length };
}
const anim = (name, frames, fps, repeat = -1) => ({ name, frames, fps, repeat });

// ---------- humanoids (16x24, facing right) ----------
function arm(c, sx, sy, ax, ay, sleeve, hand) {
  c.line(sx, sy, sx + ax, sy + ay, sleeve);
  if (Math.abs(ax) >= Math.abs(ay)) c.line(sx, sy + 1, sx + ax, sy + ay + 1, sleeve);
  else c.line(sx + 1, sy, sx + ax + 1, sy + ay, sleeve);
  c.px(sx + ax, sy + ay, hand);
}
function human(c, o) {
  const { bob = 0, skin = 'SK', shirt = 'T', sleeve = 'TD', pants = 'PANT', hair = 'S', headDx = 0,
    legB = [0, 0], legF = [0, 0], armF = [0, 4], armB = [0, 4], weapon = null, eye = 'O', mouth = null,
    hairStyle = 'short', patch = 'A', decay = false } = o;
  const len = 7 - bob;
  // back leg (darker), back arm
  const leg = (x, [dx, lift], col) => {
    const l = Math.max(1, len - lift);
    c.rect(x + dx, 16 + bob, 2, l, col);
    c.rect(x + dx, 16 + bob + l - 1, 3, 1, 'S'); // foot, pointing right
  };
  leg(5, legB, 'S');
  arm(c, 7, 9 + bob, armB[0], armB[1], shirt, skin);
  c.rect(5, 8 + bob, 6, 8, shirt);
  c.rect(5, 15 + bob, 6, 1, pants);
  if (decay) { c.rect(4, 9 + bob, 1, 6, shirt); c.rect(11, 9 + bob, 1, 5, shirt); c.rect(4, 8 + bob, 8, 1, shirt); } // heavier, hunched bulk
  if (patch) c.px(7, 11 + bob, patch);
  leg(8, legF, pants);
  // head
  c.rect(5 + headDx, 2 + bob, 6, 6, skin);
  if (hairStyle === 'short') { c.rect(5 + headDx, 2 + bob, 6, 2, hair); c.rect(5 + headDx, 2 + bob, 2, 5, hair); }
  if (hairStyle === 'bun') { c.rect(5 + headDx, 2 + bob, 6, 2, hair); c.rect(4 + headDx, 3 + bob, 3, 5, hair); c.rect(5 + headDx, 1 + bob, 3, 1, hair); }
  if (hairStyle === 'bald') { c.rect(5 + headDx, 2 + bob, 2, 2, 'ZD'); }
  c.px(9 + headDx, 5 + bob, eye);
  if (mouth === 'open') c.rect(9 + headDx, 7 + bob, 2, 1, 'B');
  if (decay) { // rot: sores, exposed ribs, torn hem, dark sockets
    c.px(7 + headDx, 3 + bob, 'ZD'); c.px(10 + headDx, 3 + bob, 'ZD'); c.rect(6 + headDx, 7 + bob, 2, 1, 'B');
    c.px(8 + headDx, 5 + bob, 'O'); c.px(6, 10 + bob, 'B'); c.px(7, 12 + bob, 'ZD'); c.rect(8, 13 + bob, 2, 1, 'B');
    c.px(5, 14 + bob, 'O'); c.px(9, 15 + bob, 'O'); c.px(10, 11 + bob, 'ZD');
  }
  // front arm + weapon
  arm(c, 8, 9 + bob, armF[0], armF[1], sleeve, skin);
  if (weapon) {
    const hx = 8 + armF[0], hy = 9 + bob + armF[1];
    c.line(hx, hy, Math.min(14, hx + weapon[0]), hy + weapon[1], 'WOOD');
    c.px(hx + Math.sign(weapon[0]) * 2, hy + Math.sign(weapon[1]) * 2, 'L');
    c.px(Math.min(14, hx + weapon[0]), hy + weapon[1], 'L');
  }
}
const walkPose = (i) => [
  { bob: 1, legB: [-1, 0], legF: [2, 0], armF: [-1, 4], armB: [1, 4] },
  { bob: 0, legB: [0, 0], legF: [0, 2], armF: [0, 4], armB: [0, 4] },
  { bob: 1, legB: [2, 0], legF: [-1, 0], armF: [2, 3], armB: [-2, 4] },
  { bob: 0, legB: [0, 2], legF: [0, 0], armF: [0, 4], armB: [0, 4] },
][i];

// hero
sheet('hero', 16, 24, [
  ['idle_0', (c) => human(c, { bob: 0 })],
  ['idle_1', (c) => human(c, { bob: 1, armF: [0, 3], armB: [0, 3] })],
  ...[0, 1, 2, 3].map((i) => [`walk_${i}`, (c) => human(c, walkPose(i))]),
  ['attack_0', (c) => human(c, { bob: 0, headDx: -1, legB: [-1, 0], legF: [0, 0], armF: [-2, -2], armB: [-1, 3], weapon: [-3, -6] })],
  ['attack_1', (c) => human(c, { bob: 1, headDx: 1, legB: [-1, 0], legF: [2, 0], armF: [4, 1], armB: [-1, 3], weapon: [2, 5] })],
  ['attack_2', (c) => human(c, { bob: 0, legB: [0, 0], legF: [1, 0], armF: [3, 4], armB: [0, 4], weapon: [1, 4] })],
], { outline: true, animations: [
  anim('idle', [0, 1], 2), anim('walk', [2, 3, 4, 5], 8), anim('attack', [6, 7, 8], 12, 0)],
  note: 'faces right; flip in game for left' });

// Mara: nurse, floor 13
const mara = { skin: 'SK', shirt: 'X', sleeve: 'X', pants: 'T', hair: 'WOODD', hairStyle: 'bun', patch: 'RED' };
sheet('mara', 16, 24, [
  ['idle_0', (c) => human(c, { ...mara, bob: 0 })],
  ['idle_1', (c) => human(c, { ...mara, bob: 1, armF: [0, 3], armB: [0, 3] })],
], { outline: true, animations: [anim('idle', [0, 1], 2)], note: 'nurse; faces right' });

// Mara as playable character (same layout/animations as hero)
sheet('mara_play', 16, 24, [
  ['idle_0', (c) => human(c, { ...mara, bob: 0 })],
  ['idle_1', (c) => human(c, { ...mara, bob: 1, armF: [0, 3], armB: [0, 3] })],
  ...[0, 1, 2, 3].map((i) => [`walk_${i}`, (c) => human(c, { ...mara, ...walkPose(i) })]),
  ['attack_0', (c) => human(c, { ...mara, bob: 0, headDx: -1, legB: [-1, 0], legF: [0, 0], armF: [-2, -2], armB: [-1, 3], weapon: [-3, -6] })],
  ['attack_1', (c) => human(c, { ...mara, bob: 1, headDx: 1, legB: [-1, 0], legF: [2, 0], armF: [4, 1], armB: [-1, 3], weapon: [2, 5] })],
  ['attack_2', (c) => human(c, { ...mara, bob: 0, legB: [0, 0], legF: [1, 0], armF: [3, 4], armB: [0, 4], weapon: [1, 4] })],
], { outline: true, animations: [
  anim('idle', [0, 1], 2), anim('walk', [2, 3, 4, 5], 8), anim('attack', [6, 7, 8], 12, 0)],
  note: 'Mara playable (pass the torch); same layout as hero; faces right' });

// zombies
const zWalk = { skin: 'Z', shirt: 'H4a2a2a', sleeve: 'Z', pants: 'WOODD', hair: 'ZD', hairStyle: 'bald', decay: true, eye: 'RED', headDx: 1, patch: 'B', mouth: null };
function lying(c) { // fallen backwards, head left
  c.rect(1, 18, 5, 5, 'Z'); c.px(3, 20, 'RED'); c.rect(6, 19, 5, 4, 'R'); c.rect(11, 20, 4, 3, 'WOODD'); c.px(8, 20, 'B'); c.px(2, 19, 'ZD'); c.px(9, 22, 'B'); c.px(5, 22, 'ZD');
}
sheet('zombie_walker', 16, 24, [
  ...[0, 1, 2, 3].map((i) => {
    const p = walkPose(i);
    return [`walk_${i}`, (c) => human(c, { ...zWalk, shirt: 'R', sleeve: 'Z', bob: p.bob, legB: [Math.sign(p.legB[0]), p.legB[1]], legF: [Math.sign(p.legF[0]), p.legF[1]], armF: [5, i % 2 ? 0 : 1], armB: [4, i % 2 ? 1 : 0] })];
  }),
  ['attack_0', (c) => human(c, { ...zWalk, shirt: 'R', headDx: 1, armF: [5, -3], armB: [4, -2], legF: [1, 0] })],
  ['attack_1', (c) => human(c, { ...zWalk, shirt: 'R', bob: 1, headDx: 3, mouth: 'open', armF: [5, -1], armB: [4, 0], legF: [2, 0], legB: [-1, 0] })],
  ['death_0', (c) => human(c, { ...zWalk, shirt: 'R', bob: 3, headDx: 0, armF: [3, 3], armB: [2, 3] })],
  ['death_1', (c) => human(c, { ...zWalk, shirt: 'R', bob: 6, headDx: -2, armF: [-2, 1], armB: [-3, 2], legB: [-1, 0], legF: [-2, 0] })],
  ['death_2', (c) => lying(c)],
], { outline: true, animations: [anim('walk', [0, 1, 2, 3], 5), anim('attack', [4, 5], 6),
  anim('death', [6, 7, 8], 6, 0)], note: 'faces right; Walker: upright, arms out' });

function crawler(c, { hb = 0, a1 = [4, 3], a2 = [1, 4], mouth = false, drag = 0, flat = 0, headUp = 0 }) {
  const y0 = 15 + flat;
  c.rect(1 + drag, y0 + 2, 3, 2, 'B'); // bloody stump, legs missing
  c.rect(3, y0, 7, 4, 'R');
  c.px(5, y0 + 1, 'B'); c.px(7, y0, 'WOODD'); c.px(6, y0 + 3, 'B'); c.px(4, y0, 'ZD'); c.px(9, y0 + 1, 'ZD');
  arm(c, 8, y0 + 3, a2[0], a2[1] - flat, 'ZD', 'Z');
  c.rect(9, 12 + hb + flat - headUp, 5, 5, 'Z');
  c.px(12, 14 + hb + flat - headUp, 'RED');
  if (mouth) c.rect(12, 16 + hb + flat - headUp, 2, 1, 'B');
  c.rect(9, 12 + hb + flat - headUp, 3, 1, 'ZD'); c.px(13, 13 + hb + flat - headUp, 'ZD'); c.px(10, 15 + hb + flat - headUp, 'B');
  arm(c, 10, y0 + 3, a1[0], a1[1] - flat, 'Z', 'Z');
}
sheet('zombie_crawler', 16, 24, [
  ['walk_0', (c) => crawler(c, { hb: 1, a1: [4, 4], a2: [0, 4], drag: 0 })],
  ['walk_1', (c) => crawler(c, { hb: 0, a1: [2, 4], a2: [2, 4], drag: 1 })],
  ['walk_2', (c) => crawler(c, { hb: 1, a1: [0, 4], a2: [4, 4], drag: 1 })],
  ['walk_3', (c) => crawler(c, { hb: 0, a1: [2, 4], a2: [2, 4], drag: 0 })],
  ['attack_0', (c) => crawler(c, { hb: -2, headUp: 1, a1: [4, 1], a2: [1, 4], mouth: true })],
  ['attack_1', (c) => crawler(c, { hb: 0, headUp: 2, a1: [4, 0], a2: [3, 2], mouth: true })],
  ['death_0', (c) => crawler(c, { hb: 2, a1: [3, 4], a2: [1, 4], flat: 0 })],
  ['death_1', (c) => crawler(c, { hb: 3, a1: [3, 3], a2: [1, 3], flat: 1 })],
  ['death_2', (c) => { c.rect(1, 20, 3, 2, 'B'); c.rect(3, 19, 7, 3, 'R'); c.rect(9, 19, 5, 3, 'Z'); c.px(12, 20, 'RED'); c.rect(6, 22, 6, 1, 'B'); }],
], { outline: true, animations: [anim('walk', [0, 1, 2, 3], 5), anim('attack', [4, 5], 6),
  anim('death', [6, 7, 8], 6, 0)], note: 'faces right; low sprite (bottom 12 rows)' });

// ---------- floor and structure ----------
function slabs(c, w, h) {
  c.rect(0, 0, w, 2, 'S'); c.rect(0, 2, w, 1, 'W'); c.rect(0, 3, w, 1, 'O');
  c.rect(0, h - 10, w, 1, 'L'); c.rect(0, h - 9, w, 5, 'W'); c.rect(0, h - 4, w, 4, 'S'); c.rect(0, h - 1, w, 1, 'O');
}
function stains(c, w, y0, y1, n, col) {
  for (let i = 0; i < n; i++) {
    const x = (rnd() * w) | 0, y = y0 + ((rnd() * (y1 - y0)) | 0);
    c.rect(x, y, 1 + ((rnd() * 3) | 0), 1 + ((rnd() * 2) | 0), col);
  }
}
const mixed = [C_.H34393f, C_.H2f343b];
function damp(c, sd, y1 = 62) { // water streaks and mould, drawn after the base so the base rng sequence is unchanged
  reseed(sd);
  for (let i = 0; i < 14; i++) {
    const x = (rnd() * 240) | 0, y = 4 + ((rnd() * 20) | 0), len = 8 + ((rnd() * 28) | 0);
    for (let j = 0; j < len && y + j < y1; j++) if (rnd() < 0.8) c.px(x, y + j, 'S');
  }
  for (let i = 0; i < 6; i++) { const x = (rnd() * 230) | 0, y = 44 + ((rnd() * 10) | 0); c.rect(x, y, 3 + ((rnd() * 5) | 0), 2, 'ZD'); c.px(x + 1, y - 1, 'ZD'); }
}
function wallConcrete(c) {
  reseed(101);
  c.rect(0, 4, 240, 66, 'W');
  for (let x = 20; x < 240; x += 40) c.rect(x, 4, 1, 66, 'S');
  stains(c, 240, 4, 64, 90, mixed[0]); stains(c, 240, 4, 64, 40, 'S');
  c.rect(0, 62, 240, 8, 'S'); c.rect(0, 62, 240, 1, 'L'); // baseboard
  let x = 150, y = 6; for (; y < 40; y++) { c.px(x, y, 'S'); x += ((rnd() * 3) | 0) - 1; }
  c.rect(60, 30, 3, 2, 'B'); c.rect(61, 32, 1, 5, 'B'); c.rect(64, 31, 1, 1, 'B'); // dried blood
  damp(c, 111, 60);
  slabs(c, 240, 80);
}
function wallPaper(c) {
  reseed(202);
  c.rect(0, 4, 240, 66, 'H4a3a36');
  for (let x = 0; x < 240; x += 8) c.rect(x, 4, 4, 48, 'H3f322f');
  for (let x = 2; x < 240; x += 8) c.rect(x, 12, 1, 3, 'H5a4640'); // faded motif
  stains(c, 240, 4, 50, 60, 'H2e2523');
  c.rect(0, 52, 240, 18, 'H2e2523'); c.rect(0, 52, 240, 1, 'R'); c.rect(0, 53, 240, 1, 'S');
  for (let x = 0; x < 240; x += 16) c.rect(x, 56, 1, 14, 'S');
  c.rect(0, 62, 240, 1, 'R');
  damp(c, 222, 60);
  slabs(c, 240, 80);
}
function wallTile(c) {
  reseed(303);
  c.rect(0, 4, 240, 66, 'W');
  c.rect(0, 20, 240, 50, 'L');
  for (let y = 20; y < 70; y += 8) c.rect(0, y, 240, 1, 'S');
  for (let x = 0; x < 240; x += 8) c.rect(x, 20, 1, 50, 'S');
  for (let i = 0; i < 60; i++) c.rect(((rnd() * 30) | 0) * 8 + 1, 21 + ((rnd() * 6) | 0) * 8, 7, 7, 'H62686e');
  stains(c, 240, 21, 68, 25, 'H555b61');
  c.rect(0, 20, 240, 1, 'O'); c.rect(180, 46, 2, 6, 'B'); c.rect(181, 52, 1, 8, 'B');
  damp(c, 333, 69);
  slabs(c, 240, 80);
}
sheet('floor_bg', 240, 80, [
  ['wall_concrete', wallConcrete], ['wall_wallpaper', wallPaper], ['wall_tile', wallTile],
  ['slab_only', (c) => slabs(c, 240, 80)],
], { note: 'one floor = 240x80 native (720x240 game px); slab at top 4 rows and bottom 10 rows; floor walking line at y=70' });

sheet('stairwell', 40, 80, [['segment', (c) => {
  reseed(404);
  c.rect(0, 4, 40, 66, 'S');
  for (let i = 0; i < 10; i++) { c.rect(i * 4, 66 - i * 4, 4, 4 + i * 4, 'W'); c.rect(i * 4, 66 - i * 4, 4, 1, 'L'); }
  c.rect(0, 66, 40, 4, 'W');
  c.line(0, 44, 39, 10, 'METAL'); c.line(0, 45, 39, 11, 'L');
  for (let x = 2; x < 40; x += 6) c.line(x, 44 - Math.round(x * 34 / 39), x, 50 - Math.round(x * 34 / 39) + 6, 'L');
  stains(c, 40, 4, 30, 12, 'O');
  slabs(c, 40, 80);
}]], { note: 'stairwell cutaway, repeats vertically per floor; not salvage' });

sheet('door', 16, 32, [
  ['closed', (c) => {
    c.rect(0, 0, 16, 32, 'O'); c.rect(1, 1, 14, 31, 'WOODD'); c.rect(2, 2, 12, 30, 'R');
    c.rect(4, 4, 8, 11, 'WOODD'); c.rect(5, 5, 6, 9, 'R'); c.rect(4, 18, 8, 11, 'WOODD'); c.rect(5, 19, 6, 9, 'R');
    c.rect(11, 16, 2, 2, 'A'); c.rect(7, 2, 2, 1, 'L');
  }],
  ['open', (c) => {
    c.rect(0, 0, 16, 32, 'O'); c.rect(1, 1, 14, 31, 'WOODD'); c.rect(2, 2, 12, 30, 'H07080a');
    c.rect(2, 2, 3, 30, 'R'); c.rect(4, 4, 1, 26, 'WOODD'); c.rect(9, 20, 5, 12, 'H14171b'); c.rect(7, 26, 7, 1, 'H1a1e24');
  }],
], { note: 'apartment door frame; open shows dark corridor' });

sheet('window', 32, 32, [['night_neutral', (c) => {
  c.rect(0, 0, 32, 32, 'O'); c.rect(1, 1, 30, 30, 'L'); c.rect(3, 3, 26, 26, 'SKY'); c.rect(3, 17, 26, 12, 'SKYD');
  c.rect(15, 3, 2, 26, 'L'); c.rect(3, 15, 26, 2, 'L'); c.rect(3, 28, 26, 1, 'W');
  c.line(5, 12, 11, 5, 'H7d8a82'); c.line(6, 13, 12, 6, 'H7d8a82'); c.rect(1, 29, 30, 2, 'W'); c.rect(0, 31, 32, 1, 'O');
}]], { note: 'large prop; tower skyline tint added by game' });

sheet('tower_edge', 16, 80, [['edge_right', (c) => {
  c.rect(0, 0, 16, 80, 'SKY');
  for (let y = 0; y < 80; y += 2) c.rect(0, y, 16, 1, y % 4 ? 'SKY' : 'H586860');
  c.rect(0, 0, 9, 80, 'W'); c.rect(9, 0, 1, 80, 'L'); c.rect(10, 0, 1, 80, 'O');
  c.rect(0, 0, 14, 2, 'S'); c.rect(0, 2, 14, 1, 'W'); c.rect(0, 3, 15, 1, 'O');
  c.rect(0, 70, 14, 1, 'L'); c.rect(0, 71, 14, 5, 'W'); c.rect(0, 76, 14, 3, 'S'); c.rect(0, 79, 15, 1, 'O');
  reseed(505); stains(c, 9, 4, 68, 10, 'S'); c.rect(6, 20, 1, 12, 'R'); c.rect(7, 30, 1, 20, 'R');
}]], { note: 'right exterior edge of the tower; flip for left' });

// ---------- props ----------
const wood = (c, x, y, w, h) => { c.rect(x, y, w, h, 'R'); c.rect(x, y, w, 1, 'WOOD'); };
sheet('props_s', 16, 16, [
  ['chair', (c) => { wood(c, 3, 2, 2, 8); wood(c, 3, 8, 9, 2); c.rect(3, 10, 2, 4, 'WOODD'); c.rect(10, 10, 2, 4, 'WOODD'); }],
  ['curtains', (c) => { c.rect(1, 2, 14, 1, 'L'); c.rect(2, 3, 5, 11, 'CLOTH'); c.rect(9, 3, 5, 11, 'CLOTH'); [3, 5, 10, 12].forEach((x) => c.rect(x, 4, 1, 9, 'H5f5344')); }],
  ['potted_plant', (c) => { c.rect(5, 9, 6, 5, 'R'); c.rect(5, 9, 6, 1, 'WOOD'); c.rect(7, 4, 2, 5, 'GREEN'); c.rect(4, 3, 3, 3, 'GREEN'); c.rect(9, 2, 3, 3, 'GREEN'); c.px(5, 6, 'GREEN'); c.px(11, 6, 'GREEN'); }],
  ['microwave', (c) => { c.rect(1, 4, 14, 9, 'L'); c.rect(2, 5, 8, 7, 'S'); c.rect(3, 6, 6, 5, 'H3d3a2a'); c.px(4, 7, 'A'); c.rect(11, 6, 2, 1, 'A'); c.rect(11, 8, 2, 3, 'W'); }],
  ['tv', (c) => { c.rect(1, 2, 14, 10, 'S'); c.rect(2, 3, 9, 8, 'H2a3a3a'); c.rect(3, 4, 2, 1, 'L'); c.rect(12, 4, 2, 6, 'W'); c.px(13, 5, 'RED'); c.rect(4, 12, 8, 2, 'W'); }],
  ['sink_pipes', (c) => { c.rect(2, 1, 3, 10, 'METAL'); c.rect(2, 10, 12, 3, 'METAL'); c.rect(1, 9, 5, 1, 'L'); c.rect(10, 9, 5, 1, 'L'); c.rect(3, 2, 1, 8, 'X'); c.px(12, 14, 'BLUE'); c.rect(6, 11, 4, 1, 'L'); }],
  ['toilet_tank', (c) => { c.rect(3, 2, 10, 9, 'X'); c.rect(3, 2, 10, 2, 'Ha8a79d'); c.rect(11, 4, 2, 7, 'Ha8a79d'); c.rect(5, 4, 2, 1, 'METAL'); c.rect(6, 11, 4, 3, 'L'); }],
  ['kitchen_drawer', (c) => { wood(c, 1, 4, 14, 9); c.rect(2, 8, 12, 1, 'WOODD'); c.rect(7, 6, 2, 1, 'L'); c.rect(7, 10, 2, 1, 'L'); }],
  ['window_pane', (c) => { c.rect(2, 1, 12, 14, 'L'); c.rect(4, 3, 8, 10, 'SKY'); c.rect(7, 3, 2, 10, 'L'); c.rect(4, 7, 8, 1, 'L'); c.px(5, 4, 'X'); c.px(5, 5, 'X'); }],
  ['bathroom_cabinet', (c) => { c.rect(3, 1, 10, 13, 'X'); c.rect(4, 2, 8, 8, 'METAL'); c.rect(5, 3, 2, 4, 'Hc5ccd1'); c.rect(7, 11, 2, 2, 'RED'); c.px(11, 6, 'W'); }],
  ['toolbox', (c) => { c.rect(1, 6, 14, 8, 'RED'); c.rect(1, 9, 14, 1, 'B'); c.rect(5, 3, 6, 3, 'L'); c.rect(6, 4, 4, 2, 'O'); c.rect(7, 8, 2, 3, 'A'); }],
  ['oil_lamp', (c) => { c.rect(7, 3, 2, 3, 'A'); c.px(7, 2, 'X'); c.rect(5, 6, 6, 4, 'H8a8f80'); c.rect(6, 7, 4, 2, 'Hd8c27a'); c.rect(4, 10, 8, 4, 'A'); c.rect(4, 13, 8, 1, 'R'); c.rect(5, 10, 6, 1, 'L'); }],
  ['debris', (c) => {
    c.rect(1, 11, 7, 2, 'R'); c.rect(6, 9, 2, 5, 'WOOD'); c.rect(9, 12, 5, 2, 'L'); c.rect(3, 13, 4, 1, 'WOODD');
    c.px(10, 10, 'METAL'); c.px(12, 11, 'X'); c.px(2, 10, 'WOOD'); c.px(13, 9, 'L');
  }],
], { outline: true, note: 'small/medium salvage props 16x16 + debris pile; draw on floor line' });

sheet('props_l', 32, 32, [
  ['table', (c) => { wood(c, 2, 10, 28, 4); c.rect(2, 14, 28, 1, 'WOODD'); c.rect(4, 15, 3, 15, 'WOODD'); c.rect(25, 15, 3, 15, 'WOODD'); c.rect(7, 16, 18, 1, 'WOODD'); }],
  ['kitchen_cupboard', (c) => { c.rect(3, 6, 26, 3, 'L'); c.rect(4, 9, 24, 21, 'R'); c.rect(4, 9, 24, 1, 'WOODD'); c.rect(15, 10, 2, 20, 'WOODD'); c.rect(6, 12, 8, 15, 'WOODD'); c.rect(18, 12, 8, 15, 'WOODD'); c.rect(7, 13, 6, 13, 'R'); c.rect(19, 13, 6, 13, 'R'); c.rect(12, 19, 2, 3, 'A'); c.rect(18, 19, 2, 3, 'A'); }],
  ['wardrobe', (c) => { c.rect(5, 2, 22, 28, 'R'); c.rect(5, 2, 22, 2, 'WOOD'); c.rect(15, 4, 2, 26, 'WOODD'); c.rect(7, 6, 7, 20, 'WOODD'); c.rect(18, 6, 7, 20, 'WOODD'); c.rect(8, 7, 5, 18, 'R'); c.rect(19, 7, 5, 18, 'R'); c.rect(13, 15, 1, 3, 'A'); c.rect(18, 15, 1, 3, 'A'); c.rect(5, 29, 22, 1, 'S'); }],
  ['bed_frame', (c) => { c.rect(2, 8, 3, 22, 'METAL'); c.rect(2, 8, 3, 1, 'X'); c.rect(2, 21, 28, 3, 'METAL'); c.rect(2, 21, 28, 1, 'X'); c.rect(28, 17, 2, 13, 'METAL'); for (let x = 6; x < 28; x += 3) c.rect(x, 24, 1, 5, 'L'); for (let x = 5; x < 28; x += 4) c.rect(x, 22, 2, 1, 'WOODD'); c.rect(3, 29, 2, 1, 'S'); c.rect(28, 29, 2, 1, 'S'); }],
  ['sofa', (c) => { c.rect(3, 10, 26, 12, 'H5b3a3a'); c.rect(3, 10, 26, 2, 'H704747'); c.rect(1, 15, 5, 11, 'H704747'); c.rect(26, 15, 5, 11, 'H704747'); c.rect(6, 18, 20, 8, 'H6a4242'); c.rect(15, 18, 1, 8, 'H4d3030'); c.rect(3, 26, 3, 3, 'WOODD'); c.rect(26, 26, 3, 3, 'WOODD'); }],
  ['interior_door', (c) => { c.rect(9, 1, 14, 29, 'R'); c.rect(9, 1, 14, 1, 'WOOD'); c.rect(11, 3, 10, 10, 'WOODD'); c.rect(12, 4, 8, 8, 'R'); c.rect(11, 16, 10, 12, 'WOODD'); c.rect(12, 17, 8, 10, 'R'); c.rect(20, 14, 2, 2, 'A'); }],
  ['fridge', (c) => { c.rect(7, 1, 18, 29, 'Hb8b4a8'); c.rect(22, 1, 3, 29, 'H9a978c'); c.rect(7, 10, 18, 1, 'L'); c.rect(9, 4, 1, 4, 'W'); c.rect(9, 13, 1, 8, 'W'); c.rect(9, 2, 8, 1, 'X'); c.rect(8, 29, 16, 1, 'S'); }],
  ['water_heater', (c) => { c.rect(10, 5, 14, 22, 'METAL'); c.rect(10, 5, 3, 22, 'X'); c.rect(21, 5, 3, 22, 'L'); c.rect(12, 2, 10, 3, 'L'); c.rect(14, 0, 2, 2, 'METAL'); c.rect(19, 0, 2, 2, 'METAL'); c.rect(15, 11, 4, 4, 'S'); c.px(16, 12, 'A'); c.rect(11, 27, 12, 3, 'W'); c.rect(25, 20, 3, 2, 'BLUE'); }],
  ['debris', (c) => {
    c.rect(2, 24, 14, 4, 'R'); c.rect(10, 20, 4, 9, 'WOOD'); c.rect(16, 25, 12, 3, 'L'); c.rect(5, 28, 9, 2, 'WOODD'); c.rect(18, 22, 5, 3, 'CLOTH');
    c.rect(24, 23, 3, 2, 'METAL'); c.rect(4, 21, 4, 3, 'WOOD'); c.px(20, 20, 'X'); c.px(13, 18, 'L');
  }],
], { outline: true, note: 'large/medium salvage props 32x32 + large debris; draw on floor line (bottom)' });

// ---------- build items 32x32 ----------
const barLv1 = (c) => {
    c.rect(2, 3, 28, 4, 'R'); c.rect(2, 13, 28, 4, 'R'); c.rect(2, 23, 28, 4, 'R');
    [3, 13, 23].forEach((y) => c.rect(2, y, 28, 1, 'WOOD'));
    c.line(4, 28, 27, 4, 'WOODD'); c.line(5, 28, 28, 4, 'WOODD'); c.line(4, 4, 27, 28, 'WOODD');
    [[4, 5], [26, 5], [4, 15], [26, 15], [4, 25], [26, 25], [15, 15]].forEach(([x, y]) => c.px(x, y, 'METAL'));
};
const barLv2 = (c) => {
    c.rect(1, 2, 30, 28, 'WOODD'); c.rect(2, 3, 28, 5, 'R'); c.rect(2, 13, 28, 5, 'R'); c.rect(2, 23, 28, 5, 'R');
    c.rect(2, 3, 28, 1, 'WOOD'); c.rect(2, 13, 28, 1, 'WOOD'); c.rect(2, 23, 28, 1, 'WOOD');
    c.rect(2, 8, 8, 5, 'METAL'); c.rect(22, 18, 8, 5, 'METAL'); c.rect(11, 8, 8, 5, 'L'); c.rect(3, 18, 8, 5, 'L');
    c.rect(2, 8, 28, 1, 'METAL'); [[3, 9], [8, 9], [24, 19], [28, 19], [13, 9], [5, 19]].forEach(([x, y]) => c.px(x, y, 'S'));
    c.rect(1, 17, 30, 1, 'L'); c.rect(1, 28, 30, 1, 'L'); // duct tape strips
    c.line(2, 29, 29, 3, 'WOOD');
};
sheet('build', 32, 32, [
  ['barricade_lv1', barLv1],
  ['barricade_lv2', barLv2],
  ['rain_collector', (c) => {
    c.rect(3, 6, 26, 3, 'METAL'); c.rect(2, 8, 28, 4, 'L'); c.rect(4, 8, 24, 2, 'BLUE'); c.rect(6, 12, 20, 2, 'W');
    c.rect(14, 14, 4, 5, 'L'); c.rect(8, 19, 16, 11, 'BLUE'); c.rect(8, 19, 16, 2, 'X'); c.rect(9, 22, 3, 6, 'H5f8f9a'); c.rect(8, 29, 16, 1, 'W'); c.px(16, 17, 'BLUE'); c.rect(4, 2, 3, 4, 'METAL');
  }],
  ['water_filter', (c) => {
    c.rect(9, 2, 14, 3, 'METAL'); c.rect(10, 5, 12, 5, 'DIRT'); c.rect(10, 10, 12, 4, 'CLOTH'); c.rect(10, 14, 12, 4, 'S'); c.rect(10, 18, 12, 3, 'X');
    c.rect(14, 21, 4, 3, 'L'); c.rect(11, 24, 10, 6, 'H5f8f9a'); c.rect(11, 24, 10, 1, 'X'); c.rect(9, 5, 1, 16, 'X'); c.rect(22, 5, 1, 16, 'X');
  }],
  ['planter', (c) => {
    c.rect(3, 18, 26, 12, 'R'); c.rect(3, 18, 26, 2, 'WOOD'); c.rect(4, 20, 24, 3, 'WOODD'); c.rect(4, 19, 24, 3, 'H3a2a1c');
    [[7, 12], [14, 10], [21, 13]].forEach(([x, y]) => { c.rect(x, y, 2, 8, 'GREEN'); c.rect(x - 2, y, 2, 2, 'GREEN'); c.rect(x + 2, y + 2, 2, 2, 'GREEN'); });
    c.rect(3, 28, 26, 2, 'WOODD');
  }],
  ['survivor_bed', (c) => {
    c.rect(2, 18, 28, 8, 'R'); c.rect(2, 18, 28, 1, 'WOOD'); c.rect(3, 15, 9, 4, 'X'); c.rect(12, 14, 17, 8, 'CLOTH'); c.rect(12, 14, 17, 1, 'H8f806c');
    c.rect(18, 16, 1, 6, 'H5f5344'); c.rect(24, 16, 1, 6, 'H5f5344'); c.rect(2, 26, 3, 4, 'WOODD'); c.rect(27, 26, 3, 4, 'WOODD'); c.rect(2, 12, 2, 14, 'WOODD');
  }],
  ['workbench', (c) => {
    wood(c, 2, 12, 28, 4); c.rect(2, 16, 28, 1, 'WOODD'); c.rect(4, 17, 3, 13, 'WOODD'); c.rect(25, 17, 3, 13, 'WOODD');
    c.rect(7, 22, 18, 2, 'R'); c.rect(8, 8, 3, 4, 'METAL'); c.rect(6, 6, 7, 2, 'METAL'); c.rect(16, 9, 8, 3, 'RED'); c.rect(16, 9, 8, 1, 'B');
    c.rect(26, 7, 2, 5, 'WOOD'); c.rect(25, 6, 4, 2, 'L'); c.rect(14, 10, 1, 2, 'A');
  }],
  ['hero_bed', (c) => {
    c.rect(2, 20, 28, 6, 'METAL'); c.rect(2, 20, 28, 1, 'X'); c.rect(2, 14, 3, 16, 'METAL'); c.rect(2, 14, 3, 1, 'X');
    c.rect(5, 15, 8, 5, 'X'); c.rect(13, 15, 16, 6, 'TD'); c.rect(13, 15, 16, 1, 'T'); c.rect(20, 16, 1, 5, 'S'); c.rect(25, 16, 1, 5, 'S');
    c.rect(26, 26, 3, 4, 'S'); c.rect(3, 26, 2, 4, 'S'); c.px(8, 16, 'A');
  }],
], { outline: true, note: 'home build items; barricade Lv1/Lv2 fill the stairwell opening; workbench; hero_bed = own bed of the hero (survivor_bed is separate)' });

// ---------- icons 8x8 ----------
const ICONS = {
  wood: ['.....nnk', '....nnnk', '...nnnk.', '..nnnk..', '.nnnk...', 'nnnk....', 'nnk.....', 'nk......'],
  metal: ['........', '.yyyy...', '.ylllyy.', '.yllllly', '..yyyyly', '.....yly', '......yy', '........'],
  cloth: ['........', '.cccccc.', '.cxxxxcc', '.cccccc.', '.cxxxxcc', '.cccccc.', '..cccc..', '........'],
  plastic: ['...ll...', '...ll...', '..uuuu..', '.uxuuuu.', '.uxuuuu.', '.uuuuuu.', '.uuuuuu.', '..uuuu..'],
  parts: ['...yy...', '.y.yy.y.', '..yyyy..', 'yyyooyyy', 'yyyooyyy', '..yyyy..', '.y.yy.y.', '...yy...'],
  seeds: ['...cc...', '..cccc..', '...cc...', '..cnnc..', '.cnanac.', '.cnnnnc.', '.cnanac.', '..cccc..'],
  glass: ['.....xx.', '....xux.', '...xuux.', '..xuuux.', '.xxuuxx.', 'xuuuxx..', 'xuxx....', 'xx......'],
  duct_tape: ['..yyyy..', '.yyyyyy.', 'yyllllyy', 'yl....ly', 'yl....ly', 'yyllllyy', '.yyyyyy.', '..yyyy..'],
  chemicals: ['..uu....', '.xxxxx..', 'xxuuuxx.', 'xxuuuxx.', 'xxxxxxx.', 'xxxxxxx.', 'xxxxxxx.', '.xxxxx..'],
  fuel: ['..RRR...', '.RRRRRR.', '.RaaaaR.', '.RRRRRR.', '.RaaaaR.', '.RRRRRR.', '.RRRRRR.', '.bbbbbb.'],
  canned_food: ['........', '.yyyyyy.', 'yaaaaaay', 'yaxRRxay', 'yaaaaaay', '.yyyyyy.', '........', '........'],
  dry_snack: ['........', '.aaaaaa.', 'aRRaaRRa', 'aaaRRaaa', 'aRRaaRRa', 'aaaaaaaa', '.aaaaaa.', '........'],
  planter_crop: ['....g...', '...gg...', '..RRRR..', '.RRxRRR.', '.RRRRRR.', '.RRRRRb.', '..bbbb..', '........'],
  water_bottle: ['...ll...', '..uuuu..', '..uxuu..', '..uuuu..', '..uuuu..', '..uuuu..', '..uuuu..', '...uu...'],
  chocolate: ['........', 'kkkkkkk.', 'kwkwkwk.', 'kkkkkkk.', 'kwkwkwk.', 'kkkkkkk.', 'kwkwkwk.', 'kkkkkkk.'],
  medkit: ['..xxxx..', 'xxxxxxxx', 'xxxRRxxx', 'xxRRRRxx', 'xxRRRRxx', 'xxxRRxxx', 'xxxxxxxx', 'oooooooo'],
  kitchen_knife: ['......ll', '.....lly', '....lly.', '...lly..', '..nl....', '.nn.....', 'nn......', 'n.......'],
  medical_bag: ['..oooo..', '.o....o.', 'tttttttt', 'ttxRRttt', 'ttRRRRtt', 'ttxRRttt', 'tttttttt', '.oooooo.'],
  dirty_water: ['...dd...', '...dd...', '..dddd..', '.dddddd.', '.ddkddd.', '.dddddd.', '..dddd..', '........'],
  clean_water: ['...uu...', '...uu...', '..uuuu..', '.uuxuuu.', '.uuxuuu.', '.uuuuuu.', '..uuuu..', '........'],
  bandage: ['........', '.xxxxxx.', 'xxxRRxxx', 'xxRRRRxx', 'xxRRRRxx', 'xxxRRxxx', '.xxxxxx.', '........'],
  spiked_bat: ['......nn', '....lnnn', '...nnnl.', '..lnnn..', '.nnnl...', 'nnnn....', 'knn.....', 'kk......'],
  molotov: ['...a....', '..aRa...', '...c....', '...ll...', '..dddd..', '.dduudd.', '.dddddd.', '..dddd..'],
  crowbar: ['....yyy.', '...y...y', '..yl....', '..ly....', '.yl.....', '.ly.....', 'yl......', 'yy......'],
  wrench: ['..yy.yy.', '.yyyyyy.', '.yy..yy.', '..yyyy..', '...yy...', '...yy...', '...yy...', '...yy...'],
  bar_health: ['.RR..RR.', 'RRRRRRRR', 'RRRRRRRR', 'RRRRRRRR', '.RRRRRR.', '..RRRR..', '...RR...', '........'],
  bar_food: ['....nnn.', '...nnnnn', '...nnnnn', '...nnnn.', '..nnn...', '.xx.....', 'xxx.....', 'xx......'],
  bar_water: ['...uu...', '..uuuu..', '..uuuu..', '.uuxuuu.', '.uuxuuu.', '.uuuuuu.', '..uuuu..', '........'],
  bar_energy: ['....aaa.', '...aaa..', '..aaa...', '.aaaaaa.', '...aaa..', '..aa....', '.aa.....', 'a.......'],
  bar_morale: ['..aaaa..', '.aaaaaa.', 'aoaaaoaa', 'aaaaaaaa', 'aoaaaaoa', 'aaooooaa', '.aaaaaa.', '..aaaa..'],
};
sheet('icons', 8, 8, Object.entries(ICONS).map(([n, g]) => [n, (c) => c.grid(g)]), {
  note: '8x8: 10 M1 materials, items, weapons/tools, HUD need bars' });

// ---------- action buttons 32x32 (native; = 96 game px) ----------
const BTN = {
  search: ['.xxxx...', 'x....x..', 'x....x..', 'x....x..', '.xxxx...', '....xx..', '.....xx.', '......xx'],
  dismantle: ['yyyyy...', 'yyyyyy..', 'yyyyyyn.', '..yynn..', '...nn...', '..nn....', '.nn.....', 'nn......'],
  drain: ICONS.clean_water,
  use: ['x.......', 'xx......', 'xxx.....', 'xxxx....', 'xxxxx...', 'xxx.....', 'x.xx....', '..xx....'],
  craft: ICONS.parts,
};
function button(c, grid, pressed) {
  c.rect(1, 1, 30, 30, pressed ? 'O' : 'S'); c.rect(2, 2, 28, 28, pressed ? 'H14171b' : 'H2b3138');
  c.rect(2, 2, 28, 1, pressed ? 'A' : 'L'); c.rect(2, 2, 1, 28, pressed ? 'A' : 'W'); c.rect(29, 2, 1, 28, pressed ? 'A' : 'S'); c.rect(2, 29, 28, 1, pressed ? 'A' : 'S');
  const t = new Cv(32, 32); t.grid(grid, 0, 0, 2); t.outline();
  c.blit(t, 8, 8 + (pressed ? 1 : 0));
}
function btnFrame(grid, pressed) {
  return (c) => {
    button(c, grid, pressed);
  };
}
sheet('buttons', 32, 32, [
  ...Object.entries(BTN).map(([n, g]) => [n, btnFrame(g, false)]),
  ...Object.entries(BTN).map(([n, g]) => [`${n}_pressed`, btnFrame(g, true)]),
], { animations: [], note: 'action buttons 32x32 native (96 game px): frames 0-4 normal, 5-9 pressed (Search, Dismantle, Drain, Use, Craft)' });

// ---------- effects ----------
sheet('fx_dust', 16, 16, [0, 1, 2, 3].map((i) => [`puff_${i}`, (c) => {
  reseed(700 + i);
  const r = [3, 5, 6, 7][i], dens = [1, 0.85, 0.55, 0.3][i], cy = [11, 10, 8, 6][i];
  const cols = [['X', 'L'], ['L', 'L'], ['L', 'W'], ['W', 'W']][i];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const dx = x - 8, dy = (y - cy) * 1.2;
    if (dx * dx + dy * dy <= r * r && rnd() < dens) c.px(x, y, rnd() < 0.5 ? cols[0] : cols[1]);
  }
}]), { animations: [anim('puff', [0, 1, 2, 3], 12, 0)], note: 'dust puff when an object is dismantled; no outline' });

sheet('fx_spark', 16, 16, [
  ['spark_0', (c) => { c.rect(7, 6, 2, 4, 'X'); c.rect(6, 7, 4, 2, 'X'); }],
  ['spark_1', (c) => {
    c.rect(7, 2, 2, 12, 'A'); c.rect(2, 7, 12, 2, 'A'); c.line(3, 3, 12, 12, 'X'); c.line(12, 3, 3, 12, 'X'); c.rect(6, 6, 4, 4, 'X');
  }],
  ['spark_2', (c) => { [[3, 3], [12, 4], [4, 12], [12, 12], [8, 1], [1, 8], [14, 8], [8, 14]].forEach(([x, y]) => c.px(x, y, 'A')); c.px(5, 5, 'X'); c.px(10, 10, 'X'); }],
], { animations: [anim('hit', [0, 1, 2], 18, 0)], note: 'hit spark; no outline' });


// ---------- Floor 15 additions ----------
function lyingHuman(c, { skin, shirt, pants, hair }) { // fallen backwards, head left, 16x24 (bottom rows)
  c.rect(1, 18, 5, 5, skin); c.rect(1, 18, 2, 5, hair); c.px(4, 20, 'O'); c.rect(6, 19, 5, 4, shirt); c.px(8, 20, 'A');
  c.rect(11, 20, 4, 3, pants); c.px(15, 22, 'S'); c.rect(5, 22, 3, 1, 'B');
}
const deathFrames = (o, lyOpts) => [
  ['death_0', (c) => human(c, { ...o, bob: 2, headDx: -1, legB: [-1, 0], legF: [1, 0], armF: [-2, 2], armB: [-2, 3] })],
  ['death_1', (c) => human(c, { ...o, bob: 5, headDx: -2, legB: [-1, 0], legF: [-2, 0], armF: [-3, 1], armB: [-3, 2], mouth: 'open' })],
  ['death_2', (c) => lyingHuman(c, lyOpts)],
];
sheet('hero_death', 16, 24, deathFrames({}, { skin: 'SK', shirt: 'T', pants: 'PANT', hair: 'S' }),
  { outline: true, animations: [anim('death', [0, 1, 2], 6, 0)], note: 'hero death one-shot; faces right; last frame stays' });
sheet('mara_death', 16, 24, deathFrames(mara, { skin: 'SK', shirt: 'X', pants: 'T', hair: 'WOODD' }),
  { outline: true, animations: [anim('death', [0, 1, 2], 6, 0)], note: 'Mara death one-shot; faces right; last frame stays' });

// molotov fire patch: tile horizontally (16 px period, no outline so tiles join seamlessly)
sheet('fx_fire', 16, 16, [0, 1, 2].map((i) => [`flame_${i}`, (c) => {
  for (let x = 0; x < 16; x++) {
    const t = (x / 16) * Math.PI * 2;
    const ph = i * (Math.PI * 2 / 3);
    const h = Math.round(7 + 2.2 * Math.sin(t * 2 + ph) + 1.6 * Math.sin(t * 3 - ph * 2 + 1) + 0.8 * Math.sin(t + ph));
    const top = 15 - h;
    c.rect(x, top, 1, 16 - top, 'RED');
    const h2 = Math.max(2, h - 3);
    c.rect(x, 15 - h2, 1, h2 + 1, 'A');
    if (h > 7 && (x + i) % 2 === 0) c.rect(x, 15 - Math.max(1, h2 - 3), 1, Math.max(1, h2 - 3) + 1, 'Hd8c27a');
    c.px(x, 15, 'B');
  }
}]), { animations: [anim('burn', [0, 1, 2], 10, -1)], note: 'molotov fire patch; seamless horizontal tile (16 px period), flames rise from bottom row; no outline' });

sheet('fx_noise', 16, 16, [[3, 'X'], [5, 'L'], [7, 'W']].map(([r, col], i) => [`ring_${i}`, (c) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d <= r + 0.5 && d > r - (i === 2 ? 0.9 : 1.4)) c.px(x, y, col);
  }
}]), { animations: [anim('ring', [0, 1, 2], 10, 0)], note: 'expanding noise ring, one-shot; no outline; tint/scale in game' });

const splinter = (c, pts) => pts.forEach(([x, y]) => c.px(x, y, 'WOODD'));
sheet('build_damaged', 32, 32, [
  ['barricade_lv1_damaged', (c) => {
    barLv1(c);
    c.clear(10, 12, 7, 6); c.clear(20, 22, 6, 5); c.clear(3, 2, 4, 3); // broken planks / gaps
    splinter(c, [[9, 14], [17, 16], [19, 24], [26, 25], [7, 4]]);
  }],
  ['barricade_lv2_damaged', (c) => {
    barLv2(c);
    c.clear(12, 9, 8, 5); c.clear(4, 19, 6, 5); c.clear(24, 3, 5, 4); // blown-out sections
    c.line(12, 9, 19, 13, 'O'); c.line(4, 19, 9, 23, 'O');
    splinter(c, [[11, 11], [20, 12], [10, 21], [23, 6], [29, 7]]);
  }],
], { outline: true, note: 'damaged barricade lv1 (0) and lv2 (1), same footprint as build.png barricade frames' });

// ---------- Milestone 2 stage 1 additions ----------
// Moodles 16x16: frames 0-3 = empty frame backgrounds (severity 1-4), then <name>_1.._4 per moodle (background + pictogram baked in).
const PIC = {
  hungry: ['............', '............', '..#.......#.', '..#..###..#.', '..#.#...#.#.', '..#.#...#.#.', '..#.#...#.#.', '..#..###..#.', '..#.......#.', '..#.......#.', '............', '............'],
  thirsty: ['.....##.....', '.....##.....', '....####....', '....####....', '...######...', '..########..', '..########..', '..###d####..', '..###d####..', '...######...', '....####....', '............'],
  tired: ['............', '............', '............', '#..........#', '.#........#.', '..##....##..', '....####....', '..#..#..#...', '.#...#...#..', '............', '............', '............'],
  injured: ['............', '.........##.', '........###.', '.......####.', '......##d##.', '.....##d##..', '....##d##...', '...####.....', '..###.......', '..##........', '............', '............'],
  depressed: ['............', '....###.....', '...#####.##.', '..#########.', '.###########', '.###########', '..#########.', '............', '...#..#..#..', '..#..#..#...', '............', '............'],
  panic: ['............', '....####....', '..##....##..', '.#..####..#.', '#..######..#', '#..##dd##..#', '#..##dd##..#', '.#..####..#.', '..##....##..', '....####....', '............', '............'],
};
const MDBG = ['MD1', 'MD2', 'MD3', 'MD4'];
function moodleFrame(c, sev, pic) {
  c.rect(1, 0, 14, 16, 'O'); c.rect(0, 1, 16, 14, 'O'); // rounded corners
  c.rect(1, 1, 14, 14, MDBG[sev]);
  if (sev >= 1) { c.rect(1, 1, 14, 1, 'O'); c.rect(1, 1, 1, 14, 'O'); c.rect(14, 1, 1, 14, 'O'); c.rect(1, 14, 14, 1, 'O'); }
  if (sev >= 2) { c.rect(2, 2, 12, 1, 'WOODD'); c.rect(2, 13, 12, 1, 'WOODD'); c.rect(2, 2, 1, 12, 'WOODD'); c.rect(13, 2, 1, 12, 'WOODD'); }
  if (sev >= 3) { c.px(2, 3, 'O'); c.px(13, 12, 'O'); c.px(12, 2, 'B'); }
  if (!pic) return;
  const col = ['PALE', 'PALE', 'X', 'X'][sev];
  PIC[pic].forEach((r, y) => [...r].forEach((ch, x) => {
    if (ch === '.') return;
    c.px(2 + x, 2 + y, ch === 'd' ? MDBG[sev] : col);
  }));
}
sheet('moodles', 16, 16, [
  ...[0, 1, 2, 3].map((sv) => [`frame_${sv + 1}`, (c) => moodleFrame(c, sv, null)]),
  ...Object.keys(PIC).flatMap((n) => [0, 1, 2, 3].map((sv) => [`${n}_${sv + 1}`, (c) => moodleFrame(c, sv, n)])),
], { note: 'moodles 16x16 (48 game px): frames 0-3 empty backgrounds L1-L4, then hungry/thirsty/tired/injured/depressed/panic x L1-L4 (index = 4 + moodleIndex*4 + level-1); background darkens with severity; no outline; wobble in game' });

// Barricade damage: 5 stages per level (0 intact .. 4 nearly broken)
const STAGE_CLEARS = {
  lv1: [
    [],
    [[3, 2, 3, 2], [24, 24, 4, 3]],
    [[3, 2, 4, 3], [10, 12, 7, 6], [24, 24, 4, 3]],
    [[3, 2, 4, 3], [10, 12, 7, 6], [20, 22, 6, 5], [16, 2, 12, 5], [2, 24, 8, 4]],
    [[0, 0, 32, 10], [10, 12, 12, 6], [20, 20, 12, 12], [0, 24, 14, 8], [0, 12, 6, 6]],
  ],
  lv2: [
    [],
    [[24, 3, 3, 2], [4, 19, 3, 2]],
    [[12, 9, 8, 5], [24, 3, 5, 4], [4, 19, 3, 2]],
    [[12, 9, 8, 5], [4, 19, 6, 5], [24, 3, 5, 4], [22, 19, 8, 5], [2, 3, 8, 5]],
    [[0, 0, 32, 8], [12, 9, 10, 6], [4, 19, 10, 6], [22, 18, 10, 14], [0, 26, 10, 6]],
  ],
};
const STAGE_SPLINTERS = [
  [], [[12, 14], [26, 25]], [[9, 14], [17, 16], [26, 25]], [[9, 14], [17, 16], [19, 24], [26, 25], [7, 4], [14, 6]],
  [[9, 14], [17, 16], [19, 24], [26, 25], [7, 12], [14, 8], [22, 14], [5, 20]],
];
const stageFrame = (lv, st) => (c) => {
  (lv === 'lv1' ? barLv1 : barLv2)(c);
  STAGE_CLEARS[lv][st].forEach(([x, y, w, h]) => c.clear(x, y, w, h));
  if (st >= 1) { c.line(15, 3, 17, 7, 'O'); if (st >= 2) c.line(5, 14, 9, 17, 'O'); if (st >= 3) c.line(20, 13, 25, 17, 'O'); }
  splinter(c, STAGE_SPLINTERS[st]);
};
sheet('barricade_stages', 32, 32, ['lv1', 'lv2'].flatMap((lv) => [0, 1, 2, 3, 4].map((st) => [`${lv}_stage_${st}`, stageFrame(lv, st)])),
  { outline: true, note: 'barricade damage stages 32x32: frames 0-4 = Lv1 stage 0 (intact) to 4 (nearly broken), frames 5-9 = Lv2 stage 0-4; same footprint as build.png' });

// Lighting: white radial alpha sprites; tint or erase in game (nearest-filtered is fine, gradient is 8-bit alpha)
function radial(c, w, h, power, tint) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
    const a = Math.max(0, 1 - d); const al = Math.round(255 * Math.pow(a, power));
    if (al > 0) c.px(x, y, [tint[0], tint[1], tint[2], al]);
  }
}
sheet('light_pool', 64, 32, [['pool', (c) => radial(c, 64, 32, 1.4, [255, 244, 220])]],
  { note: 'soft elliptical light pool 64x32, white-warm with alpha falloff; tint amber/cool, scale in game, or erase from darkness overlay' });
sheet('light_pool_l', 128, 64, [['pool', (c) => radial(c, 128, 64, 1.4, [255, 244, 220])]],
  { note: 'soft elliptical light pool 128x64 (large lamps, window shafts); same as light_pool' });
sheet('vignette', 64, 64, [['vignette', (c) => {
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const d = Math.hypot((x + 0.5 - 32) / 32, (y + 0.5 - 32) / 32);
    const t = Math.min(1, Math.max(0, (d - 0.35) / 0.65));
    c.px(x, y, [11, 12, 14, Math.round(255 * t * t * (3 - 2 * t))]);
  }
}]], { note: 'radial vignette overlay 64x64: transparent centre, near-black edges and corners; scale to cover the screen, use as a stretched image with setAlpha' });

sheet('rain_window', 32, 32, [0, 1, 2].map((i) => [`rain_${i}`, (c) => {
  const shift = [0, 10, 21][i];
  reseed(900);
  for (let k = 0; k < 9; k++) {
    const x = 2 + ((rnd() * 28) | 0), y0 = (rnd() * 32) | 0, len = 4 + ((rnd() * 6) | 0), sp = 1 + ((rnd() * 0.01) | 0);
    for (let j = 0; j < len; j++) c.px(x, (y0 + shift * sp + j) % 32, [180, 192, 198, j === len - 1 ? 150 : 70 + j * 8]);
    if (k % 3 === 0) c.px(x + 1, (y0 + shift + len + 2) % 32, [200, 208, 212, 90]);
  }
}]), { animations: [anim('rain', [0, 1, 2], 8)], note: 'rain streaks on a window pane, transparent, loops (each frame shifts streaks down; wraps at 32); overlay on window prop' });

sheet('dust', 8, 8, [0, 1, 2, 3].map((i) => [`mote_${i}`, (c) => {
  const pos = [[[2, 5], [5, 2]], [[2, 4], [5, 3]], [[3, 4], [4, 3], [6, 5]], [[3, 3], [5, 4]]][i];
  c.px(pos[0][0], pos[0][1], [189, 184, 171, 200]);
  c.px(pos[1][0], pos[1][1], [189, 184, 171, 120]);
  if (pos[2]) c.px(pos[2][0], pos[2][1], [189, 184, 171, 70]);
}]), { animations: [anim('mote', [0, 1, 2, 3], 3)], note: 'slow dust mote loop 8x8, 1-3 faint specks; tint/scale/alpha in game' });

// ---------- Floor 15 non-gamey HUD (GDD 8 muted UI style, GDD 9 UI art) ----------
const disc = (c, cx, cy, r, col) => { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) c.px(x, y, col); };
const gridN = (c, rows, col = 'X') => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '#') c.px(x, y, col); }));
const thick = (c, x0, y0, x1, y1, col, dx = 1, dy = 0) => { c.line(x0, y0, x1, y1, col); c.line(x0 + dx, y0 + dy, x1 + dx, y1 + dy, col); };

// hud_icons 16x16: single flat colour UI text #bdb8ab (key X), no outline; alpha is set in game
sheet('hud_icons', 16, 16, [
  ['house', (c) => gridN(c, ['................', '.......##.......', '......####......', '.....######.....', '....########....', '...##########...', '..############..', '.##############.', '....########....', '....########....', '....###..###....', '....###..###....', '....###..###....', '....###..###....', '................', '................'])],
  ['bag', (c) => gridN(c, ['................', '......####......', '.....#....#.....', '.....#....#.....', '....########....', '...##########...', '...##########...', '...##########...', '...###....###...', '...###....###...', '...##########...', '...##########...', '...##########...', '...##########...', '....########....', '................'])],
  ['hammer', (c) => gridN(c, ['................', '................', '..###########...', '.############...', '.############...', '..###########...', '.......##.......', '.......##.......', '.......##.......', '.......##.......', '.......##.......', '.......##.......', '.......##.......', '.......##.......', '.......##.......', '................'])],
  ['two_heads', (c) => gridN(c, ['................', '..###......###..', '.#####....#####.', '.#####....#####.', '.#####....#####.', '..###......###..', '................', '.#####....#####.', '#######..#######', '#######..#######', '#######..#######', '#######..#######', '#######..#######', '................', '................', '................'])],
  ['dots', (c) => { [1, 6, 11].forEach((x) => { c.rect(x, 6, 4, 4, 'X'); c.px(x, 6, null); }); [1, 6, 11].forEach((x) => { c.d.fill(0, (6 * 16 + x) * 4, (6 * 16 + x) * 4 + 4); c.d.fill(0, (6 * 16 + x + 3) * 4, (6 * 16 + x + 3) * 4 + 4); c.d.fill(0, (9 * 16 + x) * 4, (9 * 16 + x) * 4 + 4); c.d.fill(0, (9 * 16 + x + 3) * 4, (9 * 16 + x + 3) * 4 + 4); }); }],
  ['bottle', (c) => gridN(c, ['................', '.......##.......', '.......##.......', '......####......', '.......##.......', '.......##.......', '.......##.......', '.....######.....', '....########....', '....########....', '....########....', '....#......#....', '....#......#....', '....########....', '.....######.....', '................'])],
  ['hand', (c) => { c.rect(2, 5, 2, 5, 'X'); c.rect(5, 2, 2, 8, 'X'); c.rect(8, 1, 2, 9, 'X'); c.rect(11, 3, 2, 7, 'X'); c.rect(2, 9, 11, 4, 'X'); c.rect(4, 13, 7, 2, 'X'); c.rect(0, 8, 2, 3, 'X'); c.rect(1, 11, 2, 2, 'X'); }],
  ['knife', (c) => { for (let i = 0; i < 8; i++) { c.rect(13 - i - 1, 1 + i, 3, 1, 'X'); } c.px(13, 1, null); c.line(3, 7, 9, 13, 'X'); c.line(4, 7, 9, 12, 'X'); c.line(3, 8, 8, 13, 'X'); thick(c, 6, 10, 2, 14, 'X', 1, 0); c.rect(1, 13, 3, 2, 'X'); }],
  ['bat', (c) => { for (let i = 0; i < 12; i++) { const x = 13 - i, y = 2 + i; if (i < 6) c.rect(x - 1, y - 1, 3, 2, 'X'); else c.rect(x, y, 2, 1, 'X'); } c.rect(11, 1, 3, 1, 'X'); c.rect(14, 2, 1, 3, 'X'); c.rect(1, 13, 3, 2, 'X'); }],
  ['speaker_on', (c) => { c.rect(1, 6, 3, 4, 'X'); for (let i = 0; i < 4; i++) c.rect(4 + i, 5 - i, 1, 6 + i * 2, 'X'); [[9, 6], [10, 7], [10, 8], [9, 9], [11, 4], [12, 5], [13, 6], [13, 7], [13, 8], [13, 9], [12, 10], [11, 11]].forEach(([x, y]) => c.px(x, y, 'X')); }],
  ['speaker_off', (c) => { c.rect(1, 6, 3, 4, 'X'); for (let i = 0; i < 4; i++) c.rect(4 + i, 5 - i, 1, 6 + i * 2, 'X'); thick(c, 9, 5, 14, 10, 'X', 0, 1); thick(c, 14, 5, 9, 10, 'X', 0, 1); }],
], { note: 'HUD pictograms 16x16 (48 game px), flat #bdb8ab, no outline; set alpha in game (0.7, pressed 0.9). Order: house bag hammer two_heads dots bottle hand knife bat speaker_on speaker_off' });

// moodles_l 24x24: same layout as moodles (frame_1..4, then <id>_<1..4>), larger and cleaner
const PICL = {
  hungry: (c, col) => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) { const d = Math.hypot(x + 0.5 - 12, y + 0.5 - 12); if (d <= 5.2 && d >= 3) c.px(x, y, col); }
    c.rect(3, 4, 1, 5, col); c.rect(5, 4, 1, 5, col); c.rect(3, 8, 3, 2, col); c.rect(4, 10, 1, 9, col);
    c.rect(19, 4, 2, 9, col); c.rect(20, 13, 1, 6, col); c.px(19, 4, null);
  },
  thirsty: (c, col, bg) => {
    for (let y = 3; y <= 12; y++) c.rect(Math.round(12 - (y - 3) * 0.6), y, Math.round((y - 3) * 1.2) + 1, 1, col);
    disc(c, 12, 14, 5.8, col); c.rect(9, 12, 1, 4, bg);
  },
  tired: (c, col) => {
    for (let x = 3; x <= 20; x++) { const t = (x + 0.5 - 12) / 9; if (Math.abs(t) > 1) continue; c.rect(x, Math.round(8 + 6 * Math.sqrt(1 - t * t)), 1, 2, col); }
    [6, 9, 12, 15, 18].forEach((x) => { const t = (x + 0.5 - 12) / 9, y = Math.round(8 + 6 * Math.sqrt(1 - t * t)); c.rect(x, y + 2, 1, 3, col); });
  },
  injured: (c, col, bg) => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
      const a = Math.abs(x + y - 23), b = x - y;
      if (a <= 4 && Math.abs(b) <= 13) c.px(x, y, col);
      if (a <= 2 && Math.abs(b) <= 4) c.px(x, y, bg);
      if (a <= 1 && Math.abs(b) <= 2) c.px(x, y, col);
    }
  },
  depressed: (c, col) => {
    disc(c, 8, 11, 4, col); disc(c, 13, 9, 5, col); disc(c, 18, 11.5, 3.5, col); c.rect(8, 11, 11, 4, col);
    [[7, 17], [12, 18], [17, 17]].forEach(([x, y]) => { c.px(x + 1, y, col); c.px(x, y + 1, col); c.px(x, y + 2, col); });
  },
  panic: (c, col, bg) => {
    for (let y = 3; y <= 20; y++) { const hw = Math.round(1 + (y - 3) * 0.5); c.rect(12 - hw, y, hw * 2, 1, col); }
    c.rect(11, 9, 2, 6, bg); c.rect(11, 17, 2, 2, bg);
  },
};
function moodleFrameL(c, sev, pic) {
  const bg = MDBG[sev];
  c.rect(2, 0, 20, 24, 'O'); c.rect(0, 2, 24, 20, 'O'); c.rect(1, 1, 22, 22, 'O');
  c.rect(1, 2, 22, 20, bg); c.rect(2, 1, 20, 22, bg);
  if (sev >= 1) { c.rect(2, 1, 20, 1, 'O'); c.rect(2, 22, 20, 1, 'O'); c.rect(1, 2, 1, 20, 'O'); c.rect(22, 2, 1, 20, 'O'); }
  if (sev >= 2) { c.rect(3, 2, 18, 1, 'WOODD'); c.rect(3, 21, 18, 1, 'WOODD'); c.rect(2, 3, 1, 18, 'WOODD'); c.rect(21, 3, 1, 18, 'WOODD'); }
  if (sev >= 3) { c.px(3, 5, 'O'); c.px(4, 6, 'O'); c.px(20, 17, 'O'); c.px(19, 18, 'O'); c.px(18, 2, 'B'); c.px(19, 3, 'B'); }
  if (pic) PICL[pic](c, ['PALE', 'PALE', 'X', 'X'][sev], bg);
}
sheet('moodles_l', 24, 24, [
  ...[0, 1, 2, 3].map((sv) => [`frame_${sv + 1}`, (c) => moodleFrameL(c, sv, null)]),
  ...Object.keys(PICL).flatMap((n) => [0, 1, 2, 3].map((sv) => [`${n}_${sv + 1}`, (c) => moodleFrameL(c, sv, n)])),
], { note: 'moodles 24x24 (72 game px), same layout as moodles: frames 0-3 empty backgrounds L1-L4, then hungry/thirsty/tired/injured/depressed/panic x L1-L4 (index = 4 + moodleIndex*4 + level-1); no outline pictograms; wobble in game' });

// stencil_digits 10x16: faded stairwell wall paint, colour #5d6166 (L); set alpha 0.6 in game. Frame n = digit n.
const SEG = { a: [0, 0, 10, 2], b: [8, 2, 2, 5], c: [8, 7, 2, 5], d: [0, 12, 10, 2], e: [0, 7, 2, 5], f: [0, 2, 2, 5], g: [0, 6, 10, 2] };
const DIGSEG = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];
sheet('stencil_digits', 10, 16, DIGSEG.map((segs, n) => [String(n), (c) => {
  reseed(1500 + n * 37);
  [...segs].forEach((s) => c.rect(...SEG[s], 'L'));
  for (let i = 0; i < 14; i++) { const x = (rnd() * 10) | 0, y = (rnd() * 14) | 0; if (c.get(x, y)) c.px(x, y, 'W'); } // faded patches
  const chips = 2;
  for (let i = 0; i < chips; i++) { // chipped gaps
    const x = (rnd() * 9) | 0, y = (rnd() * 13) | 0;
    c.clear(x, y, 1 + ((rnd() * 2) | 0), 1);
  }
  for (let i = 0; i < 3; i++) c.clear((rnd() * 10) | 0, (rnd() * 14) | 0, 1, 1);
  if ('0689'.includes(String(n))) { c.clear(0, 6, 1, 1); c.clear(9, 7, 1, 1); } // stencil bridge breaks
  const cols = []; // drip from the lowest painted pixel of a random column
  for (let x = 0; x < 10; x++) { let ly = -1; for (let y = 0; y < 14; y++) if (c.get(x, y)) ly = y; if (ly >= 0) cols.push([x, ly]); }
  const [dx, ly] = cols[(rnd() * cols.length) | 0];
  const len = 2 + ((rnd() * 2) | 0);
  for (let y = ly + 1; y <= Math.min(15, ly + len); y++) c.px(dx, y, y === ly + len ? 'W' : 'L');
}]), { note: 'stairwell wall stencil digits 10x16 (30x48 game px), frame n = digit n (names "0".."9"); colour #5d6166, draw at alpha 0.6; chipped, one drip each; no outline' });

// panel_button 32x16, 9-slice with 4 px borders (centre and edges are uniform, details live in the corners)
function panelBtn(base, hi, lo, pressed) {
  return (c) => {
    c.rect(0, 0, 32, 16, lo); c.rect(1, 1, 30, 14, base);
    c.rect(1, 1, 30, 1, pressed ? lo : hi); c.rect(1, 14, 30, 1, pressed ? hi : lo);
    c.rect(1, 1, 1, 14, pressed ? lo : hi); c.rect(30, 1, 1, 14, pressed ? hi : lo);
    [[0, 0], [31, 0], [0, 15], [31, 15]].forEach(([x, y]) => c.clear(x, y, 1, 1));
    [[1, 1], [30, 1], [1, 14], [30, 14]].forEach(([x, y]) => c.px(x, y, lo));
    [[2, 2], [29, 13]].forEach(([x, y]) => c.px(x, y, lo)); // worn corner specks
    c.px(3, 12, hi); c.px(28, 3, hi);
  };
}
sheet('panel_button', 32, 16, [
  ['grey', panelBtn('#23272c', '#2d3238', '#16191d', false)],
  ['rust', panelBtn('#5a3a2a', '#6b4633', '#3b261c', false)],
  ['grey_pressed', panelBtn('#1b1e22', '#2d3238', '#0f1114', true)],
  ['rust_pressed', panelBtn('#4a2f22', '#6b4633', '#2e1d15', true)],
], { note: 'flat panel buttons 32x16 for 9-slice (slice 4 px each side; centre and edges are uniform): grey #23272c, rust #5a3a2a (confirm action), then pressed variants; frames 0 grey, 1 rust, 2 grey_pressed, 3 rust_pressed; use UI text #bdb8ab or disabled #5d6166 on top' });

// ---------- manifest ----------
const list = Object.values(files);
const total = list.reduce((s, f) => s + f.bytes, 0);
const manifest = {
  version: 1, milestone: 'M2', note: 'Placeholder art (M2 dark palette, GDD 9). Native pixels; scale 3x with pixelArt. Frames are horizontal strips. Paths are relative to the site root.',
  files: list.map(({ bytes, ...f }) => f),
};
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1) + '\n');
console.log(`art written: ${list.length} sheets, ${total} bytes (png)`);
