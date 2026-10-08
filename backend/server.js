'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { handleApi } = require('./src/routes');
const { HttpError, send } = require('./src/http');

const PORT = Number(process.env.PORT || 3000);
const FRONTEND_DIR = path.resolve(process.env.FRONTEND_DIR || path.join(__dirname, '..', 'frontend'));
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function serveStatic(req, res, pathname) {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
  let rel = decodeURIComponent(pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.resolve(FRONTEND_DIR, '.' + rel);
  if (file !== FRONTEND_DIR && !file.startsWith(FRONTEND_DIR + path.sep)) throw new HttpError(403, 'Forbidden.');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'Not found.' });
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
    });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url);
    else serveStatic(req, res, url.pathname);
  } catch (err) {
    if (err instanceof HttpError) {
      send(res, err.status, { error: err.message, ...(err.details ? { details: err.details } : {}) });
    } else {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'Internal server error.' });
    }
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`FindIt running at http://localhost:${PORT}`);
    console.log(`Serving frontend from ${FRONTEND_DIR}`);
  });
}

module.exports = server;
