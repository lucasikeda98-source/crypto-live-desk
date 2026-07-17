'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DataHealthRegistry, percentile } = require('../lib/data-health-registry');

function envelope(overrides = {}) {
  return {
    datasetId: 'market.overview.v1',
    status: 'ok',
    coverage: 1,
    latencyMs: 100,
    fallbackUsed: false,
    quality: { score: 100 },
    ...overrides,
  };
}

test('registry publica p50/p95, erro, cache, fallback e ultimo sucesso por instancia', () => {
  const registry = new DataHealthRegistry({ maxSamples: 10 });
  registry.record(envelope(), { checkedAt: 1_000, durationMs: 10, cacheHit: false });
  registry.record(envelope({ fallbackUsed: true }), { checkedAt: 2_000, durationMs: 20, cacheHit: true });
  registry.record(envelope({ status: 'error', quality: { score: 20 } }), { checkedAt: 3_000, durationMs: 90, error: true });
  const snapshot = registry.snapshot('market.overview.v1');
  assert.equal(snapshot.scope, 'instance');
  assert.equal(snapshot.sampleCount, 3);
  assert.equal(snapshot.p50DurationMs, 20);
  assert.equal(snapshot.p95DurationMs, 90);
  assert.equal(snapshot.errorRate, 0.3333);
  assert.equal(snapshot.cacheHitRate, 0.3333);
  assert.equal(snapshot.fallbackRate, 0.3333);
  assert.equal(snapshot.lastSuccessAt, 2_000);
  assert.equal(snapshot.lastFailureAt, 3_000);
});

test('registry e limitado, isolado por dataset e pode ser limpo', () => {
  const registry = new DataHealthRegistry({ maxSamples: 10 });
  for (let index = 0; index < 12; index += 1) registry.record(envelope(), { checkedAt: index, durationMs: index });
  assert.equal(registry.snapshot('market.overview.v1').sampleCount, 10);
  assert.equal(registry.snapshot('macro.us-risk.v1').sampleCount, 0);
  registry.reset('market.overview.v1');
  assert.equal(registry.snapshot('market.overview.v1').sampleCount, 0);
  assert.equal(percentile([], 0.95), null);
});
