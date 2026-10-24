/*
 * sw-migrate.js - one-time escape from the legacy autoUpdate service worker (imported by sw.js).
 *
 * Builds before the 'prompt' switch precached assets/ files (audio, art) with no revision, so a changed
 * file was never re-fetched, and their pages never send SKIP_WAITING, so a 'prompt' SW would wait for
 * every client to close. If the existing precache still holds such legacy keys (a non-bundle file under
 * /assets/ without ?__WB_REVISION__), skip waiting so the new worker takes over now; the next launch
 * runs the new version. Current builds always revision those files, so this never fires for them.
 */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      for (const name of await caches.keys()) {
        if (!name.includes('precache')) continue;
        const keys = await (await caches.open(name)).keys();
        const legacy = keys.some((r) => {
          const u = new URL(r.url);
          return u.pathname.includes('/assets/') && !/\.(js|css)$/.test(u.pathname) && !u.searchParams.has('__WB_REVISION__');
        });
        if (legacy) { self.skipWaiting(); return; }
      }
    } catch (e) { /* never block the install */ }
  })());
});
