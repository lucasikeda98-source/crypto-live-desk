'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const worker = require('../api/signal-worker');
const { createDurableSignalStore } = require('../lib/durable-signals');

class FakeRedis {
  constructor() { this.hashes = new Map(); this.sorted = new Map(); this.strings = new Map(); }
  async hget(key, field) { return this.hashes.get(key)?.get(field) ?? null; }
  async hset(key, values) { if (!this.hashes.has(key)) this.hashes.set(key, new Map()); Object.entries(values).forEach(([field, value]) => this.hashes.get(key).set(field, value)); }
  async hvals(key) { return Array.from(this.hashes.get(key)?.values() || []); }
  async hdel(key, field) { this.hashes.get(key)?.delete(field); }
  async expire() { return 1; }
  async del(key) { this.hashes.delete(key); }
  async zadd(key, entry) { if (!this.sorted.has(key)) this.sorted.set(key, new Map()); this.sorted.get(key).set(entry.member, entry.score); }
  async zrem(key, member) { this.sorted.get(key)?.delete(member); }
  async zrange(key, min, max, options) { return Array.from(this.sorted.get(key)?.entries() || []).filter(([, score]) => score >= min && score <= max).sort((a, b) => a[1] - b[1]).slice(options?.offset || 0, (options?.offset || 0) + (options?.count || 20)).map(([member]) => member); }
  async set(key, value, options) {
    if (options?.nx && this.strings.has(key)) return null;
    this.strings.set(key, value);
    return 'OK';
  }
}

function responseMock() {
  return {
    headers: {}, statusCode: 200, payload: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return payload; }
  };
}

const NOW = Date.UTC(2026, 6, 13, 12);
const BASE = NOW - 8 * 86_400_000;
const namespace = 'W'.repeat(43);
const secret = 'cron-secret-with-at-least-24-characters';

function record() {
  return {
    recordedAt: BASE + 1000,
    inputSnapshotId: 'snapshot:worker', modelVersion: '1.0.0-test', rulesetHash: 'abcdef12',
    symbol: 'BTCUSDT', interval: '5m', signalCloseTime: BASE, price: 100,
    setupScore: 42, radarScore: 20, dataConfidence: 80, decision: 'Entrada', outcome: null
  };
}

function kline(closeTime, close) {
  return [closeTime - 60_000, String(close), String(close), String(close), String(close), '1', closeTime, String(close), 1, '0.5'];
}

function fetchFixture(url) {
  const parsed = new URL(url);
  const interval = parsed.searchParams.get('interval');
  const rows = interval === '1m'
    ? [kline(BASE + 3_600_000, 101)]
    : [kline(BASE + 86_400_000, 102), kline(BASE + 7 * 86_400_000, 107)];
  return Promise.resolve({ ok: true, status: 200, json: async () => rows });
}

test('worker calcula 1h/24h/7d nos primeiros candles fechados apos cada horizonte', async () => {
  const result = await worker.evaluateDueRecord(record(), fetchFixture, NOW);
  assert.equal(result.attempted, 2);
  assert.equal(result.deferred, 0);
  assert.equal(result.record.outcome.r1h, 1);
  assert.equal(result.record.outcome.r24h, 2);
  assert.ok(Math.abs(result.record.outcome.r7d - 7) < 1e-12);
});

test('worker preserva outcome e agenda retry quando Binance falha', async () => {
  const source = { ...record(), outcome: { r1h: 1, r24h: null, r7d: null } };
  const result = await worker.evaluateDueRecord(source, async () => { throw new Error('offline'); }, NOW);
  assert.equal(result.deferred, 1);
  assert.equal(result.record.outcome.r1h, 1);
  assert.equal(result.record.outcome.r24h, null);
});

test('worker nao usa candle de 24h ou 7d para preencher horizonte de 1h que falhou', async () => {
  const result = await worker.evaluateDueRecord(record(), async (url) => {
    const interval = new URL(url).searchParams.get('interval');
    if (interval === '1m') throw new Error('1m offline');
    return {
      ok: true,
      status: 200,
      json: async () => [kline(BASE + 86_400_000, 102), kline(BASE + 7 * 86_400_000, 107)]
    };
  }, NOW);
  assert.equal(result.deferred, 1);
  assert.equal(result.record.outcome.r1h, null);
  assert.equal(result.record.outcome.r24h, 2);
  assert.ok(Math.abs(result.record.outcome.r7d - 7) < 1e-12);
});

test('worker deixa 24h ausente quando a primeira observacao disponivel so aparece em 7d', async () => {
  const result = await worker.evaluateDueRecord(record(), async (url) => {
    const interval = new URL(url).searchParams.get('interval');
    return {
      ok: true,
      status: 200,
      json: async () => interval === '1m'
        ? [kline(BASE + 3_600_000, 101)]
        : [kline(BASE + 7 * 86_400_000, 107)]
    };
  }, NOW);
  assert.equal(result.record.outcome.r1h, 1);
  assert.equal(result.record.outcome.r24h, null);
  assert.ok(Math.abs(result.record.outcome.r7d - 7) < 1e-12);
});

test('worker agrupa cem sinais proximos em duas janelas de mercado', async () => {
  const records = Array.from({ length: 100 }, (_, index) => ({
    ...record(),
    inputSnapshotId: `snapshot:batch:${index}`,
    signalCloseTime: BASE + index * 5 * 60_000,
    recordedAt: BASE + index * 5 * 60_000 + 1000
  }));
  const urls = [];
  const batch = await worker.evaluateDueBatch(records.map((item) => ({ record: item })), async (url) => {
    urls.push(url);
    return { ok: true, status: 200, json: async () => [] };
  }, NOW);
  assert.equal(batch.evaluations.length, 100);
  assert.equal(batch.attempted, 2);
  assert.equal(urls.length, 2);
  assert.deepEqual(new Set(urls.map((url) => new URL(url).searchParams.get('interval'))), new Set(['1m', '15m']));
});

test('worker limita janelas por onda e marca horizontes adiados pelo orcamento', async () => {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'];
  const records = symbols.map((symbol, index) => ({
    ...record(), symbol, inputSnapshotId: `snapshot:window-budget:${index}`
  }));
  const batch = await worker.evaluateDueBatch(records.map((item) => ({ record: item })), async () => ({
    ok: true,
    status: 200,
    json: async () => []
  }), NOW, { maxWindows: 4 });
  assert.equal(batch.attempted, 4);
  assert.equal(batch.windowBudgetDeferred, 8);
  assert.equal(batch.deferred, 4);
});

test('worker torna backlog explicito quando uma onda nao cabe na execucao', async () => {
  const redis = new FakeRedis();
  const symbols = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'];
  const records = symbols.map((symbol, index) => ({
    ...record(), symbol, inputSnapshotId: `snapshot:handler-budget:${index}`
  }));
  await createDurableSignalStore(redis).upsert(namespace, records, BASE);
  const response = responseMock();
  await worker.handleRequest({ method: 'GET', headers: { authorization: `Bearer ${secret}` } }, response, {
    redis,
    cronSecret: secret,
    now: NOW,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] })
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.attempted, 4);
  assert.equal(response.payload.deferred, 4);
  assert.equal(response.payload.backlogMayRemain, true);
  assert.equal(response.payload.stopReason, 'window-budget');
});

test('worker drena mais de vinte registros em uma unica execucao', async () => {
  const redis = new FakeRedis();
  const records = Array.from({ length: 25 }, (_, index) => ({
    ...record(),
    inputSnapshotId: `snapshot:drain:${index}`,
    signalCloseTime: BASE + index * 5 * 60_000,
    recordedAt: BASE + index * 5 * 60_000 + 1000
  }));
  await createDurableSignalStore(redis).upsert(namespace, records, BASE + 25 * 5 * 60_000);
  const response = responseMock();
  await worker.handleRequest({ method: 'GET', headers: { authorization: `Bearer ${secret}` } }, response, {
    redis,
    cronSecret: secret,
    now: NOW,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] })
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.due, 25);
  assert.equal(response.payload.attempted, 2);
  assert.equal(response.payload.batches, 1);
  assert.equal(response.payload.backlogMayRemain, false);
});

test('worker drena ate trezentos registros em lotes dentro da mesma execucao', async () => {
  const redis = new FakeRedis();
  const records = Array.from({ length: 250 }, (_, index) => ({
    ...record(),
    inputSnapshotId: `snapshot:catch-up:${index}`,
    signalCloseTime: BASE + index * 5 * 60_000,
    recordedAt: BASE + index * 5 * 60_000 + 1000
  }));
  await createDurableSignalStore(redis).upsert(namespace, records, BASE + 250 * 5 * 60_000);
  const response = responseMock();
  await worker.handleRequest({ method: 'GET', headers: { authorization: `Bearer ${secret}` } }, response, {
    redis,
    cronSecret: secret,
    now: NOW,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] })
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.due, 250);
  assert.equal(response.payload.batches, 3);
  assert.equal(response.payload.backlogMayRemain, false);
  assert.equal(response.payload.stopReason, 'drained');
});

test('worker respeita orcamento de tempo e sinaliza backlog possivel', async () => {
  const redis = new FakeRedis();
  const records = Array.from({ length: 150 }, (_, index) => ({
    ...record(),
    inputSnapshotId: `snapshot:budget:${index}`,
    signalCloseTime: BASE + index * 5 * 60_000,
    recordedAt: BASE + index * 5 * 60_000 + 1000
  }));
  await createDurableSignalStore(redis).upsert(namespace, records, BASE + 150 * 5 * 60_000);
  const ticks = [0, 24_000];
  const response = responseMock();
  await worker.handleRequest({ method: 'GET', headers: { authorization: `Bearer ${secret}` } }, response, {
    redis,
    cronSecret: secret,
    now: NOW,
    clock: () => ticks.shift() ?? 24_000,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => [] })
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.payload.due, 100);
  assert.equal(response.payload.batches, 1);
  assert.equal(response.payload.backlogMayRemain, true);
  assert.equal(response.payload.stopReason, 'time-budget');
});

test('worker exige CRON_SECRET e processa fila autenticada', async () => {
  const redis = new FakeRedis();
  await createDurableSignalStore(redis).upsert(namespace, [record()], BASE);

  const unauthorized = responseMock();
  await worker.handleRequest({ method: 'GET', headers: {} }, unauthorized, { redis, cronSecret: secret, now: NOW, fetchImpl: fetchFixture });
  assert.equal(unauthorized.statusCode, 401);

  const configured = responseMock();
  await worker.handleRequest({ method: 'GET', headers: { authorization: `Bearer ${secret}` } }, configured, { redis, cronSecret: secret, now: NOW, fetchImpl: fetchFixture });
  assert.equal(configured.statusCode, 200);
  assert.equal(configured.payload.due, 1);
  assert.equal(configured.payload.deferred, 0);
  const stored = await createDurableSignalStore(redis).list(namespace, NOW);
  assert.equal(stored[0].outcome.r1h, 1);
  assert.equal(stored[0].outcome.r24h, 2);
  assert.ok(Math.abs(stored[0].outcome.r7d - 7) < 1e-12);
});

test('worker rejeita metodo e falha fechado sem segredo configurado', async () => {
  const wrongMethod = responseMock();
  await worker.handleRequest({ method: 'POST', headers: {} }, wrongMethod, { redis: new FakeRedis(), cronSecret: secret });
  assert.equal(wrongMethod.statusCode, 405);
  assert.equal(wrongMethod.headers['Cache-Control'], 'private, no-store, max-age=0');
  assert.equal(wrongMethod.headers['X-Content-Type-Options'], 'nosniff');
  const noSecret = responseMock();
  await worker.handleRequest({ method: 'GET', headers: {} }, noSecret, { redis: new FakeRedis(), cronSecret: '' });
  assert.equal(noSecret.statusCode, 503);
});

test('worker recusa execucao sobreposta com lease distribuido', async () => {
  const redis = new FakeRedis();
  await createDurableSignalStore(redis).upsert(namespace, [record()], BASE);
  let releaseFetch;
  let announceFetch;
  const fetchStarted = new Promise((resolve) => { announceFetch = resolve; });
  const fetchGate = new Promise((resolve) => { releaseFetch = resolve; });
  const firstResponse = responseMock();
  const first = worker.handleRequest({ method: 'GET', headers: { authorization: `Bearer ${secret}` } }, firstResponse, {
    redis,
    cronSecret: secret,
    now: NOW,
    fetchImpl: async (url) => {
      announceFetch();
      await fetchGate;
      return fetchFixture(url);
    }
  });
  await fetchStarted;
  const duplicate = responseMock();
  await worker.handleRequest({ method: 'GET', headers: { authorization: `Bearer ${secret}` } }, duplicate, {
    redis,
    cronSecret: secret,
    now: NOW,
    fetchImpl: fetchFixture
  });
  assert.equal(duplicate.statusCode, 202);
  assert.equal(duplicate.payload.skipped, 'worker-already-running');
  releaseFetch();
  await first;
  assert.equal(firstResponse.statusCode, 200);
});
