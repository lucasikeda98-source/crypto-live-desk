'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/tradfi');

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

function yahooPayload() {
  return {
    chart: {
      result: [{
        timestamp: [1_700_000_000, 1_700_086_400, 1_700_172_800],
        indicators: {
          quote: [{
            open: [99, 109, null],
            high: [101, 111, null],
            low: [98, 108, null],
            close: [100, 110, null],
            volume: [1000, 1200, null]
          }]
        }
      }]
    }
  };
}

test('rota TradFi preserva a ultima cotacao valida quando Yahoo termina com null', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => yahooPayload() });
  try {
    const response = responseMock();
    await handler({ method: 'GET' }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.assets.length, 10);
    assert.equal(response.body.errors.length, 0);
    assert.equal(response.body.assets.every((asset) => asset.close === 110), true);
    assert.equal(response.body.assets.every((asset) => asset.change1d === 10), true);
    assert.equal(response.body.observedAt, 1_700_086_400_000);
  } finally {
    global.fetch = originalFetch;
  }
});

test('rota TradFi preserva resultados validos quando uma fonte falha', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('/COIN?')) throw new Error('falha simulada');
    return { ok: true, json: async () => yahooPayload() };
  };
  try {
    const response = responseMock();
    await handler({ method: 'GET' }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.assets.length, 9);
    assert.deepEqual(response.body.errors.map((error) => error.symbol), ['COIN']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('rota TradFi retorna 503 quando nenhuma cotacao e valida', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('indisponivel'); };
  try {
    const response = responseMock();
    await handler({ method: 'GET' }, response);

    assert.equal(response.statusCode, 503);
    assert.equal(response.body.assets.length, 0);
    assert.equal(response.body.errors.length, 10);
    assert.equal(response.body.observedAt, null);
  } finally {
    global.fetch = originalFetch;
  }
});

test('rota TradFi rejeita metodos diferentes de GET', async () => {
  const response = responseMock();
  await handler({ method: 'POST' }, response);

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, 'GET');
});
