import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Vite-hashed bundles (assets/index-AbC123xy.js) are immutable. Everything else we ship under the same
// folder (public/assets/audio/*.ogg, art, data) keeps its name when its content changes, and
// vite-plugin-pwa marks anything under assets/ with revision null, so a changed .ogg would never be
// re-downloaded. Give un-hashed entries an md5 revision of their built content.
let outDir = 'dist';
const hashed = /^assets\/[^/]+-[\w-]{8}\.\w+$/; // top-level Vite output only (assets/index-AbC123xy.js)
const revisionFromContent = async (entries) => {
  const warnings = [];
  const manifest = entries.map((e) => {
    if (e.revision !== null || hashed.test(e.url)) return e;
    try {
      return { ...e, revision: createHash('md5').update(readFileSync(join(outDir, e.url))).digest('hex') };
    } catch (err) {
      warnings.push(`no content revision for ${e.url}: ${err.message}`);
      return e;
    }
  });
  return { manifest, warnings };
};
const captureOutDir = { name: 'capture-outdir', configResolved: (c) => { outDir = c.build.outDir; } };

// Build stamp shown on the title screen: "build <git short sha> · <day> <Mon>". Falls back to "dev".
function buildStamp() {
  try {
    const git = (a) => execSync(`git ${a}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const sha = git('rev-parse --short=7 HEAD') || (process.env.GITHUB_SHA || '').slice(0, 7);
    const [, m, d] = git('show -s --format=%cs HEAD').split('-');
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
    return `build ${sha} \u00b7 ${Number(d)} ${mon}`;
  } catch {
    return process.env.GITHUB_SHA ? `build ${process.env.GITHUB_SHA.slice(0, 7)}` : 'dev';
  }
}

// User site (nzervos693-dev.github.io) is served at the domain root.
// If this ever moves to a project page, change base to '/<repo>/'.
export default defineConfig({
  base: '/',
  define: { __BUILD_STAMP__: JSON.stringify(buildStamp()) },
  build: {
    chunkSizeWarningLimit: 1500, // Phaser alone is ~1.2 MB minified
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) },
    },
  },
  plugins: [
    captureOutDir,
    VitePWA({
      // 'prompt': a new SW waits until src/core/update.js decides it is safe to activate and reload
      // (autoUpdate would reload the running page at once and could cost progress).
      registerType: 'prompt',
      manifest: false, // we ship public/manifest.webmanifest and link it in index.html
      injectRegister: false, // registered explicitly in src/main.js via virtual:pwa-register
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,webp,jpg,svg,ogg,mp3,wav,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        importScripts: ['sw-migrate.js'], // one-time escape from the legacy autoUpdate SW
        globIgnores: ['sw-migrate.js'],
        cleanupOutdatedCaches: true,
        clientsClaim: true, // new SW takes over right after we send SKIP_WAITING, which triggers the reload
        manifestTransforms: [revisionFromContent],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
