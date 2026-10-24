/*
 * E2E: build stamp + service-worker update flow against built output (not part of `npm test`).
 * Copies dist-e2e to a temp dir, loads it (SW installs, precaches), then "deploys" v2 by changing an
 * .ogg (so its precache revision changes) and rewriting sw.js, and checks that after a visibility
 * change the page reloads onto v2, serves the new asset, and old caches are gone.
 * Also checks that mid-game the update is deferred and applied on the next resume.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { cpSync, rmSync, readdirSync, appendFileSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const PORT = 4185;
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };
const work = mkdtempSync(join(tmpdir(), 'f15-upd-'));
const site = join(work, 'site');
cpSync('dist-e2e', site, { recursive: true });
const rel = relative(process.cwd(), site);
const server = await serve(rel, PORT);
const url = server.url;

const findOgg = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) { const p = join(d, e.name); if (e.isDirectory()) { const r = findOgg(p); if (r) return r; } else if (p.endsWith('.ogg')) return p; } };
const ogg = findOgg(site);
const oggUrl = '/' + relative(site, ogg);
const md5 = (b) => createHash('md5').update(b).digest('hex');
const oldRev = md5(readFileSync(ogg));

try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const sleep = (ms) => page.waitForTimeout(ms);
  const sceneKey = () => page.evaluate(() => window.__scenes && Object.keys(window.__scenes).slice(-1)[0]);

  await page.goto(url + '?debug&story', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__scenes?.Title, null, { timeout: 20000 });
  const stamp = await page.evaluate(() => window.__scenes.Title.buildText?.text);
  check(/^(build [0-9a-f]{7}.* · \d+ \w{3}|dev)$/.test(stamp || ''), `title shows build stamp (${stamp})`);
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 20000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await sleep(1500);
  // second launch, so a controller exists (a real player's later sessions)
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.__scenes?.Title && navigator.serviceWorker.controller, null, { timeout: 20000 });
  const caches1 = await page.evaluate(async () => caches.keys());
  console.log('caches before:', caches1);
  const swV1 = readFileSync(join(site, 'sw.js'), 'utf8');
  check(swV1.includes(oldRev), 'sw.js precache revision equals md5 of the .ogg');

  // ---- "second deploy": change the ogg, bump its revision in sw.js (what a rebuild does)
  appendFileSync(ogg, Buffer.from([0, 0, 0, 1]));
  const newRev = md5(readFileSync(ogg));
  // also a marker in index.html so we can tell the page reloaded onto v2 (rebuild = new index revision too)
  const redeploy = (n, sw) => {
    const idx = readFileSync(join(site, 'index.html'), 'utf8');
    const idx2 = idx.replace(/<meta name="deploy"[^>]*>/, '').replace('</head>', `<meta name="deploy" content="${n}"></head>`);
    writeFileSync(join(site, 'index.html'), idx2);
    const m = sw.match(/\{url:"index\.html",revision:"([0-9a-f]+)"\}/);
    writeFileSync(join(site, 'sw.js'), sw.replace(m[1], md5(idx2)) + `\n// deploy ${n} ${Date.now()}\n`);
  };
  const swNow = () => readFileSync(join(site, 'sw.js'), 'utf8').replace(/\n\/\/ deploy .*\n$/, '');
  redeploy(2, swV1.replace(oldRev, newRev));

  // Case A: on Title -> app goes background then foreground -> update check -> reload at once
  await page.evaluate(() => { window.__marker = 'v1-page'; });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    const m = await page.evaluate(() => window.__marker).catch(() => 'navigating');
    if (m !== 'v1-page' && m !== 'navigating') break;
  }
  await page.waitForFunction(() => window.__scenes?.Title, null, { timeout: 30000 });
  check(await page.evaluate(() => !window.__marker), 'page reloaded after the update was found (title screen)');
  check(await page.evaluate(() => !!document.querySelector('meta[name=deploy]')), 'reloaded page is the v2 index.html');
  const served = await page.evaluate(async (u) => (await (await fetch(u)).arrayBuffer()).byteLength, oggUrl);
  check(served === readFileSync(ogg).length, 'v2 .ogg bytes are served (not the stale cached copy)');
  const caches2 = await page.evaluate(async () => caches.keys());
  console.log('caches after:', caches2);
  check(caches2.length === 1, 'exactly one precache present');
  const urls2 = await page.evaluate(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).map((k) => k.url); });
  check(urls2.some((u) => u.includes(newRev)) && !urls2.some((u) => u.includes(oldRev)), 'precache holds the new .ogg revision, not the old one');
  check((await page.evaluate(() => window.__scenes?.Title?.buildText?.text)) !== undefined, 'build stamp still shown after update');

  // ---- third deploy while the player is mid-game: must defer, then apply on the next resume
  await page.goto(url + '?debug', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__floor15?.state, null, { timeout: 20000 });
  await page.evaluate(() => { window.__marker = 'game-page'; });
  redeploy(3, swNow());
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await sleep(4000);
  check(await page.evaluate(() => window.__marker === 'game-page'), 'mid-game: update found but page NOT reloaded (deferred)');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  for (let i = 0; i < 40; i++) { await sleep(500); if (await page.evaluate(() => window.__marker).catch(() => 'x') !== 'game-page') break; }
  await page.waitForFunction(() => window.__floor15?.state, null, { timeout: 30000 });
  check(await page.evaluate(() => document.querySelector('meta[name=deploy]')?.content === '3'), 'mid-game: reloaded onto v3 after the app was resumed');

  check(errors.length === 0, `no page errors ${errors.join('|')}`);
  await browser.close();
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall passed');
process.exit(fail.length ? 1 : 0);
