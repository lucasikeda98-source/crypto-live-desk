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

function change(latest, prior) {
  return prior && prior.close ? ((latest.close - prior.close) / prior.close) * 100 : null;
}

function parseChart(payload, meta) {
  const chart = payload && payload.chart && payload.chart.result && payload.chart.result[0];
  const timestamps = chart && chart.timestamp || [];
  const quote = chart && chart.indicators && chart.indicators.quote && chart.indicators.quote[0] || {};
  const rows = timestamps.map((timestamp, index) => ({
    date: new Date(timestamp * 1000).toISOString().slice(0, 10),
    open: Number(quote.open && quote.open[index]),
    high: Number(quote.high && quote.high[index]),
    low: Number(quote.low && quote.low[index]),
    close: Number(quote.close && quote.close[index]),
    volume: Number(quote.volume && quote.volume[index]),
  })).filter((row) => row.date && Number.isFinite(row.close));
  const latest = rows.at(-1);
  if (!latest) throw new Error(`Sem cotacao para ${meta.symbol}`);
  return {
    ...meta,
    date: latest.date,
    close: latest.close,
    volume: latest.volume,
    change1d: change(latest, rows.at(-2)),
    change5d: change(latest, rows.at(-6)),
    change20d: change(latest, rows.at(-21)),
  };
}

async function loadSymbol(meta) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(meta.symbol)}?range=3mo&interval=1d`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)' },
    signal: AbortSignal.timeout(9000),
  });
  if (!response.ok) throw new Error(`${meta.symbol}: HTTP ${response.status}`);
  return parseChart(await response.json(), meta);
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
  return response.status(assets.length ? 200 : 503).json({ assets, errors, score, source: 'Yahoo Finance public chart', fetchedAt: Date.now() });
};
