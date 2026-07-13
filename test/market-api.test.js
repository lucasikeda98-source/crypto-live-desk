'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function responseMock() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return payload; }
  };
}

test('deadline da rota de mercado nunca ultrapassa o orcamento absoluto', () => {
  delete require.cache[require.resolve('../api/market')];
  const handler = require('../api/market');
  assert.equal(handler.remainingTimeout(Date.now() + 40_000), 18_000);
  assert.ok(handler.remainingTimeout(Date.now() + 500) <= 500);
  assert.equal(handler.remainingTimeout(Date.now() - 1), 1);
});

test('mercados CoinGecko aceitam somente IDs conhecidos e deduplicados', () => {
  delete require.cache[require.resolve('../api/market')];
  const handler = require('../api/market');
  const rows = handler.normalizeCoinGeckoMarkets([
    { id: 'bitcoin', current_price: 100 },
    { id: 'bitcoin', current_price: 999 },
    { id: 'desconhecido', current_price: 10 },
    null,
  ]);
  assert.deepEqual(rows, [{ id: 'bitcoin', current_price: 100, observedAt: null }]);
});

test('mercados CoinGecko preservam somente timestamps de observacao plausiveis', () => {
  delete require.cache[require.resolve('../api/market')];
  const handler = require('../api/market');
  const rows = handler.normalizeCoinGeckoMarkets([
    { id: 'bitcoin', current_price: 100, last_updated: 1_000 },
    { id: 'ethereum', current_price: 50, last_updated: 2_000 },
  ], 1_000_000);
  assert.equal(rows[0].observedAt, 1_000_000);
  assert.equal(rows[1].observedAt, null, 'timestamp futuro nao pode tornar o dataset artificialmente fresco');
});

test('rota de mercado preserva observedAt e declara fallback stale', async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('/global')) return { ok: true, json: async () => ({ data: { market_cap_change_percentage_24h_usd: 1, updated_at: 1_000 } }) };
    if (value.includes('/coins/markets')) return { ok: true, json: async () => [{ id: 'bitcoin', current_price: 100, last_updated: 1_000 }] };
    if (value.includes('/search/trending')) return { ok: true, json: async () => ({ coins: [] }) };
    throw new Error('URL inesperada');
  };

  try {
    delete require.cache[require.resolve('../api/market')];
    const handler = require('../api/market');
    const first = responseMock();
    await handler({ method: 'GET' }, first);
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.stale, false);
    assert.equal(first.body.fetchedAt, now);
    assert.equal(first.body.observedAt, now);
    assert.equal(first.body.observedAtProvenance, 'provider-timestamp');
    assert.equal(first.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(first.headers.Vary, 'Origin');

    const cacheHit = responseMock();
    await handler({ method: 'GET' }, cacheHit);
    assert.equal(cacheHit.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(cacheHit.headers.Vary, 'Origin');

    now += 120_001;
    let failureCalls = 0;
    global.fetch = async () => { failureCalls += 1; throw new Error('falha simulada'); };
    const fallback = responseMock();
    await handler({ method: 'GET' }, fallback);

    assert.equal(fallback.statusCode, 200);
    assert.equal(fallback.body.stale, true);
    assert.equal(fallback.body.fetchedAt, 1_000_000);
    assert.match(fallback.body.errors.refresh, /falha simulada/);
    assert.equal(fallback.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(fallback.headers.Vary, 'Origin');

    const backoff = responseMock();
    await handler({ method: 'GET' }, backoff);
    assert.equal(failureCalls, 4, 'tres fontes CoinGecko e o fallback falham uma vez; backoff evita nova onda imediata');
    assert.equal(backoff.body.stale, true);
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test('rota de mercado complementa resposta parcial sem descartar CoinGecko valido', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('/global')) return { ok: true, json: async () => ({ data: {} }) };
    if (value.includes('/coins/markets')) return { ok: true, json: async () => [{ id: 'bitcoin', current_price: 100 }] };
    if (value.includes('/search/trending')) return { ok: true, json: async () => ({ coins: [] }) };
    if (value.includes('coinpaprika')) return { ok: true, json: async () => [{ id: 'eth-ethereum', symbol: 'ETH', name: 'Ethereum', rank: 2, quotes: { USD: { price: 50 } } }] };
    throw new Error('URL inesperada ' + value);
  };
  try {
    delete require.cache[require.resolve('../api/market')];
    const handler = require('../api/market');
    const bundle = await handler.loadMarketBundle(Date.now() + 5000);
    assert.deepEqual(bundle.markets.map((row) => row.id), ['bitcoin', 'ethereum']);
    assert.match(bundle.source, /gap fill/);
    assert.ok(bundle.completeness > 0 && bundle.completeness < 1);
    assert.match(bundle.errors.markets, /Cobertura parcial/);
  } finally { global.fetch = originalFetch; }
});

test('rota de mercado coalesce atualizacoes frias concorrentes', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async (url) => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const value = String(url);
    if (value.includes('/global')) return { ok: true, json: async () => ({ data: {} }) };
    if (value.includes('/coins/markets')) {
      const ids = Object.keys({ bitcoin: 1, ethereum: 1, binancecoin: 1, solana: 1, ripple: 1, dogecoin: 1, cardano: 1, 'avalanche-2': 1, chainlink: 1, tron: 1, polkadot: 1, litecoin: 1, 'bitcoin-cash': 1, uniswap: 1, near: 1, cosmos: 1, filecoin: 1, aave: 1, sui: 1, 'hedera-hashgraph': 1, stellar: 1, 'internet-computer': 1, arbitrum: 1, optimism: 1 });
      return { ok: true, json: async () => ids.map((id) => ({ id, current_price: 1 })) };
    }
    if (value.includes('/search/trending')) return { ok: true, json: async () => ({ coins: [] }) };
    throw new Error('URL inesperada ' + value);
  };
  try {
    delete require.cache[require.resolve('../api/market')];
    const handler = require('../api/market');
    const first = responseMock();
    const second = responseMock();
    await Promise.all([
      handler({ method: 'GET', headers: {}, url: '/api/market' }, first),
      handler({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.42' }, url: '/api/market' }, second),
    ]);
    assert.equal(calls, 3, 'global, markets e trending sao chamados uma vez cada');
    assert.equal(first.statusCode, 200);
    assert.deepEqual(second.body, first.body);
  } finally {
    global.fetch = originalFetch;
  }
});

test('rota de mercado rejeita metodo sem consultar upstream', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('nao deveria chamar'); };
  try {
    delete require.cache[require.resolve('../api/market')];
    const handler = require('../api/market');
    const response = responseMock();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.46' }, url: '/api/market' }, response);
    assert.equal(response.statusCode, 405);
    assert.equal(response.headers.Allow, 'GET');
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});
