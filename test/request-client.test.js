'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequestClient, requestPriority } = require('../lib/request-client');

function setup(fetchImpl, overrides = {}) {
  const health = [];
  const budgetCalls = [];
  const throttle = {
    blocked: false,
    penalties: [],
    successes: [],
    isBlocked() { return this.blocked; },
    retryAt() { return Date.now() + 1000; },
    penalize(source, retryAfter) { this.penalties.push({ source, retryAfter }); return 2000; },
    succeed(source) { this.successes.push(source); }
  };
  const budget = overrides.budget || {
    run(job, metadata) { budgetCalls.push(metadata); return job(); }
  };
  const client = createRequestClient({
    budget,
    throttle,
    health: (...args) => health.push(args),
    classifyHttpError: (status) => status === 429 ? 'rateLimit' : status >= 500 ? 'server' : 'client',
    parseRetryAfter: () => 3000,
    fetchImpl,
    ...overrides.options
  });
  return { client, health, budgetCalls, throttle };
}

function response(status, payload, retryAfter) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get(name) { return name === 'Retry-After' ? retryAfter || null : null; } },
    async json() { return payload; }
  };
}

test('prioriza APIs e Binance e rebaixa historico/MTF', () => {
  assert.equal(requestPriority('/api/options', 'Deribit'), 2);
  assert.equal(requestPriority('https://example.test', 'Binance spot'), 2);
  assert.equal(requestPriority('https://example.test', 'Historico diario'), -1);
  assert.equal(requestPriority('https://example.test', 'RSS'), 0);
});

test('executa fetch pelo budget, forca no-store e registra saude', async () => {
  let receivedOptions;
  const { client, health, budgetCalls, throttle } = setup(async (_url, options) => {
    receivedOptions = options;
    return response(200, { ok: true });
  });
  assert.deepEqual(await client.fetchJSON('/api/test', 100, 'Fonte', { headers: { Accept: 'application/json' } }), { ok: true });
  assert.equal(receivedOptions.cache, 'no-store');
  assert.equal(receivedOptions.headers.Accept, 'application/json');
  assert.deepEqual(budgetCalls, [{ source: 'Fonte', priority: 2 }]);
  assert.deepEqual(throttle.successes, ['Fonte']);
  assert.deepEqual(health.at(-1), ['Fonte', true, 'online']);
});

test('429 aplica cooldown e nao espalha tentativa para host alternativo', async () => {
  const calls = [];
  const { client, throttle } = setup(async (url) => {
    calls.push(url);
    return response(429, {}, '3');
  });
  await assert.rejects(client.fetchFromBases(['https://a.test', 'https://b.test'], '/x', 100, 'Binance spot'), (error) => error.category === 'rateLimit');
  assert.deepEqual(calls, ['https://a.test/x']);
  assert.equal(throttle.penalties.length, 1);
});

test('cooldown ativo bloqueia antes do fetch e preserva a classificacao de rate limit', async () => {
  let called = false;
  const { client, throttle, health } = setup(async () => { called = true; return response(200, {}); });
  throttle.blocked = true;
  await assert.rejects(client.fetchJSON('/api/test', 100, 'Fonte'), (error) => error.category === 'rateLimit' && error.throttled === true);
  assert.equal(called, false);
  assert.match(health.at(-1)[2], /cooldown de rate limit/);
});

test('erro comum usa o segundo host e identifica o fallback', async () => {
  const calls = [];
  const { client, health } = setup(async (url) => {
    calls.push(url);
    return url.startsWith('https://a.test') ? response(503, {}) : response(200, { host: 'b' });
  });
  assert.deepEqual(await client.fetchFromBases(['https://a.test', 'https://b.test'], '/x', 100, 'Fonte'), { host: 'b' });
  assert.equal(calls.length, 2);
  assert.equal(health.some((entry) => entry[2] === 'fallback https://b.test'), true);
});

test('overflow do budget e reportado separadamente', async () => {
  const budgetError = Object.assign(new Error('queue full'), { category: 'budget' });
  const { client, health } = setup(async () => response(200, {}), { budget: { run() { throw budgetError; } } });
  await assert.rejects(client.fetchJSON('/x', 100, 'Fonte'), budgetError);
  assert.deepEqual(health.at(-1), ['Orcamento global', false, 'fila cheia; chamada descartada']);
});
