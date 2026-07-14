'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const durable = require('../lib/durable-signals');

class FakeRedis {
  constructor() { this.hashes = new Map(); this.sorted = new Map(); this.expiries = new Map(); }
  async hget(key, field) { return this.hashes.get(key)?.get(field) ?? null; }
  async hset(key, values) {
    if (!this.hashes.has(key)) this.hashes.set(key, new Map());
    Object.entries(values).forEach(([field, value]) => this.hashes.get(key).set(field, value));
  }
  async hvals(key) { return Array.from(this.hashes.get(key)?.values() || []); }
  async hdel(key, field) { this.hashes.get(key)?.delete(field); }
  async expire(key, seconds) { this.expiries.set(key, seconds); }
  async del(key) { this.hashes.delete(key); }
  async zadd(key, entry) {
    if (!this.sorted.has(key)) this.sorted.set(key, new Map());
    this.sorted.get(key).set(entry.member, entry.score);
  }
  async zrem(key, member) { this.sorted.get(key)?.delete(member); }
  async zrange(key, min, max, options) {
    const rows = Array.from(this.sorted.get(key)?.entries() || []).filter(([, score]) => score >= min && score <= max).sort((a, b) => a[1] - b[1]);
    const offset = options?.offset || 0;
    const count = options?.count ?? rows.length;
    return rows.slice(offset, offset + count).map(([member]) => member);
  }
}

class AtomicRaceRedis extends FakeRedis {
  constructor() {
    super();
    this.reads = 0;
    this.releaseReads = null;
    this.readBarrier = new Promise((resolve) => { this.releaseReads = resolve; });
    this.atomicQueue = Promise.resolve();
  }
  async hget(key, field) {
    const value = this.hashes.get(key)?.get(field) ?? null;
    this.reads += 1;
    if (this.reads <= 2) {
      if (this.reads === 2) this.releaseReads();
      await this.readBarrier;
    }
    return value;
  }
  async eval(_script, keys, args) {
    const operation = this.atomicQueue.then(async () => {
      const [key, dueKey] = keys;
      if (args.length === 1) {
        const [namespaceHash] = args;
        const fields = Array.from(this.hashes.get(key)?.keys() || []);
        fields.forEach((field) => this.sorted.get(dueKey)?.delete(durable.dueMember(namespaceHash, field)));
        this.hashes.delete(key);
        return fields.length;
      }
      if (args.length === 4) {
        const [namespaceHash, asOf] = args;
        const entries = Array.from(this.hashes.get(key)?.entries() || []);
        const compacted = durable.compactDurableSignals(entries.map(([, value]) => {
          try { return JSON.parse(value); } catch (error) { return null; }
        }).filter(Boolean), Number(asOf));
        const keep = new Set(compacted.map((record) => record.id));
        entries.forEach(([field, value]) => {
          let normalized = null;
          try { normalized = durable.normalizeDurableSignalRecord(JSON.parse(value), Number(asOf)); } catch (error) { /* invalid */ }
          if (!normalized || normalized.id !== field || !keep.has(field)) {
            this.hashes.get(key)?.delete(field);
            this.sorted.get(dueKey)?.delete(durable.dueMember(namespaceHash, field));
          }
        });
        return Array.from(this.hashes.get(key)?.values() || []);
      }
      const [field, serialized] = args;
      const incoming = JSON.parse(serialized);
      const existingValue = this.hashes.get(key)?.get(field);
      const parsed = existingValue ? JSON.parse(existingValue) : null;
      const existing = durable.normalizeDurableSignalRecord(parsed, NOW);
      const merged = existing && existing.id === incoming.id
        ? durable.mergeDurableSignalRecord(existing, incoming, NOW)
        : incoming;
      await super.hset(key, { [field]: JSON.stringify(merged) });
      return JSON.stringify(merged);
    });
    this.atomicQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

class DuePipelineRedis extends FakeRedis {
  constructor() { super(); this.pipelineExecutions = 0; }
  pipeline() {
    const commands = [];
    const pipeline = {
      hget: (key, field) => { commands.push([key, field]); return pipeline; },
      exec: async () => {
        this.pipelineExecutions += 1;
        return Promise.all(commands.map(([key, field]) => super.hget(key, field)));
      }
    };
    return pipeline;
  }
}

class AtomicPipelineRedis extends AtomicRaceRedis {
  constructor() { super(); this.atomicPipelineExecutions = 0; }
  pipeline() {
    const commands = [];
    const pipeline = {
      eval: (script, keys, args) => { commands.push([script, keys, args]); return pipeline; },
      exec: async () => {
        this.atomicPipelineExecutions += 1;
        return Promise.all(commands.map(([script, keys, args]) => this.eval(script, keys, args)));
      }
    };
    return pipeline;
  }
}

const NOW = Date.UTC(2026, 6, 13, 12);

function fixture(overrides = {}) {
  const signalCloseTime = overrides.signalCloseTime ?? NOW - 2 * 60 * 60 * 1000;
  return {
    schemaVersion: 2,
    recordedAt: signalCloseTime + 1000,
    inputSnapshotId: `snapshot:${signalCloseTime}`,
    modelVersion: '1.0.0-test',
    rulesetHash: 'abcdef12',
    symbol: 'BTCUSDT',
    interval: '5m',
    signalCloseTime,
    price: 60000,
    setupScore: 42,
    radarScore: 20,
    dataConfidence: 80,
    decision: 'Entrada com confirmacao',
    inputComponents: { book: { spreadBps: 1 } },
    inputComponentsHash: 'feedbeef',
    scoreComponents: [],
    gates: { htfAvailable: true },
    outcome: null,
    ...overrides
  };
}

test('durable signals valida schema, limites e identidade deterministica', () => {
  const record = durable.normalizeDurableSignalRecord(fixture(), NOW);
  assert.equal(record.schemaVersion, 3);
  assert.equal(record.id, `1.0.0-test:BTCUSDT:5m:${record.signalCloseTime}`);
  assert.deepEqual(record.outcome, { r1h: null, r24h: null, r7d: null });
  assert.equal(durable.normalizeDurableSignalRecord(fixture({ symbol: 'BTC<script>' }), NOW), null);
  assert.equal(durable.normalizeDurableSignalRecord(fixture({ setupScore: 101 }), NOW), null);
  assert.equal(durable.normalizeDurableSignalRecord(fixture({ signalCloseTime: NOW + 120000, recordedAt: NOW + 120001 }), NOW), null);
});

test('durable signals nunca apaga outcome preenchido durante merge', () => {
  const existing = fixture({ outcome: { r1h: 1.2 }, evaluatedAt: NOW - 1000 });
  const incoming = fixture({ outcome: { r1h: null, r24h: -2.5 }, evaluatedAt: NOW });
  const merged = durable.mergeDurableSignalRecord(existing, incoming, NOW);
  assert.deepEqual(merged.outcome, { r1h: 1.2, r24h: -2.5, r7d: null });
  assert.equal(merged.evaluatedAt, NOW);
});

test('upserts concorrentes nao deixam cliente antigo apagar outcome do worker', async () => {
  const redis = new AtomicRaceRedis();
  const store = durable.createDurableSignalStore(redis);
  const namespace = 'R'.repeat(43);
  const evaluated = fixture({ outcome: { r1h: 1, r24h: null, r7d: null }, evaluatedAt: NOW });
  const stale = fixture({ outcome: null, evaluatedAt: null });
  await Promise.all([
    store.upsert(namespace, [evaluated], NOW),
    store.upsert(namespace, [stale], NOW)
  ]);
  const [stored] = await store.list(namespace, NOW);
  assert.equal(stored.outcome.r1h, 1);
});

test('upsert atomico repara valor corrompido que ocupava o campo do registro', async () => {
  const redis = new AtomicRaceRedis();
  const store = durable.createDurableSignalStore(redis);
  const namespace = 'Z'.repeat(43);
  const incoming = durable.normalizeDurableSignalRecord(fixture(), NOW);
  const key = `cld:signals:records:v1:${durable.namespaceHash(namespace)}`;
  await redis.hset(key, {
    [incoming.id]: JSON.stringify({
      id: incoming.id,
      inputSnapshotId: incoming.inputSnapshotId,
      modelVersion: incoming.modelVersion,
      rulesetHash: incoming.rulesetHash,
      symbol: incoming.symbol,
      interval: incoming.interval,
      signalCloseTime: 'corrupted-time',
      outcome: {}
    })
  });

  const stored = await store.upsert(namespace, [incoming], NOW);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].signalCloseTime, incoming.signalCloseTime);
  assert.equal(stored[0].price, incoming.price);
});

test('compactacao atomica remove campos corrompidos e o indice due correspondente', async () => {
  const redis = new AtomicRaceRedis();
  const store = durable.createDurableSignalStore(redis);
  const namespace = 'Q'.repeat(43);
  const hash = durable.namespaceHash(namespace);
  const key = `cld:signals:records:v1:${hash}`;
  await redis.hset(key, { rogue: '{json-invalido' });
  await redis.zadd(durable.DUE_KEY, { score: NOW, member: durable.dueMember(hash, 'rogue') });
  const stored = await store.upsert(namespace, [fixture()], NOW);
  assert.equal(stored.length, 1);
  assert.equal(redis.hashes.get(key).has('rogue'), false);
  assert.equal(redis.sorted.get(durable.DUE_KEY).has(durable.dueMember(hash, 'rogue')), false);
});

test('clear atomico nao apaga registro gravado depois por outro dispositivo', async () => {
  const redis = new AtomicRaceRedis();
  const store = durable.createDurableSignalStore(redis);
  const namespace = 'X'.repeat(43);
  const fresh = fixture({ inputSnapshotId: 'snapshot:after-clear' });
  await store.upsert(namespace, [fixture({ inputSnapshotId: 'snapshot:before-clear' })], NOW);

  await Promise.all([
    store.clear(namespace),
    store.upsert(namespace, [fresh], NOW)
  ]);

  const stored = await store.list(namespace, NOW);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].inputSnapshotId, 'snapshot:after-clear');
});

test('upsert atomico em lote usa pipeline de EVAL sem perder resultados', async () => {
  const redis = new AtomicPipelineRedis();
  const store = durable.createDurableSignalStore(redis);
  const namespace = 'L'.repeat(43);
  const rows = [
    fixture({ inputSnapshotId: 'pipeline:one' }),
    fixture({ signalCloseTime: NOW - 3 * 60 * 60_000, recordedAt: NOW - 3 * 60 * 60_000 + 1000, inputSnapshotId: 'pipeline:two' })
  ];
  const stored = await store.upsert(namespace, rows, NOW);
  assert.equal(redis.atomicPipelineExecutions, 1);
  assert.equal(stored.length, 2);
  assert.deepEqual(new Set(stored.map((item) => item.inputSnapshotId)), new Set(['pipeline:one', 'pipeline:two']));
});

test('retencao duravel protege pendentes e limita completos por idade/cap', () => {
  const complete = { r1h: 1, r24h: 2, r7d: 3 };
  const rows = Array.from({ length: 505 }, (_, index) => fixture({
    signalCloseTime: NOW - (504 - index) * 60_000 - 8 * 86_400_000,
    recordedAt: NOW - (504 - index) * 60_000 - 8 * 86_400_000 + 1000,
    inputSnapshotId: `complete:${index}`,
    outcome: complete
  }));
  rows.push(fixture({ signalCloseTime: NOW - 366 * 86_400_000, recordedAt: NOW - 366 * 86_400_000 + 1000, inputSnapshotId: 'expired', outcome: complete }));
  rows.push(fixture({ signalCloseTime: NOW - 10 * 86_400_000, recordedAt: NOW - 10 * 86_400_000 + 1000, inputSnapshotId: 'pending', outcome: { r1h: 1, r24h: 2, r7d: null } }));
  const compacted = durable.compactDurableSignals(rows, NOW);
  assert.equal(compacted.length, 501);
  assert.equal(compacted.some((row) => row.inputSnapshotId === 'expired'), false);
  assert.equal(compacted.some((row) => row.inputSnapshotId === 'pending'), true);
});

test('store isola namespace, agenda horizonte, atualiza e limpa', async () => {
  const redis = new FakeRedis();
  const store = durable.createDurableSignalStore(redis);
  const namespaceA = 'A'.repeat(43);
  const namespaceB = 'B'.repeat(43);
  const record = fixture();
  await store.upsert(namespaceA, [record], NOW);
  assert.equal((await store.list(namespaceA, NOW)).length, 1);
  assert.equal((await store.list(namespaceB, NOW)).length, 0);
  const due = await store.due(NOW + 16 * 60_000, 10);
  assert.equal(due.length, 1);
  assert.equal(due[0].record.inputSnapshotId, record.inputSnapshotId);

  const evaluated = { ...due[0].record, outcome: { r1h: 1.5, r24h: null, r7d: null }, evaluatedAt: NOW };
  await store.saveWorkerResult(due[0].namespaceHash, evaluated, NOW);
  assert.equal((await store.list(namespaceA, NOW))[0].outcome.r1h, 1.5);
  await store.clear(namespaceA);
  assert.deepEqual(await store.list(namespaceA, NOW), []);
  assert.equal((await store.due(NOW + 8 * 86_400_000, 10)).length, 0);
});

test('membro due faz round-trip sem ambiguidade e rejeita lixo', () => {
  const hash = durable.namespaceHash('C'.repeat(43));
  const member = durable.dueMember(hash, 'model:BTCUSDT:5m:123');
  assert.deepEqual(durable.parseDueMember(member), { namespaceHash: hash, recordId: 'model:BTCUSDT:5m:123' });
  assert.equal(durable.parseDueMember('bad|value'), null);
});

test('fila due le o lote Redis em um unico pipeline', async () => {
  const redis = new DuePipelineRedis();
  const store = durable.createDurableSignalStore(redis);
  const namespace = 'P'.repeat(43);
  const rows = [fixture(), fixture({ signalCloseTime: NOW - 3 * 60 * 60_000, recordedAt: NOW - 3 * 60 * 60_000 + 1000 })];
  await store.upsert(namespace, rows, NOW);
  const due = await store.due(NOW + 16 * 60_000, 10);
  assert.equal(due.length, 2);
  assert.equal(redis.pipelineExecutions, 1);
});
