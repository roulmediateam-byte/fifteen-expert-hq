// A tiny local web server for the demo, with no dependencies.
//
//   node site/demo/worker/scripts/serve.mjs          (then open http://localhost:8080)
//   PORT=9000 node site/demo/worker/scripts/serve.mjs
//
// The demo uses JavaScript modules and loads JSON files, which browsers block when a page
// is opened straight from disk, so it needs to be served like this (or by Cloudflare Pages).

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8080);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

export function startServer(p = port) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (path === '' || path.endsWith(sep) || path.endsWith('/')) path = join(path, 'index.html');
      const file = join(root, path);
      if (!file.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
      const info = await stat(file).catch(() => null);
      if (!info || !info.isFile()) { res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found'); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' }).end('Server error');
    }
  });
  return new Promise((resolve) => server.listen(p, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startServer().then(() => {
    console.log(`Worker console demo (made-up claims): http://localhost:${port}/`);
    console.log('Press Ctrl+C to stop.');
  });
}
