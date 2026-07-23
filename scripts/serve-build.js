#!/usr/bin/env node
/*
 * serve-build.js — a tiny, dependency-free static server for the CRA `build/`
 * output, used by the smoke test (scripts/smoke.js) and handy for a quick local
 * preview of a production build. SPA-aware: unknown non-asset paths fall back to
 * index.html so client-side routing works. Node built-ins only — no `serve`,
 * no express, nothing to install in CI.
 *
 * Usage:  node scripts/serve-build.js [port]   (default port 4123)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2] || process.env.PORT || 4123);
const ROOT = path.join(__dirname, '..', 'build');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.map': 'application/json; charset=utf-8',
};

if (!fs.existsSync(ROOT)) {
  console.error(`serve-build: no build/ directory at ${ROOT} — run "npm run build" first.`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    // Resolve within ROOT and guard against path traversal.
    let filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) filePath = path.join(filePath, 'index.html');
    // SPA fallback: a path with no file extension that doesn't exist → index.html.
    if (!fs.existsSync(filePath)) {
      if (path.extname(filePath)) { res.writeHead(404); res.end('Not found'); return; }
      filePath = path.join(ROOT, 'index.html');
    }
    const body = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(filePath)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(500); res.end('Server error');
  }
});

server.listen(PORT, () => console.log(`serve-build: serving ${ROOT} at http://localhost:${PORT}`));
