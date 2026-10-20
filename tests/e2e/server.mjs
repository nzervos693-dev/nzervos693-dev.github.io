/** Tiny static server for the e2e build (correct MIME types, 404 for missing files, no SPA fallback). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.ogg': 'audio/ogg', '.webmanifest': 'application/manifest+json', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.map': 'application/json',
};

/**
 * Serve a directory on a port. @returns {Promise<{url:string, close:()=>void}>}
 */
export function serve(dir, port) {
  const root = normalize(join(process.cwd(), dir));
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(root, path));
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() }));
  });
}
