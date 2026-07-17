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

test('calculadora aplica no core os limites declarados pela interface', () => {
  const result = position({
    currentQty: 1e200,
    currentPrice: 1e200,
    addMultiple: 1e200,
    addPrice: 1e200,
    leverage: 1_000,
    entryFeePct: 150,
    exitFeePct: 200,
    maintenancePct: 500,
    fundingRatePct: -500,
    fundingPeriods: 2e6 + 0.9
  });
  assert.equal(result.currentQty, 1e15);
  assert.equal(result.currentPrice, 1e15);
  assert.equal(result.addMultiple, 1e6);
  assert.equal(result.addPrice, 1e15);
  assert.equal(result.leverage, 125);
  assert.equal(result.entryFeePct, 99);
  assert.equal(result.exitFeePct, 99);
  assert.equal(result.maintenancePct, 99);
  assert.equal(result.fundingRatePct, -100);
  assert.equal(result.fundingPeriods, 1e6);
  assert.ok(Number.isFinite(result.notional));
  assert.ok(Number.isFinite(result.fundingPayment));
  assert.ok(Number.isFinite(result.breakEven));
  assert.ok(Number.isFinite(result.liquidationPrice));
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

test('TradFi ordena, deduplica e rejeita timestamp/preco/volume impossiveis', () => {
  const payload = tradFiPayload({
    timestamps: [1_700_086_400, -1, 1_700_000_000, 1_700_086_400],
    open: [109, 1, 99, 110], high: [111, 1, 101, 112], low: [108, 1, 98, 109],
    close: [110, 1, -100, 111], volume: [-5, 1, 10, 20],
  });
  const rows = core.normalizeTradFiRows(payload);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].close, 111, 'a ultima observacao valida para o timestamp vence');
  assert.equal(rows[0].volume, 20);
  assert.equal(core.normalizeTradFiChart(payload, { symbol: 'QQQ' }).close, 111);
});

test('normalizacao numerica preserva ausencia e aceita strings numericas', () => {
  assert.equal(core.toFiniteNumber(null), null);
  assert.equal(core.toFiniteNumber(''), null);
  assert.equal(core.toFiniteNumber(false), null);
  assert.equal(core.toFiniteNumber('123.45'), 123.45);
  assert.equal(core.percentageChange(0, 100), -100);
  assert.equal(core.percentageChange(100, 0), null);
});

test('timestamps Date e series vazias permanecem semanticamente validos/indisponiveis', () => {
  assert.equal(core.toTimestampMs(new Date('2026-07-13T00:00:00Z')), Date.parse('2026-07-13T00:00:00Z'));
  assert.equal(core.toTimestampMs(new Date('invalida')), null);
  assert.equal(Number.isNaN(core.rsi([], 14)), true);
});

test('calendario ETF separa zero reportado de placeholder em fechamento dos EUA', () => {
  assert.equal(core.isUsEquityTradingDay('2026-07-02'), true);
  assert.equal(core.isUsEquityTradingDay('2026-07-03'), false, 'Independence Day observado');
  assert.equal(core.isUsEquityTradingDay('2026-06-19'), false, 'Juneteenth');
  assert.equal(core.isUsEquityTradingDay('2026-04-03'), false, 'Good Friday');
  assert.equal(core.isUsEquityTradingDay('2026-07-11'), false, 'fim de semana');
  assert.equal(core.isUsEquityTradingDay('2021-12-31'), false, 'Ano Novo de 2022 observado na sexta anterior');

  assert.deepEqual(core.classifyEtfFlowObservation({ date: '2026-07-02' }, 0), { reported: true, reason: 'trading-day-zero', date: '2026-07-02' });
  assert.deepEqual(core.classifyEtfFlowObservation({ date: '2026-07-03' }, 0), { reported: false, reason: 'market-closed-placeholder', date: '2026-07-03' });
  assert.equal(core.classifyEtfFlowObservation({ date: '2026-07-11' }, 12).reported, true, 'valor nao zero explicito prevalece sobre calendario');
  assert.equal(core.classifyEtfFlowObservation({ date: '2026-07-02', reported: false }, 12).reported, false, 'flag explicita do provedor prevalece');
  assert.equal(core.classifyEtfFlowObservation({ date: '2026-07-02', status: 'pending' }, 0).reported, false);
});

test('linha temporal mais recente independe da ordem do upstream e rejeita datas invalidas', () => {
  const newest = core.latestTimestampedRow([
    { date: '2026-07-12', value: 12 },
    { date: 'nao-e-data', value: 99 },
    { date: '2026-07-10', value: 10 },
    { timestamp: 1783987200, value: 13 },
  ], ['date', 'timestamp']);
  assert.equal(newest.value, 13);
  assert.equal(core.toTimestampMs(''), null);
  assert.equal(core.toTimestampMs(false), null);
  assert.equal(core.toTimestampMs(1783987200), 1783987200000);
  const asOf = Date.parse('2026-07-13T00:00:00Z');
  const bounded = core.latestTimestampedRow([
    { timestamp: -1, value: 'negativo' },
    { date: '2026-07-12', value: 'valido' },
    { date: '2099-01-01', value: 'futuro' },
  ], ['date', 'timestamp'], asOf);
  assert.equal(bounded.value, 'valido');
});

test('rank e tamanho sem variacao nao fabricam contexto direcional de mercado', () => {
  assert.deepEqual(core.calculateMarketTrendContext({ market_cap_rank: 1 }), {
    available: false, score: 0, quality: 0, change7d: null, change30d: null,
  });
  const partial = core.calculateMarketTrendContext({ market_cap_rank: 1, price_change_percentage_7d_in_currency: '10' });
  assert.equal(partial.available, true);
  assert.equal(partial.score, 5);
  assert.equal(partial.quality, 0.5);
});

test('volatilidade realizada exige a janela inteira valida', () => {
  const values = Array.from({ length: 31 }, (_, index) => 100 + index);
  assert.ok(Number.isFinite(core.realizedVolatility(values, 30, 365)));
  const missing = values.slice();
  missing[15] = null;
  assert.ok(Number.isNaN(core.realizedVolatility(missing, 30, 365)));
  assert.ok(Number.isNaN(core.realizedVolatility(values.slice(1), 30, 365)));
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

test('normalizacao de klines rejeita invariantes impossiveis, ordena e deduplica', () => {
  const validLate = [2_000, '102', '106', '101', '105', '12', 2_999, '1200', 10, '7'];
  const validEarly = [1_000, '100', '105', '95', '102', '12', 1_999, '1200', 10, '7'];
  const duplicateReplacement = [1_000, '101', '106', '96', '103', '13', 1_999, '1300', 11, '8'];
  const malformed = [
    [3_000, '100', '99', '95', '102', '12', 3_999, '1200', 10, '7'], // high abaixo do close
    [4_000, '100', '105', '101', '102', '12', 4_999, '1200', 10, '7'], // low acima do open
    [5_000, '100', '105', '95', '102', '-1', 5_999, '1200', 10, '0'],
    [6_000, '100', '105', '95', '102', '4', 6_999, '1200', 10, '5'],
    [7_000, '100', '105', '95', '102', '4', 6_999, '1200', 10, '2'],
    [-1, '100', '105', '95', '102', '4', 999, '1200', 10, '2'],
    [8_000, '100', '105', '95', '102', '4', -1, '1200', 10, '2'],
  ];
  const candles = core.normalizeKlines([validLate, validEarly, ...malformed, duplicateReplacement]);
  assert.deepEqual(candles.map((row) => row.time), [1_000, 2_000]);
  assert.equal(candles[0].close, 103, 'a ultima linha valida para o mesmo open time vence');
});

test('veto pos-trap usa duracao real de 1s e preserva chaves independentes', () => {
  let registry = core.upsertTrapVeto({}, 'BTCUSDT:1s', 'short', 10_000, 6, '1s');
  registry = core.upsertTrapVeto(registry, 'ETHUSDT:5m', 'long', 20_000, 4, '5m');
  assert.equal(core.intervalToMilliseconds('1s'), 1_000);
  assert.equal(core.activeTrapVeto(registry, 'BTCUSDT:1s', 15_999), 'short');
  assert.equal(core.activeTrapVeto(registry, 'BTCUSDT:1s', 16_000), null);
  assert.equal(core.activeTrapVeto(registry, 'ETHUSDT:5m', 20_001), 'long');
  assert.equal(core.trapVetoBarsLeft(registry, 'ETHUSDT:5m', 20_000, '5m'), 4);
  assert.equal(core.intervalToMilliseconds('desconhecido'), null);
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

// ===== Ciclo B: percentis, estrutura, divergencia, climax =====

test('percentileRank: midrank robusto a empates (funding pinado no baseline = neutro)', () => {
  const series = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
  assert.equal(core.percentileRank(series, 100), 99.5);
  assert.equal(core.percentileRank(series, 50), 49.5);
  assert.equal(core.percentileRank(series, 0.5), 0);
  // Funding pinado em 0.0001 por semanas: valor igual a moda deve ler ~50, nunca extremo.
  assert.equal(core.percentileRank(Array(40).fill(0.0001), 0.0001), 50);
  // Caso misto: 700 no baseline, 250 abaixo, 50 acima -> midrank = (250+350)/1000 = 60, nao 95.
  const pinned = [].concat(Array(250).fill(0.00005), Array(700).fill(0.0001), Array(50).fill(0.0002));
  assert.equal(core.percentileRank(pinned, 0.0001), 60);
  // Serie insuficiente nao produz percentil (fallback para thresholds fixos).
  assert.equal(core.percentileRank([1, 2, 3], 2, 30), null);
  assert.equal(core.percentileRank(null, 2), null);
  assert.equal(core.percentileRank(series, NaN), null);
});

test('percentileExtremeContribution: rampa continua a partir do limiar da cauda (sem degrau)', () => {
  assert.equal(core.percentileExtremeContribution(90, 6, false), 0, 'exatamente no limiar = 0');
  closeTo(core.percentileExtremeContribution(90.01, 6, false), -0.006, 0.001);
  closeTo(core.percentileExtremeContribution(95, 6, false), -3);
  closeTo(core.percentileExtremeContribution(100, 6, false), -6);
  closeTo(core.percentileExtremeContribution(5, 6, false), 3);
  closeTo(core.percentileExtremeContribution(95, 4, true), 2, 1e-9);
});

test('percentis substituem thresholds fixos nos derivativos quando a serie e suficiente', () => {
  const asOf = 10_000;
  const detail = (extra) => Object.assign({ observedAt: 9_000, staleAfterMs: 2_000, dataStatus: 'fresh' }, extra);
  // Funding no percentil 98 do proprio historico = long lotado extremo -> contrarian negativo escalado por (p-50)/50.
  const crowded = core.calculateDerivativeDetailContribution({
    detail: detail({ fundingAvg: 0.0002 }), percentiles: { funding: 98 }, asOf
  });
  assert.ok(crowded <= -4.5, `funding p98 deve pontuar <= -4.5, veio ${crowded}`);
  // Mesmo valor absoluto com percentil neutro = 0 (o threshold fixo de 0.0002 tambem daria 0).
  const typical = core.calculateDerivativeDetailContribution({
    detail: detail({ fundingAvg: 0.0002 }), percentiles: { funding: 55 }, asOf
  });
  assert.equal(typical, 0);
  // Funding no percentil 3 = shorts lotados vs propria historia -> combustivel positivo.
  const fuel = core.calculateDerivativeDetailContribution({
    detail: detail({ fundingAvg: -0.00005 }), percentiles: { funding: 3 }, asOf
  });
  assert.ok(fuel >= 4, `funding p3 deve pontuar >= +4, veio ${fuel}`);
  // Varejo (longShort) e contrarian; top traders (topPosition) sao seguidos.
  const retailCrowded = core.calculateDerivativeDetailContribution({
    detail: detail({ longShortRatio: 1.2 }), percentiles: { longShort: 95 }, asOf
  });
  assert.ok(retailCrowded < 0);
  const topCrowded = core.calculateDerivativeDetailContribution({
    detail: detail({ topPositionRatio: 1.2 }), percentiles: { topPosition: 95 }, asOf
  });
  assert.ok(topCrowded > 0);
  // Taker e fluxo: percentil alto de compra agressiva e seguido.
  const takerHot = core.calculateDerivativeDetailContribution({
    detail: detail({ takerRatio: 1.01 }), percentiles: { taker: 96 }, asOf
  });
  assert.ok(takerHot > 0);
  // Sem percentil, o threshold fixo continua valendo (fallback).
  const fallback = core.calculateDerivativeDetailContribution({
    detail: detail({ takerRatio: 1.2 }), asOf
  });
  assert.equal(fallback, 3);
});

test('derivativos: clamp conjunto das lentes de funding (percentil + carry) em +/-7 (preview.6)', () => {
  const asOf = 10_000;
  const detail = (extra) => Object.assign({ observedAt: 9_000, staleAfterMs: 2_000, dataStatus: 'fresh' }, extra);
  // Percentil p98 sozinho = -4.8 (dentro de +/-7, sem clamp e sem carry passado).
  closeTo(core.calculateDerivativeDetailContribution({ detail: detail({ fundingAvg: 0.0002 }), percentiles: { funding: 98 }, asOf }), -4.8, 0.001);
  // p98 (-4.8) + carry de euforia (-3) = -7.8 -> clampado para -7 (cauda correlacionada limitada).
  assert.equal(core.calculateDerivativeDetailContribution({ detail: detail({ fundingAvg: 0.0002 }), percentiles: { funding: 98 }, carryScore: -3, asOf }), -7);
  // Lado positivo simetrico: p3 (+4.2) + carry backwardation (+3) = +7.2 -> +7.
  assert.equal(core.calculateDerivativeDetailContribution({ detail: detail({ fundingAvg: -0.00005 }), percentiles: { funding: 3 }, carryScore: 3, asOf }), 7);
  // Carry sozinho (funding nao elegivel) mantem autoridade plena dentro do clamp.
  assert.equal(core.calculateDerivativeDetailContribution({ detail: {}, carryScore: -3, asOf }), -3);
});

test('obvSeries acumula volume assinado pelo sentido do fechamento', () => {
  const candles = [
    { close: 100, volume: 10 },
    { close: 101, volume: 20 },
    { close: 99, volume: 5 },
    { close: 99, volume: 7 },
    { close: 102, volume: 3 }
  ];
  assert.deepEqual(core.obvSeries(candles), [0, 20, 15, 15, 18]);
  assert.deepEqual(core.obvSeries([]), []);
});

function shiftCandles(closes, startTime = 0) {
  return closes.map((close, i) => ({ time: startTime + i, close, high: close + 1, low: close - 1 }));
}

test('CHoCH: fechar atraves do ultimo HL confirmado flipa a estrutura de alta', () => {
  // Uptrend com pivot low confirmado em 100; ultimo close fecha em 97 (abaixo do HL).
  const pivotLows = [{ price: 95, time: 2 }, { price: 100, time: 8 }];
  const pivotHighs = [{ price: 105, time: 5 }, { price: 110, time: 11 }];
  const candles = shiftCandles([96, 98, 95.5, 99, 103, 105, 103, 101, 100.5, 104, 108, 110, 106, 97]);
  const shift = core.detectStructureShift(candles, pivotHighs, pivotLows);
  assert.equal(shift.event, 'CHoCH');
  assert.equal(shift.direction, 'bear');
  assert.equal(shift.score, -6);
  assert.equal(shift.brokenLevel, 100);
});

test('CHoCH espelhado: fechar acima do ultimo LH confirmado flipa a estrutura de baixa', () => {
  const candles = [10, 10, 10, 11, 13].map((close, time) => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 1 }));
  const highs = [{ time: 0, price: 15 }, { time: 2, price: 12 }];
  const lows = [{ time: 0, price: 10 }, { time: 2, price: 8 }];
  assert.deepEqual(core.detectStructureShift(candles, highs, lows), {
    event: 'CHoCH', direction: 'bull', score: 6, brokenLevel: 12, barsAgo: 0,
  });
});

test('BOS: rompimento a favor da tendencia pontua continuacao, sem evento em range', () => {
  // Uptrend: close rompe o ultimo pivot high (110) -> BOS bull +4.
  const pivotHighs = [{ price: 105, time: 5 }, { price: 110, time: 9 }];
  const pivotLows = [{ price: 95, time: 2 }, { price: 100, time: 7 }];
  const bos = core.detectStructureShift(shiftCandles([98, 100, 96, 102, 104, 105, 101, 100.2, 107, 110, 108, 112]), pivotHighs, pivotLows);
  assert.equal(bos.event, 'BOS');
  assert.equal(bos.direction, 'bull');
  assert.equal(bos.score, 4);
  // Sem cruzamento de pivot -> sem evento.
  const flat = core.detectStructureShift(shiftCandles([100, 101, 100, 101, 100, 101, 100, 101, 100, 101, 100, 101]), pivotHighs, pivotLows);
  assert.equal(flat.event, null);
  assert.equal(flat.score, 0);
});

test('divergencia: preco faz HH com indicador em LH (bearish) e espelho (bullish)', () => {
  // 14 candles; pivot highs nos indices 4 e 10 (por time).
  const candles = shiftCandles([100, 102, 104, 106, 108, 105, 103, 104, 106, 109, 111, 108, 107, 106]);
  const pivotHighs = [{ price: 108, time: 4 }, { price: 111, time: 10 }];
  const indicator = [50, 55, 60, 65, 70, 66, 60, 58, 61, 64, 66, 60, 55, 52]; // 70 -> 66: LH
  const div = core.detectDivergence(candles, indicator, pivotHighs, []);
  assert.equal(div.bearish, true);
  assert.equal(div.bullish, false);
  // Espelho: preco LL com indicador HL.
  const candlesDown = shiftCandles([100, 97, 94, 92, 90, 93, 95, 94, 92, 89, 88, 91, 92, 93]);
  const pivotLows = [{ price: 90, time: 4 }, { price: 88, time: 10 }];
  const indicatorUp = [50, 45, 40, 35, 30, 34, 38, 36, 34, 33, 36, 40, 42, 44]; // 30 -> 36: HL
  const div2 = core.detectDivergence(candlesDown, indicatorUp, [], pivotLows);
  assert.equal(div2.bullish, true);
  assert.equal(div2.bearish, false);
  // Indicador confirmando (HH junto) nao e divergencia.
  const confirming = core.detectDivergence(candles, [50,55,60,65,70,66,60,58,61,64,75,70,65,60], pivotHighs, []);
  assert.equal(confirming.bearish, false);
});

test('divergencia ignora pivots que nao pertencem a serie causal', () => {
  const candles = [{ time: 1, close: 10 }, { time: 2, close: 11 }];
  assert.deepEqual(core.detectDivergence(candles, [40, 50], [{ time: 1, price: 10 }, { time: 999, price: 12 }], []), {
    bearish: false, bullish: false,
  });
});

test('climax de volume: 3 sigmas + range 2x ATR + fecho no terco oposto apos perna estendida = exaustao', () => {
  // 60 candles de base com volume ~100, depois perna de alta estendida e candle climatico:
  const base = Array.from({ length: 60 }, (_, i) => ({ time: i, open: 100, high: 101, low: 99, close: 100 + (i % 2 ? 0.3 : -0.3), volume: 100 }));
  const leg = Array.from({ length: 8 }, (_, i) => ({ time: 60 + i, open: 100 + i * 2, high: 102 + i * 2, low: 99.5 + i * 2, close: 102 + i * 2, volume: 110 }));
  // Candle climatico: volume 600 (>>3 sigma), range 10 (>2x ATR ~2), fecha no terco INFERIOR apos perna de alta.
  const climax = { time: 68, open: 118, high: 126, low: 116, close: 117, volume: 600 };
  const result = core.detectVolumeClimax(base.concat(leg, [climax]), 2);
  assert.equal(result.climax, true);
  assert.equal(result.direction, 'exhaustion-top');
  // Mesmo candle fechando forte no terco superior NAO e exaustao (e continuacao).
  const strong = { time: 68, open: 118, high: 126, low: 117.5, close: 125.5, volume: 600 };
  const cont = core.detectVolumeClimax(base.concat(leg, [strong]), 2);
  assert.equal(cont.climax, false);
});

test('squeeze: BB dentro do Keltner com bandwidth comprimido liga, e liberacao confirmada por delta pontua', () => {
  // 40 barras dispersas (bandwidth alto) seguidas de 60 comprimidas: squeeze ON no fim.
  const wide = Array.from({ length: 40 }, (_, i) => {
    const close = 100 + (i % 2 ? 1.5 : -1.5);
    return { time: i, open: 100, high: close + 2, low: close - 2, close, volume: 100, takerBuy: 50 };
  });
  const tight = Array.from({ length: 60 }, (_, i) => {
    // Amplitude decrescente: o bandwidth cai ao longo da compressao, entao o ultimo valor esta
    // no piso do proprio historico (percentil baixo) — como numa compressao real.
    const amplitude = 0.3 * (1 - i / 60) + 0.02;
    const close = 100 + (i % 2 ? amplitude : -amplitude);
    return { time: 40 + i, open: 100, high: close + 1.5, low: close - 1.5, close, volume: 100, takerBuy: 50 };
  });
  const compressed = wide.concat(tight);
  const on = core.detectSqueeze(compressed);
  assert.equal(on.on, true, 'BB dentro do KC com bandwidth no piso historico deve ligar o squeeze');
  assert.equal(on.released, null);
  assert.equal(on.score, 0);
  // Impulsos de alta com corpo grande expandem a BB para fora do KC -> liberacao bull.
  const impulses = Array.from({ length: 5 }, (_, i) => {
    const close = 100 + (i + 1) * 4;
    return { time: 100 + i, open: close - 4, high: close + 0.6, low: close - 4.6, close, volume: 300, takerBuy: 240 };
  });
  const released = core.detectSqueeze(compressed.concat(impulses), { deltaSum: 500 });
  assert.equal(released.released, 'bull');
  assert.equal(released.score, 6, 'liberacao bull confirmada por delta positivo = +6');
  const unconfirmed = core.detectSqueeze(compressed.concat(impulses), { deltaSum: -500 });
  assert.equal(unconfirmed.released, 'bull');
  assert.equal(unconfirmed.score, 0, 'delta contra a liberacao nao pontua');
  const ordinary = Array.from({ length: 80 }, (_, index) => ({
    time: index, open: 100 + index, high: 102 + index, low: 98 + index, close: 100 + index, volume: 100, takerBuy: 50,
  }));
  assert.equal(core.detectSqueeze(ordinary).released, null, 'sem transicao recente nao fabrica liberacao');
});

test('carry: funding anualizado ancora euforia/estresse em termos absolutos e detecta regime delta-neutro', () => {
  // fundingAvg e por periodo de 8h -> x3 x365 x100 = % a.a.
  const euphoric = core.calculateCarryRegime({ fundingAvg: 0.0003 });
  closeTo(euphoric.annualizedCarryPct, 32.85, 0.01);
  assert.equal(euphoric.carryScore, -3, 'carry >30% a.a. e euforia (cash-and-carry lotado)');
  assert.equal(core.calculateCarryRegime({ fundingAvg: 0.00015 }).carryScore, -2, '15-30% pede cautela');
  assert.equal(core.calculateCarryRegime({ fundingAvg: -0.0001 }).carryScore, 2, 'backwardation persistente e combustivel');
  // preview.6: degrau de capitulacao no lado negativo (simetria de magnitude com euforia -3),
  // sem elevar o piso (funding neutro ~+11% a.a. -> qualquer negativo ja e anomalo).
  assert.equal(core.calculateCarryRegime({ fundingAvg: -0.0003 }).carryScore, 3, 'backwardation profunda < -30% a.a. = capitulacao -> +3');
  assert.equal(core.calculateCarryRegime({ fundingAvg: -0.00025 }).carryScore, 2, 'backwardation em -15..-30% a.a. segue em +2 (sem zona morta)');
  const neutral = core.calculateCarryRegime({ fundingAvg: 0.00003, oiPercentile: 85 });
  assert.equal(neutral.carryScore, 0);
  assert.equal(neutral.deltaNeutral, true, 'carry ~0 com OI no p85 = OI hedgeado (basis trade)');
  assert.equal(neutral.muteBuildup, true);
  assert.equal(core.calculateCarryRegime({ fundingAvg: 0.00003, oiPercentile: 60 }).deltaNeutral, false);
  assert.equal(core.calculateCarryRegime({ fundingAvg: null }).carryScore, 0);
  assert.equal(core.calculateCarryRegime({ fundingAvg: null }).annualizedCarryPct, null);
});

test('fluxo: volume relativo alto sozinho nao adiciona bonus direcional (preview.6)', () => {
  // Delta neutro em todos os candles (takerBuy = metade do volume -> delta 0) e um ultimo candle
  // de volume 10x a media. Antes somava +5 direcionless (um selloff de volume alto nao e altista).
  const rows = Array.from({ length: 25 }, () => ({ volume: 10, takerBuy: 5 }));
  rows.push({ volume: 100, takerBuy: 50 });
  const flow = core.calculateCandleFlow(rows, null);
  assert.equal(flow.deltaSum, 0, 'delta neutro');
  assert.equal(flow.score, 0, 'volume alto sem direcao nao pontua (antes +5)');
  assert.equal(flow.available, true, 'volume ainda marca cobertura de dados');
});

function trapBars(priorLow) {
  // Sweep da minima (98.5 < 100) com delta vendedor, depois reclaim com delta comprador.
  return [
    { time: 0, open: 101, high: 101.5, low: 100.2, close: 100.8, volume: 100, takerBuy: 50 },
    { time: 1, open: 100.8, high: 101, low: 100.1, close: 100.4, volume: 100, takerBuy: 48 },
    { time: 2, open: 100.4, high: 100.6, low: 98.5, close: 99.2, volume: 180, takerBuy: 40 },
    { time: 3, open: 99.2, high: 100.9, low: 99.0, close: 100.8, volume: 150, takerBuy: 110 },
    { time: 4, open: 100.8, high: 101.4, low: 100.5, close: 101.2, volume: 120, takerBuy: 85 }
  ];
}

test('trap engine: sweep + reclaim + flip de delta com confirmacao de OI vira sinal com veto', () => {
  const confirmed = core.detectTrap(trapBars(), { atr: 2, priorLow: 100, priorHigh: 106, oiChangePct: -4 });
  assert.equal(confirmed.trap, 'bull', 'bear trap (sweep de minima revertido) e sinal bullish');
  assert.equal(confirmed.score, 8, 'com flush de OI confirmando, score maximo');
  assert.equal(confirmed.vetoDirection, 'short', 'entradas vendidas ficam vetadas');
  assert.ok(confirmed.vetoBars >= 4);
  assert.equal(confirmed.level, 100);
  // Sem confirmacao de OI/liquidacao, ainda e trap (taker flip presente) com score menor.
  const partial = core.detectTrap(trapBars(), { atr: 2, priorLow: 100, priorHigh: 106, oiChangePct: 0 });
  assert.equal(partial.trap, 'bull');
  assert.equal(partial.score, 6);
});

test('trap engine: sem reclaim nao ha trap, e o espelho bearish veta longs', () => {
  // Preco varre a minima e FICA embaixo: nao e trap, e rompimento.
  const noReclaim = trapBars().map((bar) => ({ ...bar }));
  noReclaim[3] = { time: 3, open: 99.2, high: 99.6, low: 98.8, close: 99.0, volume: 90, takerBuy: 40 };
  noReclaim[4] = { time: 4, open: 99.0, high: 99.4, low: 98.2, close: 98.6, volume: 95, takerBuy: 42 };
  assert.equal(core.detectTrap(noReclaim, { atr: 2, priorLow: 100, priorHigh: 106, oiChangePct: -4 }).trap, null);
  // Espelho: sweep de maxima rejeitado = bull trap = sinal bearish + veto de longs.
  const bullTrapBars = [
    { time: 0, open: 105, high: 105.6, low: 104.6, close: 105.2, volume: 100, takerBuy: 52 },
    { time: 1, open: 105.2, high: 105.8, low: 104.9, close: 105.5, volume: 100, takerBuy: 55 },
    { time: 2, open: 105.5, high: 107.6, low: 105.3, close: 106.6, volume: 180, takerBuy: 140 },
    { time: 3, open: 106.6, high: 106.8, low: 105.0, close: 105.2, volume: 150, takerBuy: 40 },
    { time: 4, open: 105.2, high: 105.4, low: 104.4, close: 104.8, volume: 120, takerBuy: 35 }
  ];
  const bullTrap = core.detectTrap(bullTrapBars, { atr: 2, priorLow: 100, priorHigh: 106, liquidationBias: 'buy' });
  assert.equal(bullTrap.trap, 'bear');
  assert.equal(bullTrap.score, -8, 'liq spike do lado oposto confirma');
  assert.equal(bullTrap.vetoDirection, 'long');

  const doubleSweep = [
    { time: 0, high: 105, low: 101, close: 103, volume: 100, takerBuy: 50 },
    { time: 1, high: 105, low: 101, close: 103, volume: 100, takerBuy: 50 },
    { time: 2, high: 107, low: 99, close: 103, volume: 100, takerBuy: 50 },
    { time: 3, high: 105, low: 101, close: 103, volume: 100, takerBuy: 50 },
  ];
  assert.equal(core.detectTrap(doubleSweep, { atr: 2, priorLow: 100, priorHigh: 106, oiChangePct: -4 }).trap, null, 'double sweep simultaneo e chop ambiguo');

  const orderedSweeps = doubleSweep.map((row) => ({ ...row }));
  orderedSweeps[1] = { ...orderedSweeps[1], low: 99 };
  orderedSweeps[2] = { ...orderedSweeps[2], low: 101, high: 107 };
  assert.equal(core.detectTrap(orderedSweeps, { atr: 2, priorLow: 100, priorHigh: 106, oiChangePct: -4 }).trap, 'bear', 'o sweep mais recente prevalece');
});

test('weightedMedian pondera amostras por peso (decay temporal do historico)', () => {
  assert.equal(core.weightedMedian([1, 2, 3, 4, 5], [1, 1, 1, 1, 1]), 3);
  // Peso esmagador numa amostra puxa a mediana para ela.
  assert.equal(core.weightedMedian([1, 2, 10], [0.1, 0.1, 10]), 10);
  // Ordem de entrada nao importa.
  assert.equal(core.weightedMedian([10, 1, 2], [10, 0.1, 0.1]), 10);
  assert.equal(core.weightedMedian([1, 2], [1e308, 1e308]), 1, 'normalizacao evita overflow do peso total');
  assert.ok(Number.isNaN(core.weightedMedian([], [])));
  assert.ok(Number.isNaN(core.weightedMedian([1, 2], [0, 0])));
});

test('FVG: gap totalmente preenchido deixa de ser reportado; gap aberto permanece', () => {
  const base = [
    { time: 1, open: 99, high: 100, low: 98, close: 99 },
    { time: 2, open: 100, high: 102, low: 99, close: 101 },
    { time: 3, open: 104, high: 106, low: 103, close: 105 },
  ];
  assert.deepEqual(core.findOpenFairValueGap(base), { type: 'bullish', low: 100, high: 103, time: 3 });
  assert.equal(core.findOpenFairValueGap(base.concat([{ time: 4, open: 104, high: 105, low: 99, close: 101 }])), null);
});

test('DVOL direcional: vol subindo so e medo quando o preco nao sobe junto', () => {
  const asOf = 10_000;
  const optionsWith = (change7d) => ({ observedAt: 9_000, staleAfterMs: 2_000, dataStatus: 'fresh', dvol: { change7d } });
  // Vol +15% com preco caindo = stress -> -2.
  assert.equal(core.calculateDerivativeDetailContribution({ options: optionsWith(15), priceChange7dPct: -4, asOf }), -2);
  // Vol +15% com preco subindo = spot-vol positivo de rally (compra de calls), nao medo -> 0.
  assert.equal(core.calculateDerivativeDetailContribution({ options: optionsWith(15), priceChange7dPct: 6, asOf }), 0);
  // Sem leitura de preco, mantem a leitura conservadora de stress.
  assert.equal(core.calculateDerivativeDetailContribution({ options: optionsWith(15), asOf }), -2);
  // Vol crush continua construtivo.
  assert.equal(core.calculateDerivativeDetailContribution({ options: optionsWith(-15), priceChange7dPct: 2, asOf }), 1);
});

test('regime delta-neutro muta o quadrante de OI no scorer de derivativos', () => {
  const asOf = 10_000;
  const detail = { observedAt: 9_000, staleAfterMs: 2_000, dataStatus: 'fresh', oiChangePct: 8 };
  const normal = core.calculateDerivativeDetailContribution({ detail, oiPriceChangePct: 2, asOf });
  assert.equal(normal, 3, 'long buildup pontua +3 em regime direcional');
  const muted = core.calculateDerivativeDetailContribution({ detail, oiPriceChangePct: 2, muteOiQuadrant: true, asOf });
  assert.equal(muted, 0, 'OI hedgeado (basis trade) nao e leitura direcional');
});

// ===== Ciclo C: motor de sinais v2 =====

function machineSnapshot(overrides) {
  return Object.assign({
    symbol: 'BTCUSDT', interval: '1h', total: 50, close: 100, high: 101, low: 99,
    closeTime: 1_000_000, atr: 2, regime: 'Tendencia de alta',
    supports: [97, 92], resistances: [104, 110],
    structureShift: { event: null, direction: null, score: 0, brokenLevel: null },
    divergence: { bearish: false, bullish: false },
    trap: { trap: null }, squeeze: { released: null, score: 0 },
    gates: { htfAvailable: true, htfVetoLong: false, htfVetoShort: false, trapVeto: null },
    inputSnapshotId: 'snap-1'
  }, overrides);
}

test('sinais v2: entrada long exige score, gatilho nomeado, gate HTF e ausencia de veto', () => {
  const trigger = machineSnapshot({ structureShift: { event: 'CHoCH', direction: 'bull', score: 6, brokenLevel: 98 } });
  const entry = core.evaluateSignalTransition(null, trigger);
  assert.ok(entry.state, 'estado ATIVO criado');
  assert.equal(entry.state.phase, 'ACTIVE');
  assert.equal(entry.state.side, 'long');
  assert.equal(entry.state.trigger, 'choch');
  assert.ok(entry.state.stopPrice < 100, 'stop estrutural abaixo da entrada');
  assert.ok(entry.state.stopPrice < 97, 'stop atras do swing (suporte), nao ATR generico');
  assert.equal(entry.state.targetPrice, 104, 'alvo no nivel estrutural');
  assert.equal(entry.state.maxBars, 30, 'regime de tendencia segura mais tempo');
  assert.equal(entry.event.type, 'entry');
  // Sem gatilho nomeado: score alto sozinho NAO entra.
  assert.equal(core.evaluateSignalTransition(null, machineSnapshot({ total: 80 })).state, null);
  // Veto pos-trap bloqueia a direcao.
  assert.equal(core.evaluateSignalTransition(null, machineSnapshot({
    structureShift: { event: 'CHoCH', direction: 'bull', score: 6 }, gates: { htfAvailable: true, htfVetoLong: false, htfVetoShort: false, trapVeto: 'long' }
  })).state, null);
  // Gate HTF indisponivel bloqueia.
  assert.equal(core.evaluateSignalTransition(null, machineSnapshot({
    structureShift: { event: 'CHoCH', direction: 'bull', score: 6 }, gates: { htfAvailable: false, htfVetoLong: false, htfVetoShort: false, trapVeto: null }
  })).state, null);
  // 1d+1w contra vetam.
  assert.equal(core.evaluateSignalTransition(null, machineSnapshot({
    structureShift: { event: 'CHoCH', direction: 'bull', score: 6 }, gates: { htfAvailable: true, htfVetoLong: true, htfVetoShort: false, trapVeto: null }
  })).state, null);
});

test('sinais v2: entrada short espelhada e guarda de R:R minimo', () => {
  const short = core.evaluateSignalTransition(null, machineSnapshot({
    total: -55, regime: 'Range', supports: [96, 92], resistances: [102, 110],
    structureShift: { event: 'CHoCH', direction: 'bear', score: -6, brokenLevel: 102 }
  }));
  assert.equal(short.state.side, 'short');
  assert.ok(short.state.stopPrice > 100);
  assert.equal(short.state.targetPrice, 96);
  assert.equal(short.state.maxBars, 12, 'range segura menos tempo');
  assert.equal(core.evaluateSignalTransition(null, machineSnapshot({ total: -80 })).state, null, 'score short sem gatilho nomeado nao entra');
  // R:R < 1 nao entra: alvo colado (101) com stop longe.
  const badRr = core.evaluateSignalTransition(null, machineSnapshot({
    resistances: [100.5, 101], supports: [92],
    structureShift: { event: 'CHoCH', direction: 'bull', score: 6 }
  }));
  assert.equal(badRr.state, null);
});

test('sinais v2: saidas — alvo, stop (stop vence no mesmo candle), deterioracao, tempo e reversao', () => {
  const base = machineSnapshot({ structureShift: { event: 'CHoCH', direction: 'bull', score: 6 } });
  const active = core.evaluateSignalTransition(null, base).state;
  // Alvo: high cruza o target.
  const hitTarget = core.evaluateSignalTransition(active, machineSnapshot({ high: 105, close: 104.5, closeTime: 1_003_600 }));
  assert.equal(hitTarget.state, null, 'posicao fechada');
  assert.equal(hitTarget.event.type, 'exit');
  assert.equal(hitTarget.event.record.exitReason, 'target');
  assert.ok(hitTarget.event.record.pnlPct > 0);
  assert.ok(hitTarget.event.record.rMultiple > 0);
  // Stop e alvo no MESMO candle: conservador, stop primeiro.
  const both = core.evaluateSignalTransition(active, machineSnapshot({ high: 106, low: 94, close: 100, closeTime: 1_003_600 }));
  assert.equal(both.event.record.exitReason, 'stop');
  assert.ok(both.event.record.rMultiple <= -0.9, 'stop cheio ~-1R');
  // Deterioracao de score.
  const decay = core.evaluateSignalTransition(active, machineSnapshot({ total: 5, closeTime: 1_003_600 }));
  assert.equal(decay.event.record.exitReason, 'deterioration');
  // Reversao: CHoCH contra + divergencia contra.
  const reversal = core.evaluateSignalTransition(active, machineSnapshot({
    structureShift: { event: 'CHoCH', direction: 'bear', score: -6 }, divergence: { bearish: true, bullish: false }, closeTime: 1_003_600
  }));
  assert.equal(reversal.event.record.exitReason, 'reversal');
  // Tempo: estoura maxBars.
  let state = active;
  let timedRecord = null;
  for (let bar = 0; bar < 31 && state; bar++) {
    const step = core.evaluateSignalTransition(state, machineSnapshot({ closeTime: 1_003_600 + bar * 3600_000 }));
    state = step.state;
    if (step.event && step.event.type === 'exit') timedRecord = step.event.record;
  }
  assert.ok(timedRecord, 'fechou por tempo');
  assert.equal(timedRecord.exitReason, 'time');
});

test('sinais v2: gap atraves do stop usa o open do candle, nao o close', () => {
  const long = core.evaluateSignalTransition(null, machineSnapshot({
    total: 55,
    structureShift: { event: 'CHoCH', direction: 'bull', score: 6 },
  })).state;
  const gap = core.evaluateSignalTransition(long, machineSnapshot({
    closeTime: long.lastCloseTime + 1,
    open: long.stopPrice - 2,
    low: long.stopPrice - 3,
    high: long.entryPrice + 1,
    close: long.stopPrice + 1,
  }));
  assert.equal(gap.event.type, 'exit');
  assert.equal(gap.event.record.exitReason, 'stop');
  assert.equal(gap.event.record.exitPrice, long.stopPrice - 2);
});

test('sinais v2: reducer e idempotente por candle (reload nao dobra barsHeld)', () => {
  const active = core.evaluateSignalTransition(null, machineSnapshot({ structureShift: { event: 'CHoCH', direction: 'bull', score: 6 } })).state;
  const bar = machineSnapshot({ high: 101.5, low: 98.5, close: 100.5, closeTime: 1_003_600 });
  const first = core.evaluateSignalTransition(active, bar);
  assert.equal(first.state.barsHeld, 1);
  // Mesmo candle reprocessado (F5 na pagina): estado inalterado, sem evento.
  const replay = core.evaluateSignalTransition(first.state, bar);
  assert.equal(replay.state.barsHeld, 1, 'mesmo closeTime nao incrementa');
  assert.equal(replay.event, null);
  // Candle do proprio momento da entrada tambem nao conta como barra segurada.
  const entryReplay = core.evaluateSignalTransition(active, machineSnapshot({ closeTime: 1_000_000 }));
  assert.equal(entryReplay.state.barsHeld, 0);
});

test('sinais v2: estado persistido corrompido e descartado sem contaminar o reducer', () => {
  const active = core.evaluateSignalTransition(null, machineSnapshot({
    total: 55,
    structureShift: { event: 'CHoCH', direction: 'bull', score: 6 },
  })).state;
  const normalized = core.normalizeSignalMachineMap({
    good: active,
    partial: { phase: 'ACTIVE', side: 'long', entryPrice: 100 },
    inverted: { ...active, stopPrice: 120 },
    tombstone: { phase: 'FLAT', lastCloseTime: '1234' },
    garbage: 'x',
  });
  assert.equal(normalized.good.side, 'long');
  assert.deepEqual(normalized.tombstone, { phase: 'FLAT', lastCloseTime: 1234 });
  assert.equal('partial' in normalized, false);
  assert.equal('inverted' in normalized, false);
  assert.equal('garbage' in normalized, false);
});

test('sinais v2: MAE/MFE acumulam pelo caminho e o registro carrega metadados', () => {
  const active = core.evaluateSignalTransition(null, machineSnapshot({ structureShift: { event: 'CHoCH', direction: 'bull', score: 6 } })).state;
  const step1 = core.evaluateSignalTransition(active, machineSnapshot({ high: 102, low: 97, close: 101, closeTime: 1_003_600 }));
  assert.ok(step1.state.mfePct >= 2 - 1e-9, 'MFE captura o topo do caminho');
  assert.ok(step1.state.maePct <= -3 + 1e-9, 'MAE captura o fundo do caminho');
  const exit = core.evaluateSignalTransition(step1.state, machineSnapshot({ high: 105, close: 104.2, closeTime: 1_007_200 }));
  const record = exit.event.record;
  assert.equal(record.symbol, 'BTCUSDT');
  assert.equal(record.trigger, 'choch');
  assert.equal(record.regime, 'Tendencia de alta');
  assert.ok(record.durationBars >= 2);
  assert.ok(Number.isFinite(record.rMultiple));
  assert.equal(record.entrySnapshotId, 'snap-1');

  const short = core.evaluateSignalTransition(null, machineSnapshot({
    total: -55, regime: 'Range', supports: [96, 92], resistances: [102, 110],
    structureShift: { event: 'CHoCH', direction: 'bear', score: -6, brokenLevel: 102 },
  })).state;
  const shortStep = core.evaluateSignalTransition(short, machineSnapshot({
    total: -50, high: 101, low: 98, close: 99, closeTime: 1_003_600,
  }));
  assert.ok(shortStep.state.mfePct >= 2 - 1e-9, 'short captura excursao favoravel na minima');
  assert.ok(shortStep.state.maePct <= -1 + 1e-9, 'short captura excursao adversa na maxima');
});

test('sinais v2: tabelas de acerto por regime x gatilho x faixa com flag de amostra minima', () => {
  const records = [];
  for (let i = 0; i < 25; i++) {
    records.push({ regime: 'Tendencia de alta', trigger: 'choch', entryScore: 55, pnlPct: i % 5 === 0 ? -1 : 2, rMultiple: i % 5 === 0 ? -1 : 1.5 });
  }
  records.push({ regime: 'Range', trigger: 'squeeze-release', entryScore: 85, pnlPct: 3, rMultiple: 2 });
  const summary = core.summarizeTradeJournal(records);
  const cell = summary.cells.find((row) => row.regime === 'Tendencia de alta' && row.trigger === 'choch' && row.band === '42-59');
  assert.ok(cell);
  assert.equal(cell.count, 25);
  assert.equal(cell.hitRate, 80);
  assert.equal(cell.sufficient, true, '25 amostras >= minimo');
  const thin = summary.cells.find((row) => row.trigger === 'squeeze-release');
  assert.equal(thin.sufficient, false, '1 amostra e so base rate, sem multiplicador');
  assert.equal(summary.total, 26);
});

test('cenarios: base/alternativo/range com gatilho, alvo e invalidacao estruturais', () => {
  const scenarios = core.buildScenarios({
    close: 100, atr: 2, bias: 'Comprador',
    supports: [96, 92], resistances: [104, 110],
    structuralInvalidation: 98
  });
  assert.equal(scenarios.length, 3);
  const base = scenarios.find((s) => s.name === 'base');
  assert.equal(base.direction, 'long');
  assert.equal(base.trigger, 104, 'gatilho = rompimento da resistencia');
  assert.ok(base.target >= 110 || base.target >= 104 + 2, 'alvo no proximo nivel ou 2xATR');
  assert.equal(base.invalidation, 98, 'invalidacao estrutural (CHoCH level), nao % arbitraria');
  const alt = scenarios.find((s) => s.name === 'alternativo');
  assert.equal(alt.direction, 'short');
  const range = scenarios.find((s) => s.name === 'range');
  assert.ok(range.lower === 96 && range.upper === 104);
});

test('backtest de lag: mede barras entre o topo real e o CHoCH nos dados diarios', () => {
  // Serie sintetica com pullbacks (tendencia real tem pivots): sobe com zigue-zague, vira, desce.
  const closes = Array.from({ length: 100 }, (_, i) => {
    const trend = i < 50 ? 100 + i * 1.5 : 100 + 50 * 1.5 - (i - 50) * 1.5;
    return trend + 3 * Math.sin(i * 1.1);
  });
  const candles = closes.map((close, i) => ({ time: i, close, high: close + 1.2, low: close - 1.2, volume: 100 }));
  const lag = core.backtestDetectorLag(candles);
  assert.ok(lag.tops.count >= 1, 'detectou pelo menos um topo real');
  assert.ok(lag.tops.detected >= 1, 'CHoCH disparou apos o topo');
  assert.ok(Number.isFinite(lag.tops.medianLagBars) && lag.tops.medianLagBars >= 1 && lag.tops.medianLagBars <= 15, `lag mediano plausivel, veio ${lag.tops.medianLagBars}`);
});

function mtfRow(interval, score) { return { interval, score }; }

test('MTF: alignment conta apenas timeframes alinhados COM a direcao do bias', () => {
  // Cenario da auditoria: HTF comprado (pesos altos), intraday virando para baixo.
  // Score ponderado fica positivo, mas so 2 de 5 TFs sao altistas.
  const turning = core.aggregateMultiTimeframe([
    mtfRow('1w', 45), mtfRow('1d', 40), mtfRow('4h', -13), mtfRow('1h', -13), mtfRow('15m', -13)
  ]);
  assert.ok(turning.raw > 0.18, 'score ponderado e positivo (HTF pesa mais)');
  assert.equal(turning.positive, 2);
  assert.equal(turning.negative, 3);
  // ANTES: alignment = max(2,3)/5 = 0.6 (da direcao CONTRARIA) e bias 'Alta' — gate satisfeito.
  // AGORA: alinhamento e da direcao do bias tentativo (Alta) = 2/5 = 0.4 -> vira 'Misto'.
  assert.equal(turning.alignment, 0.4);
  assert.equal(turning.bias, 'Misto');
});

test('MTF: alinhamento pleno e vies coerente nas duas direcoes', () => {
  const bull = core.aggregateMultiTimeframe([
    mtfRow('1w', 30), mtfRow('1d', 25), mtfRow('4h', 20), mtfRow('1h', 18), mtfRow('15m', 15)
  ]);
  assert.equal(bull.bias, 'Alta');
  assert.equal(bull.alignment, 1);
  assert.equal(bull.score > 0, true);
  const bear = core.aggregateMultiTimeframe([
    mtfRow('1w', -30), mtfRow('1d', -25), mtfRow('4h', -20), mtfRow('1h', -18), mtfRow('15m', -15)
  ]);
  assert.equal(bear.bias, 'Baixa');
  assert.equal(bear.alignment, 1);
  assert.equal(bear.score < 0, true);
});

test('MTF: sem linhas ou score fraco fica Misto sem crash', () => {
  const empty = core.aggregateMultiTimeframe([]);
  assert.equal(empty.score, 0);
  assert.equal(empty.alignment, 0);
  assert.equal(empty.bias, 'Misto');
  // Score ponderado dentro da banda morta (-0.18..0.18) e Misto mesmo com maioria direcional.
  const weak = core.aggregateMultiTimeframe([mtfRow('1h', 13), mtfRow('4h', 13), mtfRow('1d', -5)]);
  assert.equal(weak.bias, 'Misto');
});

test('MTF ignora intervalos invalidos, score nao finito e deduplica o mesmo timeframe', () => {
  const actual = core.aggregateMultiTimeframe([
    mtfRow('1d', 50), mtfRow('1d', -50), mtfRow('desconhecido', 50), mtfRow('1w', NaN), null,
  ]);
  const expected = core.aggregateMultiTimeframe([mtfRow('1d', -50)]);
  assert.deepEqual(actual, expected);
  assert.equal(actual.alignment, 1, 'duplicata nao infla o denominador de alinhamento');
});

test('put/call OI: banda calibrada para o baseline call-dominante da Deribit', () => {
  const asOf = 10_000;
  const optionsWith = (putCallOi) => ({
    observedAt: 9_000, staleAfterMs: 2_000, dataStatus: 'fresh', market: { putCallOi }
  });
  // Baseline Deribit (~0.55) e range historico 0.4-0.8 sao NEUTROS — nao ha sinal em dado tipico.
  assert.equal(core.calculateDerivativeDetailContribution({ options: optionsWith(0.55), asOf }), 0);
  assert.equal(core.calculateDerivativeDetailContribution({ options: optionsWith(0.8), asOf }), 0);
  // Puts realmente elevadas vs baseline = posicionamento defensivo.
  assert.equal(core.calculateDerivativeDetailContribution({ options: optionsWith(1.1), asOf }), -2);
  // Call-dominance extremo alem do baseline.
  assert.equal(core.calculateDerivativeDetailContribution({ options: optionsWith(0.4), asOf }), 1);
});

test('formatUsd usa digitos significativos abaixo de $1 e 2 casas acima', () => {
  // >= $1: duas casas, sem zeros a esquerda desnecessarios.
  assert.equal(core.formatUsd(63780), '$63,780');
  assert.equal(core.formatUsd(63780.5), '$63,780.5');
  assert.equal(core.formatUsd(2.5), '$2.5');
  // < $1: 4 digitos significativos (nao arredonda tudo para $0).
  assert.equal(core.formatUsd(0.3812), '$0.3812');
  assert.equal(core.formatUsd(0.0874563), '$0.08746');
  assert.equal(core.formatUsd(0.000023419), '$0.00002342');
  assert.equal(core.formatUsd(0.5), '$0.5');
  // Zero e ruido numerico.
  assert.equal(core.formatUsd(0), '$0');
  assert.equal(core.formatUsd(1e-12), '$0');
  // Ausencia nao vira zero.
  assert.equal(core.formatUsd(null), '--');
  assert.equal(core.formatUsd(NaN), '--');
  assert.equal(core.formatUsd(''), '--');
  // Numero de digitos significativos configuravel.
  assert.equal(core.formatUsd(0.123456, 2), '$0.12');
});

test('classifyHttpError separa rate limit (429/418) de servidor e cliente', () => {
  assert.equal(core.classifyHttpError(429), 'rateLimit');
  assert.equal(core.classifyHttpError(418), 'rateLimit');
  assert.equal(core.classifyHttpError(500), 'server');
  assert.equal(core.classifyHttpError(503), 'server');
  assert.equal(core.classifyHttpError(404), 'client');
  assert.equal(core.classifyHttpError(400), 'client');
  assert.equal(core.classifyHttpError(200), 'ok');
});

test('parseRetryAfter aceita segundos e data HTTP, nunca negativo', () => {
  assert.equal(core.parseRetryAfter('30', 0), 30_000);
  assert.equal(core.parseRetryAfter('0', 0), 0);
  assert.equal(core.parseRetryAfter(null, 0), 0);
  assert.equal(core.parseRetryAfter('lixo', 0), 0);
  const future = new Date(60_000).toUTCString();
  assert.equal(core.parseRetryAfter(future, 0), 60_000);
  assert.equal(core.parseRetryAfter(new Date(1_000).toUTCString(), 60_000), 0, 'data no passado nao vira negativo');
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

test('request budget limita concorrencia global sem perder chamadas enfileiradas', async () => {
  const budget = core.createRequestBudget({ maxConcurrent: 2, maxStartsPerWindow: 50, maxStartsPerSource: 50, windowMs: 1000, maxQueue: 10 });
  let active = 0;
  let peak = 0;
  const order = [];
  const jobs = Array.from({ length: 6 }, (_, index) => budget.run(async () => {
    active += 1;
    peak = Math.max(peak, active);
    order.push(index);
    await new Promise((resolve) => setTimeout(resolve, 3));
    active -= 1;
    return index;
  }, { source: index % 2 ? 'source-b' : 'source-a' }));
  assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4, 5]);
  assert.equal(peak, 2);
  assert.deepEqual(order, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual({ active: budget.stats().active, queued: budget.stats().queued }, { active: 0, queued: 0 });
});

test('request budget prioriza trabalho critico e rejeita overflow de fila', async () => {
  const budget = core.createRequestBudget({ maxConcurrent: 1, maxStartsPerWindow: 50, maxStartsPerSource: 50, windowMs: 1000, maxQueue: 2 });
  let release;
  const order = [];
  const first = budget.run(() => new Promise((resolve) => { release = resolve; order.push('running'); }), { source: 'source-a' });
  const low = budget.run(() => { order.push('low'); }, { source: 'source-b', priority: -1 });
  const high = budget.run(() => { order.push('high'); }, { source: 'source-c', priority: 5 });
  await assert.rejects(budget.run(() => {}, { source: 'source-d' }), (error) => error.category === 'budget' && error.throttled === true);
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await Promise.all([first, low, high]);
  assert.deepEqual(order, ['running', 'high', 'low']);
});

test('request budget aplica janelas moveis globais e por fonte com relogio deterministico', async () => {
  function fakeTime() {
    let now = 0;
    let sequence = 0;
    const timers = new Map();
    return {
      clock: () => now,
      schedule(callback, delay) { const id = ++sequence; timers.set(id, { callback, at: now + delay }); return id; },
      cancelSchedule(id) { timers.delete(id); },
      advance(ms) {
        now += ms;
        let due;
        do {
          due = [...timers.entries()].filter(([, timer]) => timer.at <= now).sort((a, b) => a[1].at - b[1].at)[0];
          if (due) { timers.delete(due[0]); due[1].callback(); }
        } while (due);
      }
    };
  }
  const globalTime = fakeTime();
  const globalBudget = core.createRequestBudget({ maxConcurrent: 3, maxStartsPerWindow: 2, maxStartsPerSource: 5, windowMs: 100, maxQueue: 5, ...globalTime });
  const globalOrder = [];
  const globalJobs = ['a', 'b', 'c'].map((name) => globalBudget.run(() => { globalOrder.push(name); }, { source: name }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(globalOrder, ['a', 'b']);
  assert.equal(globalBudget.stats().queued, 1);
  globalTime.advance(99);
  assert.deepEqual(globalOrder, ['a', 'b']);
  globalTime.advance(1);
  await Promise.all(globalJobs);
  assert.deepEqual(globalOrder, ['a', 'b', 'c']);

  const sourceTime = fakeTime();
  const sourceBudget = core.createRequestBudget({ maxConcurrent: 3, maxStartsPerWindow: 10, maxStartsPerSource: 1, windowMs: 100, maxQueue: 5, ...sourceTime });
  const sourceOrder = [];
  const first = sourceBudget.run(() => { sourceOrder.push('a1'); }, { source: 'a' });
  const second = sourceBudget.run(() => { sourceOrder.push('a2'); }, { source: 'a' });
  const other = sourceBudget.run(() => { sourceOrder.push('b1'); }, { source: 'b' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sourceOrder, ['a1', 'b1']);
  sourceTime.advance(100);
  await Promise.all([first, second, other]);
  assert.deepEqual(sourceOrder, ['a1', 'b1', 'a2']);
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
  const fresh = core.calculateDerivativeDetailContribution({ detail, oiPriceChangePct: 5, asOf: 10_000 });
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

test('funding contribution segue a mecanica da Binance: banda neutra assimetrica e extremos contrarian', () => {
  // Baseline Binance ~ +0,01%/8h. Levemente positivo (0,01-0,03%) e ~zero sao normais -> 0.
  assert.equal(core.calculateFundingContribution(0.0001), 0, 'baseline +0,01% e neutro');
  assert.equal(core.calculateFundingContribution(0.0003), 0, 'ate +0,03% ainda normal em bull');
  assert.equal(core.calculateFundingContribution(0), 0, 'equilibrio');
  assert.equal(core.calculateFundingContribution(-0.0001), 0, 'topo da banda neutra no lado negativo');
  // Extremo positivo = longs sobrecomprados -> contrarian bearish.
  assert.equal(core.calculateFundingContribution(0.0006), -6, 'acima de 0,05% e long lotado extremo');
  assert.equal(core.calculateFundingContribution(0.0004), -2, 'entre 0,03% e 0,05% pede cautela');
  // Negativo = shorts dominantes -> combustivel de short squeeze.
  assert.equal(core.calculateFundingContribution(-0.0003), 2, 'shorts dominantes (-0,01 a -0,05%)');
  assert.equal(core.calculateFundingContribution(-0.0006), 4, 'shorts lotados abaixo de -0,05%');
  // A curva e monotonica nao-crescente no funding (mais positivo nunca pontua melhor).
  assert.ok(core.calculateFundingContribution(-0.0006) >= core.calculateFundingContribution(-0.0002));
  assert.ok(core.calculateFundingContribution(-0.0002) >= core.calculateFundingContribution(0.0001));
  assert.ok(core.calculateFundingContribution(0.0001) >= core.calculateFundingContribution(0.0004));
  assert.ok(core.calculateFundingContribution(0.0004) >= core.calculateFundingContribution(0.0006));
  // Dado ausente nao vira vies.
  assert.equal(core.calculateFundingContribution(NaN), 0);
  assert.equal(core.calculateFundingContribution(null), 0);
});

function freshDerivative(overrides) {
  return Object.assign({ observedAt: 9_000, staleAfterMs: 2_000, dataStatus: 'fresh' }, overrides);
}

test('long/short: varejo e contrarian (leve) e top traders sao seguidos', () => {
  const asOf = 10_000;
  // globalLongShortAccountRatio = varejo. Lotado em long = topo (contrarian bearish leve).
  assert.equal(core.calculateDerivativeDetailContribution({ detail: freshDerivative({ longShortRatio: 2.0 }), asOf }), -1);
  // Varejo lotado em short = combustivel de short squeeze (contrarian bullish leve).
  assert.equal(core.calculateDerivativeDetailContribution({ detail: freshDerivative({ longShortRatio: 0.5 }), asOf }), 1);
  // topLongShortPositionRatio = smart money. Long dos top traders = seguir (bullish).
  assert.equal(core.calculateDerivativeDetailContribution({ detail: freshDerivative({ topPositionRatio: 2.0 }), asOf }), 2);
  // Short dos top traders = seguir (bearish).
  assert.equal(core.calculateDerivativeDetailContribution({ detail: freshDerivative({ topPositionRatio: 0.5 }), asOf }), -2);
});

test('quadrante OIxpreco: tabela unica de 4 estados, sem penalizar contracao incondicional', () => {
  // OI sobe + preco sobe = dinheiro novo comprando (tendencia saudavel).
  assert.deepEqual(core.calculateOiPriceQuadrant(5, 2), { score: 3, phase: 'Long buildup' });
  // OI sobe + preco cai = shorts novos (queda saudavel).
  assert.deepEqual(core.calculateOiPriceQuadrant(5, -2), { score: -3, phase: 'Short buildup' });
  // OI cai + preco sobe = short covering (subida fragil, mas nao bearish).
  assert.deepEqual(core.calculateOiPriceQuadrant(-5, 2), { score: 2, phase: 'Short covering' });
  // OI cai + preco cai = longs liquidados (capitulacao).
  assert.deepEqual(core.calculateOiPriceQuadrant(-5, -2), { score: -4, phase: 'Long liquidation' });
  // Contracao de OI NAO e mais penalizada de forma incondicional: com preco subindo e positivo.
  assert.ok(core.calculateOiPriceQuadrant(-8, 1).score > 0);
  // Dentro do limiar de OI = neutro.
  assert.deepEqual(core.calculateOiPriceQuadrant(1, 5), { score: 0, phase: 'OI neutro' });
  assert.deepEqual(core.calculateOiPriceQuadrant(-1, -5), { score: 0, phase: 'OI neutro' });
  // Sem direcao de preco ou dado ausente = neutro.
  assert.equal(core.calculateOiPriceQuadrant(5, 0).score, 0);
  assert.equal(core.calculateOiPriceQuadrant(NaN, 2).score, 0);
  assert.equal(core.calculateOiPriceQuadrant(5, NaN).score, 0);
});

test('quadrante OIxpreco: limiar de OI configuravel', () => {
  assert.equal(core.calculateOiPriceQuadrant(4, 2, 6).score, 0, 'abaixo do limiar 6 e neutro');
  assert.equal(core.calculateOiPriceQuadrant(7, 2, 6).score, 3, 'acima do limiar 6 pontua');
});

test('long/short: divergencia varejo x top traders soma a favor do smart money', () => {
  const asOf = 10_000;
  // Classico: varejo vendido (0.5 -> +1) enquanto top traders comprados (2.0 -> +2) = +3 bullish.
  const bullishDivergence = core.calculateDerivativeDetailContribution({
    detail: freshDerivative({ longShortRatio: 0.5, topPositionRatio: 2.0 }), asOf
  });
  assert.equal(bullishDivergence, 3);
  // Espelho bearish: varejo comprado (2.0 -> -1) e top vendidos (0.5 -> -2) = -3.
  const bearishDivergence = core.calculateDerivativeDetailContribution({
    detail: freshDerivative({ longShortRatio: 2.0, topPositionRatio: 0.5 }), asOf
  });
  assert.equal(bearishDivergence, -3);
});

test('janela OIxpreco exige cobertura real do inicio e nunca usa o candle mais antigo como substituto', () => {
  const covered = [
    { closeTime: 1_000, close: 100 },
    { closeTime: 2_000, close: 105 },
    { closeTime: 3_000, close: 110 }
  ];
  assert.equal(core.priceChangeOverWindow(covered, 1_000, 3_000), 10);
  assert.equal(Number.isNaN(core.priceChangeOverWindow(covered, 500, 3_000)), true, 'serie comeca depois da janela');
  assert.equal(Number.isNaN(core.priceChangeOverWindow(covered, 1_000, 10_000)), true, 'serie termina muito antes do fim da janela');
  assert.equal(Number.isNaN(core.priceChangeOverWindow(covered, 10_000, 12_000)), true, 'candle muito antigo nao substitui o inicio');
  assert.equal(Number.isNaN(core.priceChangeOverWindow(covered, 2_000, 2_000)), true, 'janela invertida/zero');
  const detail = { fetchedAt: 3_000, observedAt: 3_000, staleAfterMs: 10_000, dataStatus: 'fresh', eligibleForScore: true, metricObservedAt: { oiChangePct: 3_000 }, metricStaleAfterMs: { oiChangePct: 10_000 }, oiChangePct: 8 };
  assert.equal(core.calculateDerivativeDetailContribution({ detail, close: 120, vwap: 100, asOf: 3_500 }), 0, 'sem retorno na mesma janela, VWAP nao autoriza quadrante');
});

test('compactacao do journal preserva todos os horizontes pendentes e limita apenas completos', () => {
  const day = 86_400_000;
  const now = 20 * day;
  const complete = Array.from({ length: 4 }, (_, index) => ({
    modelVersion: 'v', symbol: 'BTCUSDT', interval: '1h', signalCloseTime: (index + 1) * day,
    recordedAt: (index + 1) * day, outcome: { r1h: 1, r24h: 2, r7d: 3 }
  }));
  const pending = Array.from({ length: 5 }, (_, index) => ({
    modelVersion: 'v', symbol: 'ETHUSDT', interval: '1s', signalCloseTime: now - index * 1_000,
    recordedAt: now - index * 1_000, outcome: null
  }));
  const compacted = core.compactSignalJournal(complete.concat(pending), now, 2);
  assert.equal(compacted.length, 7);
  assert.equal(compacted.filter((row) => row.symbol === 'ETHUSDT').length, 5, 'pendentes podem exceder cap sem perder evidencia');
  assert.deepEqual(compacted.filter((row) => row.symbol === 'BTCUSDT').map((row) => row.signalCloseTime), [3 * day, 4 * day]);
});

test('cobertura MTF conta apenas timeframes canonicos unicos', () => {
  const expected = ['15m', '1h', '4h', '1d', '1w'];
  const coverage = core.timeframeCoverage([
    { interval: '5m' }, { interval: '15m' }, { interval: '15m' },
    { interval: '1h' }, { interval: '4h' }, { interval: '1d' }, { interval: '1w' }
  ], expected);
  assert.deepEqual(coverage, { available: 5, expected: 5, ratio: 1, missing: [] });
  assert.deepEqual(core.timeframeCoverage([{ interval: '5m' }, { interval: '1d' }], expected), {
    available: 1, expected: 5, ratio: 0.2, missing: ['15m', '1h', '4h', '1w']
  });
});

test('ladder de decisao exige 1d+1w em todos os niveis de entrada e permanece simetrica', () => {
  const base = { quality: 70, alignment: 0.7, multiBias: 'Alta', multiScore: 8, htfAvailable: true };
  assert.deepEqual(core.setupDecision({ ...base, total: 45 }), { decision: 'Entrada com confirmacao', tone: 'long' });
  assert.deepEqual(core.setupDecision({ ...base, total: 45, htfAvailable: false }), { decision: 'Gate HTF: 1d+1w indisponiveis', tone: 'wait' });
  assert.deepEqual(core.setupDecision({ ...base, total: -45, multiBias: 'Baixa', multiScore: -8 }), { decision: 'Entrada vendedora com confirmacao', tone: 'short' });
  assert.deepEqual(core.setupDecision({ ...base, total: -65, multiBias: 'Baixa', multiScore: -12 }), { decision: 'Entrada vendedora favoravel', tone: 'short' });
  assert.deepEqual(core.setupDecision({ ...base, total: 65, trapVeto: 'long', trapBarsLeft: 4 }), { decision: 'Veto pos-trap: aguardar 4 barra(s)', tone: 'wait' });
  assert.deepEqual(core.setupDecision({ ...base, total: 65, quality: 39 }), { decision: 'Dados insuficientes', tone: 'wait' });
  assert.deepEqual(core.setupDecision({ ...base, total: -45, htfAvailable: false }), { decision: 'Gate HTF: 1d+1w indisponiveis', tone: 'wait' });
  assert.deepEqual(core.setupDecision({ ...base, total: 45, htfVetoLong: true }), { decision: 'Gate HTF: 1d+1w baixistas vetam long', tone: 'wait' });
  assert.deepEqual(core.setupDecision({ ...base, total: -45, multiBias: 'Baixa', multiScore: -8, htfVetoShort: true }), { decision: 'Gate HTF: 1d+1w altistas vetam short', tone: 'wait' });
  assert.deepEqual(core.setupDecision({ ...base, total: 25 }), { decision: 'Aguardar pullback', tone: 'wait' });
  assert.deepEqual(core.setupDecision({ ...base, total: -25 }), { decision: 'Cautela', tone: 'avoid' });
});

test('Ichimoku cobre nuvem baixista e export inclui radar rastreavel', () => {
  const candles = Array.from({ length: 100 }, (_, index) => {
    const close = 200 - index;
    return { time: index, open: close + 0.5, high: close + 1, low: close - 1, close, volume: 1 };
  });
  assert.equal(core.ichimokuState(candles).state, 'Baixa');

  const exported = core.buildAnalyticsExport({
    modelVersion: 'test', rulesetHash: 'hash', calculatedAt: 1, inputSnapshotId: 'snap', symbol: 'BTCUSDT', interval: '1h',
    radar: { score: 10, bias: 'Comprador', dataConfidence: 80, dataStatus: 'partial', components: [{ name: 'Tecnica', ruleId: 'r1', contribution: 10, weight: 30, quality: 0.8, status: 'fresh', scope: 'symbol', reason: 'fixture' }] },
  });
  assert.equal(exported.radar.components[0].ruleId, 'r1');
  assert.equal(exported.radar.components[0].reason, 'fixture');
});

test('cobertura de derivativos e por metrica: ok pleno, parcial honesto e sem leitura (UX-001)', () => {
  const full = core.derivativeCoverage({ oiChangePct: 1.2, fundingAvg: 0.0001, longShortRatio: 1.1, takerRatio: 0.9 });
  assert.equal(full.state, 'ok');
  assert.equal(full.label, 'OI, funding, L/S, taker');

  const partial = core.derivativeCoverage({ fundingAvg: 0.0001 });
  assert.equal(partial.state, 'partial');
  assert.match(partial.label, /^funding \| faltam: OI, L\/S, taker$/);
  assert.deepEqual(partial.liveMetrics, ['fundingAvg']);

  const extrasOnly = core.derivativeCoverage({ topPositionRatio: 1.4, basisRate: 0.002 });
  assert.equal(extrasOnly.state, 'partial');
  assert.match(extrasOnly.label, /faltam: OI, funding, L\/S, taker/);

  assert.equal(core.derivativeCoverage({}).state, 'none');
  assert.equal(core.derivativeCoverage(null).label, 'sem leitura');
  assert.equal(core.derivativeCoverage({ fundingAvg: Infinity }).state, 'none');
});

test('formatDisplayTimestamp respeita o fuso explicito na virada de dia (UX-005)', () => {
  const nearMidnightUtc = Date.UTC(2026, 6, 13, 2, 30); // 13/07 02:30 UTC
  const saoPaulo = core.formatDisplayTimestamp(nearMidnightUtc, 'America/Sao_Paulo', 'short');
  const utc = core.formatDisplayTimestamp(nearMidnightUtc, 'UTC', 'short');
  assert.match(saoPaulo, /^12\/07/); // UTC-3: ainda e 12/07 23:30
  assert.match(utc, /^13\/07/);
  assert.equal(core.formatDisplayTimestamp(null, 'UTC', 'short'), '--');
  assert.equal(core.formatDisplayTimestamp(Infinity, 'UTC', 'short'), '--');
  assert.match(core.formatDisplayTimestamp(nearMidnightUtc, 'Fuso/Invalido', 'time'), /^\d{2}:\d{2}:\d{2}$/);
  assert.match(core.formatDisplayTimestamp(nearMidnightUtc, 'UTC', 'full'), /^13\/07\/2026,? 02:30:00$/);
});

test('buildInputSnapshotId: mesmo estado gera o mesmo id; qualquer input de score muda o id (ANL-001)', () => {
  const baseSpec = () => ({
    modelVersion: '1.0.0-test',
    rulesetHash: 'abcd1234',
    symbol: 'BTCUSDT',
    interval: '5m',
    signalCloseTime: 1_783_924_800_000,
    derivativeDetail: { observedAt: 1_783_924_700_000 },
    coinMetrics: { fetchedAt: 1_783_924_600_000 },
    options: null,
    institutional: { observedAt: 1_783_924_500_000 },
    externalFetchedAt: 1_783_924_400_000,
    newsFetchedAt: 1_783_924_300_000,
    newsMode: 'auto',
    newsOverrideAt: null,
    mtfStamp: '5m@1:1h@2',
    history: { observedAt: 1_783_924_200_000 },
    inputComponents: { book: { spreadBps: 1.5 }, liquidations: { count: 3 } }
  });

  const identical = core.buildInputSnapshotId(baseSpec());
  assert.equal(core.buildInputSnapshotId(baseSpec()), identical, 'estado identico deve gerar id identico');

  // Book e liquidacoes entram via inputComponents: mudar SO eles muda o id.
  const bookChanged = baseSpec();
  bookChanged.inputComponents = { book: { spreadBps: 2.0 }, liquidations: { count: 3 } };
  assert.notEqual(core.buildInputSnapshotId(bookChanged), identical, 'book diferente deve mudar o id');
  const liquidationsChanged = baseSpec();
  liquidationsChanged.inputComponents = { book: { spreadBps: 1.5 }, liquidations: { count: 4 } };
  assert.notEqual(core.buildInputSnapshotId(liquidationsChanged), identical, 'liquidacoes diferentes devem mudar o id');

  // Cada dataset carimbado tambem participa da identidade.
  ['derivativeDetail', 'coinMetrics', 'institutional'].forEach((key) => {
    const changed = baseSpec();
    changed[key] = { observedAt: 1_783_999_999_000 };
    assert.notEqual(core.buildInputSnapshotId(changed), identical, key + ' diferente deve mudar o id');
  });
  const optionsChanged = baseSpec();
  optionsChanged.options = { observedAt: 1_783_924_100_000 };
  assert.notEqual(core.buildInputSnapshotId(optionsChanged), identical);

  const mtfChanged = baseSpec();
  mtfChanged.mtfStamp = '5m@1:1h@3';
  assert.notEqual(core.buildInputSnapshotId(mtfChanged), identical);

  assert.equal(core.datasetInputStamp(null), 'na');
  assert.equal(core.datasetInputStamp({ observedAt: 5_000_000_000_000 }), '5000000000000');
  assert.equal(core.datasetInputStamp({ fetchedAt: 5_000_000_000_000 }), 'f5000000000000');
});
