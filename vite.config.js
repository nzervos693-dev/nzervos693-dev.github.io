import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// User site (nzervos693-dev.github.io) is served at the domain root.
// If this ever moves to a project page, change base to '/<repo>/'.
export default defineConfig({
  base: '/',
  build: {
    chunkSizeWarningLimit: 1500, // Phaser alone is ~1.2 MB minified
    rollupOptions: {
      output: { manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined) },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false, // we ship public/manifest.webmanifest and link it in index.html
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,webp,jpg,svg,ogg,mp3,wav,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
