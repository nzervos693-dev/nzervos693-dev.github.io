// Renders the Notes app icons (public/notes/icons/*.png) with the pre-installed Chromium.
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#d9902f"/>
  <g transform="translate(256 256) scale(${pad ? 0.62 : 0.8}) translate(-256 -256)">
    <rect x="126" y="86" width="260" height="340" rx="34" fill="#fffaf0"/>
    <rect x="166" y="160" width="180" height="22" rx="11" fill="#d9902f"/>
    <rect x="166" y="214" width="180" height="16" rx="8" fill="#c9bfae"/>
    <rect x="166" y="258" width="150" height="16" rx="8" fill="#c9bfae"/>
    <rect x="166" y="302" width="168" height="16" rx="8" fill="#c9bfae"/>
    <rect x="166" y="346" width="110" height="16" rx="8" fill="#c9bfae"/>
  </g></svg>`;

const out = 'public/notes/icons';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
const page = await browser.newPage();
for (const [name, size, pad] of [['icon-192', 192, false], ['icon-512', 512, false], ['icon-maskable-512', 512, true]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(pad)}`);
  writeFileSync(`${out}/${name}.png`, await page.screenshot({ omitBackground: true }));
  console.log(`${out}/${name}.png`);
}
await browser.close();
