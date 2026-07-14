'use strict';

// REV-CC-01 / ANL-027: estes testes executam os 3 scripts Lua de PRODUCAO numa
// VM Lua real (fengari) — nao um fake em JS. O invariante central: o primeiro
// snapshot de um candle e canonico; um incoming com inputSnapshotId diferente
// nunca pode descartar o registro armazenado (nem o outcome do worker).

const test = require('node:test');
const assert = require('node:assert/strict');
const durable = require('../lib/durable-signals');
const { LuaRedis } = require('./helpers/lua-redis.cjs');

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

function mergeArgs(incoming, hash, retry = 900000) {
  return [
    incoming.id,
    JSON.stringify(incoming),
    durable.dueMember(hash, incoming.id),
    String(NOW),
    String(retry),
    String(400 * 24 * 60 * 60)
  ];
}

const NAMESPACE = 'LUAREALNAMESPACELUAREALNAMESPACELUAREALNAME';
const HASH = durable.namespaceHash(NAMESPACE);
const KEY = `cld:signals:records:v1:${HASH}`;

test('lua merge preserva o registro atual quando inputSnapshotId diverge (primeiro snapshot canonico)', async () => {
  const redis = new LuaRedis();
  const worker = durable.normalizeDurableSignalRecord(
    fixture({ inputSnapshotId: 'snapshot:first-writer', outcome: { r1h: 1.7 }, evaluatedAt: NOW - 1000 }),
    NOW
  );
  await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(worker, HASH));

  const rival = durable.normalizeDurableSignalRecord(
    fixture({ inputSnapshotId: 'snapshot:second-writer', outcome: null, evaluatedAt: null }),
    NOW
  );
  const returned = JSON.parse(await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(rival, HASH)));

  assert.equal(returned.inputSnapshotId, 'snapshot:first-writer');
  assert.equal(returned.outcome.r1h, 1.7);
  const stored = JSON.parse(await redis.hget(KEY, worker.id));
  assert.equal(stored.inputSnapshotId, 'snapshot:first-writer');
  assert.equal(stored.outcome.r1h, 1.7);
  assert.equal(stored.evaluatedAt, NOW - 1000);
});

test('lua merge com mesmo snapshot preenche outcomes ausentes sem apagar preenchidos', async () => {
  const redis = new LuaRedis();
  const base = durable.normalizeDurableSignalRecord(
    fixture({ outcome: { r1h: 1.2 }, evaluatedAt: NOW - 5000 }),
    NOW
  );
  await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(base, HASH));

  const update = durable.normalizeDurableSignalRecord(
    fixture({ outcome: { r1h: null, r24h: -2.5 }, evaluatedAt: NOW }),
    NOW
  );
  const merged = JSON.parse(await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(update, HASH)));

  assert.equal(merged.outcome.r1h, 1.2);
  assert.equal(merged.outcome.r24h, -2.5);
  assert.equal(merged.outcome.r7d, null);
  assert.equal(merged.evaluatedAt, NOW);
});

test('lua merge preserva current mesmo com rulesetHash divergente (id identico)', async () => {
  const redis = new LuaRedis();
  const original = durable.normalizeDurableSignalRecord(
    fixture({ rulesetHash: 'hash-original', outcome: { r1h: 3.3 } }),
    NOW
  );
  await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(original, HASH));

  const rehashed = durable.normalizeDurableSignalRecord(
    fixture({ rulesetHash: 'hash-diferente', outcome: null }),
    NOW
  );
  const merged = JSON.parse(await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(rehashed, HASH)));

  assert.equal(merged.rulesetHash, 'hash-original');
  assert.equal(merged.outcome.r1h, 3.3);
});

test('lua merge substitui registro corrompido e agenda/desagenda o indice due', async () => {
  const redis = new LuaRedis();
  const incoming = durable.normalizeDurableSignalRecord(fixture(), NOW);
  await redis.hset(KEY, { [incoming.id]: '{json-invalido' });
  const merged = JSON.parse(await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(incoming, HASH)));
  assert.equal(merged.price, incoming.price);

  const member = durable.dueMember(HASH, incoming.id);
  assert.equal(redis.sorted.get(durable.DUE_KEY).has(member), true);

  const complete = durable.normalizeDurableSignalRecord(
    fixture({ outcome: { r1h: 1, r24h: 2, r7d: 3 }, evaluatedAt: NOW }),
    NOW
  );
  await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(complete, HASH));
  assert.equal(redis.sorted.get(durable.DUE_KEY).has(member), false);
  assert.equal(redis.expiries.get(KEY), 400 * 24 * 60 * 60);
});

test('lua clear remove o hash inteiro e cada membro due correspondente', async () => {
  const redis = new LuaRedis();
  const record = durable.normalizeDurableSignalRecord(fixture(), NOW);
  await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(record, HASH));
  assert.equal(redis.sorted.get(durable.DUE_KEY).size, 1);

  const removed = await redis.eval(durable.LUA_SCRIPTS.clear, [KEY, durable.DUE_KEY], [HASH]);
  assert.equal(removed, 1);
  assert.equal(redis.hashes.has(KEY), false);
  assert.equal(redis.sorted.get(durable.DUE_KEY).size, 0);
});

test('lua compact remove corrompidos, aplica retencao e preserva pendentes', async () => {
  const redis = new LuaRedis();
  const pending = durable.normalizeDurableSignalRecord(
    fixture({ inputSnapshotId: 'compact:pending', outcome: { r1h: 1, r24h: 2, r7d: null } }),
    NOW
  );
  const expired = durable.normalizeDurableSignalRecord(
    fixture({
      signalCloseTime: NOW - 366 * 86_400_000,
      recordedAt: NOW - 366 * 86_400_000 + 1000,
      inputSnapshotId: 'compact:expired',
      outcome: { r1h: 1, r24h: 2, r7d: 3 }
    }),
    NOW
  );
  await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(pending, HASH));
  await redis.eval(durable.LUA_SCRIPTS.merge, [KEY, durable.DUE_KEY], mergeArgs(expired, HASH));
  await redis.hset(KEY, { rogue: '{json-invalido' });
  await redis.zadd(durable.DUE_KEY, { score: NOW, member: durable.dueMember(HASH, 'rogue') });

  const survivors = await redis.eval(durable.LUA_SCRIPTS.compact, [KEY, durable.DUE_KEY], [
    HASH,
    String(NOW),
    String(durable.COMPLETED_RETENTION_MS),
    String(durable.COMPLETED_CAP)
  ]);

  const parsed = survivors.map((value) => JSON.parse(value));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].inputSnapshotId, 'compact:pending');
  assert.equal(redis.hashes.get(KEY).has('rogue'), false);
  assert.equal(redis.sorted.get(durable.DUE_KEY).has(durable.dueMember(HASH, 'rogue')), false);
});

test('store completo sobre Lua real: upsert, due, worker result e clear', async () => {
  const redis = new LuaRedis();
  const store = durable.createDurableSignalStore(redis);
  const record = fixture();
  await store.upsert(NAMESPACE, [record], NOW);
  assert.equal((await store.list(NAMESPACE, NOW)).length, 1);

  const due = await store.due(NOW + 16 * 60_000, 10);
  assert.equal(due.length, 1);

  const evaluated = { ...due[0].record, outcome: { r1h: 1.5, r24h: null, r7d: null }, evaluatedAt: NOW };
  await store.saveWorkerResult(due[0].namespaceHash, evaluated, NOW);
  assert.equal((await store.list(NAMESPACE, NOW))[0].outcome.r1h, 1.5);

  // Cliente atrasado com snapshot diferente do mesmo candle nao regride o outcome do worker.
  await store.upsert(NAMESPACE, [fixture({ inputSnapshotId: 'snapshot:late-client' })], NOW);
  const [stored] = await store.list(NAMESPACE, NOW);
  assert.equal(stored.outcome.r1h, 1.5);
  assert.notEqual(stored.inputSnapshotId, 'snapshot:late-client');

  await store.clear(NAMESPACE);
  assert.deepEqual(await store.list(NAMESPACE, NOW), []);
});
