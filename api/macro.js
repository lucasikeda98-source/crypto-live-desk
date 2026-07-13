const { toFiniteNumber } = require('../lib/analytics-core');
const { applyApiPolicyAsync } = require('../lib/api-guard');

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
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function treasuryYearsFor(date) {
  const value = date instanceof Date ? date : new Date(date);
  const year = value.getUTCFullYear();
  return value.getUTCMonth() === 0 ? [year - 1, year] : [year];
}

module.exports = async function handler(request, response) {
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
  const treasury = parseTreasury(treasuryXml, asOf);
  const vix = vixResult.status === 'fulfilled' ? parseVix(vixResult.value, asOf) : null;
  if (treasury) treasury.observedAt = Date.parse(treasury.date);
  if (vix) vix.observedAt = Date.parse(vix.date);
  let score = 0;
  if (vix) score += vix.close >= 35 ? -6 : vix.close >= 25 ? -4 : vix.close <= 17 ? 3 : 0;
  if (treasury && Number.isFinite(treasury.y10Change5d)) score += treasury.y10Change5d >= 0.15 ? -2 : treasury.y10Change5d <= -0.15 ? 2 : 0;
  if (treasury && treasury.curve10y2y < 0) score -= 1;

  const errors = {};
  if (!treasury) errors.treasury = treasuryResults.map((result) => result.status === 'rejected' ? String(result.reason && result.reason.message || result.reason) : 'sem linhas validas').join('; ');
  if (!vix) errors.vix = vixResult.status === 'rejected' ? String(vixResult.reason && vixResult.reason.message || vixResult.reason) : 'sem linhas validas';
  const observedDates = [treasury && treasury.observedAt, vix && vix.observedAt].filter(Number.isFinite);
  const observedAt = observedDates.length ? Math.max(...observedDates) : null;
  return response.status(treasury || vix ? 200 : 503).json({ treasury, vix, score, dataStatus: Object.keys(errors).length ? (treasury || vix ? 'partial' : 'error') : 'fresh', errors, observedAt, fetchedAt: Date.now() });
};

module.exports.parseTreasury = parseTreasury;
module.exports.parseVix = parseVix;
module.exports.treasuryYearsFor = treasuryYearsFor;
