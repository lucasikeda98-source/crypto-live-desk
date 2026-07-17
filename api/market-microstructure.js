'use strict';

const { toFiniteNumber, toTimestampMs } = require('../lib/analytics-core');
const { applyApiPolicyAsync, publicApiError, publicErrorMessage } = require('../lib/api-guard');

const ALLOWED_SYMBOLS = new Set(['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'LINKUSDT', 'TRXUSDT', 'DOTUSDT', 'LTCUSDT', 'BCHUSDT', 'UNIUSDT', 'NEARUSDT', 'ATOMUSDT', 'FILUSDT', 'AAVEUSDT', 'SUIUSDT', 'HBARUSDT', 'XLMUSDT', 'ICPUSDT', 'ARBUSDT', 'OPUSDT']);

function finite(value) {
  return toFiniteNumber(value);
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw publicApiError(`Market venue HTTP ${response.status}`);
  return response.json();
}

function normalizeVenue(name, lastPrice, bid, ask, observedAt, quoteCurrency, observedAtProvenance) {
  const normalizedBid = finite(bid);
  const normalizedAsk = finite(ask);
  const validBook = normalizedBid !== null && normalizedAsk !== null && normalizedBid > 0 && normalizedAsk >= normalizedBid;
  const midpoint = validBook ? normalizedBid + (normalizedAsk - normalizedBid) / 2 : null;
  const normalizedPrice = validBook && Number.isFinite(midpoint) ? midpoint : finite(lastPrice);
  if (normalizedPrice === null || normalizedPrice <= 0) return null;
  const normalizedObservedAt = finite(observedAt);
  return {
    name,
    price: normalizedPrice,
    priceType: validBook ? 'midpoint' : 'last',
    quoteCurrency,
    bid: validBook ? normalizedBid : null,
    ask: validBook ? normalizedAsk : null,
    observedAt: normalizedObservedAt,
    // API-004: 'provider' = timestamp emitido pela propria venue; 'fetch' = hora local da
    // busca ocupando o campo (caso Binance bookTicker, que nao tem timestamp de provedor).
    observedAtProvenance: normalizedObservedAt === null ? 'missing' : (observedAtProvenance || 'provider'),
  };
}

function venueObservedAt(value, fetchedAt) {
  const parsed = toTimestampMs(value);
  if (parsed === null || parsed < 0 || parsed > fetchedAt + 60_000) return null;
  return parsed;
}

function summarizeOrderFlow(rows, asOf) {
  const trades = Array.isArray(rows) ? rows : [];
  const reference = finite(asOf) === null ? Date.now() : finite(asOf);
  let buyTakerUsd = 0;
  let sellTakerUsd = 0;
  let firstTradeAt = null;
  let lastTradeAt = null;
  let validTrades = 0;
  let numericOverflow = false;
  trades.forEach((trade) => {
    const price = finite(trade && trade.p);
    const quantity = finite(trade && trade.q);
    const timestamp = finite(trade && trade.T);
    if (price === null || quantity === null || price <= 0 || quantity <= 0 || timestamp === null || timestamp < 0 || timestamp > reference + 60_000 || typeof trade.m !== 'boolean') return;
    const quoteUsd = price * quantity;
    if (!Number.isFinite(quoteUsd) || quoteUsd <= 0) return;
    // Binance m=true means the buyer was the maker, therefore the aggressive side was a seller.
    if (trade.m === true) {
      if (!Number.isFinite(sellTakerUsd + quoteUsd)) numericOverflow = true;
      else sellTakerUsd += quoteUsd;
    } else if (!Number.isFinite(buyTakerUsd + quoteUsd)) numericOverflow = true;
    else buyTakerUsd += quoteUsd;
    firstTradeAt = firstTradeAt === null ? timestamp : Math.min(firstTradeAt, timestamp);
    lastTradeAt = lastTradeAt === null ? timestamp : Math.max(lastTradeAt, timestamp);
    validTrades += 1;
  });
  if (numericOverflow) {
    return {
      trades: validTrades,
      buyTakerUsd: null,
      sellTakerUsd: null,
      cvdUsd: null,
      imbalancePct: null,
      firstTradeAt,
      lastTradeAt,
      observedAt: lastTradeAt,
      observedAtProvenance: lastTradeAt === null ? 'missing' : 'binance-aggtrade-time',
      dataStatus: lastTradeAt === null ? 'missing' : reference - lastTradeAt > 60_000 ? 'stale' : 'partial',
      numericOverflow: true,
    };
  }
  const totalUsd = buyTakerUsd + sellTakerUsd;
  return {
    trades: validTrades,
    buyTakerUsd,
    sellTakerUsd,
    cvdUsd: buyTakerUsd - sellTakerUsd,
    imbalancePct: totalUsd > 0 ? ((buyTakerUsd - sellTakerUsd) / totalUsd) * 100 : null,
    firstTradeAt,
    lastTradeAt,
    observedAt: lastTradeAt,
    observedAtProvenance: lastTradeAt === null ? 'missing' : 'binance-aggtrade-time',
    dataStatus: lastTradeAt === null ? 'missing' : reference - lastTradeAt > 60_000 ? 'stale' : 'fresh',
    numericOverflow: false,
  };
}

function basisPoints(numerator, denominator) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  const value = numerator / denominator * 10000;
  return Number.isFinite(value) ? value : null;
}

function summarizeVenues(venues) {
  const valid = (Array.isArray(venues) ? venues : []).filter(Boolean);
  const prices = valid.map((venue) => venue.price).sort((a, b) => a - b);
  if (!prices.length) return { venues: [], medianPrice: null, dispersionBps: null, coinbasePremiumBps: null };
  const middle = Math.floor(prices.length / 2);
  const medianPrice = prices.length % 2 ? prices[middle] : prices[middle - 1] + (prices[middle] - prices[middle - 1]) / 2;
  valid.forEach((venue) => { venue.premiumBps = basisPoints(venue.price - medianPrice, medianPrice); });
  const binance = valid.find((venue) => venue.name === 'Binance');
  const coinbase = valid.find((venue) => venue.name === 'Coinbase');
  return {
    venues: valid,
    medianPrice,
    dispersionBps: basisPoints(prices.at(-1) - prices[0], medianPrice),
    coinbasePremiumBps: binance && coinbase ? basisPoints(coinbase.price - binance.price, binance.price) : null,
  };
}

function alignVenues(venues, maxSkewMs, reference, maxAgeMs) {
  const valid = (Array.isArray(venues) ? venues : []).filter(Boolean);
  const timed = valid.filter((venue) => Number.isFinite(venue.observedAt));
  // API-004: staleness ABSOLUTA contra o relogio da busca, alem do skew mutuo. Sem isso,
  // um conjunto de venues igualmente velhas passaria (skew ~0) com precos antigos.
  const ageLimit = Number.isFinite(maxAgeMs) ? maxAgeMs : null;
  const clock = Number.isFinite(reference) ? reference : null;
  const staleVenues = ageLimit !== null && clock !== null
    ? timed.filter((venue) => clock - venue.observedAt > ageLimit)
    : [];
  const fresh = timed.filter((venue) => !staleVenues.includes(venue));
  if (!fresh.length) return { venues: [], dropped: valid.filter((venue) => !staleVenues.includes(venue)).map((venue) => venue.name), stale: staleVenues.map((venue) => venue.name), skewMs: null };
  const latest = Math.max(...fresh.map((venue) => venue.observedAt));
  const limit = Number.isFinite(maxSkewMs) ? maxSkewMs : 30000;
  const aligned = fresh.filter((venue) => venue.observedAt <= latest + 5000 && latest - venue.observedAt <= limit);
  const observed = aligned.map((venue) => venue.observedAt);
  return {
    venues: aligned,
    dropped: valid.filter((venue) => !aligned.includes(venue) && !staleVenues.includes(venue)).map((venue) => venue.name),
    stale: staleVenues.map((venue) => venue.name),
    skewMs: observed.length > 1 ? Math.max(...observed) - Math.min(...observed) : 0,
  };
}

async function loadMarketMicrostructure(symbol) {
  const base = symbol.slice(0, -4);
  const settled = await Promise.allSettled([
    getJson(`https://data-api.binance.vision/api/v3/ticker/bookTicker?symbol=${encodeURIComponent(symbol)}`),
    getJson(`https://data-api.binance.vision/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&limit=1000`),
    getJson(`https://api.exchange.coinbase.com/products/${encodeURIComponent(base + '-USD')}/ticker`),
    getJson(`https://api.bybit.com/v5/market/tickers?category=spot&symbol=${encodeURIComponent(symbol)}`),
    getJson(`https://www.okx.com/api/v5/market/ticker?instId=${encodeURIComponent(base + '-USDT')}`),
    getJson('https://api.exchange.coinbase.com/products/USDT-USD/ticker'),
  ]);
  const value = (index) => settled[index].status === 'fulfilled' ? settled[index].value : null;
  const errors = {};
  ['binance', 'orderFlow', 'coinbase', 'bybit', 'okx', 'coinbaseFx'].forEach((key, index) => {
    if (settled[index].status === 'rejected') errors[key] = publicErrorMessage(`market-microstructure-${key}`, settled[index].reason);
  });

  const binance = value(0) || {};
  const coinbase = value(2) || {};
  const bybitEnvelope = value(3) || {};
  const bybitOk = !!value(3) && String(bybitEnvelope.retCode) === '0';
  if (value(3) && !bybitOk) errors.bybit = 'Bybit retCode ' + String(bybitEnvelope.retCode);
  const bybit = bybitOk && bybitEnvelope.result && Array.isArray(bybitEnvelope.result.list) ? bybitEnvelope.result.list[0] || {} : {};
  const okxEnvelope = value(4) || {};
  const okxOk = !!value(4) && String(okxEnvelope.code) === '0';
  if (value(4) && !okxOk) errors.okx = 'OKX code ' + String(okxEnvelope.code);
  const okx = okxOk && Array.isArray(okxEnvelope.data) ? okxEnvelope.data[0] || {} : {};
  const coinbaseFx = value(5) || {};
  const fxBid = finite(coinbaseFx.bid);
  const fxAsk = finite(coinbaseFx.ask);
  const usdPerUsdt = fxBid !== null && fxAsk !== null && fxBid > 0 && fxAsk >= fxBid ? (fxBid + fxAsk) / 2 : finite(coinbaseFx.price);
  const validFx = usdPerUsdt !== null && usdPerUsdt >= 0.95 && usdPerUsdt <= 1.05;
  if (value(5) && !validFx) errors.coinbaseFx = 'USDT-USD sem conversao valida';
  const fetchedAt = Date.now();
  const coinbaseTimes = [venueObservedAt(coinbase.time, fetchedAt), venueObservedAt(coinbaseFx.time, fetchedAt)].filter(Number.isFinite);
  const coinbaseObservedAt = coinbaseTimes.length === 2 ? Math.min(...coinbaseTimes) : null;
  const convertUsdToUsdt = (raw) => { const parsed = finite(raw); return parsed === null || !validFx ? null : parsed / usdPerUsdt; };
  const coinbaseVenue = validFx
    ? normalizeVenue('Coinbase', convertUsdToUsdt(coinbase.price), convertUsdToUsdt(coinbase.bid), convertUsdToUsdt(coinbase.ask), coinbaseObservedAt, 'USDT (convertido de USD)')
    : null;
  const venueAlignment = alignVenues([
    // Binance bookTicker nao emite timestamp de provedor; o campo carrega a hora da busca.
    normalizeVenue('Binance', null, binance.bidPrice, binance.askPrice, fetchedAt, 'USDT', 'fetch'),
    coinbaseVenue,
    normalizeVenue('Bybit', bybit.lastPrice, bybit.bid1Price, bybit.ask1Price, venueObservedAt(bybitEnvelope.time, fetchedAt), 'USDT'),
    normalizeVenue('OKX', okx.last, okx.bidPx, okx.askPx, venueObservedAt(okx.ts, fetchedAt), 'USDT'),
  ], 30000, fetchedAt, 60000);
  if (venueAlignment.dropped.length) errors.venueSkew = 'Fora da janela de 30s: ' + venueAlignment.dropped.join(', ');
  if (venueAlignment.stale.length) errors.venuesStale = 'Timestamps mais velhos que 60s: ' + venueAlignment.stale.join(', ');
  const venueSummary = summarizeVenues(venueAlignment.venues);
  const orderFlow = summarizeOrderFlow(value(1), fetchedAt);
  if (orderFlow.numericOverflow) errors.orderFlowNumeric = 'Agregado de aggTrades excedeu o intervalo numerico seguro';
  const venueObservedTimes = venueSummary.venues.map((venue) => venue.observedAt).filter(Number.isFinite);
  const venuesObservedAt = venueObservedTimes.length ? Math.max(...venueObservedTimes) : null;
  const observedTimes = venueObservedTimes.concat([orderFlow.observedAt]).filter(Number.isFinite);
  return {
    symbol,
    ...venueSummary,
    venueSkewMs: venueAlignment.skewMs,
    venuesStale: venueAlignment.stale,
    // API-004: observedAt de topo mistura relogios de provedor com hora de busca (Binance).
    observedAtProvenance: venueSummary.venues.some((venue) => venue.observedAtProvenance === 'fetch') ? 'mixed' : 'provider',
    usdPerUsdt: validFx ? usdPerUsdt : null,
    orderFlow,
    venuesObservedAt,
    observedAt: observedTimes.length ? Math.max(...observedTimes) : null,
    fetchedAt,
    errors,
  };
}

module.exports = async function handler(request, response) {
  if (!await applyApiPolicyAsync(request, response, { cacheControl: 'public, s-maxage=15, stale-while-revalidate=45' })) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const parsedUrl = new URL(request.url || '/', 'http://localhost');
  const symbol = String(parsedUrl.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  if (!ALLOWED_SYMBOLS.has(symbol)) return response.status(400).json({ error: 'Invalid symbol' });
  try {
    const payload = await loadMarketMicrostructure(symbol);
    return response.status(payload.venues.length || payload.orderFlow.trades ? 200 : 503).json(payload);
  } catch (error) {
    return response.status(503).json({ error: publicErrorMessage('market-microstructure', error), symbol, fetchedAt: Date.now() });
  }
};

module.exports.summarizeOrderFlow = summarizeOrderFlow;
module.exports.summarizeVenues = summarizeVenues;
module.exports.alignVenues = alignVenues;
module.exports.normalizeVenue = normalizeVenue;
module.exports.venueObservedAt = venueObservedAt;
