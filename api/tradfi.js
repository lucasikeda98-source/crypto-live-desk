const analyticsCore = require('../lib/analytics-core');

const SYMBOLS = [
  { symbol: 'COIN', query: 'coin.us', name: 'Coinbase', group: 'Crypto equity' },
  { symbol: 'MSTR', query: 'mstr.us', name: 'Strategy', group: 'BTC treasury' },
  { symbol: 'MARA', query: 'mara.us', name: 'MARA', group: 'Bitcoin miner' },
  { symbol: 'RIOT', query: 'riot.us', name: 'Riot Platforms', group: 'Bitcoin miner' },
  { symbol: 'HOOD', query: 'hood.us', name: 'Robinhood', group: 'Broker / crypto' },
  { symbol: 'NVDA', query: 'nvda.us', name: 'Nvidia', group: 'Technology' },
  { symbol: 'QQQ', query: 'qqq.us', name: 'Nasdaq 100 ETF', group: 'Risk proxy' },
  { symbol: 'SPY', query: 'spy.us', name: 'S&P 500 ETF', group: 'Global risk' },
  { symbol: 'GLD', query: 'gld.us', name: 'Gold ETF', group: 'Defensive proxy' },
  { symbol: 'TLT', query: 'tlt.us', name: 'Treasury ETF', group: 'Rates proxy' },
];

async function loadSymbol(meta) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.symbol)}?range=3mo&interval=1d`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`${meta.symbol}: HTTP ${response.status}`);
  return analyticsCore.normalizeTradFiChart(await response.json(), meta);
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }
  const results = await Promise.allSettled(SYMBOLS.map(loadSymbol));
  const assets = results.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  const errors = results.flatMap((result, index) => result.status === 'rejected' ? [{ symbol: SYMBOLS[index].symbol, error: String(result.reason && result.reason.message || result.reason) }] : []);
  const bySymbol = Object.fromEntries(assets.map((asset) => [asset.symbol, asset]));
  let score = 0;
  ['QQQ', 'SPY', 'COIN', 'MSTR'].forEach((symbol) => {
    const row = bySymbol[symbol];
    if (row && Number.isFinite(row.change5d)) score += row.change5d > 2 ? 1 : row.change5d < -2 ? -1 : 0;
  });
  response.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
  response.setHeader('Access-Control-Allow-Origin', '*');
  const observedAt = assets.reduce((latest, asset) => Math.max(latest, Number(asset.observedAt) || 0), 0) || null;
  return response.status(assets.length ? 200 : 503).json({ assets, errors, score, source: 'Yahoo Finance public chart', observedAt, fetchedAt: Date.now() });
};
