'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../lib/analytics-core');
const fs = require('node:fs');
const path = require('node:path');

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
  const prototypeKey = core.alignedReturns([{ time: '__proto__', close: 10 }, { time: 'x', close: 11 }], [{ time: '__proto__', close: 20 }, { time: 'x', close: 22 }]);
  assert.equal(prototypeKey.samples, 1, 'timestamp textual reservado continua sendo uma chave de dado normal');
  const huge = [4e307, 6e307, 8e307, 1e308];
  assert.ok(Math.abs(core.pearsonCorrelation(huge, huge.map((value) => value / 2)) - 1) < 1e-9, 'escala extrema finita nao estoura media/covariancia');
});

test('beta: ativo 2x mais volatil que o benchmark tem beta ~2', () => {
  const bench = [0.01, -0.02, 0.015, 0.005, -0.01, 0.02];
  const asset = bench.map((value) => value * 2);
  assert.ok(Math.abs(core.betaCoefficient(asset, bench) - 2) < 1e-9);
  assert.ok(Number.isNaN(core.betaCoefficient([0.01], bench)));
  const hugeBench = [2e307, 3e307, 4e307, 5e307];
  assert.ok(Math.abs(core.betaCoefficient(hugeBench.map((value) => value * 2), hugeBench) - 2) < 1e-9);
});

test('forca relativa: mede o excesso de retorno acumulado', () => {
  const asset = Array(20).fill(0.01);
  const bench = Array(20).fill(0.0);
  const value = core.relativeStrength(asset, bench, 20);
  assert.ok(value > 20 && value < 23, 'aprox +22% de excesso: ' + value);
  assert.ok(Number.isNaN(core.relativeStrength(asset, bench, 30)), 'janela maior que a serie fica indisponivel');
  assert.ok(Number.isNaN(core.relativeStrength([1e308, 1e308], [0, 0], 2)), 'produto acumulado fora do intervalo fica indisponivel');
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
  const scoped = core.evaluateSignalOutcome(record, [{ closeTime: 24 * hour, close: 95 }], {
    horizons: ['r1h'],
    maxLagMs: 2 * 60 * 1000
  });
  assert.deepEqual(scoped, { r1h: null, r24h: null, r7d: null }, 'candle de 24h nao substitui observacao ausente de 1h');
  const late = core.evaluateSignalOutcome(record, [{ closeTime: 24 * hour + 20 * 60 * 1000, close: 90 }], {
    horizons: ['r24h'],
    maxLagMs: 16 * 60 * 1000
  });
  assert.equal(late.r24h, null, 'gap maior que a tolerancia do timeframe permanece ausente');
  const overflow = core.evaluateSignalOutcome({ price: 1e-308, signalCloseTime: 0 }, [{ closeTime: hour, close: 1e308 }], { horizons: ['r1h'] });
  assert.equal(overflow.r1h, null, 'retorno fora do intervalo numerico permanece ausente');
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
  const symmetric = core.summarizeSignalJournal([
    { setupScore: 65, outcome: { r24h: -1e308 } },
    { setupScore: 65, outcome: { r24h: 1e308 } },
  ]).find((row) => row.band === '>= +60');
  assert.equal(symmetric.median24h, 0, 'mediana par nao estoura ao somar extremos finitos');
  assert.deepEqual(summary.map((row) => row.band), ['>= +60', '+42 a +59', '+20 a +41', '-19 a +19', '-41 a -20', '-59 a -42', '<= -60']);
});

test('alertas: cruzamentos de score sao espelhados na ladder bidirecional (+/-42, +/-60)', () => {
  const base = { symbol: 'BTCUSDT', interval: '5m', bias: 'Neutro', regime: 'Range', funding: 0.0001, liquidation15m: 0 };
  const shortConfirm = core.evaluateAlertTransitions({ ...base, setupScore: -40 }, { ...base, setupScore: -45 }, {});
  assert.equal(shortConfirm.length, 1);
  assert.match(shortConfirm[0].message, /cruzou -42/);
  // Rotulo de ZONA (nao de decisao): o alerta nao avalia os gates MTF/DC/veto da decisao real.
  assert.match(shortConfirm[0].message, /zona de confirmacao vendedora/);
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
  assert.equal(core.signalOutcomeState({ ...record, outcome: null }, 30 * 60 * 1000), 'waiting');
  assert.equal(core.signalOutcomeState({ ...record, outcome: null }, 2 * hour), 'due');
  assert.equal(core.signalOutcomeState({ ...record, outcome: { r1h: 1, r24h: 2, r7d: 3 } }, 999 * hour), 'complete');
  assert.equal(core.signalOutcomeState({ outcome: null }, 2 * hour), 'invalid');
  assert.deepEqual(core.mergeSignalOutcome({ r1h: 1 }, { r1h: 9, r24h: 2 }), { r1h: 1, r24h: 2, r7d: null }, 'valor ja consolidado nunca e sobrescrito');
});

test('wilson: intervalo 95% cobre a incerteza da amostra e degrada com poucos dados', () => {
  const close = (value, expected, tolerance) => assert.ok(Math.abs(value - expected) <= tolerance, value + ' != ' + expected);
  // 10/20 com z=1.96: intervalo classico [29.9%, 70.1%] — simetrico em p=0.5.
  const half = core.wilsonInterval(10, 20);
  close(half.lower, 29.93, 0.1);
  close(half.upper, 70.07, 0.1);
  // 20/20: taxa observada 100%, mas o intervalo NAO afirma certeza (lower ~83.9%).
  const perfect = core.wilsonInterval(20, 20);
  close(perfect.lower, 83.89, 0.15);
  assert.equal(perfect.upper, 100);
  // 3/4: "75% de acerto" vira honestamente [30%, 95%].
  const tiny = core.wilsonInterval(3, 4);
  assert.ok(tiny.lower < 31 && tiny.upper > 94, JSON.stringify(tiny));
  // Amostra maior aperta o intervalo em torno da mesma taxa.
  const big = core.wilsonInterval(75, 100);
  assert.ok(big.lower > 65 && big.upper < 83, JSON.stringify(big));
  // Bordas: sem tentativas -> null; entradas invalidas -> null.
  assert.equal(core.wilsonInterval(0, 0), null);
  assert.equal(core.wilsonInterval(5, 4), null);
  assert.equal(core.wilsonInterval(null, 10), null);
  // Propagacao: os resumos carregam o intervalo junto da taxa.
  const signalSummary = core.summarizeSignalJournal([
    { setupScore: 65, outcome: { r24h: 2 } },
    { setupScore: 62, outcome: { r24h: -1 } }
  ]).find((row) => row.band === '>= +60');
  assert.ok(signalSummary.hitRateInterval && signalSummary.hitRateInterval.lower >= 0 && signalSummary.hitRateInterval.upper <= 100);
  const tradeSummary = core.summarizeTradeJournal([
    { pnlPct: 2, entryScore: 50, regime: 'Tendencia', trigger: 'bos', rMultiple: 1 },
    { pnlPct: -1, entryScore: 50, regime: 'Tendencia', trigger: 'bos', rMultiple: -0.5 }
  ]);
  assert.ok(tradeSummary.cells[0].hitRateInterval && Number.isFinite(tradeSummary.cells[0].hitRateInterval.lower));
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
  const shortCross = core.evaluateAlertTransitions({ ...previous, setupScore: -40 }, { ...previous, setupScore: -65 }, {});
  assert.deepEqual(shortCross.map((alert) => alert.id), ['score--42', 'score--60']);
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
    snapshot: { symbol: 'BTCUSDT', interval: '5m', inputSnapshotId: 'id:1', inputComponents: { book: { spreadBps: 1 } }, calculatedAt: 999, revision: 2, signalCloseTime: 500 },
    confluence: { total: 30, decision: 'Aguardar pullback', dataConfidence: 80, dataStatus: 'partial', components: [{ name: 'Tecnica', ruleId: 'setup.technical.v1', contribution: 10, max: 20, status: 'fresh', scope: 'symbol', isProxy: false, sources: ['binance'], reason: 'x' }] },
    radar: { score: 12, bias: 'Neutro', dataConfidence: 70, dataStatus: 'partial', components: [] },
    evidence: { book: { spreadBps: 1 } }
  });
  assert.equal(exported.schemaVersion, 3);
  assert.equal(exported.symbol, 'BTCUSDT');
  assert.equal(exported.inputSnapshotId, 'id:1');
  assert.deepEqual(exported.inputComponents, { book: { spreadBps: 1 } });
  assert.deepEqual(exported.evidence, exported.inputComponents);
  assert.equal(exported.setup.components[0].ruleId, 'setup.technical.v1');
  assert.equal(exported.radar.score, 12);
  assert.equal(exported.sourceRegistry.version, core.SOURCE_REGISTRY_VERSION);
  assert.equal(exported.sourceRegistry.entries['binance-spot-klines'].unit, 'quote asset / base asset / count');
  assert.match(exported.disclaimer, /nao representam probabilidade/);
});

test('export: envelope bruto e imutavel sobrevive round-trip e detecta adulteracao', () => {
  const rawEvidence = core.buildRawEvidenceEnvelope({
    capturedAt: 1234,
    modelVersion: 'test-model',
    rulesetHash: 'rules-hash',
    inputSnapshotId: 'snapshot:1',
    datasets: {
      selectedMarket: {
        sourceIds: ['binance-spot-ticker', 'binance-spot-klines'],
        observedAt: 1200,
        payload: { candles: [{ time: 1, close: 100 }, { time: 2, close: Number.NaN }], ticker: { priceChangePercent: '2.5' } }
      }
    }
  });
  assert.equal(rawEvidence.datasets.selectedMarket.payload.candles[1].close, null, 'numero nao serializavel fica explicito');
  assert.equal(Object.isFrozen(rawEvidence), true);
  assert.equal(Object.isFrozen(rawEvidence.datasets.selectedMarket.payload.candles), true);
  assert.deepEqual(core.verifyRawEvidenceEnvelope(rawEvidence), { valid: true, errors: [] });

  const roundTripped = JSON.parse(JSON.stringify(rawEvidence));
  assert.deepEqual(core.verifyRawEvidenceEnvelope(roundTripped), { valid: true, errors: [] });
  const exported = core.buildAnalyticsExport({ rawEvidence: roundTripped });
  assert.equal(exported.rawEvidence.envelopeHash, rawEvidence.envelopeHash);

  roundTripped.datasets.selectedMarket.payload.candles[0].close = 999;
  const tampered = core.verifyRawEvidenceEnvelope(roundTripped);
  assert.equal(tampered.valid, false);
  assert.match(tampered.errors.join(' | '), /hash divergente|envelopeHash divergente/);
  assert.throws(() => core.buildAnalyticsExport({ rawEvidence: roundTripped }), /raw evidence invalida/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(app, /analysis\.rawEvidence = captureRawEvidence\(analysis, snapshot\)/, 'captura ocorre no limite sincrono do snapshot');
  assert.match(app, /rawEvidence: analysis\.rawEvidence \|\| null/, 'download recebe o envelope congelado');
  assert.match(app, /candles: candles\.slice\(\)/, 'cache MTF preserva as series que geraram a agregacao');
  assert.match(app, /sourceRows:\s*\{[\s\S]*openInterestHistory: oiHist/, 'derivativos preservam as series normalizadas');
});

test('fontes: registro normativo e versionado cobre entradas de score e informacionais', () => {
  assert.deepEqual(core.validateSourceRegistry(core.SOURCE_REGISTRY), []);
  assert.equal(Object.isFrozen(core.SOURCE_REGISTRY), true);
  const required = [
    'binance-spot-klines', 'binance-spot-ticker', 'binance-spot-depth', 'binance-futures',
    'deribit-options', 'coinmetrics-community', 'defillama', 'mempool-space',
    'coingecko-market', 'coinpaprika-market', 'alternative-me', 'us-treasury-yields',
    'cboe-vix', 'tradfi-yahoo', 'rss-news', 'manual-user-session', 'cryptoetf-public',
    'binance-daily-history', 'binance-liquidations', 'binance-aggtrades',
    'cross-venue-quotes', 'cftc-legacy'
  ];
  assert.deepEqual(Object.keys(core.SOURCE_REGISTRY).sort(), required.sort());
  const manual = core.SOURCE_REGISTRY['manual-user-session'];
  assert.match(manual.validator, /AuditFields/);
  assert.equal(manual.staleAfterMs, 0);
  assert.notEqual(core.rulesetHash(core.RULESET), core.rulesetHash({ ...core.RULESET, sourceRegistryVersion: 'changed' }));
  const invalid = { bad: { ...manual, sourceId: 'wrong', metrics: [] } };
  assert.ok(core.validateSourceRegistry(invalid).length >= 2);
});

test('deploy: headers defensivos cobrem todas as rotas e permitem fontes live declaradas', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const globalHeaders = config.headers.find((entry) => entry.source === '/(.*)').headers;
  const byName = Object.fromEntries(globalHeaders.map((entry) => [entry.key, entry.value]));
  assert.match(byName['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(byName['Content-Security-Policy'], /wss:\/\/fstream\.binance\.com/);
  assert.equal(byName['X-Content-Type-Options'], 'nosniff');
  assert.equal(byName['X-Frame-Options'], 'DENY');
  assert.match(byName['Permissions-Policy'], /camera=\(\)/);
});

test('acessibilidade: seletores e skip link mantem alvo tatil minimo', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(css, /\.skip-link\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.field input, \.field select\s*\{[^}]*height:\s*44px/s);
  assert.match(css, /\.mini-select select\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.candle-count-label select\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.news-item a\s*\{[^}]*min-height:\s*44px/s);
  assert.match(css, /\.news-override-panel input\s*\{[^}]*min-height:\s*44px/s);
  assert.doesNotMatch(css, /var\(--focus\)/, 'nao referencia token de foco inexistente');
  assert.doesNotMatch(css, /\.field input, \.field select\s*\{[^}]*outline:\s*0/s, 'campos preservam o foco global de teclado');
  assert.doesNotMatch(css, /\.mini-select select\s*\{[^}]*outline:\s*0/s, 'select compacto preserva o foco global de teclado');
  assert.doesNotMatch(css, /\.candle-count-label select\s*\{[^}]*outline:\s*0/s, 'seletor de candles preserva o foco global de teclado');
  // REV-CC-02/K (Label-in-Name, WCAG 2.5.3): o nome acessivel do seletor vem do <label> que o
  // envolve — o texto visivel "Area do ativo". Um aria-label divergente quebrava controle por voz.
  assert.match(html, /<label class="asset-tab-mobile[^>]*>\s*<span>Area do ativo<\/span>\s*<select id="assetTabSelect">/);
  assert.doesNotMatch(html, /id="assetTabSelect"[^>]*aria-label/, 'aria-label nao pode sobrepor o rotulo visivel');
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.asset-subnav \{ display: none !important; \}[\s\S]*\.asset-tab-mobile \{/);
  assert.match(app, /var active = assetView && button\.dataset\.assetTab === state\.assetTab/);
  assert.match(app, /on\('assetTabSelect', 'change'/);
});

test('app: estado inicial acessivel, ETF atravessa fim de semana, journal preciso e historico sob demanda', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const requestClient = fs.readFileSync(path.join(__dirname, '..', 'lib', 'request-client.js'), 'utf8');
  assert.match(app, /INSTITUTIONAL_STALE_MS\s*=\s*96\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  assert.match(app, /syncIntervalButtons\(state\.interval\)/);
  assert.match(app, /syncSortButtons\(state\.sort\)/);
  assert.match(app, /interval=1m&startTime=/);
  assert.match(app, /interval=15m&startTime=/);
  assert.match(app, /Promise\.allSettled\(\[\s*ensureHistoricalProfile\(symbol, true\),\s*contextPromise/s);
  assert.match(app, /stampAnalysisSnapshot\(analysis, 'decision-ready'\)/);
  assert.match(app, /confluence\.dataConfidence < 40\)[\s\S]*phase: 'FLAT', lastCloseTime: closeTime/);
  assert.match(app, /reportedRows = flowRows\.filter\(etfReportedRow\)/);
  assert.match(app, /classifyEtfFlowObservation\(row, etfFlowValue\(row\)\)/);
  assert.match(app, /nestedRows\(nested, \(depth \|\| 0\) \+ 1\)/);
  assert.match(app, /mapSettledPool\(ASSETS, 4,/);
  assert.match(app, /createRequestBudget\(\{ maxConcurrent: 8, maxStartsPerWindow: 180, maxStartsPerSource: 60/);
  assert.match(app, /RequestClient\.createRequestClient\(\{/);
  assert.match(html, /<h2>Saude dos dados<\/h2>/);
  assert.match(html, /id="dataContractStatus"/);
  assert.match(html, /id="dataContractDetail"[^>]*aria-live="polite"/);
  assert.match(app, /market\.overview\.v1 \| qualidade/);
  assert.match(html, /id="modelBadge" class="model-badge"/);
  assert.match(app, /text\('modelBadge', 'Modelo ' \+ MODEL_VERSION\)/);
  assert.equal((app.match(/preview/g) || []).length, 1, 'preview aparece somente na versao central do modelo, nao em cada score/card');
  // REV-CC-02/I: o literal unico acima NAO garante selo unico — a versao renderiza tambem em
  // superficies de proveniencia (updatedAt, statusText, tooltip do card, status de sinais,
  // relatorio) alem de snapshots/journal/chaves. O total de usos de MODEL_VERSION fica PINADO:
  // criar uma nova superficie de renderizacao exige decisao consciente aqui, nao passa em silencio.
  assert.equal((app.match(/MODEL_VERSION/g) || []).length, 26, 'novo uso de MODEL_VERSION exige decisao consciente (selo/proveniencia/identidade)');
  assert.match(requestClient, /options\.budget\.run\(async function/);
  assert.match(app, /flowEligible = eligible && sourceObservationFresh\(flow\.observedAt \|\| flow\.lastTradeAt, MICROSTRUCTURE_STALE_MS\)/);
  assert.match(app, /venuesEligible = eligible && sourceObservationFresh\(data && data\.venuesObservedAt, MICROSTRUCTURE_STALE_MS\)/);
  assert.doesNotMatch(app, /var queue = ASSETS\.slice\(\)/, 'nao varre 24 historicos no primeiro carregamento');
  assert.doesNotMatch(app, /warmHistoricalProfiles/);
  assert.doesNotMatch(app, /fase de OI '\s*\+\s*c\.smart\.oiPhase/);
  assert.match(app, /Valores fora dos limites declarados foram ajustados antes do calculo/);
});

test('override manual: exige autoria e motivo antes de alterar score e exporta a trilha', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="newsOverridePanel"[^>]*hidden[^>]*novalidate/);
  assert.match(html, /id="newsOverrideAuthor"[^>]*maxlength="80"[^>]*required/);
  assert.match(html, /id="newsOverrideReason"[^>]*maxlength="180"[^>]*required/);
  assert.match(app, /if \(!author \|\| !reason\) return false/);
  assert.match(app, /state\.newsOverrideAuthor = author/);
  assert.match(app, /state\.newsOverrideReason = reason/);
  assert.match(app, /overrideAuthor: state\.newsOverrideAuthor, overrideReason: state\.newsOverrideReason/);
  assert.match(app, /Override aplicado e registrado no snapshot\/export/);
  assert.doesNotMatch(app, /state\.newsMode\s*=\s*e\.target\.value/, 'troca do select nao aplica override sem submit auditado');
});

test('journal duravel: UI, sync privada, worker e cron permanecem ligados ponta a ponta', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const signalSync = fs.readFileSync(path.join(__dirname, '..', 'lib', 'signal-sync-client.js'), 'utf8');
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.match(html, /id="signalSyncCode" type="password"/);
  assert.match(html, /id="signalSyncStatus"[^>]*role="status"/);
  assert.match(html, /lib\/cross-tab-lock\.js/);
  assert.match(html, /lib\/signal-sync-client\.js/);
  assert.match(app, /SignalSync\.createClient\(\{/);
  assert.match(app, /runExclusive: function \(task\) \{ return withCrossTabLock\(SIGNAL_JOURNAL_LOCK, task\); \}/);
  assert.match(app, /withCrossTabLock\(SIGNAL_MACHINE_LOCK/);
  assert.match(signalSync, /cryptoApi\.getRandomValues\(bytes\)/, 'namespace nasce de entropia criptografica, nao de Math.random');
  assert.match(signalSync, /'X-Journal-Id': journalId/);
  assert.match(signalSync, /var reconciled = merge\(merged, persisted && persisted\.records\)/);
  assert.match(app, /window\.confirm\('Limpar definitivamente/, 'limpeza remota exige confirmacao explicita');
  assert.match(app, /Limpar definitivamente os trades simulados/, 'limpeza local de trades tambem exige confirmacao');
  assert.deepEqual(vercel.crons, [{ path: '/api/signal-worker', schedule: '17 4 * * *' }]);
  assert.match(app, /volatileStorage = Object\.create\(null\)/, 'falha de quota mantem continuidade apenas na sessao');
  assert.match(app, /Codigo privado disponivel apenas nesta sessao/, 'UI explicita que o codigo volatil se perde no reload');
});
