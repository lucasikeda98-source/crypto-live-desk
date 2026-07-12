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

test('rota de mercado preserva observedAt e declara fallback stale', async () => {
  const originalFetch = global.fetch;
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  global.fetch = async (url) => {
    const value = String(url);
    if (value.includes('/global')) return { ok: true, json: async () => ({ data: { market_cap_change_percentage_24h_usd: 1 } }) };
    if (value.includes('/coins/markets')) return { ok: true, json: async () => [{ id: 'bitcoin', current_price: 100 }] };
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

    now += 120_001;
    global.fetch = async () => { throw new Error('falha simulada'); };
    const fallback = responseMock();
    await handler({ method: 'GET' }, fallback);

    assert.equal(fallback.statusCode, 200);
    assert.equal(fallback.body.stale, true);
    assert.equal(fallback.body.fetchedAt, 1_000_000);
    assert.match(fallback.body.errors.refresh, /falha simulada/);
  } finally {
    global.fetch = originalFetch;
    Date.now = originalNow;
  }
});
