'use strict';

// Guardas de comportamento exigidos pela revisao REV-CC-01 (CODEX_HANDOFF.md, secao B).
// Regra de ouro: cada teste abaixo falha se a correcao correspondente for revertida —
// nada aqui depende de regex sobre texto-fonte, exceto o cross-check explicito de
// consistencia app.js <-> RULESET (ANL-005), que compara literais contra o valor normativo.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../lib/analytics-core');

const CORE_PATH = path.join(__dirname, '..', 'lib', 'analytics-core.js');

// ---------------------------------------------------------------------------
// ANL-018 — rulesetHash cobre RULESET + implementacao completa do core
// ---------------------------------------------------------------------------

// PIN DE HASH-OURO. Qualquer mudanca em lib/analytics-core.js (regras declarativas OU
// corpo de qualquer funcao do core) muda este valor. Isso e intencional: uma mudanca
// CONSCIENTE de regra/implementacao exige atualizar o pin abaixo junto com o bump de
// rulesetVersion — silenciosamente manter o hash antigo e exatamente a regressao que
// este teste existe para impedir (ANL-018).
// Atualizado conscientemente em 2026-07-13 (2x): (1) correcoes pos-REV-CC-01 adicionaram
// derivativeCoverage, formatDisplayTimestamp, buildInputSnapshotId e a guarda finita de
// priceChangeOverWindow; (2) merge preview.6+cicloD = 1.0.0-preview.8 incorporou as regras
// RC-001/RC-003 da main (sobrevenda +8, clamp conjunto de funding +/-7, carry capitulacao +3,
// Wilson, fator de proveniencia 0.8) — mudanca de REGRA consciente com bump de rulesetVersion.
const RULESET_HASH_GOLDEN = '4efe8ce2';

test('ANL-018: rulesetHash bate com o pin de hash-ouro', () => {
  assert.equal(core.rulesetHash(), RULESET_HASH_GOLDEN,
    'rulesetHash mudou: se a mudanca no core foi consciente, atualize RULESET_HASH_GOLDEN e o rulesetVersion');
});

test('ANL-018: rulesetHash e derivado do texto real da implementacao do core', () => {
  // Recomputa o hash de forma independente a partir do ARQUIVO fonte: se
  // analyticsCoreFactory for derrubado do material do hash (regressao apontada na
  // REV-CC-01), o valor de rulesetHash() diverge do recomputado e este teste falha.
  const text = fs.readFileSync(CORE_PATH, 'utf8');
  const start = text.indexOf('function analyticsCoreFactory()');
  assert.ok(start >= 0, 'fabrica do core nao encontrada no fonte');
  const factorySource = text.slice(start, text.lastIndexOf('}') + 1);

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (!value || typeof value !== 'object') return value;
    const output = {};
    Object.keys(value).sort().forEach((key) => { output[key] = canonicalize(value[key]); });
    return output;
  }
  function fnv1a(input) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return ('0000000' + hash.toString(16)).slice(-8);
  }
  const expected = fnv1a(JSON.stringify(canonicalize({
    ruleset: core.RULESET,
    implementation: [factorySource]
  })));
  assert.equal(core.rulesetHash(), expected,
    'rulesetHash nao corresponde a RULESET + fonte da fabrica do core: o material do hash foi alterado');
});

test('ANL-018: perturbar o material muda o hash', () => {
  const base = core.rulesetHash();
  // Canal declarativo: outra regra => outro hash.
  const perturbedRuleset = Object.assign({}, core.RULESET, { rulesetVersion: core.RULESET.rulesetVersion + '-perturbado' });
  assert.notEqual(core.rulesetHash(perturbedRuleset), base);
  // Canal de implementacao: fonte extra => outro hash.
  assert.notEqual(core.rulesetHash(undefined, ['function extra() { return 1; }']), base);
  // Determinismo: mesma entrada => mesmo hash.
  assert.equal(core.rulesetHash(), base);
});

// ---------------------------------------------------------------------------
// ANL-024 — dado ausente vira estado neutro explicito, nunca leitura direcional
// ---------------------------------------------------------------------------

test('ANL-024: ichimokuState sem candles suficientes reporta "Sem dados"', () => {
  assert.equal(core.ichimokuState([]).state, 'Sem dados');
  assert.equal(core.ichimokuState(null).state, 'Sem dados');
  const few = Array.from({ length: 10 }, (_, i) => ({ open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i, time: i, closeTime: i + 1, volume: 1 }));
  const state = core.ichimokuState(few);
  assert.equal(state.state, 'Sem dados');
  assert.ok(state.state !== 'Alta' && state.state !== 'Baixa', 'serie insuficiente nunca vira leitura direcional');
});

test('ANL-024: aggregateRadarParts sem peso disponivel reporta "Indisponivel" com score null', () => {
  const result = core.aggregateRadarParts([
    { name: 'tecnica', value: NaN, weight: 30, available: false },
    { name: 'fluxo', value: null, weight: 15, available: false }
  ]);
  assert.equal(result.bias, 'Indisponivel');
  assert.equal(result.score, null);
  assert.equal(result.dataStatus, 'unavailable');
  assert.equal(result.dataConfidence, 0);
  result.contributions.forEach((part) => {
    assert.equal(part.contribution, 0);
    assert.equal(part.available, false);
  });
});

test('ANL-024: calculateOiPriceQuadrant com OI ou preco ausente fica em "OI neutro"', () => {
  for (const [oi, price] of [[null, 5], [5, null], [NaN, -2], [3, NaN], [null, null]]) {
    const quadrant = core.calculateOiPriceQuadrant(oi, price);
    assert.equal(quadrant.phase, 'OI neutro');
    assert.equal(quadrant.score, 0);
  }
});

test('ANL-024: setupDecision degrada para estados neutros explicitos', () => {
  // Score alto sem HTF: gate explicito, nunca "Entrada favoravel".
  const gated = core.setupDecision({ total: 65, quality: 90, multiBias: 'Alta', alignment: 1, multiScore: 10, htfAvailable: false });
  assert.equal(gated.decision, 'Gate HTF: 1d+1w indisponiveis');
  assert.equal(gated.tone, 'wait');
  // Qualidade de dados abaixo do piso: honestidade explicita.
  const insufficient = core.setupDecision({ total: 70, quality: 30, multiBias: 'Alta', alignment: 1, multiScore: 10, htfAvailable: true });
  assert.equal(insufficient.decision, 'Dados insuficientes');
  assert.equal(insufficient.tone, 'wait');
});

test('ANL-024: calculateCarryRegime sem funding nao fabrica carry', () => {
  const missing = core.calculateCarryRegime({ fundingAvg: null, oiPercentile: 95 });
  assert.equal(missing.annualizedCarryPct, null);
  assert.equal(missing.carryScore, 0);
  assert.equal(missing.deltaNeutral, false);
  assert.equal(core.calculateCarryRegime({ fundingAvg: NaN }).carryScore, 0);
});

test('ANL-024: bitcoinMempoolContext sem taxa ou fora de BTC nao pontua', () => {
  const noFee = core.bitcoinMempoolContext('BTCUSDT', null);
  assert.equal(noFee.eligibleForScore, false);
  assert.equal(noFee.score, 0);
  const proxy = core.bitcoinMempoolContext('ETHUSDT', 200);
  assert.equal(proxy.isProxy, true);
  assert.equal(proxy.eligibleForScore, false);
  assert.equal(proxy.score, 0);
});

test('ANL-024: calculateMarketTrendContext sem 7d/30d fica indisponivel com score 0', () => {
  const missing = core.calculateMarketTrendContext({});
  assert.equal(missing.available, false);
  assert.equal(missing.score, 0);
  assert.equal(missing.quality, 0);
  assert.equal(core.calculateMarketTrendContext(null).score, 0);
});

test('ANL-024: calculateFundingContribution com funding ausente e 0', () => {
  assert.equal(core.calculateFundingContribution(null), 0);
  assert.equal(core.calculateFundingContribution(NaN), 0);
  assert.equal(core.calculateFundingContribution('abc'), 0);
});

test('ANL-024: derivativeCoverage sem dado declara "sem leitura", nunca cobertura', () => {
  assert.equal(core.derivativeCoverage(null).label, 'sem leitura');
  assert.equal(core.derivativeCoverage({}).state, 'none');
  assert.equal(core.derivativeCoverage({ fundingAvg: NaN }).state, 'none');
});

// ---------------------------------------------------------------------------
// ANL-008 — stop e alvo no MESMO candle: sai no stop (conservador)
// ---------------------------------------------------------------------------

function activeState(overrides) {
  return Object.assign({
    phase: 'ACTIVE',
    side: 'long',
    symbol: 'BTCUSDT',
    interval: '1h',
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 110,
    entryTime: 1000,
    entryScore: 60,
    trigger: 'bos',
    regime: 'tendencia',
    maxBars: 30,
    barsHeld: 1,
    maePct: 0,
    mfePct: 0,
    lastCloseTime: 1000,
    entrySnapshotId: 'snap-1'
  }, overrides || {});
}

test('ANL-008: long com stop E alvo no mesmo candle fecha no stop', () => {
  // O candle toca 95 (stop) e 111 (acima do alvo 110): a convencao conservadora manda
  // assumir stop primeiro. Reverter para target-first faz este teste falhar.
  const result = core.evaluateSignalTransition(activeState(), {
    closeTime: 2000, open: 100, high: 111, low: 95, close: 108, total: 55
  });
  assert.equal(result.state, null);
  assert.equal(result.event.type, 'exit');
  assert.equal(result.event.record.exitReason, 'stop');
  assert.equal(result.event.record.exitPrice, 95, 'toque intrabar preenche no nivel do stop');
  assert.ok(result.event.record.pnlPct < 0);
});

test('ANL-008: short com stop E alvo no mesmo candle fecha no stop', () => {
  const short = activeState({ side: 'short', entryPrice: 100, stopPrice: 105, targetPrice: 90 });
  const result = core.evaluateSignalTransition(short, {
    closeTime: 2000, open: 100, high: 106, low: 89, close: 92, total: -55
  });
  assert.equal(result.event.type, 'exit');
  assert.equal(result.event.record.exitReason, 'stop');
  assert.equal(result.event.record.exitPrice, 105);
});

test('ANL-008: gap atraves do stop preenche na abertura, nao no nivel do stop', () => {
  const result = core.evaluateSignalTransition(activeState(), {
    closeTime: 2000, open: 92, high: 111, low: 90, close: 108, total: 55
  });
  assert.equal(result.event.record.exitReason, 'stop');
  assert.equal(result.event.record.exitPrice, 92, 'gap abaixo do stop executa no primeiro print (open)');
});

test('ANL-008: alvo sem toque no stop segue saindo no alvo', () => {
  const result = core.evaluateSignalTransition(activeState(), {
    closeTime: 2000, open: 100, high: 111, low: 99, close: 110, total: 55
  });
  assert.equal(result.event.record.exitReason, 'target');
  assert.equal(result.event.record.exitPrice, 110);
});

// ---------------------------------------------------------------------------
// ANL-009 — idempotencia por candle (replay nao duplica efeito)
// ---------------------------------------------------------------------------

test('ANL-009: reprocessar o mesmo candle fechado nao duplica barsHeld/MAE/MFE nem emite evento', async () => {
  const start = activeState();
  const candle = { closeTime: 2000, open: 100, high: 104, low: 98, close: 103, total: 55 };
  const first = core.evaluateSignalTransition(start, candle);
  assert.equal(first.event, null);
  assert.equal(first.state.barsHeld, 2);
  assert.equal(first.state.lastCloseTime, 2000);
  // Replay assincrono do MESMO candle (recarga de pagina / segundo tick do render):
  const replay = await Promise.resolve().then(() => core.evaluateSignalTransition(first.state, candle));
  assert.equal(replay.event, null, 'replay nao gera segundo evento');
  assert.deepEqual(replay.state, first.state, 'replay nao avanca o estado');
  // Candle ANTIGO (closeTime menor) tambem e ignorado.
  const older = core.evaluateSignalTransition(first.state, { closeTime: 1500, open: 100, high: 120, low: 80, close: 90, total: -80 });
  assert.equal(older.event, null);
  assert.deepEqual(older.state, first.state);
});

test('ANL-009: shouldRecordSignal recusa gravar duas vezes o mesmo candle de sinal', () => {
  const candidate = { symbol: 'BTCUSDT', interval: '1h', signalCloseTime: 2000 };
  assert.equal(core.shouldRecordSignal(null, candidate), true);
  assert.equal(core.shouldRecordSignal(candidate, Object.assign({}, candidate)), false, 'mesmo candle nao duplica registro');
  assert.equal(core.shouldRecordSignal(candidate, Object.assign({}, candidate, { signalCloseTime: 3000 })), true);
  assert.equal(core.shouldRecordSignal(candidate, Object.assign({}, candidate, { symbol: 'ETHUSDT' })), true);
});

test('ANL-009: tombstone FLAT com lastCloseTime sobrevive a normalizacao do estado persistido', () => {
  // O marcador de idempotencia (candle ja avaliado) vive DENTRO do estado persistido;
  // a normalizacao nao pode descarta-lo, senao o replay pos-reload deixa de ser no-op.
  const tombstone = core.normalizeSignalMachineState({ phase: 'FLAT', lastCloseTime: 2000 });
  assert.deepEqual(tombstone, { phase: 'FLAT', lastCloseTime: 2000 });
  assert.equal(core.normalizeSignalMachineState({ phase: 'FLAT' }), null, 'FLAT sem marcador nao e um tombstone valido');
  const replayed = core.evaluateSignalTransition(
    core.normalizeSignalMachineState(activeState()),
    { closeTime: 1000, open: 100, high: 120, low: 80, close: 90, total: -80 }
  );
  assert.equal(replayed.event, null, 'estado normalizado preserva o corte de idempotencia');
});

// ---------------------------------------------------------------------------
// ANL-010 — fonte tardia nao entra no snapshot/observacao
// ---------------------------------------------------------------------------

test('ANL-010: observacao com timestamp alem do fetch+skew e marcada invalida, nunca "fresca"', async () => {
  const fetchedAt = 1000000;
  const skew = core.RULESET.clockSkewToleranceMs;
  // Fonte que "chega do futuro" (timestamp posterior ao fechamento da janela de fetch):
  const late = core.resolveObservedAt(fetchedAt + skew + 1, fetchedAt);
  assert.equal(late.provenance, 'invalid');
  // Dentro da tolerancia: proveniencia de dado real.
  assert.equal(core.resolveObservedAt(fetchedAt + skew, fetchedAt).provenance, 'data');
  // Ausente: nunca fabricada a partir do fetchedAt.
  const missing = core.resolveObservedAt(null, fetchedAt);
  assert.equal(missing.provenance, 'missing');
  assert.equal(missing.observedAt, null);

  // Cenario assincrono: a fonte rapida resolve antes do deadline, a lenta depois.
  // O snapshot montado no deadline so pode conter a observacao valida da fonte rapida.
  const deadlineMs = 5;
  const fast = new Promise((resolve) => setTimeout(() => resolve({ name: 'rapida', dataTimestamp: fetchedAt - 10 }), 0));
  const slow = new Promise((resolve) => setTimeout(() => resolve({ name: 'lenta', dataTimestamp: fetchedAt - 5 }), 30));
  const timeout = new Promise((resolve) => setTimeout(() => resolve(null), deadlineMs));
  const settled = await Promise.all([Promise.race([fast, timeout]), Promise.race([slow, timeout])]);
  const snapshotSources = settled
    .filter(Boolean)
    .map((source) => ({ name: source.name, observed: core.resolveObservedAt(source.dataTimestamp, fetchedAt) }))
    .filter((source) => source.observed.provenance === 'data');
  assert.deepEqual(snapshotSources.map((source) => source.name), ['rapida'],
    'fonte que perde o deadline nao entra no snapshot');
  await slow; // higiene: nao deixar timer pendente decidir o resultado de outro teste
});

test('ANL-010: evaluateSignalOutcome com maxLag nao deixa candle distante substituir o horizonte', () => {
  const record = { price: 100, signalCloseTime: 0 };
  const HOUR = 3600000;
  // Unico candle disponivel esta 2h alem do horizonte de 1h: com lag maximo de 5min,
  // o resultado do horizonte fica pendente (null) em vez de usar o candle tardio.
  const candles = [{ closeTime: 3 * HOUR, close: 130 }];
  const bounded = core.evaluateSignalOutcome(record, candles, { horizons: ['r1h'], maxLagMs: 300000 });
  assert.equal(bounded.r1h, null, 'candle tardio nao substitui a observacao do horizonte');
  // Sem limite de lag o mesmo candle seria aceito — o gate e o maxLag, nao o dado.
  const unbounded = core.evaluateSignalOutcome(record, candles, { horizons: ['r1h'] });
  assert.equal(typeof unbounded.r1h, 'number');
});

test('ANL-010: filterFreshByTimestamp descarta observacao mais velha que o TTL', () => {
  const now = 1000000;
  const rows = [
    { id: 'fresca', observedAt: now - 1000 },
    { id: 'tardia', observedAt: now - 100000 },
    { id: 'sem-carimbo' }
  ];
  const fresh = core.filterFreshByTimestamp(rows, 'observedAt', 60000, now);
  assert.deepEqual(fresh.map((row) => row.id), ['fresca']);
});

// ---------------------------------------------------------------------------
// ANL-005 — caps do setup: definicao normativa unica somando 112
// ---------------------------------------------------------------------------

test('ANL-005: RULESET.setupCaps soma exatamente 112', () => {
  const caps = core.RULESET.setupCaps;
  const total = Object.keys(caps).reduce((sum, key) => sum + caps[key], 0);
  assert.equal(total, 112, 'a escala total do setup e 112; mudar um cap exige rebalancear os demais');
  assert.deepEqual(Object.keys(caps).sort(),
    ['chainFundamental', 'derivatives', 'history', 'multiTimeframe', 'newsMacro', 'risk', 'smartFlow', 'technical']);
});

test('ANL-005: aggregateMultiTimeframe deriva o clamp de RULESET.setupCaps.multiTimeframe', () => {
  const cap = core.RULESET.setupCaps.multiTimeframe;
  const extreme = ['1m', '15m', '1h', '4h', '1d', '1w'].map((interval) => ({ interval, score: 50 }));
  const bull = core.aggregateMultiTimeframe(extreme);
  assert.equal(bull.score, cap, 'alinhamento maximo satura exatamente no cap do ruleset');
  const bear = core.aggregateMultiTimeframe(extreme.map((row) => ({ interval: row.interval, score: -50 })));
  assert.equal(bear.score, -cap);
  // Scores fora da faixa canonica sao clampados antes de agregar: nunca passam do cap.
  const overflow = core.aggregateMultiTimeframe(extreme.map((row) => ({ interval: row.interval, score: 5000 })));
  assert.ok(Math.abs(overflow.score) <= cap);
});

test('ANL-005: clamps e maximos declarados no app.js batem com RULESET.setupCaps (definicao normativa unica)', () => {
  // Cross-check de consistencia: os literais duplicados vivem em app.js (fora do escopo
  // de producao desta rodada). Este guarda compara CADA literal com o valor normativo do
  // ruleset — divergir qualquer um dos dois lados faz o teste falhar.
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const caps = core.RULESET.setupCaps;
  const expectations = [
    { name: 'technical', pattern: /var technical = clamp\([^;]*?, -(\d+), (\d+)\)/ },
    { name: 'smartFlow', pattern: /var flow = clamp\([^;]*?, -(\d+), (\d+)\)/ },
    { name: 'derivatives', pattern: /var derivatives = clamp\([^;]*?, -(\d+), (\d+)\)/ },
    { name: 'chainFundamental', pattern: /var chain = clamp\([^;]*?, -(\d+), (\d+)\)/ },
    { name: 'newsMacro', pattern: /var macro = clamp\([^;]*?, -(\d+), (\d+)\)/ },
    { name: 'history', pattern: /var historyScore = history \? clamp\([^;]*?, -(\d+), (\d+)\)/ },
    { name: 'risk', pattern: /risk = clamp\(risk, -(\d+), (\d+)\)/ }
  ];
  expectations.forEach((expectation) => {
    const match = app.match(expectation.pattern);
    assert.ok(match, 'clamp de ' + expectation.name + ' nao encontrado em app.js');
    assert.equal(Number(match[1]), caps[expectation.name], 'clamp inferior de ' + expectation.name + ' divergiu do ruleset');
    assert.equal(Number(match[2]), caps[expectation.name], 'clamp superior de ' + expectation.name + ' divergiu do ruleset');
  });
  // Os campos `max:` dos componentes exportados tambem precisam bater com o ruleset.
  const componentMax = {
    'setup.technical.v1': caps.technical,
    'setup.mtf.v2': caps.multiTimeframe,
    'setup.flow.v1': caps.smartFlow,
    'setup.derivatives.v1': caps.derivatives,
    'setup.chain.v1': caps.chainFundamental,
    'setup.macro.v1': caps.newsMacro,
    'setup.history.v1': caps.history,
    'setup.risk.v2': caps.risk
  };
  Object.keys(componentMax).forEach((ruleId) => {
    const pattern = new RegExp("ruleId: '" + ruleId.replace(/\./g, '\\.') + "'[^\\n]*?max: (\\d+)");
    const match = app.match(pattern);
    assert.ok(match, 'componente ' + ruleId + ' nao encontrado em app.js');
    assert.equal(Number(match[1]), componentMax[ruleId], 'max declarado de ' + ruleId + ' divergiu do ruleset');
  });
});

// ---------------------------------------------------------------------------
// ANL-017 — semanticas intencionais do validador de klines
// ---------------------------------------------------------------------------

function klineRow(overrides) {
  const base = { time: 1000, open: 100, high: 105, low: 95, close: 102, volume: 10, closeTime: 1999, quote: 1000, trades: 50, takerBuy: 6 };
  const merged = Object.assign({}, base, overrides || {});
  return [merged.time, merged.open, merged.high, merged.low, merged.close, merged.volume, merged.closeTime, merged.quote, merged.trades, merged.takerBuy];
}

test('ANL-017: timestamp duplicado — a ULTIMA copia valida vence (retry/reorder upstream)', () => {
  // Semantica intencional: duplicatas de openTime nao sao observacoes independentes;
  // um retry upstream reenvia o candle corrigido, entao o ultimo payload valido vence.
  const result = core.normalizeKlines([
    klineRow({ time: 1000, close: 101 }),
    klineRow({ time: 1000, close: 103 })
  ]);
  assert.equal(result.length, 1);
  assert.equal(result[0].close, 103, 'a ultima copia valida do mesmo openTime substitui a anterior');
  // Duplicata INVALIDA nao derruba a copia valida ja aceita.
  const keepValid = core.normalizeKlines([
    klineRow({ time: 1000, close: 101 }),
    klineRow({ time: 1000, close: -1 })
  ]);
  assert.equal(keepValid.length, 1);
  assert.equal(keepValid[0].close, 101, 'payload invalido nao substitui candle valido');
  // A serie de saida e sempre cronologica, mesmo com entrada fora de ordem.
  const ordered = core.normalizeKlines([klineRow({ time: 3000, closeTime: 3999 }), klineRow({ time: 1000 })]);
  assert.deepEqual(ordered.map((candle) => candle.time), [1000, 3000]);
});

test('ANL-017: closeTime igual ao openTime e ACEITO; anterior ao openTime e rejeitado', () => {
  // Semantica intencional: o validador rejeita apenas closeTime < time (janela invertida).
  // closeTime == time e um candle degenerado porem temporalmente coerente e passa.
  const equal = core.normalizeKlines([klineRow({ time: 1000, closeTime: 1000 })]);
  assert.equal(equal.length, 1);
  assert.equal(equal[0].closeTime, 1000);
  const inverted = core.normalizeKlines([klineRow({ time: 1000, closeTime: 999 })]);
  assert.equal(inverted.length, 0, 'closeTime antes do openTime e janela invertida: rejeitado');
});

test('ANL-017: volume=null com takerBuy grande PASSA; takerBuy > volume finito e rejeitado', () => {
  // Semantica intencional: o invariante takerBuy <= volume so e verificavel quando os dois
  // campos existem. Com volume null o candle entra com volume null preservado (o consumo a
  // jusante — calculateCandleFlow — ja exige ambos finitos para pontuar delta).
  const nullVolume = core.normalizeKlines([klineRow({ volume: null, takerBuy: 999999 })]);
  assert.equal(nullVolume.length, 1);
  assert.equal(nullVolume[0].volume, null);
  assert.equal(nullVolume[0].takerBuy, 999999);
  // E o consumidor de fluxo NAO transforma esse candle em delta direcional:
  const flow = core.calculateCandleFlow(nullVolume);
  assert.ok(!Number.isFinite(flow.deltaSum) || flow.deltaSum === 0, 'candle sem volume nao fabrica delta direcional');
  // Com volume finito o invariante volta a valer:
  const inconsistent = core.normalizeKlines([klineRow({ volume: 5, takerBuy: 6 })]);
  assert.equal(inconsistent.length, 0, 'takerBuy maior que o volume total e impossivel: rejeitado');
  // Negativos continuam rejeitados.
  assert.equal(core.normalizeKlines([klineRow({ volume: -1 })]).length, 0);
  assert.equal(core.normalizeKlines([klineRow({ takerBuy: -1 })]).length, 0);
});
