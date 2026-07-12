const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

http.createServer((request, response) => {
  const pathname = decodeURIComponent(request.url.split('?')[0]);
  if (pathname === '/api/news' || pathname === '/api/macro' || pathname === '/api/tradfi' || pathname === '/api/options' || pathname === '/api/institutional') {
    const handler = require(pathname === '/api/news' ? './api/news' : pathname === '/api/macro' ? './api/macro' : pathname === '/api/tradfi' ? './api/tradfi' : pathname === '/api/options' ? './api/options' : './api/institutional');
    request.query = Object.fromEntries(new URL(request.url, 'http://127.0.0.1').searchParams.entries());
    response.status = (statusCode) => { response.statusCode = statusCode; return response; };
    response.json = (payload) => {
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(payload));
    };
    Promise.resolve(handler(request, response)).catch((error) => {
      response.statusCode = 500;
      response.end(JSON.stringify({ error: error.message }));
    });
    return;
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filename = path.resolve(root, relativePath);

  if (!filename.startsWith(root)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filename, (error, data) => {
    if (error) {
      response.writeHead(404).end('Not found');
      return;
    }

    response.setHeader('Content-Type', contentTypes[path.extname(filename)] || 'application/octet-stream');
    response.end(data);
  });
}).listen(5173, '127.0.0.1');
