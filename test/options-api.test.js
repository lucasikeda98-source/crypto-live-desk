'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/options');

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

test('deadline de options limita as duas etapas ao mesmo orcamento', () => {
  assert.equal(handler.remainingTimeout(Date.now() + 40_000), 18_000);
  assert.ok(handler.remainingTimeout(Date.now() + 500) <= 500);
  assert.equal(handler.remainingTimeout(Date.now() - 1), 1);
});

test('options rejeita currency invalida sem consultar upstream', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('nao deveria consultar'); };
  try {
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/options?currency=DOGE' }, response);
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body.allowed, ['BTC', 'ETH', 'SOL']);
    assert.equal(response.headers['Access-Control-Allow-Origin'], undefined);
    assert.equal(response.headers.Vary, 'Origin');
  } finally { global.fetch = originalFetch; }
});

test('options rejeita metodo e falha total permanece no-store', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('Deribit indisponivel'); };
  try {
    const method = responseMock();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.49' }, url: '/api/options' }, method);
    assert.equal(method.statusCode, 405);
    assert.equal(method.headers.Allow, 'GET');
    assert.equal(calls, 0);

    const failed = responseMock();
    await handler({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.50' }, url: '/api/options?currency=BTC' }, failed);
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.body.error, 'internal error', 'erro arbitrario do runtime nao cruza a API publica');
    assert.equal(failed.headers['Cache-Control'], 'private, no-store, max-age=0');
  } finally { global.fetch = originalFetch; }
});

test('options preserva summary quando DVOL e um book falham e declara degradacao', async () => {
  const originalFetch = global.fetch;
  const observedAt = Date.now() - 1000;
  const rows = [
    { instrument_name: 'BTC-31DEC27-100000-C', creation_timestamp: observedAt, open_interest: 10, volume_usd: 1000, mark_iv: 50, underlying_price: 100000 },
    { instrument_name: 'BTC-31DEC27-100000-P', creation_timestamp: observedAt, open_interest: 8, volume_usd: 800, mark_iv: 52, underlying_price: 100000 },
  ];
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('get_book_summary')) return { ok: true, json: async () => ({ result: rows }) };
    if (value.includes('get_volatility_index_data')) return { ok: false, status: 503, json: async () => ({}) };
    if (value.includes('instrument_name=BTC-31DEC27-100000-C')) return { ok: true, json: async () => ({ result: { mark_iv: 51, greeks: { delta: 0.5 } } }) };
    if (value.includes('instrument_name=BTC-31DEC27-100000-P')) return { ok: false, status: 502, json: async () => ({}) };
    throw new Error('URL inesperada ' + value);
  };
  try {
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/options?currency=BTC' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.dataStatus, 'partial');
    assert.match(response.body.errors.dvol, /HTTP 503/);
    assert.match(response.body.errors.putBook, /HTTP 502/);
    assert.equal(response.body.market.instruments, 2);
    assert.equal(response.body.observedAt, observedAt);
    assert.equal(response.body.observedAtProvenance, 'deribit-summary-creation_timestamp');
    assert.equal(response.body.nearest.call.greeks.delta, 0.5);
    assert.equal(response.body.nearest.put, null);
  } finally { global.fetch = originalFetch; }
});

test('parser SOL aceita strike decimal codificado com d', () => {
  const row = handler.parseInstrument({ instrument_name: 'SOL_USDC-31DEC27-5d9-C' });
  assert.equal(row.strike, 5.9);
});

test('parser de options rejeita data normalizada, strike nao positivo e tipo desconhecido', () => {
  assert.equal(handler.parseInstrument({ instrument_name: 'BTC-32JAN27-100000-C' }), null);
  assert.equal(handler.parseInstrument({ instrument_name: 'BTC-31DEC27-0-C' }), null);
  assert.equal(handler.parseInstrument({ instrument_name: 'BTC-31DEC27-100000-X' }), null);
});

test('agregados de options nao deixam overflow numerico vazar para o JSON', () => {
  assert.equal(handler.sumNonNegative([{ value: 1e308 }, { value: 1e308 }], (row) => row.value), null);
  assert.equal(handler.maxPain([
    { strike: 1, optionType: 'C', open_interest: 1e308 },
    { strike: 100, optionType: 'P', open_interest: 1e308 },
  ]), null);
  assert.equal(handler.weightedAverage([
    { iv: 50, oi: 1e308 },
    { iv: 60, oi: 1e308 },
  ], (row) => row.iv, (row) => row.oi), 55);
});

test('DVOL rejeita ponto futuro e deduplica timestamp mantendo a ultima leitura valida', () => {
  const asOf = 1_800_000_000_000;
  assert.deepEqual(handler.normalizeDvolRows([
    [1_700_000_000_000, 0, 0, 0, 20],
    [1_700_000_000_000, 0, 0, 0, 25],
    [asOf + 120_000, 0, 0, 0, 99]
  ], asOf), [{ timestamp: 1_700_000_000_000, close: 25 }]);
});

test('options ignora agregados negativos e ordena DVOL pelo timestamp', async () => {
  const originalFetch = global.fetch;
  const observedAt = Date.now() - 1000;
  const rows = [
    { instrument_name: 'BTC-31DEC27-100000-C', creation_timestamp: observedAt, open_interest: 10, volume_usd: 1000, mark_iv: 50, underlying_price: 100000 },
    { instrument_name: 'BTC-31DEC27-100000-P', creation_timestamp: observedAt, open_interest: -8, volume_usd: -800, mark_iv: -52, underlying_price: 100000 },
  ];
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('get_book_summary')) return { ok: true, json: async () => ({ result: rows }) };
    if (value.includes('get_volatility_index_data')) return { ok: true, json: async () => ({ result: { data: [[2000, 0, 0, 0, 40], [1000, 0, 0, 0, 20], [3000, 0, 0, 0, null]] } }) };
    if (value.includes('get_order_book')) return { ok: true, json: async () => ({ result: { mark_iv: value.includes('-C') ? 51 : -10 } }) };
    throw new Error('URL inesperada ' + value);
  };
  try {
    const response = responseMock();
    await handler({ method: 'GET', url: '/api/options?currency=BTC' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.market.callOi, 10);
    assert.equal(response.body.market.putOi, 0);
    assert.equal(response.body.market.putVolumeUsd, 0);
    assert.equal(response.body.nearest.atmIv, 51, 'IV negativa do book put nao entra na media ATM');
    assert.equal(response.body.dvol.latest, 40);
    assert.equal(response.body.dvol.change7d, 100);
    assert.equal(response.body.dvol.points, 2);
  } finally {
    global.fetch = originalFetch;
  }
});
