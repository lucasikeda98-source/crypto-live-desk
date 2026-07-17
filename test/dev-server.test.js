'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');
const { isWithinRoot, hasHiddenSegment } = require('../scripts/dev-server.cjs');

test('dev server recusa alvos reais fora da raiz, inclusive via link simbolico', () => {
  const root = path.resolve(__dirname, '..');
  assert.equal(isWithinRoot(root, path.join(root, 'index.html')), true);
  assert.equal(isWithinRoot(root, root), true);
  assert.equal(isWithinRoot(root, path.resolve(root, '..', 'segredo.txt')), false);
  assert.equal(isWithinRoot(root, path.resolve(root, '..')), false);
});

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch('http://127.0.0.1:' + port + '/', { signal: AbortSignal.timeout(1000) })
        .then((response) => response.ok ? resolve() : retry())
        .catch(retry);
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error('Timeout esperando dev server'));
      else setTimeout(attempt, 150);
    };
    attempt();
  });
}

test('dev server sobrevive a URL malformada e bloqueia dotfiles e traversal', async () => {
  const port = await freePort();
  const serverPath = path.resolve(__dirname, '..', 'scripts', 'dev-server.cjs');
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
    windowsHide: true
  });
  try {
    await waitForServer(port, 8000);
    const base = 'http://127.0.0.1:' + port;

    const malformed = await fetch(base + '/%', { signal: AbortSignal.timeout(2000) });
    assert.equal(malformed.status, 400, 'URL malformada deve retornar 400');

    const nullByte = await fetch(base + '/%00', { signal: AbortSignal.timeout(2000) });
    assert.equal(nullByte.status, 400, 'byte nulo decodificado deve retornar 400, nao derrubar o processo');

    const nullByteSuffix = await fetch(base + '/index.html%00.png', { signal: AbortSignal.timeout(2000) });
    assert.equal(nullByteSuffix.status, 400, 'byte nulo embutido deve retornar 400');

    const afterMalformed = await fetch(base + '/', { signal: AbortSignal.timeout(2000) });
    assert.equal(afterMalformed.status, 200, 'servidor deve continuar vivo apos URL malformada');
    assert.equal(afterMalformed.headers.get('x-content-type-options'), 'nosniff');
    assert.match(afterMalformed.headers.get('content-security-policy'), /frame-ancestors 'none'/);

    const dotfile = await fetch(base + '/.gitignore', { signal: AbortSignal.timeout(2000) });
    assert.equal(dotfile.status, 404, 'dotfiles nao devem ser servidos');

    const nestedDotfile = await fetch(base + '/.github/workflows/quality.yml', { signal: AbortSignal.timeout(2000) });
    assert.equal(nestedDotfile.status, 404, 'diretorios ocultos nao devem ser servidos');

    const traversal = await fetch(base + '/..%2f..%2fwindows%2fwin.ini', { signal: AbortSignal.timeout(2000) });
    assert.ok([403, 404].includes(traversal.status), 'traversal deve ser bloqueado');

    const index = await fetch(base + '/index.html', { signal: AbortSignal.timeout(2000) });
    assert.equal(index.status, 200, 'index.html deve ser servido');

    const head = await fetch(base + '/index.html', { method: 'HEAD', signal: AbortSignal.timeout(2000) });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '', 'HEAD nao deve transferir o corpo do arquivo');

    const staticPost = await fetch(base + '/index.html', { method: 'POST', signal: AbortSignal.timeout(2000) });
    assert.equal(staticPost.status, 405, 'arquivos estaticos aceitam somente GET/HEAD');
    assert.equal(staticPost.headers.get('allow'), 'GET, HEAD');
    assert.equal(staticPost.headers.get('cache-control'), 'no-store');

    // DEV-dotfile-via-symlink (REV-CC-01): um symlink NAO-oculto apontando para dotfile
    // interno nao pode ser servido — a checagem de segmento oculto vale para o realpath.
    const root = path.resolve(__dirname, '..');
    const linkPath = path.join(root, 'symlink-smoke-public.txt');
    let symlinkCreated = false;
    try {
      fs.symlinkSync(path.join(root, '.gitignore'), linkPath, 'file');
      symlinkCreated = true;
    } catch (error) {
      // Windows sem Developer Mode nao permite criar symlink; a checagem pura cobre abaixo.
    }
    if (symlinkCreated) {
      try {
        const viaSymlink = await fetch(base + '/symlink-smoke-public.txt', { signal: AbortSignal.timeout(2000) });
        assert.equal(viaSymlink.status, 404, 'symlink para dotfile interno nao deve ser servido');
      } finally {
        fs.unlinkSync(linkPath);
      }
    }

    // Junction de diretorio nao exige privilegio no Windows, entao este ramo roda sempre:
    // junction visivel -> diretorio oculto interno (.github) tem que continuar bloqueado.
    const junctionPath = path.join(root, 'junction-smoke-public');
    let junctionCreated = false;
    try {
      fs.symlinkSync(path.join(root, '.github'), junctionPath, 'junction');
      junctionCreated = true;
    } catch (error) {
      // Sem suporte a junction/symlink neste sistema de arquivos.
    }
    if (junctionCreated) {
      try {
        const viaJunction = await fetch(base + '/junction-smoke-public/workflows/quality.yml', { signal: AbortSignal.timeout(2000) });
        assert.equal(viaJunction.status, 404, 'junction para diretorio oculto interno nao deve ser servida');
      } finally {
        fs.rmSync(junctionPath, { recursive: false, force: true });
      }
    }
    assert.ok(symlinkCreated || junctionCreated, 'ao menos um caminho de link real deve ter sido exercitado');
  } finally {
    child.kill();
  }
});

test('checagem de segmento oculto cobre o caminho real resolvido', () => {
  const root = path.resolve(__dirname, '..');
  assert.equal(hasHiddenSegment(root, path.join(root, '.gitignore')), true);
  assert.equal(hasHiddenSegment(root, path.join(root, '.github', 'workflows', 'quality.yml')), true);
  assert.equal(hasHiddenSegment(root, path.join(root, 'index.html')), false);
  assert.equal(hasHiddenSegment(root, path.join(root, 'lib', 'analytics-core.js')), false);
});
