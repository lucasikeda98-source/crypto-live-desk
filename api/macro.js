const { toFiniteNumber } = require('../lib/analytics-core');
const { applyApiPolicyAsync, publicApiError, publicErrorMessage } = require('../lib/api-guard');
const { createDataEnvelope } = require('../lib/data-contract');
const { defaultDataHealthRegistry } = require('../lib/data-health-registry');

function xmlValue(entry, name) {
  const match = entry.match(new RegExp(`<d:${name}(?:\\s[^>]*)?>([^<]+)<\\/d:${name}>`, 'i'));
  return match ? toFiniteNumber(match[1]) : null;
}

function validObservationDate(value, asOf) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp >= 0 && timestamp <= asOf + 5 * 60 * 1000;
}

function safeDifference(left, right) {
  const value = left - right;
  return Number.isFinite(value) ? value : null;
}

function parseTreasury(xml, asOf = Date.now()) {
  const rows = (String(xml || '').match(/<entry>[\s\S]*?<\/entry>/gi) || []).map((entry) => {
    const dateMatch = entry.match(/<d:NEW_DATE(?:\s[^>]*)?>([^<]+)<\/d:NEW_DATE>/i);
    return {
      date: dateMatch ? dateMatch[1] : '',
      y2: xmlValue(entry, 'BC_2YEAR'),
      y10: xmlValue(entry, 'BC_10YEAR'),
      y30: xmlValue(entry, 'BC_30YEAR'),
    };
  }).filter((row) => validObservationDate(row.date, asOf) && row.y2 !== null && row.y10 !== null).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const latest = rows.at(-1);
  const prior = rows.at(-6) || rows.at(0);
  return latest ? {
    ...latest,
    curve10y2y: safeDifference(latest.y10, latest.y2),
    y10Change5d: prior ? safeDifference(latest.y10, prior.y10) : null,
    y2Change5d: prior ? safeDifference(latest.y2, prior.y2) : null,
  } : null;
}

function parseVix(csv, asOf = Date.now()) {
  const lines = String(csv || '').trim().split(/\r?\n/);
  if (lines.length < 2) return null;
  const rows = lines.slice(1).map((line) => {
    const parts = line.split(',');
    return { date: parts[0], close: toFiniteNumber(parts[4]) };
  }).filter((row) => validObservationDate(row.date, asOf) && row.close !== null && row.close > 0)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  const latest = rows.at(-1), prior = rows.at(-6) || rows.at(0);
  const rawChange = latest && prior && prior.close ? ((latest.close - prior.close) / prior.close) * 100 : null;
  return latest ? { ...latest, change5d: Number.isFinite(rawChange) ? rawChange : null } : null;
}

async function getText(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw publicApiError(`Macro provider HTTP ${response.status}`);
  return response.text();
}

function treasuryYearsFor(date) {
  const value = date instanceof Date ? date : new Date(date);
  const year = value.getUTCFullYear();
  return value.getUTCMonth() === 0 ? [year - 1, year] : [year];
}

function attachMacroContract(payload, requestStartedAt) {
  const fetchedAt = payload.fetchedAt;
  const sourceIds = [];
  if (payload.treasury) sourceIds.push('us-treasury-yields');
  if (payload.vix) sourceIds.push('cboe-vix');
  const coverage = sourceIds.length / 2;
  const status = !sourceIds.length ? 'error' : Object.keys(payload.errors || {}).length ? 'partial' : 'ok';
  const envelope = createDataEnvelope({
    datasetId: 'macro.us-risk.v1',
    sourceId: sourceIds.length === 1 ? sourceIds[0] : 'us-macro-composite',
    sourceIds,
    sourceTier: 'composite',
    entity: 'united-states-macro-risk',
    grain: 'daily-latest-provider-values',
    observedAt: payload.observedAt,
    availableAt: null,
    retrievedAt: fetchedAt,
    cacheStoredAt: fetchedAt,
    expiresAt: fetchedAt + 4 * 24 * 60 * 60_000,
    vintageAt: fetchedAt,
    unit: 'percent, percentage points and index level',
    currency: 'USD',
    timezone: 'UTC',
    rounding: 'raw provider precision; display rounding belongs to the client',
    status,
    coverage,
    completeness: coverage,
    qualityFlags: ['not-vintage-safe'],
    provenance: 'US Treasury daily yield curve and Cboe VIX public history',
    fallbackUsed: false,
    revision: {
      mode: 'latest-provider-values',
      vintageAt: fetchedAt,
      backtestSafe: false,
      reason: 'first-release availability timestamps are not exposed by the current upstreams',
    },
    licenseClass: 'us-government-public-domain-and-cboe-public-history-terms',
    errors: Object.entries(payload.errors || {}).map(([key, message]) => ({
      code: `MACRO_${key}`,
      sourceId: key === 'vix' ? 'cboe-vix' : key === 'treasury' ? 'us-treasury-yields' : 'us-macro-composite',
      retryable: true,
      message,
    })),
    payload,
    validateSchema: true,
  });
  defaultDataHealthRegistry.record(envelope, {
    durationMs: Math.max(0, Date.now() - requestStartedAt),
    cacheHit: false,
    error: status === 'error',
  });
  return { ...payload, dataEnvelope: envelope, dataHealth: defaultDataHealthRegistry.snapshot(envelope.datasetId) };
}

module.exports = async function handler(request, response) {
  const requestStartedAt = Date.now();
  if (!await applyApiPolicyAsync(request, response, { cacheControl: 'public, s-maxage=3600, stale-while-revalidate=21600' })) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const now = new Date();
  const treasuryYears = treasuryYearsFor(now);
  const treasuryUrls = treasuryYears.map((value) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=${value}`);
  const vixUrl = 'https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv';
  const results = await Promise.allSettled(treasuryUrls.map(getText).concat([getText(vixUrl)]));
  const treasuryResults = results.slice(0, treasuryUrls.length);
  const vixResult = results[results.length - 1];
  const treasuryXml = treasuryResults.filter((result) => result.status === 'fulfilled').map((result) => result.value).join('\n');
  const asOf = now.getTime();
  // Os parsers processam XML/CSV externo; uma falha inesperada deve degradar para o mesmo 503
  // gracioso das outras rotas, nao virar um 500 sem tratamento.
  let treasury = null;
  let vix = null;
  try {
    treasury = parseTreasury(treasuryXml, asOf);
    vix = vixResult.status === 'fulfilled' ? parseVix(vixResult.value, asOf) : null;
  } catch (error) {
    const payload = { treasury: null, vix: null, score: 0, dataStatus: 'error', errors: { parse: 'payload upstream invalido' }, observedAt: null, fetchedAt: Date.now() };
    return response.status(503).json(attachMacroContract(payload, requestStartedAt));
  }
  if (treasury) treasury.observedAt = Date.parse(treasury.date);
  if (vix) vix.observedAt = Date.parse(vix.date);
  let score = 0;
  if (vix) score += vix.close >= 35 ? -6 : vix.close >= 25 ? -4 : vix.close <= 17 ? 3 : 0;
  if (treasury && Number.isFinite(treasury.y10Change5d)) score += treasury.y10Change5d >= 0.15 ? -2 : treasury.y10Change5d <= -0.15 ? 2 : 0;
  if (treasury && treasury.curve10y2y < 0) score -= 1;

  const errors = {};
  if (!treasury) errors.treasury = treasuryResults.map((result, index) => result.status === 'rejected' ? publicErrorMessage(`macro-treasury-${index}`, result.reason) : 'sem linhas validas').join('; ');
  if (!vix) errors.vix = vixResult.status === 'rejected' ? publicErrorMessage('macro-vix', vixResult.reason) : 'sem linhas validas';
  const observedDates = [treasury && treasury.observedAt, vix && vix.observedAt].filter(Number.isFinite);
  const observedAt = observedDates.length ? Math.max(...observedDates) : null;
  const payload = { treasury, vix, score, dataStatus: Object.keys(errors).length ? (treasury || vix ? 'partial' : 'error') : 'fresh', errors, observedAt, fetchedAt: Date.now() };
  return response.status(treasury || vix ? 200 : 503).json(attachMacroContract(payload, requestStartedAt));
};

module.exports.parseTreasury = parseTreasury;
module.exports.parseVix = parseVix;
module.exports.treasuryYearsFor = treasuryYearsFor;
module.exports.attachMacroContract = attachMacroContract;
