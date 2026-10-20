// Generates placeholder PNG icons (dark tower square with an amber window)
// into public/icons/. Run: npm run icons. art-generator replaces these later.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

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
function png(size, draw) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = draw(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const BG = [20, 17, 15], WALL = [43, 37, 33], AMBER = [255, 176, 32];
// Everything important sits inside the central 60% so it survives maskable cropping.
const draw = (u, v) => {
  if (u > 0.3 && u < 0.7 && v > 0.2 && v < 0.8) {
    if (u > 0.42 && u < 0.58 && v > 0.42 && v < 0.58) return AMBER;
    return WALL;
  }
  return BG;
};
mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', png(192, draw));
writeFileSync('public/icons/icon-512.png', png(512, draw));
writeFileSync('public/icons/icon-maskable-512.png', png(512, draw));
console.log('icons written');
