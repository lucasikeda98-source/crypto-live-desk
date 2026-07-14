'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/market-microstructure');

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

test('CVD de aggTrades respeita o lado agressor da Binance', () => {
  const flow = handler.summarizeOrderFlow([
    { p: '100', q: '2', T: 1000, m: false },
    { p: '100', q: '1', T: 2000, m: true },
    { p: 'invalido', q: '9', T: 3000, m: false },
  ]);
  assert.equal(flow.trades, 2);
  assert.equal(flow.buyTakerUsd, 200);
  assert.equal(flow.sellTakerUsd, 100);
  assert.equal(flow.cvdUsd, 100);
  assert.ok(Math.abs(flow.imbalancePct - 33.333333) < 0.001);
  assert.equal(flow.firstTradeAt, 1000);
  assert.equal(flow.lastTradeAt, 2000);
  assert.equal(flow.observedAt, 2000);
  assert.equal(flow.dataStatus, 'stale');
  const strict = handler.summarizeOrderFlow([{ p: '100', q: null, T: 3000, m: false }, { p: '100', q: '0', T: 4000, m: false }]);
  assert.equal(strict.trades, 0, 'null e quantidade zero nao viram trades validos');
  const hostile = handler.summarizeOrderFlow([
    { p: '1e308', q: '1e308', T: 1000, m: false },
    { p: '100', q: '1', T: Date.now() + 60_001, m: false },
    { p: '100', q: '1', T: 1000 },
  ]);
  assert.equal(hostile.trades, 0, 'overflow, futuro e lado agressor ausente sao rejeitados');

  const cumulativeOverflow = handler.summarizeOrderFlow([
    { p: '1e308', q: '1', T: 900, m: false },
    { p: '1e308', q: '1', T: 1000, m: false },
  ], 1000);
  assert.equal(cumulativeOverflow.trades, 2);
  assert.equal(cumulativeOverflow.numericOverflow, true);
  assert.equal(cumulativeOverflow.cvdUsd, null);
  assert.equal(cumulativeOverflow.dataStatus, 'partial');
});

test('dispersao cross-venue usa mediana e premium Coinbase vs Binance', () => {
  const summary = handler.summarizeVenues([
    { name: 'Binance', price: 100 },
    { name: 'Coinbase', price: 101 },
    { name: 'Bybit', price: 99 },
  ]);
  assert.equal(summary.medianPrice, 100);
  assert.equal(summary.dispersionBps, 200);
  assert.equal(summary.coinbasePremiumBps, 100);
  assert.equal(summary.venues.find((row) => row.name === 'Coinbase').premiumBps, 100);
});

test('rota de microestrutura normaliza fontes parciais sem fabricar cobertura', async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  const now = 1_783_924_806_000;
  Date.now = () => now;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('bookTicker')) return { ok: true, json: async () => ({ bidPrice: '99', askPrice: '101' }) };
    if (value.includes('aggTrades')) return { ok: true, json: async () => [{ p: '100', q: '1', T: now - 1000, m: false }] };
    if (value.includes('coinbase')) return { ok: false, status: 404, json: async () => ({}) };
    if (value.includes('bybit')) return { ok: true, json: async () => ({ retCode: 0, time: now - 900, result: { list: [{ lastPrice: '100.5', bid1Price: '100.4', ask1Price: '100.6' }] } }) };
    if (value.includes('okx')) return { ok: true, json: async () => ({ code: '0', data: [{ last: '99.5', bidPx: '99.4', askPx: '99.6', ts: String(now - 800) }] }) };
    throw new Error('URL inesperada');
  };
  try {
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/market-microstructure?symbol=BTCUSDT' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.venues.length, 3);
    assert.equal(response.body.orderFlow.cvdUsd, 100);
    assert.equal(response.body.orderFlow.dataStatus, 'fresh');
    assert.equal(response.body.orderFlow.observedAt, now - 1000);
    assert.equal(response.body.venuesObservedAt, now);
    assert.match(response.body.errors.coinbase, /HTTP 404/);
    assert.equal(response.body.coinbasePremiumBps, null);
    assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(response.headers.Vary, 'Origin');
    assert.equal(response.body.venues.every((venue) => venue.priceType === 'midpoint'), true);
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test('Coinbase USD e convertido por USDT-USD e venues fora de 30s sao excluidos', async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  const now = 1_783_924_806_000;
  Date.now = () => now;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('bookTicker')) return { ok: true, json: async () => ({ bidPrice: '99', askPrice: '101' }) };
    if (value.includes('aggTrades')) return { ok: true, json: async () => [] };
    if (value.includes('USDT-USD')) return { ok: true, json: async () => ({ price: '1.01', bid: '1.01', ask: '1.01', time: new Date(now - 100).toISOString() }) };
    if (value.includes('BTC-USD')) return { ok: true, json: async () => ({ price: '101', bid: '100.9', ask: '101.1', time: new Date(now - 100).toISOString() }) };
    if (value.includes('bybit') || value.includes('okx')) throw new Error('indisponivel');
    throw new Error('URL inesperada ' + value);
  };
  try {
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/market-microstructure?symbol=BTCUSDT' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.usdPerUsdt, 1.01);
    assert.equal(response.body.venues.find((venue) => venue.name === 'Coinbase').quoteCurrency, 'USDT (convertido de USD)');
    assert.ok(Math.abs(response.body.coinbasePremiumBps) < 0.001);
    const aligned = handler.alignVenues([{ name: 'new', observedAt: 100000 }, { name: 'old', observedAt: 1000 }], 30000);
    assert.deepEqual(aligned.venues.map((venue) => venue.name), ['new']);
    assert.deepEqual(aligned.dropped, ['old']);
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
  }
});

test('timestamp futuro ou book cruzado nao entram como venue valido', () => {
  const fetchedAt = 1_783_924_806_000;
  assert.equal(handler.venueObservedAt(fetchedAt + 60_001, fetchedAt), null);
  assert.equal(handler.venueObservedAt(fetchedAt + 60_000, fetchedAt), fetchedAt + 60_000);
  const crossed = handler.normalizeVenue('X', '100', '102', '101', fetchedAt, 'USDT');
  assert.equal(crossed.price, 100);
  assert.equal(crossed.priceType, 'last');
  assert.equal(crossed.bid, null);
  assert.equal(crossed.ask, null);
});

test('rota de microestrutura rejeita simbolo invalido e metodo nao GET', async () => {
  const invalid = responseMock();
  await handler({ method: 'GET', url: '/api/market-microstructure?symbol=../BTC' }, invalid);
  assert.equal(invalid.statusCode, 400);
  const unknown = responseMock();
  await handler({ method: 'GET', url: '/api/market-microstructure?symbol=ZZZUSDT' }, unknown);
  assert.equal(unknown.statusCode, 400);

  const method = responseMock();
  await handler({ method: 'POST', url: '/' }, method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.Allow, 'GET');
  assert.equal(method.headers['Access-Control-Allow-Origin'], undefined);
  assert.equal(method.headers.Vary, 'Origin');
});

test('erros semanticos 200 da Bybit e OKX nao viram venues validos', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('bookTicker') || value.includes('aggTrades') || value.includes('coinbase')) throw new Error('indisponivel');
    if (value.includes('bybit')) return { ok: true, json: async () => ({ retCode: 10001, retMsg: 'bad request', result: { list: [{ lastPrice: '100' }] } }) };
    if (value.includes('okx')) return { ok: true, json: async () => ({ code: '51000', msg: 'bad request', data: [{ last: '100' }] }) };
    throw new Error('URL inesperada');
  };
  try {
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/market-microstructure?symbol=BTCUSDT' }, response);
    assert.equal(response.statusCode, 503);
    assert.equal(response.body.venues.length, 0);
    assert.match(response.body.errors.bybit, /retCode 10001/);
    assert.match(response.body.errors.okx, /code 51000/);
    assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(response.headers.Vary, 'Origin');
  } finally {
    global.fetch = originalFetch;
  }
});

test('API-004: proveniencia por venue e rejeicao de staleness absoluta', () => {
  const fetchedAt = 1_783_924_806_000;
  const fetchVenue = handler.normalizeVenue('Binance', null, '100', '101', fetchedAt, 'USDT', 'fetch');
  assert.equal(fetchVenue.observedAtProvenance, 'fetch');
  const providerVenue = handler.normalizeVenue('OKX', null, '100', '101', fetchedAt - 500, 'USDT');
  assert.equal(providerVenue.observedAtProvenance, 'provider');
  const noTimestamp = handler.normalizeVenue('X', '100', null, null, null, 'USDT');
  assert.equal(noTimestamp.observedAtProvenance, 'missing');

  // Venues igualmente velhas tem skew ~0 entre si; sem limite absoluto passariam com preco antigo.
  const uniformlyOld = handler.alignVenues([
    { name: 'A', observedAt: fetchedAt - 120_000 },
    { name: 'B', observedAt: fetchedAt - 119_000 }
  ], 30000, fetchedAt, 60000);
  assert.deepEqual(uniformlyOld.venues, []);
  assert.deepEqual(uniformlyOld.stale.sort(), ['A', 'B']);

  const mixedAges = handler.alignVenues([
    { name: 'fresh', observedAt: fetchedAt - 1000 },
    { name: 'ancient', observedAt: fetchedAt - 90_000 }
  ], 30000, fetchedAt, 60000);
  assert.deepEqual(mixedAges.venues.map((venue) => venue.name), ['fresh']);
  assert.deepEqual(mixedAges.stale, ['ancient']);
  assert.deepEqual(mixedAges.dropped, []);

  // Sem referencia de relogio o comportamento antigo (so skew mutuo) permanece.
  const legacy = handler.alignVenues([{ name: 'new', observedAt: 100000 }, { name: 'old', observedAt: 1000 }], 30000);
  assert.deepEqual(legacy.venues.map((venue) => venue.name), ['new']);
  assert.deepEqual(legacy.stale, []);
});
