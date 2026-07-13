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
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('bookTicker')) return { ok: true, json: async () => ({ bidPrice: '99', askPrice: '101' }) };
    if (value.includes('aggTrades')) return { ok: true, json: async () => [{ p: '100', q: '1', T: 5000, m: false }] };
    if (value.includes('coinbase')) return { ok: false, status: 404, json: async () => ({}) };
    if (value.includes('bybit')) return { ok: true, json: async () => ({ time: 5100, result: { list: [{ lastPrice: '100.5', bid1Price: '100.4', ask1Price: '100.6' }] } }) };
    if (value.includes('okx')) return { ok: true, json: async () => ({ data: [{ last: '99.5', bidPx: '99.4', askPx: '99.6', ts: '5200' }] }) };
    throw new Error('URL inesperada');
  };
  try {
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/market-microstructure?symbol=BTCUSDT' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.venues.length, 3);
    assert.equal(response.body.orderFlow.cvdUsd, 100);
    assert.match(response.body.errors.coinbase, /HTTP 404/);
    assert.equal(response.body.coinbasePremiumBps, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('rota de microestrutura rejeita simbolo invalido e metodo nao GET', async () => {
  const invalid = responseMock();
  await handler({ method: 'GET', url: '/api/market-microstructure?symbol=../BTC' }, invalid);
  assert.equal(invalid.statusCode, 400);

  const method = responseMock();
  await handler({ method: 'POST', url: '/' }, method);
  assert.equal(method.statusCode, 405);
  assert.equal(method.headers.Allow, 'GET');
});
