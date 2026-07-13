'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/analytics-core');

function radarParts(overrides = {}) {
  const base = [
    { name: 'Tecnica', weight: 30, available: true, value: 60, quality: 1 },
    { name: 'Fluxo', weight: 15, available: true, value: 40, quality: 0.8 },
    { name: 'Derivativos', weight: 10, available: true, value: -20, quality: 1 },
    { name: 'Fundamental', weight: 15, available: true, value: 10, quality: 0.5 },
    { name: 'Macro', weight: 10, available: true, value: 0, quality: 1 },
    { name: 'Historico', weight: 15, available: true, value: 30, quality: 1 },
    { name: 'Momentum', weight: 5, available: true, value: 80, quality: 1 }
  ];
  return base.map((part) => Object.assign({}, part, overrides[part.name] || {}));
}

test('contrato 12.2: mesmo fixture produz exatamente o mesmo resultado', () => {
  const first = core.aggregateRadarParts(radarParts());
  const second = core.aggregateRadarParts(radarParts());
  assert.deepEqual(first, second);
});

test('contrato 12.3: soma das contribuicoes reproduz o score bruto', () => {
  const result = core.aggregateRadarParts(radarParts());
  const sum = result.contributions.reduce((total, row) => total + row.contribution, 0);
  assert.ok(Math.abs(sum - result.rawScore) < 1e-9);
  assert.equal(result.score, Math.round(Math.max(-100, Math.min(100, result.rawScore))));
});

test('contrato 12.4: remover um bloco nao cria vies e reduz o Data Confidence', () => {
  const full = core.aggregateRadarParts(radarParts());
  const withoutHistory = core.aggregateRadarParts(radarParts({ Historico: { available: false } }));
  assert.ok(withoutHistory.dataConfidence < full.dataConfidence);
  const contribution = withoutHistory.contributions.find((row) => row.name === 'Historico');
  assert.equal(contribution.contribution, 0);
  assert.equal(contribution.available, false);
});

test('contrato 12.12/12.13: limites e caso incalculavel', () => {
  const extreme = core.aggregateRadarParts([{ name: 'x', weight: 100, available: true, value: 500, quality: 1 }]);
  assert.equal(extreme.score, 100);
  const empty = core.aggregateRadarParts([
    { name: 'a', weight: 60, available: false, value: 0 },
    { name: 'b', weight: 40, available: false, value: 0 }
  ]);
  assert.equal(empty.score, null);
  assert.equal(empty.bias, 'Indisponivel');
  assert.equal(empty.dataConfidence, 0);
  assert.equal(empty.dataStatus, 'unavailable');
});

test('contrato 8.2: Data Confidence e graduado por qualidade, nao binario', () => {
  const perfect = core.aggregateRadarParts(radarParts());
  const degraded = core.aggregateRadarParts(radarParts({ Tecnica: { quality: 0.25 }, Fluxo: { quality: 0.1 } }));
  assert.ok(degraded.dataConfidence < perfect.dataConfidence);
  assert.equal(degraded.score, perfect.score, 'qualidade reduz confianca, nao muda a direcao');
});

test('noticias: fronteiras de palavra impedem falsos positivos classicos', () => {
  assert.equal(core.newsKeywordScore('Bank of England warns on growth', [], ['ban', 'war']), 0);
  assert.equal(core.newsKeywordScore('China bans mining amid trade war', [], ['ban', 'bans', 'war']), -2);
  assert.equal(core.newsKeywordScore('Fed plans rate cut in September', ['rate cut'], []), 1);
  assert.equal(core.newsKeywordScore('Prober investigates probes', [], ['probe']), 0);
});

test('noticias: relevancia de ativo exige ticker maiusculo ou nome completo', () => {
  assert.equal(core.newsAssetRelevance('Exchange faces lawsuit over listings', 'SUI', 'Sui', 'crypto'), 0.55);
  assert.equal(core.newsAssetRelevance('SUI ecosystem TVL doubles', 'SUI', 'Sui', 'crypto'), 1.35);
  assert.equal(core.newsAssetRelevance('Bitcoin trades near record highs', 'NEAR', 'NEAR Protocol', 'crypto'), 0.9);
  assert.equal(core.newsAssetRelevance('NEAR Protocol announces upgrade', 'NEAR', 'NEAR Protocol', 'crypto'), 1.35);
  assert.equal(core.newsAssetRelevance('Widespread adoption of stablecoins', 'OP', 'Optimism', 'macro'), 0.75);
  assert.equal(core.newsAssetRelevance('Optimism launches new chain', 'OP', 'Optimism', 'crypto'), 1.35);
});

test('protocolo DeFiLlama: match implicito exige TVL minimo; explicito nao', () => {
  const protocols = [
    { name: 'Bitcoin', tvl: 0 },
    { name: 'Cardano', tvl: 120 },
    { slug: 'uniswap', name: 'Uniswap', tvl: 5e9 },
    { slug: 'aave', name: 'AAVE', tvl: 2e10 }
  ];
  assert.equal(core.findProtocolMatch(protocols, [], ['bitcoin', 'btc', 'Bitcoin']), null);
  assert.equal(core.findProtocolMatch(protocols, [], ['cardano', 'ada', 'Cardano']), null);
  assert.equal(core.findProtocolMatch(protocols, [], ['uniswap']).slug, 'uniswap');
  assert.equal(core.findProtocolMatch(protocols, ['aave'], []).slug, 'aave');
  const tinyExplicit = core.findProtocolMatch([{ name: 'Custom', tvl: 10 }], ['custom'], []);
  assert.equal(tinyExplicit.name, 'Custom', 'mapeamento explicito ignora piso de TVL');
});

test('ichimoku: kumo atual usa os spans projetados de 26 barras atras', () => {
  const candles = Array.from({ length: 80 }, (_, index) => ({ high: index, low: index, close: index }));
  const result = core.ichimokuState(candles);
  assert.equal(result.conversion, 75);
  assert.equal(result.base, 66.5);
  assert.equal(result.spanA, 44.75, 'spanA deslocado (janelas terminando na barra 54)');
  assert.equal(result.spanB, 27.5, 'spanB deslocado, nao o da janela atual (seria 53.5)');
  assert.equal(result.state, 'Alta');
  assert.equal(core.ichimokuState(candles.slice(0, 30)).state, 'Sem dados');
});

test('resolveObservedAt: clampa futuro, cai para fetchedAt e preserva passado', () => {
  assert.deepEqual(core.resolveObservedAt(2000, 1000, 60), { observedAt: 1000, provenance: 'clamped' });
  assert.deepEqual(core.resolveObservedAt(null, 1000), { observedAt: 1000, provenance: 'fetched' });
  assert.deepEqual(core.resolveObservedAt(900, 1000), { observedAt: 900, provenance: 'data' });
  assert.deepEqual(core.resolveObservedAt(1030, 1000, 60000), { observedAt: 1030, provenance: 'data' }, 'skew dentro da tolerancia e aceito');
});

test('fluxo de candles: cobertura abaixo do minimo desativa o delta sem fabricar zero', () => {
  const sparse = Array.from({ length: 40 }, (_, index) => index < 3
    ? { volume: 10, takerBuy: 8 }
    : { volume: null, takerBuy: null });
  const flow = core.calculateCandleFlow(sparse, null);
  assert.ok(Number.isNaN(flow.deltaSum));
  assert.ok(flow.coverage < 0.5);
  const dense = Array.from({ length: 40 }, () => ({ volume: 10, takerBuy: 8 }));
  const denseFlow = core.calculateCandleFlow(dense, null);
  assert.equal(denseFlow.coverage, 1);
  assert.ok(Number.isFinite(denseFlow.deltaSum));
});

test('ruleset: hash e deterministico e muda quando uma regra muda', () => {
  assert.equal(core.rulesetHash(), core.rulesetHash());
  assert.match(core.rulesetHash(), /^[0-9a-f]{8}$/);
  const altered = JSON.parse(JSON.stringify(core.RULESET));
  altered.radarBias.bull = 40;
  assert.notEqual(core.rulesetHash(altered), core.rulesetHash());
});

test('contrato 12.10: proxies BTC seguem fora do score de altcoins', () => {
  assert.equal(core.resolveOptionsScope('ADAUSDT').eligibleForScore, false);
  assert.equal(core.bitcoinMempoolContext('ADAUSDT', 90).score, 0);
  assert.equal(core.resolveOptionsScope('BTCUSDT').eligibleForScore, true);
});

test('contrato 12.7: fallback equivalente recebe o fator de proveniencia registrado', () => {
  assert.equal(core.RULESET.fallbackProvenanceFactor, 0.8, 'fator registrado no ruleset');
  assert.equal(core.sourceProvenanceFactor('CoinGecko public'), 1, 'fonte primaria tem credito cheio');
  assert.equal(core.sourceProvenanceFactor('CoinPaprika fallback'), 0.8, 'fallback declarado tem credito parcial');
  assert.equal(core.sourceProvenanceFactor(null), 1, 'rotulo ausente nao penaliza');
  assert.equal(core.sourceProvenanceFactor(''), 1);
  assert.equal(core.sourceProvenanceFactor(undefined), 1);
});

test('contrato 12.8: variar apenas o candle em formacao nao altera nada confirmado', () => {
  const candle = (i, close, extra) => Object.assign({
    time: i * 60000, closeTime: i * 60000 + 59999,
    open: close - 0.5, close, high: close + 1, low: close - 1, volume: 100, takerBuy: 60
  }, extra);
  const closed = [];
  for (let i = 0; i < 30; i += 1) closed.push(candle(i, 100 + i * 2));
  const asOf = closed[29].closeTime; // fronteira: closeTime === asOf conta como fechado
  assert.equal(core.selectClosedCandles(closed, asOf).length, 30);

  // Candle em formacao com valores EXTREMOS (spike de 50% e volume 100x): nao pode vazar.
  const forming = candle(30, 300, { closeTime: asOf + 60000, volume: 10000, takerBuy: 9000 });
  const withForming = closed.concat([forming]);
  const filtered = core.selectClosedCandles(withForming, asOf);
  assert.equal(filtered.length, 30, 'o candle em formacao e excluido');
  assert.equal(filtered[filtered.length - 1].closeTime, asOf, 'ultimo candle fechado inalterado');

  const pivotHighs = [{ price: 130, time: 14 * 60000 }, { price: 150, time: 24 * 60000 }];
  const pivotLows = [{ price: 110, time: 10 * 60000 }, { price: 128, time: 20 * 60000 }];
  assert.deepEqual(
    core.detectStructureShift(filtered, pivotHighs, pivotLows),
    core.detectStructureShift(closed, pivotHighs, pivotLows),
    'estrutura confirmada identica com ou sem o candle em formacao'
  );
  assert.deepEqual(
    core.detectVolumeClimax(filtered, 2),
    core.detectVolumeClimax(closed, 2),
    'climax confirmado identico com ou sem o candle em formacao'
  );
});

test('contrato 12.11: resposta de outra selecao (simbolo/timeframe) e descartada pelo gate', () => {
  const gate = core.createRequestGate();
  const btcRequest = gate.begin();          // usuario abre BTCUSDT
  gate.invalidate();                        // usuario troca para ETHUSDT (ou muda o timeframe)
  const ethRequest = gate.begin();
  assert.equal(gate.isCurrent(btcRequest), false, 'resposta atrasada do BTC nao pode ser incorporada');
  assert.equal(gate.isCurrent(ethRequest), true, 'somente a requisicao da selecao atual e valida');
});

test('contrato 12.14: todo componente declara regra, limite, estado, escopo, proxy, fontes e leitura', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const appjs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

  const setupComponents = appjs.match(/\{ name: '[^']+', ruleId: 'setup\.[^\n]+/g) || [];
  assert.equal(setupComponents.length, 8, 'os 8 componentes do Setup Score declaram ruleId');
  for (const line of setupComponents) {
    for (const key of ['ruleId:', 'max:', 'status:', 'scope:', 'isProxy:', 'sources:', 'reason:']) {
      assert.ok(line.includes(key), 'componente Setup sem "' + key + '" -> ' + line.slice(0, 60));
    }
  }
  const radarParts = appjs.match(/\{ name: '[^']+', ruleId: 'radar\.[^\n]+/g) || [];
  assert.equal(radarParts.length, 7, 'os 7 blocos do Radar Score declaram ruleId');
  for (const line of radarParts) {
    for (const key of ['ruleId:', 'weight:', 'available:', 'value:', 'quality:', 'raw:', 'scope:', 'reason:']) {
      assert.ok(line.includes(key), 'bloco Radar sem "' + key + '" -> ' + line.slice(0, 60));
    }
  }
});

test('contrato 12.16: golden fixtures alta/baixa/lateralizacao congelam o resultado do motor', () => {
  const candle = (i, close) => ({
    time: i * 60000, closeTime: i * 60000 + 59999,
    open: close - 0.5, close, high: close + 1, low: close - 1, volume: 100, takerBuy: 60
  });
  const pivotHighs = [{ price: 130, time: 14 * 60000 }, { price: 150, time: 24 * 60000 }];
  const pivotLows = [{ price: 110, time: 10 * 60000 }, { price: 128, time: 20 * 60000 }];

  // ALTA: rompimento do ultimo pivot high em tendencia de alta = BOS de continuacao.
  const alta = [];
  for (let i = 0; i < 30; i += 1) alta.push(candle(i, 100 + i * 2));
  alta[28] = candle(28, 149);
  alta[29] = candle(29, 153);
  assert.deepEqual(core.detectStructureShift(alta, pivotHighs, pivotLows),
    { event: 'BOS', direction: 'bull', score: 4, brokenLevel: 150, barsAgo: 0 });

  // BAIXA: fechamento atraves do ultimo higher-low = CHoCH baixista.
  const baixa = alta.map((row) => Object.assign({}, row));
  baixa[28] = candle(28, 129);
  baixa[29] = candle(29, 126);
  assert.deepEqual(core.detectStructureShift(baixa, pivotHighs, pivotLows),
    { event: 'CHoCH', direction: 'bear', score: -6, brokenLevel: 128, barsAgo: 0 });

  // LATERALIZACAO: pivots mistos (sem HH/HL nem LH/LL) = nenhum evento, score 0.
  const lateral = [];
  for (let i = 0; i < 30; i += 1) lateral.push(candle(i, 100 + (i % 2)));
  assert.deepEqual(core.detectStructureShift(lateral,
    [{ price: 103, time: 10 * 60000 }, { price: 102.5, time: 20 * 60000 }],
    [{ price: 98, time: 8 * 60000 }, { price: 98.5, time: 18 * 60000 }]),
    { event: null, direction: null, score: 0, brokenLevel: null, barsAgo: null });

  // Radar completo congelado nos tres regimes; espelhar as entradas espelha exatamente o resultado.
  const parts = (t, f, d, fu, m, h, mo) => ([
    { name: 'Tecnica', weight: 30, available: true, value: t, quality: 1 },
    { name: 'Fluxo', weight: 15, available: true, value: f, quality: 1 },
    { name: 'Derivativos', weight: 10, available: true, value: d, quality: 1 },
    { name: 'Fundamental', weight: 15, available: true, value: fu, quality: 1 },
    { name: 'Macro', weight: 10, available: true, value: m, quality: 1 },
    { name: 'Historico', weight: 15, available: true, value: h, quality: 1 },
    { name: 'Momentum24h', weight: 5, available: true, value: mo, quality: 1 }
  ]);
  const contribSum = (result) => +result.contributions.reduce((sum, row) => sum + row.contribution, 0).toFixed(6);

  const altaRadar = core.aggregateRadarParts(parts(70, 55, 30, 40, 20, 50, 60));
  assert.equal(altaRadar.score, 51);
  assert.equal(altaRadar.bias, 'Comprador');
  assert.equal(altaRadar.dataConfidence, 100);
  assert.equal(altaRadar.dataStatus, 'complete');
  assert.equal(contribSum(altaRadar), 50.75, 'soma das contribuicoes reproduz o bruto (12.3)');

  const baixaRadar = core.aggregateRadarParts(parts(-70, -55, -30, -40, -20, -50, -60));
  assert.equal(baixaRadar.score, -51, 'espelho exato do cenario de alta');
  assert.equal(baixaRadar.bias, 'Vendedor');
  assert.equal(contribSum(baixaRadar), -50.75);

  const lateralRadar = core.aggregateRadarParts(parts(8, -5, 3, 0, -2, 4, 6));
  assert.equal(lateralRadar.score, 3);
  assert.equal(lateralRadar.bias, 'Neutro');
  assert.equal(contribSum(lateralRadar), 2.65);
});

test('contrato 12.17: comunicacao nao promete acerto nem trata Data Confidence como probabilidade', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const html = read('index.html');
  const appjs = read('app.js');

  // Disclaimer obrigatorio: os scores nao sao probabilidade nem recomendacao.
  assert.match(html, /nao representam probabilidade nem recomendacao/i,
    'o rodape deve declarar que Radar/Setup Score nao sao probabilidade nem recomendacao');
  // Data Confidence deve ser enquadrado como cobertura de dados, nao chance de acerto.
  assert.match(appjs, /Data Confidence[^\n]*cobertura de dados, nao chance de acerto/i,
    'a UI deve dizer que Data Confidence mede cobertura de dados, nao chance de acerto');

  // Linguagem de promessa/garantia nao pode aparecer em nenhuma copy visivel.
  const forbidden = [/lucro garantido/i, /retorno garantido/i, /ganho garantido/i,
    /recomendacao garantida/i, /100% de acerto/i, /sinal garantido/i, /acerto garantido/i];
  for (const rx of forbidden) {
    assert.ok(!rx.test(html), 'index.html nao pode conter linguagem de garantia: ' + rx);
    assert.ok(!rx.test(appjs), 'app.js nao pode conter linguagem de garantia: ' + rx);
  }
});
