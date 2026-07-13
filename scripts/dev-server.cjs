'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const realRoot = fs.realpathSync(root);
const deploymentConfig = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const securityHeaders = Object.fromEntries((deploymentConfig.headers.find((entry) => entry.source === '/(.*)')?.headers || []).map((entry) => [entry.key, entry.value]));
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
  '/api/market-microstructure': '../api/market-microstructure',
  '/api/market': '../api/market',
  '/api/defillama': '../api/defillama',
  '/api/signals': '../api/signals',
  '/api/signal-worker': '../api/signal-worker'
};

function isWithinRoot(basePath, candidatePath) {
  const relative = path.relative(basePath, candidatePath);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

const server = http.createServer((request, response) => {
  Object.entries(securityHeaders).forEach(([name, value]) => response.setHeader(name, value));
  response.setHeader('Cache-Control', 'no-store');
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
      if (response.writableEnded) return;
      response.statusCode = 500;
      if (!response.headersSent) response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify({ error: error.message || 'Internal error' }));
    });
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.writeHead(405).end('Method not allowed');
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
  fs.realpath(filename, (realPathError, realFilename) => {
    if (realPathError) {
      response.writeHead(404).end('Not found');
      return;
    }
    if (!isWithinRoot(realRoot, realFilename)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    fs.readFile(realFilename, (error, data) => {
      if (error) {
        response.writeHead(404).end('Not found');
        return;
      }
      response.setHeader('Content-Type', contentTypes[path.extname(realFilename)] || 'application/octet-stream');
      response.end(request.method === 'HEAD' ? undefined : data);
    });
  });
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

if (require.main === module) {
  server.on('error', (error) => {
    process.stderr.write(`Falha ao iniciar servidor local (${error.code || 'erro'}): ${error.message}\n`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    process.stdout.write(`Crypto Live Desk local em http://${host}:${port}\n`);
  });

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { isWithinRoot };
