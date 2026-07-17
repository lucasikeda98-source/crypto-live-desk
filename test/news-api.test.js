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

test('parser RSS rejeita data futura e limita campos controlados pelo upstream', () => {
  const asOf = Date.parse('2026-07-10T12:00:00Z');
  const oversized = 'x'.repeat(3000);
  const rows = handler.parseRss('<rss><channel><item>'
    + '<title>' + oversized + '</title>'
    + '<description>' + oversized + '</description>'
    + '<link>https://example.com/item</link>'
    + '<pubDate>Sun, 12 Jul 2026 00:00:00 GMT</pubDate>'
    + '</item></channel></rss>', { name: 'Teste', type: 'crypto' }, asOf);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].published, null);
  assert.equal(rows[0].title.length, 300);
  assert.equal(rows[0].body.length, 2000);
});

test('rota de noticias rejeita metodo e expõe falha total sem cache publico', async () => {
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error('RSS indisponivel'); };
  try {
    const method = responseMock();
    await handler({ method: 'POST', headers: { 'x-forwarded-for': '203.0.113.47' }, url: '/api/news' }, method);
    assert.equal(method.statusCode, 405);
    assert.equal(method.headers.Allow, 'GET');
    assert.equal(calls, 0);

    const failed = responseMock();
    await handler({ method: 'GET', headers: { 'x-forwarded-for': '203.0.113.48' }, url: '/api/news' }, failed);
    assert.equal(failed.statusCode, 503);
    assert.equal(failed.body.items.length, 0);
    assert.equal(failed.body.sources.every((source) => source.ok === false && source.error === 'internal error'), true);
    assert.equal(failed.headers['Cache-Control'], 'private, no-store, max-age=0');
  } finally {
    global.fetch = originalFetch;
  }
});
