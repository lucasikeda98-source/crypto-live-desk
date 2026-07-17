'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoordinator } = require('../lib/cross-tab-lock');

class FakeStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

test('fallback bakery serializa duas abas concorrentes sobre o mesmo recurso', async () => {
  const storage = new FakeStorage();
  const first = createCoordinator({ storage, participantId: 'tab-z', pollMs: 2, leaseMs: 5000 });
  const second = createCoordinator({ storage, participantId: 'tab-a', pollMs: 2, leaseMs: 5000 });
  let active = 0;
  let peak = 0;
  let releaseFirst;
  const gate = new Promise((resolve) => { releaseFirst = resolve; });
  const order = [];
  async function task(name) {
    active += 1;
    peak = Math.max(peak, active);
    order.push(name);
    if (order.length === 1) await gate;
    active -= 1;
  }

  const running = [first.run('journal', () => task('z')), second.run('journal', () => task('a'))];
  for (let index = 0; index < 20 && !order.length; index += 1) await sleep(2);
  assert.equal(order.length, 1);
  await sleep(10);
  assert.equal(order.length, 1);
  releaseFirst();
  await Promise.all(running);
  assert.equal(peak, 1);
  assert.deepEqual(new Set(order), new Set(['z', 'a']));
  assert.equal(storage.length, 0);
});

test('fallback remove ticket vencido e nao bloqueia indefinidamente apos queda de uma aba', async () => {
  const storage = new FakeStorage();
  const prefix = 'cld-cross-tab-lock:v1:' + encodeURIComponent('journal') + ':';
  storage.setItem(prefix + 'dead-tab', JSON.stringify({ id: 'dead-tab', choosing: false, number: 1, expiresAt: 10 }));
  let ran = false;
  const coordinator = createCoordinator({ storage, participantId: 'live-tab', now: () => 100, pollMs: 1, leaseMs: 5000 });
  await coordinator.run('journal', () => { ran = true; });
  assert.equal(ran, true);
  assert.equal(storage.length, 0);
});

test('fallback remove ticket corrompido com identidade divergente ou validade abusiva', async () => {
  const storage = new FakeStorage();
  const prefix = 'cld-cross-tab-lock:v1:' + encodeURIComponent('journal') + ':';
  storage.setItem(prefix + 'wrong-key', JSON.stringify({ id: 'other-id', choosing: false, number: 0, expiresAt: 1000 }));
  storage.setItem(prefix + 'future-tab', JSON.stringify({ id: 'future-tab', choosing: false, number: 1, expiresAt: 1_000_000_000 }));
  const coordinator = createCoordinator({ storage, participantId: 'live-tab', now: () => 100, pollMs: 1, leaseMs: 5000 });
  assert.equal(await coordinator.run('journal', () => 'ok'), 'ok');
  assert.equal(storage.length, 0);
});

test('coordenador prefere Web Locks quando a API nativa esta disponivel', async () => {
  const calls = [];
  const locks = {
    request(name, options, task) {
      calls.push({ name, options });
      return Promise.resolve().then(task);
    }
  };
  const coordinator = createCoordinator({ locks, storage: new FakeStorage(), participantId: 'tab' });
  assert.equal(await coordinator.run('machine', () => 42), 42);
  assert.deepEqual(calls, [{ name: 'machine', options: { mode: 'exclusive' } }]);
});

test('falha de aquisicao no Web Locks cai para storage sem repetir tarefa iniciada', async () => {
  const reasons = [];
  let runs = 0;
  const unavailable = { request() { return Promise.reject(new Error('indisponivel')); } };
  const coordinator = createCoordinator({ locks: unavailable, storage: new FakeStorage(), participantId: 'tab', onDegraded: (reason) => reasons.push(reason) });
  assert.equal(await coordinator.run('journal', () => { runs += 1; return 'fallback'; }), 'fallback');
  assert.equal(runs, 1);
  assert.deepEqual(reasons, ['web-lock-unavailable']);

  const taskErrorCoordinator = createCoordinator({
    locks: { request(name, options, task) { return Promise.resolve().then(task); } },
    storage: new FakeStorage(),
    participantId: 'tab-2',
    onDegraded: (reason) => reasons.push(reason),
  });
  await assert.rejects(taskErrorCoordinator.run('journal', () => { runs += 1; throw new Error('erro da tarefa'); }), /erro da tarefa/);
  assert.equal(runs, 2, 'erro da tarefa nativa nao provoca segunda execucao em fallback');
  assert.deepEqual(reasons, ['web-lock-unavailable']);
});

test('falha do storage degrada para fila da propria aba sem perder a operacao', async () => {
  const reasons = [];
  const brokenStorage = {
    get length() { throw new Error('blocked'); },
    key() { throw new Error('blocked'); },
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); }
  };
  const coordinator = createCoordinator({ storage: brokenStorage, participantId: 'tab', onDegraded: (reason) => reasons.push(reason) });
  assert.equal(await coordinator.run('journal', () => 'preserved'), 'preserved');
  assert.deepEqual(reasons, ['storage-lock-unavailable']);
});

test('perda repetida do heartbeat aborta a tarefa e falha fechado antes de confirmar sucesso', async () => {
  const storage = new FakeStorage();
  const originalSetItem = storage.setItem.bind(storage);
  const reasons = [];
  let heartbeat = null;
  let failWrites = false;
  let releaseTask;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const taskGate = new Promise((resolve) => { releaseTask = resolve; });
  storage.setItem = function setItem(key, value) {
    if (failWrites) throw new Error('quota exceeded');
    return originalSetItem(key, value);
  };
  const coordinator = createCoordinator({
    storage,
    participantId: 'tab-heartbeat',
    leaseMs: 5000,
    setInterval(callback) { heartbeat = callback; return 1; },
    clearInterval() {},
    onDegraded: (reason) => reasons.push(reason),
  });

  let context;
  const running = coordinator.run('journal', async (lock) => {
    context = lock;
    markStarted();
    await taskGate;
    return 'must-not-commit';
  });
  await started;
  failWrites = true;
  heartbeat();
  heartbeat();
  assert.equal(context.signal.aborted, true);
  assert.throws(() => context.assertHeld(), (error) => error.code === 'LOCK_LEASE_LOST');
  releaseTask();
  await assert.rejects(running, (error) => error.code === 'LOCK_LEASE_LOST');
  assert.deepEqual(reasons, ['storage-lock-heartbeat-failed']);
});

// REV-CC-02/F: aba suspensa alem do lease acorda SEM exclusividade — antes, o heartbeat
// simplesmente regravava o ticket e a tarefa seguia com outra aba dentro da secao critica.
test('suspensao alem do lease perde a exclusividade ao acordar (fail-closed)', async () => {
  const storage = new FakeStorage();
  const reasons = [];
  let heartbeat = null;
  let clock = 1_000;
  let releaseTask;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const taskGate = new Promise((resolve) => { releaseTask = resolve; });
  const coordinator = createCoordinator({
    storage,
    participantId: 'tab-suspensa',
    leaseMs: 5000,
    now: () => clock,
    setInterval(callback) { heartbeat = callback; return 1; },
    clearInterval() {},
    onDegraded: (reason) => reasons.push(reason),
  });
  let context;
  const running = coordinator.run('journal', async (lock) => {
    context = lock;
    markStarted();
    await taskGate;
    return 'must-not-commit';
  });
  await started;
  clock += 5001;
  heartbeat();
  assert.equal(context.signal.aborted, true);
  assert.throws(() => context.assertHeld(), (error) => error.code === 'LOCK_LEASE_LOST');
  releaseTask();
  await assert.rejects(running, (error) => error.code === 'LOCK_LEASE_LOST');
  assert.deepEqual(reasons, ['storage-lock-suspended']);
});

// REV-CC-02/F: posse real do ticket verificada a cada batimento — ticket tomado/limpo por outra
// aba (apos expiracao) derruba a exclusividade em vez de ser regravado silenciosamente.
test('ticket perdido para outra aba e detectado no batimento seguinte', async () => {
  const storage = new FakeStorage();
  const reasons = [];
  let heartbeat = null;
  let releaseTask;
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const taskGate = new Promise((resolve) => { releaseTask = resolve; });
  const coordinator = createCoordinator({
    storage,
    participantId: 'tab-dona',
    leaseMs: 5000,
    setInterval(callback) { heartbeat = callback; return 1; },
    clearInterval() {},
    onDegraded: (reason) => reasons.push(reason),
  });
  let context;
  const running = coordinator.run('journal', async (lock) => {
    context = lock;
    markStarted();
    await taskGate;
    return 'must-not-commit';
  });
  await started;
  storage.setItem('cld-cross-tab-lock:v1:journal:tab-dona', JSON.stringify({ id: 'tab-invasora', choosing: false, number: 1, expiresAt: Date.now() + 5000 }));
  heartbeat();
  assert.throws(() => context.assertHeld(), (error) => error.code === 'LOCK_LEASE_LOST');
  releaseTask();
  await assert.rejects(running, (error) => error.code === 'LOCK_LEASE_LOST');
  assert.deepEqual(reasons, ['storage-lock-ticket-lost']);
});
