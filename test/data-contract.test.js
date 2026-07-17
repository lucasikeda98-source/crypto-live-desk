'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DATA_CONTRACT_VERSION,
  createDataEnvelope,
  markEnvelopeStatus,
  normalizeError,
  payloadHash,
  schemaFingerprint,
  validateDatasetPayload,
} = require('../lib/data-contract');

const NOW = Date.UTC(2026, 6, 13, 12);

function base(overrides = {}) {
  return {
    datasetId: 'market.overview.v1',
    sourceId: 'coingecko-market',
    sourceTier: 'primary',
    entity: 'crypto-market',
    grain: 'snapshot',
    observedAt: NOW - 10_000,
    availableAt: NOW - 9_000,
    retrievedAt: NOW,
    cacheStoredAt: NOW,
    expiresAt: NOW + 600_000,
    unit: 'USD and percent',
    currency: 'USD',
    coverage: 1,
    completeness: 1,
    payload: { b: 2, a: 1 },
    ...overrides,
  };
}

test('envelope unificado publica contrato temporal, qualidade, SLA e hash reproduzivel', () => {
  const envelope = createDataEnvelope(base());
  assert.equal(envelope.schemaVersion, DATA_CONTRACT_VERSION);
  assert.equal(envelope.status, 'ok');
  assert.equal(envelope.latencyMs, 9_000);
  assert.equal(envelope.quality.score, 100);
  assert.equal(envelope.sla.minCoverage, 0.75);
  assert.equal(envelope.payloadHash, payloadHash({ a: 1, b: 2 }));
  assert.equal(envelope.payloadHash, payloadHash({ b: 2, a: 1 }), 'ordem de chaves nao altera identidade');
});

test('envelope torna observacao futura e ordem bitemporal impossivel explicitamente invalidas', () => {
  const future = createDataEnvelope(base({ observedAt: NOW + 120_000, availableAt: NOW - 1_000 }));
  assert.equal(future.status, 'invalid');
  assert.equal(future.quality.temporal, 0);
  assert.equal(future.qualityFlags.includes('future-observation'), true);
  assert.equal(future.qualityFlags.includes('temporal-order-invalid'), true);
});

test('ausencia de availableAt e baixa cobertura nunca parecem dado pleno', () => {
  const partial = createDataEnvelope(base({ availableAt: null, coverage: 0.5, completeness: 0.6 }));
  assert.equal(partial.status, 'partial');
  assert.equal(partial.availableAt, NOW);
  assert.equal(partial.qualityFlags.includes('availability-inferred-at-retrieval'), true);
  assert.equal(partial.qualityFlags.includes('coverage-below-sla'), true);
  assert.equal(partial.qualityFlags.includes('completeness-below-sla'), true);
});

test('erros e degradacao removem controles e recalculam qualidade sem alterar o payload original', () => {
  const original = createDataEnvelope(base());
  const stale = markEnvelopeStatus(original, 'stale', { code: 'refresh failed', message: 'falha\ncontrolada', retryable: true }, 'served stale');
  assert.equal(stale.status, 'stale');
  assert.equal(stale.errors[0].code, 'REFRESH_FAILED');
  assert.equal(stale.errors[0].message, 'falha controlada');
  assert.equal(stale.quality.score < original.quality.score, true);
  assert.equal(stale.payloadHash, original.payloadHash);
  assert.deepEqual(normalizeError('erro\r\ninterno'), { code: 'UPSTREAM_ERROR', sourceId: null, retryable: true, message: 'erro interno' });
});

test('identificadores invalidos falham fechado', () => {
  assert.throws(() => createDataEnvelope(base({ datasetId: '../market' })), /invalid datasetId/);
  assert.throws(() => createDataEnvelope(base({ sourceId: '__proto__' })), /invalid sourceId/);
  assert.throws(() => createDataEnvelope(base({ retrievedAt: 'not-a-date' })), /invalid retrievedAt/);
});

test('schema observado e deterministico e drift de campo/tipo falha fechado quando habilitado', () => {
  const payload = {
    global: null,
    markets: [],
    trending: null,
    source: 'fixture',
    errors: {},
    completeness: 1,
    observedAt: NOW - 1_000,
    fetchedAt: NOW,
    stale: false,
  };
  const valid = validateDatasetPayload('market.overview.v1', payload);
  assert.equal(valid.checked, true);
  assert.equal(valid.valid, true);
  assert.equal(valid.observedShapeHash, schemaFingerprint({ ...payload }));
  const drifted = createDataEnvelope(base({ payload: { ...payload, markets: {} }, validateSchema: true }));
  assert.equal(drifted.status, 'invalid');
  assert.equal(drifted.schemaValidation.valid, false);
  assert.equal(drifted.schemaValidation.invalidFields[0].path, 'markets');
  assert.equal(drifted.qualityFlags.includes('schema-drift'), true);
  assert.equal(drifted.quality.validity, 0);
});

test('vintage bitemporal fora da janela de disponibilidade e recuperacao e invalido', () => {
  const envelope = createDataEnvelope(base({ availableAt: NOW - 5_000, vintageAt: NOW + 120_000 }));
  assert.equal(envelope.status, 'invalid');
  assert.equal(envelope.qualityFlags.includes('invalid-vintage-order'), true);
});

// REV-CC-02/B: SLA de frescor aplicado contra a idade da observacao — dado congelado nao passa como ok.
test('observacao mais velha que o maxAgeMs do SLA degrada para stale com flag explicita', () => {
  const frozen = createDataEnvelope(base({ observedAt: NOW - 11 * 60_000, availableAt: NOW - 10 * 60_000 }));
  assert.equal(frozen.status, 'stale');
  assert.equal(frozen.qualityFlags.includes('observation-age-above-sla'), true);
  const fresh = createDataEnvelope(base());
  assert.equal(fresh.qualityFlags.includes('observation-age-above-sla'), false);
});

// REV-CC-02/B: availableAt inferido significa latencia DESCONHECIDA, nunca zero.
test('availableAt inferido produz latencia nula, nao credito de SLA', () => {
  const inferred = createDataEnvelope(base({ availableAt: null }));
  assert.equal(inferred.latencyMs, null);
  assert.equal(inferred.qualityFlags.includes('availability-inferred-at-retrieval'), true);
});

// REV-CC-02/C: drift aninhado (tipo de campo dentro de item de array) agora e detectado.
test('schema aninhado detecta drift dentro de itens de array e sob pais presentes', () => {
  const good = validateDatasetPayload('market.overview.v1', {
    global: null, markets: [{ id: 'bitcoin', current_price: 100, market_cap: null }], trending: null,
    source: 'CoinGecko', errors: {}, completeness: 1, observedAt: NOW, fetchedAt: NOW, stale: false,
  });
  assert.equal(good.valid, true);
  const drifted = validateDatasetPayload('market.overview.v1', {
    global: null, markets: [{ id: 'bitcoin', current_price: '100', market_cap: null }], trending: null,
    source: 'CoinGecko', errors: {}, completeness: 1, observedAt: NOW, fetchedAt: NOW, stale: false,
  });
  assert.equal(drifted.valid, false);
  assert.equal(drifted.invalidFields.some((f) => f.path === 'markets[].current_price'), true);
  const macroDrift = validateDatasetPayload('macro.us-risk.v1', {
    treasury: { y10: '4.2%', y2: 4.0 }, vix: null, score: 0, dataStatus: 'partial', errors: {}, observedAt: NOW, fetchedAt: NOW,
  });
  assert.equal(macroDrift.valid, false);
});

// REV-CC-02/C: pai anulavel legitimamente nulo NAO dispara drift dos filhos.
test('pai nulo pula validacao aninhada sem marcar campo como ausente', () => {
  const vixOnly = validateDatasetPayload('macro.us-risk.v1', {
    treasury: null, vix: { close: 20 }, score: 0, dataStatus: 'partial', errors: {}, observedAt: NOW, fetchedAt: NOW,
  });
  assert.equal(vixOnly.valid, true);
});

// REV-CC-02/D: erros deduplicados por codigo e limitados a 8.
test('erros do envelope sao deduplicados por codigo e limitados', () => {
  let envelope = createDataEnvelope(base());
  for (let index = 0; index < 20; index += 1) {
    envelope = markEnvelopeStatus(envelope, 'stale', { code: 'MARKET_REFRESH_FAILED', message: 'x' }, 'served-stale-after-refresh-failure');
  }
  assert.equal(envelope.errors.length, 1);
  const mixed = createDataEnvelope(base({ errors: Array.from({ length: 20 }, (_, index) => ({ code: `E_${index}`, message: 'y' })) }));
  assert.equal(mixed.errors.length, 8);
});

// REV-CC-02/E: quando o corpo servido muta, o hash acompanha; sem payload novo, permanece estavel.
test('payloadHash e recalculado quando o corpo mutado e informado', () => {
  const envelope = createDataEnvelope(base());
  const unchanged = markEnvelopeStatus(envelope, 'stale', null, 'served-stale-after-refresh-failure');
  assert.equal(unchanged.payloadHash, envelope.payloadHash);
  const mutatedBody = { a: 1, b: 2, stale: true };
  const remarked = markEnvelopeStatus(envelope, 'stale', null, 'served-stale-after-refresh-failure', mutatedBody);
  assert.equal(remarked.payloadHash, payloadHash(mutatedBody));
  assert.notEqual(remarked.payloadHash, envelope.payloadHash);
});
