'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/analytics-core');

function candleSeries(closes, startTime = 0, stepMs = 1) {
  return closes.map((close, index) => ({ time: startTime + index * stepMs, close, closeTime: startTime + (index + 1) * stepMs }));
}

test('correlacao: series identicas dao +1, opostas dao -1, alinhamento por timestamp', () => {
  const up = [100, 101, 103, 102, 105, 108, 107, 110];
  const a = candleSeries(up);
  const b = candleSeries(up.map((value) => value * 3));
  const inverse = candleSeries(up.map((value) => 220 - value));
  const aligned = core.alignedReturns(a, b);
  assert.equal(aligned.samples, up.length - 1);
  assert.ok(Math.abs(core.pearsonCorrelation(aligned.returnsA, aligned.returnsB) - 1) < 1e-9);
  const opposite = core.alignedReturns(a, inverse);
  assert.ok(core.pearsonCorrelation(opposite.returnsA, opposite.returnsB) < -0.9);
  const misaligned = core.alignedReturns(a, candleSeries(up, 500));
  assert.equal(misaligned.samples, 0, 'timestamps sem intersecao nao pareiam');
});

test('beta: ativo 2x mais volatil que o benchmark tem beta ~2', () => {
  const bench = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02];
  const asset = bench.map((value) => value * 2);
  assert.ok(Math.abs(core.betaCoefficient(asset, bench) - 2) < 1e-9);
  assert.ok(Number.isNaN(core.betaCoefficient([0.01], bench)));
});

test('forca relativa: mede o excesso de retorno acumulado', () => {
  const asset = Array(20).fill(0.01);
  const bench = Array(20).fill(0.0);
  const value = core.relativeStrength(asset, bench, 20);
  assert.ok(value > 20 && value < 23, 'aprox +22% de excesso: ' + value);
  assert.ok(Number.isNaN(core.relativeStrength(asset, bench, 30)), 'janela maior que a serie fica indisponivel');
});

test('journal: grava uma vez por candle fechado e por par/timeframe', () => {
  const base = { symbol: 'BTCUSDT', interval: '5m', signalCloseTime: 1000 };
  assert.equal(core.shouldRecordSignal(null, base), true);
  assert.equal(core.shouldRecordSignal(base, base), false);
  assert.equal(core.shouldRecordSignal(base, { ...base, signalCloseTime: 2000 }), true);
  assert.equal(core.shouldRecordSignal(base, { ...base, symbol: 'ETHUSDT' }), true);
  assert.equal(core.shouldRecordSignal(base, { symbol: 'BTCUSDT', interval: '5m' }), false, 'sem candle fechado nao grava');
});

test('journal: outcome usa o primeiro candle que fecha depois de cada horizonte', () => {
  const hour = 3600000;
  const record = { price: 100, signalCloseTime: 0 };
  const candles = [
    { closeTime: hour, close: 102 },
    { closeTime: 24 * hour, close: 95 },
    { closeTime: 25 * hour, close: 90 },
    { closeTime: 168 * hour, close: 130 }
  ];
  const outcome = core.evaluateSignalOutcome(record, candles);
  assert.equal(outcome.r1h, 2);
  assert.equal(outcome.r24h, -5);
  assert.equal(outcome.r7d, 30);
  assert.equal(core.evaluateSignalOutcome({ price: 100, signalCloseTime: 200 * hour }, candles).r1h, null, 'sem candle futuro fica null');
});

test('journal: resumo por faixa separa avaliados e acertos', () => {
  const records = [
    { setupScore: 65, outcome: { r24h: 2 } },
    { setupScore: 62, outcome: { r24h: -1 } },
    { setupScore: 45, outcome: null },
    { setupScore: -30, outcome: { r24h: -3 } },
    { setupScore: -50, outcome: { r24h: 4 } },
    { setupScore: -70, outcome: { r24h: -6 } }
  ];
  const summary = core.summarizeSignalJournal(records);
  const top = summary.find((row) => row.band === '>= +60');
  assert.equal(top.total, 2);
  assert.equal(top.evaluated, 2);
  assert.equal(top.hits, 1);
  assert.equal(top.hitRate, 50);
  assert.equal(top.sufficient, false, 'menos de 20 avaliados = amostra insuficiente');
  // Bandas negativas espelham a ladder bidirecional (+/-42, +/-60).
  const bear = summary.find((row) => row.band === '-41 a -20');
  assert.equal(bear.hits, 1, 'score negativo acerta quando o retorno e negativo');
  const bearConfirm = summary.find((row) => row.band === '-59 a -42');
  assert.equal(bearConfirm.evaluated, 1);
  assert.equal(bearConfirm.hits, 0, 'short com retorno positivo e erro');
  const bearStrong = summary.find((row) => row.band === '<= -60');
  assert.equal(bearStrong.hits, 1);
});

test('alertas: cruzamentos de score sao espelhados na ladder bidirecional (+/-42, +/-60)', () => {
  const base = { symbol: 'BTCUSDT', interval: '5m', bias: 'Neutro', regime: 'Range', funding: 0.0001, liquidation15m: 0 };
  const shortConfirm = core.evaluateAlertTransitions({ ...base, setupScore: -40 }, { ...base, setupScore: -45 }, {});
  assert.equal(shortConfirm.length, 1);
  assert.match(shortConfirm[0].message, /cruzou -42/);
  assert.match(shortConfirm[0].message, /entrada vendedora com confirmacao/);
  const shortStrong = core.evaluateAlertTransitions({ ...base, setupScore: -50 }, { ...base, setupScore: -65 }, {});
  assert.equal(shortStrong.length, 1);
  assert.match(shortStrong[0].message, /cruzou -60/);
  assert.equal(core.evaluateAlertTransitions({ ...base, setupScore: -44 }, { ...base, setupScore: -46 }, {}).length, 0,
    'permanecer dentro da zona (sem cruzar -42 nem -60) nao dispara');
  const longStrong = core.evaluateAlertTransitions({ ...base, setupScore: 55 }, { ...base, setupScore: 62 }, {});
  assert.equal(longStrong.length, 1);
  assert.match(longStrong[0].message, /cruzou \+60/);
});

test('journal: avaliacao precoce nao congela horizontes futuros', () => {
  const hour = 3600000;
  const record = { signalCloseTime: 0, price: 100 };
  // 2h depois do sinal: so r1h decorrido
  assert.equal(core.signalOutcomePending({ ...record, outcome: null }, 2 * hour), true);
  const early = { r1h: 2, r24h: null, r7d: null };
  assert.equal(core.signalOutcomePending({ ...record, outcome: early }, 2 * hour), false, 'r1h avaliado e r24h/r7d ainda nao venceram');
  assert.equal(core.signalOutcomePending({ ...record, outcome: early }, 25 * hour), true, 'r24h venceu e continua null -> volta a ser pendente');
  const merged = core.mergeSignalOutcome(early, { r1h: null, r24h: -3, r7d: null });
  assert.deepEqual(merged, { r1h: 2, r24h: -3, r7d: null }, 'merge preserva horizontes ja preenchidos');
  assert.equal(core.signalOutcomePending({ ...record, outcome: { r1h: 1, r24h: 2, r7d: 3 } }, 999 * hour), false);
});

test('alertas: troca de timeframe nunca gera transicao', () => {
  const previous = { symbol: 'BTCUSDT', interval: '15m', setupScore: 30, bias: 'Neutro', regime: 'Range' };
  const current = { symbol: 'BTCUSDT', interval: '1d', setupScore: 65, bias: 'Comprador', regime: 'Tendencia' };
  assert.equal(core.evaluateAlertTransitions(previous, current, {}).length, 0);
});

test('protocolo: entrada null na lista nao derruba o match explicito', () => {
  const result = core.findProtocolMatch([null, { name: 'AAVE', tvl: 2e10 }], ['aave'], []);
  assert.equal(result.name, 'AAVE');
});

test('alertas: disparam somente em transicao, nunca por nivel persistente', () => {
  const previous = { symbol: 'BTCUSDT', setupScore: 40, bias: 'Neutro', regime: 'Range', funding: 0.0001, liquidation15m: 0 };
  const crossed = { ...previous, setupScore: 45 };
  const first = core.evaluateAlertTransitions(previous, crossed, {});
  assert.equal(first.length, 1);
  assert.match(first[0].message, /cruzou \+42/);
  assert.equal(core.evaluateAlertTransitions(crossed, { ...crossed, setupScore: 50 }, {}).length, 0, 'permanecer acima nao redispara');
  const flip = core.evaluateAlertTransitions(previous, { ...previous, bias: 'Comprador', regime: 'Tendencia', funding: 0.001, liquidation15m: 5e6 }, {});
  const ids = flip.map((alert) => alert.id).sort();
  assert.deepEqual(ids, ['bias', 'funding', 'liquidation', 'regime']);
  assert.equal(core.evaluateAlertTransitions(previous, { ...crossed, symbol: 'ETHUSDT' }, {}).length, 0, 'troca de simbolo nao compara estados');
  assert.equal(core.evaluateAlertTransitions(previous, crossed, { scoreCross: false }).length, 0, 'regra desligada nao dispara');
});

test('export: snapshot carrega envelope, componentes e disclaimer', () => {
  const exported = core.buildAnalyticsExport({
    exportedAt: 1234,
    modelVersion: '1.0.0-preview.2',
    rulesetHash: 'abcd1234',
    snapshot: { symbol: 'BTCUSDT', interval: '5m', inputSnapshotId: 'id:1', calculatedAt: 999, revision: 2, signalCloseTime: 500 },
    confluence: { total: 30, decision: 'Aguardar pullback', dataConfidence: 80, dataStatus: 'partial', components: [{ name: 'Tecnica', ruleId: 'setup.technical.v1', contribution: 10, max: 20, status: 'fresh', scope: 'symbol', isProxy: false, sources: ['binance'], reason: 'x' }] },
    radar: { score: 12, bias: 'Neutro', dataConfidence: 70, dataStatus: 'partial', components: [] }
  });
  assert.equal(exported.symbol, 'BTCUSDT');
  assert.equal(exported.inputSnapshotId, 'id:1');
  assert.equal(exported.setup.components[0].ruleId, 'setup.technical.v1');
  assert.equal(exported.radar.score, 12);
  assert.match(exported.disclaimer, /nao representam probabilidade/);
});
