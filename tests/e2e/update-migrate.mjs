/*
 * E2E: migration from the legacy autoUpdate service worker (build at LEGACY_REF, default 4c42a07) to the
 * current 'prompt' build. Builds the legacy ref with git archive in a temp dir, loads it, then "deploys"
 * the current dist-e2e over it with a changed .ogg and checks that, after ONE relaunch of the same
 * tab (other clients stay open), the new .ogg is served and the new SW controls the page.
 */
import { chromium } from 'playwright-core';
import { serve } from './server.mjs';
import { cpSync, rmSync, readFileSync, writeFileSync, appendFileSync, mkdtempSync, symlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

const REF = process.env.LEGACY_REF || '4c42a07';
const fail = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) fail.push(msg); };
const work = mkdtempSync(join(tmpdir(), 'f15-mig-'));
const src = join(work, 'src');
execSync(`mkdir ${src} && git archive ${REF} | tar -x -C ${src}`, { stdio: 'inherit', shell: '/bin/bash' });
symlinkSync(join(process.cwd(), 'node_modules'), join(src, 'node_modules'));
execSync('npx vite build --mode e2e --outDir out', { cwd: src, stdio: 'ignore', env: { ...process.env, VITE_DEBUG_HOOKS: '1' } });
const site = join(work, 'site');
cpSync(join(src, 'out'), site, { recursive: true });
const server = await serve(relative(process.cwd(), site), 4191);
const oggRel = 'assets/audio/zombie_hit.ogg';
const md5 = (b) => createHash('md5').update(b).digest('hex');
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const keep = await ctx.newPage(); // a second client that stays open the whole time
  const title = () => page.waitForFunction(() => window.__scenes?.Title, null, { timeout: 30000 });
  await keep.goto(server.url + '?debug&story');
  await page.goto(server.url + '?debug&story'); await title();
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(1500);
  await page.reload(); await title();

  // deploy the current build over it, with a changed ogg
  rmSync(site, { recursive: true, force: true });
  cpSync('dist-e2e', site, { recursive: true });
  const ogg = join(site, oggRel);
  const oldRev = md5(readFileSync(ogg));
  appendFileSync(ogg, Buffer.from([1, 2, 3, 4]));
  const sw = readFileSync(join(site, 'sw.js'), 'utf8');
  writeFileSync(join(site, 'sw.js'), sw.replace(oldRev, md5(readFileSync(ogg))));
  const newLen = readFileSync(ogg).length;

  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update(); });
  await page.waitForTimeout(4000);
  // relaunch the tab once (the old page may already have reloaded itself)
  await page.reload(); await title(); await page.waitForTimeout(2000);
  const r = await page.evaluate(async (u) => ({
    len: (await (await fetch(u)).arrayBuffer()).byteLength,
    stamp: window.__scenes.Title.buildText?.text,
    keep: await caches.keys(),
  }), '/' + oggRel);
  check(r.len === newLen, `new .ogg served after one relaunch with another client open (${r.len} vs ${newLen})`);
  check(!!r.stamp, `new build running (stamp ${r.stamp})`);
  const cachedLen = await page.evaluate(async (u) => { const c = await caches.open((await caches.keys())[0]); const m = await c.match(u, { ignoreSearch: true }); return m ? (await m.arrayBuffer()).byteLength : -1; }, '/' + oggRel);
  check(cachedLen === newLen, 'precache holds the new .ogg');
} finally {
  await browser.close(); server.close(); rmSync(work, { recursive: true, force: true });
}
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall passed');
process.exit(fail.length ? 1 : 0);
