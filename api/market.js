const { toFiniteNumber, toTimestampMs } = require('../lib/analytics-core');
const { applyApiPolicyAsync } = require('../lib/api-guard');

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
let refreshPromise = null;
let retryAfterAt = 0;
const RETRY_BACKOFF_MS = 15_000;

function remainingTimeout(deadline, cap) {
  return Math.max(1, Math.min(cap || 18000, deadline - Date.now()));
}

async function getJson(url, deadline) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'CryptoLiveDesk/1.0 (+https://crypto-live-desk.vercel.app)',
    },
    signal: AbortSignal.timeout(remainingTimeout(deadline)),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function providerObservedAt(value, asOf = Date.now()) {
  const parsed = toTimestampMs(value);
  return parsed !== null && parsed >= 0 && parsed <= asOf + 60_000 ? parsed : null;
}

function paprikaMarket(row, geckoId) {
  const quote = row && row.quotes && row.quotes.USD || {};
  return {
    id: geckoId,
    symbol: String(row.symbol || '').toLowerCase(),
    name: row.name,
    current_price: toFiniteNumber(quote.price),
    market_cap: toFiniteNumber(quote.market_cap),
    market_cap_rank: toFiniteNumber(row.rank),
    total_volume: toFiniteNumber(quote.volume_24h),
    price_change_percentage_1h_in_currency: toFiniteNumber(quote.percent_change_1h),
    price_change_percentage_24h_in_currency: toFiniteNumber(quote.percent_change_24h),
    price_change_percentage_7d_in_currency: toFiniteNumber(quote.percent_change_7d),
    price_change_percentage_30d_in_currency: toFiniteNumber(quote.percent_change_30d),
    ath_change_percentage: toFiniteNumber(quote.percent_from_price_ath),
    circulating_supply: toFiniteNumber(row.circulating_supply),
    total_supply: toFiniteNumber(row.total_supply),
    max_supply: toFiniteNumber(row.max_supply),
    last_updated: row.last_updated,
    observedAt: providerObservedAt(row.last_updated),
  };
}

function normalizeCoinGeckoMarkets(rows, asOf = Date.now()) {
  const known = new Set(Object.keys(ASSET_IDS));
  const byId = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || typeof row !== 'object' || !known.has(row.id) || byId.has(row.id)) return;
    byId.set(row.id, { ...row, observedAt: providerObservedAt(row.last_updated, asOf) });
  });
  return Array.from(byId.values());
}

async function loadPaprikaFallback(deadline, requestedIds) {
  const tickers = await getJson('https://api.coinpaprika.com/v1/tickers?quotes=USD', deadline);
  const byId = new Map((tickers || []).map((row) => [row.id, row]));
  const wanted = requestedIds ? new Set(requestedIds) : null;
  return Object.entries(ASSET_IDS).filter(([geckoId]) => !wanted || wanted.has(geckoId)).map(([geckoId, paprikaId]) => {
    const row = byId.get(paprikaId);
    return row ? paprikaMarket(row, geckoId) : null;
  }).filter(Boolean);
}

async function loadMarketBundle(deadline) {
  const ids = Object.keys(ASSET_IDS).join(',');
  const urls = [
    'https://api.coingecko.com/api/v3/global',
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + encodeURIComponent(ids) + '&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d',
    'https://api.coingecko.com/api/v3/search/trending',
  ];
  const settled = await Promise.allSettled(urls.map((url) => getJson(url, deadline)));
  const rawGlobal = settled[0].status === 'fulfilled' ? settled[0].value : null;
  const global = rawGlobal && typeof rawGlobal === 'object' && rawGlobal.data && typeof rawGlobal.data === 'object' ? rawGlobal : null;
  let markets = settled[1].status === 'fulfilled' ? normalizeCoinGeckoMarkets(settled[1].value) : [];
  const rawTrending = settled[2].status === 'fulfilled' ? settled[2].value : null;
  const trending = rawTrending && typeof rawTrending === 'object' && Array.isArray(rawTrending.coins) ? rawTrending : null;
  let source = 'CoinGecko public';
  const errors = {};

  if (!global) errors.global = String(settled[0].reason && settled[0].reason.message || 'indisponivel');
  const coveredIds = new Set(markets.map((row) => row && row.id).filter(Boolean));
  const missingIds = Object.keys(ASSET_IDS).filter((id) => !coveredIds.has(id));
  if (missingIds.length) {
    errors.markets = markets.length
      ? `CoinGecko cobriu ${markets.length}/${Object.keys(ASSET_IDS).length}; faltando ${missingIds.join(',')}`
      : String(settled[1].reason && settled[1].reason.message || 'indisponivel');
    try {
      const fallbackRows = await loadPaprikaFallback(deadline, missingIds);
      markets = markets.concat(fallbackRows);
      source = coveredIds.size ? 'CoinGecko public + CoinPaprika gap fill' : 'CoinPaprika fallback';
      const filledIds = new Set(markets.map((row) => row && row.id).filter(Boolean));
      const stillMissing = Object.keys(ASSET_IDS).filter((id) => !filledIds.has(id));
      if (!stillMissing.length) delete errors.markets;
      else errors.markets = `Cobertura parcial ${markets.length}/${Object.keys(ASSET_IDS).length}; faltando ${stillMissing.join(',')}`;
    } catch (fallbackError) {
      errors.marketsFallback = String(fallbackError && fallbackError.message || fallbackError);
    }
  }
  if (!trending) errors.trending = String(settled[2].reason && settled[2].reason.message || 'indisponivel');

  if (!global && !markets.length && !trending) throw new Error('Todas as fontes de mercado falharam: ' + Object.values(errors).join(' | '));

  const acquiredAt = Date.now();
  const providerTimes = markets.map((row) => row.observedAt).filter(Number.isFinite);
  const globalObservedAt = providerObservedAt(global && global.data && global.data.updated_at, acquiredAt);
  if (globalObservedAt !== null) providerTimes.push(globalObservedAt);
  const observedAt = providerTimes.length ? Math.max(...providerTimes) : null;
  if (observedAt === null) errors.observedAt = 'Fontes de mercado sem timestamp de observacao valido';
  return { global, markets, trending, source, errors, completeness: markets.length / Object.keys(ASSET_IDS).length, observedAt, observedAtProvenance: observedAt === null ? 'missing' : 'provider-timestamp', fetchedAt: acquiredAt, stale: false };
}

function refreshMarketBundle() {
  if (!refreshPromise) {
    refreshPromise = loadMarketBundle(Date.now() + 28000).then((payload) => {
      cachedPayload = payload;
      cachedAt = Date.now();
      retryAfterAt = 0;
      return payload;
    }).finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

module.exports = async function handler(request, response) {
  if (!await applyApiPolicyAsync(request, response, { cacheControl: 'public, s-maxage=120, stale-while-revalidate=600' })) return;
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  if (cachedPayload && (Date.now() - cachedAt < 120000 || Date.now() < retryAfterAt)) {
    return response.status(200).json(cachedPayload);
  }

  try {
    await refreshMarketBundle();
  } catch (error) {
    if (!cachedPayload) return response.status(503).json({ error: String(error && error.message || error) });
    retryAfterAt = Date.now() + RETRY_BACKOFF_MS;
    cachedPayload = { ...cachedPayload, stale: true, errors: { ...cachedPayload.errors, refresh: String(error && error.message || error) } };
  }

  return response.status(200).json(cachedPayload);
};

module.exports.remainingTimeout = remainingTimeout;
module.exports.loadMarketBundle = loadMarketBundle;
module.exports.normalizeCoinGeckoMarkets = normalizeCoinGeckoMarkets;
