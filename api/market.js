const ASSET_IDS = {
  bitcoin: 'btc-bitcoin',
  ethereum: 'eth-ethereum',
  binancecoin: 'bnb-binance-coin',
  solana: 'sol-solana',
  ripple: 'xrp-xrp',
  dogecoin: 'doge-dogecoin',
  cardano: 'ada-cardano',
  'avalanche-2': 'avax-avalanche',
  chainlink: 'link-chainlink',
  tron: 'trx-tron',
  polkadot: 'dot-polkadot',
  litecoin: 'ltc-litecoin',
  'bitcoin-cash': 'bch-bitcoin-cash',
  uniswap: 'uni-uniswap',
  near: 'near-near-protocol',
  cosmos: 'atom-cosmos',
  filecoin: 'fil-filecoin',
  aave: 'aave-new',
  sui: 'sui-sui',
  'hedera-hashgraph': 'hbar-hedera',
  stellar: 'xlm-stellar',
  'internet-computer': 'icp-internet-computer',
  arbitrum: 'arb-arbitrum',
  optimism: 'op-optimism',
};

let cachedPayload = null;
let cachedAt = 0;

async function getJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)',
    },
    signal: AbortSignal.timeout(18000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function paprikaMarket(row, geckoId) {
  const quote = row && row.quotes && row.quotes.USD || {};
  return {
    id: geckoId,
    symbol: String(row.symbol || '').toLowerCase(),
    name: row.name,
    current_price: +quote.price,
    market_cap: +quote.market_cap,
    market_cap_rank: +row.rank,
    total_volume: +quote.volume_24h,
    price_change_percentage_1h_in_currency: +quote.percent_change_1h,
    price_change_percentage_24h_in_currency: +quote.percent_change_24h,
    price_change_percentage_7d_in_currency: +quote.percent_change_7d,
    price_change_percentage_30d_in_currency: +quote.percent_change_30d,
    ath_change_percentage: +quote.percent_from_price_ath,
    circulating_supply: +row.circulating_supply,
    total_supply: +row.total_supply,
    max_supply: +row.max_supply,
    last_updated: row.last_updated,
  };
}

async function loadPaprikaFallback() {
  const tickers = await getJson('https://api.coinpaprika.com/v1/tickers?quotes=USD');
  const byId = new Map((tickers || []).map((row) => [row.id, row]));
  return Object.entries(ASSET_IDS).map(([geckoId, paprikaId]) => {
    const row = byId.get(paprikaId);
    return row ? paprikaMarket(row, geckoId) : null;
  }).filter(Boolean);
}

async function loadMarketBundle() {
  const ids = Object.keys(ASSET_IDS).join(',');
  const urls = [
    'https://api.coingecko.com/api/v3/global',
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(ids) + '&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d',
    'https://api.coingecko.com/api/v3/search/trending',
  ];
  const settled = await Promise.allSettled(urls.map(getJson));
  const global = settled[0].status === 'fulfilled' ? settled[0].value : null;
  let markets = settled[1].status === 'fulfilled' && Array.isArray(settled[1].value) ? settled[1].value : [];
  const trending = settled[2].status === 'fulfilled' ? settled[2].value : null;
  let source = 'CoinGecko public';
  const errors = {};

  if (!global) errors.global = String(settled[0].reason && settled[0].reason.message || 'indisponivel');
  if (!markets.length) {
    errors.markets = String(settled[1].reason && settled[1].reason.message || 'indisponivel');
    markets = await loadPaprikaFallback();
    source = 'CoinPaprika fallback';
  }
  if (!trending) errors.trending = String(settled[2].reason && settled[2].reason.message || 'indisponivel');

  return { global, markets, trending, source, errors, fetchedAt: Date.now(), stale: false };
}

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  if (cachedPayload && Date.now() - cachedAt < 120000) {
    response.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return response.status(200).json(cachedPayload);
  }

  try {
    cachedPayload = await loadMarketBundle();
    cachedAt = Date.now();
  } catch (error) {
    if (!cachedPayload) return response.status(503).json({ error: String(error && error.message || error) });
    cachedPayload = { ...cachedPayload, stale: true, errors: { ...cachedPayload.errors, refresh: String(error && error.message || error) } };
  }

  response.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
  response.setHeader('Access-Control-Allow-Origin', '*');
  return response.status(200).json(cachedPayload);
};
