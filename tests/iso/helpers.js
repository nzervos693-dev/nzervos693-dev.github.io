import { Grid } from '../../src/iso/grid.js';
import balance from '../../public/data/balance.json';

/** Build a Grid from double-resolution ASCII (see Grid.fromAscii). */
export const ascii = (lines) => Grid.fromAscii(lines, { interiorHp: balance.doors.interiorHp, frontHp: balance.doors.frontHp });

/** Open w x h room with outer walls. */
export function room(w, h) {
  const lines = [];
  for (let y = 0; y <= 2 * h; y++) {
    let l = '';
    for (let x = 0; x <= 2 * w; x++) {
      const ex = x % 2 === 0, ey = y % 2 === 0;
      if (ex && ey) l += '+';
      else if (ey) l += y === 0 || y === 2 * h ? '-' : ' ';
      else if (ex) l += x === 0 || x === 2 * w ? '|' : ' ';
      else l += '.';
    }
    lines.push(l);
  }
  return lines;
}

/** Replace char (cx, cy) in ascii lines. */
export function put(lines, cx, cy, ch) {
  lines[cy] = lines[cy].slice(0, cx) + ch + lines[cy].slice(cx + 1);
  return lines;
}
