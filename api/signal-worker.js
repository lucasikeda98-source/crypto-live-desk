'use strict';

const crypto = require('node:crypto');
const AnalyticsCore = require('../lib/analytics-core');
const { createDurableSignalStore } = require('../lib/durable-signals');
const { getRedis } = require('../lib/redis-runtime');

const RETRY_DELAY_MS = 15 * 60_000;
const WORKER_BATCH = 100;
const WORKER_MAX_BATCHES = 3;
const WORKER_TIME_BUDGET_MS = 24_000;
const MARKET_WINDOW_LIMIT = 1000;
const FETCH_CONCURRENCY = 4;
const FETCH_TIMEOUT_MS = 12_000;
const WORKER_BATCH_START_CUTOFF_MS = WORKER_TIME_BUDGET_MS - FETCH_TIMEOUT_MS - 1_000;
const WORKER_LEASE_KEY = 'cld:signals:worker-lease:v1';
const WORKER_LEASE_MS = 35_000;
const HORIZONS = [
  { key: 'r1h', offset: 3_600_000, interval: '1m', intervalMs: 60_000 },
  { key: 'r24h', offset: 86_400_000, interval: '15m', intervalMs: 15 * 60_000 },
  { key: 'r7d', offset: 7 * 86_400_000, interval: '15m', intervalMs: 15 * 60_000 }
];

function requestHeader(request, name) {
  const headers = request && request.headers || {};
  const value = headers[name] === undefined ? headers[name.toLowerCase()] : headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function fetchClosedKlines(fetchImpl, symbol, interval, startTime, limit, asOf) {
  const url = 'https://data-api.binance.vision/api/v3/klines?symbol=' + encodeURIComponent(symbol)
    + '&interval=' + encodeURIComponent(interval) + '&startTime=' + Math.floor(startTime) + '&limit=' + limit;
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'CryptoLiveDesk/1.0 signal-worker' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
  });
  if (!response || !response.ok) throw new Error(`Binance HTTP ${response && response.status}`);
  return AnalyticsCore.selectClosedCandles(AnalyticsCore.normalizeKlines(await response.json()), asOf);
}

function dueRequirements(record, asOf) {
  const existing = record && record.outcome || {};
  return HORIZONS.filter((horizon) => (
    AnalyticsCore.toFiniteNumber(existing[horizon.key]) === null
      && record.signalCloseTime + horizon.offset <= asOf
  )).map((horizon) => ({ ...horizon, target: record.signalCloseTime + horizon.offset }));
}

function buildFetchWindows(items, asOf = Date.now()) {
  const grouped = new Map();
  (Array.isArray(items) ? items : []).forEach((item, rowIndex) => {
    dueRequirements(item.record, asOf).forEach((requirement) => {
      const key = `${item.record.symbol}|${requirement.interval}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({ ...requirement, rowIndex, symbol: item.record.symbol });
    });
  });
  const windows = [];
  grouped.forEach((requirements) => {
    requirements.sort((a, b) => a.target - b.target || a.rowIndex - b.rowIndex);
    for (let offset = 0; offset < requirements.length;) {
      const first = requirements[offset];
      const startTime = first.target - first.intervalMs;
      // Reserve one extra candle at the right edge for exchange alignment. This keeps every
      // request within Binance's 1000-row ceiling while covering many nearby signals at once.
      const coverageEnd = startTime + (MARKET_WINDOW_LIMIT - 2) * first.intervalMs;
      let end = offset;
      while (end < requirements.length && requirements[end].target <= coverageEnd) end += 1;
      const selected = requirements.slice(offset, end);
      const lastTarget = selected[selected.length - 1].target;
      const limit = Math.min(MARKET_WINDOW_LIMIT, Math.max(3, Math.ceil((lastTarget - startTime) / first.intervalMs) + 2));
      windows.push({
        symbol: first.symbol,
        interval: first.interval,
        startTime,
        limit,
        rowIndexes: Array.from(new Set(selected.map((requirement) => requirement.rowIndex))),
        assignments: selected.map((requirement) => ({ rowIndex: requirement.rowIndex, horizon: requirement.key, intervalMs: requirement.intervalMs }))
      });
      offset = end;
    }
  });
  return windows;
}

async function mapWithConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try { results[index] = { status: 'fulfilled', value: await task(items[index], index) }; }
      catch (reason) { results[index] = { status: 'rejected', reason }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function evaluateDueBatch(items, fetchImpl = fetch, asOf = Date.now(), options = {}) {
  const rows = (Array.isArray(items) ? items : []).map((item) => ({ item, candlesByHorizon: {}, failed: false }));
  const allWindows = buildFetchWindows(items, asOf);
  const maxWindows = Number.isFinite(options.maxWindows) ? Math.max(0, Math.floor(options.maxWindows)) : allWindows.length;
  const windows = allWindows.slice(0, maxWindows);
  allWindows.slice(windows.length).forEach((window) => {
    window.assignments.forEach((assignment) => { rows[assignment.rowIndex].failed = true; });
  });
  const settled = await mapWithConcurrency(windows, FETCH_CONCURRENCY, (window) => (
    fetchClosedKlines(fetchImpl, window.symbol, window.interval, window.startTime, window.limit, asOf)
  ));
  settled.forEach((result, windowIndex) => {
    windows[windowIndex].assignments.forEach((assignment) => {
      const row = rows[assignment.rowIndex];
      if (result.status === 'fulfilled') row.candlesByHorizon[assignment.horizon] = {
        candles: result.value,
        maxLagMs: assignment.intervalMs + AnalyticsCore.RULESET.clockSkewToleranceMs
      };
      else row.failed = true;
    });
  });
  const evaluations = rows.map((row) => {
    const record = row.item.record;
    let outcome = record.outcome || {};
    const freshOutcome = {};
    Object.entries(row.candlesByHorizon).forEach(([horizon, source]) => {
      const evaluated = AnalyticsCore.evaluateSignalOutcome(record, source.candles, { horizons: [horizon], maxLagMs: source.maxLagMs });
      freshOutcome[horizon] = evaluated && evaluated[horizon];
    });
    if (Object.keys(freshOutcome).length) outcome = AnalyticsCore.mergeSignalOutcome(outcome, freshOutcome);
    return {
      namespaceHash: row.item.namespaceHash,
      record: { ...record, outcome, evaluatedAt: asOf },
      deferred: row.failed
    };
  });
  return {
    evaluations,
    attempted: windows.length,
    deferred: evaluations.filter((evaluation) => evaluation.deferred).length,
    windowBudgetDeferred: allWindows.length - windows.length
  };
}

async function evaluateDueRecord(record, fetchImpl = fetch, asOf = Date.now()) {
  const batch = await evaluateDueBatch([{ record }], fetchImpl, asOf);
  return { ...batch.evaluations[0], attempted: batch.attempted, deferred: batch.deferred };
}

function authorizedCronRequest(request, secret) {
  const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
  const received = Buffer.from(String(requestHeader(request, 'authorization') || ''), 'utf8');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

async function acquireWorkerLease(redis) {
  if (!redis || typeof redis.set !== 'function') throw new Error('Redis lease primitive is unavailable');
  const token = crypto.randomUUID();
  const result = await redis.set(WORKER_LEASE_KEY, token, { nx: true, px: WORKER_LEASE_MS });
  return result === 'OK' || result === true;
}

async function handleRequest(request, response, dependencies = {}) {
  response.setHeader('Cache-Control', 'private, no-store, max-age=0');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const secret = dependencies.cronSecret === undefined ? process.env.CRON_SECRET : dependencies.cronSecret;
  if (!secret || secret.length < 24) return response.status(503).json({ error: 'CRON_SECRET is not configured' });
  if (!authorizedCronRequest(request, secret)) return response.status(401).json({ error: 'Unauthorized' });
  const redis = dependencies.redis === undefined ? getRedis() : dependencies.redis;
  if (!redis) return response.status(503).json({ error: 'Durable signal storage is not provisioned' });
  const now = dependencies.now === undefined ? Date.now() : dependencies.now;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const clock = dependencies.clock || Date.now;
  const store = createDurableSignalStore(redis);
  try {
    if (!await acquireWorkerLease(redis)) {
      return response.status(202).json({ ok: true, skipped: 'worker-already-running', evaluatedAt: now });
    }
    const startedAt = clock();
    let dueCount = 0;
    let attempted = 0;
    let deferred = 0;
    let batches = 0;
    let stopReason = 'drained';
    while (batches < WORKER_MAX_BATCHES) {
      if (batches > 0 && clock() - startedAt >= WORKER_BATCH_START_CUTOFF_MS) {
        stopReason = 'time-budget';
        break;
      }
      const due = await store.due(now, WORKER_BATCH);
      if (!due.length) break;
      const batch = await evaluateDueBatch(due, fetchImpl, now, { maxWindows: FETCH_CONCURRENCY });
      await store.saveWorkerResults(batch.evaluations, now, RETRY_DELAY_MS);
      batches += 1;
      dueCount += due.length;
      attempted += batch.attempted;
      deferred += batch.deferred;
      if (batch.windowBudgetDeferred > 0) stopReason = 'window-budget';
      if (due.length < WORKER_BATCH) break;
      if (batches === WORKER_MAX_BATCHES) stopReason = 'batch-limit';
    }
    if (stopReason === 'drained' && deferred > 0) stopReason = 'upstream-deferred';
    return response.status(200).json({
      ok: true,
      due: dueCount,
      attempted,
      deferred,
      batches,
      backlogMayRemain: stopReason !== 'drained' || deferred > 0,
      stopReason,
      evaluatedAt: now
    });
  } catch (error) {
    return response.status(503).json({ error: String(error && error.message || error) });
  }
}

module.exports = function handler(request, response) { return handleRequest(request, response); };
module.exports.acquireWorkerLease = acquireWorkerLease;
module.exports.authorizedCronRequest = authorizedCronRequest;
module.exports.buildFetchWindows = buildFetchWindows;
module.exports.evaluateDueBatch = evaluateDueBatch;
module.exports.evaluateDueRecord = evaluateDueRecord;
module.exports.fetchClosedKlines = fetchClosedKlines;
module.exports.handleRequest = handleRequest;
