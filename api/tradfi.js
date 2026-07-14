const analyticsCore = require('../lib/analytics-core');
const { applyApiPolicyAsync } = require('../lib/api-guard');

const SYMBOLS = [
  { symbol: 'COIN', name: 'Coinbase', group: 'Crypto equity' },
  { symbol: 'MSTR', name: 'Strategy', group: 'BTC treasury' },
  { symbol: 'MARA', name: 'MARA', group: 'Bitcoin miner' },
  { symbol: 'RIOT', name: 'Riot Platforms', group: 'Bitcoin miner' },
  { symbol: 'HOOD', name: 'Robinhood', group: 'Broker / crypto' },
  { symbol: 'NVDA', name: 'Nvidia', group: 'Technology' },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', group: 'Risk proxy' },
  { symbol: 'SPY', name: 'S&P 500 ETF', group: 'Global risk' },
  { symbol: 'GLD', name: 'Gold ETF', group: 'Defensive proxy' },
  { symbol: 'TLT', name: 'Treasury ETF', group: 'Rates proxy' },
];
const MACRO_SCORE_SYMBOLS = ['QQQ', 'SPY', 'NVDA'];

function scoreMacroAssets(assets) {
  const bySymbol = Object.fromEntries((Array.isArray(assets) ? assets : []).map((asset) => [asset.symbol, asset]));
  return MACRO_SCORE_SYMBOLS.reduce((score, symbol) => {
    const row = bySymbol[symbol];
    return score + (row && Number.isFinite(row.change5d) ? (row.change5d > 2 ? 1 : row.change5d < -2 ? -1 : 0) : 0);
  }, 0);
}

async function loadSymbol(meta) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.symbol)}?range=3mo&interval=1d`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`${meta.symbol}: HTTP ${response.status}`);
  const payload = await response.json();
  const asset = analyticsCore.normalizeTradFiChart(payload, meta);
  asset.series = analyticsCore.normalizeTradFiRows(payload).slice(-60).map((row) => ({ date: row.date, close: row.close }));
  return asset;
}

module.exports = async function handler(request, response) {
  if (!await applyApiPolicyAsync(request, response, { cacheControl: 'public, s-maxage=900, stale-while-revalidate=3600' })) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const results = await Promise.allSettled(SYMBOLS.map(loadSymbol));
  const assets = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  const errors = results.flatMap((result, index) => result.status === 'rejected' ? [{ symbol: SYMBOLS[index].symbol, error: String(result.reason && result.reason.message || result.reason) }] : []);
  const score = scoreMacroAssets(assets);
  const observedAt = assets.reduce((latest, asset) => {
    const parsed = analyticsCore.toFiniteNumber(asset && asset.observedAt);
    return parsed === null ? latest : Math.max(latest, parsed);
  }, 0) || null;
  return response.status(assets.length ? 200 : 503).json({ assets, errors, score, source: 'Yahoo Finance public chart', observedAt, fetchedAt: Date.now() });
};
module.exports.scoreMacroAssets = scoreMacroAssets;
