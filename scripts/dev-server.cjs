'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 5173;
const host = process.env.HOST || '127.0.0.1';
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};
const apiHandlers = {
  '/api/news': '../api/news',
  '/api/macro': '../api/macro',
  '/api/tradfi': '../api/tradfi',
  '/api/options': '../api/options',
  '/api/institutional': '../api/institutional',
  '/api/market': '../api/market',
  '/api/defillama': '../api/defillama'
};

const server = http.createServer((request, response) => {
  let requestUrl;
  let pathname;
  try {
    requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
    pathname = decodeURIComponent(requestUrl.pathname);
  } catch (error) {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (apiHandlers[pathname]) {
    const handler = require(apiHandlers[pathname]);
    request.query = Object.fromEntries(requestUrl.searchParams.entries());
    response.status = (statusCode) => { response.statusCode = statusCode; return response; };
    response.json = (payload) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(payload));
    };
    Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.json({ error: error.message || 'Internal error' });
    });
    return;
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filename = path.resolve(root, relativePath);
  const relative = path.relative(root, filename);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  const hasHiddenSegment = relative.split(path.sep).some((segment) => segment.startsWith('.'));
  if (hasHiddenSegment) {
    response.writeHead(404).end('Not found');
    return;
  }
  fs.readFile(filename, (error, data) => {
    if (error) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Type', contentTypes[path.extname(filename)] || 'application/octet-stream');
    response.end(data);
  });
});

server.listen(port, host, () => {
  process.stdout.write(`Crypto Live Desk local em http://${host}:${port}\n`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
