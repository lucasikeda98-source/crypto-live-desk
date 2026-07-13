const { toFiniteNumber, toTimestampMs } = require('../lib/analytics-core');
const { applyApiPolicyAsync } = require('../lib/api-guard');

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

function remainingTimeout(deadline, cap) {
  return Math.max(1, Math.min(cap || 18000, deadline - Date.now()));
}

async function getJson(url, deadline) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(remainingTimeout(deadline)),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function parseInstrument(row) {
  const parts = String(row.instrument_name || '').split('-');
  if (parts.length !== 4) return null;
  const match = parts[1].match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!match || MONTHS[match[2]] === undefined) return null;
  const year = 2000 + Number(match[3]);
  const month = MONTHS[match[2]];
  const day = Number(match[1]);
  const expiry = Date.UTC(year, month, day, 8);
  // USDC-settled families (e.g. SOL_USDC-13JUL26-5d9-C) encode decimal strikes with 'd'.
  const strike = toFiniteNumber(parts[2].replace('d', '.'));
  const expiryDate = new Date(expiry);
  if (expiryDate.getUTCFullYear() !== year || expiryDate.getUTCMonth() !== month || expiryDate.getUTCDate() !== day) return null;
  if (strike === null || strike <= 0 || !['C', 'P'].includes(parts[3])) return null;
  return { ...row, expiry, strike, optionType: parts[3] };
}

function maxPain(options) {
  const strikes = [...new Set(options.map((row) => row.strike).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!strikes.length) return null;
  let best = null;
  for (const settlement of strikes) {
    let payout = 0;
    let validSettlement = true;
    for (const option of options) {
      const parsedOi = toFiniteNumber(option.open_interest);
      const oi = parsedOi === null ? 0 : Math.max(0, parsedOi);
      const intrinsic = option.optionType === 'C' ? Math.max(0, settlement - option.strike) : Math.max(0, option.strike - settlement);
      const contribution = intrinsic * oi;
      if (!Number.isFinite(contribution) || !Number.isFinite(payout + contribution)) {
        validSettlement = false;
        break;
      }
      payout += contribution;
    }
    if (validSettlement && (!best || payout < best.payout)) best = { strike: settlement, payout };
  }
  return best;
}

function sum(rows, selector) {
  let total = 0;
  for (const row of rows) {
    const value = toFiniteNumber(selector(row));
    const next = total + (value === null ? 0 : value);
    if (!Number.isFinite(next)) return null;
    total = next;
  }
  return total;
}

function sumNonNegative(rows, selector) {
  let total = 0;
  for (const row of rows) {
    const value = toFiniteNumber(selector(row));
    const next = total + (value !== null && value >= 0 ? value : 0);
    if (!Number.isFinite(next)) return null;
    total = next;
  }
  return total;
}

function safeRatio(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return null;
  const ratio = numerator / denominator;
  return Number.isFinite(ratio) ? ratio : null;
}

function weightedAverage(rows, valueSelector, weightSelector) {
  const pairs = rows.map((row) => ({
    value: toFiniteNumber(valueSelector(row)),
    weight: toFiniteNumber(weightSelector(row)),
  })).filter((pair) => pair.value !== null && pair.value > 0 && pair.weight !== null && pair.weight > 0);
  if (!pairs.length) return null;
  const maxWeight = pairs.reduce((maximum, pair) => Math.max(maximum, pair.weight), 0);
  let normalizedWeight = 0;
  let mean = 0;
  for (const pair of pairs) {
    const weight = pair.weight / maxWeight;
    const nextWeight = normalizedWeight + weight;
    const nextMean = mean + (pair.value - mean) * (weight / nextWeight);
    if (!Number.isFinite(nextWeight) || !Number.isFinite(nextMean)) return null;
    normalizedWeight = nextWeight;
    mean = nextMean;
  }
  return mean;
}

function observedTimestamp(value, asOf = Date.now()) {
  const parsed = toTimestampMs(value);
  return parsed !== null && parsed >= 0 && parsed <= asOf + 60_000 ? parsed : null;
}

function normalizeDvolRows(rows, asOf = Date.now()) {
  const byTimestamp = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const timestamp = observedTimestamp(row && row[0], asOf);
    const close = toFiniteNumber(row && row[4]);
    if (timestamp !== null && close !== null && close > 0) byTimestamp.set(timestamp, { timestamp, close });
  });
  return Array.from(byTimestamp.values()).sort((a, b) => a.timestamp - b.timestamp);
}

async function orderBook(instrumentName, deadline) {
  if (!instrumentName) return null;
  const payload = await getJson('https://www.deribit.com/api/v2/public/get_order_book?depth=1&instrument_name=' + encodeURIComponent(instrumentName), deadline);
  if (payload && payload.error) throw new Error('Deribit book: ' + String(payload.error.message || payload.error.code || 'erro semantico'));
  const result = payload && payload.result;
  if (!result || typeof result !== 'object') throw new Error('Deribit book sem result valido');
  return {
    instrumentName,
    markIv: result.mark_iv,
    bidIv: result.bid_iv,
    askIv: result.ask_iv,
    greeks: result.greeks || null,
    markPrice: result.mark_price,
    underlyingPrice: result.underlying_price,
    observedAt: observedTimestamp(result.timestamp),
  };
}

module.exports = async function handler(request, response) {
  if (!await applyApiPolicyAsync(request, response, { cacheControl: 'public, s-maxage=60, stale-while-revalidate=180' })) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const parsedUrl = new URL(request.url || '/', 'http://localhost');
  const requested = String(parsedUrl.searchParams.get('currency') || 'BTC').toUpperCase();
  if (!['BTC', 'ETH', 'SOL'].includes(requested)) return response.status(400).json({ error: 'Invalid currency', allowed: ['BTC', 'ETH', 'SOL'] });
  const currency = requested;
  const now = Date.now();
  const deadline = now + 28000;
  const start = now - 7 * 24 * 60 * 60 * 1000;
  try {
    // Deribit indexes SOL options under the USDC settlement currency (SOL_USDC-*); querying
    // currency=SOL returns an empty book and used to 503 the whole block permanently.
    const summaryCurrency = currency === 'SOL' ? 'USDC' : currency;
    const instrumentPrefix = currency === 'SOL' ? 'SOL_USDC-' : null;
    // allSettled: a DVOL outage must not take down put/call, max pain and IV (and SOL may not
    // have a DVOL index at all) — the summary is the load-bearing payload.
    const [summarySettled, dvolSettled] = await Promise.allSettled([
      getJson('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=' + summaryCurrency + '&kind=option', deadline),
      getJson('https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=' + currency + '&start_timestamp=' + start + '&end_timestamp=' + now + '&resolution=3600', deadline),
    ]);
    if (summarySettled.status !== 'fulfilled') throw new Error(String(summarySettled.reason && summarySettled.reason.message || 'Deribit indisponivel'));
    const summaryPayload = summarySettled.value;
    const dvolPayload = dvolSettled.status === 'fulfilled' ? dvolSettled.value : null;
    if (!Array.isArray(summaryPayload && summaryPayload.result)) throw new Error('Deribit summary sem result valido');
    const summaryRows = summaryPayload.result.filter((row) => !instrumentPrefix || String(row.instrument_name || '').startsWith(instrumentPrefix));
    const options = summaryRows.map(parseInstrument).filter((row) => row && Number.isFinite(row.strike) && row.expiry > now);
    if (!options.length) throw new Error('Sem opcoes ativas para ' + currency);
    const expiries = [...new Set(options.map((row) => row.expiry))].sort((a, b) => a - b);
    const nearestExpiry = expiries.find((expiry) => options.some((row) => {
      const openInterest = toFiniteNumber(row.open_interest);
      return row.expiry === expiry && openInterest !== null && openInterest > 0;
    })) || expiries[0];
    const nearest = options.filter((row) => row.expiry === nearestExpiry);
    const underlyingRow = nearest.find((row) => {
      const value = toFiniteNumber(row.underlying_price);
      return value !== null && value > 0;
    });
    const underlying = underlyingRow ? toFiniteNumber(underlyingRow.underlying_price) : null;
    const strikes = [...new Set(nearest.map((row) => row.strike))];
    const atmStrike = underlying && strikes.length ? strikes.reduce((best, strike) => Math.abs(strike - underlying) < Math.abs(best - underlying) ? strike : best, strikes[0]) : null;
    const atmCall = nearest.find((row) => row.strike === atmStrike && row.optionType === 'C');
    const atmPut = nearest.find((row) => row.strike === atmStrike && row.optionType === 'P');
    const books = await Promise.allSettled([orderBook(atmCall && atmCall.instrument_name, deadline), orderBook(atmPut && atmPut.instrument_name, deadline)]);
    const callBook = books[0].status === 'fulfilled' ? books[0].value : null;
    const putBook = books[1].status === 'fulfilled' ? books[1].value : null;
    const callRows = options.filter((row) => row.optionType === 'C');
    const putRows = options.filter((row) => row.optionType === 'P');
    const nearestCalls = nearest.filter((row) => row.optionType === 'C');
    const nearestPuts = nearest.filter((row) => row.optionType === 'P');
    const callOi = sumNonNegative(callRows, (row) => row.open_interest);
    const putOi = sumNonNegative(putRows, (row) => row.open_interest);
    const callVolumeUsd = sumNonNegative(callRows, (row) => row.volume_usd);
    const putVolumeUsd = sumNonNegative(putRows, (row) => row.volume_usd);
    const ivRows = nearest.filter((row) => {
      const iv = toFiniteNumber(row.mark_iv);
      const oi = toFiniteNumber(row.open_interest);
      return iv !== null && iv > 0 && oi !== null && oi > 0;
    });
    const weightedIv = weightedAverage(ivRows, (row) => row.mark_iv, (row) => row.open_interest);
    const atmIvValues = [callBook && callBook.markIv, putBook && putBook.markIv].map(toFiniteNumber).filter((value) => value !== null && value > 0);
    const atmIvTotal = sum(atmIvValues, (value) => value);
    const atmIv = atmIvValues.length && atmIvTotal !== null ? atmIvTotal / atmIvValues.length : weightedIv;
    const daysToExpiry = Math.max(0, (nearestExpiry - now) / 86400000);
    const rawExpectedMove = underlying && atmIv ? underlying * (atmIv / 100) * Math.sqrt(daysToExpiry / 365) : null;
    const expectedMove = Number.isFinite(rawExpectedMove) ? rawExpectedMove : null;
    const pain = maxPain(nearest);
    const dvolRows = normalizeDvolRows(dvolPayload && dvolPayload.result && dvolPayload.result.data, now);
    const dvolFirst = dvolRows.length ? dvolRows[0].close : null;
    const dvolLatest = dvolRows.length ? dvolRows[dvolRows.length - 1].close : null;
    const dvolChange7d = dvolFirst ? ((dvolLatest - dvolFirst) / dvolFirst) * 100 : null;
    const errors = {};
    if (dvolSettled.status === 'rejected') errors.dvol = String(dvolSettled.reason && dvolSettled.reason.message || dvolSettled.reason);
    else if (!dvolRows.length) errors.dvol = 'Deribit DVOL sem pontos validos';
    if (books[0].status === 'rejected') errors.callBook = String(books[0].reason && books[0].reason.message || books[0].reason);
    if (books[1].status === 'rejected') errors.putBook = String(books[1].reason && books[1].reason.message || books[1].reason);
    if ([callOi, putOi, callVolumeUsd, putVolumeUsd].some((value) => value === null)) errors.numeric = 'Agregado Deribit excedeu o intervalo numerico seguro';
    const summaryTimes = options.map((row) => observedTimestamp(row.creation_timestamp, now)).filter(Number.isFinite);
    const summaryObservedAt = summaryTimes.length ? Math.max(...summaryTimes) : null;
    if (summaryObservedAt === null) errors.summaryTimestamp = 'Deribit summary sem creation_timestamp valido';

    const acquiredAt = Date.now();
    return response.status(200).json({
      currency,
      observedAt: summaryObservedAt,
      observedAtProvenance: summaryObservedAt === null ? 'missing' : 'deribit-summary-creation_timestamp',
      fetchedAt: acquiredAt,
      dataStatus: Object.keys(errors).length ? 'partial' : 'fresh',
      errors,
      underlying,
      market: {
        instruments: options.length,
        callOi,
        putOi,
        putCallOi: safeRatio(putOi, callOi),
        callVolumeUsd,
        putVolumeUsd,
        putCallVolume: safeRatio(putVolumeUsd, callVolumeUsd),
      },
      nearest: {
        expiry: nearestExpiry,
        instruments: nearest.length,
        callOi: sumNonNegative(nearestCalls, (row) => row.open_interest),
        putOi: sumNonNegative(nearestPuts, (row) => row.open_interest),
        atmStrike,
        atmIv,
        weightedIv,
        maxPain: pain && pain.strike,
        daysToExpiry,
        expectedMove,
        expectedLow: expectedMove !== null && Number.isFinite(underlying - expectedMove) ? Math.max(0, underlying - expectedMove) : null,
        expectedHigh: expectedMove !== null && Number.isFinite(underlying + expectedMove) ? underlying + expectedMove : null,
        call: callBook,
        put: putBook,
      },
      dvol: { latest: dvolLatest, change7d: dvolChange7d, points: dvolRows.length, observedAt: dvolRows.length ? dvolRows[dvolRows.length - 1].timestamp : null },
    });
  } catch (error) {
    return response.status(503).json({ error: error.message, currency, fetchedAt: Date.now() });
  }
};

module.exports.parseInstrument = parseInstrument;
module.exports.maxPain = maxPain;
module.exports.remainingTimeout = remainingTimeout;
module.exports.normalizeDvolRows = normalizeDvolRows;
module.exports.sumNonNegative = sumNonNegative;
module.exports.weightedAverage = weightedAverage;
