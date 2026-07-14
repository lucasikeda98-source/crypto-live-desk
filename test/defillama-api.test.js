'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/defillama');

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return payload; },
  };
}

test('proxy DeFiLlama usa TVL estrito, ordena o universo e preserva protocolos fixados', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => [
      { name: 'Menor', slug: 'menor', tvl: '1500000', extra: 'remover' },
      { name: 'Maior', slug: 'maior', tvl: 9000000 },
      { name: 'Nulo', slug: 'nulo', tvl: null },
      { name: 'Vazio', slug: 'vazio', tvl: '' },
      { name: 'Chainlink', slug: 'chainlink', tvl: 0, symbol: 'LINK' },
      { name: 'Aave', slug: 'aave', tvl: 'nao-numerico' },
      { name: 'Aave duplicado', slug: 'aave', tvl: 0 },
    ],
  });
  try {
    const payload = await handler.loadProtocols();
    assert.deepEqual(payload.protocols.map((row) => row.slug), ['maior', 'menor', 'chainlink', 'aave']);
    assert.equal(payload.protocols.some((row) => row.slug === 'nulo' || row.slug === 'vazio'), false);
    assert.equal(Object.hasOwn(payload.protocols[0], 'extra'), false);
    assert.equal(payload.count, 4);
    assert.equal(payload.observedAtProvenance, 'server-acquired-live-snapshot');
  } finally {
    global.fetch = originalFetch;
  }
});

test('deteccao de protocolo fixado normaliza nome, slug, simbolo e gecko id', () => {
  assert.equal(handler.isPinned({ name: 'Chain Link', slug: '', symbol: '', gecko_id: '' }), true);
  assert.equal(handler.isPinned({ name: 'Outro', slug: 'outro', symbol: 'XYZ' }), false);
});

test('proxy DeFiLlama coalesce atualizacoes frias concorrentes', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { ok: true, json: async () => [{ name: 'Aave', slug: 'aave', tvl: 2_000_000 }] };
  };
  try {
    delete require.cache[require.resolve('../api/defillama')];
    const freshHandler = require('../api/defillama');
    const first = responseMock();
    const second = responseMock();
    await Promise.all([
      freshHandler({ method: 'GET', headers: {}, url: '/api/defillama' }, first),
      freshHandler({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.41' }, url: '/api/defillama' }, second),
    ]);
    assert.equal(calls, 1);
    assert.equal(first.statusCode, 200);
    assert.deepEqual(second.body, first.body);
    const cacheHit = responseMock();
    await freshHandler({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.43' }, url: '/api/defillama' }, cacheHit);
    assert.equal(calls, 1, 'cache fresco nao reabre o upstream');
    assert.deepEqual(cacheHit.body, first.body);
  } finally {
    global.fetch = originalFetch;
  }
});

test('proxy DeFiLlama falha fechado sem cache e rejeita metodo', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('DeFiLlama indisponivel'); };
  try {
    delete require.cache[require.resolve('../api/defillama')];
    const freshHandler = require('../api/defillama');
    const failed = responseMock();
    await freshHandler({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.44' }, url: '/api/defillama' }, failed);
    assert.equal(failed.statusCode, 503);
    assert.match(failed.body.error, /indisponivel/);

    const method = responseMock();
    await freshHandler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.45' }, url: '/api/defillama' }, method);
    assert.equal(method.statusCode, 405);
    assert.equal(method.headers.Allow, 'GET');
  } finally {
    global.fetch = originalFetch;
  }
});

test('proxy DeFiLlama aplica backoff ao servir cache stale durante indisponibilidade', async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let now = 1_000_000;
  let calls = 0;
  Date.now = () => now;
  global.fetch = async () => {
    calls += 1;
    if (calls === 1) return { ok: true, json: async () => [{ name: 'Aave', slug: 'aave', tvl: 2_000_000 }] };
    throw new Error('falha temporaria');
  };
  try {
    delete require.cache[require.resolve('../api/defillama')];
    const freshHandler = require('../api/defillama');
    await freshHandler({ method: 'GET', headers: {}, url: '/api/defillama' }, responseMock());
    now += 120_001;
    const stale = responseMock();
    await freshHandler({ method: 'GET', headers: {}, url: '/api/defillama' }, stale);
    assert.equal(stale.body.stale, true);
    assert.match(stale.body.errors.refresh, /falha temporaria/);
    await freshHandler({ method: 'GET', headers: {}, url: '/api/defillama' }, responseMock());
    assert.equal(calls, 2, 'backoff impede nova chamada imediata ao upstream');
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
  }
});
