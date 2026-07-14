'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/analytics-core');

function seededRandom(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}

test('fuzz deterministico: normalizacao de candles sempre preserva ordem, unicidade e OHLC', () => {
  const random = seededRandom(0xC0DE2026);
  const rows = [];
  for (let index = 0; index < 2_000; index += 1) {
    const time = Math.floor(random() * 200) * 1_000;
    const open = 1 + random() * 100_000;
    const close = open * (0.9 + random() * 0.2);
    const low = Math.min(open, close) * (0.9 + random() * 0.1);
    const high = Math.max(open, close) * (1 + random() * 0.1);
    const valid = [time, String(open), String(high), String(low), String(close), random() * 1e8, time + 999, random() * 1e10, 10, random() * 1e8];
    const malformed = valid.slice();
    const field = Math.floor(random() * malformed.length);
    malformed[field] = pick(random, [null, '', NaN, Infinity, -1, 'not-a-number']);
    rows.push(random() < 0.65 ? valid : malformed);
    if (random() < 0.08) rows.push({ unexpected: true });
  }

  const candles = core.normalizeKlines(rows);
  const times = candles.map((row) => row.time);
  assert.deepEqual(times, times.slice().sort((a, b) => a - b));
  assert.equal(new Set(times).size, times.length);
  candles.forEach((row) => {
    ['time', 'open', 'high', 'low', 'close'].forEach((key) => {
      assert.ok(Number.isFinite(row[key]), `${key} deve ser finito`);
    });
    ['volume', 'closeTime', 'quote', 'trades', 'takerBuy'].forEach((key) => {
      assert.ok(row[key] === null || Number.isFinite(row[key]), `${key} deve ser nulo ou finito`);
    });
    assert.ok(row.time >= 0 && (row.closeTime === null || row.closeTime >= row.time));
    assert.ok(row.open > 0 && row.high > 0 && row.low > 0 && row.close > 0);
    ['volume', 'quote', 'trades', 'takerBuy'].forEach((key) => assert.ok(row[key] === null || row[key] >= 0));
    assert.ok(row.high >= Math.max(row.open, row.close, row.low));
    assert.ok(row.low <= Math.min(row.open, row.close, row.high));
  });
});

test('fuzz deterministico: agregacao MTF nunca escapa dos limites nem duplica intervalo', () => {
  const random = seededRandom(0x5A17F00D);
  const intervals = ['1s', '1m', '3m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '3d', '1w', '1M', 'x', '', null];
  const hostileScores = [NaN, Infinity, -Infinity, null, '', 'x', 1e308, -1e308];
  for (let round = 0; round < 500; round += 1) {
    const rows = [];
    const size = Math.floor(random() * 80);
    for (let index = 0; index < size; index += 1) {
      if (random() < 0.08) rows.push(null);
      else rows.push({
        interval: pick(random, intervals),
        score: random() < 0.75 ? (random() * 400 - 200) : pick(random, hostileScores)
      });
    }
    const result = core.aggregateMultiTimeframe(rows);
    assert.ok(Number.isFinite(result.score));
    assert.ok(Number.isFinite(result.raw));
    assert.ok(result.score >= -25 && result.score <= 25);
    assert.ok(result.alignment >= 0 && result.alignment <= 1);
    assert.ok(['Alta', 'Baixa', 'Misto'].includes(result.bias));
    const canonical = new Map();
    rows.forEach((row) => {
      if (!row || !intervals.slice(0, 16).includes(row.interval)) return;
      const score = core.toFiniteNumber(row.score);
      if (score !== null) canonical.set(row.interval, { interval: row.interval, score });
    });
    assert.deepEqual(result, core.aggregateMultiTimeframe(Array.from(canonical.values())), 'duplicatas equivalem a ultima observacao valida do TF');
  }
});

test('fuzz deterministico: calculadora nunca produz Infinity sob entradas adversariais', () => {
  const random = seededRandom(0xA11D17);
  const hostile = [null, undefined, '', 'x', NaN, Infinity, -Infinity, -1e308, 1e308, -1, 0, 0.000001, 1, 99, 1_000_000];
  const value = () => random() < 0.55 ? (random() * 2e12 - 1e12) : pick(random, hostile);
  for (let round = 0; round < 1_000; round += 1) {
    const result = core.calculatePosition({
      mode: random() < 0.5 ? 'spot' : 'futures',
      side: random() < 0.5 ? 'long' : 'short',
      currentQty: value(),
      currentPrice: value(),
      addMultiple: value(),
      addPrice: value(),
      entryFeePct: value(),
      exitFeePct: value(),
      leverage: value(),
      fundingRatePct: value(),
      fundingPeriods: value(),
      maintenancePct: value()
    });
    Object.entries(result).forEach(([key, item]) => {
      if (typeof item === 'number') assert.ok(Number.isFinite(item) || Number.isNaN(item), `${key} nao pode ser infinito`);
    });
    assert.ok(result.currentQty >= 0 && result.currentQty <= 1e15);
    assert.ok(result.currentPrice >= 0 && result.currentPrice <= 1e15);
    assert.ok(result.addMultiple >= 0 && result.addMultiple <= 1e6);
    assert.ok(result.addPrice >= 0 && result.addPrice <= 1e15);
    assert.ok(result.leverage >= 1 && result.leverage <= 125);
    assert.ok(result.entryFeePct >= 0 && result.entryFeePct <= 99);
    assert.ok(result.exitFeePct >= 0 && result.exitFeePct <= 99);
    assert.ok(result.maintenancePct >= 0 && result.maintenancePct <= 99);
    assert.ok(result.fundingRatePct >= -100 && result.fundingRatePct <= 100);
    assert.ok(result.fundingPeriods >= 0 && result.fundingPeriods <= 1e6);
  }
});

test('fuzz deterministico: funcoes de estabilidade numerica nunca emitem Infinity', () => {
  const random = seededRandom(0xF1417E);
  const hostile = [NaN, Infinity, -Infinity, null, undefined, '', 'x', 1e308, -1e308, 1e-308, 0, -1];
  const value = () => random() < 0.6 ? (random() * 2e6 - 1e6) : pick(random, hostile);
  const assertNeverInfinity = (label, result) => {
    if (typeof result === 'number') assert.ok(!(result === Infinity || result === -Infinity), label + ' emitiu Infinity');
  };
  for (let round = 0; round < 500; round += 1) {
    const size = Math.floor(random() * 40);
    const seriesA = Array.from({ length: size }, value);
    const seriesB = Array.from({ length: size }, value);
    const weights = Array.from({ length: size }, value);
    assertNeverInfinity('pearsonCorrelation', core.pearsonCorrelation(seriesA, seriesB));
    assertNeverInfinity('betaCoefficient', core.betaCoefficient(seriesA, seriesB));
    assertNeverInfinity('weightedMedian', core.weightedMedian(seriesA, weights));
    assertNeverInfinity('realizedVolatility', core.realizedVolatility(seriesA.map((item) => Math.abs(core.toFiniteNumber(item) ?? 1) + 1e-9), 14, 365));

    const step = 60_000;
    const candles = Array.from({ length: Math.max(4, size) }, (_ignored, index) => ({
      time: index * step,
      close: random() < 0.85 ? 1 + random() * 1e5 : pick(random, [1e-308, 1e308, 5e307])
    }));
    const end = candles.at(-1).time;
    const start = candles[Math.floor(random() * candles.length)].time;
    assertNeverInfinity('priceChangeOverWindow', core.priceChangeOverWindow(candles, start, end));
  }

  // Caso dirigido da REV-CC-01: razao extrema estourava para Infinity antes da guarda.
  const extremes = [
    { time: 0, close: 1e-308 },
    { time: 60_000, close: 1e-308 },
    { time: 120_000, close: 1e308 },
    { time: 180_000, close: 1e308 }
  ];
  assert.ok(Number.isNaN(core.priceChangeOverWindow(extremes, 0, 180_000)), 'razao extrema deve virar NaN, nunca Infinity');
});
