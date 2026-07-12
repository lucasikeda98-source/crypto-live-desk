'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/news');

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

test('noticia sem data permanece sem observedAt em vez de parecer nova', async () => {
  const originalFetch = global.fetch;
  const xml = '<rss><channel><item><title>Evento sem data</title><description>Contexto</description><link>https://example.com/item</link></item></channel></rss>';
  global.fetch = async () => ({ ok: true, text: async () => xml });
  try {
    const response = responseMock();
    await handler({ method: 'GET' }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.items.length, 1);
    assert.equal(response.body.items[0].published, null);
  } finally {
    global.fetch = originalFetch;
  }
});
