'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/analytics-core');

function closeTo(actual, expected, tolerance = 1e-9) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function position(overrides = {}) {
  return core.calculatePosition({
    mode: 'futures',
    side: 'long',
    currentQty: 1,
    currentPrice: 100,
    addMultiple: 1,
    addPrice: 80,
    entryFeePct: 0.1,
    exitFeePct: 0.1,
    leverage: 10,
    fundingRatePct: 0.01,
    fundingPeriods: 3,
    maintenancePct: 0.5,
    ...overrides
  });
}

test('calculadora pondera entradas, taxas, margem e liquidacao long', () => {
  const result = position();

  assert.equal(result.quantity, 2);
  assert.equal(result.notional, 180);
  assert.equal(result.executionAverage, 90);
  closeTo(result.tradingFees, 0.3604144144144144);
  closeTo(result.fundingPayment, 0.054);
  closeTo(result.totalCosts, 0.4144144144144144);
  closeTo(result.breakEven, 90.2072072072072);
  closeTo(result.margin, 18);
  closeTo(result.liquidationPrice, 81.45);
});

test('funding positivo e pago por long e recebido por short', () => {
  const long = position({ side: 'long' });
  const short = position({ side: 'short' });
  const shortWithoutFunding = position({ side: 'short', fundingRatePct: 0 });

  closeTo(long.fundingPayment, 0.054);
  closeTo(short.fundingPayment, -0.054);
  assert.ok(short.breakEven > shortWithoutFunding.breakEven);
  closeTo(short.breakEven, 89.84715284715285);
  closeTo(short.liquidationPrice, 98.55);
});

test('funding negativo inverte pagador e recebedor', () => {
  const long = position({ side: 'long', fundingRatePct: -0.01 });
  const short = position({ side: 'short', fundingRatePct: -0.01 });

  closeTo(long.fundingPayment, -0.054);
  closeTo(short.fundingPayment, 0.054);
});

test('spot ignora funding e usa o notional integral como margem', () => {
  const result = position({ mode: 'spot', fundingRatePct: 4, fundingPeriods: 100 });

  assert.equal(result.fundingPayment, 0);
  assert.equal(result.margin, result.notional);
  assert.ok(Number.isNaN(result.liquidationPrice));
});

test('spot nao aceita short e normaliza a direcao para compra', () => {
  const result = position({ mode: 'spot', side: 'short' });

  assert.equal(result.side, 'long');
  assert.equal(result.fundingPayment, 0);
  assert.ok(result.breakEven > result.executionAverage);
});

function tradFiPayload({ timestamps, close, open, high, low, volume }) {
  return {
    chart: {
      result: [{
        timestamp: timestamps,
        indicators: { quote: [{ close, open, high, low, volume }] }
      }]
    }
  };
}

test('TradFi descarta close null em vez de converte-lo em zero', () => {
  const payload = tradFiPayload({
    timestamps: [1_700_000_000, 1_700_086_400, 1_700_172_800],
    open: [99, 109, null],
    high: [101, 111, null],
    low: [98, 108, null],
    close: [100, 110, null],
    volume: [1_000, null, null]
  });

  const rows = core.normalizeTradFiRows(payload);
  const asset = core.normalizeTradFiChart(payload, { symbol: 'QQQ', group: 'Risk proxy' });

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.close), [100, 110]);
  assert.equal(rows[1].volume, null);
  assert.equal(asset.close, 110);
  assert.equal(asset.volume, null);
  assert.equal(asset.change1d, 10);
  assert.equal(asset.change5d, null);
});

test('TradFi rejeita serie sem nenhuma cotacao valida', () => {
  const payload = tradFiPayload({
    timestamps: [1_700_000_000],
    close: [null],
    open: [null],
    high: [null],
    low: [null],
    volume: [null]
  });

  assert.throws(
    () => core.normalizeTradFiChart(payload, { symbol: 'SPY' }),
    /Sem cotacao valida para SPY/
  );
});

test('normalizacao numerica preserva ausencia e aceita strings numericas', () => {
  assert.equal(core.toFiniteNumber(null), null);
  assert.equal(core.toFiniteNumber(''), null);
  assert.equal(core.toFiniteNumber(false), null);
  assert.equal(core.toFiniteNumber('123.45'), 123.45);
  assert.equal(core.percentageChange(0, 100), -100);
  assert.equal(core.percentageChange(100, 0), null);
});

test('somente candles cujo closeTime passou alimentam sinais confirmados', () => {
  const asOf = 10_000;
  const candles = [
    { close: 100, closeTime: 9_000 },
    { close: 101, closeTime: 10_000 },
    { close: 102, closeTime: 11_000 },
    { close: 103 }
  ];

  const closed = core.selectClosedCandles(candles, asOf);

  assert.deepEqual(closed.map((candle) => candle.close), [100, 101]);
  assert.equal(core.isCandleClosed(candles[2], asOf), false);
  assert.equal(candles.length, 4, 'a selecao nao deve mutar a serie original');
});

test('normalizacao de klines mantem closeTime e remove OHLC invalido', () => {
  const rows = [
    [1_000, '100', '105', '95', '102', '12', 1_999, '1200', 10, '7'],
    [2_000, '102', '106', '101', null, '8', 2_999, '800', 8, '4']
  ];

  const candles = core.normalizeKlines(rows);

  assert.equal(candles.length, 1);
  assert.equal(candles[0].close, 102);
  assert.equal(candles[0].closeTime, 1_999);
});

test('RSI de Wilder reproduz a referencia classica de 14 periodos', () => {
  const closes = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
    45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00
  ];
  const series = core.rsiSeries(closes, 14);

  closeTo(series[14], 70.4641350211, 1e-9);
  closeTo(series[15], 66.2496185536, 1e-9);
  closeTo(core.rsi(closes, 14), series[15]);
  assert.equal(series.slice(0, 14).every((value) => value === null), true);
});

test('RSI plano e neutro; alta e baixa puras atingem os extremos', () => {
  assert.equal(core.rsi(Array(20).fill(100), 14), 50);
  assert.equal(core.rsi(Array.from({ length: 20 }, (_, index) => index), 14), 100);
  assert.equal(core.rsi(Array.from({ length: 20 }, (_, index) => 20 - index), 14), 0);
});

function trendCandles(length, direction) {
  return Array.from({ length }, (_, index) => {
    const close = 100 + (index * direction);
    return { high: close + 1, low: close - 1, close };
  });
}

test('ADX de Wilder identifica tendencia crescente deterministica', () => {
  const result = core.adx(trendCandles(40, 1), 14);

  closeTo(result.adx, 100);
  closeTo(result.plus, 50);
  closeTo(result.minus, 0);
});

test('ADX de Wilder identifica tendencia decrescente e mercado plano', () => {
  const down = core.adx(trendCandles(40, -1), 14);
  const flat = core.adx(Array.from({ length: 40 }, () => ({ high: 101, low: 99, close: 100 })), 14);

  closeTo(down.adx, 100);
  closeTo(down.plus, 0);
  closeTo(down.minus, 50);
  closeTo(flat.adx, 0);
  closeTo(flat.plus, 0);
  closeTo(flat.minus, 0);
});

test('primeiro ADX existe com exatamente 2 x periodo candles', () => {
  assert.ok(Number.isNaN(core.adx(trendCandles(27, 1), 14).adx));
  closeTo(core.adx(trendCandles(28, 1), 14).adx, 100);
});

test('proxy de opcoes BTC para altcoin e informativo e nao elegivel para score', () => {
  assert.deepEqual(core.resolveOptionsScope('AVAXUSDT'), {
    asset: 'AVAX',
    currency: 'BTC',
    isProxy: true,
    scope: 'proxy_info',
    eligibleForScore: false
  });
  assert.equal(core.resolveOptionsScope('ETHUSDT').eligibleForScore, true);
});

test('mempool BTC somente influencia o score nativo de Bitcoin', () => {
  const bitcoin = core.bitcoinMempoolContext('BTCUSDT', 90);
  const altcoin = core.bitcoinMempoolContext('ADAUSDT', 90);

  assert.equal(bitcoin.score, -8);
  assert.equal(bitcoin.eligibleForScore, true);
  assert.equal(altcoin.score, 0);
  assert.equal(altcoin.isProxy, true);
  assert.equal(altcoin.eligibleForScore, false);
});

test('request gate invalida respostas obsoletas', () => {
  const gate = core.createRequestGate();
  const first = gate.begin();
  assert.equal(gate.isCurrent(first), true);

  gate.invalidate();
  assert.equal(gate.isCurrent(first), false);

  const second = gate.begin();
  assert.equal(gate.isCurrent(second), true);
  assert.equal(gate.current(), second);
});

test('Data Confidence pondera cobertura sem confundir ausencia com zero valido', () => {
  assert.equal(core.calculateDataConfidence([
    { weight: 20, quality: 1 },
    { weight: 10, quality: 0.5 },
    { weight: 10, quality: 0 }
  ]), 63);
  assert.equal(core.calculateDataConfidence([]), 0);
});

test('fluxo ausente permanece indisponivel e nao recebe vies vendedor', () => {
  const missing = core.calculateCandleFlow([
    { close: 100, volume: null, takerBuy: null },
    { close: 101, volume: null, takerBuy: null }
  ], null);

  assert.equal(missing.available, false);
  assert.equal(missing.score, 0);
  assert.ok(Number.isNaN(missing.deltaSum));
});

test('delta taker neutro e dado valido com contribuicao zero', () => {
  const neutral = core.calculateCandleFlow(Array.from({ length: 26 }, (_, index) => ({
    close: 100 + index,
    volume: 100,
    takerBuy: 50
  })), 0);

  assert.equal(neutral.available, true);
  assert.equal(neutral.deltaSum, 0);
  assert.equal(neutral.score, 0);
});

test('freshness exclui cache stale e timestamp futuro invalido do score', () => {
  assert.equal(core.classifyFreshness(9_000, 2_000, 10_000).status, 'fresh');
  assert.deepEqual(core.classifyFreshness(7_000, 2_000, 10_000), {
    status: 'stale', ageMs: 3_000, staleAfterMs: 2_000, eligibleForScore: false
  });
  assert.equal(core.classifyFreshness(80_000, 2_000, 10_000).status, 'invalid');
  assert.equal(core.classifyFreshness(null, 2_000, 10_000).status, 'missing');
  assert.deepEqual(core.filterFreshByTimestamp([
    { id: 'fresh', published: 9_000 },
    { id: 'missing', published: null },
    { id: 'stale', published: 1_000 }
  ], 'published', 2_000, 10_000).map((row) => row.id), ['fresh']);
});

test('elegibilidade e reclassificada no instante do calculo', () => {
  const dataset = { observedAt: 9_000, staleAfterMs: 2_000, dataStatus: 'fresh' };
  const proxy = { ...dataset, scope: 'proxy_info' };

  assert.equal(core.resolveDatasetFreshness(dataset, 10_000).eligibleForScore, true);
  assert.equal(core.resolveDatasetFreshness(dataset, 12_001).eligibleForScore, false);
  assert.equal(core.resolveDatasetFreshness(proxy, 10_000).status, 'informational');
  assert.equal(core.resolveDatasetFreshness(proxy, 10_000).eligibleForScore, false);
  assert.equal(core.resolveDatasetFreshness({ ...dataset, dataStatus: 'stale' }, 10_000).eligibleForScore, false);
  assert.equal(core.resolveDatasetFreshness({ ...dataset, eligibleForScore: false }, 10_000).eligibleForScore, false);
});

test('derivativo stale e invariavel a remover o dataset', () => {
  const detail = {
    observedAt: 9_000,
    staleAfterMs: 2_000,
    dataStatus: 'fresh',
    oiChangePct: 8,
    takerRatio: 1.2,
    longShortRatio: 2,
    fundingAvg: 0.0005
  };
  const fresh = core.calculateDerivativeDetailContribution({ detail, close: 105, vwap: 100, asOf: 10_000 });
  const stale = core.calculateDerivativeDetailContribution({ detail, close: 105, vwap: 100, asOf: 12_001 });
  const removed = core.calculateDerivativeDetailContribution({ detail: null, close: 105, vwap: 100, asOf: 12_001 });

  assert.notEqual(fresh, 0);
  assert.equal(stale, removed);
  assert.equal(stale, 0);
});

test('freshness por metrica impede serie nova de rejuvenescer serie antiga', () => {
  const detail = {
    observedAt: 10_000,
    staleAfterMs: 2_000,
    dataStatus: 'fresh',
    metricObservedAt: { oiChangePct: 1_000, takerRatio: 10_000 },
    metricStaleAfterMs: { oiChangePct: 2_000, takerRatio: 2_000 },
    oiChangePct: 8,
    takerRatio: 1.2
  };

  assert.equal(core.isDatasetMetricEligible(detail, 'oiChangePct', 10_000), false);
  assert.equal(core.isDatasetMetricEligible(detail, 'takerRatio', 10_000), true);
  assert.equal(core.calculateDerivativeDetailContribution({ detail, close: 105, vwap: 100, asOf: 10_000 }), 3);
});
