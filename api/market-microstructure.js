'use strict';

const ALLOWED_SYMBOL = /^[A-Z0-9]{2,15}USDT$/;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function normalizeVenue(name, price, bid, ask, observedAt) {
  const normalizedPrice = finite(price);
  if (normalizedPrice === null || normalizedPrice <= 0) return null;
  return {
    name,
    price: normalizedPrice,
    bid: finite(bid),
    ask: finite(ask),
    observedAt: Number.isFinite(Number(observedAt)) ? Number(observedAt) : null,
  };
}

function summarizeOrderFlow(rows) {
  const trades = Array.isArray(rows) ? rows : [];
  let buyTakerUsd = 0;
  let sellTakerUsd = 0;
  let firstTradeAt = null;
  let lastTradeAt = null;
  let validTrades = 0;
  trades.forEach((trade) => {
    const price = finite(trade && trade.p);
    const quantity = finite(trade && trade.q);
    const timestamp = finite(trade && trade.T);
    if (price === null || quantity === null || price <= 0 || quantity < 0 || timestamp === null) return;
    const quoteUsd = price * quantity;
    // Binance m=true means the buyer was the maker, therefore the aggressive side was a seller.
    if (trade.m === true) sellTakerUsd += quoteUsd;
    else buyTakerUsd += quoteUsd;
    firstTradeAt = firstTradeAt === null ? timestamp : Math.min(firstTradeAt, timestamp);
    lastTradeAt = lastTradeAt === null ? timestamp : Math.max(lastTradeAt, timestamp);
    validTrades += 1;
  });
  const totalUsd = buyTakerUsd + sellTakerUsd;
  return {
    trades: validTrades,
    buyTakerUsd,
    sellTakerUsd,
    cvdUsd: buyTakerUsd - sellTakerUsd,
    imbalancePct: totalUsd > 0 ? ((buyTakerUsd - sellTakerUsd) / totalUsd) * 100 : null,
    firstTradeAt,
    lastTradeAt,
  };
}

function summarizeVenues(venues) {
  const valid = (Array.isArray(venues) ? venues : []).filter(Boolean);
  const prices = valid.map((venue) => venue.price).sort((a, b) => a - b);
  if (!prices.length) return { venues: [], medianPrice: null, dispersionBps: null, coinbasePremiumBps: null };
  const middle = Math.floor(prices.length / 2);
  const medianPrice = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  valid.forEach((venue) => { venue.premiumBps = ((venue.price - medianPrice) / medianPrice) * 10000; });
  const binance = valid.find((venue) => venue.name === 'Binance');
  const coinbase = valid.find((venue) => venue.name === 'Coinbase');
  return {
    venues: valid,
    medianPrice,
    dispersionBps: ((prices.at(-1) - prices[0]) / medianPrice) * 10000,
    coinbasePremiumBps: binance && coinbase ? ((coinbase.price - binance.price) / binance.price) * 10000 : null,
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
  ]);
  const value = (index) => settled[index].status === 'fulfilled' ? settled[index].value : null;
  const errors = {};
  ['binance', 'orderFlow', 'coinbase', 'bybit', 'okx'].forEach((key, index) => {
    if (settled[index].status === 'rejected') errors[key] = String(settled[index].reason && settled[index].reason.message || settled[index].reason);
  });

  const binance = value(0) || {};
  const coinbase = value(2) || {};
  const bybitEnvelope = value(3) || {};
  const bybit = bybitEnvelope.result && Array.isArray(bybitEnvelope.result.list) ? bybitEnvelope.result.list[0] || {} : {};
  const okxEnvelope = value(4) || {};
  const okx = Array.isArray(okxEnvelope.data) ? okxEnvelope.data[0] || {} : {};
  const fetchedAt = Date.now();
  const venueSummary = summarizeVenues([
    normalizeVenue('Binance', binance.bidPrice && binance.askPrice ? (Number(binance.bidPrice) + Number(binance.askPrice)) / 2 : null, binance.bidPrice, binance.askPrice, fetchedAt),
    normalizeVenue('Coinbase', coinbase.price, coinbase.bid, coinbase.ask, Date.parse(coinbase.time)),
    normalizeVenue('Bybit', bybit.lastPrice, bybit.bid1Price, bybit.ask1Price, bybitEnvelope.time),
    normalizeVenue('OKX', okx.last, okx.bidPx, okx.askPx, okx.ts),
  ]);
  const orderFlow = summarizeOrderFlow(value(1));
  const observedTimes = venueSummary.venues.map((venue) => venue.observedAt).concat([orderFlow.lastTradeAt]).filter(Number.isFinite);
  return {
    symbol,
    ...venueSummary,
    orderFlow,
    observedAt: observedTimes.length ? Math.max(...observedTimes) : null,
    fetchedAt,
    errors,
  };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const parsedUrl = new URL(request.url || '/', 'http://localhost');
  const symbol = String(parsedUrl.searchParams.get('symbol') || 'BTCUSDT').toUpperCase();
  if (!ALLOWED_SYMBOL.test(symbol)) return response.status(400).json({ error: 'Invalid symbol' });
  try {
    const payload = await loadMarketMicrostructure(symbol);
    response.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=45');
    response.setHeader('Access-Control-Allow-Origin', '*');
    return response.status(payload.venues.length || payload.orderFlow.trades ? 200 : 503).json(payload);
  } catch (error) {
    return response.status(503).json({ error: String(error && error.message || error), symbol, fetchedAt: Date.now() });
  }
};

module.exports.summarizeOrderFlow = summarizeOrderFlow;
module.exports.summarizeVenues = summarizeVenues;
