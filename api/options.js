const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function parseInstrument(row) {
  const parts = String(row.instrument_name || '').split('-');
  if (parts.length !== 4) return null;
  const match = parts[1].match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (!match || MONTHS[match[2]] === undefined) return null;
  const expiry = Date.UTC(2000 + Number(match[3]), MONTHS[match[2]], Number(match[1]), 8);
  return { ...row, expiry, strike: Number(parts[2]), optionType: parts[3] };
}

function maxPain(options) {
  const strikes = [...new Set(options.map((row) => row.strike).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!strikes.length) return null;
  let best = null;
  for (const settlement of strikes) {
    let payout = 0;
    for (const option of options) {
      const oi = Number(option.open_interest) || 0;
      payout += option.optionType === 'C' ? Math.max(0, settlement - option.strike) * oi : Math.max(0, option.strike - settlement) * oi;
    }
    if (!best || payout < best.payout) best = { strike: settlement, payout };
  }
  return best;
}

function sum(rows, selector) {
  return rows.reduce((total, row) => total + (Number(selector(row)) || 0), 0);
}

async function orderBook(instrumentName) {
  if (!instrumentName) return null;
  const payload = await getJson('https://www.deribit.com/api/v2/public/get_order_book?depth=1&instrument_name=' + encodeURIComponent(instrumentName));
  const result = payload && payload.result;
  return result ? {
    instrumentName,
    markIv: result.mark_iv,
    bidIv: result.bid_iv,
    askIv: result.ask_iv,
    greeks: result.greeks || null,
    markPrice: result.mark_price,
    underlyingPrice: result.underlying_price,
  } : null;
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const parsedUrl = new URL(request.url || '/', 'http://localhost');
  const requested = String(request.query && request.query.currency || parsedUrl.searchParams.get('currency') || 'BTC').toUpperCase();
  const currency = ['BTC', 'ETH', 'SOL'].includes(requested) ? requested : 'BTC';
  const now = Date.now();
  const start = now - 7 * 24 * 60 * 60 * 1000;
  try {
    const [summaryPayload, dvolPayload] = await Promise.all([
      getJson('https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=' + currency + '&kind=option'),
      getJson('https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=' + currency + '&start_timestamp=' + start + '&end_timestamp=' + now + '&resolution=3600'),
    ]);
    const options = (summaryPayload.result || []).map(parseInstrument).filter((row) => row && row.expiry > now);
    if (!options.length) throw new Error('Sem opcoes ativas para ' + currency);
    const expiries = [...new Set(options.map((row) => row.expiry))].sort((a, b) => a - b);
    const nearestExpiry = expiries.find((expiry) => options.some((row) => row.expiry === expiry && Number(row.open_interest) > 0)) || expiries[0];
    const nearest = options.filter((row) => row.expiry === nearestExpiry);
    const underlying = Number(nearest.find((row) => Number.isFinite(Number(row.underlying_price)))?.underlying_price) || null;
    const strikes = [...new Set(nearest.map((row) => row.strike))];
    const atmStrike = underlying && strikes.length ? strikes.reduce((best, strike) => Math.abs(strike - underlying) < Math.abs(best - underlying) ? strike : best, strikes[0]) : null;
    const atmCall = nearest.find((row) => row.strike === atmStrike && row.optionType === 'C');
    const atmPut = nearest.find((row) => row.strike === atmStrike && row.optionType === 'P');
    const books = await Promise.allSettled([orderBook(atmCall && atmCall.instrument_name), orderBook(atmPut && atmPut.instrument_name)]);
    const callBook = books[0].status === 'fulfilled' ? books[0].value : null;
    const putBook = books[1].status === 'fulfilled' ? books[1].value : null;
    const callRows = options.filter((row) => row.optionType === 'C');
    const putRows = options.filter((row) => row.optionType === 'P');
    const nearestCalls = nearest.filter((row) => row.optionType === 'C');
    const nearestPuts = nearest.filter((row) => row.optionType === 'P');
    const callOi = sum(callRows, (row) => row.open_interest);
    const putOi = sum(putRows, (row) => row.open_interest);
    const callVolumeUsd = sum(callRows, (row) => row.volume_usd);
    const putVolumeUsd = sum(putRows, (row) => row.volume_usd);
    const ivRows = nearest.filter((row) => Number.isFinite(Number(row.mark_iv)) && Number(row.open_interest) > 0);
    const ivWeight = sum(ivRows, (row) => row.open_interest);
    const weightedIv = ivWeight ? sum(ivRows, (row) => Number(row.mark_iv) * Number(row.open_interest)) / ivWeight : null;
    const atmIvValues = [callBook && callBook.markIv, putBook && putBook.markIv].map(Number).filter(Number.isFinite);
    const atmIv = atmIvValues.length ? sum(atmIvValues, (value) => value) / atmIvValues.length : weightedIv;
    const daysToExpiry = Math.max(0, (nearestExpiry - now) / 86400000);
    const expectedMove = underlying && atmIv ? underlying * (atmIv / 100) * Math.sqrt(daysToExpiry / 365) : null;
    const pain = maxPain(nearest);
    const dvolRows = dvolPayload && dvolPayload.result && dvolPayload.result.data || [];
    const dvolFirst = dvolRows.length ? Number(dvolRows[0][4]) : null;
    const dvolLatest = dvolRows.length ? Number(dvolRows[dvolRows.length - 1][4]) : null;
    const dvolChange7d = dvolFirst ? ((dvolLatest - dvolFirst) / dvolFirst) * 100 : null;

    response.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=180');
    response.setHeader('Access-Control-Allow-Origin', '*');
    return response.status(200).json({
      currency,
      fetchedAt: Date.now(),
      underlying,
      market: {
        instruments: options.length,
        callOi,
        putOi,
        putCallOi: callOi ? putOi / callOi : null,
        callVolumeUsd,
        putVolumeUsd,
        putCallVolume: callVolumeUsd ? putVolumeUsd / callVolumeUsd : null,
      },
      nearest: {
        expiry: nearestExpiry,
        instruments: nearest.length,
        callOi: sum(nearestCalls, (row) => row.open_interest),
        putOi: sum(nearestPuts, (row) => row.open_interest),
        atmStrike,
        atmIv,
        weightedIv,
        maxPain: pain && pain.strike,
        daysToExpiry,
        expectedMove,
        expectedLow: expectedMove ? underlying - expectedMove : null,
        expectedHigh: expectedMove ? underlying + expectedMove : null,
        call: callBook,
        put: putBook,
      },
      dvol: { latest: dvolLatest, change7d: dvolChange7d, points: dvolRows.length },
    });
  } catch (error) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    return response.status(503).json({ error: error.message, currency, fetchedAt: Date.now() });
  }
};
