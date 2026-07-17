'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/signals');
const { resetRateLimits } = require('../lib/api-guard');

class FakeRedis {
  constructor() { this.hashes = new Map(); this.sorted = new Map(); }
  async hget(key, field) { return this.hashes.get(key)?.get(field) ?? null; }
  async hset(key, values) { if (!this.hashes.has(key)) this.hashes.set(key, new Map()); Object.entries(values).forEach(([field, value]) => this.hashes.get(key).set(field, value)); }
  async hvals(key) { return Array.from(this.hashes.get(key)?.values() || []); }
  async hdel(key, field) { this.hashes.get(key)?.delete(field); }
  async expire() { return 1; }
  async del(key) { this.hashes.delete(key); }
  async zadd(key, entry) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(entry.member, entry.score); }
  async zrem(key, member) { this.sorted.get(key)?.delete(member); }
  async zrange(key, min, max, options) { return Array.from(this.sorted.get(key)?.entries() || []).filter(([, score]) => score >= min && score <= max).sort((a, b) => a[1] - b[1]).slice(options?.offset || 0, (options?.offset || 0) + (options?.count || 20)).map(([member]) => member); }
}

function responseMock() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; },
    end() { this.ended = true; }
  };
}

const namespace = 'S'.repeat(43);
const now = Date.now();
const record = {
  recordedAt: now,
  inputSnapshotId: 'snapshot:api',
  modelVersion: '1.0.0-test',
  rulesetHash: 'abcdef12',
  symbol: 'BTCUSDT', interval: '5m', signalCloseTime: now - 60_000,
  price: 60000, setupScore: 42, radarScore: 20, dataConfidence: 80,
  decision: 'Aguardar', outcome: null
};

test.beforeEach(() => resetRateLimits());

test('signals API informa capacidade sem erro de recurso e falha fechado ao tentar persistir', async () => {
  const probe = responseMock();
  await handler.handleRequest({ method: 'GET', headers: { 'x-journal-id': namespace } }, probe, null);
  assert.equal(probe.statusCode, 200);
  assert.deepEqual(probe.payload, { configured: false, records: [] });
  assert.equal(probe.headers['Cache-Control'], 'private, no-store, max-age=0');

  const mutation = responseMock();
  await handler.handleRequest({ method: 'POST', headers: { 'x-journal-id': namespace }, body: { records: [record] } }, mutation, null);
  assert.equal(mutation.statusCode, 503);
  assert.equal(mutation.payload.configured, false);
});

test('signals API valida namespace e corpo antes de escrever', async () => {
  const redis = new FakeRedis();
  const invalidNamespace = responseMock();
  await handler.handleRequest({ method: 'GET', headers: {} }, invalidNamespace, redis);
  assert.equal(invalidNamespace.statusCode, 400);

  const invalidBody = responseMock();
  await handler.handleRequest({ method: 'POST', headers: { 'x-journal-id': namespace }, body: { records: 'bad' } }, invalidBody, redis);
  assert.equal(invalidBody.statusCode, 400);
});

test('signals API comunica limite global sem expor detalhe interno', async () => {
  const redis = new FakeRedis();
  redis.eval = async () => '__DURABLE_SIGNAL_CAPACITY__';
  const response = responseMock();
  await handler.handleRequest({ method: 'POST', headers: { 'x-journal-id': namespace }, body: { records: [record] } }, response, redis);
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.error, 'Durable journal capacity reached; local records were preserved');
});

test('signals API aplica o limite de bytes tambem ao JSON ja interpretado pela plataforma', async () => {
  const response = responseMock();
  await handler.handleRequest({
    method: 'POST',
    headers: { 'x-journal-id': namespace },
    body: { records: [record], padding: 'x'.repeat(600 * 1024) }
  }, response, new FakeRedis());
  assert.equal(response.statusCode, 413);
  assert.equal(response.payload.error, 'Payload too large');
});

test('signals API aceita JSON textual e rejeita Buffer ou objeto ciclico invalidos', async () => {
  const redis = new FakeRedis();
  const textBody = responseMock();
  await handler.handleRequest({
    method: 'POST',
    headers: { 'x-journal-id': namespace },
    body: JSON.stringify({ records: [record] })
  }, textBody, redis);
  assert.equal(textBody.statusCode, 200);

  const invalidBuffer = responseMock();
  await handler.handleRequest({
    method: 'POST',
    headers: { 'x-journal-id': namespace },
    body: Buffer.from('{broken', 'utf8')
  }, invalidBuffer, redis);
  assert.equal(invalidBuffer.statusCode, 400);

  const cyclic = { records: [record] };
  cyclic.self = cyclic;
  const invalidObject = responseMock();
  await handler.handleRequest({ method: 'POST', headers: { 'x-journal-id': namespace }, body: cyclic }, invalidObject, redis);
  assert.equal(invalidObject.statusCode, 400);
});

test('leitor de corpo cobre vazio, string acima do teto e stream JSON invalido', async () => {
  assert.deepEqual(await handler.readJsonBody({ body: '' }), {});
  await assert.rejects(handler.readJsonBody({ body: 'x'.repeat(513 * 1024) }), (error) => error.statusCode === 413);
  await assert.rejects(handler.readJsonBody({
    async *[Symbol.asyncIterator]() { yield Buffer.from('{broken', 'utf8'); }
  }), (error) => error.statusCode === 400);
  assert.deepEqual(await handler.readJsonBody({
    async *[Symbol.asyncIterator]() { /* stream vazio */ }
  }), {});
});

test('leitor de corpo limita tambem o stream bruto antes do parse', async () => {
  const request = {
    async *[Symbol.asyncIterator]() {
      yield Buffer.alloc(300 * 1024, 120);
      yield Buffer.alloc(300 * 1024, 120);
    }
  };
  await assert.rejects(handler.readJsonBody(request), (error) => error.statusCode === 413);
});

test('signals API faz round-trip isolado e limpeza explicita', async () => {
  const redis = new FakeRedis();
  const post = responseMock();
  await handler.handleRequest({ method: 'POST', headers: { 'x-journal-id': namespace }, body: { records: [record] } }, post, redis);
  assert.equal(post.statusCode, 200);
  assert.equal(post.payload.records.length, 1);

  const get = responseMock();
  await handler.handleRequest({ method: 'GET', headers: { 'x-journal-id': namespace } }, get, redis);
  assert.equal(get.payload.records[0].inputSnapshotId, 'snapshot:api');

  const clear = responseMock();
  await handler.handleRequest({ method: 'DELETE', headers: { 'x-journal-id': namespace } }, clear, redis);
  assert.deepEqual(clear.payload.records, []);
  const after = responseMock();
  await handler.handleRequest({ method: 'GET', headers: { 'x-journal-id': namespace } }, after, redis);
  assert.deepEqual(after.payload.records, []);
});

test('signals API declara metodos e header de sincronizacao no preflight', async () => {
  const response = responseMock();
  await handler.handleRequest({ method: 'OPTIONS', headers: { origin: 'https://desk.test', host: 'desk.test' } }, response, new FakeRedis());
  assert.equal(response.statusCode, 204);
  assert.match(response.headers['Access-Control-Allow-Methods'], /GET, POST, DELETE, OPTIONS/);
  assert.match(response.headers['Access-Control-Allow-Headers'], /X-Journal-Id/);
});

test('signals API rejeita metodo nao suportado sem tocar no storage', async () => {
  const response = responseMock();
  await handler.handleRequest({ method: 'PATCH', headers: { 'x-journal-id': namespace } }, response, new FakeRedis());
  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, 'GET, POST, DELETE');
});
