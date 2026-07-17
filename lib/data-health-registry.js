'use strict';

const { toFiniteNumber } = require('./analytics-core');

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(4)) : 0;
}

function percentile(values, quantile) {
  if (!values.length) return null;
  const ordered = values.slice().sort((left, right) => left - right);
  const index = Math.max(0, Math.min(ordered.length - 1, Math.ceil(quantile * ordered.length) - 1));
  return ordered[index];
}

class DataHealthRegistry {
  constructor(options = {}) {
    this.maxSamples = Math.max(10, Math.min(2_048, Math.floor(toFiniteNumber(options.maxSamples) ?? 256)));
    this.samples = new Map();
  }

  record(envelope, observation = {}) {
    if (!envelope || typeof envelope.datasetId !== 'string') return null;
    const datasetId = envelope.datasetId;
    const checkedAt = toFiniteNumber(observation.checkedAt) ?? Date.now();
    const durationMs = Math.max(0, toFiniteNumber(observation.durationMs) ?? 0);
    const failed = observation.error === true || ['error', 'invalid', 'missing'].includes(envelope.status);
    const sample = {
      checkedAt,
      durationMs,
      failed,
      cacheHit: observation.cacheHit === true,
      fallbackUsed: envelope.fallbackUsed === true,
      status: envelope.status,
      qualityScore: toFiniteNumber(envelope.quality && envelope.quality.score),
      coverage: toFiniteNumber(envelope.coverage),
      latencyMs: toFiniteNumber(envelope.latencyMs),
    };
    const entries = this.samples.get(datasetId) || [];
    entries.push(sample);
    if (entries.length > this.maxSamples) entries.splice(0, entries.length - this.maxSamples);
    this.samples.set(datasetId, entries);
    return this.snapshot(datasetId);
  }

  snapshot(datasetId) {
    const entries = this.samples.get(datasetId) || [];
    const latest = entries.at(-1) || null;
    const failed = entries.filter((entry) => entry.failed);
    const successes = entries.filter((entry) => !entry.failed);
    return {
      datasetId,
      scope: 'instance',
      sampleCount: entries.length,
      windowStartedAt: entries.length ? entries[0].checkedAt : null,
      checkedAt: latest ? latest.checkedAt : null,
      status: latest ? latest.status : 'missing',
      p50DurationMs: percentile(entries.map((entry) => entry.durationMs), 0.5),
      p95DurationMs: percentile(entries.map((entry) => entry.durationMs), 0.95),
      errorRate: ratio(failed.length, entries.length),
      cacheHitRate: ratio(entries.filter((entry) => entry.cacheHit).length, entries.length),
      fallbackRate: ratio(entries.filter((entry) => entry.fallbackUsed).length, entries.length),
      lastSuccessAt: successes.length ? successes.at(-1).checkedAt : null,
      lastFailureAt: failed.length ? failed.at(-1).checkedAt : null,
      latestQualityScore: latest ? latest.qualityScore : null,
      latestCoverage: latest ? latest.coverage : null,
      latestIngestionLatencyMs: latest ? latest.latencyMs : null,
    };
  }

  reset(datasetId) {
    if (datasetId) this.samples.delete(datasetId);
    else this.samples.clear();
  }
}

const defaultDataHealthRegistry = new DataHealthRegistry();

module.exports = {
  DataHealthRegistry,
  defaultDataHealthRegistry,
  percentile,
};
