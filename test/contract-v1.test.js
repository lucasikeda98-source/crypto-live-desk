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
