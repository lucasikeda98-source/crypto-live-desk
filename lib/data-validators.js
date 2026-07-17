'use strict';

// REV-CC-02/H — ESTADO DE INTEGRACAO: estes validadores estao implementados e testados
// (test/data-validators.test.js) mas AINDA NAO estao ligados a nenhuma rota de producao.
// As garantias (range, futuro, ordenacao, duplicidade, amostra minima, staleness, cobertura)
// so passam a proteger dados quando uma rota chamar normalizeTimeSeries/finiteRule — integracao
// prevista na Fase 1 do SYSTEM_EVOLUTION_PLAN. Nao cite estas garantias como ativas ate la.

const { toFiniteNumber, toTimestampMs } = require('./analytics-core');

function clampRatio(value) {
  return Math.max(0, Math.min(1, value));
}

function finiteRule(value, rule = {}) {
  const parsed = toFiniteNumber(value);
  if (parsed === null) return { valid: !!rule.nullable && (value === null || value === undefined), value: null, reason: 'missing' };
  if (rule.integer && !Number.isInteger(parsed)) return { valid: false, value: null, reason: 'not-integer' };
  if (Number.isFinite(rule.min) && parsed < rule.min) return { valid: false, value: null, reason: 'below-minimum' };
  if (Number.isFinite(rule.max) && parsed > rule.max) return { valid: false, value: null, reason: 'above-maximum' };
  return { valid: true, value: parsed, reason: null };
}

function normalizeTimeSeries(input, options = {}) {
  const rows = Array.isArray(input) ? input : [];
  const timestampField = String(options.timestampField || 'observedAt');
  const valueFields = Array.from(new Set(Array.isArray(options.valueFields) ? options.valueFields.map(String) : []));
  const ranges = options.ranges && typeof options.ranges === 'object' ? options.ranges : {};
  const asOf = toTimestampMs(options.asOf) ?? Date.now();
  const maxFutureSkewMs = Math.max(0, toFiniteNumber(options.maxFutureSkewMs) ?? 60_000);
  const maxAgeMs = toFiniteNumber(options.maxAgeMs);
  const minimumPoints = Math.max(0, Math.floor(toFiniteNumber(options.minimumPoints) ?? 1));
  const duplicatePolicy = options.duplicatePolicy === 'first' ? 'first' : 'last';
  const byTimestamp = new Map();
  let invalidRows = 0;
  let duplicateRows = 0;
  let validFieldCount = 0;
  let outOfOrder = false;
  let previousTimestamp = null;

  rows.forEach((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      invalidRows += 1;
      return;
    }
    const observedAt = toTimestampMs(row[timestampField]);
    if (observedAt === null || observedAt < 0 || observedAt > asOf + maxFutureSkewMs) {
      invalidRows += 1;
      return;
    }
    const normalized = { ...row, [timestampField]: observedAt };
    let valid = true;
    let rowValidFieldCount = 0;
    valueFields.forEach((field) => {
      const result = finiteRule(row[field], ranges[field]);
      if (!result.valid) valid = false;
      else {
        normalized[field] = result.value;
        rowValidFieldCount += 1;
      }
    });
    if (!valid) {
      invalidRows += 1;
      return;
    }
    validFieldCount += rowValidFieldCount;
    if (previousTimestamp !== null && observedAt < previousTimestamp) outOfOrder = true;
    previousTimestamp = observedAt;
    if (byTimestamp.has(observedAt)) {
      duplicateRows += 1;
      if (duplicatePolicy === 'first') return;
    }
    byTimestamp.set(observedAt, normalized);
  });

  const normalizedRows = Array.from(byTimestamp.values()).sort((left, right) => left[timestampField] - right[timestampField]);
  const observedAt = normalizedRows.length ? normalizedRows.at(-1)[timestampField] : null;
  const coverage = rows.length ? clampRatio(normalizedRows.length / rows.length) : 0;
  const expectedFieldCount = rows.length * Math.max(1, valueFields.length);
  const completeness = rows.length ? clampRatio(valueFields.length ? validFieldCount / expectedFieldCount : coverage) : 0;
  const flags = [];
  if (invalidRows) flags.push('invalid-rows-rejected');
  if (duplicateRows) flags.push('duplicate-timestamps-deduped');
  if (outOfOrder) flags.push('out-of-order-input-sorted');
  if (normalizedRows.length < minimumPoints) flags.push('insufficient-points');
  const stale = observedAt !== null && maxAgeMs !== null && maxAgeMs >= 0 && asOf - observedAt > maxAgeMs;
  if (stale) flags.push('latest-observation-stale');
  const status = !normalizedRows.length ? 'missing' : stale ? 'stale' : flags.length ? 'partial' : 'ok';

  return {
    rows: normalizedRows,
    status,
    observedAt,
    coverage,
    completeness,
    qualityFlags: flags,
    counts: {
      input: rows.length,
      valid: normalizedRows.length,
      invalid: invalidRows,
      duplicates: duplicateRows,
    },
  };
}

module.exports = {
  finiteRule,
  normalizeTimeSeries,
};
