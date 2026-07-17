'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { applyApiPolicy, applyApiPolicyAsync, getDistributedLimiter, originAllowed, publicApiError, publicErrorMessage, resetRateLimits, rateLimitBucketCount } = require('../lib/api-guard');
const { resetRedisForTests } = require('../lib/redis-runtime');

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; this.ended = true; return payload; },
    end() { this.ended = true; }
  };
}

test('erros publicos exigem marcacao explicita e removem controles', () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(publicErrorMessage('redis', new Error('redis://token-secreto@host')), 'internal error');
    assert.equal(publicErrorMessage('runtime', new TypeError('Cannot read properties of undefined')), 'internal error');
    assert.equal(publicErrorMessage('upstream', publicApiError('Deribit HTTP 503\ntrace')), 'Deribit HTTP 503 trace');
    assert.equal(publicErrorMessage('timeout', Object.assign(new Error('detalhe interno'), { name: 'TimeoutError' })), 'timeout');
  } finally {
    console.error = original;
  }
});

test('politica de API aceita same-origin, reflete origem e aplica headers em todos os caminhos', () => {
  resetRateLimits();
  const request = { method: 'GET', headers: { host: 'desk.example', origin: 'https://desk.example' }, socket: { remoteAddress: '1.2.3.4' } };
  const response = responseMock();
  assert.equal(originAllowed(request, request.headers.origin), true);
  assert.equal(applyApiPolicy(request, response, { cacheControl: 'public, s-maxage=10', limit: 2 }), true);
  assert.equal(response.headers['Access-Control-Allow-Origin'], request.headers.origin);
  assert.equal(response.headers['Cache-Control'], 'private, no-store, max-age=0', 'antes do status final nada e cacheavel');
  response.status(200).json({ ok: true });
  assert.equal(response.headers['Cache-Control'], 'public, s-maxage=10', 'somente GET 2xx promove cache publico');
  assert.equal(response.headers.Vary, 'Origin');
  assert.equal(response.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(response.headers['X-RateLimit-Remaining'], '1');
});

test('politica de API bloqueia CORS cruzado e limita abuso por IP', () => {
  resetRateLimits();
  const forbidden = responseMock();
  assert.equal(applyApiPolicy({ method: 'GET', headers: { host: 'desk.example', origin: 'https://evil.example' } }, forbidden), false);
  assert.equal(forbidden.statusCode, 403);
  assert.equal(forbidden.headers['Cache-Control'], 'private, no-store, max-age=0');

  resetRateLimits();
  const request = { method: 'GET', headers: { host: 'desk.example', 'x-forwarded-for': '9.8.7.6' } };
  assert.equal(applyApiPolicy(request, responseMock(), { limit: 2 }), true);
  assert.equal(applyApiPolicy(request, responseMock(), { limit: 2 }), true);
  const limited = responseMock();
  assert.equal(applyApiPolicy(request, limited, { limit: 2 }), false);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(limited.headers['Retry-After'] !== undefined, true);
});

test('limiter prefere o IP preservado pela Vercel quando ha proxy intermediario', () => {
  resetRateLimits();
  const base = { method: 'GET', headers: { host: 'desk.example', 'x-forwarded-for': '198.51.100.9', 'x-vercel-forwarded-for': '203.0.113.9' } };
  assert.equal(applyApiPolicy(base, responseMock(), { limit: 1 }), true);
  const limited = responseMock();
  assert.equal(applyApiPolicy({ ...base, headers: { ...base.headers, 'x-forwarded-for': '192.0.2.88' } }, limited, { limit: 1 }), false);
  assert.equal(limited.statusCode, 429);
});

test('same-origin exige o mesmo protocolo quando o proxy informa o esquema', () => {
  const request = { headers: { host: 'desk.example', 'x-forwarded-proto': 'https' } };
  assert.equal(originAllowed(request, 'https://desk.example'), true);
  assert.equal(originAllowed(request, 'http://desk.example'), false);
});

test('preflight autorizado termina em 204 sem consumir a rota', () => {
  resetRateLimits();
  const response = responseMock();
  const request = { method: 'OPTIONS', headers: { host: 'desk.example', origin: 'https://desk.example' } };
  assert.equal(applyApiPolicy(request, response), false);
  assert.equal(response.statusCode, 204);
  assert.equal(response.ended, true);
  assert.equal(response.headers['Cache-Control'], 'private, no-store, max-age=0');
});

test('resposta GET de erro continua no-store mesmo quando a rota pediu cache publico', () => {
  resetRateLimits();
  const response = responseMock();
  const request = { method: 'GET', headers: { host: 'desk.example' }, socket: { remoteAddress: '5.6.7.8' } };
  assert.equal(applyApiPolicy(request, response, { cacheControl: 'public, s-maxage=600' }), true);
  response.status(503).json({ error: 'upstream' });
  assert.equal(response.headers['Cache-Control'], 'private, no-store, max-age=0');
});

test('limiter mantem cardinalidade de IPs limitada sob chaves adversariais', () => {
  resetRateLimits();
  for (let index = 0; index < 10_025; index += 1) {
    const request = { method: 'GET', headers: { host: 'desk.example', 'x-forwarded-for': '198.51.' + Math.floor(index / 256) + '.' + (index % 256) } };
    assert.equal(applyApiPolicy(request, responseMock()), true);
  }
  assert.equal(rateLimitBucketCount(), 10_000);
  resetRateLimits();
});

test('politica de API responde tambem em adaptador Node sem status/json', () => {
  resetRateLimits();
  const response = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[name] = value; },
    end(payload) { this.body = payload || ''; },
  };
  const allowed = applyApiPolicy({ method: 'GET', headers: { host: 'desk.example', origin: 'https://evil.example' } }, response);
  assert.equal(allowed, false);
  assert.equal(response.statusCode, 403);
  assert.equal(response.headers['Content-Type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(response.body), { error: 'Cross-origin request not allowed' });
});

test('limiter distribuido governa instancias e publica escopo real nos headers', async () => {
  resetRateLimits();
  const request = { method: 'GET', headers: { host: 'desk.example', 'x-forwarded-for': '203.0.113.10' } };
  const allowed = responseMock();
  const limiter = { limit: async (key) => ({ success: true, limit: 120, remaining: 17, reset: Date.now() + 60_000, key }) };
  assert.equal(await applyApiPolicyAsync(request, allowed, { distributedLimiter: limiter }), true);
  assert.equal(allowed.headers['X-RateLimit-Scope'], 'distributed');
  assert.equal(allowed.headers['X-RateLimit-Remaining'], '17');

  const denied = responseMock();
  const denyingLimiter = { limit: async () => ({ success: false, limit: 120, remaining: 0, reset: Date.now() + 30_000 }) };
  assert.equal(await applyApiPolicyAsync(request, denied, { distributedLimiter: denyingLimiter }), false);
  assert.equal(denied.statusCode, 429);
  assert.deepEqual(denied.body, { error: 'Distributed rate limit exceeded' });
});

test('chave do limiter distribuido limita headers hostis sem perder a requisicao', async () => {
  resetRateLimits();
  let receivedKey = null;
  const request = { method: 'GET', headers: { host: 'desk.example', 'x-forwarded-for': 'x'.repeat(1000) + '\ncontrole' } };
  const limiter = { limit: async (key) => { receivedKey = key; return { success: true, limit: 120, remaining: 119, reset: Date.now() + 60_000 }; } };
  assert.equal(await applyApiPolicyAsync(request, responseMock(), { distributedLimiter: limiter }), true);
  assert.equal(receivedKey.length, 128);
  assert.equal(/[\x00-\x20\x7f]/.test(receivedKey), false);
});

test('pane Redis degrada explicitamente para limite local ja consumido', async () => {
  resetRateLimits();
  const response = responseMock();
  const request = { method: 'GET', headers: { host: 'desk.example', 'x-forwarded-for': '203.0.113.20' } };
  const failedLimiter = { limit: async () => { throw new Error('redis offline'); } };
  assert.equal(await applyApiPolicyAsync(request, response, { distributedLimiter: failedLimiter }), true);
  assert.equal(response.headers['X-RateLimit-Scope'], 'instance-fallback');
  assert.equal(response.headers['X-RateLimit-Remaining'], '119');
});

test('limiter distribuido troca de cliente quando a configuracao Redis gira', () => {
  const previous = {
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN
  };
  try {
    process.env.UPSTASH_REDIS_REST_URL = 'https://redis-a.example';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'a'.repeat(32);
    resetRateLimits();
    resetRedisForTests();
    const first = getDistributedLimiter(120);

    process.env.UPSTASH_REDIS_REST_URL = 'https://redis-b.example';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'b'.repeat(32);
    resetRedisForTests();
    const second = getDistributedLimiter(120);
    assert.notEqual(second, first);
  } finally {
    if (previous.url === undefined) delete process.env.UPSTASH_REDIS_REST_URL;
    else process.env.UPSTASH_REDIS_REST_URL = previous.url;
    if (previous.token === undefined) delete process.env.UPSTASH_REDIS_REST_TOKEN;
    else process.env.UPSTASH_REDIS_REST_TOKEN = previous.token;
    resetRateLimits();
    resetRedisForTests();
  }
});
