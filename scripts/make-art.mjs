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
  RED: '#68403a', A: '#c08a3e', Z: '#5f6650', SK: '#a99886', T: '#34494b', X: '#bdb8ab',
  // extras
  TD: '#28393b', WOOD: '#66503c', WOODD: '#33211a', BLUE: '#3f5a64', DIRT: '#5a4e2e', GREEN: '#465a3c',
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
  // C2/C3 additions (appended)
  sheet_metal: ['..yyyyyy', '.yxyxyxy', '.yyyyyyy', 'yxyxyxy.', 'yyyyyyy.', 'yxyxyxy.', 'yyyyyyy.', 'oooooo..'],
  concrete_block: ['........', '.llllll.', 'lwwwwwwo', 'lwoooowo', 'lwoooowo', 'lwwwwwwo', '.oooooo.', '........'],
  hammer: ['..yyyyy.', '..yllly.', '..yyyyy.', '...nn...', '...nn...', '...nn...', '...nn...', '...kk...'],
  sledgehammer: ['yyyyyyyy', 'yllllllo', 'yyyyyyyy', '...nn...', '...nn...', '...nn...', '...nn...', '...kk...'],
  fire_axe: ['..RRRR..', '.RRRRRl.', '.RRRnl..', '...nn...', '..nn....', '..nn....', '.nn.....', '.kk.....'],
  pistol: ['........', 'yyyyyyy.', 'ylllllly', 'yyyyyyyy', '.oyy....', '.ooy....', '.oo.....', '........'],
  shotgun: ['........', '.......y', 'yyyyyyyy', 'llllllll', 'nnnnyyyy', 'nnnnoo..', 'nnn.....', '........'],
  hunting_rifle: ['........', '...uuu..', 'yyyyyyyy', 'nnnlllll', 'nnnnoy..', 'nnn.o...', '........', '........'],
  pistol_ammo: ['.aa..aa.', '.aa..aa.', '.yy..yy.', '.yy..yy.', '.yy..yy.', '.yy..yy.', '........', '........'],
  shotgun_shell: ['.RR..RR.', '.RR..RR.', '.RR..RR.', '.aa..aa.', '.aa..aa.', '.aa..aa.', '........', '........'],
  rifle_round: ['...x.x..', '...a.a..', '...y.y..', '...y.y..', '...y.y..', '...y.y..', '...y.y..', '........'],
  spike_strip: ['.l..l..l', '.l..l..l', 'yl.yl.yl', 'yyyyyyyy', 'yooooooy', '........', '........', '........'],
  alarm_lure: ['.y....y.', '.yyyyyy.', 'yxxxxxxy', 'yxxaaxxy', 'yxxaaxxy', 'yxxxxxxy', '.yyyyyy.', '.o....o.'],
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

// ---------- blood FX (own rng so earlier assets stay byte-identical) ----------
let bseed = 1507;
const brnd = () => ((bseed = (bseed * 1664525 + 1013904223) >>> 0) / 4294967296);
const BL = ['#2c0f0f', '#4e1c1a', '#5e2422', '#7a2f2a']; // darkest, dark, mid, wet highlight
// fw x fh canvas, impact at (ox, oy), spray goes right. frames = number of frames.
function bloodFx(fw, fh, ox, oy, nFrames, nDrops, reach, seedV) {
  bseed = seedV;
  const drops = Array.from({ length: nDrops }, () => ({
    a: (brnd() - 0.5) * 1.7, v: 0.5 + brnd() * 0.5, big: brnd() < 0.35, k: brnd(),
  }));
  const blobR = fw / 6;
  const out = [];
  for (let f = 0; f < nFrames; f++) {
    const p = f / (nFrames - 1); // 0..1
    out.push([f === 0 && nFrames === 5 ? 'splash_0' : null, (c) => {
      const put = (x, y, i) => c.px(Math.round(x), Math.round(y), BL[i]);
      if (f === 0) { // impact burst: irregular blob + short stubs
        for (let y = -6; y <= 6; y++) for (let x = -5; x <= 6; x++) {
          const d = Math.hypot(x * 0.9, y) + (brnd() - 0.5) * 1.6;
          if (d <= blobR) put(ox + x, oy + y, d < blobR * 0.45 ? 2 : 1);
        }
        put(ox - 1, oy - 1, 3); put(ox, oy - 2, 3);
        drops.forEach((d) => { const L = 2 + d.v * 3; for (let s = blobR - 1; s < blobR + L; s++) put(ox + Math.cos(d.a) * s + 1, oy + Math.sin(d.a) * s, d.big ? 1 : 0); });
        return;
      }
      const t = f / (nFrames - 1);
      if (f <= 2 || nFrames < 5) { // fading remains of the burst at the source
        const r = Math.max(0, blobR * (1 - t * 1.3));
        for (let y = -4; y <= 4; y++) for (let x = -3; x <= 4; x++) if (Math.hypot(x, y) <= r) put(ox + x, oy + y, 1);
      }
      drops.forEach((d) => {
        const tt = Math.min(1, t * (1 + d.k * 0.2));
        const x = ox + 1 + Math.cos(d.a) * d.v * reach * Math.sqrt(tt) * 1.15;
        const y = oy + Math.sin(d.a) * d.v * reach * Math.sqrt(tt) + tt * tt * reach * 0.55;
        const fade = t > 0.7 && d.k < 0.5; // some droplets already gone late
        if (fade) return;
        const late = t > 0.5;
        put(x, y, late ? 0 : (d.big ? 1 : 2));
        if (d.big && !late) { put(x - 1, y, 1); put(x, y - 1, 3); if (t < 0.5) put(x - 1, y - 1, 1); }
        else if (!late && t < 0.55) put(x - 1, y - d.a * 0.6, 0); // motion trail
      });
      if (t > 0.3 && t < 0.8) for (let i = 0; i < 6; i++) { // thin arc dots following the spray
        const u = i / 5, ax = ox + 2 + u * reach * 0.9 * t, ay = oy - Math.sin(u * Math.PI) * reach * 0.28 * (1 - t * 0.5);
        if ((i + f) % 2 === 0) put(ax, ay, 1);
      }
    }]);
  }
  return out.map(([, fn], i) => [`${fn ? '' : ''}${i}`, fn]);
}
const bloodNamed = (pfx, frames) => frames.map(([i, fn]) => [`${pfx}_${i}`, fn]);
sheet('fx_blood', 24, 24, bloodNamed('splash', bloodFx(24, 24, 4, 12, 5, 11, 17, 1507)),
  { animations: [anim('splash', [0, 1, 2, 3, 4], 16, 0)], note: 'blood splash, faces right (flip in code for left hits); dark blood tones, no outline; impact point at about (4,12)' });
sheet('fx_blood_small', 16, 16, bloodNamed('spatter', bloodFx(16, 16, 3, 8, 4, 6, 11, 2203)),
  { animations: [anim('spatter', [0, 1, 2, 3], 16, 0)], note: 'small blood spatter for weak hits (fists), faces right; impact at about (3,8); no outline' });

function decal(seedV, n, wide) {
  return (c) => {
    bseed = seedV;
    const cx = 8, cy = 4;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
      const d = Math.hypot((x + 0.5 - cx) / (wide * 1.0), (y + 0.5 - cy) * 1.7) + (brnd() - 0.5) * 1.5;
      if (d < 3.2) c.px(x, y, d < 1.6 ? '#3a1413' : '#4e1c1a');
    }
    for (let i = 0; i < n; i++) { // satellite droplets
      const a = brnd() * Math.PI * 2, r = 4 + brnd() * 3.5;
      const x = cx + Math.cos(a) * r * 1.2, y = cy + Math.sin(a) * r * 0.5;
      c.px(x, y, brnd() < 0.5 ? '#4e1c1a' : '#2c0f0f');
    }
    c.px(cx - 1, cy - 1, '#6a2824'); // dried-wet sheen
  };
}
sheet('blood_decal', 16, 8, [0, 1, 2, 3].map((i) => [`decal_${i}`, decal(900 + i * 37, 3 + i, 1.5 + i * 0.35)]),
  { note: 'floor/wall blood stains, 4 variants (decal_0..3), dark dried tones, no outline; place occasionally and fade very slowly' });

// ---------- Milestone 2 stage 2: wide floors (80x80 modules, GDD 11.3 / 5.15) ----------
// Own rng so every earlier asset stays byte-identical. Patterns repeat with periods that divide 80 so modules tile.
let s2seed = 2001;
const s2r = () => ((s2seed = (s2seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const s2i = (n) => (s2r() * n) | 0;
const wr = (c, x, y, w, h, col) => { for (let i = 0; i < w; i++) c.rect((((x + i) % 80) + 80) % 80, y, 1, h, col); };
const wpx = (c, x, y, col) => c.px((((x | 0) % 80) + 80) % 80, y, col);
function mdamp(c, sd, { streaks = 7, mould = 4, y1 = 60, top = true } = {}) { // water streaks and mould; wraps horizontally
  s2seed = sd;
  for (let i = 0; i < streaks; i++) {
    const x = s2i(80), y = 4 + s2i(14), len = 6 + s2i(24);
    for (let j = 0; j < len && y + j < y1; j++) if (s2r() < 0.8) wpx(c, x, y + j, 'S');
  }
  for (let i = 0; i < mould; i++) { const x = s2i(78), y = 55 + s2i(6); wr(c, x, y, 3 + s2i(5), 2, 'ZD'); wpx(c, x + 1, y - 1, 'ZD'); }
  if (top) for (let i = 0; i < 2; i++) { const x = s2i(78); wr(c, x, 4, 4 + s2i(5), 2, 'ZD'); wpx(c, x + 1, 6, 'ZD'); }
}
const speck = (c, sd, n, y0, y1, col) => { s2seed = sd; for (let i = 0; i < n; i++) wr(c, s2i(80), y0 + s2i(y1 - y0), 1 + s2i(3), 1 + s2i(2), col); };
const skirt = (c, col = 'S', top = 'L') => { c.rect(0, 62, 80, 8, col); c.rect(0, 62, 80, 1, top); };
const fin = (c) => slabs(c, 80, 80);

const WALLS = {
  hallway: [
    (c) => { c.rect(0, 4, 80, 48, 'H4a3a36'); for (let x = 0; x < 80; x += 10) c.rect(x, 4, 4, 48, 'H3f322f');
      c.rect(0, 52, 80, 18, 'H2e2523'); c.rect(0, 52, 80, 1, 'R'); c.rect(0, 53, 80, 1, 'S'); for (let x = 0; x < 80; x += 16) c.rect(x, 56, 1, 6, 'S'); c.rect(0, 62, 80, 1, 'R'); },
    (c) => { c.rect(0, 4, 80, 48, 'H3f322f'); for (let x = 0; x < 80; x += 20) c.rect(x, 4, 1, 48, 'H4a3a36');
      c.rect(26, 14, 16, 14, 'WOODD'); c.rect(27, 15, 14, 12, 'S'); c.rect(29, 18, 10, 6, 'H34393f'); c.rect(30, 19, 4, 2, 'L');
      c.rect(52, 22, 22, 2, 'L'); for (const x of [54, 62, 70]) { c.rect(x, 24, 1, 3, 'L'); } c.rect(61, 27, 3, 6, 'CLOTH'); c.rect(60, 33, 5, 2, 'CLOTH');
      c.rect(0, 52, 80, 18, 'H2e2523'); c.rect(0, 52, 80, 1, 'R'); c.rect(0, 53, 80, 1, 'S'); c.rect(0, 62, 80, 1, 'R'); },
  ],
  living: [
    (c) => { c.rect(0, 4, 80, 58, 'WALLP'); for (let gy = 10; gy < 54; gy += 12) for (let gx = 0; gx < 80; gx += 20) { const o = (gy / 12 | 0) % 2 ? 10 : 0;
        wpx(c, gx + o, gy, '#665f50'); wpx(c, gx + o - 1, gy + 1, '#665f50'); wpx(c, gx + o + 1, gy + 1, '#665f50'); wpx(c, gx + o, gy + 2, '#665f50'); }
      skirt(c, 'H2e2523', 'R'); },
    (c) => { c.rect(0, 4, 80, 58, 'WALLP'); for (let x = 0; x < 80; x += 16) { c.rect(x, 4, 4, 58, 'H4a3a36'); c.rect(x + 4, 4, 1, 58, '#665f50'); }
      c.rect(0, 40, 80, 1, 'R'); c.rect(0, 41, 80, 1, 'S'); skirt(c, 'H2e2523', 'R'); },
  ],
  kitchen: [
    (c) => { c.rect(0, 4, 80, 20, 'W'); c.rect(0, 24, 80, 38, 'L'); for (let y = 24; y < 62; y += 8) c.rect(0, y, 80, 1, 'S'); for (let x = 0; x < 80; x += 8) c.rect(x, 24, 1, 38, 'S');
      s2seed = 31; for (let i = 0; i < 14; i++) c.rect(s2i(10) * 8 + 1, 25 + s2i(4) * 8, 7, 7, 'H62686e'); c.rect(0, 24, 80, 1, 'O'); skirt(c); },
    (c) => { c.rect(0, 4, 80, 30, '#4c4639'); c.rect(0, 34, 80, 28, 'L'); for (let y = 34; y < 62; y += 7) c.rect(0, y, 80, 1, 'S'); for (let x = 0; x < 80; x += 8) c.rect(x, 34, 1, 28, 'S');
      for (let x = 0; x < 80; x += 16) for (let y = 35; y < 62; y += 14) c.rect(x + 1, y, 7, 6, 'H555b61'); c.rect(0, 32, 80, 3, 'TD'); c.rect(0, 34, 80, 1, 'O'); skirt(c); },
  ],
  bedroom: [
    (c) => { c.rect(0, 4, 80, 58, 'WALLP'); for (let gy = 8; gy < 56; gy += 10) for (let gx = 0; gx < 80; gx += 10) { const o = (gy / 10 | 0) % 2 ? 5 : 0;
        wpx(c, gx + o, gy, 'H5f5344'); wpx(c, gx + o, gy + 1, 'H3f322f'); }
      skirt(c, 'S', 'R'); },
    (c) => { c.rect(0, 4, 80, 58, '#4c4639'); for (let x = 0; x < 80; x += 8) c.rect(x, 4, 1, 58, 'WALLP'); c.rect(0, 18, 80, 2, 'R'); c.rect(0, 20, 80, 1, 'S'); skirt(c, 'S', 'R'); },
  ],
  bathroom: [
    (c) => { c.rect(0, 4, 80, 8, 'W'); c.rect(0, 12, 80, 58, 'L'); for (let y = 12; y < 70; y += 8) c.rect(0, y, 80, 1, 'S'); for (let x = 0; x < 80; x += 8) c.rect(x, 12, 1, 58, 'S');
      s2seed = 41; for (let i = 0; i < 24; i++) c.rect(s2i(10) * 8 + 1, 13 + s2i(7) * 8, 7, 7, 'H62686e'); c.rect(0, 12, 80, 1, 'O'); c.rect(48, 40, 2, 6, 'R'); c.rect(49, 46, 1, 8, 'R'); },
    (c) => { c.rect(0, 4, 80, 8, 'W'); c.rect(0, 12, 80, 58, 'H555b61'); for (let y = 12; y < 70; y += 8) c.rect(0, y, 80, 1, 'S'); for (let x = 0; x < 80; x += 8) c.rect(x, 12, 1, 58, 'S');
      c.rect(0, 36, 80, 8, 'TD'); c.rect(0, 36, 80, 1, 'S'); s2seed = 43; for (let i = 0; i < 12; i++) c.rect(s2i(10) * 8 + 1, 13 + s2i(7) * 8, 7, 7, 'H62686e'); c.rect(0, 12, 80, 1, 'O');
      for (let i = 0; i < 10; i++) { const x = s2i(76), y = 14 + s2i(46); wr(c, x, y, 2 + s2i(3), 2, 'ZD'); } },
  ],
  kids_room: [
    (c) => { c.rect(0, 4, 80, 58, 'PLASTER'); c.rect(0, 36, 80, 26, 'TD'); c.rect(0, 36, 80, 1, 'T');
      c.rect(18, 14, 5, 5, 'WOOD'); for (const [dx, dy] of [[-2, 0], [6, 0], [2, -2], [2, 6], [-1, -1], [5, -1], [-1, 5], [5, 5]]) wpx(c, 20 + dx, 16 + dy, 'WOOD');
      c.rect(50, 20, 10, 8, 'BLUE'); c.rect(51, 21, 8, 7, 'PLASTER'); c.rect(52, 24, 2, 4, 'R'); c.rect(54, 23, 3, 2, 'DIRT'); c.line(49, 20, 55, 15, 'BLUE'); c.line(55, 15, 61, 20, 'BLUE');
      skirt(c, 'S', 'L'); },
    (c) => { c.rect(0, 4, 80, 58, 'PLASTER'); c.rect(0, 36, 80, 26, 'TD'); c.rect(0, 36, 80, 1, 'T');
      c.rect(60, 12, 3, 48, 'WOODD'); for (let y = 14; y < 58; y += 4) c.rect(60, y, y % 8 === 6 ? 3 : 2, 1, 'X'); c.rect(63, 30, 4, 1, 'R'); c.rect(63, 42, 4, 1, 'R');
      for (const x of [12, 30]) { wpx(c, x, 20, 'DIRT'); wpx(c, x - 1, 21, 'DIRT'); wpx(c, x + 1, 21, 'DIRT'); wpx(c, x, 22, 'DIRT'); }
      skirt(c, 'S', 'L'); },
  ],
  office: [
    (c) => { c.rect(0, 4, 80, 58, 'W'); for (let x = 0; x < 80; x += 20) c.rect(x, 4, 1, 58, 'S'); c.rect(0, 50, 80, 12, 'S'); c.rect(0, 50, 80, 1, 'L');
      c.rect(8, 14, 24, 18, 'WOOD'); c.rect(9, 15, 22, 16, 'DIRT'); for (const [x, y] of [[11, 17], [18, 20], [25, 17], [14, 25], [22, 26]]) { c.rect(x, y, 4, 3, 'X'); wpx(c, x + 1, y, 'RED'); }
      skirt(c, 'S', 'L'); },
    (c) => { c.rect(0, 4, 80, 58, 'W'); for (let x = 0; x < 80; x += 20) c.rect(x, 4, 1, 58, 'S'); c.rect(0, 50, 80, 12, 'S'); c.rect(0, 50, 80, 1, 'L');
      c.rect(34, 8, 12, 12, 'L'); c.rect(35, 9, 10, 10, 'X'); c.rect(40, 10, 1, 5, 'O'); c.rect(40, 14, 4, 1, 'O'); wpx(c, 40, 14, 'O');
      c.rect(8, 24, 20, 14, 'L'); c.rect(9, 25, 18, 12, 'PALE'); c.rect(11, 28, 10, 1, 'WINDOW'); c.rect(11, 31, 6, 1, 'WINDOW'); skirt(c, 'S', 'L'); },
  ],
  break_room: [
    (c) => { c.rect(0, 4, 80, 26, '#4c4639'); c.rect(0, 30, 80, 32, 'ZD'); c.rect(0, 30, 80, 1, 'O'); c.rect(0, 31, 80, 1, 'Z'); c.rect(48, 8, 14, 10, 'PALE'); c.rect(50, 10, 10, 1, 'S'); c.rect(50, 13, 7, 1, 'S'); skirt(c, 'S', 'L'); },
    (c) => { c.rect(0, 4, 80, 26, '#4c4639'); c.rect(0, 30, 80, 32, 'ZD'); c.rect(0, 30, 80, 1, 'O'); c.rect(20, 22, 40, 22, 'L');
      for (let x = 20; x < 60; x += 5) c.rect(x, 22, 1, 22, 'S'); for (let y = 22; y < 44; y += 5) c.rect(20, y, 40, 1, 'S'); c.rect(20, 22, 40, 1, 'O'); skirt(c, 'S', 'L'); },
  ],
  laundry: [
    (c) => { c.rect(0, 4, 80, 58, 'W'); c.rect(0, 38, 80, 24, 'S'); c.rect(0, 38, 80, 1, 'L'); c.rect(0, 10, 80, 3, 'METAL'); c.rect(0, 10, 80, 1, 'X');
      for (let x = 10; x < 80; x += 20) c.rect(x, 13, 2, 3, 'L'); c.rect(34, 13, 2, 8, 'METAL'); c.rect(32, 20, 6, 3, 'B'); skirt(c, 'S', 'L'); },
    (c) => { c.rect(0, 4, 80, 58, 'W'); c.rect(0, 38, 80, 24, 'S'); c.rect(0, 38, 80, 1, 'L'); c.rect(12, 4, 3, 58, 'METAL'); c.rect(12, 4, 1, 58, 'X');
      c.rect(10, 28, 7, 3, 'L'); c.rect(12, 26, 3, 7, 'L'); wpx(c, 13, 29, 'B'); c.rect(56, 10, 3, 52, 'L'); for (const y of [20, 40]) c.rect(54, y, 7, 2, 'S'); skirt(c, 'S', 'L'); },
  ],
  storage: [
    (c) => { c.rect(0, 4, 80, 58, 'S'); s2seed = 51; for (let r = 0; r < 7; r++) { const o = r % 2 ? 8 : 0; c.rect(0, 4 + r * 8 + 7, 80, 1, 'DEEP');
        for (let x = 0; x < 80; x += 16) { wr(c, x + o, 4 + r * 8, 1, 7, 'DEEP'); if (s2r() < 0.35) wr(c, x + o + 1, 4 + r * 8, 15, 7, 'H2f343b'); } }
      skirt(c, 'DEEP', 'S'); },
    (c) => { c.rect(0, 4, 80, 58, 'S'); for (let r = 0; r < 7; r++) { const o = r % 2 ? 8 : 0; c.rect(0, 4 + r * 8 + 7, 80, 1, 'DEEP'); for (let x = 0; x < 80; x += 16) wr(c, x + o, 4 + r * 8, 1, 7, 'DEEP'); }
      for (let x = 0; x < 80; x += 16) c.rect(x, 56, 8, 4, 'DIRT'); c.rect(0, 52, 80, 1, 'DIRT'); skirt(c, 'DEEP', 'S'); },
  ],
  utility: [
    (c) => { c.rect(0, 4, 80, 58, 'S'); for (let x = 0; x < 80; x += 8) c.rect(x, 4, 1, 58, 'W'); c.rect(0, 14, 80, 3, 'METAL'); c.rect(0, 14, 80, 1, 'X'); c.rect(0, 21, 80, 2, 'R');
      for (let x = 6; x < 80; x += 20) { c.rect(x, 12, 2, 12, 'O'); } c.rect(46, 11, 6, 3, 'B'); skirt(c, 'DEEP', 'S'); },
    (c) => { c.rect(0, 4, 80, 58, 'S'); for (let x = 0; x < 80; x += 8) c.rect(x, 4, 1, 58, 'W'); c.rect(20, 14, 20, 28, 'L'); c.rect(22, 16, 16, 24, 'DEEP'); c.rect(24, 18, 2, 2, 'RED'); c.rect(28, 18, 2, 2, 'A'); c.rect(24, 24, 12, 1, 'W');
      c.rect(0, 8, 80, 2, 'METAL'); c.line(30, 42, 30, 58, 'R'); c.line(31, 42, 31, 58, 'R'); skirt(c, 'DEEP', 'S'); },
  ],
  janitor: [
    (c) => { c.rect(0, 4, 80, 58, 'W'); c.rect(0, 36, 80, 26, 'L'); for (let y = 36; y < 62; y += 8) c.rect(0, y, 80, 1, 'S'); for (let x = 0; x < 80; x += 8) c.rect(x, 36, 1, 26, 'S'); c.rect(0, 36, 80, 1, 'O');
      c.rect(10, 20, 40, 2, 'WOODD'); for (const x of [14, 28, 42]) { c.rect(x, 22, 1, 20, 'WOOD'); c.rect(x - 1, 40, 3, 3, 'CLOTH'); } skirt(c); },
    (c) => { c.rect(0, 4, 80, 58, 'W'); c.rect(0, 36, 80, 26, 'L'); for (let y = 36; y < 62; y += 8) c.rect(0, y, 80, 1, 'S'); for (let x = 0; x < 80; x += 8) c.rect(x, 36, 1, 26, 'S'); c.rect(0, 36, 80, 1, 'O');
      c.rect(30, 44, 22, 16, 'DEEP'); c.rect(32, 46, 18, 12, 'S'); c.rect(40, 30, 3, 14, 'METAL'); c.rect(40, 29, 6, 2, 'METAL'); c.px(45, 31, 'BLUE'); skirt(c); },
  ],
};
const wallFrames = [];
let wseed = 7000;
for (const [type, fns] of Object.entries(WALLS)) {
  fns.forEach((fn, v) => wallFrames.push([`${type}_${'ab'[v]}`, (c) => {
    fn(c); wseed += 13;
    mdamp(c, wseed, { streaks: type === 'bathroom' ? 3 : type === 'laundry' || type === 'utility' ? 10 : 7, mould: type === 'bathroom' || type === 'laundry' || v ? 5 : 3 });
    speck(c, wseed + 5, 18, 4, 60, 'S'); fin(c);
  }]));
}
// burned units: soot-black walls, charred studs, embers
[0, 1].forEach((v) => wallFrames.push([`burned_${'ab'[v]}`, (c) => {
  c.rect(0, 4, 80, 66, 'DEEP'); s2seed = 800 + v * 17;
  for (let i = 0; i < 26; i++) { const x = s2i(80), len = 8 + s2i(36); for (let j = 0; j < len; j++) if (s2r() < 0.85) wpx(c, x, 62 - j, 'O'); }
  speck(c, 810 + v, 40, 4, 62, 'S');
  for (let x = 10 + v * 8; x < 80; x += 20) { c.rect(x, 4, 3, 58, 'WOODD'); c.rect(x, 4, 1, 58, 'O'); for (let y = 8; y < 60; y += 9 + s2i(5)) wpx(c, x + 1, y, 'B'); }
  if (v) { c.rect(24, 14, 14, 22, 'S'); for (let y = 14; y < 36; y += 4) c.rect(24 + (y % 8 ? 0 : 4), y, 10, 1, 'DEEP'); c.rect(30, 30, 3, 3, 'B'); }
  else { c.rect(50, 12, 12, 10, 'O'); c.rect(52, 24, 8, 6, 'S'); c.px(55, 16, 'B'); }
  c.rect(0, 62, 80, 8, 'O'); c.rect(0, 62, 80, 1, 'S'); fin(c);
}]));
// ransacked overlays (transparent): clothes, papers and glass on the floor
[0, 1].forEach((v) => wallFrames.push([`ransacked_${'ab'[v]}`, (c) => {
  s2seed = 900 + v * 29;
  for (let i = 0; i < 9; i++) { const x = 3 + s2i(70), y = 65 + s2i(4); c.rect(x, y, 3 + s2i(3), 1 + s2i(2), s2r() < 0.5 ? 'X' : 'PALE'); if (s2r() < 0.3) wpx(c, x + 1, y, 'S'); }
  for (let i = 0; i < 3; i++) { const x = 6 + s2i(64), y = 66 + s2i(3); c.rect(x, y, 5, 2, v ? 'CLOTH' : 'TD'); c.rect(x + 1, y - 1, 3, 1, v ? 'CLOTH' : 'T'); }
  if (v) for (let i = 0; i < 8; i++) wpx(c, 4 + s2i(70), 66 + s2i(4), 'Hc5ccd1');
  c.rect(38 + v * 6, 14, 1, 40, 'S'); wpx(c, 39 + v * 6, 20, 'S'); // torn wallpaper seam
}]));
sheet('wall_modules', 80, 80, wallFrames,
  { note: 'Stage 2 wall/floor-slab backgrounds, one 80x80 module (240x240 game px); tiles horizontally; slab top 4 rows and bottom 10 rows, walking line y=70. Names type_a / type_b per room type (studio -> living or bedroom, reception -> office); burned_a/b = soot-black full backgrounds; ransacked_a/b = transparent floor-clutter overlays (draw over any base). Mould and damp are baked in.' });

// ---------- room dividers 8x80 ----------
const divBase = (c) => { c.rect(0, 4, 8, 66, 'W'); c.rect(0, 4, 1, 66, 'L'); c.rect(7, 4, 1, 66, 'S'); s2seed = 1200; for (let i = 0; i < 8; i++) c.px(1 + s2i(6), 5 + s2i(56), 'S'); };
sheet('room_dividers', 8, 80, [
  ['wall_segment', (c) => { divBase(c); c.rect(0, 62, 8, 8, 'S'); c.rect(0, 62, 8, 1, 'L'); c.rect(2, 20, 1, 12, 'S'); c.px(3, 32, 'S'); fin(c); }],
  ['doorway_open', (c) => { divBase(c); c.clear(0, 38, 8, 32); c.rect(0, 36, 8, 2, 'WOODD'); c.rect(0, 38, 8, 1, 'O'); c.rect(0, 62, 8, 8, 'S'); c.clear(0, 38, 8, 32); c.rect(0, 70, 8, 1, 'L'); fin(c); c.rect(0, 70, 8, 1, 'L'); }],
  ['front_door_frame', (c) => { c.rect(0, 4, 8, 66, 'S'); c.rect(0, 4, 1, 66, 'L'); c.rect(7, 4, 1, 66, 'O'); c.clear(0, 34, 8, 36); c.rect(0, 32, 8, 3, 'R'); c.rect(0, 32, 8, 1, 'WOOD'); c.rect(0, 35, 8, 1, 'O');
    c.rect(2, 14, 4, 6, 'L'); c.rect(3, 15, 2, 4, 'A'); c.px(4, 24, 'METAL'); fin(c); c.rect(0, 70, 8, 1, 'L'); }],
  ['doorway_burned', (c) => { c.rect(0, 4, 8, 66, 'DEEP'); c.rect(0, 4, 1, 66, 'S'); c.clear(0, 38, 8, 32); c.rect(0, 36, 8, 2, 'O'); c.px(2, 37, 'B'); c.rect(0, 62, 8, 8, 'O'); c.clear(0, 38, 8, 32); fin(c); c.rect(0, 70, 8, 1, 'S'); }],
], { note: 'Stage 2 interior dividers between rooms, 8x80 (24x240 game px); doorway_open has a transparent opening (y 38-69) under a lintel so the rooms show through; front_door_frame has a taller opening (y 35-69) for door.png (16x32) sitting on the floor line; wall_segment = solid wall; doorway_burned = charred doorway. Slab rows match wall_modules.' });

// ---------- central stairwell shaft 80x80 ----------
const shaftBase = (c) => {
  c.rect(0, 0, 80, 80, 'S'); s2seed = 1300;
  for (let i = 0; i < 40; i++) c.px(s2i(80), 4 + s2i(58), 'DEEP');
  c.rect(0, 4, 80, 66, 'S'); for (let i = 0; i < 18; i++) wr(c, s2i(78), 4 + s2i(56), 2, 1, 'DEEP');
  c.rect(0, 4, 2, 66, 'W'); c.rect(78, 4, 2, 66, 'W'); // shaft walls
  // flight up on the left: rises from the landing (x 26) to the top-left (x 0, y 8) through the ceiling opening
  for (let i = 0; i < 7; i++) { const x = 26 - (i + 1) * 4, y = 66 - i * 8; c.rect(x, y, 4, 4, 'L'); c.rect(x, y, 4, 1, 'X'); c.rect(x + 1, y + 4, 3, 62 - y > 0 ? Math.min(60, 70 - y - 4) : 0, 'DEEP'); }
  // flight down on the right: descends from the landing (x 54) into the slab opening
  for (let i = 0; i < 6; i++) { const x = 54 + i * 4, y = 70 + i; c.rect(x, y, 4, 80 - y, 'W'); c.rect(x, y, 4, 1, 'L'); }
  // landing platform
  c.rect(26, 70, 28, 4, 'W'); c.rect(26, 70, 28, 1, 'L'); c.rect(26, 74, 28, 6, 'S'); c.rect(26, 79, 28, 1, 'O');
  // handrails
  c.line(2, 44, 25, 62, 'METAL'); for (const x of [6, 14, 22]) c.line(x, 47 + ((x - 2) * 18 / 23 | 0) - 3, x, 66 - 0, 'L');
  c.rect(26, 56, 1, 14, 'METAL'); c.rect(26, 56, 3, 1, 'METAL'); c.rect(53, 56, 1, 14, 'METAL'); c.rect(51, 56, 3, 1, 'METAL');
  c.line(54, 62, 78, 72, 'METAL');
  // top slab with opening above the up-flight, bottom slab handled above
  c.rect(0, 0, 80, 2, 'S'); c.rect(0, 2, 80, 1, 'W'); c.rect(0, 3, 80, 1, 'O'); c.clear(0, 0, 26, 4);
  c.rect(26, 0, 54, 2, 'S'); c.rect(26, 2, 54, 1, 'W'); c.rect(26, 3, 54, 1, 'O');
  // floor-number plate and drip
  c.rect(36, 20, 8, 12, 'DEEP'); c.rect(37, 21, 6, 10, 'S'); c.rect(60, 8, 1, 20, 'W'); c.rect(61, 20, 1, 8, 'W'); c.rect(58, 26, 6, 2, 'ZD');
  c.rect(0, 70, 26, 1, 'DEEP'); c.rect(54, 70, 26, 1, 'DEEP');
  c.rect(0, 79, 80, 1, 'O'); // same bottom row as slabs() so stacked shafts join
};
const lightFix = (c, lit) => {
  c.rect(35, 4, 10, 2, 'METAL'); c.rect(36, 6, 8, 5, 'L'); c.rect(37, 7, 6, 3, lit ? 'LAMP' : 'DEEP'); c.rect(36, 11, 8, 1, 'O');
  if (lit) { c.rect(38, 8, 4, 1, 'PALE'); c.rect(34, 12, 12, 1, 'DIRT'); c.rect(31, 13, 18, 1, 'DIRT'); }
};
sheet('stairwell_shaft', 80, 80, [
  ['shaft', shaftBase],
  ['light_unlit', (c) => lightFix(c, false)],
  ['light_lit', (c) => lightFix(c, true)],
], { note: 'Stage 2 central stairwell shaft, one module 80x80 (240x240 game px): landing platform in the middle at the walking line, stairs up on the left (open ceiling), stairs down on the right (open slab). light_unlit / light_lit are transparent overlays for the emergency fixture (top centre); swap them for the flicker, draw above shaft.' });

// ---------- Stage 2 props: small 16x16 ----------
sheet('props_s2', 16, 16, [
  ['laundry_basket', (c) => { c.rect(4, 3, 8, 3, 'CLOTH'); c.rect(6, 2, 4, 2, 'TD'); c.rect(3, 6, 10, 8, 'DIRT'); c.rect(3, 6, 10, 1, 'WOOD'); for (let y = 8; y < 14; y += 2) c.rect(3, y, 10, 1, 'WOODD'); for (let x = 5; x < 13; x += 3) c.rect(x, 7, 1, 7, 'WOODD'); }],
  ['toy_box', (c) => { c.rect(2, 6, 12, 8, 'BLUE'); c.rect(2, 6, 12, 2, 'TD'); c.rect(2, 13, 12, 1, 'S'); c.rect(6, 9, 4, 3, 'DIRT'); c.px(7, 10, 'S'); c.rect(10, 3, 3, 3, 'R'); c.rect(4, 4, 2, 2, 'WOOD'); }],
  ['toy_box_open', (c) => { c.rect(2, 6, 12, 8, 'BLUE'); c.rect(2, 6, 12, 1, 'S'); c.rect(3, 7, 10, 2, 'DEEP'); c.rect(1, 2, 3, 5, 'TD'); c.rect(8, 4, 3, 2, 'WOOD'); c.rect(11, 5, 2, 2, 'R'); c.rect(2, 13, 12, 1, 'S'); c.px(5, 11, 'DIRT'); }],
  ['medicine_cabinet', (c) => { c.rect(3, 1, 10, 13, 'X'); c.rect(11, 1, 2, 13, 'H9a978c'); c.rect(4, 2, 6, 11, 'METAL'); c.rect(6, 5, 2, 6, 'RED'); c.rect(5, 7, 4, 2, 'RED'); c.rect(9, 7, 1, 2, 'L'); }],
  ['medicine_cabinet_open', (c) => { c.rect(5, 1, 8, 13, 'X'); c.rect(6, 2, 6, 11, 'DEEP'); c.rect(6, 6, 6, 1, 'L'); c.rect(7, 4, 2, 2, 'RED'); c.rect(9, 8, 2, 3, 'PALE'); c.rect(0, 2, 5, 11, 'METAL'); c.rect(1, 6, 1, 3, 'RED'); }],
  ['charred_small', (c) => { c.rect(2, 10, 10, 4, 'DEEP'); c.rect(4, 7, 4, 4, 'S'); c.rect(9, 8, 4, 6, 'O'); c.rect(3, 13, 11, 1, 'S'); c.px(6, 9, 'B'); c.px(10, 10, 'B'); c.px(5, 12, 'R'); c.rect(1, 12, 2, 2, 'DEEP'); }],
  ['debris_papers', (c) => { c.rect(1, 12, 5, 2, 'X'); c.rect(5, 10, 4, 3, 'PALE'); c.rect(9, 12, 5, 2, 'X'); c.rect(11, 9, 3, 3, 'PALE'); c.px(2, 12, 'S'); c.px(6, 11, 'RED'); c.px(10, 13, 'S'); c.rect(7, 13, 2, 1, 'L'); }],
  ['debris_clothes', (c) => { c.rect(1, 10, 7, 4, 'TD'); c.rect(2, 8, 3, 3, 'TD'); c.rect(8, 11, 6, 3, 'CLOTH'); c.rect(10, 9, 3, 3, 'CLOTH'); c.rect(4, 13, 5, 1, 'T'); c.px(12, 10, 'H5f5344'); }],
], { outline: true, note: 'Stage 2 small props 16x16, anchored at the bottom: laundry_basket, toy_box (+_open), medicine_cabinet (+_open), charred_small (Burned furniture, small), debris_papers/debris_clothes (ransacked clutter)' });

// ---------- Stage 2 props: medium/large 32x32 ----------
const lean = (y) => 6 + Math.round((30 - y) * 0.25);
sheet('props_l2', 32, 32, [
  ['mattress', (c) => { for (let y = 3; y <= 30; y++) { const x = lean(y); c.rect(x, y, 17, 1, 'CLOTH'); c.px(x, y, 'H8f806c'); c.px(x + 16, y, 'H5f5344'); if (y % 6 === 0) c.rect(x + 1, y, 15, 1, 'H5f5344'); }
      c.rect(lean(10) + 3, 9, 6, 4, 'R'); c.rect(lean(22) + 8, 21, 5, 3, 'DIRT'); c.rect(lean(3), 3, 17, 1, 'X'); c.rect(lean(30) + 1, 29, 3, 2, 'WOODD'); c.rect(lean(30) + 13, 29, 3, 2, 'WOODD'); }],
  ['desk', (c) => { wood(c, 1, 14, 30, 3); c.rect(1, 17, 30, 1, 'WOODD'); c.rect(3, 18, 11, 12, 'R'); for (let y = 19; y < 30; y += 4) { c.rect(4, y, 9, 3, 'WOODD'); c.rect(7, y + 1, 3, 1, 'L'); }
      c.rect(26, 18, 3, 12, 'WOODD'); c.rect(16, 18, 9, 1, 'WOODD'); c.rect(17, 5, 9, 7, 'S'); c.rect(18, 6, 7, 5, 'H2a3a3a'); c.rect(20, 12, 3, 2, 'L'); c.rect(4, 10, 8, 4, 'X'); c.rect(5, 9, 7, 1, 'PALE'); c.rect(28, 9, 2, 5, 'METAL'); }],
  ['filing_cabinet', (c) => { c.rect(9, 4, 14, 26, 'METAL'); c.rect(9, 4, 14, 1, 'X'); c.rect(20, 4, 3, 26, 'L'); for (const y of [4, 13, 22]) { c.rect(9, y + 8, 14, 1, 'S'); c.rect(13, y + 3, 6, 1, 'X'); c.rect(14, y + 5, 4, 2, 'PALE'); } c.rect(9, 29, 14, 1, 'S'); }],
  ['filing_cabinet_open', (c) => { c.rect(9, 4, 14, 26, 'METAL'); c.rect(9, 4, 14, 1, 'X'); c.rect(20, 4, 3, 26, 'L'); c.rect(9, 12, 14, 1, 'S'); c.rect(7, 13, 18, 7, 'L'); c.rect(8, 14, 16, 3, 'DEEP'); c.rect(10, 12, 3, 3, 'PALE'); c.rect(15, 11, 3, 4, 'X'); c.rect(13, 18, 6, 1, 'X'); c.rect(9, 22, 14, 1, 'S'); c.rect(9, 29, 14, 1, 'S'); }],
  ['washing_machine', (c) => { c.rect(5, 3, 22, 27, 'Hb8b4a8'); c.rect(24, 3, 3, 27, 'H9a978c'); c.rect(5, 3, 22, 1, 'X'); c.rect(5, 9, 22, 1, 'L'); c.rect(7, 5, 5, 3, 'S'); c.rect(14, 5, 2, 3, 'W'); c.rect(18, 6, 2, 2, 'RED');
      c.rect(10, 12, 12, 12, 'L'); c.rect(11, 13, 10, 10, 'S'); c.rect(12, 14, 8, 8, 'SKYD'); c.rect(13, 15, 3, 3, 'SKY'); c.rect(6, 29, 3, 1, 'S'); c.rect(23, 29, 3, 1, 'S'); }],
  ['washing_machine_open', (c) => { c.rect(5, 3, 22, 27, 'Hb8b4a8'); c.rect(24, 3, 3, 27, 'H9a978c'); c.rect(5, 3, 22, 1, 'X'); c.rect(5, 9, 22, 1, 'L'); c.rect(7, 5, 5, 3, 'S'); c.rect(18, 6, 2, 2, 'S');
      c.rect(10, 12, 12, 12, 'L'); c.rect(11, 13, 10, 10, 'DEEP'); c.rect(1, 12, 9, 12, 'L'); c.rect(2, 14, 6, 8, 'SKYD'); c.rect(13, 19, 5, 3, 'CLOTH'); c.rect(6, 29, 3, 1, 'S'); c.rect(23, 29, 3, 1, 'S'); }],
  ['storage_cage', (c) => { c.rect(3, 2, 26, 28, 'DEEP'); c.rect(6, 20, 9, 10, 'R'); c.rect(7, 21, 7, 2, 'WOODD'); c.rect(17, 14, 9, 16, '#4c4639'); c.rect(18, 16, 7, 1, 'CLOTH'); c.rect(7, 12, 6, 8, 'L');
      for (let x = 3; x <= 29; x += 3) c.rect(x, 2, 1, 28, 'METAL'); for (let y = 2; y <= 30; y += 3) c.rect(3, y, 27, 1, 'METAL'); c.rect(3, 2, 27, 2, 'L'); c.rect(3, 29, 27, 1, 'L'); c.rect(14, 15, 4, 4, 'A'); c.rect(15, 13, 2, 3, 'L'); }],
  ['storage_cage_open', (c) => { c.rect(3, 2, 26, 28, 'DEEP'); c.rect(6, 20, 9, 10, 'R'); c.rect(7, 21, 7, 2, 'WOODD'); c.rect(17, 14, 9, 16, '#4c4639'); c.rect(7, 12, 6, 8, 'L');
      for (let x = 3; x <= 29; x += 3) c.rect(x, 2, 1, 28, 'METAL'); for (let y = 2; y <= 30; y += 3) c.rect(3, y, 22, 1, 'METAL'); c.rect(3, 2, 27, 2, 'L'); c.rect(3, 29, 27, 1, 'L');
      c.rect(26, 2, 3, 28, 'DEEP'); c.rect(29, 2, 2, 28, 'S'); for (let y = 2; y <= 30; y += 3) c.rect(29, y, 2, 1, 'METAL'); c.rect(24, 18, 2, 4, 'A'); }],
  ['utility_shelf', (c) => { c.rect(2, 2, 2, 28, 'METAL'); c.rect(28, 2, 2, 28, 'METAL'); for (const y of [10, 19, 28]) { c.rect(2, y, 28, 2, 'L'); c.rect(2, y, 28, 1, 'METAL'); }
      c.rect(5, 5, 4, 5, 'RED'); c.rect(10, 6, 3, 4, 'RED'); c.rect(16, 3, 8, 7, 'R'); c.rect(17, 4, 6, 1, 'WOODD'); c.rect(5, 13, 6, 6, 'L'); c.rect(6, 12, 4, 1, 'S'); c.rect(14, 14, 3, 5, 'BLUE'); c.rect(19, 12, 8, 7, '#4c4639'); c.rect(5, 22, 9, 6, 'CLOTH'); c.rect(16, 23, 10, 5, 'R'); c.rect(18, 22, 3, 1, 'A'); }],
  ['charred_debris', (c) => { c.rect(2, 24, 26, 6, 'DEEP'); c.rect(6, 17, 5, 9, 'O'); c.rect(7, 10, 3, 8, 'S'); c.rect(14, 19, 10, 6, 'S'); c.rect(15, 14, 2, 6, 'O'); c.rect(21, 12, 2, 8, 'DEEP'); c.line(8, 17, 22, 12, 'O'); c.rect(3, 27, 24, 3, 'O'); c.rect(20, 22, 8, 3, 'DEEP'); c.px(9, 20, 'B'); c.px(18, 23, 'B'); c.px(24, 27, 'R'); c.px(5, 26, 'R'); c.px(12, 28, 'B'); c.px(16, 17, 'B'); c.px(26, 24, 'S'); }],
  ['debris_papers', (c) => { s2seed = 1700; for (let i = 0; i < 8; i++) { const x = 2 + s2i(24), y = 25 + s2i(4); c.rect(x, y, 4 + s2i(3), 2, s2r() < 0.5 ? 'X' : 'PALE'); if (s2r() < 0.4) c.px(x + 1, y, 'S'); } c.rect(10, 22, 5, 3, 'PALE'); c.rect(19, 21, 4, 3, 'X'); c.px(11, 23, 'RED'); }],
  ['debris_clothes', (c) => { c.rect(2, 25, 11, 5, 'TD'); c.rect(4, 22, 5, 4, 'TD'); c.rect(14, 26, 10, 4, 'CLOTH'); c.rect(17, 23, 6, 4, 'CLOTH'); c.rect(8, 29, 12, 1, 'T'); c.rect(24, 27, 5, 3, 'H5f5344'); c.rect(1, 27, 2, 2, 'TD'); c.px(19, 25, 'H8f806c'); }],
], { outline: true, note: 'Stage 2 medium/large props 32x32, anchored at the bottom: mattress, desk, filing_cabinet (+_open), washing_machine (+_open), storage_cage (+_open), utility_shelf, charred_debris (Burned furniture), debris_papers/debris_clothes (ransacked clutter). *_open = searched/ajar.' });

// ---------- window for the 80 px module: 40x40 with the glass exactly 32x32 at (4,4) so rain_window.png overlays at +4,+4 ----------
const winFrame = (c) => { c.rect(0, 0, 40, 40, 'O'); c.rect(1, 1, 38, 38, 'L'); c.rect(3, 3, 34, 34, 'O'); c.rect(1, 37, 38, 2, 'W'); c.rect(0, 39, 40, 1, 'O'); };
const winGlass = (c) => { c.rect(4, 4, 32, 32, 'SKY'); c.rect(4, 20, 32, 16, 'SKYD'); c.line(7, 15, 14, 7, 'H7d8a82'); c.line(8, 16, 15, 8, 'H7d8a82');
  for (const [x, w, h] of [[6, 5, 8], [13, 6, 12], [22, 5, 7], [29, 5, 10]]) c.rect(x, 36 - h, w, h - 0, 'SKYD'); c.rect(4, 33, 32, 3, '#363f43'); };
sheet('window_m', 40, 40, [
  ['a', (c) => { winFrame(c); winGlass(c); c.rect(19, 4, 2, 32, 'L'); c.rect(4, 19, 32, 2, 'L'); }],
  ['b', (c) => { winFrame(c); winGlass(c); c.rect(14, 4, 2, 32, 'L'); c.rect(25, 4, 2, 32, 'L'); c.rect(4, 11, 32, 2, 'L'); c.rect(4, 4, 32, 2, 'S'); }],
  ['broken', (c) => { winFrame(c); c.rect(4, 4, 32, 32, 'H07080a'); c.rect(19, 4, 2, 10, 'L'); c.rect(4, 19, 8, 2, 'L');
    for (const [x, y, w, h] of [[4, 4, 9, 2], [4, 6, 5, 3], [4, 9, 2, 3], [29, 4, 7, 3], [33, 7, 3, 4], [4, 31, 6, 5], [26, 32, 10, 4], [31, 29, 5, 3]]) c.rect(x, y, w, h, 'SKY');
    c.line(13, 5, 10, 9, 'X'); c.line(29, 5, 32, 9, 'X'); c.rect(10, 34, 2, 1, 'Hc5ccd1'); c.rect(26, 33, 2, 1, 'Hc5ccd1'); }],
], { note: 'Stage 2 window 40x40 for an 80 px module; glass is exactly 32x32 at (4,4): place rain_window.png frames at +4,+4 (same x/y offset) to overlay. a = cross mullion, b = three panes with a transom, broken = burned rooms (no rain overlay needed, rain noise louder). Draw at the wall layer; centre it in the module, about y 14-54.' });

// =====================================================================================
// ISO REBUILD, STAGE A (GDD 2 and 9): every sheet below has the prefix `iso_`.
// Appended after all older sheets and uses its own RNG (mkr) so older sheets stay byte-identical.
// 1 art px = 3 game px. Iso tile diamond = 32x16 art px. Characters 16x32. Walls 40 px tall.
// Tile-local units used by the prop/stairs painters: one tile is 16x16 units, centre (0,0),
// +x toward screen lower-right, +y toward screen lower-left; screen = (x - y, (x + y) / 2).
// =====================================================================================
const mkr = (s) => { let q = s >>> 0; return () => ((q = (Math.imul(q, 1664525) + 1013904223) >>> 0) / 4294967296); };
const hsh = (a, b, s = 0) => (((Math.imul(a + 7, 73856093) ^ Math.imul(b + 13, 19349663) ^ Math.imul(s + 3, 83492791)) >>> 0) % 1000) / 1000;
const rgbOf = (c) => (typeof c === 'string' ? (c[0] === '#' ? hex(c) : C_[c]) : c);
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const shd = (c, f) => { const [r, g, b] = rgbOf(c); return toHex(r * f, g * f, b * f); };
const mixc = (a, b, t) => { const x = rgbOf(a), y = rgbOf(b); return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t); };
const hxs = (c) => { const [r, g, b] = rgbOf(c); return toHex(r, g, b); };

// ---------- iso_floor: 32x16 diamond tiles ----------
// Anchor: the diamond centre is (16,8); origin it there (setOrigin 0.5). Tiles are seamless (patterns repeat every 4/8/16 units).
const inDia = (x, y) => Math.abs(x + 0.5 - 16) + 2 * Math.abs(y + 0.5 - 8) < 16;
const FLOOR_TYPES = ['corridor', 'hallway', 'living', 'kitchen', 'bedroom', 'bathroom', 'office', 'laundry', 'storage', 'landing'];
function floorTile(c, type, v) {
  const r = mkr(900 + FLOOR_TYPES.indexOf(type) * 17 + v * 101);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
    if (!inDia(x, y)) continue;
    const sx = x + 0.5 - 16, sy = y + 0.5 - 8, px = sy + sx / 2, py = sy - sx / 2; // tile-local units, +-8
    const n = r(), m = (a, b) => ((Math.floor(a) % b) + b) % b;
    let col;
    if (type === 'corridor') {
      col = n < 0.08 ? '#32363a' : n > 0.95 ? '#464a4e' : '#3b3f43';
      if (Math.abs(px) > 7.3 || Math.abs(py) > 7.3) col = '#2c3034';
      if (v && Math.abs(px - py * 0.3 + 1) < 0.5 && py > -4 && py < 5) col = '#25282c';
    } else if (type === 'hallway') {
      const st = Math.floor(py / 4);
      col = (st + v) % 2 ? '#4b463d' : '#464136';
      if (m(py, 4) < 0.5) col = '#352f27';
      if (n < 0.1) col = '#3b362e'; else if (n > 0.93) col = '#57524a';
      if (v && px > -3 && px < 3 && py > 0 && py < 4 && n < 0.5) col = '#5d574c'; // worn path
    } else if (type === 'living') {
      const pl = Math.floor(py / 4), pal = ['#5a4733', '#54422f', '#5e4b36', '#4f3f2d'];
      col = pal[m(pl * 3 + v * 2, 4)];
      if (m(py, 4) < 0.5) col = '#2e2219';
      if (m(px + pl * 5, 16) < 0.5) col = '#2e2219';
      if (n < 0.08) col = shd(col, 0.86); else if (n > 0.95) col = shd(col, 1.15);
    } else if (type === 'kitchen') {
      const ch = (Math.floor(px / 4) + Math.floor(py / 4) + v) % 2 === 0;
      col = ch ? '#6a685e' : '#4d4c45';
      if (n < 0.1) col = shd(col, 0.88);
      if (m(px, 4) < 0.4 || m(py, 4) < 0.4) col = shd(col, 0.8);
    } else if (type === 'bedroom') {
      col = n < 0.2 ? '#46424b' : n > 0.85 ? '#544f59' : '#4d4952';
      if (v && Math.abs(px) < 5 && Math.abs(py) < 5 && (Math.abs(px) > 4 || Math.abs(py) > 4)) col = '#5a4a48';
    } else if (type === 'bathroom') {
      const g = m(px, 2) < 1 && m(py, 2) < 1;
      col = g ? (n < 0.15 ? '#6a7473' : n > 0.9 ? '#848e8d' : '#76807f') : '#434b4a';
      if (v && g && n > 0.7 && m(Math.floor(px / 2) + Math.floor(py / 2), 3) === 0) col = '#5d6665';
    } else if (type === 'office') {
      const alt = (Math.floor(px / 8) + Math.floor(py / 8) + v) % 2 === 0;
      col = (alt ? '#3f4a52' : '#39434a');
      if (n < 0.15) col = shd(col, 0.9); else if (n > 0.9) col = shd(col, 1.1);
      if (Math.abs(px) > 7.4 || Math.abs(py) > 7.4) col = '#2c343a';
    } else if (type === 'laundry') {
      col = n < 0.1 ? '#474b4f' : n > 0.93 ? '#5d6166' : '#52565a';
      if (Math.abs(px) > 7.4 || Math.abs(py) > 7.4) col = '#3a3e42';
      if (v) { const d = Math.hypot(px, py * 1); if (d < 2.6) col = d < 1.2 ? '#16191d' : (m(px + py, 2) < 1 ? '#23272c' : '#16191d'); }
    } else if (type === 'storage') {
      col = n < 0.18 ? '#272a2e' : n > 0.9 ? '#383c40' : '#2f3236';
      if (v && Math.abs(px + py * 0.6 - 1) < 0.6 && px > -5 && px < 6) col = '#1a1d20';
    } else { // landing
      col = n < 0.1 ? '#3c4044' : n > 0.93 ? '#50545a' : '#464a4e';
      if (Math.abs(px) < 1.1 && m(py, 8) < 4) col = '#6d6a52'; // worn hazard dashes
      if (Math.abs(px) > 7.3 || Math.abs(py) > 7.3) col = '#2c3034';
      if (v && n > 0.8 && Math.abs(py) < 3) col = '#3a3e42';
    }
    c.px(x, y, col);
  }
}
function blobs(c, r, n, rmin, rmax, cols, spread = 1) {
  for (let i = 0; i < n; i++) {
    const cx = 16 + (r() - 0.5) * 22 * spread, cy = 8 + (r() - 0.5) * 10 * spread, rad = rmin + r() * (rmax - rmin), col = cols[Math.floor(r() * cols.length)];
    for (let y = Math.floor(cy - rad); y <= cy + rad; y++) for (let x = Math.floor(cx - rad * 1.6); x <= cx + rad * 1.6; x++) {
      if (inDia(x, y) && Math.hypot((x - cx) / 1.6, y - cy) <= rad * (0.7 + r() * 0.3)) c.px(x, y, col);
    }
  }
}
function floorOverlay(c, kind, v) {
  const r = mkr(5000 + v * 77 + kind.length * 13);
  if (kind === 'burned') {
    blobs(c, r, 9, 1.5, 3.2, ['#0b0c0e', '#14110f', '#16191d'], 1);
    blobs(c, r, 4, 0.8, 1.6, ['#23272c', '#1c2025'], 1);
    for (let i = 0; i < 6; i++) { const x = 6 + Math.floor(r() * 20), y = 4 + Math.floor(r() * 8); if (inDia(x, y)) c.px(x, y, r() < 0.5 ? 'B' : '#3a1614'); }
  } else if (kind === 'ransacked') {
    for (let i = 0; i < 7; i++) {
      const x = 7 + Math.floor(r() * 18), y = 4 + Math.floor(r() * 9), k = r(), w = 2 + Math.floor(r() * 3);
      if (!inDia(x, y) || !inDia(x + w, y + 1)) continue;
      const col = k < 0.35 ? 'X' : k < 0.55 ? 'X' : k < 0.8 ? 'TD' : 'CLOTH';
      c.rect(x, y, w, k < 0.55 ? 1 : 2, col);
      if (k < 0.35) c.px(x + 1, y, 'S');
    }
    c.px(15 + v, 8, 'RED'); // one scrap of red
  } else if (kind === 'grime') {
    for (let i = 0; i < 38; i++) { const x = Math.floor(r() * 32), y = Math.floor(r() * 16); if (inDia(x, y)) c.px(x, y, r() < 0.5 ? '#2a261c' : '#201e19'); }
    blobs(c, r, 3, 1, 2.2, ['#2a261c', '#322d22'], 0.9);
  } else { // damp
    blobs(c, r, 3, 2, 4, ['#27323a', '#2b373d'], 0.8);
    for (let i = 0; i < 14; i++) { const x = Math.floor(r() * 32), y = Math.floor(r() * 16); if (inDia(x, y) && c.get(x, y)) c.px(x, y, '#3f4f55'); }
  }
}
{
  const fr = [];
  for (const t of FLOOR_TYPES) for (const v of [0, 1]) fr.push([`${t}_${v}`, (c) => floorTile(c, t, v)]);
  for (const k of ['burned', 'ransacked', 'grime', 'damp']) for (const v of [0, 1]) fr.push([`ov_${k}_${v}`, (c) => floorOverlay(c, k, v)]);
  sheet('iso_floor', 32, 16, fr, { note: 'Iso floor tiles 32x16 art px (96x48 game px). ANCHOR: diamond centre = (16,8) (setOrigin 0.5); tiles tile seamlessly at 16 px / 8 px steps (centre of tile (x,y) = ((x-y)*16, (x+y+1)*8) art px, GDD 2). Frames <type>_<0|1> for types corridor (communal, concrete slabs), hallway (worn lino), living (wood boards), kitchen (lino checker), bedroom (carpet), bathroom (small tiles), office (carpet tiles), laundry (lino, variant 1 has a drain), storage (raw concrete), landing (stairwell landing, hazard dashes). ov_burned_* / ov_ransacked_* / ov_grime_* / ov_damp_* are transparent overlays clipped to the diamond (draw above the floor, below objects; grime and damp are for dirty/wet rooms and may be drawn at reduced alpha). Spare fx: iso_fx.' });
}

// ---------- iso_fx: vision helpers and floor marks (32x16 diamonds) ----------
function diaFill(c, col, dither = 0) { for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) if (inDia(x, y) && (!dither || (x + y) % dither === 0)) c.px(x, y, col); }
function ripple(c, i) {
  const rad = [5, 10, 15][i], cols = ['#bdb8ab', '#8f8c82', '#5d6166'][i];
  for (let a = 0; a < 720; a++) {
    const t = a / 720 * Math.PI * 2, x = Math.round(15.5 + Math.cos(t) * rad), y = Math.round(7.5 + Math.sin(t) * rad / 2);
    if (a % 24 < 17) c.px(x, y, cols); // broken arc
  }
}
sheet('iso_fx', 32, 16, [
  ['remembered_tile', (c) => { diaFill(c, '#16191d'); for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) if (inDia(x, y) && (x * 7 + y * 13) % 11 === 0) c.px(x, y, '#1b1f24'); }],
  ['spot_dashed', (c) => { for (let t = 0; t < 360; t++) { const k = t / 360; let x, y; const q = Math.floor(k * 4), f = k * 4 - q; const V = [[15.5, 0], [31, 7.5], [15.5, 15], [0, 7.5], [15.5, 0]]; x = V[q][0] + (V[q + 1][0] - V[q][0]) * f; y = V[q][1] + (V[q + 1][1] - V[q][1]) * f; if (Math.floor(f * 8) % 2 === 0) c.px(x, y, 'X'); } }],
  ['ripple_0', (c) => ripple(c, 0)], ['ripple_1', (c) => ripple(c, 1)], ['ripple_2', (c) => ripple(c, 2)],
  ['mark_dismantled', (c) => { const r = mkr(77); blobs(c, r, 4, 2, 4, ['#2c3034', '#33373b'], 0.7); for (let i = 0; i < 6; i++) { const x = 9 + Math.floor(r() * 14), y = 5 + Math.floor(r() * 6); if (inDia(x, y)) c.px(x, y, '#23272c'); } }],
  ...[0, 1, 2].map((v) => [`blood_floor_${v}`, (c) => { const r = mkr(31 + v * 9); blobs(c, r, 4 + v, 1.2, 2.8 + v * 0.4, ['B', '#3a1614', '#4e1c1a'], 0.7); for (let i = 0; i < 5; i++) { const x = 8 + Math.floor(r() * 16), y = 4 + Math.floor(r() * 8); if (inDia(x, y)) c.px(x, y, 'B'); } }]),
  ...[0, 1].map((v) => [`muzzle_flash_${v}`, (c) => { // starburst centred at (16,8); frame 1 is bigger
    const R = v ? 7 : 5;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - 16, dy = (y + 0.5 - 8) * 1.6, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      const spike = R * (0.55 + 0.45 * Math.abs(Math.cos(a * 3)));
      if (d <= spike) c.px(x, y, d < spike * 0.45 ? '#fff3c0' : d < spike * 0.8 ? '#ffd06a' : '#d07a2c');
    }
  }]),
], { animations: [anim('ripple', [2, 3, 4], 6, 0)], note: 'Iso FX, all 32x16 diamonds centred at (16,8). remembered_tile = flat #16191d diamond (tint/alpha in code to dim remembered tiles). spot_dashed = dashed spot-pick diamond outline (GDD 5.6). ripple_0..2 = broken ellipse arcs growing r 5/10/15 px (anim "ripple", 3 frames, once; draw on the source tile for the sound-off ripple, scale up for louder noise). mark_dismantled = faint floor mark left by a dismantled object. blood_floor_0..2 = dried blood stains on the floor (the old fx_blood sheets are still usable for hit splashes). Vignette is code-generated. C2/C3 appended: muzzle_flash_0|1 = small/large starburst centred at (16,8), additive blend, show for balance firearms.muzzleFlashSeconds at the gun tip.' });

// ---------- iso_walls: 16x48 frames ----------
// Wall along x (edge runs toward the lower right): frame origin = the edge's upper-left end S at (0,40); the edge ends at (16,48).
// Wall along y (edge runs toward the lower left): upper-right end S at (16,40); the edge ends at (0,48).
// Chain walls: the next edge starts where the previous one ends, so place frames at (V - (0,40)) for x walls and (V - (16,40)) for y walls.
// Full wall = 40 px above the base line; stub = 12 px (same 16x48 frame, only the bottom 12 px used). Post frames: vertex at (8,44).
const WALL_FINISH = ['concrete', 'plaster', 'wallp_a', 'wallp_b', 'tile', 'burned'];
const CAPHI = '#74787c', CAPMID = '#5d6166';
function wallPaint(c, dir, h, fn, { cap = true, skipCap = null } = {}) {
  for (let x = 0; x < 16; x++) {
    const yb = 40 + (dir === 'x' ? x >> 1 : (15 - x) >> 1);
    for (let z = 0; z < h; z++) {
      let col = null;
      if (cap && z >= h - 2 && !(skipCap && skipCap(x, z))) col = z === h - 1 ? CAPHI : CAPMID;
      else col = fn(x, z);
      if (col) c.px(x, yb - z, dir === 'y' ? shd(col, 0.8) : col);
    }
  }
}
function finishFn(f, seed = 0) {
  const nz = (x, z) => hsh(x, z, seed + f.length);
  return (x, z) => {
    const n = nz(x, z);
    switch (f) {
      case 'concrete': {
        if (z === 13 || z === 26) return '#2c3034';
        if ((x === 4 || x === 12) && (z === 6 || z === 20)) return '#23272c';
        if (z < 2) return '#2f3236';
        return n < 0.07 ? '#32363a' : n > 0.95 ? '#454a4e' : '#3a3e42';
      }
      case 'plaster': {
        if (z < 2) return '#33302a';
        if (x === 7 && z > 14 && z < 30 && n < 0.8) return '#4b4840'; // hairline crack
        return n < 0.08 ? '#4f4b43' : n > 0.94 ? '#625e54' : '#57534a';
      }
      case 'wallp_a': {
        if (z < 2) return '#2b2722';
        if (z === 11) return '#3d382f';
        if (z < 11) return (x % 5 === 0 && z > 3) ? '#3a342b' : '#463f34';
        if (z === 33 || z === 34) return '#4b453a';
        return ((x >> 1) % 2 ? '#554f42' : '#5b5547') && (n < 0.07 ? '#4c473b' : ((x >> 1) % 2 ? '#554f42' : '#5b5547'));
      }
      case 'wallp_b': {
        if (z < 2) return '#2a2e29';
        if (z === 12) return '#383c34';
        const dot = x % 4 === 1 && z % 4 === 1;
        return dot ? '#5a6253' : n < 0.07 ? '#444a3f' : '#4d5448';
      }
      case 'tile': {
        if (z === 28) return '#4a5352';
        if (z > 28) return '#57534a';
        if (x % 4 === 0 || z % 4 === 0) return '#434b4a';
        return n < 0.15 ? '#6a7473' : n > 0.9 ? '#848e8d' : '#76807e';
      }
      default: { // burned
        if (z < 3 && n < 0.8) return '#0b0c0e';
        if (n > 0.985) return '#4e1c1a';
        const streak = hsh(x, 0, 9) > 0.55;
        return streak && z > 8 ? '#0f1012' : n < 0.12 ? '#232120' : '#171618';
      }
    }
  };
}
const dark = '#0f1114';
function windowFn(base, broken, seed) {
  return (x, z) => {
    const inFrame = x >= 3 && x <= 12 && z >= 13 && z <= 32;
    if (z === 12 && x >= 2 && x <= 13) return '#6a6e72'; // sill
    if (z === 11 && x >= 2 && x <= 13) return '#43474b';
    if (!inFrame) return base(x, z);
    if (x === 3 || x === 12 || z === 13 || z === 32) return '#5d6166'; // frame
    if (broken) {
      const sh = (x <= 5 && z >= 28) || (x >= 10 && z >= 27) || (x <= 5 && z <= 17) || (x >= 9 && z <= 16 && x - 9 > z - 14);
      if (sh && hsh(x, z, 3) > 0.15) return z > 24 ? '#6e787e' : '#4d585d';
      if (x === 7 || x === 8) return z < 22 ? '#3a3e42' : dark; // stub of mullion
      return '#07080a';
    }
    if (x === 7 || x === 8) return '#5d6166'; // mullion
    if (z === 22 || z === 23) return '#5d6166';
    if (z <= 20 && hsh(x, z, 5) > 0.2 && (x + 3) % 4 < 3 && z < 14 + (x * 7 % 5)) return '#363f43'; // dark city skyline
    const g = z > 23 ? '#8a9399' : z > 17 ? '#6e787e' : '#4d585d';
    return ((x + z) % 7 === 0 && z > 24) ? '#a7b0b5' : g;
  };
}
function stubWindow(base, broken) {
  return (x, z) => {
    if (z >= 8 && x >= 2 && x <= 13) { if (z === 11 && x >= 4 && x <= 11) return broken ? (x % 3 === 0 ? '#8a9399' : '#07080a') : '#8a9399'; return z >= 10 ? '#6a6e72' : '#4a4e52'; }
    return base(x, z);
  };
}
const woodLeaf = (x, z, front) => {
  if (front) {
    if (z >= 20 && z <= 27 && x >= 5 && x <= 8) return (x === 5 || x === 8 || z === 20 || z === 27) ? '#a99886' : '#bdb8ab'; // number plate
    if (x === 10 && (z === 14 || z === 15)) return '#c08a3e'; // lock
    if (z % 6 === 0) return '#3a3e42';
    return hsh(x, z, 4) < 0.1 ? '#4a4f55' : '#555b61';
  }
  const raised = (x >= 5 && x <= 10 && ((z >= 18 && z <= 28) || (z >= 4 && z <= 14)));
  if (x === 10 && z === 15) return '#a99886'; // knob
  if (x === 4 || x === 11) return '#4a3a2b';
  if (raised) return (x === 5 || z === 18 || z === 4) ? '#54412f' : '#6d5842';
  return '#5a4631';
};
function doorFn(state, front, base) {
  const frameCol = front ? '#6b7176' : '#4a3a2b';
  return (x, z) => {
    if (x === 2 || x === 13) return z <= 33 ? frameCol : base(x, z);
    if (z === 32 || z === 33) return x >= 2 && x <= 13 ? frameCol : base(x, z);
    if (x < 3 || x > 12 || z > 31) return base(x, z);
    switch (state) {
      case 'closed': return woodLeaf(x, z, front);
      case 'open': {
        if (x >= 11) return x === 11 ? '#3d2f22' : '#2a2018'; // leaf swung against the wall
        return z < 2 ? '#1a1d20' : dark;
      }
      case 'jammed': {
        const d = hsh(x, z, 6);
        const plank = (z >= 6 && z <= 9) || (z >= 20 && z <= 23) || (Math.abs((z - 4) - (x - 3) * 2.6) < 1.5);
        if (plank) return (z + x) % 5 === 0 ? '#4a3a2b' : d < 0.2 ? '#7a6246' : '#8a6f50';
        if (z >= 29) return dark; // gap at the top: leaf warped down
        return woodLeaf(x, z + 1, front);
      }
      case 'splintered': {
        const hole = hsh(x, z, 8) > 0.82 && z > 3 && z < 28 || (x >= 6 && x <= 8 && z >= 12 && z <= 17 && hsh(x, z, 1) > 0.3);
        if (hole) return dark;
        if (z >= 29 && hsh(x, 0, 2) > 0.5) return dark;
        if (x === 6 && z > 17 && z < 26) return '#8a6f50'; // splinter
        return woodLeaf(x, z, front);
      }
      case 'hanging': {
        const cut = 26 - (x - 3) * 3; // leaf tilts down to the right, hinged at the lower left
        if (z < Math.max(cut, 3) && !(z < 2)) return woodLeaf(x, z, front);
        return z < 2 ? '#1a1d20' : dark;
      }
      default: { // broken
        if (x === 3 && z > 18 && z < 29) return '#5a4631';
        if (z <= 1 && hsh(x, z, 7) > 0.5) return '#7a6246';
        return z < 2 ? '#1a1d20' : dark;
      }
    }
  };
}
function barricade(c, dir, lv, stage) {
  const planks = lv === 1 ? [8, 21] : [4, 12, 20, 28];
  planks.forEach((z0, k) => {
    for (let x = 2; x <= 13; x++) {
      if (stage === 1 && ((x + k * 3) % 7 < 2)) continue;
      if (stage === 2 && (k % 2 === 1 || x < 5 || x > 10)) continue;
      const sk = stage ? Math.round((x - 8) * (k % 2 ? 0.4 : -0.4)) : 0;
      for (let t = 0; t < 3; t++) {
        const yb = 40 + (dir === 'x' ? x >> 1 : (15 - x) >> 1), z = z0 + t + sk;
        c.px(x, yb - z, t === 0 ? '#4a3a2b' : t === 1 ? (lv === 2 ? '#7a6246' : '#8a6f50') : '#9a8060');
      }
      if (x === 3 || x === 12) { const yb = 40 + (dir === 'x' ? x >> 1 : (15 - x) >> 1); c.px(x, yb - (z0 + 1 + sk), '#82888c'); }
    }
  });
  if (lv === 2) { // steel brace
    for (let x = 3; x <= 12; x++) { if (stage === 2 && x > 8) continue; const yb = 40 + (dir === 'x' ? x >> 1 : (15 - x) >> 1); const z = Math.round(3 + (x - 3) * 2.7); c.px(x, yb - z, '#6b7176'); c.px(x, yb - z - 1, '#82888c'); }
  }
  if (stage >= 1) for (let i = 0; i < 4 + stage * 2; i++) { const x = 3 + Math.floor(hsh(i, lv, 11) * 10), z = 1 + Math.floor(hsh(i, lv, 12) * 3); const yb = 40 + (dir === 'x' ? x >> 1 : (15 - x) >> 1); c.px(x, yb - z, '#9a8060'); } // splinters on the floor
}
// ---- C2/C3 HQ structure tiers (appended frames; deterministic via hsh only) ----
const TIER_WALLS = ['wood', 'sheet_metal', 'block'];
function tierWallFn(t) {
  return (x, z) => {
    const n = hsh(x, z, 40 + t.length);
    if (t === 'wood') {
      if (z % 7 === 0) return '#33211a';
      if (x === ((z / 7 | 0) % 2 ? 4 : 10)) return '#4a3a2b';
      if ((x === 1 || x === 14) && z % 7 === 3) return '#82888c';
      return n < 0.1 ? '#5a4631' : n > 0.9 ? '#7a6246' : (z / 7 | 0) % 2 ? '#6d5842' : '#66503c';
    }
    if (t === 'sheet_metal') {
      if (z === 20) return '#43474b';
      if ((x % 8 === 1) && (z === 19 || z === 21 || z === 5 || z === 35)) return '#bdb8ab';
      if (n > 0.93 && z < 24) return '#7a4630';
      return [ '#9aa0a4', '#82888c', '#5d6166' ][x % 3];
    }
    const row = z / 6 | 0;
    if (z % 6 === 0 || (x + (row % 2) * 4) % 8 === 0) return '#2c3034';
    return n < 0.1 ? '#5d6166' : n > 0.92 ? '#7d8286' : '#6a6e72';
  };
}
const MAT_OF = { wood: 'wood', reinforced: 'sheet_metal', metal: 'sheet_metal', sheet_metal: 'sheet_metal', block: 'block' };
const TIER_COL = {
  wood: { crack: '#1c130d', edge: '#9a8060', deb: '#8a6f50' },
  sheet_metal: { crack: '#262a2d', edge: '#bdb8ab', deb: '#82888c', rust: '#7a4630' },
  block: { crack: '#15171a', edge: '#848e8d', deb: '#6a6e72' },
};
function dmgFn(tier, stage, h) { // transparent damage overlay (cracks, chips, hole at stage 3, debris at the foot)
  const set = new Map(), col = TIER_COL[tier], r = mkr(900 + stage * 17 + tier.length * 5 + h);
  const top = h - 4;
  for (let k = 0; k <= stage; k++) {
    let x = 2 + Math.floor(r() * 12), z = top - Math.floor(r() * (h / 3));
    for (let i = 0; i < 5 + stage * 5 && z > 2; i++) { set.set(x + ',' + z, col.crack); z -= r() < 0.7 ? 1 : 0; x = Math.max(1, Math.min(14, x + (r() < 0.5 ? -1 : 1))); set.set(x + ',' + z, col.crack); }
  }
  if (stage >= 2) for (let i = 0; i < 4; i++) set.set(`${2 + Math.floor(r() * 12)},${3 + Math.floor(r() * (h - 8))}`, col.edge);
  if (stage === 3) {
    const cx = 8, cz = Math.round(h / 2) + 2, rx = 3, rz = Math.max(2, Math.round(h / 8));
    for (let x = cx - rx - 1; x <= cx + rx + 1; x++) for (let z = cz - rz - 1; z <= cz + rz + 1; z++) {
      const d = Math.hypot((x - cx) / (rx + 0.3), (z - cz) / (rz + 0.3)) + (hsh(x, z, 3) - 0.5) * 0.4;
      if (d < 1) set.set(x + ',' + z, '#0f1114'); else if (d < 1.45) set.set(x + ',' + z, col.edge);
    }
  }
  if (tier === 'sheet_metal' && stage >= 1) for (let i = 0; i < 3 * stage; i++) set.set(`${2 + Math.floor(r() * 12)},${4 + Math.floor(r() * (h - 8))}`, col.rust);
  for (let i = 0; i < 3 * stage; i++) set.set(`${1 + Math.floor(r() * 14)},${Math.floor(r() * 2)}`, col.deb);
  return (x, z) => (z < h - 1 ? set.get(x + ',' + z) || null : null);
}
function tierLeaf(tier, x, z) {
  const n = hsh(x, z, 60);
  if (tier === 'wood') {
    if (x === 3 || x === 12) return '#4a3a2b';
    if (z === 6 || z === 24) return '#4a3a2b'; // cross braces
    if (x === 10 && z === 15) return '#a99886';
    return (x + 1) % 3 === 0 ? '#5a4631' : n < 0.1 ? '#6d5842' : '#7a6246';
  }
  if (tier === 'reinforced') {
    if ((z >= 5 && z <= 7) || (z >= 24 && z <= 26)) return (x === 4 || x === 11) ? '#bdb8ab' : '#82888c'; // steel bands + rivets
    if (x === 10 && z === 15) return '#a99886';
    return (x + 1) % 3 === 0 ? '#5a4631' : '#6d5842';
  }
  if (x === 10 && (z === 14 || z === 15 || z === 16)) return '#c08a3e'; // bar handle
  if (x === 3 || x === 12 || z === 0 || z === 31) return '#43474b';
  if ((x === 5 || x === 10) && (z === 4 || z === 27)) return '#bdb8ab';
  return n > 0.93 ? '#7a4630' : x % 3 === 0 ? '#9aa0a4' : x % 3 === 1 ? '#82888c' : '#6b7176';
}
function tierDoorFn(tier, state, base) {
  const frameCol = tier === 'wood' ? '#4a3a2b' : tier === 'reinforced' ? '#5d6166' : '#43474b';
  const leafDark = tier === 'metal' ? '#43474b' : '#3d2f22';
  return (x, z) => {
    if (x === 2 || x === 13) return z <= 33 ? frameCol : base(x, z);
    if (z === 32 || z === 33) return x >= 2 && x <= 13 ? frameCol : base(x, z);
    if (x < 3 || x > 12 || z > 31) return base(x, z);
    if (state === 'closed') return tierLeaf(tier, x, z);
    if (state === 'open') return x >= 11 ? (x === 11 ? leafDark : '#2a2018') : (z < 2 ? '#1a1d20' : dark);
    // broken: permanently open gap, leaf remnants
    if (x === 3 && z > 16 && z < 28) return tierLeaf(tier, x, z);
    if (z <= 1 && hsh(x, z, 7) > 0.45) return tier === 'wood' ? '#8a6f50' : '#82888c';
    if (tier !== 'wood' && x === 12 && z > 20 && z < 27) return '#82888c';
    return z < 2 ? '#1a1d20' : dark;
  };
}
function coverFn(kind, stub) { // window cover overlay (boards / plating), opening x2..13, z13..32
  if (stub) return (x, z) => {
    if (x < 2 || x > 13 || z < 8 || z > 11) return null;
    if (kind === 'boards') return z === 8 ? '#4a3a2b' : (x === 3 || x === 12) && z === 10 ? '#82888c' : z === 11 ? '#9a8060' : '#7a6246';
    return z === 8 || z === 11 ? '#43474b' : (x === 3 || x === 12) && z === 9 ? '#bdb8ab' : ['#9aa0a4', '#82888c', '#5d6166'][x % 3];
  };
  return (x, z) => {
    if (x < 2 || x > 13) return null;
    if (kind === 'boards') {
      const k = [14, 20, 26].findIndex((z0) => z >= z0 && z <= z0 + 3 + 0);
      if (k < 0) return null;
      const z0 = [14, 20, 26][k], t = z - z0;
      if (t === 0) return '#4a3a2b';
      if ((x === 3 || x === 12) && t === 2) return '#82888c';
      return t === 3 ? '#9a8060' : hsh(x, z, 70) < 0.12 ? '#6d5842' : '#7a6246';
    }
    if (z < 12 || z > 33) return null;
    if (z === 12 || z === 33 || x === 2 || x === 13) return '#43474b';
    if (((x === 3 || x === 12) && (z === 13 || z === 32)) || ((x === 7 || x === 8) && z === 22)) return '#bdb8ab';
    return ['#9aa0a4', '#82888c', '#5d6166'][x % 3];
  };
}
function platingWallFn(stub) { // reinforcing plating overlay (wall / door)
  return (x, z) => {
    const hi = stub ? 11 : 37;
    if (x < 1 || x > 14 || z < 2 || z > hi) return null;
    if (z === 2 || z === hi || x === 1 || x === 14 || (!stub && z === 20)) return '#43474b';
    if (((x === 2 || x === 13) && (z === 3 || z === hi - 1)) || (!stub && (x === 2 || x === 13) && (z === 19 || z === 21))) return '#bdb8ab';
    return ['#9aa0a4', '#82888c', '#5d6166'][x % 3];
  };
}
{
  const fr = [];
  for (const d of ['x', 'y']) {
    for (const f of WALL_FINISH) {
      fr.push([`wall_${d}_full_${f}`, (c) => wallPaint(c, d, 40, finishFn(f))]);
      fr.push([`wall_${d}_stub_${f}`, (c) => wallPaint(c, d, 12, finishFn(f))]);
    }
  }
  const post = (c, w, inner, h) => {
    for (let z = 0; z < h; z++) for (let x = 8 - w; x < 8 + w; x++) {
      const yb = 44 - (x === 8 - w || x === 7 + w ? 0 : 1) + (inner ? 0 : (Math.abs(x - 7.5) < 1 ? 1 : 0));
      const col = z >= h - 1 ? CAPHI : z === h - 2 ? CAPMID : (x < 8 ? '#3a3e42' : '#2d3135');
      c.px(x, yb - z - (inner ? 0 : 0), (!inner && (x === 7 || x === 8)) ? (z >= h - 2 ? col : '#23272c') : col);
    }
  };
  fr.push(['corner_inner_full', (c) => post(c, 2, true, 40)], ['corner_inner_stub', (c) => post(c, 2, true, 12)]);
  fr.push(['corner_outer_full', (c) => post(c, 3, false, 40)], ['corner_outer_stub', (c) => post(c, 3, false, 12)]);
  for (const d of ['x', 'y']) {
    const plaster = finishFn('plaster');
    fr.push([`wall_${d}_full_window`, (c) => wallPaint(c, d, 40, windowFn(plaster, false), {})]);
    fr.push([`wall_${d}_stub_window`, (c) => wallPaint(c, d, 12, stubWindow(plaster, false), { skipCap: (x, z) => x >= 2 && x <= 13 })]);
    fr.push([`wall_${d}_full_window_broken`, (c) => wallPaint(c, d, 40, windowFn(plaster, true))]);
    fr.push([`wall_${d}_stub_window_broken`, (c) => wallPaint(c, d, 12, stubWindow(plaster, true), { skipCap: (x, z) => x >= 2 && x <= 13 })]);
  }
  const DOORS = ['closed', 'open', 'jammed', 'splintered', 'hanging', 'broken'];
  for (const d of ['x', 'y']) {
    const plaster = finishFn('plaster');
    for (const s of DOORS) {
      fr.push([`door_${d}_full_${s}`, (c) => wallPaint(c, d, 40, doorFn(s, false, plaster))]);
      fr.push([`door_${d}_stub_${s}`, (c) => wallPaint(c, d, 12, doorFn(s, false, plaster), { skipCap: (x, z) => x >= 3 && x <= 12 })]);
    }
    for (const s of ['closed', 'open', 'jammed']) {
      fr.push([`frontdoor_${d}_full_${s}`, (c) => wallPaint(c, d, 40, doorFn(s, true, plaster))]);
      fr.push([`frontdoor_${d}_stub_${s}`, (c) => wallPaint(c, d, 12, doorFn(s, true, plaster), { skipCap: (x, z) => x >= 3 && x <= 12 })]);
    }
  }
  for (const d of ['x', 'y']) for (const lv of [1, 2]) for (const st of [0, 1, 2]) fr.push([`barricade_${d}_lv${lv}_${st}`, (c) => barricade(c, d, lv, st)]);
  // C2/C3 appended frames (indices of everything above are unchanged)
  for (const d of ['x', 'y']) for (const t of TIER_WALLS) {
    fr.push([`wall_${d}_full_${t}`, (c) => wallPaint(c, d, 40, tierWallFn(t))]);
    fr.push([`wall_${d}_stub_${t}`, (c) => wallPaint(c, d, 12, tierWallFn(t))]);
  }
  for (const d of ['x', 'y']) {
    const plaster = finishFn('plaster');
    for (const t of ['wood', 'reinforced', 'metal']) for (const st of ['closed', 'open', 'broken']) {
      fr.push([`door_${d}_full_${t}_${st}`, (c) => wallPaint(c, d, 40, tierDoorFn(t, st, plaster))]);
      fr.push([`door_${d}_stub_${t}_${st}`, (c) => wallPaint(c, d, 12, tierDoorFn(t, st, plaster), { skipCap: (x) => x >= 3 && x <= 12 })]);
    }
  }
  for (const d of ['x', 'y']) for (const k of ['boards', 'plating']) {
    fr.push([`cover_${k}_${d}_full`, (c) => wallPaint(c, d, 40, coverFn(k, false), { cap: false })]);
    fr.push([`cover_${k}_${d}_stub`, (c) => wallPaint(c, d, 12, coverFn(k, true), { cap: false })]);
  }
  for (const d of ['x', 'y']) {
    fr.push([`plating_${d}_full`, (c) => wallPaint(c, d, 40, platingWallFn(false), { cap: false })]);
    fr.push([`plating_${d}_stub`, (c) => wallPaint(c, d, 12, platingWallFn(true), { cap: false })]);
  }
  for (const d of ['x', 'y']) for (const t of TIER_WALLS) for (const st of [1, 2, 3]) {
    fr.push([`dmg_${t}_${d}_full_${st}`, (c) => wallPaint(c, d, 40, dmgFn(t, st, 40), { cap: false })]);
    fr.push([`dmg_${t}_${d}_stub_${st}`, (c) => wallPaint(c, d, 12, dmgFn(t, st, 12), { cap: false })]);
  }
  sheet('iso_walls', 16, 48, fr, { note: 'Iso walls, frames 16x48 art px. wall_<x|y>_<full|stub>_<finish>: x = edge runs toward the screen lower-right (ANCHOR: upper-left end of the base line at frame (0,40), the line ends at (16,48)); y = edge runs toward the lower-left (ANCHOR: upper-right end at (16,40), ends at (0,48)). Tile-corner vertex V(gx,gy) = ((gx-gy)*16, (gx+gy)*8) art px. Place x frames at (V.x, V.y-40) and y frames at (V.x-16, V.y-40) for the starting vertex V of the edge. Full = 40 px above the base line (120 game px), stub = 12 px (cutaway, 36 game px); all frames keep 16x48 and stubs use only the bottom 20 rows. Every wall has a 2 px cap (light top line). The y direction is drawn ~20% darker (shadow side). Finishes: concrete (corridor/landing/storage), plaster (hallway/laundry/office, also around windows and doors), wallp_a (living/bedroom, striped faded wallpaper with dado), wallp_b (kitchen, dotted grey-green), tile (bathroom, tiled to 28 px), burned (soot). corner_inner_* (flat post, concave corner) and corner_outer_* (split-shaded post, convex corner) are posts of width 4/6 with the corner vertex at frame (8,44). wall_*_window / window_broken: glass 8x18 px with skyline; stub window = low sill with a glass edge. door_<x|y>_<full|stub>_<closed|open|jammed|splintered|hanging|broken>: doorway frame + leaf in the wall segment (closed = leaf, open = leaf swung against the right jamb, jammed = warped leaf with boards, splintered/hanging = door damage stages 2/3, broken = permanently open with splinters; stub versions show the leaf as a low panel on the floor line). frontdoor_*_(closed|open|jammed): heavier metal door with a number plate (x 5-8, z 20-27 on the leaf). barricade_<x|y>_lv<1|2>_<0|1|2>: transparent overlay for the door gap, lv1 two planks, lv2 four planks plus steel brace; stage 0 intact, 1 damaged, 2 nearly broken (reused for the 5 damage steps: 0,0,1,2,2). Draw barricade above the door frame. Wall opening is at x 3..12, z 0..31 in every door frame. C2/C3 HQ frames (appended): wall_<x|y>_<full|stub>_<wood|sheet_metal|block> (planks / corrugated steel / cinder blocks, same 2 px cap); door_<x|y>_<full|stub>_<wood|reinforced|metal>_<closed|open|broken> (same door opening, built tiers; reinforced = wood plus steel bands, metal = plate door); cover_<boards|plating>_<x|y>_<full|stub> = transparent window-cover overlays over the window opening (draw above wall_*_window; no cap); plating_<x|y>_<full|stub> = transparent steel plate overlay for walls and doors; dmg_<wood|sheet_metal|block>_<x|y>_<full|stub>_<1|2|3> = transparent damage overlays (cracks, chips, stage 3 = hole, debris at the foot; use the material of the piece: reinforced and metal doors use sheet_metal). Ghost preview: no extra frames, draw any of the above with setTint(0x88ff88) (valid) or 0xff6666 (blocked) at alpha 0.5.' });
}

// ---------- iso_stairs: 64x64 frames ----------
// ANCHOR: centre of the 2x2-tile footprint at (32,44) (footprint diamond spans x 0-64, y 28-60).
const ISO_STAIRS_ANCHOR = [32, 44];
function mkIso(c, cx, by) {
  const P = (x, y, z, col) => c.px(Math.floor(cx + x - y), Math.floor(by + (x + y) / 2 - z), col);
  return {
    P,
    top(x0, x1, y0, y1, z, col) { for (let x = x0; x < x1; x += 0.5) for (let y = y0; y < y1; y += 0.5) P(x, y, z, col); },
    faceL(x0, x1, y, z0, z1, col) { for (let x = x0; x < x1; x += 0.5) for (let z = z0; z < z1; z += 0.5) P(x, y, z, col); },
    faceR(x, y0, y1, z0, z1, col) { for (let y = y0; y < y1; y += 0.5) for (let z = z0; z < z1; z += 0.5) P(x, y, z, col); },
    box(x0, x1, y0, y1, z0, z1, m) {
      this.faceL(x0, x1, y1, z0, z1, m.l); this.faceR(x1, y0, y1, z0, z1, m.r); this.top(x0, x1, y0, y1, z1, m.t);
      if (m.edge) { this.faceL(x0, x1, y1, z0, z0 + 1, shd(m.l, 0.7)); this.faceR(x1, y0, y1, z0, z0 + 1, shd(m.r, 0.7)); }
    },
  };
}
const capTop = (h) => { const [r, g, bl] = rgbOf(h); return toHex(Math.min(r, 189), Math.min(g, 184), Math.min(bl, 171)); };
const mat = (base, o = {}) => ({ t: capTop(shd(base, o.top ?? 1.2)), l: hxs(base), r: shd(base, 0.74), edge: true });
function stairsUp(c, rot) { // ascends toward -y (rot 'ne', up-right) or -x (rot 'nw', up-left)
  const g = mkIso(c, 32, 44), N = 8, step = 28 / N;
  for (let i = N - 1; i >= 0; i--) { // step i: 0 = lowest and nearest (+y or +x); draw far (high) first
    const z1 = (i + 1) * 3, d1 = 14 - i * step, d0 = d1 - step, m = mat(i % 2 ? '#5d6166' : '#52565a');
    if (rot === 'ne') g.box(-14, 14, d0, d1, 0, z1, m); else g.box(d0, d1, -14, 14, 0, z1, m);
  }
  // side stringers (dark) and handrail on the near side
  if (rot === 'ne') { g.box(14, 15, -14, 14, 0, 26, mat('#23272c')); g.box(14, 15, -14, 14, 26, 28, mat('#6b7176')); }
  else { g.box(-14, 14, 14, 15, 0, 26, mat('#23272c')); g.box(-14, 14, 14, 15, 26, 28, mat('#6b7176')); }
  c.outline();
}
function stairsDown(c, rot) {
  const g = mkIso(c, 32, 44), N = 8, step = 28 / N;
  g.top(-14, 14, -14, 14, 0, '#0b0c0e');
  for (let i = N - 1; i >= 0; i--) { // i = 0 nearest tread (just below the rim), deeper away; draw far first
    const d1 = 14 - i * step, d0 = d1 - step, z = -2 - i, col = shd('#7a8084', (1 - i * 0.1) * (i % 2 ? 0.8 : 1));
    if (rot === 'ne') { g.top(-14, 14, d0, d1, z + 1, col); g.faceL(-14, 14, d1, z, z + 1, shd(col, 0.35)); }
    else { g.top(d0, d1, -14, 14, z + 1, col); g.faceR(d1, -14, 14, z, z + 1, shd(col, 0.35)); }
  }
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) if (Math.abs(x + 0.5 - 32) + 2 * Math.abs(y + 0.5 - 44) > 28) c.clear(x, y, 1, 1); // only what is seen through the opening
  // near rim and handrail
  if (rot === 'ne') { g.box(-15, 15, 14, 15, 0, 2, mat('#6b7176')); g.box(14, 15, -14, 14, 0, 12, mat('#23272c')); g.box(14, 15, -14, 14, 12, 14, mat('#6b7176')); }
  else { g.box(14, 15, -15, 15, 0, 2, mat('#6b7176')); g.box(-14, 14, 14, 15, 0, 12, mat('#23272c')); g.box(-14, 14, 14, 15, 12, 14, mat('#6b7176')); }
  c.outline();
}
function lightFixture(c, lit) { // wall/ceiling emergency light, drawn around (32,20)
  c.rect(26, 14, 12, 3, '#23272c'); c.rect(28, 17, 8, 7, lit ? '#c08a3e' : '#3a3e42'); c.rect(28, 17, 8, 1, '#6b7176'); c.rect(28, 23, 8, 1, '#23272c');
  c.rect(29, 18, 2, 5, lit ? '#e2c27a' : '#2c3034'); c.rect(33, 19, 2, 4, lit ? '#d07a2c' : '#23272c');
  for (let x = 28; x < 36; x += 2) c.px(x, 20, '#16191d');
  c.outline();
  if (lit) for (let y = 4; y < 44; y++) for (let x = 12; x < 52; x++) { // dithered warm glow, drawn behind (only on empty pixels)
    const d = Math.hypot((x - 32) / 1.2, (y - 20)); if (d > 8 && d < 18 && c.get(x, y) === 0 && (x + y) % 2 === (d < 13 ? 0 : 0) && (d < 13 || (x + y * 2) % 4 === 0)) c.px(x, y, d < 13 ? '#6a4a22' : '#4a3620');
  }
}
sheet('iso_stairs', 64, 64, [
  ['stairs_up_ne', (c) => stairsUp(c, 'ne')], ['stairs_up_nw', (c) => stairsUp(c, 'nw')],
  ['stairs_down_ne', (c) => stairsDown(c, 'ne')], ['stairs_down_nw', (c) => stairsDown(c, 'nw')],
  ['light_unlit', (c) => lightFixture(c, false)], ['light_lit', (c) => lightFixture(c, true)],
], { note: 'Iso stairwell pieces, frames 64x64 art px. stairs_*: 2x2-tile footprint (28x28 units), ANCHOR = footprint centre at (32,44). stairs_up_ne rises toward the upper-right (-y), stairs_up_nw toward the upper-left (-x); 8 steps, 24 px of rise, near-side handrail. stairs_down_*: the matching stair going down into a dark opening (treads descend away from the near rim). The four are used for the central shaft: draw up flight on the landing side, down flight opposite; the code mirrors for the other orientations. light_unlit / light_lit: the landing emergency fixture, transparent frames, fixture centre at (32,20); lit has a dithered amber glow (swap for the flicker, draw above walls; the soft light pool is code-made).' });

// ---------- iso_props / iso_props_l: furniture and fixtures ----------
// Front-relative coordinates: u runs along the front face left-to-right on screen, d runs from the back (-) to the front (+).
// Facing 'a': front faces the lower-left (SW, +y), i.e. the prop is backed to the upper-right (NE) wall. Facing 'b': front faces the lower-right
// (SE, +x), backed to the upper-left (NW) wall. The code mirrors both for the other two facings. For 1x2 / 2x2 props the long axis runs along the front.
function propCtx(c, cx, by, facing) {
  const g = mkIso(c, cx, by), A = facing === 'a';
  const W = (u, d) => (A ? [u, d] : [d, -u]);
  const api = {
    // box(u0,u1,d0,d1,z0,z1, baseColour | {top}, det(F,S,T,w,h))
    box(u0, u1, d0, d1, z0, z1, col, det, opt = {}) {
      const m = typeof col === 'string' ? mat(col) : { ...mat(col.base), ...(col.top ? { t: hxs(col.top) } : {}) };
      const w = u1 - u0, h = z1 - z0, px = (u, d, z, cc) => { const [x, y] = W(u, d); g.P(x, y, z, cc); };
      const frontCol = A ? m.l : m.r, sideCol = A ? m.r : m.l, su = A ? u1 : u0;
      for (let d = d0; d < d1; d += 0.5) for (let z = z0; z < z1; z += 0.5) px(su, d, z, sideCol);
      for (let u = u0; u < u1; u += 0.5) for (let z = z0; z < z1; z += 0.5) px(u, d1, z, frontCol);
      for (let u = u0; u < u1; u += 0.5) for (let d = d0; d < d1; d += 0.5) px(u, d, z1, m.t);
      for (let u = u0; u < u1; u += 0.5) px(u, d1, z0, shd(frontCol, 0.7));
      for (let d = d0; d < d1; d += 0.5) px(su, d, z0, shd(sideCol, 0.7));
      if (det) {
        const F = (a0, a1, b0, b1, cc) => { for (let u = u0 + a0; u < u0 + a1; u += 0.5) for (let z = z0 + b0; z < z0 + b1; z += 0.5) px(u, d1, z, cc); };
        const S = (s0, s1, b0, b1, cc) => { for (let d = d1 - s1; d < d1 - s0; d += 0.5) for (let z = z0 + b0; z < z0 + b1; z += 0.5) px(su, d, z, cc); };
        const T = (a0, a1, e0, e1, cc) => { for (let u = u0 + a0; u < u0 + a1; u += 0.5) for (let d = d0 + e0; d < d0 + e1; d += 0.5) px(u, d, z1, cc); };
        det(F, S, T, w, h);
      }
    },
    // open mesh cage: edges only
    wire(u0, u1, d0, d1, z0, z1, col, gap = 3, doorOpen = false) {
      const px = (u, d, z, cc) => { const [x, y] = W(u, d); g.P(x, y, z, cc); };
      for (let z = z0; z <= z1; z += 0.5) { for (const u of [u0, u1]) for (const d of [d0, d1]) px(u, d, z, col); }
      for (let u = u0; u <= u1; u += 0.5) for (const z of [z0, z1]) { px(u, d1, z, col); px(u, d0, z, col); }
      for (let d = d0; d <= d1; d += 0.5) for (const z of [z0, z1]) { px(u1, d, z, col); px(u0, d, z, col); }
      for (let u = u0 + gap; u < u1; u += gap) for (let z = z0; z <= z1; z += 0.5) if (!(doorOpen && u > u1 - 10)) px(u, d1, z, col);
      for (let z = z0 + 4; z < z1; z += 4) for (let u = u0; u <= u1; u += 0.5) if (!(doorOpen && u > u1 - 10)) px(u, d1, z, col);
      for (let d = d0 + gap; d < d1; d += gap) for (let z = z0; z <= z1; z += 0.5) px(A ? u1 : u0, d, z, col);
      for (let z = z0 + 4; z < z1; z += 4) for (let d = d0; d <= d1; d += 0.5) px(A ? u1 : u0, d, z, col);
    },
    flat(u, d, w, dd, col, z = 0) { for (let a = u; a < u + w; a += 0.5) for (let b = d; b < d + dd; b += 0.5) { const [x, y] = W(a, b); g.P(x, y, z, col); } },
    A,
  };
  return api;
}
const WOOD = '#66503c', WOODD2 = '#4a3a2b', APP = '#9a978c', DARKI = '#0f1114', MET = '#6b7176', CLO = '#6e6a5e';
const knob = '#a99886';
// each prop: (k, open) -> draws. k.box(u0,u1,d0,d1,z0,z1,col,det)
const PROPS = {
  fridge: (k, o) => k.box(-6, 6, -6, 6, 0, 36, APP, (F, S, T) => {
    if (!o) { F(0, 12, 24, 25, '#6f6c63'); F(9, 10, 26, 32, '#4a4d50'); F(9, 10, 15, 21, '#4a4d50'); F(1, 11, 0, 2, '#6f6c63'); F(0, 12, 33, 36, '#a8a69b'); }
    else { F(1, 11, 2, 34, DARKI); for (const z of [10, 20, 28]) F(1, 11, z, z + 1, '#4a4d50'); F(2, 5, 11, 15, '#5a4631'); F(7, 10, 21, 26, '#3a4a3c'); S(0, 12, 2, 34, '#6f6c63'); }
  }),
  kitchen_cupboard: (k, o) => k.box(-7, 7, -6, 6, 0, 22, { base: WOOD, top: '#8a867a' }, (F) => {
    F(1, 6.5, 3, 19, o ? DARKI : '#705a44'); F(7.5, 13, 3, 19, '#705a44'); F(1, 13, 20, 21, '#4a3a2b');
    if (!o) { F(5, 6, 10, 12, knob); } else { F(1, 6.5, 10, 11, '#4a3a2b'); F(2, 5, 3, 7, '#5a6253'); }
    F(8, 9, 10, 12, knob);
  }),
  kitchen_drawer: (k, o) => {
    k.box(-6, 6, -6, 6, 0, 14, { base: WOOD, top: '#8a867a' }, (F) => {
      for (const z of [1, 5, 9]) { F(1, 11, z, z + 3, o && z === 9 ? DARKI : '#705a44'); if (!(o && z === 9)) F(4, 8, z + 1, z + 2, knob); }
    });
    if (o) k.box(-5, 5, 6, 10, 9, 11, '#705a44', (F, S, T) => { T(1, 9, 0.5, 3.5, '#bdb8ab'); T(2, 5, 1, 2, '#3a3e42'); });
  },
  chair: (k) => {
    k.box(-5, -4, -5, -4, 0, 6, WOODD2); k.box(4, 5, -5, -4, 0, 6, WOODD2);
    k.box(-5, 5, -5, -3, 6, 21, WOOD, (F) => { F(1, 9, 3, 9, '#54412f'); });
    k.box(-5, 5, -3, 5, 6, 8, '#5a4631', (F, S, T) => T(1, 9, 1, 7, '#6d5842'));
    k.box(-5, -4, 4, 5, 0, 6, WOODD2); k.box(4, 5, 4, 5, 0, 6, WOODD2);
  },
  wardrobe: (k, o) => k.box(-6, 6, -6, 6, 0, 36, { base: '#5a4631', top: '#6d5842' }, (F, S) => {
    if (!o) { F(0.5, 5.5, 2, 33, '#6d5842'); F(6.5, 11.5, 2, 33, '#6d5842'); F(5, 7, 17, 20, '#a99886'); F(1, 11, 0, 2, '#33211a'); S(0, 12, 2, 33, '#4a3a2b'); }
    else { F(1, 11, 2, 34, DARKI); F(2, 5, 8, 33, '#34494b'); F(5, 8, 10, 31, '#6e6a5e'); F(8, 10, 12, 30, '#4c4639'); F(1, 11, 7, 8, '#6b7176'); S(0, 8, 2, 33, '#6d5842'); }
  }),
  bathroom_cabinet: (k, o) => k.box(-5, 5, -7, -4, 14, 30, '#9a978c', (F) => {
    if (!o) { F(1, 9, 1, 15, '#8a9399'); F(1, 9, 14, 15, '#6b7176'); F(2, 4, 9, 14, '#a7b0b5'); }
    else { F(1, 9, 1, 15, DARKI); F(1, 9, 7, 8, '#6b7176'); F(2, 4, 8, 12, '#a99886'); F(5, 7, 2, 6, '#68403a'); }
  }),
  medicine_cabinet: (k, o) => k.box(-4, 4, -7, -4, 14, 28, '#b8b4a8', (F) => {
    if (!o) { F(1, 7, 1, 13, '#9a978c'); F(3, 5, 4, 10, '#68403a'); F(2, 6, 6, 8, '#68403a'); }
    else { F(1, 7, 1, 13, DARKI); F(1, 7, 6, 7, '#6b7176'); F(2, 4, 7, 11, '#bdb8ab'); F(4, 6, 2, 5, '#68403a'); }
  }),
  toilet_tank: (k) => {
    k.box(-4, 4, -7, -3, 9, 22, { base: '#a8a69b', top: '#b0ada1' }, (F) => { F(6, 7.5, 11, 12.5, '#6b7176'); });
    k.box(-3, 3, -3, 6, 0, 9, '#a8a69b', null);
    k.box(-4, 4, -3, 6, 8, 10, { base: '#b8b4a8', top: '#bdb8ab' }, (F, S, T) => T(1.5, 6.5, 1, 8, '#a8a69b'));
  },
  sink_pipes: (k) => {
    k.box(-2, 2, -6, -3, 0, 14, '#a8a69b', null);
    k.box(-5, 5, -7, -1, 14, 18, { base: '#b8b4a8', top: '#bdb8ab' }, (F, S, T) => T(1, 9, 1, 5, '#8a9399'));
    k.box(-0.5, 0.5, -7, -6, 18, 23, '#82888c'); k.box(-1, 1, -6.5, -4.5, 22, 23, '#82888c');
    k.box(3, 4, -7, -6, 0, 12, MET); k.box(3, 4, -7, -4, 11, 12, MET);
  },
  water_heater: (k) => {
    k.box(-5, 5, -5, 5, 0, 36, { base: '#8f8f86', top: '#a8a69b' }, (F) => { F(0, 10, 28, 29, '#6b7176'); F(0, 10, 2, 3, '#6b7176'); F(6, 8, 18, 22, '#68403a'); F(2, 5, 17, 21, '#3a3e42'); });
    k.box(-1, 1, -1, 1, 36, 40, MET); k.box(2, 3, 2, 3, 36, 39, '#82888c');
  },
  tv: (k) => {
    k.box(-6, 6, -4, 4, 0, 9, WOODD2, (F) => { F(1, 11, 2, 7, '#33211a'); F(4, 8, 3, 4, knob); });
    k.box(-5, 5, -2, 2, 9, 21, '#1c2025', (F) => { F(1, 9, 1.5, 10.5, '#2a3a3a'); F(2, 4, 8, 10, '#3a4f50'); });
  },
  microwave: (k) => {
    k.box(-7, 7, -6, 6, 0, 12, { base: WOOD, top: '#8a867a' }, (F) => { F(1, 13, 1, 10, '#705a44'); F(5, 9, 5, 6, knob); });
    k.box(-5, 5, -4, 4, 12, 21, '#8a8f80', (F) => { F(1, 7, 1.5, 7.5, '#16191d'); F(7.5, 9, 1, 7, '#4a4d50'); F(8, 9, 2, 3, '#68403a'); });
  },
  rain_collector: (k) => {
    k.box(-5, 5, -5, 5, 0, 18, '#3f5a64', (F) => { F(0, 10, 6, 7, '#28393b'); F(0, 10, 12, 13, '#28393b'); F(4, 6, 1, 4, '#82888c'); });
    k.box(-6, 6, -6, 6, 18, 20, '#5d6166', (F, S, T) => T(2, 10, 2, 10, '#23272c')); k.box(-1, 1, -1, 1, 20, 23, '#6b7176');
  },
  water_filter: (k) => {
    k.box(-5, 5, -5, 5, 0, 7, '#6b7176', (F) => { F(4, 6, 2, 5, '#a7b0b5'); });
    k.box(-3, 3, -3, 3, 7, 27, '#6e787e', (F) => { F(0, 6, 9, 10, '#4d585d'); F(0, 6, 17, 18, '#4d585d'); });
    k.box(-4, 4, -4, 4, 27, 30, '#3a3e42'); k.box(0.5, 2.5, -6, -4, 22, 24, '#82888c');
  },
  planter: (k) => {
    k.box(-6, 6, -4, 4, 0, 8, { base: '#4a3a2b', top: '#33281a' }, (F) => { F(0, 12, 6, 7, '#33211a'); });
    for (const [u, d, z1] of [[-5, -3, 14], [-1, -1, 18], [3, 0, 13], [-3, 1, 11], [1, -3, 16]]) k.box(u, u + 2, d, d + 2, 7, z1, '#3f5a3c');
  },
  curtains: (k) => {
    k.box(-7, 7, -7, -5, 36, 37.5, MET);
    k.box(-7, 7, -7, -5, 6, 36, '#5f4f4a', (F) => { for (let u = 0; u < 14; u += 3) F(u, u + 1, 0, 30, '#4a3d39'); F(0, 14, 28, 30, '#4a3d39'); });
    k.box(-7, 7, -7, -5, 0, 6, '#4a3d39', null);
  },
  potted_plant: (k) => {
    k.box(-3, 3, -3, 3, 0, 7, '#5a3a2a', (F) => { F(0, 6, 5, 7, '#6d4a37'); });
    for (const [u, d, z1] of [[-3, -2, 16], [1, 0, 21], [-2, 1, 14], [1, -3, 18]]) { k.box(u, u + 2.5, d, d + 2.5, 6, z1, '#3f5a3c'); }
    k.box(-4, -1, -1, 2, 14, 17, '#46614a'); k.box(0, 3, -2, 1, 19, 23, '#46614a');
  },
  toolbox: (k, o) => {
    k.box(-5, 5, -2.5, 2.5, 0, 6, '#5f4238', (F, S, T) => { if (!o) F(0, 10, 4, 5, '#43302a'); else { T(1, 9, 0.5, 4.5, DARKI); T(2, 5, 1, 2, '#82888c'); T(6, 8, 2, 3.5, '#a99886'); } });
    if (!o) k.box(-2, 2, -0.5, 0.5, 6, 8, MET); else k.box(-5, 5, -3.5, -2.5, 6, 13, '#5f4238');
  },
  oil_lamp: (k) => {
    k.box(-3, 3, -3, 3, 0, 3, '#6b7176'); k.box(-2.5, 2.5, -2.5, 2.5, 3, 9, { base: '#c08a3e', top: '#e2c27a' });
    k.box(-1.5, 1.5, -1.5, 1.5, 9, 14, { base: '#8a9399', top: '#a7b0b5' }); k.box(-2, 2, -2, 2, 14, 15, '#3a3e42');
  },
  filing_cabinet: (k, o) => {
    k.box(-4, 4, -5, 5, 0, 26, '#82888c', (F) => { for (const z of [1, 9, 17]) { F(0.5, 7.5, z, z + 7, '#7a8084'); F(2.5, 5.5, z + 3, z + 4, '#b0ada1'); } });
    if (o) k.box(-3.5, 3.5, 5, 10, 17, 24, '#6b7176', (F, S, T) => { T(1, 6, 1, 5, '#bdb8ab'); T(2, 5, 0.5, 1.5, '#a99886'); });
  },
  washing_machine: (k, o) => k.box(-6, 6, -6, 6, 0, 30, { base: '#b8b4a8', top: '#bdb8ab' }, (F, S) => {
    F(0.5, 11.5, 22, 29, '#a8a69b'); F(1.5, 4.5, 24, 27, '#3a3e42'); F(6, 8, 24, 27, '#68403a'); F(9, 10.5, 25, 26.5, '#6b7176');
    if (!o) { F(3, 9, 4, 18, '#6b7176'); F(4, 8, 5, 17, '#2a3a3a'); F(4.5, 6, 11, 16, '#4d585d'); }
    else { F(3, 9, 4, 18, DARKI); F(4, 8, 5, 12, '#6e6a5e'); S(0, 4, 4, 18, '#8a8f80'); }
  }),
  laundry_basket: (k) => {
    k.box(-4, 4, -4, 4, 0, 9, { base: '#5a4e2e', top: '#6e6a5e' }, (F) => { for (let z = 2; z < 9; z += 3) F(0, 8, z, z + 1, '#33281a'); for (let u = 1; u < 8; u += 2.5) F(u, u + 0.5, 0, 9, '#33281a'); });
  },
  toy_box: (k, o) => {
    k.box(-5, 5, -4, 4, 0, 9, '#3f5a64', (F, S, T) => { if (!o) { F(0, 10, 6, 7, '#28393b'); T(1, 4, 1, 4, '#5a3a2a'); T(6, 8, 4, 7, '#7a6a4c'); } else { T(0.5, 9.5, 0.5, 7.5, DARKI); T(1, 4, 1, 3, '#5a3a2a'); T(6, 8, 3, 6, '#7a6a4c'); } });
    if (o) k.box(-5, 5, -5, -4, 9, 15, '#28393b'); else k.box(1, 4, -1, 2, 9, 12, '#6a4a3c');
  },
  utility_shelf: (k) => {
    const L = '#82888c';
    for (const u of [-6, 5.5]) for (const d of [-5, 4.5]) k.box(u, u + 0.5, d, d + 0.5, 0, 38, L);
    for (const z of [9, 20, 31]) k.box(-6, 6, -5, 5, z, z + 1, '#5d6166');
    k.box(-4, 0, -4, 1, 1, 9, '#68403a'); k.box(1, 5, -3, 3, 1, 8, '#4c4639', (F) => F(1, 3, 3, 5, '#6e6a5e'));
    k.box(-5, -1, -4, 2, 10, 17, '#5a4631'); k.box(1, 4, -2, 1, 10, 14, '#3f5a64'); k.box(-4, 4, -4, 3, 21, 27, '#6e6a5e'); k.box(0, 4, -3, 2, 32, 37, '#7a6a4c');
  },
  charred_debris: (k) => {
    k.box(-6, 6, -5, 5, 0, 3, '#16191d'); k.box(-5, -1, -4, 1, 3, 12, '#0b0c0e'); k.box(1, 5, -2, 4, 3, 8, '#23272c');
    k.box(-2, 1, 2, 5, 3, 6, '#14110f'); k.box(-6, 6, 2, 3, 3, 4, '#0b0c0e'); k.box(2, 4, -4, -2, 8, 15, '#16191d');
    k.box(-1, 0, -1, 0, 12, 14, '#4e1c1a'); k.box(3, 4, 1, 2, 3, 4, '#5a3a2a');
  },
};
// 1x2 / 2x2 props: long axis along the front (u in [-14,14])
const LPROPS = {
  table: (k) => {
    for (const u of [-13, 12]) for (const d of [-5, 4]) k.box(u, u + 1.5, d, d + 1.5, 0, 14, WOODD2);
    k.box(-14, 14, -6, 6, 14, 17, { base: '#5a4631', top: '#6d5842' }, (F) => F(0, 28, 0, 1, '#33211a'));
    k.box(-6, 0, -3, 2, 17, 18, '#bdb8ab'); k.box(6, 10, -1, 2, 17, 21, '#82888c');
  },
  sofa: (k) => {
    const S = '#46504e';
    k.box(-14, 14, -6, 6, 0, 9, { base: S, top: '#56615e' }, (F) => { F(13.5, 14.5, 1, 9, '#2f3836'); F(0, 28, 0, 2, '#2f3836'); });
    k.box(-14, 14, -6, -3, 9, 21, S, (F) => { for (let u = 0; u < 28; u += 9) F(u, u + 1, 1, 12, '#3a4543'); });
    k.box(-14, -11, -3, 6, 9, 16, '#3a4543'); k.box(11, 14, -3, 6, 9, 16, '#3a4543');
    k.box(-3, 3, -2, 5, 9, 11, '#56615e');
  },
  bed_frame: (k) => {
    k.box(-14, 14, -14, 14, 3, 7, '#4a3a2b'); for (const u of [-14, 13]) for (const d of [-14, 13]) k.box(u, u + 1, d, d + 1, 0, 3, '#33211a');
    k.box(-14, 14, -14, -12, 7, 22, WOOD, (F) => F(2, 26, 2, 12, '#54412f'));
    k.box(-13, 13, -12, 13, 7, 11, { base: '#7a7568', top: '#8a8578' }, (F, S, T) => { T(3, 12, 2, 8, '#68403a'); T(15, 24, 12, 18, '#6a6558'); });
    k.box(-11, -2, -11, -4, 11, 13, '#8f8f84');
  },
  hero_bed: (k) => {
    k.box(-14, 14, -14, 14, 3, 7, '#4a3a2b'); for (const u of [-14, 13]) for (const d of [-14, 13]) k.box(u, u + 1, d, d + 1, 0, 3, '#33211a');
    k.box(-14, 14, -14, -12, 7, 22, WOOD, (F) => F(2, 26, 2, 12, '#54412f'));
    k.box(-13, 13, -12, 13, 7, 11, { base: '#8f8f84', top: '#a39f92' });
    k.box(-13, 13, -2, 13, 11, 13, { base: '#34494b', top: '#3f595b' }, (F, S, T) => { T(1, 25, 4, 5, '#28393b'); });
    k.box(-11, -2, -11, -4, 11, 14, '#b8b4a8'); k.box(2, 11, -11, -4, 11, 14, '#b8b4a8');
  },
  survivor_bed: (k) => {
    for (const u of [-14, 12]) for (const d of [-6, 4]) k.box(u, u + 2, d, d + 2, 0, 6, '#6b7176');
    k.box(-14, 14, -6, 6, 6, 8, '#5d6166');
    k.box(-13, 13, -5, 5, 8, 11, { base: '#5b5547', top: '#6e6a5e' }, (F, S, T) => { T(1, 25, 1, 3, '#4c4639'); T(1, 8, 3, 9, '#a99886'); });
  },
  mattress: (k) => {
    k.box(-14, 14, -6, 6, 0, 5, { base: '#6e6a5e', top: '#8f8c80' }, (F, S, T) => { for (let u = 3; u < 28; u += 6) F(u, u + 0.5, 0, 5, '#4c4639'); T(8, 16, 3, 8, '#68403a'); T(18, 25, 1, 4, '#5f5344'); });
  },
  desk: (k) => {
    k.box(-14, -6, -6, 6, 0, 14, '#5a4631', (F) => { for (const z of [1, 5, 9]) { F(1, 7, z, z + 3, '#6d5842'); F(3, 5, z + 1, z + 2, knob); } });
    k.box(-14, 14, -6, 6, 14, 16, { base: '#66503c', top: '#7a6246' });
    k.box(12, 13.5, -5, -3.5, 0, 14, WOODD2); k.box(12, 13.5, 4, 5.5, 0, 14, WOODD2);
    k.box(-4, 1, -3, 2, 16, 17, '#bdb8ab'); k.box(2, 8, -5, -2, 16, 24, '#1c2025', (F) => F(0.5, 5.5, 1, 6, '#2a3a3a')); k.box(7, 10, 2, 4, 16, 18, '#3a3e42');
  },
  storage_cage: (k, o) => {
    k.box(-12, -4, -4, 2, 0, 9, '#5a4631'); k.box(-2, 10, -4, 3, 0, 14, '#4c4639', (F) => F(1, 11, 5, 6, '#6e6a5e')); k.box(4, 10, -4, 2, 14, 20, '#68403a'); k.box(-12, -6, 2, 5, 0, 5, '#5d6166');
    k.box(11, 13, 2, 4, o ? 6 : 8, o ? 10 : 12, '#c08a3e'); // padlock (lamp amber, tiny)
    k.wire(-14, 14, -6, 6, 0, 34, '#82888c', 4, o);
  },
  workbench: (k) => {
    k.box(-14, 14, -6, 6, 14, 18, { base: '#5a4631', top: '#7a6246' }, (F) => F(0, 28, 0, 1, '#33211a'));
    for (const u of [-14, 12.5]) for (const d of [-6, 4.5]) k.box(u, u + 1.5, d, d + 1.5, 0, 14, '#33211a');
    k.box(-13, 13, -5, 4, 6, 7, '#4a3a2b');
    k.box(-12, -8, -4, 0, 18, 24, '#82888c'); k.box(-1, 7, -3, 1, 18, 21, '#5f4238'); k.box(9, 12, 1, 4, 18, 20, '#a99886');
  },
  charred_big: (k) => {
    k.box(-14, 14, -6, 6, 0, 3, '#16191d'); k.box(-12, -4, -5, 3, 3, 13, '#0b0c0e'); k.box(0, 10, -4, 4, 3, 8, '#23272c'); k.box(4, 12, -5, -1, 8, 15, '#16191d'); k.box(-6, -2, 2, 5, 3, 7, '#14110f');
    k.box(8, 9, 1, 2, 3, 4, '#4e1c1a'); k.box(-9, -8, 0, 1, 13, 14, '#5a3a2a');
  },
};
const OPENABLE = ['fridge', 'kitchen_cupboard', 'kitchen_drawer', 'wardrobe', 'bathroom_cabinet', 'medicine_cabinet', 'toolbox', 'filing_cabinet', 'washing_machine', 'toy_box'];
{
  const fr = [];
  const add = (store, id, cx, by, fn, open) => { for (const f of ['a', 'b']) fr.push([`${id}${open ? '_open' : ''}_${f}`, (c) => { fn(propCtx(c, cx, by, f), open); }]); };
  for (const [id, fn] of Object.entries(PROPS)) { add(null, id, 16, 48, fn, false); if (OPENABLE.includes(id)) add(null, id, 16, 48, fn, true); }
  const flatDebris = (kind) => (k) => { const r = mkr(kind === 'p' ? 11 : 12); for (let i = 0; i < 9; i++) { const u = -6 + r() * 10, d = -5 + r() * 9; k.flat(u, d, 2 + Math.floor(r() * 3), 1 + Math.floor(r() * 2), kind === 'p' ? (r() < 0.5 ? 'X' : 'X') : (r() < 0.5 ? 'TD' : 'CLOTH')); } };
  fr.push(['debris_papers', (c) => flatDebris('p')(propCtx(c, 16, 48, 'a'))], ['debris_clothes', (c) => flatDebris('c')(propCtx(c, 16, 48, 'a'))]);
  // C2/C3 appended: trap props and demolition rubble
  const TRAP = {
    spike_strip: (k) => { k.box(-6, 6, -4, 4, 0, 2, '#4a3a2b'); for (const u of [-5, -2, 1, 4]) for (const d of [-3, 1]) k.box(u, u + 1.5, d, d + 1.5, 2, 6, '#bdb8ab'); },
    alarm_lure: (k) => { k.box(-4, 4, -4, 4, 0, 5, '#6b7176'); k.box(-2.5, 2.5, -2.5, 2.5, 5, 9, '#c08a3e'); k.box(-0.5, 0.5, -0.5, 0.5, 9, 13, '#a8403a'); },
    rubble: (k) => { const r = mkr(5150); k.flat(-6, -5, 12, 10, '#2c3034'); for (let i = 0; i < 10; i++) { const u = -6 + r() * 9, d = -5 + r() * 8, w = 1.5 + r() * 2.5; k.box(u, u + w, d, d + w, 0, 1 + Math.floor(r() * 3), r() < 0.5 ? '#5d6166' : r() < 0.5 ? '#6a6e72' : '#66503c'); } },
  };
  for (const [id, fn] of Object.entries(TRAP)) for (const f of ['a', 'b']) fr.push([`${id}_${f}`, (c) => fn(propCtx(c, 16, 48, f))]);
  const names = Object.keys(PROPS).flatMap((id) => OPENABLE.includes(id) ? [id, id + '_open'] : [id]);
  sheet('iso_props', 32, 56, fr, { outline: false, note: `Iso props, frames 32x56 art px (1x1 footprint). ANCHOR: tile centre at (16,48) (floor diamond spans y 40-56, so setOrigin(0.5, 48/56)); props stand within +-7 units of it, tall ones up to 40 px high. Frames <id>_<a|b> and <id>_open_<a|b> (searched/ajar). Facing a: front toward the lower-left, backed to the upper-right wall; b: front toward the lower-right, backed to the upper-left wall; mirror (flipX) for the other two facings. Mounted objects (bathroom_cabinet, medicine_cabinet) and curtains are drawn at wall height at the back of the tile (draw at the wall edge). ids: ${names.join(', ')}; C2/C3 appended: spike_strip, alarm_lure (1x1 traps, flat strip / alarm unit with amber bell and red light) and rubble (pile left by demolition; floor stain first, then chunks), each _a|_b; debris_papers / debris_clothes = flat ransacked clutter (one facing). Lamp: oil_lamp; light pool is code-made. Mirroring note: lighting is baked (left face lighter), so mirrored copies swap light direction, which is acceptable.` });
  const fl = [];
  for (const [id, fn] of Object.entries(LPROPS)) { for (const f of ['a', 'b']) fl.push([`${id}_${f}`, (c) => fn(propCtx(c, 32, 52, f), false)]); if (id === 'storage_cage') for (const f of ['a', 'b']) fl.push([`${id}_open_${f}`, (c) => fn(propCtx(c, 32, 52, f), true)]); }
  sheet('iso_props_l', 64, 72, fl, { outline: false, note: 'Iso large props, frames 64x72 art px: table, sofa, mattress, desk, storage_cage (+_open), workbench, survivor_bed, charred_big (1x2 footprint, 14x14... 28x12 units) and bed_frame, hero_bed (2x2 footprint). ANCHOR: centre of the footprint rectangle at (32,52) (setOrigin(0.5, 52/72)). Long axis runs along the front face: for facing a the footprint is 2 tiles along x (front toward the lower-left), for b it is 2 tiles along y (front toward the lower-right); mirror for the other two facings. Frames <id>_<a|b>. The bed_frame is the stripped salvage frame with a stained mattress, hero_bed is the made-up bed (teal blanket), survivor_bed a cot.' });
}

// ---------- iso characters: 16x32, 8 facings ----------
// ANCHOR: feet / tile centre at (8,30) (setOrigin(0.5, 30/32)). Frames <anim>_<dir>_<i>, dir order S, SW, W, NW, N, NE, E, SE.
// Five views are drawn (S, SE, E, NE, N); SW, W, NW are exact mirrors baked into the sheet so no flipping is needed in code.
const DIRS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
const VIEW = { S: 'S', SW: 'SE', W: 'E', NW: 'NE', N: 'N', NE: 'NE', E: 'E', SE: 'SE' };
const MIRRORED = new Set(['SW', 'W', 'NW']);
const flipH = (c) => { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w >> 1; x++) { const a = (y * c.w + x) * 4, b = (y * c.w + (c.w - 1 - x)) * 4; for (let k = 0; k < 4; k++) { const t = c.d[a + k]; c.d[a + k] = c.d[b + k]; c.d[b + k] = t; } } };
const line2 = (c, x0, y0, x1, y1, col) => { c.line(x0, y0, x1, y1, col); if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) c.line(x0, y0 + 1, x1, y1 + 1, col); else c.line(x0 + 1, y0, x1 + 1, y1, col); };
// attack table: hand + weapon tip, per view, per stage (windup, swing, recover), for TT=10 (torso top)
const ATK = {
  S: [{ h: [12, 8], t: [12, 2] }, { h: [12, 18], t: [12, 25] }, { h: [11, 16], t: [8, 22] }],
  SE: [{ h: [11, 8], t: [9, 2] }, { h: [13, 17], t: [15, 23] }, { h: [12, 15], t: [14, 19] }],
  E: [{ h: [9, 9], t: [5, 3] }, { h: [13, 13], t: [15, 15] }, { h: [12, 15], t: [14, 19] }],
  NE: [{ h: [11, 9], t: [8, 3] }, { h: [13, 10], t: [15, 6] }, { h: [12, 12], t: [14, 9] }],
  N: [{ h: [12, 9], t: [12, 3] }, { h: [12, 6], t: [12, 1] }, { h: [11, 9], t: [9, 4] }],
};
// zombie reach (both arms): hands at [A, B] per view
const ZREACH = { S: [[4, 17], [11, 17]], SE: [[7, 17], [13, 16]], E: [[13, 14], [14, 13]], NE: [[11, 10], [13, 9]], N: [[2, 11], [13, 11]] };
function person(c, v, pal, p = {}) {
  const { bob = 0, sw = [0, 0], lift = [0, 0], atk = -1, zomb = false, kneel = 0, headDx = 0, mouth = false, reach = 0, lean = 0, tired = 0 } = p;
  const { skin, hair, shirt, sleeve, pants, shoe = 'S', accent, pack, hairStyle = 'short', eye = 'O', decay = false } = pal;
  const TT = 10 + bob, HT = 4 + bob, legTop = 20 + kneel, hipB = 19 + kneel, foot = 29;
  const back = v === 'N' || v === 'NE', face = !back;
  const armPose = (side) => { // returns hand pos [x,y] for side 0 (A) or 1 (B) for current pose
    if (atk >= 0 && side === 1) return ATK[v][atk].h;
    if (zomb && (reach || atk >= 0)) { const z = ZREACH[v][side]; return [z[0], z[1] + bob - (atk >= 0 ? 2 : 0) + (tired ? side : 0)]; }
    return null;
  };
  const legs = () => {
    const draw = (i, x0, side) => {
      const s = sw[i], l = lift[i], col = i ? shd(pants, 0.8) : pants;
      if (v === 'E') {
        const hx = 7 + (i ? 0 : 0), fx = hx + s * 2, fy = foot - l;
        line2(c, hx, legTop, fx, fy, col); c.rect(fx - 1 + (s >= 0 ? 0 : 0), fy, 4, 1, shoe);
      } else if (v === 'S' || v === 'N') {
        const f = foot - l - ((v === 'S' ? s < 0 : s > 0) ? 1 : 0), x = i ? 8 : 5;
        c.rect(x, legTop, 3, f - legTop, col); c.rect(x, f, 3, 1, shoe);
      } else { // SE / NE: legs spread horizontally and shift with the stride
        const x = (i ? 8 : 5) + (v === 'SE' ? s : -s), f = foot - l;
        line2(c, i ? 8 : 5, legTop, x, f, col); c.rect(x - 0, f, 3, 1, shoe);
      }
    };
    draw(1, 8); draw(0, 5);
    if (v === 'S' || v === 'N') c.rect(7, legTop, 2, 3, shd(pants, 0.6));
  };
  const arm = (side, front) => { // side 0 = A (screen-left / near), 1 = B
    const hp = armPose(side);
    let sx, sy = TT + 1, ex, ey;
    if (v === 'S' || v === 'N') { sx = side ? 11 : 3; ex = hp ? hp[0] : sx; ey = hp ? hp[1] : TT + 7 + (side ? sw[0] : sw[1]) * (v === 'S' ? -1 : 1) * 0; }
    else if (v === 'E') { sx = 7; ex = hp ? hp[0] : sx - sw[side] * -1 * 0 + (side ? sw[1] : sw[0]) * -2; ey = hp ? hp[1] : TT + 7; }
    else { sx = side ? 10 : 4; ex = hp ? hp[0] : sx + (side ? sw[0] : sw[1]) * (v === 'SE' ? -1 : 1); ey = hp ? hp[1] : TT + 7; }
    const col = side === 1 && (v === 'E') ? shd(sleeve, 0.7) : sleeve;
    if (ey < TT - 4) ey = TT - 4;
    line2(c, sx, sy, ex, ey, col);
    c.rect(ex, ey, 2, 2, skin);
    if (side === 1 && atk >= 0 && pal.weapon) { const t = ATK[v][atk].t; c.line(ex, ey, t[0], t[1], 'WOOD'); c.line(ex + 1, ey, t[0] + 1, t[1], 'WOOD'); c.px(t[0], t[1], pal.weapon); c.px(t[0] + 1, t[1], pal.weapon); }
    return [ex, ey];
  };
  const armsBehind = v === 'E' || (zomb && back);
  // far arm first for side views
  if (v === 'E') arm(1);
  if (zomb && back) { arm(0); arm(1); }
  legs();
  // pack (hero)
  if (pack && (back || v === 'E')) { if (v === 'E') c.rect(3, TT + 1, 3, 8, pack); else c.rect(5, TT + 1, 6, 7, pack); if (v !== 'E') c.rect(5, TT + 7, 6, 1, shd(pack, 0.7)); }
  // torso
  const tx = v === 'E' ? 5 : 5, tw = v === 'E' ? 5 : 6;
  c.rect(tx + lean, TT, tw, hipB - TT + 1, shirt);
  c.rect(tx + lean, hipB, tw, 1, pants);
  if (v === 'S') { c.rect(7, TT + 1, 2, hipB - TT - 1, shd(shirt, 0.75)); if (accent) c.rect(6, TT, 4, 2, accent); }
  if (v === 'SE') { c.rect(9, TT + 1, 1, hipB - TT - 1, shd(shirt, 0.75)); if (accent) c.rect(7, TT, 3, 2, accent); }
  if (v === 'E') { c.rect(5 + lean, TT + 4, 5, 1, shd(shirt, 0.8)); if (accent) c.px(9, TT, accent); }
  if ((v === 'N' || v === 'NE') && !pack) c.rect(7, TT + 1, 1, hipB - TT - 1, shd(shirt, 0.8));
  if (decay) { c.px(6, TT + 3, 'B'); c.px(8, TT + 5, 'ZD'); c.rect(8, TT + 7, 2, 1, 'B'); c.px(5, hipB, 'O'); c.px(9, hipB, 'O'); c.px(7 + lean, TT + 2, 'ZD'); }
  // head
  const hx = 5 + headDx;
  c.rect(hx, HT, 6, 6, skin);
  if (v === 'S') {
    if (hairStyle === 'bald') { c.rect(hx, HT, 2, 1, 'ZD'); } else { c.rect(hx, HT, 6, 2, hair); if (hairStyle === 'short') { c.px(hx, HT + 2, hair); c.px(hx + 5, HT + 2, hair); } else { c.rect(hx, HT + 2, 1, 4, hair); c.rect(hx + 5, HT + 2, 1, 4, hair); c.rect(hx + 2, HT - 1, 2, 1, hair); } }
    c.px(hx + 1, HT + 3, eye); c.px(hx + 4, HT + 3, eye);
    if (mouth) c.rect(hx + 2, HT + 4, 2, 2, 'B'); else c.rect(hx + 2, HT + 5, 2, 1, shd(skin, 0.7));
  } else if (v === 'N') {
    c.rect(hx, HT, 6, 5, hair); c.rect(hx + 1, HT + 5, 4, 1, shd(skin, 0.85));
    if (hairStyle === 'bun') { c.rect(hx + 2, HT - 1, 2, 1, hair); c.rect(hx, HT + 5, 6, 1, hair); }
    if (hairStyle === 'bald') { c.rect(hx, HT, 6, 5, skin); c.rect(hx + 1, HT + 1, 2, 1, 'ZD'); c.px(hx + 4, HT + 3, 'B'); }
  } else if (v === 'E') {
    if (hairStyle === 'bald') { c.rect(hx, HT, 2, 3, 'ZD'); } else { c.rect(hx, HT, 3, 5, hair); c.rect(hx + 3, HT, 3, 2, hair); if (hairStyle === 'bun') { c.rect(hx, HT + 5, 2, 1, hair); c.rect(hx - 1, HT + 1, 2, 3, hair); } }
    c.px(hx + 4, HT + 3, eye); c.px(hx + 6, HT + 4, skin);
    if (mouth) c.rect(hx + 4, HT + 4, 2, 2, 'B'); else c.px(hx + 4, HT + 5, shd(skin, 0.7));
  } else if (v === 'SE') {
    if (hairStyle === 'bald') { c.rect(hx, HT, 3, 2, 'ZD'); } else { c.rect(hx, HT, 6, 2, hair); c.rect(hx, HT + 2, 2, 3, hair); if (hairStyle === 'bun') { c.rect(hx, HT + 2, 1, 4, hair); c.rect(hx + 1, HT - 1, 3, 1, hair); } }
    c.px(hx + 3, HT + 3, eye); c.px(hx + 5, HT + 3, eye);
    if (mouth) c.rect(hx + 3, HT + 4, 2, 2, 'B'); else c.rect(hx + 3, HT + 5, 2, 1, shd(skin, 0.7));
  } else { // NE
    if (hairStyle === 'bald') { c.rect(hx, HT, 6, 5, skin); c.rect(hx + 1, HT + 1, 2, 1, 'ZD'); c.px(hx + 5, HT + 3, 'B'); }
    else { c.rect(hx, HT, 6, 5, hair); c.rect(hx + 5, HT + 3, 1, 2, skin); if (hairStyle === 'bun') { c.rect(hx + 2, HT - 1, 2, 1, hair); c.rect(hx, HT + 5, 5, 1, hair); } }
    c.rect(hx + 1, HT + 5, 4, 1, shd(skin, 0.85));
  }
  if (decay && face) { c.px(hx + 2, HT + 1, 'ZD'); c.px(hx + (v === 'E' ? 3 : 4), HT + 1, 'B'); }
  // near/front arms
  if (v === 'E') arm(0); else if (!(zomb && back)) { arm(0); arm(1); }
}
// isoLying figure: chain along the facing vector; fell backwards (head at the rear end)
function isoLying(c, v, pal, blood = true) {
  const vec = { S: [1, 0], SE: [1, 0.5], E: [1, 0], NE: [1, -0.5], N: [1, 0] }[v]; // S and N lie sideways so they read
  const cx = 8, cy = 25;
  const segs = [['head', pal.skin], ['top', pal.shirt], ['mid', pal.shirt], ['hip', pal.pants], ['leg', pal.pants], ['foot', pal.shoe || 'S']];
  const sp = vec[0] === 0 ? 2.3 : 2.4;
  if (blood) { const bx = cx - vec[0] * sp * 2.5, by = cy - vec[1] * sp * 2.5 + 1; c.rect(Math.round(bx) - 3, Math.round(by) - 1, 7, 4, 'B'); c.px(Math.round(bx) + 3, Math.round(by) + 3, 'B'); }
  segs.forEach(([k, col], i) => {
    const t = i - 2.5, x = Math.round(cx + vec[0] * t * sp * 2.4 / 2.4), y = Math.round(cy + vec[1] * t * (vec[0] === 0 ? 2.3 : 2.4));
    const horiz = vec[1] === 0, vert = vec[0] === 0;
    let w = vert ? (k === 'head' ? 6 : k === 'leg' || k === 'foot' ? 5 : 7) : horiz ? 3 : 4, h = vert ? 3 : horiz ? (k === 'head' ? 6 : k === 'leg' || k === 'foot' ? 4 : 5) : 4;
    if (k === 'foot') { w = vert ? 5 : horiz ? 2 : 3; h = vert ? 2 : horiz ? 4 : 3; }
    c.rect(x - (w >> 1), y - (h >> 1), w, h, col);
    if (k === 'head' && pal.hair && pal.hairStyle !== 'bald') { const hs = vert ? [x - 3, y - (vec[1] > 0 ? 1 : 0), 6, 2] : [x - 1, y - 3, 2, 5]; c.rect(hs[0], hs[1], hs[2], hs[3], pal.hair); }
    if (k === 'head' && !pal.hair) { /* bald: nothing */ }
  });
  if (pal.decay) c.px(8, 24, 'B');
}
const HERO_PAL = { skin: 'SK', hair: 'S', shirt: 'T', sleeve: 'TD', pants: 'PANT', shoe: 'S', accent: 'X', pack: 'R', weapon: 'L', hairStyle: 'short' };
const MARA_PAL = { skin: 'SK', hair: 'WOODD', shirt: 'X', sleeve: 'X', pants: 'T', shoe: 'METAL', accent: 'RED', pack: null, weapon: 'L', hairStyle: 'bun' };
const WALK = [{ bob: 1, sw: [1, -1], lift: [0, 0] }, { bob: 0, sw: [0, 0], lift: [0, 1] }, { bob: 1, sw: [-1, 1], lift: [0, 0] }, { bob: 0, sw: [0, 0], lift: [1, 0] }];
function isoChars(key, anims, draw, note) {
  const frames = [], animDefs = [];
  // anims flagged late (5th entry) are appended after all directions so earlier frame indices never shift
  for (const late of [false, true]) for (const d of DIRS) for (const [name, n, fps, rep, lt] of anims) {
    if (!!lt !== late) continue;
    const idx = [];
    for (let i = 0; i < n; i++) { idx.push(frames.length); frames.push([`${name}_${d}_${i}`, (c) => { draw(c, VIEW[d], name, i); if (MIRRORED.has(d)) flipH(c); }]); }
    animDefs.push(anim(`${name}_${d}`, idx, fps, rep));
  }
  sheet(key, 16, 32, frames, { outline: true, animations: animDefs, note });
}
const NOTE_CH = 'Frames 16x32 art px, ANCHOR: feet / tile centre at (16/2, 30) = (8,30) (setOrigin(0.5, 30/32)). 8 facings in the order S, SW, W, NW, N, NE, E, SE (S = toward the camera, E = screen right, N = away). Frame names <anim>_<DIR>_<i>, animation keys <anim>_<DIR> (e.g. walk_SE). SW, W, NW are baked mirrors of SE, E, NE (no flipX needed). 1 px near-black outline. ';
// C2/C3 shoot: arm extended with a pistol/shotgun-sized dark gun; frame 0 = aim, frame 1 = recoil (hand and gun 1 px back)
const SHOOT_HAND = { S: [11, 13], SE: [11, 12], E: [11, 12], NE: [11, 10], N: [11, 9] };
const SHOOT_GUN = { S: [[0, 2], [0, 3], [0, 4]], SE: [[2, 0], [3, 0], [4, 1]], E: [[2, 0], [3, 0], [4, 0]], NE: [[2, 0], [3, -1], [4, -1]], N: [[0, -2], [0, -3], [0, -4]] };
const SHOOT_BACK = { S: [0, -1], SE: [-1, 0], E: [-1, 0], NE: [-1, 0], N: [0, 1] };
function shootDraw(c, v, pal, i) {
  const h = SHOOT_HAND[v], b = SHOOT_BACK[v], o = i ? 1 : 0;
  ATK[v][3] = { h: [h[0] + b[0] * o, h[1] + b[1] * o], t: [0, 0] };
  person(c, v, { ...pal, weapon: null }, { atk: 3, bob: 0, headDx: 0 });
  SHOOT_GUN[v].forEach(([dx, dy], k) => c.rect(h[0] + b[0] * o + dx, h[1] + b[1] * o + dy, k === 2 ? 1 : 2, k === 2 ? 1 : 2, k === 0 ? '#23272c' : k === 1 ? 'L' : 'O'));
}
function humanDraw(pal) {
  return (c, v, name, i) => {
    if (name === 'idle') return person(c, v, pal, { bob: i });
    if (name === 'walk') return person(c, v, pal, WALK[i]);
    if (name === 'attack') return person(c, v, pal, { atk: i, bob: i === 1 ? 1 : 0, lean: 0, headDx: i === 1 ? (v === 'E' || v === 'SE' ? 1 : 0) : 0 });
    if (name === 'shoot') return shootDraw(c, v, pal, i);
    if (name === 'hurt') return person(c, v, pal, { bob: 1, headDx: v === 'E' || v === 'SE' ? -1 : 0, lean: v === 'E' ? -1 : 0, mouth: true });
    if (i === 0) return person(c, v, pal, { bob: 1, headDx: v === 'E' || v === 'SE' ? -1 : 0, lean: v === 'E' ? -1 : 0 });
    if (i === 1) return person(c, v, pal, { bob: 5, kneel: 3, headDx: 0 });
    isoLying(c, v, pal, true);
  };
}
isoChars('iso_hero', [['idle', 2, 2, -1], ['walk', 4, 8, -1], ['attack', 3, 12, 0], ['hurt', 1, 8, 0], ['death', 3, 6, 0], ['shoot', 2, 14, 0, true]], humanDraw(HERO_PAL),
  NOTE_CH + 'Hero: faded teal jacket, dark hair, rust backpack visible from behind and the side, pale face on the front. idle 2 (2 fps), walk 4 (8 fps; use a higher fps for running), attack 3 (windup, swing, recover; swings a pipe on the right hand), death 3 (stagger, kneel, isoLying). C2/C3: shoot 2 (aim, recoil; arm out holding a dark pistol/shotgun-sized gun, 14 fps, once), frames appended after all other frames of the sheet (names shoot_<DIR>_<0|1>, anim shoot_<DIR>); pair with iso_fx muzzle_flash_0|1 at the gun tip.');
isoChars('iso_mara', [['idle', 2, 2, -1], ['walk', 4, 8, -1], ['attack', 3, 12, 0], ['hurt', 1, 8, 0], ['death', 3, 6, 0]], humanDraw(MARA_PAL),
  NOTE_CH + 'Mara: nurse in light scrubs, dark hair in a bun, red chest mark, dark teal trousers. Same frame layout as iso_hero.');
// ---------- zombies: ordinary residents who died (GDD 9: dark blood only, no gore body parts) ----------
// Same proportions as the hero (head y4-9, torso y10-19, legs y20-28, shoes y29). Slack posture: tilted head,
// arms hanging low, uneven limping gait. Only deterministic fixed pixels here (no rng) so other sheets stay byte-identical.
const ZBL = '#4a1a18', ZBD = '#33100f', ZMOUTH = '#2a1414';
const ZOUT = {
  office: { kind: 'office', skin: '#8c8a80', hair: '#2a211c', hairStyle: 'short', top: '#9a978c', inner: '#9a978c', tie: '#3a2226', pants: '#2b2f36', shoe: '#14171b', sleeves: 'long' },
  gown: { kind: 'gown', skin: '#938f86', hair: '#18130f', hairStyle: 'long', top: '#8d97a0', pants: '#8d97a0', shoe: null, sleeves: 'short' },
  hoodie: { kind: 'hoodie', skin: '#76695f', hair: '#141211', hairStyle: 'short', top: '#454b53', pants: '#3b4a5c', shoe: '#a8a69b', sleeves: 'long' },
  scrubs: { kind: 'scrubs', skin: '#96928a', hair: '#3a2a20', hairStyle: 'bun', top: '#5d7b80', pants: '#52707a', shoe: '#b8b4a8', sleeves: 'short', badge: '#bdb8ab' },
  elder: { kind: 'cardigan', skin: '#9a968c', hair: '#a09e98', hairStyle: 'thin', top: '#6a5442', inner: '#a8a396', pants: '#4a4a48', shoe: '#2a211c', sleeves: 'long', droop: 1 },
  pyjama: { kind: 'pyjama', skin: '#8f8c82', hair: '#2b2220', hairStyle: 'short', top: '#7d8a96', stripe: '#a2adb6', pants: '#7d8a96', shoe: null, sleeves: 'long' },
  blouse: { kind: 'blouse', skin: '#85827a', hair: '#1c1514', hairStyle: 'long', top: '#6a3a3e', pants: '#2b2f36', shoe: '#14171b', sleeves: 'long' },
};
function zres(c, v, o, p = {}) {
  const { bob = 0, sw = [0, 0], lift = [0, 0], hd = 0, tilt = 0, lean = 0, kneel = 0, mouth = false, grab = 0, sway = [0, 0], dropHead = 0 } = p;
  const skin = o.skin, skinD = shd(skin, 0.78), top = o.top, topD = shd(top, 0.78), shoe = o.shoe || skinD;
  const legCol = o.kind === 'gown' ? skin : o.pants;
  const TT = 10 + bob, HT = 4 + bob + (o.droop || 0) + dropHead, legTop = 20 + kneel, hipB = 19 + kneel, foot = 29;
  const back = v === 'N' || v === 'NE';
  const R = (x, y, w, h, col) => c.rect(x, y, w, h, col);
  const legs = () => {
    const draw = (i) => {
      const s = sw[i], l = lift[i], col = i ? shd(legCol, 0.78) : legCol;
      if (v === 'E') {
        const fx = 7 + s * 2, fy = foot - l;
        line2(c, 7, legTop, fx, fy, col); R(fx - 1, fy, 4, 1, shoe);
      } else if (v === 'S' || v === 'N') {
        const f = foot - l - ((v === 'S' ? s < 0 : s > 0) ? 1 : 0), x = i ? 8 : 5;
        R(x, legTop, 3, f - legTop, col); R(x, f, 3, 1, shoe);
      } else {
        const x = (i ? 8 : 5) + (v === 'SE' ? s : -s), f = foot - l;
        line2(c, i ? 8 : 5, legTop, x, f, col); R(x, f, 3, 1, shoe);
      }
    };
    draw(1); draw(0);
    if ((v === 'S' || v === 'N') && o.kind !== 'gown') R(7, legTop, 2, 3, shd(legCol, 0.6));
    if (o.kind === 'office' || o.kind === 'blouse') { if (v === 'S') c.px(6, 26, shd(legCol, 1.4)); } // trouser crease
    if (o.kind === 'hoodie' && v !== 'E') { R(5, foot - 1, 3, 1, '#7d7a70'); R(8, foot - 1, 3, 1, '#7d7a70'); } // jeans cuffs (dirty)
  };
  const shoulder = (side) => (v === 'S' || v === 'N') ? [side ? 11 : 3, TT + 1] : v === 'E' ? [7, TT + 1] : [side ? 10 : 4, TT + 1];
  const handPos = (side) => {
    const [sx] = shoulder(side), sy2 = sway[side];
    if (grab) {
      const g = grab - 1;
      if (v === 'S') return [side ? 10 : 5, TT + 7 + g + sy2 * 0];
      if (v === 'SE') return side ? [13 + g, TT + 6 + g] : [8 + g, TT + 8 + g];
      if (v === 'E') return side ? [13 + g, TT + 5 + g] : [12 + g, TT + 7 + g];
      if (v === 'NE') return side ? [13 + g, TT + g] : [11 + g, TT + 1];
      return [side ? 11 : 4, TT - 1 - g];
    }
    if (v === 'S' || v === 'N') return [sx + (side ? 0 : 0) + (side ? 1 : -1) * 0, TT + 8 + sy2];
    if (v === 'E') return [7 + (side ? 2 : 1) + (sy2 > 0 ? 1 : 0), TT + 8 + (side ? 0 : 0)];
    return [sx + (side ? 0 : 1), TT + 8 + sy2];
  };
  const arm = (side) => {
    const [sx, sy] = shoulder(side), [ex, ey] = handPos(side);
    const far = side === 1 && v === 'E';
    const slv = far ? shd(top, 0.7) : top;
    line2(c, sx, sy, ex, ey, slv);
    if (o.sleeves === 'short') { // bare forearm
      const mx = Math.round(sx + (ex - sx) * 0.45), my = Math.round(sy + (ey - sy) * 0.45) + 1;
      line2(c, mx, my, ex, ey, far ? shd(skin, 0.7) : skin);
    }
    R(ex, ey, 2, 2, far ? shd(skin, 0.75) : skin);
    // dried blood on one hand / forearm
    if (side === 0 && v !== 'N' && v !== 'NE') { c.px(ex, ey + 1, ZBL); if (grab) c.px(ex + 1, ey, ZBD); }
    if (side === 1 && o.bite && !back) c.px(Math.round((sx + ex) / 2), Math.round((sy + ey) / 2) + 1, ZBL);
  };
  // far arm / arms behind the body
  if (v === 'E') arm(1);
  if (back) { arm(0); arm(1); }
  legs();
  // torso
  const tx = 5 + (v === 'E' ? 0 : 0) + (v === 'E' ? lean : 0), tw = v === 'E' ? 5 : 6;
  R(tx, TT, tw, hipB - TT + 1, top);
  if (o.kind !== 'gown') R(tx, hipB, tw, 1, legCol);
  if (o.kind === 'gown') {
    R(tx, TT + 9, tw, 4, top); R(tx - 1, TT + 11, tw + 2, 5, top);
    for (let x = tx - 1; x < tx + tw + 1; x += 3) c.clear(x, 26, 1, 1); // torn hem
    R(tx - 1, TT + 14, tw + 2, 1, topD);
  }
  // front shading and details
  if (v === 'S') {
    R(7, TT + 1, 2, hipB - TT - 1, shd(top, 0.86));
    if (o.kind === 'office') { R(5, TT, 2, 2, '#b8b4a8'); R(9, TT, 2, 2, '#b8b4a8'); R(7, TT, 2, 1, skinD); c.px(7, TT + 1, o.tie); R(7, TT + 2, 2, 5, o.tie); c.px(8, TT + 7, o.tie); c.px(10, TT + 8, shd(top, 0.65)); }
    if (o.kind === 'hoodie') { R(4, TT, 8, 1, topD); R(6, TT + 6, 4, 3, topD); c.px(6, TT + 1, '#a8a69b'); c.px(9, TT + 1, '#a8a69b'); c.px(6, TT + 2, '#a8a69b'); c.px(9, TT + 2, '#a8a69b'); }
    if (o.kind === 'scrubs') { R(6, TT, 4, 2, skinD); c.px(7, TT + 2, skinD); c.px(8, TT + 2, skinD); R(5, TT + 4, 2, 2, topD); c.px(9, TT + 4, o.badge); c.px(9, TT + 5, o.badge); }
    if (o.kind === 'cardigan') { R(7, TT, 2, hipB - TT, o.inner); c.px(7, TT + 3, '#4a3828'); c.px(7, TT + 6, '#4a3828'); R(5, TT + 7, 2, 2, topD); R(9, TT + 7, 2, 2, topD); }
    if (o.kind === 'pyjama') { for (let y = TT + 1; y < hipB; y += 3) R(5, y, 6, 1, o.stripe); R(7, TT, 2, 1, skinD); }
    if (o.kind === 'gown') { R(6, TT, 4, 1, skinD); R(7, TT + 1, 2, 12, shd(top, 0.9)); }
    if (o.kind === 'blouse') { R(6, TT, 4, 1, skinD); R(7, TT + 1, 2, 1, skinD); c.px(7, TT + 4, '#a8a69b'); c.px(7, TT + 7, '#a8a69b'); }
  } else if (v === 'SE') {
    R(9, TT + 1, 1, hipB - TT - 1, shd(top, 0.82));
    if (o.kind === 'office') { R(5, TT, 4, 1, '#b8b4a8'); R(7, TT + 1, 2, 5, o.tie); }
    if (o.kind === 'hoodie') { R(5, TT, 6, 1, topD); R(6, TT + 6, 3, 3, topD); c.px(7, TT + 1, '#a8a69b'); c.px(7, TT + 2, '#a8a69b'); }
    if (o.kind === 'scrubs') { R(7, TT, 3, 1, skinD); c.px(6, TT + 4, topD); c.px(8, TT + 4, o.badge); }
    if (o.kind === 'cardigan') { R(8, TT, 1, hipB - TT, o.inner); c.px(8, TT + 3, '#4a3828'); c.px(8, TT + 6, '#4a3828'); }
    if (o.kind === 'pyjama') { for (let y = TT + 1; y < hipB; y += 3) R(5, y, 6, 1, o.stripe); }
    if (o.kind === 'gown') R(8, TT + 1, 1, 13, shd(top, 0.9));
    if (o.kind === 'blouse') { R(6, TT, 3, 1, skinD); }
  } else if (v === 'E') {
    R(tx, TT + 4, 5, 1, shd(top, 0.82));
    if (o.kind === 'office') { R(tx + 3, TT, 2, 1, '#b8b4a8'); R(tx + 4, TT + 1, 1, 5, o.tie); }
    if (o.kind === 'hoodie') { R(tx, TT, 5, 1, topD); R(tx + 3, TT + 6, 2, 3, topD); }
    if (o.kind === 'scrubs') { c.px(tx + 4, TT, skinD); c.px(tx + 3, TT + 4, o.badge); }
    if (o.kind === 'cardigan') { R(tx + 4, TT, 1, hipB - TT, o.inner); c.px(tx + 4, TT + 5, '#4a3828'); }
    if (o.kind === 'pyjama') { for (let y = TT + 1; y < hipB; y += 3) R(tx, y, 5, 1, o.stripe); }
    if (o.kind === 'blouse') c.px(tx + 4, TT, skinD);
  } else if (v === 'NE') {
    R(7, TT + 1, 1, hipB - TT - 1, shd(top, 0.8));
    if (o.kind === 'hoodie') { R(5, TT, 6, 3, topD); R(6, TT + 3, 4, 1, shd(top, 0.9)); }
    if (o.kind === 'pyjama') { for (let y = TT + 1; y < hipB; y += 3) R(5, y, 6, 1, o.stripe); }
    if (o.kind === 'scrubs') { R(5, TT + hipB - TT - 1, 6, 1, topD); }
    if (o.kind === 'cardigan') { R(7, TT, 1, hipB - TT, topD); }
  } else { // N
    R(7, TT + 1, 1, hipB - TT - 1, shd(top, 0.8));
    if (o.kind === 'hoodie') { R(5, TT, 6, 3, topD); R(6, TT + 3, 4, 1, shd(top, 0.9)); }
    if (o.kind === 'pyjama') { for (let y = TT + 1; y < hipB; y += 3) R(5, y, 6, 1, o.stripe); }
    if (o.kind === 'scrubs') { R(6, TT + 5, 4, 1, topD); }
    if (o.kind === 'cardigan') { R(7, TT, 1, hipB - TT, topD); R(5, TT, 6, 1, o.inner); }
  }
  // dried dark blood and stains on the clothes (kept small and dark)
  const st = o.stains || [];
  for (const [u, vv, col, w = 1, h = 1, bk = 0] of st) {
    if (back && !bk) continue;
    const x = tx + Math.min(tw - 1, Math.floor(u * tw)), y = TT + vv;
    R(x, y, Math.min(w, tx + tw - x), h, col);
  }
  // ragged hem tear
  if (o.kind !== 'gown') { c.px(tx + 1, hipB - 1, topD); c.px(tx + tw - 2, hipB, shd(legCol, 0.7)); }
  // ---------------- head ----------------
  const hx = 5 + hd + (v === 'E' ? lean : 0), tl = tilt;
  const hair = o.hair, hs = o.hairStyle;
  // neck shadow
  const faceSkin = v === 'N' || v === 'NE' ? skinD : skin;
  R(hx + tl, HT, 6, 3, skin); R(hx, HT + 3, 6, 3, skin);
  if (v === 'S') {
    if (hs !== 'thin') R(hx + tl, HT, 6, 2, hair);
    if (hs === 'short' || hs === 'bun') { c.px(hx + tl, HT + 2, hair); c.px(hx + tl + 5, HT + 2, hair); }
    if (hs === 'bun') R(hx + tl + 2, HT - 1, 2, 1, hair);
    if (hs === 'long') { R(hx + tl, HT + 2, 1, 1, hair); R(hx + tl + 5, HT + 2, 1, 1, hair); R(hx, HT + 3, 1, 4, hair); R(hx + 5, HT + 3, 1, 4, hair); R(hx + tl + 1, HT - 1, 4, 1, hair); }
    if (hs === 'thin') { R(hx + tl, HT, 1, 3, hair); R(hx + tl + 5, HT, 1, 3, hair); R(hx + tl + 1, HT, 4, 1, shd(hair, 0.9)); c.px(hx + tl + 2, HT + 1, mixc(skin, hair, 0.35)); }
    c.px(hx + 1, HT + 3, '#14110f'); c.px(hx + 4, HT + 3, '#14110f');
    c.px(hx + 1, HT + 4, shd(skin, 0.68)); c.px(hx + 4, HT + 4, shd(skin, 0.68)); // sunken eyes
    if (mouth) R(hx + 2, HT + 4, 2, 2, ZMOUTH); else R(hx + 2, HT + 5, 2, 1, shd(skin, 0.6));
    if (o.headWound) c.px(hx + tl + o.headWound[0], HT + o.headWound[1], ZBL);
  } else if (v === 'N') {
    R(hx + tl, HT, 6, 3, hair); R(hx, HT + 3, 6, 2, hair);
    if (hs === 'thin') { R(hx + tl + 2, HT, 2, 2, mixc(skin, hair, 0.45)); }
    if (hs === 'bun') { R(hx + tl + 2, HT - 1, 2, 1, hair); R(hx + 2, HT + 3, 2, 2, shd(hair, 1.25)); }
    if (hs === 'long') { R(hx, HT + 5, 6, 2, hair); }
    else R(hx + 1, HT + 5, 4, 1, skinD);
    if (o.headWound) c.px(hx + 4, HT + 2, ZBL);
  } else if (v === 'E') {
    const t = tl;
    R(hx + t, HT, 3, 5, hair); R(hx + t + 3, HT, 3, 2, hair);
    if (hs === 'thin') { R(hx + t + 3, HT, 3, 1, mixc(skin, hair, 0.4)); R(hx + t + 3, HT + 1, 3, 1, skin); }
    if (hs === 'bun') { R(hx - 1, HT + 1, 2, 3, hair); }
    if (hs === 'long') { R(hx, HT + 5, 3, 3, hair); }
    c.px(hx + 4, HT + 3, '#14110f'); c.px(hx + 4, HT + 4, shd(skin, 0.68)); c.px(hx + 6, HT + 4, skin);
    if (mouth) R(hx + 4, HT + 4, 2, 2, ZMOUTH); else c.px(hx + 4, HT + 5, shd(skin, 0.6));
    if (o.headWound) c.px(hx + 5, HT + 2, ZBL);
  } else if (v === 'SE') {
    R(hx + tl, HT, 6, 2, hair); R(hx + tl, HT + 2, 2, 3, hair);
    if (hs === 'thin') { R(hx + tl + 2, HT, 4, 1, mixc(skin, hair, 0.4)); R(hx + tl, HT + 2, 1, 2, hair); c.px(hx + tl + 1, HT + 4, skin); R(hx + tl + 1, HT + 2, 1, 1, skin); }
    if (hs === 'bun') { R(hx + tl, HT + 2, 1, 3, hair); R(hx + tl + 1, HT - 1, 3, 1, hair); }
    if (hs === 'long') { R(hx, HT + 2, 2, 5, hair); R(hx + 1, HT - 1, 4, 1, hair); }
    c.px(hx + 3, HT + 3, '#14110f'); c.px(hx + 5, HT + 3, '#14110f');
    c.px(hx + 3, HT + 4, shd(skin, 0.68)); c.px(hx + 5, HT + 4, shd(skin, 0.68));
    if (mouth) R(hx + 3, HT + 4, 2, 2, ZMOUTH); else R(hx + 3, HT + 5, 2, 1, shd(skin, 0.6));
    if (o.headWound) c.px(hx + 5, HT + 1, ZBL);
  } else { // NE
    R(hx + tl, HT, 6, 3, hair); R(hx, HT + 3, 5, 2, hair);
    if (hs === 'thin') R(hx + tl + 2, HT, 3, 1, mixc(skin, hair, 0.45));
    if (hs === 'bun') { R(hx + tl + 2, HT - 1, 2, 1, hair); }
    if (hs === 'long') { R(hx, HT + 5, 5, 2, hair); }
    c.px(hx + 5, HT + 3, skin); c.px(hx + 5, HT + 4, skin);
    if (hs !== 'long') R(hx + 1, HT + 5, 4, 1, skinD);
    if (o.headWound) c.px(hx + 3, HT + 2, ZBL);
  }
  // bite / wound at the neck and shoulder (dark blood, small)
  if (!back && o.neckWound) { c.px(hx + o.neckWound[0], HT + 5, ZBL); if (v === 'S') c.px(hx + o.neckWound[0] + 1, TT, ZBD); }
  // near / front arms
  if (v === 'E') arm(0); else if (!back) { arm(0); arm(1); }
}
// collapsed body on the floor (death frame 3): reuses isoLying with the outfit colours
const lyingPal = (o) => ({ skin: o.skin, hair: o.hair, hairStyle: o.hairStyle === 'thin' ? 'short' : o.hairStyle, shirt: o.top, pants: o.pants, shoe: o.shoe || shd(o.skin, 0.78), decay: false });
function zombieDraw(o) {
  return (c, v, name, i) => {
    const lim = v === 'E' || v === 'SE';
    if (name === 'shuffle') {
      // limp: the right leg is the weak one, dragged and shorter; weight dips onto it, shoulders and head sag
      const f = [
        { bob: 0, sw: [1, -1], lift: [0, 0], hd: lim ? 1 : 0, tilt: -1, sway: [1, -1] },
        { bob: 1, sw: [0, 0], lift: [0, 0], hd: 0, tilt: -1, sway: [0, 0] },
        { bob: 0, sw: [-1, 1], lift: [1, 0], hd: lim ? 1 : 0, tilt: 0, sway: [-1, 1], lean: v === 'E' ? 1 : 0 },
        { bob: 0, sw: [0, 0], lift: [0, 1], hd: 0, tilt: -1, sway: [0, 1] },
      ][i];
      return zres(c, v, o, f);
    }
    if (name === 'attack') return i === 0
      ? zres(c, v, o, { bob: 0, grab: 1, hd: lim ? 1 : 0, tilt: -1, sw: [1, 0] })
      : zres(c, v, o, { bob: 1, grab: 2, hd: lim ? 2 : 0, tilt: 0, mouth: true, sw: [-1, 1], lean: v === 'E' ? 1 : 0, dropHead: 1 });
    if (i === 0) return zres(c, v, o, { bob: 2, hd: lim ? -1 : 0, tilt: 1, sway: [1, 1], lean: v === 'E' ? -1 : 0, mouth: true, sw: [0, 1] });
    if (i === 1) return zres(c, v, o, { bob: 5, kneel: 3, dropHead: 1, tilt: 1, sway: [1, 0], sw: [0, 0] });
    isoLying(c, v, lyingPal(o), true);
  };
}
// crawler: a person dragging themselves forward on their arms, hips and legs limp behind. ~13 px high.
// views are hand-laid; ph alternates the reaching arm, lunge 1 = rear back, 2 = lunge, oy sags down.
function zcrawl(c, v, o, p) {
  const { ph = 0, lunge = 0, oy = 0, bob = 0 } = p;
  const skin = o.skin, skinD = shd(skin, 0.78), top = o.top, topD = shd(top, 0.8), pants = o.pants, shoe = o.shoe || skinD, hair = o.hair;
  const R = (x, y, w, h, col) => c.rect(x, y + oy + bob, w, h, col);
  const P = (x, y, col) => c.px(x, y + oy + bob, col);
  const rs = ph % 2, lu = lunge === 2 ? 2 : 0, lb = lunge === 1 ? 1 : 0, open = lunge === 2;
  const hand = (x, y, col = skin) => R(x, y, 2, 2, col);
  const stripe = (x, y, w, h) => { if (o.kind === 'pyjama') for (let j = 0; j < h; j += 3) R(x, y + j, w, 1, o.stripe); };
  if (v === 'E') {
    R(0, 25, 5, 2, shd(pants, 0.8)); R(0, 24, 1, 3, shoe); R(1, 22, 4, 2, pants); P(1, 22, shoe); P(0, 23, shoe); // limp legs, one bent
    R(4, 21, 7, 6, top); R(4, 21, 7, 1, shd(top, 1.15)); stripe(4, 22, 7, 5); P(6, 24, ZBL); P(9, 25, ZBD); P(5, 26, topD);
    R(10 + lu - lb, 16 + lb * 2, 5, 6, skin); R(10 + lu - lb, 16 + lb * 2, 3, 3, hair); R(10 + lu - lb, 19 + lb * 2, 1, 2, hair);
    if (o.hairStyle === 'long') R(9 + lu - lb, 19 + lb * 2, 2, 4, hair);
    P(13 + lu - lb, 19 + lb * 2, '#14110f'); P(13 + lu - lb, 20 + lb * 2, shd(skin, 0.68)); if (open) R(13 + lu, 21 + lb * 2, 2, 1, ZMOUTH); else P(14 + lu - lb, 21 + lb * 2, shd(skin, 0.6));
    line2(c, 9, 22 + oy + bob, 12 + rs + lu - lb, 26 + oy + bob, shd(top, 0.7)); hand(12 + rs + lu - lb, 26, shd(skin, 0.75));
    line2(c, 8, 22 + oy + bob, 11 + (1 - rs) + lu, 26 + oy + bob, top); hand(11 + (1 - rs) + lu, 26); P(11 + (1 - rs) + lu, 27, ZBL);
  } else if (v === 'S') {
    R(4, 8, 3, 5, shd(pants, 0.8)); R(9, 9, 3, 4, pants); R(4, 8, 3, 1, shoe); R(9, 9, 3, 1, shoe); // legs trailing up the screen
    R(4, 13, 8, 2, pants); R(3, 15, 10, 6, top); R(4, 15, 8, 1, shd(top, 1.15)); stripe(3, 16, 10, 5); P(6, 18, ZBL); P(10, 19, ZBD);
    line2(c, 3, 17 + oy + bob, 2 - 0, 22 + rs + lu + oy + bob, top); hand(1, 23 + rs + lu); P(1, 24 + rs + lu, ZBL);
    line2(c, 12, 17 + oy + bob, 13, 22 + (1 - rs) + lu + oy + bob, top); hand(13, 23 + (1 - rs) + lu);
    R(5, 19 + lu, 6, 6, skin); R(5, 19 + lu, 6, 2, hair); if (o.hairStyle === 'long') { R(4, 20 + lu, 1, 5, hair); R(11, 20 + lu, 1, 5, hair); }
    P(6, 22 + lu, '#14110f'); P(9, 22 + lu, '#14110f'); P(6, 23 + lu, shd(skin, 0.68)); P(9, 23 + lu, shd(skin, 0.68));
    if (open) R(7, 24 + lu, 2, 2, ZMOUTH); else R(7, 24 + lu, 2, 1, shd(skin, 0.6));
  } else if (v === 'N') {
    R(1, 13 - lb + rs, 3, 3, top); R(1, 12 - lb + rs, 3, 2, skin); R(12, 13 - lb + (1 - rs), 3, 3, top); R(12, 12 - lb + (1 - rs), 3, 2, skin);
    R(5, 12 + lb, 6, 5, hair); R(5, 16 + lb, 6, 1, skinD); if (o.hairStyle === 'long') R(5, 16 + lb, 6, 3, hair);
    R(3, 17, 10, 6, top); R(4, 17, 8, 1, shd(top, 1.15)); R(7, 18, 1, 4, topD); stripe(3, 18, 10, 5); P(10, 20, ZBD);
    R(4, 23, 3, 4, shd(pants, 0.8)); R(9, 23, 3, 4, pants); R(4, 27, 3, 1, shoe); R(9, 27, 3, 1, shoe); R(4, 23, 8, 1, shd(pants, 1.2));
  } else if (v === 'SE') {
    R(1, 17, 4, 3, shd(pants, 0.8)); R(0, 18, 2, 2, shoe); R(2, 20, 4, 3, pants); R(1, 22, 2, 1, shoe);
    R(3, 19, 8, 6, top); R(4, 19, 6, 1, shd(top, 1.15)); stripe(3, 20, 8, 5); P(6, 22, ZBL); P(9, 23, ZBD);
    line2(c, 8, 21 + oy + bob, 11 + rs + lu, 24 + oy + bob, shd(top, 0.7)); hand(11 + rs + lu, 24, shd(skin, 0.75));
    R(9 + lu, 20 + lu, 5, 6, skin); R(9 + lu, 20 + lu, 5, 2, hair); if (o.hairStyle === 'long') R(9 + lu, 22 + lu, 1, 4, hair);
    P(11 + lu, 23 + lu, '#14110f'); P(13 + lu, 23 + lu, '#14110f'); P(11 + lu, 24 + lu, shd(skin, 0.68)); P(13 + lu, 24 + lu, shd(skin, 0.68));
    if (open) R(11 + lu, 25 + lu, 2, 1, ZMOUTH);
    line2(c, 7, 22 + oy + bob, 10 + (1 - rs) + lu, 26 + oy + bob, top); hand(10 + (1 - rs) + lu, 26 + lu); P(11 + (1 - rs) + lu, 27 + lu, ZBL);
  } else { // NE
    R(1, 24, 4, 3, shd(pants, 0.8)); R(0, 26, 2, 2, shoe); R(3, 23, 4, 3, pants); R(1, 27, 2, 1, shoe);
    R(3, 19, 8, 6, top); R(4, 19, 6, 1, shd(top, 1.15)); R(7, 20, 1, 4, topD); stripe(3, 20, 8, 5); P(9, 22, ZBD);
    line2(c, 8, 19 + oy + bob, 12 + rs, 17 - lb + oy + bob, top); hand(12 + rs, 16 - lb);
    R(8, 14 + lb, 5, 5, hair); R(8, 18 + lb, 5, 1, skinD); P(13, 17 + lb, skin); if (o.hairStyle === 'long') R(8, 18 + lb, 4, 3, hair);
    line2(c, 6, 21 + oy + bob, 9 + (1 - rs), 25 + oy + bob, shd(top, 0.8)); hand(9 + (1 - rs), 25);
  }
}
function crawlDraw(o) {
  return (c, v, name, i) => {
    if (name === 'shuffle') return zcrawl(c, v, o, { ph: i, bob: i % 2 });
    if (name === 'attack') return zcrawl(c, v, o, { ph: 1, lunge: i === 0 ? 1 : 2 });
    if (i === 0) return zcrawl(c, v, o, { ph: 0, oy: 1 });
    if (i === 1) return zcrawl(c, v, o, { ph: 1, oy: 3 });
    isoLying(c, v, lyingPal(o), true);
  };
}
const ZANIMS = [['shuffle', 4, 5, -1], ['attack', 2, 6, 0], ['death', 3, 6, 0]];
const ZNOTE = ' Zombies are ordinary residents who died: human proportions (same height as the hero), pale grey skin, dark dried blood only, slack posture (head tilted, arms low, limp gait). ';
const ZW = [
  ['iso_walker', { ...ZOUT.office, stains: [[0.1, 3, ZBL, 2, 3], [0.5, 4, ZBD], [0.2, 7, ZBD, 2, 1], [0.8, 6, ZBL, 1, 2, 1]], headWound: [4, 1], neckWound: [4], bite: true }, 'office worker: dirty grey shirt, loosened dark tie, charcoal trousers, short dark hair, dried blood on the collar and chest.'],
  ['iso_walker_b', { ...ZOUT.gown, stains: [[0.3, 6, ZBL, 2, 3], [0.6, 11, ZBD, 2, 2], [0.1, 13, ZBL, 1, 2]], neckWound: [1], bite: true }, 'woman in a pale blue nightgown, long dark hair, bare feet, torn hem and dried blood at the side.'],
  ['iso_walker_c', { ...ZOUT.hoodie, stains: [[0.7, 3, ZBL, 2, 2], [0.3, 8, ZBD, 1, 2, 1], [0.5, 9, ZBD]], headWound: [1, 1] }, 'young man in a dark slate hoodie and faded jeans, dirty sneakers, short black hair, darker skin tone, dried blood on the hood.'],
  ['iso_walker_d', { ...ZOUT.scrubs, stains: [[0.1, 5, ZBL, 2, 3], [0.7, 8, ZBD, 2, 1], [0.4, 9, ZBL]], neckWound: [2], bite: true }, 'care worker in muted teal scrubs with an ID badge, brown hair in a bun, pale shoes, blood on the front.'],
  ['iso_walker_e', { ...ZOUT.elder, stains: [[0.6, 4, ZBL, 2, 2], [0.2, 8, ZBD, 2, 1], [0.8, 3, ZBD, 1, 1, 1]], headWound: [1, 2] }, 'elderly resident in a brown cardigan over a cream shirt, grey trousers, thin white hair, slightly stooped.'],
];
for (const [key, o, desc] of ZW) {
  isoChars(key, ZANIMS, zombieDraw(o), NOTE_CH + 'Walker zombie, ' + desc + ZNOTE + 'Anim "shuffle" (4 frames, 5 fps, limping gait) is the move/idle loop; "attack" 2 frames (lean in grabbing with both hands, lunge); "death" 3 (collapse, kneel, lying). Identical layout to every iso_walker* sheet; pick any variant per zombie.');
}
const ZC = [
  ['iso_crawler', { ...ZOUT.pyjama, stains: [[0.3, 2, ZBL, 2, 2], [0.7, 4, ZBD]] }, 'man in grey-blue striped pyjamas, short dark hair.'],
  ['iso_crawler_b', { ...ZOUT.blouse, stains: [[0.2, 3, ZBL, 2, 2], [0.8, 5, ZBD]] }, 'woman in a dark burgundy blouse and charcoal trousers, long dark hair.'],
];
for (const [key, o, desc] of ZC) {
  isoChars(key, ZANIMS, crawlDraw(o), NOTE_CH + 'Crawler zombie, ' + desc + ' A person dragging themselves forward on their arms with limp legs trailing, about 12 px high.' + ZNOTE + '"shuffle" 4 frames (5 fps) is the crawl loop; "attack" 2 (rear back, lunge); "death" 3 (sag, flatten, lying).');
}
files.iso_walker.variants = ['iso_walker_b', 'iso_walker_c', 'iso_walker_d', 'iso_walker_e'];
files.iso_crawler.variants = ['iso_crawler_b'];

// ---------- action_icons 24x24 (GDD 4 context buttons, GDD 8 muted icon HUD) ----------
// Flat #bdb8ab on transparent, no outline; alpha / tint set in game. Pure geometry, no rng.
const AX = [189, 184, 171, 255];
const aset = (c, x, y, on) => { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= c.w || y >= c.h) return; if (on) c.d.set(AX, (y * c.w + x) * 4); else c.d.fill(0, (y * c.w + x) * 4, (y * c.w + x) * 4 + 4); };
const aR = (c, x, y, w, h, on = true) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) aset(c, x + i, y + j, on); };
const aHollow = (c, x, y, w, h, t = 2) => { aR(c, x, y, w, h); aR(c, x + t, y + t, w - 2 * t, h - 2 * t, false); };
const aDisc = (c, cx, cy, r, on = true) => { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) aset(c, x, y, on); };
const aRing = (c, cx, cy, r, t) => { for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (d <= r && d > r - t) aset(c, x, y, true); } };
// bar: thick segment, width w0 at (x0,y0) tapering to w1 at (x1,y1)
const aBar = (c, x0, y0, x1, y1, w0, w1 = w0, on = true) => {
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy;
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
    const px = x + 0.5, py = y + 0.5;
    const t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2));
    if (Math.hypot(px - x0 - dx * t, py - y0 - dy * t) <= (w0 + (w1 - w0) * t) / 2) aset(c, x, y, on);
  }
};
const aTri = (c, ax, ay, bx, by, cx2, cy2) => { const s = (px, py, x1, y1, x2, y2) => (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) { const px = x + 0.5, py = y + 0.5, d1 = s(px, py, ax, ay, bx, by), d2 = s(px, py, bx, by, cx2, cy2), d3 = s(px, py, cx2, cy2, ax, ay);
    if (!((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0))) aset(c, x, y, true); } };
const aArrow = (c, x0, y0, x1, y1) => { // shaft + head at (x1,y1)
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l, nx = -uy, ny = ux;
  aBar(c, x0, y0, x1 - ux * 4, y1 - uy * 4, 2.4);
  aTri(c, x1, y1, x1 - ux * 5 + nx * 3.5, y1 - uy * 5 + ny * 3.5, x1 - ux * 5 - nx * 3.5, y1 - uy * 5 - ny * 3.5);
};
const aDoorFrame = (c) => aHollow(c, 4, 2, 13, 20);
const aEye = (c, cx, cy, hw) => { for (let x = -hw; x <= hw; x++) { const t = x / hw, y = Math.round(cy + (hw * 0.45) * Math.sqrt(1 - t * t)); aR(c, cx + x, y - 1, 1, 2); } [-0.7, 0, 0.7].forEach((k) => aBar(c, cx + k * hw, cy + hw * 0.45 * Math.sqrt(1 - k * k) + 1, cx + k * hw * 1.2, cy + hw * 0.45 * Math.sqrt(1 - k * k) + 3.5, 1.4)); };
const aHandIcon = (c) => { aR(c, 8, 1, 2, 6); aR(c, 11, 0, 2, 7); aR(c, 14, 1, 2, 6); aR(c, 7, 6, 10, 4); aR(c, 5, 5, 2, 3); };
const aDrawer = (c, dotted) => { if (!dotted) aHollow(c, 2, 12, 20, 10); else { for (let x = 2; x < 22; x++) if (x % 3 !== 2) { aR(c, x, 12, 1, 2); aR(c, x, 20, 1, 2); } for (let y = 12; y < 22; y++) if (y % 3 !== 2) { aR(c, 2, y, 2, 1); aR(c, 20, y, 2, 1); } } aR(c, 9, 16, 6, 2); };
const aBox = (c, y0 = 10) => { aHollow(c, 3, y0, 18, 22 - y0 + 1); aR(c, 3, y0 + 3, 18, 2); };

const ACT = [
  ['open_door', (c) => { aDoorFrame(c); aTri(c, 6, 4, 6, 20, 14, 21); aTri(c, 6, 4, 14, 3, 14, 21); aR(c, 6, 4, 2, 16, false); aR(c, 6, 4, 2, 16); aR(c, 11, 12, 2, 2, false); aArrow(c, 15, 12, 23, 12); }],
  ['close_door', (c) => { aDoorFrame(c); aR(c, 6, 4, 9, 16); aR(c, 11, 11, 2, 2, false); aArrow(c, 23, 12, 18, 12); }],
  ['force_door', (c) => { aDoorFrame(c); aR(c, 6, 4, 9, 16, false); aR(c, 6, 4, 4, 16); aBar(c, 4, 22, 20, 5, 2.6); aBar(c, 20, 5, 23, 8, 2.6); aBar(c, 4, 22, 2, 19, 2.6); aBar(c, 16, 4, 19, 1, 1.4); aBar(c, 20, 8, 23, 5, 1.4); }],
  ['search', (c) => { aDrawer(c, false); aHandIcon(c); aR(c, 9, 7, 6, 8, false); aR(c, 9, 7, 6, 3); aR(c, 8, 4, 2, 7); aR(c, 11, 3, 2, 7); aR(c, 14, 4, 2, 7); aR(c, 9, 9, 6, 4); aR(c, 4, 17, 0, 0); }],
  ['dismantle', (c) => { aBar(c, 4, 20, 17, 7, 3); aR(c, 13, 2, 8, 5); aBar(c, 15, 4, 21, 10, 2.5); aBar(c, 20, 20, 8, 8, 3); aBar(c, 8, 8, 4, 4, 1.6); aDisc(c, 20, 20, 2.4); }],
  ['drain', (c) => { aR(c, 2, 2, 14, 4); aR(c, 2, 2, 4, 10); aR(c, 14, 5, 3, 0); aR(c, 17, 1, 3, 6); aR(c, 3, 13, 2, 2); aTri(c, 13, 12, 9, 18, 17, 18); aDisc(c, 13, 18.5, 4.2); aR(c, 11, 17, 1, 2, false); }],
  ['drink', (c) => { aBar(c, 5, 3, 8, 20, 2.2); aBar(c, 19, 3, 16, 20, 2.2); aR(c, 7, 20, 10, 2); for (let y = 11; y < 20; y++) { const k = Math.round((y - 3) * 3 / 17); aR(c, 5 + k, y, 14 - 2 * k, 1); } [[9, 14], [14, 16], [11, 18]].forEach(([x, y]) => aR(c, x, y, 2, 1, false)); }],
  ['eat', (c) => { aR(c, 4, 2, 2, 8); aR(c, 8, 2, 2, 8); aR(c, 12, 2, 2, 8); aR(c, 4, 8, 10, 3); aR(c, 7, 11, 4, 3); aBar(c, 9, 12, 9, 22, 2.6); aDisc(c, 19, 7, 3.8); aR(c, 17, 5, 1, 1, false); aBar(c, 19, 10, 19, 22, 2.4); }],
  ['bandage', (c) => { aBar(c, 3, 21, 21, 3, 8); aBar(c, 12, 12, 12, 12, 1, 1); aR(c, 9, 9, 6, 6, false); aR(c, 10, 10, 4, 4); aR(c, 11, 11, 2, 2, false); [[5, 17], [7, 19], [17, 5], [19, 7]].forEach(([x, y]) => aR(c, x, y, 1, 1, false)); aR(c, 11, 11, 2, 2, false); }],
  ['talk', (c) => { aDisc(c, 6, 13, 3.4); aR(c, 2, 18, 9, 5); aDisc(c, 18, 13, 3.4); aR(c, 13, 18, 9, 5); aBar(c, 9, 6, 15, 6, 2); aBar(c, 10, 2, 14, 2, 2); aBar(c, 9, 10, 9, 10, 1, 1); }],
  ['sleep', (c) => { aR(c, 1, 15, 22, 7); aR(c, 1, 15, 2, 1, false); aR(c, 21, 15, 2, 1, false); aEye(c, 12, 5, 8); aR(c, 5, 18, 14, 1, false); }],
  ['nap', (c) => { aR(c, 1, 17, 14, 5); aEye(c, 8, 8, 6); aRing(c, 18, 6, 5, 2); aR(c, 17, 3, 2, 4); aR(c, 17, 6, 3, 2); }],
  ['craft', (c) => { aR(c, 2, 13, 20, 3); aR(c, 4, 16, 3, 7); aR(c, 17, 16, 3, 7); aR(c, 7, 19, 10, 2); aR(c, 6, 2, 9, 5); aR(c, 15, 3, 3, 3); aR(c, 9, 7, 3, 6); }],
  ['store', (c) => { aBox(c, 12); aArrow(c, 12, 0, 12, 10); }],
  ['take', (c) => { aBox(c, 12); aArrow(c, 12, 11, 12, 1); aR(c, 11, 11, 2, 3, false); aR(c, 11, 12, 2, 3); }],
  ['place', (c) => { aR(c, 1, 20, 22, 2); aHollow(c, 6, 8, 12, 9, 3); aArrow(c, 12, 0, 12, 7); aR(c, 11, 8, 2, 1, true); }],
  ['cancel', (c) => { aBar(c, 4, 4, 20, 20, 3.4); aBar(c, 20, 4, 4, 20, 3.4); }],
  ['leave', (c) => { aHollow(c, 2, 2, 11, 20); aR(c, 4, 4, 7, 16, false); aR(c, 4, 4, 3, 16); aArrow(c, 9, 12, 23, 12); }],
  ['shove', (c) => { aR(c, 6, 7, 8, 11); aR(c, 14, 7, 6, 2); aR(c, 14, 10, 8, 2); aR(c, 14, 13, 7, 2); aR(c, 14, 16, 5, 2); aR(c, 5, 3, 7, 3); aR(c, 6, 5, 2, 3); aR(c, 8, 18, 5, 4); aR(c, 0, 8, 3, 1); aR(c, 0, 12, 4, 1); aR(c, 0, 16, 3, 1); }],
  ['attack_fists', (c) => { aR(c, 4, 6, 15, 11); aR(c, 7, 3, 4, 3); aR(c, 11, 3, 4, 3); aR(c, 15, 4, 3, 2); [8, 12, 16].forEach((x) => aR(c, x, 12, 1, 5, false)); aR(c, 6, 17, 10, 5); aR(c, 5, 14, 5, 2, false); aR(c, 19, 8, 3, 2); aR(c, 19, 12, 3, 2); }],
  ['attack_knife', (c) => { aBar(c, 21, 3, 10, 14, 1, 6); aBar(c, 8, 10, 14, 16, 2.6); aBar(c, 11, 13, 4, 20, 4); aDisc(c, 4, 20, 2.2); }],
  ['attack_bat', (c) => { aBar(c, 20, 4, 5, 19, 6.4, 2.2); aDisc(c, 4.5, 19.5, 2.2); aBar(c, 6, 17, 4, 15, 0.01, 0.01, false); aR(c, 19, 2, 0, 0); }],
  ['attack_crowbar', (c) => { aBar(c, 5, 20, 17, 7, 2.8); aBar(c, 17, 7, 21, 6, 2.8); aBar(c, 21, 6, 22, 10, 2.8); aBar(c, 5, 20, 2, 17, 2.8); aBar(c, 2, 17, 2, 14, 2.8); }],
  ['attack_pipe', (c) => { aBar(c, 5, 19, 19, 5, 4.4); aBar(c, 15.5, 3.5, 20.5, 8.5, 2.6); aBar(c, 3.5, 15.5, 8.5, 20.5, 2.6); aBar(c, 12, 12, 12.5, 11.5, 1, 1, false); }],
  ['throw_molotov', (c) => { aR(c, 8, 12, 9, 10); aR(c, 9, 11, 7, 1); aR(c, 10, 7, 5, 5); aR(c, 11, 5, 3, 2); aR(c, 9, 15, 7, 1, false); aTri(c, 12.5, 0, 9, 5, 16, 5); aDisc(c, 12.5, 3, 3); aR(c, 12, 2, 1, 2, false); aBar(c, 3, 4, 6, 3, 1.4); aBar(c, 3, 9, 7, 8, 1.4); aBar(c, 18, 3, 22, 4, 1.4); }],
  ['collect', (c) => { aR(c, 3, 0, 1, 3); aR(c, 11, 0, 1, 3); aR(c, 19, 0, 1, 3); for (let y = 5; y <= 11; y++) aR(c, 4 + (y - 5) * 0.5 | 0, y, 16 - (y - 5), 1); aR(c, 10, 11, 4, 4); aHollow(c, 5, 15, 14, 8); aR(c, 6, 20, 12, 2); aR(c, 11, 15, 2, 2, false); aR(c, 11, 15, 2, 1); }],
  ['climb_stairs', (c) => { [[2, 18], [7, 14], [12, 10], [17, 6]].forEach(([x, y]) => aR(c, x, y, 5, 22 - y + 1)); aArrow(c, 4, 11, 4, 1); }],
  ['barricade', (c) => { aHollow(c, 4, 1, 16, 22); aBar(c, 1, 8, 23, 6, 3.4); aBar(c, 1, 17, 23, 19, 3.4); [[3, 8], [20, 6], [3, 17], [20, 19]].forEach(([x, y]) => aR(c, x, y, 1, 1, false)); }],
  ['repair', (c) => { aBar(c, 5, 19, 16, 8, 3.6); aDisc(c, 17, 7, 5.2); aDisc(c, 17.5, 6.5, 2.4, false); aBar(c, 17.5, 6.5, 24, 0, 3.2, 3.2, false); aDisc(c, 5, 19, 2.6); aR(c, 2, 20, 0, 0); }],
  ['search_empty', (c) => { aDrawer(c, true); aR(c, 10, 5, 4, 1); aR(c, 6, 3, 1, 1); aR(c, 17, 3, 1, 1); }],
  ['none', (c) => aDisc(c, 12, 12, 3)],
];
const plusMark = (c) => { aR(c, 20, 4, 2, 6); aR(c, 19, 6, 5, 2); };
ACT.push(
  ['build_wall', (c) => { for (let r = 0; r < 4; r++) { const y = 3 + r * 5; aR(c, 2, y, 20, 4); [(r % 2 ? 7 : 12), (r % 2 ? 17 : 5)].forEach((x) => aR(c, x, y, 1, 4, false)); } }],
  ['upgrade', (c) => { aArrow(c, 12, 14, 12, 0); aR(c, 3, 17, 18, 2); aR(c, 3, 21, 18, 2); aR(c, 5, 15, 14, 1); }],
  ['demolish', (c) => { aR(c, 2, 2, 20, 16); aBar(c, 12, 1, 8, 8, 2, 2, false); aBar(c, 8, 8, 15, 12, 2, 2, false); aBar(c, 15, 12, 10, 19, 2, 2, false); aR(c, 3, 20, 4, 3); aR(c, 10, 21, 3, 2); aR(c, 17, 20, 4, 3); aR(c, 5, 19, 1, 1, false); }],
  ['fit_door', (c) => { aDoorFrame(c); aR(c, 6, 4, 9, 16); aR(c, 11, 11, 2, 2, false); plusMark(c); }],
  ['fit_window', (c) => { aHollow(c, 2, 4, 16, 16, 2); aR(c, 9, 6, 2, 12); aR(c, 4, 11, 12, 2); plusMark(c); }],
  ['board_window', (c) => { aHollow(c, 3, 2, 18, 20, 2); aBar(c, 0, 8, 24, 6, 3.6); aBar(c, 0, 17, 24, 19, 3.6); [[2, 8], [21, 6], [2, 17], [21, 19]].forEach(([x, y]) => aR(c, x, y, 1, 1, false)); }],
  ['plate_window', (c) => { aHollow(c, 1, 1, 22, 22, 2); aR(c, 4, 4, 16, 16); [[6, 6], [16, 6], [6, 16], [16, 16]].forEach(([x, y]) => aR(c, x, y, 2, 2, false)); aR(c, 11, 8, 2, 8, false); }],
  ['claim_floor', (c) => { aR(c, 5, 1, 2, 21); aTri(c, 7, 2, 21, 8, 7, 14); aR(c, 2, 21, 9, 2); aR(c, 10, 6, 5, 2, false); }],
  ['attack_pistol', (c) => { aR(c, 2, 4, 20, 5); aR(c, 19, 2, 2, 2); aR(c, 2, 9, 14, 3); aBar(c, 7, 11, 5, 22, 5.5); aHollow(c, 10, 11, 5, 5, 1); aR(c, 5, 5, 8, 1, false); }],
  ['attack_shotgun', (c) => { aR(c, 6, 5, 17, 3); aR(c, 6, 9, 17, 3); aR(c, 6, 8, 17, 1, false); aR(c, 6, 7, 6, 8); aR(c, 11, 13, 7, 3); aBar(c, 1, 20, 8, 12, 7, 3); aR(c, 21, 3, 2, 2); }],
  ['attack_hammer', (c) => { aBar(c, 4, 21, 16, 9, 3); aBar(c, 12, 5, 20, 13, 5.5); aBar(c, 12, 5, 8, 3, 2, 1); aBar(c, 16, 9, 19, 12, 1, 1, false); }],
  ['attack_sledgehammer', (c) => { aBar(c, 3, 22, 14, 11, 3.4); aBar(c, 9, 2, 22, 15, 8.5); aBar(c, 12, 5, 19, 12, 1, 1, false); aR(c, 1, 21, 3, 2); }],
  ['attack_axe', (c) => { aBar(c, 3, 21, 17, 7, 3); aTri(c, 13, 3, 23, 3, 20, 15); aTri(c, 14, 2, 18, 2, 14, 9); aR(c, 17, 6, 3, 2, false); }],
  ['reload', (c) => { aRing(c, 12, 12, 10, 3); aR(c, 12, 0, 12, 9, false); aTri(c, 14, 0, 14, 11, 23, 5.5); aR(c, 9, 7, 6, 10); aR(c, 10, 5, 4, 2); aR(c, 11, 8, 2, 7, false); }],
  ['trowel', (c) => { aTri(c, 2, 21, 5, 9, 14, 15); aTri(c, 5, 9, 14, 15, 11, 7); aBar(c, 10, 11, 16, 7, 1.8); aBar(c, 15, 8, 22, 2, 3.6); }],
  ['place_trap', (c) => { aR(c, 1, 19, 22, 3); for (let i = 0; i < 4; i++) aTri(c, 2 + i * 5.5, 19, 4.8 + i * 5.5, 10, 7.6 + i * 5.5, 19); aArrow(c, 12, 0, 12, 8); }],
);
sheet('action_icons', 24, 24, ACT, { note: 'Context-button pictograms 24x24 (display 72-96 game px), flat #bdb8ab, no outline; alpha/tint in game (search_empty/disabled use the plate disabled variant). Frame names = icon ids. C2/C3 additions appended after none: build_wall, upgrade, demolish, fit_door, fit_window, board_window, plate_window, claim_floor, attack_pistol/shotgun/hammer/sledgehammer/axe, reload, trowel (build-mode top bar), place_trap.' });

// button_plates 40x40 frames: round dark translucent plates (art size 40/32/30/28 = 120/96/88/80 game px), centered in the frame.
// Frames: plate_<s>, plate_<s>_pressed, plate_<s>_disabled for s in 40,32,30,28, then ring_<s> (2px ring, white-ish, tint + mask in game for the cooldown sweep).
const PLATE = { n: { f: [16, 18, 21, 170], r: [189, 184, 171, 90], i: [189, 184, 171, 22] }, p: { f: [8, 9, 11, 225], r: [189, 184, 171, 170], i: [0, 0, 0, 90] }, d: { f: [16, 18, 21, 100], r: [189, 184, 171, 36], i: [189, 184, 171, 0] } };
const PS = [40, 32, 30, 28];
function plate(c, s, k) {
  const m = PLATE[k], r = s / 2;
  for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) {
    const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20);
    if (d > r) continue;
    c.px(x, y, d > r - 1.5 ? m.r : (d > r - 3.5 && m.i[3] ? m.i : m.f));
  }
}
sheet('button_plates', 40, 40, [
  ...PS.flatMap((s) => [[`plate_${s}`, (c) => plate(c, s, 'n')], [`plate_${s}_pressed`, (c) => plate(c, s, 'p')], [`plate_${s}_disabled`, (c) => plate(c, s, 'd')]]),
  ...PS.map((s) => [`ring_${s}`, (c) => { for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) { const d = Math.hypot(x + 0.5 - 20, y + 0.5 - 20); if (d <= s / 2 && d > s / 2 - 2) c.px(x, y, [222, 218, 205, 255]); } }]),
], { note: 'Plates 40x40 frames; plate_40/32/30/28 = 120/96/88/80 game px (Main/Secondary/Attack/Quick-use) each with _pressed and _disabled; ring_<s> 2px ring for cooldown sweep (mask in game).' });

// ---------- manifest ----------
const list = Object.values(files);
const total = list.reduce((s, f) => s + f.bytes, 0);
const manifest = {
  version: 1, milestone: 'M2', note: 'Placeholder art (M2 dark palette, GDD 9). Native pixels; scale 3x with pixelArt. Frames are horizontal strips. Paths are relative to the site root.',
  files: list.map(({ bytes, ...f }) => f),
};
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1) + '\n');
console.log(`art written: ${list.length} sheets, ${total} bytes (png)`);
