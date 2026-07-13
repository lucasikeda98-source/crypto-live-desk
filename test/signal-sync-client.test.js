'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createClient, generateSyncId, validSyncId } = require('../lib/signal-sync-client');

function record(id, outcome, inputSnapshotId) {
  return {
    inputSnapshotId: inputSnapshotId || 'snapshot:' + id,
    modelVersion: 'v1',
    symbol: 'BTCUSDT',
    interval: '5m',
    signalCloseTime: id,
    price: 100,
    outcome: outcome || null,
    evaluatedAt: outcome ? id + 100 : null
  };
}

function harness(overrides = {}) {
  let records = overrides.records || [];
  let syncId = overrides.syncId || 'a'.repeat(43);
  const statuses = [];
  const requests = [];
  const fetchJSON = overrides.fetchJSON || (async (_endpoint, _timeout, _label, options) => {
    requests.push(options);
    if (options.method === 'GET') return { configured: true, records: [] };
    if (options.method === 'POST') return { configured: true, records: JSON.parse(options.body).records };
    return { configured: true, records: [] };
  });
  const client = createClient({
    fetchJSON,
    validRecord: (value) => !!value && Number.isFinite(value.signalCloseTime),
    compactRecords: (values) => values,
    mergeOutcome: (existing, incoming) => incoming || existing || null,
    readRecords: () => records,
    writeRecords: (value) => { records = value; },
    readSyncId: () => syncId,
    writeSyncId: (value) => { syncId = value; },
    cryptoApi: { getRandomValues(bytes) { bytes.fill(7); return bytes; } },
    onStatus: (status) => statuses.push(status),
    scheduleMs: 0,
    ...overrides.options
  });
  return { client, requests, statuses, getRecords: () => records, getSyncId: () => syncId };
}

function queuedExclusive() {
  let tail = Promise.resolve();
  return function runExclusive(task) {
    const result = tail.then(task);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

function sharedClient(shared, runExclusive, fetchJSON) {
  return createClient({
    fetchJSON,
    validRecord: (value) => !!value && Number.isFinite(value.signalCloseTime),
    compactRecords: (values) => values,
    mergeOutcome: (existing, incoming) => incoming || existing || null,
    readRecords: () => shared.records,
    writeRecords: (value) => { shared.records = value; },
    readSyncId: () => shared.syncId,
    writeSyncId: (value) => { shared.syncId = value; },
    cryptoApi: { getRandomValues(bytes) { bytes.fill(7); return bytes; } },
    runExclusive,
    scheduleMs: 0
  });
}

test('gera identificador privado criptografico em base64url com tamanho forte', () => {
  const id = generateSyncId({ getRandomValues(bytes) { for (let i = 0; i < bytes.length; i += 1) bytes[i] = i; return bytes; } });
  assert.equal(id.length, 43);
  assert.equal(validSyncId(id), true);
  assert.equal(/[+/=]/.test(id), false);
});

test('cliente substitui identidade persistida invalida por uma gerada com entropia segura', () => {
  const { client, getSyncId } = harness({ syncId: 'invalido' });
  const id = client.syncId();
  assert.equal(validSyncId(id), true);
  assert.equal(id, getSyncId());
});

test('concilia registros sem apagar outcome ja avaliado', () => {
  const local = record(10);
  const remote = record(10, { h24: { returnPct: 2 } });
  const { client } = harness();
  const merged = client.merge([local], [remote]);
  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].outcome, remote.outcome);
  assert.equal(merged[0].evaluatedAt, remote.evaluatedAt);
});

test('adota a revisao canonica remota quando o mesmo candle tem outro snapshot', () => {
  const local = { ...record(10, null, 'snapshot:local'), price: 101 };
  const remote = { ...record(10, { h24: { returnPct: 2 } }, 'snapshot:remote'), price: 100 };
  const { client } = harness();
  const merged = client.merge([local], [remote]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].inputSnapshotId, 'snapshot:remote');
  assert.equal(merged[0].price, 100);
  assert.deepEqual(merged[0].outcome, remote.outcome);
});

test('sincroniza em lotes e usa a mesma identidade em toda a transacao', async () => {
  const local = Array.from({ length: 55 }, (_, index) => record(index + 1));
  const remote = [];
  const requests = [];
  const { client, getRecords, statuses } = harness({
    records: local,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      requests.push(options);
      if (options.method === 'GET') return { configured: true, records: remote.slice() };
      if (options.method === 'POST') {
        JSON.parse(options.body).records.forEach((item) => {
          const index = remote.findIndex((row) => row.signalCloseTime === item.signalCloseTime);
          if (index >= 0) remote[index] = item; else remote.push(item);
        });
        return { configured: true, records: remote.slice() };
      }
      return { configured: true, records: [] };
    }
  });
  const result = await client.sync(local);
  assert.equal(result.ok, true);
  assert.equal(getRecords().length, 55);
  assert.deepEqual(requests.map((request) => request.method), ['GET', 'POST', 'POST']);
  assert.equal(new Set(requests.map((request) => request.headers['X-Journal-Id'])).size, 1);
  assert.equal(statuses.at(-1).code, 'synced');
});

test('segunda chamada em voo fica enfileirada e usa o snapshot mais recente', async () => {
  let releaseGet;
  const getPending = new Promise((resolve) => { releaseGet = resolve; });
  const posts = [];
  const first = [record(1)];
  const latest = [record(2)];
  const { client } = harness({
    records: first,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      if (options.method === 'GET') {
        if (!posts.length) return getPending;
        return { configured: true, records: [] };
      }
      if (options.method === 'POST') {
        posts.push(JSON.parse(options.body).records);
        return { configured: true, records: posts.at(-1) };
      }
      return { configured: true, records: [] };
    }
  });
  const running = client.sync(first);
  const queued = await client.sync(latest);
  assert.equal(queued.queued, true);
  releaseGet({ configured: true, records: [] });
  await running;
  for (let index = 0; index < 4 && posts.length < 2; index += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(posts.map((batch) => batch[0].signalCloseTime), [1, 2]);
});

test('schedule coalesce chamadas e dispara apenas o snapshot mais recente', async () => {
  const posts = [];
  const { client } = harness({
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      if (options.method === 'GET') return { configured: true, records: [] };
      if (options.method === 'POST') {
        const records = JSON.parse(options.body).records;
        posts.push(records);
        return { configured: true, records };
      }
      return { configured: true, records: [] };
    }
  });
  client.schedule([record(1)]);
  client.schedule([record(2)]);
  for (let index = 0; index < 6 && !posts.length; index += 1) await new Promise((resolve) => setTimeout(resolve, 1));
  assert.deepEqual(posts.map((batch) => batch[0].signalCloseTime), [2]);
});

test('preserva journal local quando a sincronizacao remota falha', async () => {
  const local = [record(1)];
  const error = Object.assign(new Error('not configured'), { status: 503 });
  const { client, getRecords, statuses } = harness({ records: local, fetchJSON: async () => { throw error; } });
  const result = await client.sync(local);
  assert.equal(result.ok, false);
  assert.deepEqual(getRecords(), local);
  assert.equal(statuses.at(-1).code, 'sync-failed');
});

test('falha transitoria de sync nao impede DELETE duravel posterior', async () => {
  const local = [record(1)];
  const requests = [];
  const { client, getRecords } = harness({
    records: local,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      requests.push(options.method);
      if (options.method === 'GET') throw Object.assign(new Error('temporarily offline'), { status: 503 });
      if (options.method === 'DELETE') return { configured: true, records: [] };
      throw new Error('unexpected method');
    }
  });
  await client.sync(local);
  const cleared = await client.clear();
  assert.equal(cleared.ok, true);
  assert.deepEqual(requests, ['GET', 'DELETE']);
  assert.deepEqual(getRecords(), []);
});

test('resposta 200 malformada nunca e anunciada como persistencia concluida', async () => {
  const local = [record(1)];
  const { client, getRecords, statuses } = harness({ records: local, fetchJSON: async () => ({ ok: true }) });
  const result = await client.sync(local);
  assert.equal(result.ok, false);
  assert.deepEqual(getRecords(), local);
  assert.equal(statuses.at(-1).code, 'sync-failed');
});

test('capability probe configurado=false evita POST e preserva journal sem erro de recurso', async () => {
  const local = [record(1)];
  const requests = [];
  const { client, getRecords, statuses } = harness({
    records: local,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      requests.push(options);
      return { configured: false, records: [] };
    }
  });
  const result = await client.sync(local);
  assert.equal(result.ok, false);
  assert.deepEqual(getRecords(), local);
  assert.deepEqual(requests.map((request) => request.method), ['GET']);
  assert.equal(statuses.at(-1).code, 'unconfigured');
  await client.clear();
  assert.deepEqual(requests.map((request) => request.method), ['GET']);
  assert.equal(statuses.at(-1).code, 'clear-unconfigured');
  assert.deepEqual(getRecords(), []);
});

test('troca de codigo durante GET nao mistura nem publica dados entre journals', async () => {
  let releaseOld;
  const oldGet = new Promise((resolve) => { releaseOld = resolve; });
  const requests = [];
  const local = [record(1)];
  const { client } = harness({
    records: local,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      requests.push(options);
      const id = options.headers['X-Journal-Id'];
      if (options.method === 'GET' && id === 'a'.repeat(43)) return oldGet;
       if (options.method === 'GET') return { configured: true, records: [] };
       if (options.method === 'POST') return { configured: true, records: JSON.parse(options.body).records };
       return { configured: true, records: [] };
    }
  });
  const first = client.sync(local);
  await Promise.resolve();
  client.setSyncId('b'.repeat(43));
  releaseOld({ records: [record(999, { h24: { returnPct: 9 } })] });
  const result = await first;
  assert.equal(result.superseded, true);
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const oldPosts = requests.filter((request) => request.method === 'POST' && request.headers['X-Journal-Id'] === 'a'.repeat(43));
  const newPosts = requests.filter((request) => request.method === 'POST' && request.headers['X-Journal-Id'] === 'b'.repeat(43));
  assert.equal(oldPosts.length, 0);
  assert.equal(newPosts.length, 1);
  assert.equal(JSON.parse(newPosts[0].body).records.some((item) => item.signalCloseTime === 999), false);
});

test('limpeza espera sincronizacao antiga terminar e apaga por ultimo', async () => {
  let releasePost;
  let announcePost;
  const postStarted = new Promise((resolve) => { announcePost = resolve; });
  const postGate = new Promise((resolve) => { releasePost = resolve; });
  const requests = [];
  let remote = [];
  const local = [record(1)];
  const { client, getRecords } = harness({
    records: local,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      requests.push(options.method);
      if (options.method === 'GET') return { configured: true, records: remote.slice() };
      if (options.method === 'POST') {
        announcePost();
        await postGate;
        remote = JSON.parse(options.body).records;
        return { configured: true, records: remote.slice() };
      }
      if (options.method === 'DELETE') {
        remote = [];
        return { configured: true, records: [] };
      }
      throw new Error('unexpected request');
    }
  });

  const syncing = client.sync(local);
  await postStarted;
  const clearing = client.clear();
  await Promise.resolve();
  assert.deepEqual(requests, ['GET', 'POST']);
  releasePost();
  await syncing;
  const cleared = await clearing;
  assert.equal(cleared.ok, true);
  assert.deepEqual(requests, ['GET', 'POST', 'DELETE']);
  assert.deepEqual(remote, []);
  assert.deepEqual(getRecords(), []);
});

test('falha no DELETE restaura o journal local para permitir nova tentativa', async () => {
  const local = [record(1)];
  const failure = Object.assign(new Error('redis offline'), { status: 503 });
  const { client, getRecords, statuses } = harness({
    records: local,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      if (options.method === 'DELETE') throw failure;
      return { configured: true, records: [] };
    }
  });
  const result = await client.clear();
  assert.equal(result.ok, false);
  assert.deepEqual(getRecords(), local);
  assert.equal(statuses.at(-1).code, 'clear-failed');
});

test('segunda tentativa de DELETE continua chamando o servidor depois de falha transitoria', async () => {
  const local = [record(1)];
  let deletes = 0;
  const { client, getRecords, statuses } = harness({
    records: local,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      if (options.method !== 'DELETE') return { configured: true, records: [] };
      deletes += 1;
      if (deletes === 1) throw Object.assign(new Error('temporarily offline'), { status: 503 });
      return { configured: true, records: [] };
    }
  });
  assert.equal((await client.clear()).ok, false);
  assert.deepEqual(getRecords(), local);
  assert.equal((await client.clear()).ok, true);
  assert.deepEqual(getRecords(), []);
  assert.equal(deletes, 2);
  assert.equal(statuses.at(-1).code, 'cleared');
});

test('falha no DELETE restaura antigos e preserva registros criados durante a limpeza', async () => {
  let rejectDelete;
  let announceDelete;
  const deleteStarted = new Promise((resolve) => { announceDelete = resolve; });
  const deleteGate = new Promise((_resolve, reject) => { rejectDelete = reject; });
  const initial = [record(1)];
  const fresh = [record(2)];
  const { client, getRecords } = harness({
    records: initial,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      if (options.method === 'DELETE') { announceDelete(); return deleteGate; }
      return { configured: true, records: [] };
    }
  });
  const clearing = client.clear();
  await deleteStarted;
  client.schedule(fresh);
  rejectDelete(Object.assign(new Error('redis offline'), { status: 503 }));
  await clearing;
  assert.deepEqual(getRecords().map((item) => item.signalCloseTime), [1, 2]);
});

test('troca de codigo durante DELETE falho nunca restaura dados da identidade antiga', async () => {
  let rejectDelete;
  const deletePending = new Promise((_resolve, reject) => { rejectDelete = reject; });
  const oldRecord = record(1);
  const newRecord = record(2);
  const requests = [];
  const { client, getRecords } = harness({
    records: [oldRecord],
    syncId: 'a'.repeat(43),
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      requests.push({ method: options.method, id: options.headers['X-Journal-Id'], body: options.body });
      if (options.method === 'DELETE') return deletePending;
      if (options.method === 'GET') return { configured: true, records: [] };
      return { configured: true, records: JSON.parse(options.body).records };
    }
  });
  const clearing = client.clear();
  client.setSyncId('b'.repeat(43));
  client.schedule([newRecord]);
  rejectDelete(Object.assign(new Error('temporarily offline'), { status: 503 }));
  await clearing;
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(getRecords(), [newRecord]);
  assert.equal(requests.some((request) => request.id === 'b'.repeat(43) && request.body && request.body.includes(oldRecord.inputSnapshotId)), false);
});

test('registro criado durante a limpeza so sincroniza depois do DELETE', async () => {
  let releaseFirstPost;
  let announceFirstPost;
  const firstPostStarted = new Promise((resolve) => { announceFirstPost = resolve; });
  const firstPostGate = new Promise((resolve) => { releaseFirstPost = resolve; });
  let postCount = 0;
  let remote = [];
  const requests = [];
  const initial = [record(1)];
  const fresh = [record(2)];
  const { client, getRecords } = harness({
    records: initial,
    fetchJSON: async (_endpoint, _timeout, _label, options) => {
      requests.push(options.method);
      if (options.method === 'GET') return { configured: true, records: remote.slice() };
      if (options.method === 'POST') {
        postCount += 1;
        if (postCount === 1) {
          announceFirstPost();
          await firstPostGate;
        }
        remote = JSON.parse(options.body).records;
        return { configured: true, records: remote.slice() };
      }
      if (options.method === 'DELETE') { remote = []; return { configured: true, records: [] }; }
      throw new Error('unexpected request');
    }
  });

  const syncing = client.sync(initial);
  await firstPostStarted;
  const clearing = client.clear();
  client.schedule(fresh);
  releaseFirstPost();
  await syncing;
  await clearing;
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requests, ['GET', 'POST', 'DELETE', 'GET', 'POST']);
  assert.deepEqual(remote.map((item) => item.signalCloseTime), [2]);
  assert.deepEqual(getRecords().map((item) => item.signalCloseTime), [2]);
});

test('lock multiaba impede sync capturado antes da limpeza de ressuscitar o journal', async () => {
  const stale = [record(1)];
  const shared = { records: stale.slice(), syncId: 'a'.repeat(43) };
  let remote = stale.slice();
  let releaseDelete;
  let announceDelete;
  const deleteStarted = new Promise((resolve) => { announceDelete = resolve; });
  const deleteGate = new Promise((resolve) => { releaseDelete = resolve; });
  const requests = [];
  const runExclusive = queuedExclusive();
  const fetchJSON = async (_endpoint, _timeout, _label, options) => {
    requests.push({ method: options.method, body: options.body });
    if (options.method === 'GET') return { configured: true, records: remote.slice() };
    if (options.method === 'POST') {
      remote = JSON.parse(options.body).records;
      return { configured: true, records: remote.slice() };
    }
    announceDelete();
    await deleteGate;
    remote = [];
    return { configured: true, records: [] };
  };
  const clearingTab = sharedClient(shared, runExclusive, fetchJSON);
  const staleTab = sharedClient(shared, runExclusive, fetchJSON);

  const clearing = clearingTab.clear();
  await deleteStarted;
  const delayedOldSync = staleTab.sync(stale);
  releaseDelete();
  await Promise.all([clearing, delayedOldSync]);

  assert.deepEqual(remote, []);
  assert.deepEqual(shared.records, []);
  const posts = requests.filter((request) => request.method === 'POST');
  assert.equal(posts.length, 1);
  assert.deepEqual(JSON.parse(posts[0].body).records, []);
});

test('limpeza multiaba espera POST em curso e confirma DELETE como ultima escrita', async () => {
  const initial = [record(1)];
  const shared = { records: initial.slice(), syncId: 'a'.repeat(43) };
  let remote = [];
  let releasePost;
  let announcePost;
  const postStarted = new Promise((resolve) => { announcePost = resolve; });
  const postGate = new Promise((resolve) => { releasePost = resolve; });
  const requests = [];
  const runExclusive = queuedExclusive();
  const fetchJSON = async (_endpoint, _timeout, _label, options) => {
    requests.push(options.method);
    if (options.method === 'GET') return { configured: true, records: remote.slice() };
    if (options.method === 'POST') {
      announcePost();
      await postGate;
      remote = JSON.parse(options.body).records;
      return { configured: true, records: remote.slice() };
    }
    remote = [];
    return { configured: true, records: [] };
  };
  const syncingTab = sharedClient(shared, runExclusive, fetchJSON);
  const clearingTab = sharedClient(shared, runExclusive, fetchJSON);

  const syncing = syncingTab.sync(initial);
  await postStarted;
  const clearing = clearingTab.clear();
  releasePost();
  await Promise.all([syncing, clearing]);

  assert.deepEqual(requests, ['GET', 'POST', 'DELETE']);
  assert.deepEqual(remote, []);
  assert.deepEqual(shared.records, []);
});
