'use strict';

const crypto = require('node:crypto');
const { toFiniteNumber } = require('./analytics-core');

const DATA_CONTRACT_VERSION = '1.0.0';
const STATUSES = new Set(['ok', 'partial', 'stale', 'invalid', 'missing', 'proxy', 'error']);
const SOURCE_TIERS = new Set(['primary', 'fallback', 'composite', 'manual']);
const DATASET_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const DATASET_SLA = Object.freeze({
  'market.overview.v1': Object.freeze({
    maxAgeMs: 10 * 60_000,
    minCoverage: 0.75,
    minCompleteness: 0.75,
    deadlineMs: 28_000,
    maxIngestionLagMs: 120_000,
  }),
  'macro.us-risk.v1': Object.freeze({
    maxAgeMs: 4 * 24 * 60 * 60_000,
    minCoverage: 0.5,
    minCompleteness: 0.5,
    deadlineMs: 20_000,
    maxIngestionLagMs: 7 * 24 * 60 * 60_000,
  }),
});

// REV-CC-02/C: caminhos com `[]` validam CADA item da array (amostra limitada) e caminhos
// aninhados sob um pai anulavel so sao validados quando o pai existe — a nulabilidade do pai
// ja e o contrato do nivel de topo. Sem isso, `treasury.y10` virando string passava invisivel
// (o topo so via `treasury: object`).
const DATASET_SCHEMAS = Object.freeze({
  'market.overview.v1': Object.freeze({
    global: ['object', 'null'],
    markets: ['array'],
    'markets[].id': ['string'],
    'markets[].current_price': ['number', 'null'],
    'markets[].market_cap': ['number', 'null'],
    trending: ['object', 'null'],
    source: ['string'],
    errors: ['object'],
    completeness: ['number'],
    observedAt: ['number', 'null'],
    fetchedAt: ['number'],
    stale: ['boolean'],
  }),
  'macro.us-risk.v1': Object.freeze({
    treasury: ['object', 'null'],
    'treasury.y10': ['number'],
    'treasury.y2': ['number'],
    vix: ['object', 'null'],
    'vix.close': ['number'],
    score: ['number'],
    dataStatus: ['string'],
    errors: ['object'],
    observedAt: ['number', 'null'],
    fetchedAt: ['number'],
  }),
});
const NESTED_SAMPLE_LIMIT = 50;

function finite(value) {
  return toFiniteNumber(value);
}

function timestamp(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  const numeric = finite(value);
  if (numeric !== null) return numeric;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function clampRatio(value, fallback = 0) {
  const parsed = finite(value);
  return parsed === null ? fallback : Math.max(0, Math.min(1, parsed));
}

function cleanText(value, maximum = 160) {
  return String(value || '').replace(/[\x00-\x1f\x7f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
}

function cleanIdentifier(value, pattern, label) {
  const normalized = cleanText(value, 120).toLowerCase();
  if (!pattern.test(normalized)) throw new TypeError(`invalid ${label}`);
  return normalized;
}

function canonicalValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (typeof value !== 'object') return null;
  const output = {};
  Object.keys(value).sort().forEach((key) => { output[key] = canonicalValue(value[key]); });
  return output;
}

function payloadHash(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalValue(payload))).digest('hex');
}

function valueType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : 'non-finite-number';
  return typeof value;
}

function schemaShape(value, depth = 0) {
  const type = valueType(value);
  if (depth >= 12) return { type: 'depth-limit' };
  if (type === 'array') {
    const shapes = Array.from(new Set(value.map((entry) => JSON.stringify(schemaShape(entry, depth + 1))))).sort();
    return { type, items: shapes.map((shape) => JSON.parse(shape)) };
  }
  if (type === 'object') {
    const properties = {};
    Object.keys(value).sort().forEach((key) => { properties[key] = schemaShape(value[key], depth + 1); });
    return { type, properties };
  }
  return { type };
}

function schemaFingerprint(payload) {
  return payloadHash(schemaShape(payload));
}

function pathEntries(value, parts, index) {
  if (index >= parts.length) return { entries: [value], missing: false };
  // Pai nulo/indefinido: a validacao aninhada e pulada — o contrato do pai (ex.: `treasury:
  // ['object','null']`) e quem decide se essa ausencia e valida.
  if (value === null || value === undefined) return { entries: [], missing: false };
  const part = parts[index];
  if (part.endsWith('[]')) {
    const key = part.slice(0, -2);
    if (typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, key)) return { entries: [], missing: true };
    const rows = value[key];
    if (!Array.isArray(rows)) return { entries: [], missing: true };
    let missing = false;
    const entries = [];
    rows.slice(0, NESTED_SAMPLE_LIMIT).forEach((item) => {
      const result = pathEntries(item, parts, index + 1);
      if (result.missing) missing = true;
      result.entries.forEach((entry) => entries.push(entry));
    });
    return { entries, missing };
  }
  if (typeof value !== 'object' || !Object.prototype.hasOwnProperty.call(value, part)) return { entries: [], missing: true };
  return pathEntries(value[part], parts, index + 1);
}

function validateDatasetPayload(datasetId, payload) {
  const schema = DATASET_SCHEMAS[datasetId];
  const observedShapeHash = schemaFingerprint(payload);
  if (!schema) {
    return { checked: false, valid: true, contractHash: null, observedShapeHash, missingFields: [], invalidFields: [] };
  }
  const missingFields = [];
  const invalidFields = [];
  Object.entries(schema).forEach(([path, expected]) => {
    const result = pathEntries(payload, path.split('.'), 0);
    if (result.missing) missingFields.push(path);
    for (const value of result.entries) {
      const actual = valueType(value);
      if (!expected.includes(actual)) {
        invalidFields.push({ path, expected, actual });
        break;
      }
    }
  });
  return {
    checked: true,
    valid: !missingFields.length && !invalidFields.length,
    contractHash: payloadHash(schema),
    observedShapeHash,
    missingFields,
    invalidFields,
  };
}

function normalizeError(error, fallbackCode = 'UPSTREAM_ERROR') {
  const source = error && typeof error === 'object' ? error : { message: error };
  const rawCode = cleanText(source.code || fallbackCode, 64).toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
  return {
    code: rawCode || fallbackCode,
    sourceId: SOURCE_ID_PATTERN.test(String(source.sourceId || '')) ? String(source.sourceId) : null,
    retryable: source.retryable !== false,
    message: cleanText(source.message || 'upstream unavailable') || 'upstream unavailable',
  };
}

function uniqueFlags(flags) {
  return Array.from(new Set((Array.isArray(flags) ? flags : [])
    .map((flag) => cleanText(flag, 80).toLowerCase().replace(/[^a-z0-9-]+/g, '-'))
    .filter(Boolean)));
}

function qualityDimensions({ status, coverage, completeness, latencyMs, latencyBudgetMs, flags, errors, schemaValidation }) {
  const temporal = status === 'invalid' || flags.includes('temporal-order-invalid') || flags.includes('future-observation') ? 0 : 1;
  const availability = ['missing', 'error'].includes(status) ? 0 : status === 'stale' ? 0.5 : 1;
  const validity = schemaValidation && schemaValidation.checked && !schemaValidation.valid ? 0 : 1;
  const latency = latencyMs === null || latencyBudgetMs === null ? null : Math.max(0, Math.min(1, 1 - latencyMs / Math.max(1, latencyBudgetMs)));
  const errorFactor = errors.length ? Math.max(0, 1 - errors.length * 0.2) : 1;
  const weighted = temporal * 0.25 + availability * 0.15 + validity * 0.1 + coverage * 0.2 + completeness * 0.2 + errorFactor * 0.1;
  return {
    temporal,
    availability,
    validity,
    coverage,
    completeness,
    latency,
    errorFactor,
    score: Math.round(weighted * 100),
  };
}

function createDataEnvelope(options = {}) {
  const datasetId = cleanIdentifier(options.datasetId, DATASET_ID_PATTERN, 'datasetId');
  const sourceId = cleanIdentifier(options.sourceId, SOURCE_ID_PATTERN, 'sourceId');
  const sourceTier = cleanText(options.sourceTier || 'primary', 20).toLowerCase();
  if (!SOURCE_TIERS.has(sourceTier)) throw new TypeError('invalid sourceTier');
  const sla = options.sla || DATASET_SLA[datasetId] || {};
  const retrievedAt = timestamp(options.retrievedAt);
  if (retrievedAt === null || retrievedAt < 0) throw new TypeError('invalid retrievedAt');
  const clockSkewMs = Math.max(0, finite(options.clockSkewMs) ?? 60_000);
  let observedAt = timestamp(options.observedAt);
  let availableAt = timestamp(options.availableAt);
  const cacheStoredAt = timestamp(options.cacheStoredAt) ?? retrievedAt;
  const expiresAt = timestamp(options.expiresAt) ?? retrievedAt + Math.max(0, finite(sla.maxAgeMs) ?? 0);
  const vintageAt = timestamp(options.vintageAt);
  let status = cleanText(options.status || 'ok', 20).toLowerCase();
  if (!STATUSES.has(status)) throw new TypeError('invalid status');
  let flags = uniqueFlags(options.qualityFlags);

  if (observedAt === null) flags.push('missing-observed-at');
  // REV-CC-02/B: quando availableAt e inferido, a latencia de ingestao e DESCONHECIDA — nao zero.
  // Inferir zero dava credito de SLA permanente a rotas (macro) que nunca informam availableAt.
  const availabilityInferred = availableAt === null;
  if (availableAt === null) {
    availableAt = retrievedAt;
    flags.push('availability-inferred-at-retrieval');
  }
  if (vintageAt !== null && (vintageAt < availableAt || vintageAt > retrievedAt + clockSkewMs)) {
    flags.push('invalid-vintage-order');
    status = 'invalid';
  }
  if (observedAt !== null && observedAt > retrievedAt + clockSkewMs) {
    flags.push('future-observation');
    status = 'invalid';
  }
  if (availableAt > retrievedAt + clockSkewMs || (observedAt !== null && availableAt < observedAt)) {
    flags.push('temporal-order-invalid');
    status = 'invalid';
  }
  if (expiresAt < cacheStoredAt) {
    flags.push('invalid-expiry');
    status = 'invalid';
  } else if (retrievedAt > expiresAt && status === 'ok') {
    flags.push('expired-at-retrieval');
    status = 'stale';
  }

  const coverage = clampRatio(options.coverage);
  const completeness = clampRatio(options.completeness);
  const minCoverage = clampRatio(sla.minCoverage);
  const minCompleteness = clampRatio(sla.minCompleteness);
  if (coverage < minCoverage) flags.push('coverage-below-sla');
  if (completeness < minCompleteness) flags.push('completeness-below-sla');
  if (status === 'ok' && (coverage < minCoverage || completeness < minCompleteness)) status = 'partial';
  const latencyMs = availabilityInferred ? null : Math.max(0, retrievedAt - availableAt);
  const deadlineMs = finite(sla.deadlineMs);
  const maxIngestionLagMs = finite(sla.maxIngestionLagMs);
  if (maxIngestionLagMs !== null && latencyMs !== null && latencyMs > maxIngestionLagMs) flags.push('latency-above-sla');
  // REV-CC-02/B: SLA de frescor aplicado contra a idade da OBSERVACAO. Antes, a unica checagem
  // temporal era retrievedAt > expiresAt com expiresAt = retrievedAt + maxAge — tautologia que
  // nunca dispara na criacao; um upstream congelado servindo dado de meses passava como 'ok'.
  const maxObservationAgeMs = finite(sla.maxAgeMs);
  if (maxObservationAgeMs !== null && maxObservationAgeMs > 0 && observedAt !== null
    && retrievedAt - observedAt > maxObservationAgeMs) {
    flags.push('observation-age-above-sla');
    if (status === 'ok' || status === 'partial') status = 'stale';
  }
  const errors = boundEnvelopeErrors((Array.isArray(options.errors) ? options.errors : []).map((error, index) => normalizeError(error, `UPSTREAM_ERROR_${index + 1}`)));
  const schemaValidation = options.validateSchema ? validateDatasetPayload(datasetId, options.payload) : {
    checked: false,
    valid: true,
    contractHash: DATASET_SCHEMAS[datasetId] ? payloadHash(DATASET_SCHEMAS[datasetId]) : null,
    observedShapeHash: schemaFingerprint(options.payload),
    missingFields: [],
    invalidFields: [],
  };
  if (!schemaValidation.valid) {
    flags.push('schema-drift');
    status = 'invalid';
  }
  flags = uniqueFlags(flags);
  const sourceIds = Array.from(new Set([sourceId].concat(Array.isArray(options.sourceIds) ? options.sourceIds : [])
    .map((value) => cleanText(value, 120).toLowerCase())
    .filter((value) => SOURCE_ID_PATTERN.test(value))));

  return {
    datasetId,
    schemaVersion: DATA_CONTRACT_VERSION,
    sourceId,
    sourceIds,
    sourceTier,
    entity: cleanText(options.entity, 120) || null,
    symbol: cleanText(options.symbol, 30).toUpperCase() || null,
    venue: cleanText(options.venue, 80) || null,
    timeframe: cleanText(options.timeframe, 30) || null,
    grain: cleanText(options.grain, 80) || null,
    observedAt,
    availableAt,
    vintageAt,
    decisionEligibleAt: availableAt,
    retrievedAt,
    cacheStoredAt,
    expiresAt,
    unit: cleanText(options.unit, 120) || null,
    currency: cleanText(options.currency, 20).toUpperCase() || null,
    timezone: cleanText(options.timezone || 'UTC', 60),
    rounding: cleanText(options.rounding, 120) || null,
    status,
    coverage,
    completeness,
    latencyMs,
    qualityFlags: flags,
    quality: qualityDimensions({ status, coverage, completeness, latencyMs, latencyBudgetMs: maxIngestionLagMs, flags, errors, schemaValidation }),
    provenance: cleanText(options.provenance, 160) || 'direct',
    fallbackUsed: !!options.fallbackUsed,
    revision: options.revision && typeof options.revision === 'object' ? canonicalValue(options.revision) : null,
    licenseClass: cleanText(options.licenseClass, 80) || 'unspecified',
    errors,
    schemaValidation,
    payloadHash: payloadHash(options.payload),
    payloadHashAlgorithm: 'sha256-canonical-json-v1',
    sla: {
      maxAgeMs: finite(sla.maxAgeMs),
      minCoverage,
      minCompleteness,
      deadlineMs,
      maxIngestionLagMs,
    },
  };
}

// REV-CC-02/D: erros deduplicados por codigo e limitados — sem isso, uma outage de horas
// anexava um erro identico por ciclo de refresh e o corpo da resposta inchava sem teto.
const MAX_ENVELOPE_ERRORS = 8;
function boundEnvelopeErrors(errors) {
  const seen = new Set();
  const output = [];
  for (const entry of Array.isArray(errors) ? errors : []) {
    const key = entry && entry.code || '';
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(entry);
    if (output.length >= MAX_ENVELOPE_ERRORS) break;
  }
  return output;
}

function markEnvelopeStatus(envelope, status, error, flag, payload) {
  if (!envelope || typeof envelope !== 'object') return envelope;
  const nextStatus = STATUSES.has(status) ? status : 'error';
  const errors = boundEnvelopeErrors(envelope.errors.concat(error ? [normalizeError(error)] : []));
  const flags = uniqueFlags(envelope.qualityFlags.concat(flag ? [flag] : []));
  return {
    ...envelope,
    status: nextStatus,
    errors,
    qualityFlags: flags,
    // REV-CC-02/E: se o corpo servido mudou (ex.: marcacao stale), o hash de integridade tem
    // que acompanhar — um payloadHash que nao bate com o payload servido nao verifica nada.
    ...(payload !== undefined ? { payloadHash: payloadHash(payload) } : {}),
    quality: qualityDimensions({
      status: nextStatus,
      coverage: envelope.coverage,
      completeness: envelope.completeness,
      latencyMs: envelope.latencyMs,
      latencyBudgetMs: envelope.sla && envelope.sla.maxIngestionLagMs,
      flags,
      errors,
      schemaValidation: envelope.schemaValidation,
    }),
  };
}

module.exports = {
  DATASET_SCHEMAS,
  DATASET_SLA,
  DATA_CONTRACT_VERSION,
  createDataEnvelope,
  markEnvelopeStatus,
  normalizeError,
  payloadHash,
  schemaFingerprint,
  validateDatasetPayload,
};
