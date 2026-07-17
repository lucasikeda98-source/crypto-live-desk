'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { finiteRule, normalizeTimeSeries } = require('../lib/data-validators');

test('validador finito aplica faixa, inteiro e ausencia explicita', () => {
  assert.deepEqual(finiteRule('4', { min: 0, max: 5, integer: true }), { valid: true, value: 4, reason: null });
  assert.equal(finiteRule(6, { max: 5 }).reason, 'above-maximum');
  assert.equal(finiteRule(1.5, { integer: true }).reason, 'not-integer');
  assert.equal(finiteRule(null, { nullable: true }).valid, true);
  assert.equal(finiteRule('', {}).valid, false);
});

test('series rejeitam futuro/range impossivel, deduplicam e ordenam com cobertura explicita', () => {
  const asOf = Date.UTC(2026, 6, 13, 12);
  const result = normalizeTimeSeries([
    { at: asOf - 20_000, price: 10 },
    { at: asOf - 30_000, price: 9 },
    { at: asOf - 20_000, price: 11 },
    { at: asOf + 20_000, price: 12 },
    { at: asOf - 10_000, price: -1 },
  ], {
    timestampField: 'at',
    valueFields: ['price'],
    ranges: { price: { min: 0, max: 1_000 } },
    asOf,
    maxFutureSkewMs: 1_000,
    minimumPoints: 2,
  });
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.rows.map((row) => row.at), [asOf - 30_000, asOf - 20_000]);
  assert.equal(result.rows[1].price, 11, 'ultima duplicata valida vence');
  assert.deepEqual(result.counts, { input: 5, valid: 2, invalid: 2, duplicates: 1 });
  assert.equal(result.coverage, 0.4);
  assert.equal(result.qualityFlags.includes('out-of-order-input-sorted'), true);
  assert.equal(result.qualityFlags.includes('duplicate-timestamps-deduped'), true);
  assert.equal(result.qualityFlags.includes('invalid-rows-rejected'), true);
});

test('staleness e amostra insuficiente nunca parecem serie plena', () => {
  const asOf = Date.UTC(2026, 6, 13, 12);
  const stale = normalizeTimeSeries([{ at: asOf - 20_000, value: 2 }], {
    timestampField: 'at',
    valueFields: ['value'],
    asOf,
    maxAgeMs: 5_000,
    minimumPoints: 2,
  });
  assert.equal(stale.status, 'stale');
  assert.equal(stale.qualityFlags.includes('latest-observation-stale'), true);
  assert.equal(stale.qualityFlags.includes('insufficient-points'), true);
  const missing = normalizeTimeSeries(null, { minimumPoints: 1 });
  assert.equal(missing.status, 'missing');
  assert.equal(missing.coverage, 0);
});
